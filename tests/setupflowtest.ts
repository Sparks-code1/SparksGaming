// The synchronized setup: dice, factions, weaknesses, abilities, territories.
//
// Online setup ran only on the host's machine — every other player stared at a
// frozen lobby while their die was rolled and their faction picked for them.
// This suite pins the shared state machine both roles now render from: what a
// roll may do, whose pick is current, and every way a stale or forged
// declaration must bounce off.
import {
  initialSetup, acceptRoll, applyPick, ingestChoices, expectedActor,
  awaitedRolls, type SetupCtx, type SetupDoc,
} from '@/lib/setupFlow'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

const FACTIONS = ['bear', 'balkania', 'khan', 'sahara', 'mechaniker']
const ctx = (over: Partial<SetupCtx> = {}): SetupCtx => ({
  players: ['p1', 'p2', 'p3'],
  existingAbilities: {},
  availableFactions: FACTIONS,
  abilityOptionIds: () => ['a', 'b'],
  needsWeakness: () => false,
  ...over,
})

// ─── 1. Dice ──────────────────────────────────────────────────────────────
console.log('--- rolling for first ---')
{
  const c = ctx()
  let d = initialSetup(c.players)
  check('setup opens on the dice', [d.phase, d.round], ['dice', 1])
  check('everyone is awaited', awaitedRolls(d, c), ['p1', 'p2', 'p3'])
  check('no actor during dice — the phase waits on all of them', expectedActor(d), null)

  d = acceptRoll(d, c, 'p1', 5, 1)
  check('a roll lands', d.rolls, { p1: 5 })
  check('the same player cannot roll twice', acceptRoll(d, c, 'p1', 6, 1).rolls, { p1: 5 })
  check('a stale round is refused', acceptRoll(d, c, 'p2', 6, 99).rolls, { p1: 5 })
  check('a forged die face is refused', acceptRoll(d, c, 'p2', 9, 1).rolls, { p1: 5 })
  check('a stranger cannot roll', acceptRoll(d, c, 'zz', 4, 1).rolls, { p1: 5 })

  d = acceptRoll(d, c, 'p2', 3, 1)
  d = acceptRoll(d, c, 'p3', 4, 1)
  check('all rolls in settles the order, highest first', d.order, ['p1', 'p3', 'p2'])
  check('and opens the faction phase', [d.phase, d.turnIdx], ['faction', 0])
}

// ─── 2. Top ties reroll; lower ties keep seat order ───────────────────────
console.log('\n--- ties ---')
{
  const c = ctx()
  let d = initialSetup(c.players)
  d = acceptRoll(d, c, 'p1', 6, 1)
  d = acceptRoll(d, c, 'p2', 6, 1)
  d = acceptRoll(d, c, 'p3', 2, 1)
  check('a top tie bumps the round', [d.phase, d.round], ['dice', 2])
  check('only the tied players reroll', awaitedRolls(d, c), ['p1', 'p2'])
  check('the bystander keeps their roll', d.rolls, { p3: 2 })
  check('a roll cast for round 1 no longer counts', acceptRoll(d, c, 'p1', 6, 1).rolls, { p3: 2 })

  d = acceptRoll(d, c, 'p1', 1, 2)
  d = acceptRoll(d, c, 'p2', 4, 2)
  check('the reroll settles it', d.order, ['p2', 'p3', 'p1'])

  // A tie below the top is NOT rerolled — seat order breaks it, as hotseat does.
  let e = initialSetup(c.players)
  e = acceptRoll(e, c, 'p1', 3, 1)
  e = acceptRoll(e, c, 'p2', 6, 1)
  e = acceptRoll(e, c, 'p3', 3, 1)
  check('a lower tie keeps seat order', e.order, ['p2', 'p1', 'p3'])
}

/** A settled doc: order p1, p2, p3, faction phase open. */
function settled(c: SetupCtx): SetupDoc {
  let d = initialSetup(c.players)
  d = acceptRoll(d, c, 'p1', 6, 1)
  d = acceptRoll(d, c, 'p2', 4, 1)
  d = acceptRoll(d, c, 'p3', 2, 1)
  return d
}

// ─── 3. Factions, in turn order only ──────────────────────────────────────
console.log('\n--- picking factions ---')
{
  const c = ctx()
  let d = settled(c)
  check('the first roller picks first', expectedActor(d), 'p1')
  check('nobody else may pick', applyPick(d, c, 'p2', 'khan'), d)

  d = applyPick(d, c, 'p1', 'bear')
  check('the pick lands and the turn moves on',
    [d.factions.p1, expectedActor(d)], ['bear', 'p2'])
  check('a taken faction is refused', applyPick(d, c, 'p2', 'bear'), d)
  check('an unknown faction is refused', applyPick(d, c, 'p2', 'atlantis'), d)

  d = applyPick(d, c, 'p2', 'khan')
  d = applyPick(d, c, 'p3', 'sahara')
  check('all factions picked → ability phase for the first in order',
    [d.phase, expectedActor(d)], ['ability', 'p1'])
}

// ─── 4. Weakness interrupts, ability skips ────────────────────────────────
console.log('\n--- weaknesses and abilities ---')
{
  const c = ctx({ needsWeakness: f => f === 'khan' })
  let d = settled(c)
  d = applyPick(d, c, 'p1', 'khan')
  check('a weakness faction pauses on its picker',
    [d.phase, expectedActor(d)], ['weakness', 'p1'])
  d = applyPick(d, c, 'p1', 'weak-1')
  check('the weakness lands against the FACTION', d.weaknesses, { khan: 'weak-1' })
  check('then the next player picks a faction', [d.phase, expectedActor(d)], ['faction', 'p2'])
  d = applyPick(d, c, 'p2', 'bear')
  d = applyPick(d, c, 'p3', 'sahara')
  d = applyPick(d, c, 'p1', 'a')     // ability for khan
  check('a taken weakness cannot be picked twice: fresh doc check',
    Object.values(d.weaknesses), ['weak-1'])

  // Abilities already locked in a previous game are skipped entirely.
  const c2 = ctx({ existingAbilities: { bear: 'old-a' } })
  let e = settled(c2)
  e = applyPick(e, c2, 'p1', 'bear')
  e = applyPick(e, c2, 'p2', 'khan')
  e = applyPick(e, c2, 'p3', 'sahara')
  check('locked factions do not re-choose — p2 (khan) is first to owe one',
    [e.phase, expectedActor(e)], ['ability', 'p2'])
  e = applyPick(e, c2, 'p2', 'a')
  check('then p3', expectedActor(e), 'p3')
  e = applyPick(e, c2, 'p3', 'b')
  check('all abilities settled → territory phase, back to turn order',
    [e.phase, expectedActor(e)], ['territory', 'p1'])

  // Nobody owes an ability at all → straight to territory.
  const c3 = ctx({ existingAbilities: { bear: 'x', khan: 'y', sahara: 'z' } })
  let f = settled(c3)
  f = applyPick(f, c3, 'p1', 'bear')
  f = applyPick(f, c3, 'p2', 'khan')
  f = applyPick(f, c3, 'p3', 'sahara')
  check('every ability pre-locked skips the phase', f.phase, 'territory')
  check('an ability not among the options is refused',
    applyPick(settledAbility(), ctx(), 'p1', 'zzz').abilities, {})
}
function settledAbility(): SetupDoc {
  const c = ctx()
  let d = settled(c)
  d = applyPick(d, c, 'p1', 'bear')
  d = applyPick(d, c, 'p2', 'khan')
  d = applyPick(d, c, 'p3', 'sahara')
  return d
}

// ─── 5. Territories, then done ────────────────────────────────────────────
console.log('\n--- placing HQs ---')
{
  const c = ctx({ existingAbilities: { bear: 'x', khan: 'y', sahara: 'z' } })
  let d = settled(c)
  d = applyPick(d, c, 'p1', 'bear')
  d = applyPick(d, c, 'p2', 'khan')
  d = applyPick(d, c, 'p3', 'sahara')
  d = applyPick(d, c, 'p1', 'alaska')
  check('first HQ placed', [d.territories.p1, expectedActor(d)], ['alaska', 'p2'])
  check('a taken territory is refused', applyPick(d, c, 'p2', 'alaska'), d)
  d = applyPick(d, c, 'p2', 'peru')
  d = applyPick(d, c, 'p3', 'siam')
  check('the last HQ finishes setup', d.phase, 'done')
  check('everything a board needs is in the document', {
    order: d.order, factions: d.factions, territories: d.territories,
  }, {
    order: ['p1', 'p2', 'p3'],
    factions: { p1: 'bear', p2: 'khan', p3: 'sahara' },
    territories: { p1: 'alaska', p2: 'peru', p3: 'siam' },
  })
}

// ─── 6. The host's ingest: choices off the wire ───────────────────────────
console.log('\n--- ingesting declared choices ---')
{
  const c = ctx({ existingAbilities: { bear: 'x', khan: 'y', sahara: 'z' } })
  let d = initialSetup(c.players)
  // Everyone's rolls arrive in one refresh, out of order.
  d = ingestChoices(d, c, {
    p3: { kind: 'roll', roll: 2, round: 1 },
    p1: { kind: 'roll', roll: 6, round: 1 },
    p2: { kind: 'roll', roll: 4, round: 1 },
  })
  check('one ingest settles the dice', [d.phase, d.order], ['faction', ['p1', 'p2', 'p3']])

  // The actor's pick with the right key lands; another player's pick does not.
  d = ingestChoices(d, c, {
    p1: { kind: 'pick', value: 'bear', turnKey: 'faction:0' },
    p2: { kind: 'pick', value: 'khan', turnKey: 'faction:0' },   // not p2's turn key... same key, wrong actor
  })
  check('only the current actor lands', [d.factions.p1, d.factions.p2], ['bear', undefined])

  // A pick addressed to a stale turn is dead.
  const stale = ingestChoices(d, c, { p2: { kind: 'pick', value: 'khan', turnKey: 'faction:0' } })
  check('a stale turn key is ignored', stale.factions.p2, undefined)

  // Chained: p2's and p3's picks are both waiting; one ingest applies both,
  // because p2 landing makes p3 current.
  d = ingestChoices(d, c, {
    p2: { kind: 'pick', value: 'khan', turnKey: 'faction:1' },
    p3: { kind: 'pick', value: 'sahara', turnKey: 'faction:2' },
  })
  check('queued picks chain in one ingest',
    [d.factions.p2, d.factions.p3, d.phase], ['khan', 'sahara', 'territory'])
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
