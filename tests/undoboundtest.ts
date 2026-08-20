// UNDO_PLACEMENT is bounded by the reducer's own per-turn placement record.
// It used to subtract a troop from ANY territory, unguarded — a confused
// client fired ten undos at a territory that had received four troops and
// drained it to zero after the turn was over. Every assert here pins the
// bound: no record, no undo.
import { gameReducer, createMathRng, type Action } from '@/lib/gameReducer'
import { initialTurnState, type GameState } from '@/types/game'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

const rng = createMathRng()

const terr = (id: string, owner: string | null, troops: number) => ({
  id, name: id, continentId: 'asia', adjacentIds: [],
  occupyingPlayerId: owner, troops, scars: [], cities: [],
})

const base = (): GameState => ({
  id: 'g', campaignId: 'c', gameNumber: 1,
  phase: 'reinforce', currentPlayerIndex: 0, turnNumber: 1,
  players: [
    { id: 'p1', name: 'One', factionId: 'khan', cards: [], isEliminated: false },
    { id: 'p2', name: 'Two', factionId: 'balkania', cards: [], isEliminated: false },
  ] as never,
  territories: {
    sea: terr('sea', 'p1', 3),
    home: terr('home', 'p1', 8),
  } as never,
  deck: [], discardPile: [], winnerId: null,
  legacySnapshot: {} as never, activeHqs: {},
  turn: initialTurnState(),
} as never)

const troopsAt = (s: GameState, id: string) => (s.territories as Record<string, { troops: number }>)[id].troops
const place = (s: GameState, tid: string) =>
  gameReducer(s, { type: 'PLACE_REINFORCEMENT', playerId: 'p1', territoryId: tid } as Action, rng).state
const undo = (s: GameState, tid: string) =>
  gameReducer(s, { type: 'UNDO_PLACEMENT', territoryId: tid } as Action, rng).state

console.log('\n— placements go on the record, undos come off it —')
{
  let s = place(place(base(), 'sea'), 'sea')
  check('two placements land', troopsAt(s, 'sea') === 5)
  check('the record counts them', s.turn.placedThisTurn['sea'] === 2)

  s = undo(s, 'sea')
  check('one undo reverses one', troopsAt(s, 'sea') === 4 && s.turn.placedThisTurn['sea'] === 1)
  s = undo(s, 'sea')
  check('a second undo reverses the other', troopsAt(s, 'sea') === 3 && s.turn.placedThisTurn['sea'] === 0)

  const drained = undo(undo(undo(s, 'sea'), 'sea'), 'sea')
  check('undos beyond the record are refused', troopsAt(drained, 'sea') === 3,
    String(troopsAt(drained, 'sea')))
}

console.log('\n— no record, no undo —')
{
  const s = undo(base(), 'sea')
  check('an undo with no placement this turn is refused', troopsAt(s, 'sea') === 3)

  const other = undo(place(base(), 'home'), 'sea')
  check('a placement elsewhere authorizes nothing here', troopsAt(other, 'sea') === 3)
}

console.log('\n— the record dies with the turn —')
{
  let s = place(place(base(), 'sea'), 'sea')
  s = gameReducer(s, { type: 'END_TURN', endTerritories: {}, hqReservePlayerIds: [] } as never, rng).state
  check('END_TURN clears the record', Object.keys(s.turn.placedThisTurn ?? { x: 1 }).length === 0)
  const late = undo(s, 'sea')
  check('an after-the-turn undo is refused', troopsAt(late, 'sea') === 5)
}

console.log('\n— phase and floor guards —')
{
  let s = place(base(), 'sea')
  s = gameReducer(s, { type: 'END_REINFORCE_PHASE' } as Action, rng).state
  check('an undo outside the reinforce phase is refused', troopsAt(undo(s, 'sea'), 'sea') === 4)

  // Even a forged record cannot drain a territory to zero.
  const rigged = { ...base(), turn: { ...initialTurnState(), placedThisTurn: { sea: 99 } } } as GameState
  const low = { ...rigged, territories: { ...rigged.territories, sea: terr('sea', 'p1', 1) } } as unknown as GameState
  check('the last troop is never undone away', troopsAt(undo(low, 'sea'), 'sea') === 1)
}

console.log(`\nundoboundtest: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
