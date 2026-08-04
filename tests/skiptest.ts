// Reproduces the turn-skip bug: a duplicate end-turn call queued by the AI
// fortify branch. Verifies the guard (live phase !== 'fortify') blocks it.
import { gameReducer, createMathRng } from '@/lib/gameReducer'

const rng = createMathRng()

function mkState(): any {
  const names = ['Bob', 'Ryan', 'MED', 'Carol', 'Chris']
  return {
    players: names.map((n, i) => ({
      id: 'p' + i, name: n, factionId: 'f' + i, isEliminated: false, cards: [], troops: 0,
    })),
    currentPlayerIndex: 0,
    phase: 'fortify',
    turnNumber: 6,
    territories: {
      t0: { id: 't0', name: 'T0', occupyingPlayerId: 'p0', troops: 3, cities: [] },
      t1: { id: 't1', name: 'T1', occupyingPlayerId: 'p1', troops: 3, cities: [] },
      t2: { id: 't2', name: 'T2', occupyingPlayerId: 'p2', troops: 3, cities: [] },
      t3: { id: 't3', name: 'T3', occupyingPlayerId: 'p3', troops: 3, cities: [] },
      t4: { id: 't4', name: 'T4', occupyingPlayerId: 'p4', troops: 3, cities: [] },
    },
    activeHqs: {},
    turn: { captured: false, captureCount: 0, conqueredIds: [], conqueredViaSeaIds: [],
            bearTrapTerritoryId: null, attackedTerritoryIds: [], shieldedTerritoryIds: [] },
  }
}

const endTurn = (s: any) => gameReducer(s, { type: 'END_TURN', endTerritories: {} } as any, rng).state
const who = (s: any) => `${s.currentPlayerIndex} (${s.players[s.currentPlayerIndex].name})`

let pass = true
const check = (label: string, actual: string, expected: string) => {
  const ok = actual === expected
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${actual} want=${expected}`)
}

// 1. A single end-turn advances exactly one seat.
{
  const s0 = mkState()
  check('single END_TURN advances one seat', who(endTurn(s0)), '1 (Ryan)')
}

// 2. THE BUG — the duplicate call the AI fortify branch used to queue.
//    Both closures captured phase==='fortify', so both ran the end-turn path.
{
  const s0 = mkState()
  const s1 = endTurn(s0)          // real end of Bob's turn  -> Ryan
  const s2 = endTurn(s1)          // stale duplicate         -> MED (Ryan skipped!)
  check('UNGUARDED duplicate skips a player (the reported bug)', who(s2), '2 (MED)')
  console.log(`        ^ Ryan never got a turn: ${who(s1)} -> ${who(s2)}`)
}

// 3. THE FIX — END_TURN leaves phase==='reinforce', so the guard
//    `if (gameStateRef.current.phase !== 'fortify') return` blocks the duplicate.
{
  const s0 = mkState()
  const s1 = endTurn(s0)
  check('after END_TURN live phase is no longer fortify', s1.phase, 'reinforce')

  const guardBlocks = s1.phase !== 'fortify'
  const s2 = guardBlocks ? s1 : endTurn(s1)
  check('GUARDED duplicate is ignored — no player skipped', who(s2), '1 (Ryan)')
}

// 4. Full round with the guard: every seat gets exactly one turn, in order.
{
  let s = mkState()
  const order: string[] = [s.players[s.currentPlayerIndex].name]
  for (let i = 0; i < 4; i++) {
    s = endTurn(s)
    order.push(s.players[s.currentPlayerIndex].name)
    // simulate a stale duplicate firing every turn — guard must swallow it
    if (s.phase === 'fortify') s = endTurn(s)
    s = { ...s, phase: 'fortify' } // next player reaches their own fortify phase
  }
  check('full round visits every seat in order', order.join(','), 'Bob,Ryan,MED,Carol,Chris')
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
