// Bounding a client-rolled combat result to what the board could allow.
//
// The interim trust model: online combat is still rolled on the actor's
// machine, and the server applies the claimed result only after forcing it
// through clampCombatResolution against ITS OWN board. These are the bounds
// that make that acceptable — above all that a capture cannot be conjured
// while defenders still stand, because `captured: true` is the single most
// valuable flag to forge.
import { clampCombatResolution } from '@/lib/gameReducer'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

/** A board with 10 attackers on src and 4 defenders on tgt. */
const board = (srcTroops = 10, tgtTroops = 4) => ({
  territories: {
    src: { troops: srcTroops },
    tgt: { troops: tgtTroops },
  },
}) as never

const claim = (over: Record<string, unknown> = {}) => ({
  srcId: 'src', tgtId: 'tgt',
  totalAtkLoss: 2, totalDefLoss: 4, captured: true, troopsToAdvance: 3,
  entryCostTotal: 0, defenderCloningBonus: 0,
  ...over,
}) as never

console.log('--- an honest result passes through ---')
{
  const r = clampCombatResolution(board(), claim())
  check('losses kept', [r.totalAtkLoss, r.totalDefLoss], [2, 4])
  check('the capture stands — every defender died', r.captured, true)
  check('the advance stands', r.troopsToAdvance, 3)
}

console.log('\n--- the forgeries ---')
{
  // The big one: "captured" with defenders still standing.
  const fake = clampCombatResolution(board(10, 4), claim({ totalDefLoss: 2, captured: true }))
  check('a capture with survivors is recomputed to false', fake.captured, false)
  check('and its advance is zeroed', fake.troopsToAdvance, 0)

  const overkill = clampCombatResolution(board(10, 4), claim({ totalDefLoss: 99 }))
  check('defender losses cannot exceed defenders present', overkill.totalDefLoss, 4)
  check('clamped-to-all-dead still counts as a capture', overkill.captured, true)

  const suicide = clampCombatResolution(board(10, 4), claim({ totalAtkLoss: 99 }))
  check('attacker losses cannot exceed troops-minus-one', suicide.totalAtkLoss, 9)

  const teleport = clampCombatResolution(board(10, 4), claim({ totalAtkLoss: 6, troopsToAdvance: 99 }))
  check('the advance is capped at survivors minus the stay-behind',
    teleport.troopsToAdvance, 3)   // 10 - 6 = 4 survive, 1 stays

  const negative = clampCombatResolution(board(), claim({ entryCostTotal: -5, defenderCloningBonus: -3 }))
  check('negative costs and bonuses become zero',
    [negative.entryCostTotal, negative.defenderCloningBonus], [0, 0])

  const garbage = clampCombatResolution(board(), claim({ totalAtkLoss: NaN, totalDefLoss: 'yes', troopsToAdvance: Infinity }))
  check('garbage numbers collapse to the floor, not to a crash',
    [garbage.totalAtkLoss, garbage.totalDefLoss, garbage.captured], [0, 0, false])

  // viaSea only feeds mission bookkeeping, but it is still untrusted input:
  // whatever JSON arrives must leave as a plain boolean.
  const sea = clampCombatResolution(board(), claim({ viaSea: 'yes' }))
  check('a truthy viaSea collapses to boolean true', sea.viaSea, true)
  const noSea = clampCombatResolution(board(), claim())
  check('an absent viaSea collapses to boolean false', noSea.viaSea, false)

  // The ghost-territory mint: every defender dead but captured false left a
  // 0-troop territory that still had an owner and an HQ marker. A defender
  // who was not captured keeps a last troop.
  const ghost = clampCombatResolution(board(10, 4), claim({ totalDefLoss: 4, captured: false }))
  check('an uncaptured defender keeps a last troop', ghost.totalDefLoss, 3)
  check('and the non-capture stands', ghost.captured, false)
  const ghostOverkill = clampCombatResolution(board(10, 4), claim({ totalDefLoss: 99, captured: false }))
  check('overkill without a capture spares one too', ghostOverkill.totalDefLoss, 3)
}

console.log('\n--- uncontested expansion ---')
{
  // Walking into genuinely empty land: no dice, no losses, and the board this
  // is judged against is the SERVER's — an empty territory there is the only
  // thing that makes "uncontested" true.
  const empty = { territories: { src: { troops: 10 }, tgt: { troops: 0 } } } as never
  const walk = clampCombatResolution(empty, claim({
    uncontested: true, totalAtkLoss: 0, totalDefLoss: 0, troopsToAdvance: 4,
  }))
  check('an empty territory can be occupied', walk.captured, true)
  check('the advance stands', walk.troopsToAdvance, 4)
  check('losses are forced to zero on an uncontested move',
    [walk.totalAtkLoss, walk.totalDefLoss], [0, 0])

  // "Uncontested" against a DEFENDED territory is the same forgery as a
  // capture without the kills — the server's board says someone lives there.
  const lie = clampCombatResolution(board(10, 4), claim({
    uncontested: true, totalAtkLoss: 0, totalDefLoss: 0, troopsToAdvance: 4,
  }))
  check('claiming uncontested against defenders is refused', lie.captured, false)
  check('and moves nothing', lie.troopsToAdvance, 0)

  // Zero troops but an OWNER on record (a fallout-emptied holding, say) is
  // still not free land.
  const owned0 = { territories: { src: { troops: 10 }, tgt: { troops: 0, occupyingPlayerId: 'p9' } } } as never
  const squat = clampCombatResolution(owned0, claim({ uncontested: true, totalAtkLoss: 0, totalDefLoss: 0 }))
  check('an owned-but-empty territory is not uncontested', squat.captured, false)

  // The flag survives the clamp so the reducer can suppress the card award.
  check('the uncontested flag rides through', walk.uncontested, true)
}

console.log('\n--- the board edges ---')
{
  const emptyTgt = clampCombatResolution(board(10, 0), claim({ totalDefLoss: 0, captured: true }))
  check('an empty territory cannot be "captured" through combat', emptyTgt.captured, false)

  const missing = clampCombatResolution({ territories: {} } as never, claim())
  check('a territory the server has never heard of yields a null result',
    [missing.totalAtkLoss, missing.totalDefLoss, missing.captured], [0, 0, false])

  const minAdvance = clampCombatResolution(board(2, 1), claim({ totalAtkLoss: 0, totalDefLoss: 1, troopsToAdvance: 0 }))
  check('a real capture always advances at least one troop', minAdvance.troopsToAdvance, 1)
}


console.log('--- you commit what you attacked with ---')
{
  // Three dice thrown means three troops onto the ground you take. The
  // computer was walking into captured territory one troop at a time, which
  // is not a choice the rules offer anybody — and the clamp only ever
  // enforced a floor of ONE.
  const three = clampCombatResolution(board(), claim({ troopsToAdvance: 1, atkDiceUsed: 3 }))
  check('one troop after a three-dice attack becomes three', three.troopsToAdvance, 3)
  const two = clampCombatResolution(board(), claim({ troopsToAdvance: 1, atkDiceUsed: 2 }))
  check('two dice, two troops', two.troopsToAdvance, 2)
  check('a bigger advance is left alone',
    clampCombatResolution(board(), claim({ troopsToAdvance: 6, atkDiceUsed: 3 })).troopsToAdvance, 6)

  // The floor never empties the source: what survived still bounds it.
  const thin = clampCombatResolution(board(3), claim({
    totalAtkLoss: 1, troopsToAdvance: 1, atkDiceUsed: 3,
  }))
  check('a costly win moves what it has and leaves one behind', thin.troopsToAdvance, 1)

  // An old client that sends no dice count keeps the original floor of one.
  check('no dice count — the floor is one, as before',
    clampCombatResolution(board(), claim({ troopsToAdvance: 1 })).troopsToAdvance, 1)
  check('a forged dice count cannot move more than three',
    clampCombatResolution(board(), claim({ troopsToAdvance: 1, atkDiceUsed: 99 })).troopsToAdvance, 3)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
