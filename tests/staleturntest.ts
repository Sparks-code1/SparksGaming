// Two live corruptions with one root: an action landing on a turn it was
// never planned for.
//
// 1. THE SKIP. Phase advances were anonymous, so whichever turn was live when
//    one arrived is the turn it advanced. A machine whose view of the board
//    lagged fired "end the computer's reinforce phase" — the board had moved
//    on to a human — and the action tore through the HUMAN's turn instead.
//    The match log showed the shape exactly: two full
//    END_REINFORCE/END_ATTACK/CONFIRM_FORTIFY cycles with a single END_TURN
//    between them and not one PLACE_REINFORCEMENT — a turn consumed without
//    a troop placed. Naming the intended actor makes a stale plan a no-op.
//
// 2. THE GHOST. A capture forced a minimum advance of 1 even when the source
//    had a single troop, emptying the SOURCE while leaving its owner — three
//    0-troop owned territories sitting on the live board at once.
import { gameReducer, createMathRng, clampCombatResolution, type Action } from '@/lib/gameReducer'
import { initialTurnState, type GameState } from '@/types/game'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

const rng = createMathRng()

const terr = (id: string, owner: string | null, troops: number) => ({
  id, name: id, continentId: 'south-america', adjacentIds: [],
  occupyingPlayerId: owner, troops, scars: [], cities: [],
})

const base = (phase = 'reinforce'): GameState => ({
  id: 'g', campaignId: 'c', gameNumber: 1,
  phase, currentPlayerIndex: 0, turnNumber: 4,
  players: [
    { id: 'ryan', name: 'Ryan', factionId: 'khan', cards: [], isEliminated: false },
    { id: 'ai', name: 'Krieg', factionId: 'balkania', cards: [], isEliminated: false, isAI: true },
  ] as never,
  territories: { a: terr('a', 'ryan', 5), b: terr('b', 'ai', 3) } as never,
  deck: [], discardPile: [], winnerId: null,
  legacySnapshot: {} as never, activeHqs: {},
  turn: initialTurnState(),
} as never)

console.log('\n— a phase advance names its actor —')
{
  // The AI's machine planned this while it still believed the AI was up.
  const stale = gameReducer(base('reinforce'), {
    type: 'END_REINFORCE_PHASE', playerId: 'ai',
  } as Action, rng).state
  check("a stale advance cannot end Ryan's reinforce phase", stale.phase === 'reinforce')

  const mine = gameReducer(base('reinforce'), {
    type: 'END_REINFORCE_PHASE', playerId: 'ryan',
  } as Action, rng).state
  check('the current player still advances normally', mine.phase === 'attack')

  const anon = gameReducer(base('reinforce'), { type: 'END_REINFORCE_PHASE' } as Action, rng).state
  check('an unnamed advance still works (hotseat)', anon.phase === 'attack')

  const staleAtk = gameReducer(base('attack'), {
    type: 'END_ATTACK_PHASE', playerId: 'ai',
  } as Action, rng).state
  check('the same holds for the attack phase', staleAtk.phase === 'attack')

  const staleEnd = gameReducer(base('fortify'), {
    type: 'END_TURN', endTerritories: {}, hqReservePlayerIds: [], playerId: 'ai',
  } as never, rng).state
  check("a stale END_TURN cannot end Ryan's turn",
    staleEnd.currentPlayerIndex === 0 && staleEnd.turnNumber === 4)

  const realEnd = gameReducer(base('fortify'), {
    type: 'END_TURN', endTerritories: {}, hqReservePlayerIds: [], playerId: 'ryan',
  } as never, rng).state
  check('the real END_TURN hands the turn on', realEnd.currentPlayerIndex === 1)
}

console.log('\n— an advance never empties its own source —')
{
  // src holds exactly 1 troop after losses: nothing can be spared, so the
  // ground is not taken. It used to move that last troop out.
  const s = { ...base('attack') } as GameState
  ;(s.territories as Record<string, { troops: number; occupyingPlayerId: string | null }>).a.troops = 1
  ;(s.territories as Record<string, { troops: number; occupyingPlayerId: string | null }>).b.troops = 1

  const out = gameReducer(s, {
    type: 'RESOLVE_COMBAT', srcId: 'a', tgtId: 'b',
    totalAtkLoss: 0, totalDefLoss: 1, captured: true, troopsToAdvance: 1,
    entryCostTotal: 0, entryCostFalloutHalf: false, defenderCloningBonus: 0,
  } as never, rng).state
  const t = out.territories as Record<string, { troops: number; occupyingPlayerId: string | null }>
  check('the source keeps its last troop', t.a.troops === 1, String(t.a.troops))
  check('no 0-troop owned territory is created',
    !Object.values(t).some(x => x.troops <= 0 && x.occupyingPlayerId))
  check('the ground did not change hands', t.b.occupyingPlayerId === 'ai')
  check('and the turn records no capture', out.turn.captured === false)

  // With a troop to spare it captures exactly as before.
  const s2 = { ...base('attack') } as GameState
  ;(s2.territories as Record<string, { troops: number }>).a.troops = 3
  ;(s2.territories as Record<string, { troops: number }>).b.troops = 1
  const won = gameReducer(s2, {
    type: 'RESOLVE_COMBAT', srcId: 'a', tgtId: 'b',
    totalAtkLoss: 0, totalDefLoss: 1, captured: true, troopsToAdvance: 2,
    entryCostTotal: 0, entryCostFalloutHalf: false, defenderCloningBonus: 0,
  } as never, rng).state
  const t2 = won.territories as Record<string, { troops: number; occupyingPlayerId: string | null }>
  check('a real capture still lands', t2.b.occupyingPlayerId === 'ryan' && t2.b.troops === 2)
  check('and leaves one behind', t2.a.troops === 1)
  check('and counts as a capture', won.turn.captured === true)
}

console.log('\n— the clamp allows "could not occupy" —')
{
  const board = { territories: { src: { troops: 1 }, tgt: { troops: 2 } } } as never
  const r = clampCombatResolution(board, {
    srcId: 'src', tgtId: 'tgt',
    totalAtkLoss: 0, totalDefLoss: 2, captured: true, troopsToAdvance: 1,
    entryCostTotal: 0, defenderCloningBonus: 0,
  } as never)
  check('an advance with nothing to spare clamps to zero', r.troopsToAdvance === 0, String(r.troopsToAdvance))

  const ok = clampCombatResolution({ territories: { src: { troops: 10 }, tgt: { troops: 2 } } } as never, {
    srcId: 'src', tgtId: 'tgt',
    totalAtkLoss: 2, totalDefLoss: 2, captured: true, troopsToAdvance: 5,
    entryCostTotal: 0, defenderCloningBonus: 0,
  } as never)
  check('a normal advance is untouched', ok.troopsToAdvance === 5, String(ok.troopsToAdvance))
}

console.log(`\nstaleturntest: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
