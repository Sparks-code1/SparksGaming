// Per-turn combat tracking is REDUCER state, not component state.
//
// The component used to patch turn.captured / captureCount / conqueredIds /
// attackedTerritoryIds / bearTrapTerritoryId via setTurn after dispatching —
// fine in hotseat, but online every server echo replaces the whole GameState,
// and the server never made those patches. The eternally-false turn.captured
// made EVERY capture "the first of the turn": a card per capture, an AI hand
// holding the entire drained resource deck, and a phantom depletion star.
// Balkania's 4th-capture count could never pass 1 for the same reason.
//
// These asserts pin the tracking inside gameReducer, where both the optimistic
// local apply and the server compute it identically.
import { gameReducer, createMathRng, type Action } from '@/lib/gameReducer'
import { initialTurnState, type GameState } from '@/types/game'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

const rng = createMathRng()

const terr = (id: string, owner: string | null, troops: number, over: object = {}) => ({
  id, name: id, continentId: 'south-america', adjacentIds: [],
  occupyingPlayerId: owner, troops, scars: [], cities: [], ...over,
})

/** Two live players; p1 holds src (and all of tiny South America bar the targets). */
const baseState = (): GameState => ({
  id: 'g', campaignId: 'c', gameNumber: 1,
  phase: 'attack', currentPlayerIndex: 0, turnNumber: 1,
  players: [
    { id: 'p1', name: 'One', factionId: 'balkania', color: '#111', cards: [], isEliminated: false },
    { id: 'p2', name: 'Two', factionId: 'khan', color: '#222', cards: [], isEliminated: false },
  ] as never,
  territories: {
    src:   terr('src', 'p1', 10),
    tgt:   terr('tgt', 'p2', 2),
    tgt2:  terr('tgt2', 'p2', 2),
    empty: terr('empty', null, 0, { cities: [{ id: 'city1', isDestroyed: false }] }),
    home:  terr('home', 'p2', 3),
  } as never,
  deck: [], discardPile: [], winnerId: null,
  legacySnapshot: {} as never, activeHqs: {},
  turn: initialTurnState(),
} as never)

const resolve = (over: Partial<Extract<Action, { type: 'RESOLVE_COMBAT' }>> = {}): Action => ({
  type: 'RESOLVE_COMBAT', srcId: 'src', tgtId: 'tgt',
  totalAtkLoss: 1, totalDefLoss: 2, captured: true, troopsToAdvance: 2,
  entryCostTotal: 0, entryCostFalloutHalf: false, defenderCloningBonus: 0,
  ...over,
})

console.log('\n— a capture is tracked by the reducer itself —')
{
  const { state: s1, effects } = gameReducer(baseState(), resolve(), rng)
  check('turn.captured is set', s1.turn.captured === true)
  check('captureCount counts it', s1.turn.captureCount === 1)
  check('conqueredIds records the territory', s1.turn.conqueredIds.join(',') === 'tgt')
  check('attackedTerritoryIds records the combat', s1.turn.attackedTerritoryIds.join(',') === 'tgt')
  check('the bear trap locks onto the first attacked territory', s1.turn.bearTrapTerritoryId === 'tgt')
  check('not via sea unless the action says so', s1.turn.conqueredViaSeaIds.length === 0)
  const cap = effects.find(e => e.kind === 'territory-captured')
  check('the FIRST capture of the turn says so', (cap as { firstCaptureThisTurn?: boolean })?.firstCaptureThisTurn === true)
}

console.log('\n— the second capture of the same turn is not "first" —')
{
  const { state: s1 } = gameReducer(baseState(), resolve(), rng)
  const { state: s2, effects } = gameReducer(s1, resolve({ tgtId: 'tgt2', viaSea: true }), rng)
  const cap = effects.find(e => e.kind === 'territory-captured')
  check('firstCaptureThisTurn is false the second time', (cap as { firstCaptureThisTurn?: boolean })?.firstCaptureThisTurn === false)
  check('captureCount reaches 2', s2.turn.captureCount === 2)
  check('conqueredIds accumulates', s2.turn.conqueredIds.join(',') === 'tgt,tgt2')
  check('a viaSea capture lands in conqueredViaSeaIds', s2.turn.conqueredViaSeaIds.join(',') === 'tgt2')
  check('the bear trap does NOT move to the second target', s2.turn.bearTrapTerritoryId === 'tgt')
}

console.log('\n— this is exactly the state a server echo carries —')
{
  // The regression scenario: the actor's optimistic apply and the server run
  // the SAME reducer, so the state that echoes back has the tracking IN it.
  // Round-tripping through JSON (what the wire does) must lose nothing.
  const { state: s1 } = gameReducer(baseState(), resolve(), rng)
  const echoed: GameState = JSON.parse(JSON.stringify(s1))
  const { effects } = gameReducer(echoed, resolve({ tgtId: 'tgt2' }), rng)
  const cap = effects.find(e => e.kind === 'territory-captured')
  check('a capture after the echo still knows it is not the first',
    (cap as { firstCaptureThisTurn?: boolean })?.firstCaptureThisTurn === false)
}

console.log('\n— a repelled attack tracks combat but no conquest —')
{
  const { state: s1 } = gameReducer(baseState(), resolve({ captured: false, totalDefLoss: 1, troopsToAdvance: 0 }), rng)
  check('turn.captured stays false', s1.turn.captured === false)
  check('captureCount stays 0', s1.turn.captureCount === 0)
  check('the territory still counts as attacked', s1.turn.attackedTerritoryIds.join(',') === 'tgt')
  check('and still arms the bear trap', s1.turn.bearTrapTerritoryId === 'tgt')
}

console.log('\n— an uncontested expansion counts for Balkania, not for cards —')
{
  const { state: s1, effects } = gameReducer(baseState(), resolve({
    tgtId: 'empty', uncontested: true, totalAtkLoss: 0, totalDefLoss: 0,
  }), rng)
  check('captureCount counts the expansion (Imperial Expansion)', s1.turn.captureCount === 1)
  check('turn.captured stays false — walking into empty land is no conquest', s1.turn.captured === false)
  check('no card-award effect is emitted', !effects.some(e => e.kind === 'territory-captured'))
  check('conqueredIds is untouched', s1.turn.conqueredIds.length === 0)
  check('attackedTerritoryIds is untouched — no dice were rolled', s1.turn.attackedTerritoryIds.length === 0)
  check('the standing city marks expandedIntoCity (Resourceful)', s1.turn.expandedIntoCity === true)
}

console.log('\n— END_TURN resets the turn for the incoming player —')
{
  const { state: s1 } = gameReducer(baseState(), resolve(), rng)
  const { state: s2 } = gameReducer(s1, { type: 'END_TURN', endTerritories: {} } as Action, rng)
  check('the turn is fresh', JSON.stringify({ ...s2.turn, continentsAtTurnStart: 0 }) === JSON.stringify(initialTurnState()),
    JSON.stringify(s2.turn))
  check('play passed to the next player', s2.currentPlayerIndex === 1)
  // p2 now holds home + tgt2 (p1 captured tgt); South America has 5 territories
  // here, so nobody holds a whole continent.
  check('continentsAtTurnStart is computed for the INCOMING player', s2.turn.continentsAtTurnStart === 0)
}

console.log('\n— END_TURN snapshots a whole continent the incoming player holds —')
{
  const st = baseState()
  // Hand ALL of the mini-continent to p2 so the incoming snapshot sees 1.
  for (const t of Object.values(st.territories)) {
    (t as { occupyingPlayerId: string | null; troops: number }).occupyingPlayerId = 'p2'
    ;(t as { troops: number }).troops = Math.max(1, (t as { troops: number }).troops)
  }
  const { state: s2 } = gameReducer(st, { type: 'END_TURN', endTerritories: {} } as Action, rng)
  check('the incoming player’s whole continent is counted',
    s2.turn.continentsAtTurnStart === 1, `got ${s2.turn.continentsAtTurnStart}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
