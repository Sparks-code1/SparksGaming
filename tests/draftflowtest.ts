// The DRAFT, as a shared document.
//
// A campaign with draft order unlocked could not run its setup online at all:
// App routed it to the hotseat dice-roll and draft board, so the host rolled
// every player's die and claimed every player's faction, troops, coins and
// turn slot, while the other machines sat in the lobby's ready screen until
// the board appeared. This is the same draft, expressed as the document both
// machines render and neither owns.
//
// The rules pinned here are the hotseat board's rules: one claim per turn from
// any list you still owe, going round in DICE order, a faction that owes a
// weakness stopping on the player who took it, and — when the last claim lands
// — the drafted positions becoming the turn order that territories are taken
// in.
import {
  initialSetup, acceptRoll, applyPick, ingestChoices, expectedActor, turnKey,
  draftPickCount, draftClaimant, draftedOrder, draftListOpen,
  DRAFT_TROOP_SLOTS, DRAFT_COIN_SLOTS,
  type SetupCtx, type SetupDoc,
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
  draft: true,
  ...over,
})

/** Roll the dice out to a settled order, highest first. */
function rolled(c: SetupCtx, rolls: Record<string, number>): SetupDoc {
  let d = initialSetup(c.players)
  for (const [pid, r] of Object.entries(rolls)) d = acceptRoll(d, c, pid, r, d.round)
  return d
}

// ─── 1. The dice open the draft, not the faction phase ──────────────────────
console.log('--- a drafting campaign goes to the board ---')
{
  const c = ctx()
  const d = rolled(c, { p1: 6, p2: 4, p3: 2 })
  check('the draft opens', d.phase, 'draft')
  check('in dice order, highest first', d.order, ['p1', 'p2', 'p3'])
  check('the top roll claims first', expectedActor(d), 'p1')

  // And a campaign WITHOUT the unlock is untouched by any of this.
  const plain = rolled(ctx({ draft: false }), { p1: 6, p2: 4, p3: 2 })
  check('an ordinary campaign still opens on factions', plain.phase, 'faction')
}

// ─── 2. One claim per turn, from any list you still owe ─────────────────────
console.log('--- claiming ---')
{
  const c = ctx()
  let d = rolled(c, { p1: 6, p2: 4, p3: 2 })

  d = applyPick(d, c, 'p1', 'troops:0')
  check('a claim lands', (d.troops ?? {}).p1, 0)
  check('and the turn passes on — one item per turn', expectedActor(d), 'p2')
  check('p1 has one of their four', draftPickCount(d, 'p1'), 1)

  // Anyone may open with any list — the draft is not four rounds of one list.
  d = applyPick(d, c, 'p2', 'faction:khan')
  check('p2 opens with a faction instead', d.factions.p2, 'khan')
  check('the turn passes again', expectedActor(d), 'p3')

  d = applyPick(d, c, 'p3', 'order:1')
  check('p3 takes first turn position', (d.orderSlots ?? {}).p3, 1)
  check('and it comes back round to p1', expectedActor(d), 'p1')
}

// ─── 3. Everything a claim must bounce off ──────────────────────────────────
console.log('--- refusals ---')
{
  const c = ctx()
  let d = rolled(c, { p1: 6, p2: 4, p3: 2 })
  d = applyPick(d, c, 'p1', 'troops:0')
  d = applyPick(d, c, 'p2', 'faction:khan')

  check('a player out of turn is ignored', applyPick(d, c, 'p1', 'coins:0'), d)
  check('a taken faction is refused', applyPick(d, c, 'p3', 'faction:khan'), d)
  check('an unavailable faction is refused', applyPick(d, c, 'p3', 'faction:aliens'), d)
  check('a taken troop slot is refused', applyPick(d, c, 'p3', 'troops:0'), d)
  check('a slot past the end is refused', applyPick(d, c, 'p3', 'troops:3'), d)
  check('turn position 0 does not exist — positions are 1-based',
    applyPick(d, c, 'p3', 'order:0'), d)
  check('turn position past the table is refused', applyPick(d, c, 'p3', 'order:4'), d)
  check('a list that is not a list is refused', applyPick(d, c, 'p3', 'wheat:1'), d)
  check('a claim with no list is refused', applyPick(d, c, 'p3', 'khan'), d)
  check('a non-numeric slot is refused', applyPick(d, c, 'p3', 'coins:soon'), d)

  // The rule that makes it a draft rather than a shopping trip: one item from
  // each list, no more. Checked on EVERY list — each is its own branch, and a
  // hole in any one of them lets a player take two.
  const fresh = rolled(c, { p1: 6, p2: 4, p3: 2 })      // p1 to claim
  const holding = (over: Partial<typeof fresh>) => ({ ...fresh, ...over })

  const hasFaction = holding({ factions: { p1: 'khan' } })
  check('a second FACTION is refused', applyPick(hasFaction, c, 'p1', 'faction:bear'), hasFaction)
  const hasTroops = holding({ troops: { p1: 0 } })
  check('a second TROOP slot is refused', applyPick(hasTroops, c, 'p1', 'troops:1'), hasTroops)
  const hasCoins = holding({ coins: { p1: 0 } })
  check('a second COIN slot is refused', applyPick(hasCoins, c, 'p1', 'coins:1'), hasCoins)
  const hasOrder = holding({ orderSlots: { p1: 1 } })
  check('a second TURN POSITION is refused', applyPick(hasOrder, c, 'p1', 'order:2'), hasOrder)

  check('a list is closed once you hold one', draftListOpen(hasCoins, 'p1', 'coins'), false)
  check('a list you still owe stays open', draftListOpen(hasCoins, 'p1', 'order'), true)
}

// ─── 4. A faction that owes a weakness stops on its taker ───────────────────
console.log('--- the weakness interruption ---')
{
  const c = ctx({ needsWeakness: (f: string) => f === 'aliens', availableFactions: [...FACTIONS, 'aliens'] })
  let d = rolled(c, { p1: 6, p2: 4, p3: 2 })

  d = applyPick(d, c, 'p1', 'faction:aliens')
  check('the draft stops for the weakness', d.phase, 'weakness')
  check('and stops on the player who took it', expectedActor(d), 'p1')
  check('nobody else can answer it', applyPick(d, c, 'p2', 'w-slow'), d)

  d = applyPick(d, c, 'p1', 'w-slow')
  check('the weakness is recorded against the faction', d.weaknesses.aliens, 'w-slow')
  check('the draft resumes — with the NEXT picker, not the faction phase',
    [d.phase, expectedActor(d)], ['draft', 'p2'])
  check('the interrupted claim still counted', draftPickCount(d, 'p1'), 1)
}

// ─── 5. A full draft, and what it settles ───────────────────────────────────
console.log('--- the whole board ---')
{
  const c = ctx()
  let d = rolled(c, { p1: 6, p2: 4, p3: 2 })
  // p1 drafts the best troops but takes last turn for it; p3 takes first.
  const script: Array<[string, string]> = [
    ['p1', 'troops:0'], ['p2', 'faction:khan'], ['p3', 'order:1'],
    ['p1', 'faction:bear'], ['p2', 'troops:1'], ['p3', 'faction:sahara'],
    ['p1', 'coins:0'], ['p2', 'order:2'], ['p3', 'troops:2'],
    ['p1', 'order:3'], ['p2', 'coins:1'], ['p3', 'coins:2'],
  ]
  for (const [pid, value] of script) {
    check(`${pid} claims ${value}`, expectedActor(d), pid)
    const before = d
    d = applyPick(d, c, pid, value)
    check(`  …and it lands`, d !== before, true)
  }

  check('the draft is over', d.phase, 'territory')
  check('the drafted positions ARE the turn order', d.order, ['p3', 'p2', 'p1'])
  check('and territories are taken in it', expectedActor(d), 'p3')
  check('every player drafted four items',
    c.players.map(p => draftPickCount(d, p)), [4, 4, 4])

  // What the board is actually built from.
  check('troop slots for three players', DRAFT_TROOP_SLOTS(3), [10, 8, 8])
  check('coin slots for three players', DRAFT_COIN_SLOTS(3), [2, 1, 1])
  check('four players', DRAFT_TROOP_SLOTS(4), [10, 8, 8, 6])
  check('five players', DRAFT_TROOP_SLOTS(5), [10, 10, 8, 8, 6])
  check('p1 bought the best troops with the last turn',
    DRAFT_TROOP_SLOTS(3)[(d.troops ?? {}).p1], 10)
  check('and the first coin card', DRAFT_COIN_SLOTS(3)[(d.coins ?? {}).p1], 2)
  check('a claimed item knows who took it', draftClaimant(d, 'faction', 'khan'), 'p2')
  check('an unclaimed one has nobody', draftClaimant(d, 'faction', 'mechaniker'), null)

  // Territories then run to the end, in drafted order.
  d = applyPick(d, c, 'p3', 'brazil')
  d = applyPick(d, c, 'p2', 'peru')
  d = applyPick(d, c, 'p1', 'ontario')
  check('setup is done', d.phase, 'done')
  check('nobody is awaited', expectedActor(d), null)
}

// ─── 6. Declarations arriving over the network ──────────────────────────────
// The joiner stamps a pick with the turn it addresses; the host ingests. In
// the draft the picker CYCLES, so "draft:2" comes round again every rotation —
// a pick that was too slow must not land a full turn later against a board the
// player is no longer looking at.
console.log('--- stale claims ---')
{
  const c = ctx()
  let d = rolled(c, { p1: 6, p2: 4, p3: 2 })
  const p1Key = turnKey(d)

  d = ingestChoices(d, c, { p1: { kind: 'pick', value: 'troops:0', turnKey: p1Key } })
  check('a stamped claim lands', (d.troops ?? {}).p1, 0)

  // p1's key from their FIRST turn, replayed when the rotation returns to them.
  d = ingestChoices(d, c, { p2: { kind: 'pick', value: 'faction:khan', turnKey: turnKey(d) } })
  d = ingestChoices(d, c, { p3: { kind: 'pick', value: 'order:1', turnKey: turnKey(d) } })
  check('the rotation is back on p1', expectedActor(d), 'p1')
  check('the key has moved on even though the picker index has not',
    turnKey(d) !== p1Key, true)

  const before = d
  d = ingestChoices(d, c, { p1: { kind: 'pick', value: 'coins:0', turnKey: p1Key } })
  check('a claim stamped for the previous rotation is refused', d, before)

  d = ingestChoices(d, c, { p1: { kind: 'pick', value: 'coins:0', turnKey: turnKey(d) } })
  check('the current one lands', (d.coins ?? {}).p1, 0)
}

// ─── 7. An abandoned draft still yields an order ────────────────────────────
// draftedOrder is what the screen shows while the board fills in, so it has to
// answer before every position is claimed.
console.log('--- a half-finished board ---')
{
  const c = ctx()
  let d = rolled(c, { p1: 6, p2: 4, p3: 2 })
  check('with nothing claimed it is the dice order', draftedOrder(d), ['p1', 'p2', 'p3'])
  // Unclaimed sorts LAST, exactly as the hotseat board's `?? 99` does: until
  // someone takes a position they are behind everyone who has. So this preview
  // reads "p1 has a position, the others do not yet" — it is only a final
  // answer once every position is claimed, which is when the phase ends.
  d = applyPick(d, c, 'p1', 'order:3')
  check('a player holding a position precedes players holding none',
    draftedOrder(d), ['p1', 'p2', 'p3'])
  d = applyPick(d, c, 'p2', 'order:1')
  check('and among claimants, position decides', draftedOrder(d).slice(0, 2), ['p2', 'p1'])
}

console.log(pass ? '\nALL PASS' : '\nFAILURES')
if (!pass) process.exit(1)
