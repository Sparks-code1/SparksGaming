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

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
