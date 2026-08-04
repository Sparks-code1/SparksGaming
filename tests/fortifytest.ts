// Fortify: the move itself, and when it may still be undone.
//
// Saharan "Mobile Forces" may fortify at any point in the turn. That move is
// final the moment it is confirmed — the player carries on attacking with those
// troops. The normal end-of-turn fortify keeps its undo as a misclick net.
import { gameReducer, createMathRng } from '@/lib/gameReducer'
import { initialTurnState } from '@/types/game'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

const T = (id: string, troops: number) => ({
  id, name: id, continentId: 'asia', occupyingPlayerId: 'p1', troops,
  scars: [], cities: [], adjacentIds: [],
})
const state = (phase: string): any => ({
  id: 'g', campaignId: 'c', gameNumber: 1, phase,
  currentPlayerIndex: 0, turnNumber: 1,
  players: [{ id: 'p1', name: 'Ryan', factionId: 'saharan-republic', troops: 0, cards: [], missionCardId: null, isEliminated: false, holdsHq: true, wins: 0, winHistory: [] }],
  territories: { home: T('home', 9), front: T('front', 2) },
  deck: [], discardPile: [], activeHqs: {}, winnerId: null, turn: initialTurnState(),
})

// ─── 1. The move actually happens ─────────────────────────────────────────
console.log('--- confirming a fortify ---')
{
  const r = gameReducer(state('fortify'), {
    type: 'CONFIRM_FORTIFY', srcId: 'home', dstId: 'front', troopsRemoved: 4, troopsArriving: 4,
  } as any, createMathRng())
  check('troops leave the source', r.state.territories.home.troops, 5)
  check('troops arrive at the destination', r.state.territories.front.troops, 6)
  check('no troops are conjured or lost',
    r.state.territories.home.troops + r.state.territories.front.troops, 11)
}
{
  // Fallout Zone halves the arrivals — removed and arriving differ on purpose.
  const r = gameReducer(state('attack'), {
    type: 'CONFIRM_FORTIFY', srcId: 'home', dstId: 'front', troopsRemoved: 4, troopsArriving: 2,
  } as any, createMathRng())
  check('radiation losses are not returned to the source', r.state.territories.home.troops, 5)
  check('only the survivors arrive', r.state.territories.front.troops, 4)
}
{
  // A Mobile Forces move made during the attack phase still moves troops.
  const r = gameReducer(state('attack'), {
    type: 'CONFIRM_FORTIFY', srcId: 'home', dstId: 'front', troopsRemoved: 3, troopsArriving: 3,
  } as any, createMathRng())
  check('Mobile Forces moves troops outside the fortify phase',
    [r.state.territories.home.troops, r.state.territories.front.troops], [6, 5])
  check('...and does not change the phase', r.state.phase, 'attack')
}

// ─── 2. Whether an undo is offered ────────────────────────────────────────
console.log('\n--- undo eligibility ---')

/** Mirrors handleFortifyConfirm: the undo record is only kept for the normal
 *  end-of-turn fortify. Anything earlier is a committed Mobile Forces move. */
const undoRecord = (phase: string, move: { srcId: string; dstId: string; troops: number }) =>
  phase !== 'fortify' ? null : move
const MOVE = { srcId: 'home', dstId: 'front', troops: 4 }

check('the normal fortify keeps its undo', undoRecord('fortify', MOVE), MOVE)
check('a Mobile Forces move in the ATTACK phase is final',
  undoRecord('attack', MOVE), null)
check('a Mobile Forces move in the REINFORCE phase is final',
  undoRecord('reinforce', MOVE), null)

// canUndoFortify = !!lastFortify — this is what greys the button out.
const buttonEnabled = (rec: unknown) => !!rec
check('button live right after a normal fortify', buttonEnabled(undoRecord('fortify', MOVE)), true)
check('button greyed right after a Mobile Forces move',
  buttonEnabled(undoRecord('attack', MOVE)), false)
check('...and still greyed once the fortify phase is reached',
  buttonEnabled(null), false)

// ─── 3. Undoing restores exactly what moved ───────────────────────────────
console.log('\n--- undoing a normal fortify ---')
{
  // Mirrors handleUndoFortify: give back the ARRIVING count, not the removed
  // count, so radiation losses stay lost.
  const afterMove = { home: 5, front: 6 }
  const rec = { srcId: 'home', dstId: 'front', troops: 4 }
  const undone = { home: afterMove.home + rec.troops, front: afterMove.front - rec.troops }
  check('the board returns to its pre-fortify state', undone, { home: 9, front: 2 })
}
{
  const afterMove = { home: 5, front: 4 }   // 4 left, only 2 survived the Fallout Zone
  const rec = { srcId: 'home', dstId: 'front', troops: 2 }
  const undone = { home: afterMove.home + rec.troops, front: afterMove.front - rec.troops }
  check('radiation losses are NOT refunded by an undo', undone, { home: 7, front: 2 })
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
