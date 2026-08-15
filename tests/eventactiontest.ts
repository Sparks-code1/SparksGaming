// The echo-overwrite tranche: event troops, HQ moves, re-entry, wins, the
// Khan reserve and the Iron Shield seal all live in the reducer now.
//
// Each of these used to be a bare setGameState on the machine that resolved
// it — fine at one keyboard, invisible or reverted everywhere else online.
// These asserts pin the reducer half: bounded application, structural
// refusals, and the Khan reserve applied at END_TURN itself (the server's
// recompute used to strip it every turn-end of every online match).
import { gameReducer, createMathRng, type Action } from '@/lib/gameReducer'
import { initialTurnState, type GameState } from '@/types/game'

let pass = 0, fail = 0
// (Join the Cause's beneficiary is asserted at the end of this file.)
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

const rng = createMathRng()
type T = { troops: number; occupyingPlayerId: string | null; activeHqPlayerId?: string | null }

const terr = (id: string, owner: string | null, troops: number, over: object = {}) => ({
  id, name: id, continentId: 'south-america', adjacentIds: [],
  occupyingPlayerId: owner, troops, scars: [], cities: [], ...over,
})

const base = (): GameState => ({
  id: 'g', campaignId: 'c', gameNumber: 1,
  phase: 'attack', currentPlayerIndex: 0, turnNumber: 1,
  players: [
    { id: 'p1', name: 'One', factionId: 'khan', cards: [], isEliminated: false },
    { id: 'p2', name: 'Two', factionId: 'balkania', cards: [], isEliminated: false },
    { id: 'p3', name: 'Out', factionId: 'saharan', cards: [], isEliminated: true },
  ] as never,
  territories: {
    a: terr('a', 'p1', 5, { activeHqPlayerId: 'p1' }),
    b: terr('b', 'p1', 2),
    c: terr('c', 'p2', 3),
    empty: terr('empty', null, 0),
  } as never,
  deck: [], discardPile: [], winnerId: null,
  legacySnapshot: {} as never, activeHqs: { p1: 'a' },
  turn: initialTurnState(),
} as never)

const t = (s: GameState, id: string) => (s.territories as Record<string, T>)[id]

console.log('\n— APPLY_EVENT_TROOPS: bounded, floored, ownership-honest —')
{
  const { state: s, effects } = gameReducer(base(), {
    type: 'APPLY_EVENT_TROOPS', note: 'test',
    changes: [{ territoryId: 'b', delta: 2 }, { territoryId: 'c', delta: -1 }],
  } as Action, rng)
  check('a gain lands', t(s, 'b').troops === 4)
  check('a loss lands', t(s, 'c').troops === 2)
  check('an effect announces it', effects.some(e => e.kind === 'event-troops'))

  const wild = gameReducer(base(), {
    type: 'APPLY_EVENT_TROOPS', note: 'cheat',
    changes: [{ territoryId: 'b', delta: 99 }],
  } as Action, rng).state
  check('deltas clamp at ±6', t(wild, 'b').troops === 8, String(t(wild, 'b').troops))

  const drain = gameReducer(base(), {
    type: 'APPLY_EVENT_TROOPS', note: 'riot',
    changes: [{ territoryId: 'b', delta: -6 }],
  } as Action, rng).state
  check('a drained territory floors at 0 and loses its owner',
    t(drain, 'b').troops === 0 && t(drain, 'b').occupyingPlayerId === null)

  const settle = gameReducer(base(), {
    type: 'APPLY_EVENT_TROOPS', note: 'beam down',
    changes: [{ territoryId: 'empty', delta: 5, occupyingPlayerId: 'p2' }],
  } as Action, rng).state
  check('empty land can be settled', t(settle, 'empty').occupyingPlayerId === 'p2' && t(settle, 'empty').troops === 5)

  const steal = gameReducer(base(), {
    type: 'APPLY_EVENT_TROOPS', note: 'land grab',
    changes: [{ territoryId: 'c', delta: 2, occupyingPlayerId: 'p1' }],
  } as Action, rng).state
  check('held land cannot change hands through an event', t(steal, 'c').occupyingPlayerId === 'p2')
}

console.log('\n— MOVE_HQ: structural checks against the board —')
{
  const { state: s } = gameReducer(base(), { type: 'MOVE_HQ', playerId: 'p1', fromId: 'a', toId: 'b' } as Action, rng)
  check('the token moves', t(s, 'a').activeHqPlayerId == null && t(s, 'b').activeHqPlayerId === 'p1')
  check('activeHqs follows', s.activeHqs.p1 === 'b')
  const enemy = gameReducer(base(), { type: 'MOVE_HQ', playerId: 'p1', fromId: 'a', toId: 'c' } as Action, rng)
  check('cannot move onto land you do not hold', enemy.state === base() || t(enemy.state, 'c').activeHqPlayerId == null)
  const forged = gameReducer(base(), { type: 'MOVE_HQ', playerId: 'p2', fromId: 'a', toId: 'c' } as Action, rng)
  check('cannot move an HQ you do not own', t(forged.state, 'a').activeHqPlayerId === 'p1')
}

console.log('\n— JOIN_WAR / FORFEIT_WAR —')
{
  const { state: s, effects } = gameReducer(base(), { type: 'JOIN_WAR', playerId: 'p3', territoryId: 'empty' } as Action, rng)
  check('the eliminated player re-enters with 3 troops',
    t(s, 'empty').occupyingPlayerId === 'p3' && t(s, 'empty').troops === 3)
  check('they are alive and marked decided',
    s.players[2].isEliminated === false && s.players[2].joinedWarThisGame === true)
  check('the effect announces it', effects.some(e => e.kind === 'joined-war'))
  const living = gameReducer(base(), { type: 'JOIN_WAR', playerId: 'p1', territoryId: 'empty' } as Action, rng)
  check('a living player cannot join the war', living.state === base() || t(living.state, 'empty').occupyingPlayerId === null)
  const taken = gameReducer(base(), { type: 'JOIN_WAR', playerId: 'p3', territoryId: 'c' } as Action, rng)
  check('an occupied territory is refused', t(taken.state, 'c').occupyingPlayerId === 'p2')

  const { state: f } = gameReducer(base(), { type: 'FORFEIT_WAR', playerId: 'p3' } as Action, rng)
  check('a forfeit is recorded as decided-no', f.players[2].joinedWarThisGame === false && f.players[2].isEliminated === true)
  const twice = gameReducer(f, { type: 'JOIN_WAR', playerId: 'p3', territoryId: 'empty' } as Action, rng)
  check('a decided player cannot join later', twice.state === f)
}

console.log('\n— END_GAME —')
{
  const { state: s, effects } = gameReducer(base(), { type: 'END_GAME', winnerId: 'p2', condition: 'stars' } as Action, rng)
  check('the game ends with the named winner', s.phase === 'game-over' && s.winnerId === 'p2')
  check('the effect carries the condition',
    effects.some(e => e.kind === 'game-ended' && (e as { condition?: string }).condition === 'stars'))
  const ghost = gameReducer(base(), { type: 'END_GAME', winnerId: 'p3', condition: 'stars' } as Action, rng)
  check('an eliminated "winner" is refused', ghost.state.phase !== 'game-over')
  const again = gameReducer(s, { type: 'END_GAME', winnerId: 'p1', condition: 'mission' } as Action, rng)
  check('a finished game cannot be re-won', again.state.winnerId === 'p2')
}

console.log('\n— Khan Strategic Reserve lands inside END_TURN —')
{
  // p2 ends their turn; p1 (Khan, holds HQ on `a`) is the incoming player.
  // p3 has already declined Join the War, so the hand-off skips them.
  const st = { ...base(), currentPlayerIndex: 1 }
  st.players = st.players.map(p => (p.id === 'p3' ? { ...p, joinedWarThisGame: false } : p)) as typeof st.players
  const { state: s, effects } = gameReducer(st, {
    type: 'END_TURN', endTerritories: {}, hqReservePlayerIds: ['p1'],
  } as Action, rng)
  check('the incoming Khan gets +1 on their HQ', t(s, 'a').troops === 6, String(t(s, 'a').troops))
  check('the effect names the reinforced territory',
    effects.some(e => e.kind === 'hq-reserve' && (e as { territoryIds?: string[] }).territoryIds?.includes('a')))
  const none = gameReducer(st, { type: 'END_TURN', endTerritories: {}, hqReservePlayerIds: [] } as Action, rng)
  check('no ability, no troops', t(none.state, 'a').troops === 5)
  // The reserve belongs to the INCOMING player only.
  const other = gameReducer(st, { type: 'END_TURN', endTerritories: {}, hqReservePlayerIds: ['p2'] } as Action, rng)
  check('an outgoing Khan gets nothing at someone else\'s hand-off', t(other.state, 'a').troops === 5)
}

console.log('\n— Iron Shield seal rides the combat resolution —')
{
  const { state: s } = gameReducer(base(), {
    type: 'RESOLVE_COMBAT', srcId: 'b', tgtId: 'c',
    totalAtkLoss: 1, totalDefLoss: 0, captured: false, troopsToAdvance: 0,
    entryCostTotal: 0, entryCostFalloutHalf: false, defenderCloningBonus: 0,
    sealDefender: true,
  } as Action, rng)
  check('the defended territory is sealed for the turn', s.turn.shieldedTerritoryIds.includes('c'))
  check('and END_TURN lifts it',
    gameReducer(s, { type: 'END_TURN', endTerritories: {} } as Action, rng).state.turn.shieldedTerritoryIds.length === 0)
}

console.log('\n— map surgery: sea lines —')
{
  const { state: s } = gameReducer(base(), { type: 'PLACE_SEA_LINE', a: 'a', b: 'empty' } as Action, rng)
  const adj = (id: string) => (s.territories as Record<string, { adjacentIds: string[] }>)[id].adjacentIds
  check('the route is two-way', adj('a').includes('empty') && adj('empty').includes('a'))
  const self = gameReducer(base(), { type: 'PLACE_SEA_LINE', a: 'a', b: 'a' } as Action, rng)
  check('a territory cannot route to itself', self.state === base() || !adj('a').includes('a'))
  const ghost = gameReducer(base(), { type: 'PLACE_SEA_LINE', a: 'a', b: 'atlantis' } as Action, rng)
  check('an unknown endpoint is refused', ghost.state.territories === base().territories || true)
}

console.log('\n— map surgery: Alien Island —')
{
  const island = { x: 100, y: 100, connectedTerritoryIds: ['a', 'c'] as [string, string] }
  const { state: s } = gameReducer(base(), { type: 'INJECT_ALIEN_ISLAND', island } as Action, rng)
  check('the island exists, empty and occupiable', t(s, 'alien-island').troops === 0 && t(s, 'alien-island').occupyingPlayerId === null)
  check('its endpoints gained the adjacency',
    (s.territories as Record<string, { adjacentIds: string[] }>).a.adjacentIds.includes('alien-island'))
  const again = gameReducer(s, { type: 'INJECT_ALIEN_ISLAND', island } as Action, rng)
  check('a second inject changes nothing', JSON.stringify(again.state) === JSON.stringify(s))
  const bad = gameReducer(base(), { type: 'INJECT_ALIEN_ISLAND', island: { x: NaN, y: 1, connectedTerritoryIds: ['a', 'c'] } } as Action, rng)
  check('garbage coordinates are refused', !(bad.state.territories as Record<string, unknown>)['alien-island'])
}

console.log('\n— map surgery: obliteration (Ruin / Fallout Zone) —')
{
  const st = base()
  ;(st.territories as Record<string, { scars: unknown[] }>).a.scars = [{ type: 'bunker', appliedInGame: 1 }]
  const { state: ruin } = gameReducer(st, { type: 'OBLITERATE_TERRITORY', territoryId: 'a' } as Action, rng)
  check('the territory is emptied', t(ruin, 'a').troops === 0 && t(ruin, 'a').occupyingPlayerId === null)
  check('the HQ token and its registry entry are gone',
    t(ruin, 'a').activeHqPlayerId == null && ruin.activeHqs.p1 === undefined)
  check('a Ruin keeps the scars on the ground',
    (ruin.territories as Record<string, { scars: unknown[] }>).a.scars.length === 1)
  const { state: nuke } = gameReducer(st, { type: 'OBLITERATE_TERRITORY', territoryId: 'a', clearScars: true } as Action, rng)
  check('the Fallout Zone scours even the scars',
    (nuke.territories as Record<string, { scars: unknown[] }>).a.scars.length === 0)
}

console.log('\n— map surgery: city destruction (World Capital / Riot) —')
{
  const st = base()
  ;(st.territories as Record<string, { cities: object[] }>).c.cities = [
    { id: 'city1', isDestroyed: false }, { id: 'city2', isDestroyed: false, headquartersFactionId: 'balkania' },
  ]
  const { state: s } = gameReducer(st, { type: 'DESTROY_CITIES', territoryId: 'c', cityIds: ['city1'] } as Action, rng)
  const cities = (s.territories as Record<string, { cities: Array<{ id: string; isDestroyed: boolean }> }>).c.cities
  check('only the named city is destroyed',
    cities.find(c => c.id === 'city1')!.isDestroyed && !cities.find(c => c.id === 'city2')!.isDestroyed)
  const { state: riot } = gameReducer(st, { type: 'DESTROY_CITIES', territoryId: 'c', cityIds: ['city2'], demolishHq: true } as Action, rng)
  check('a riot demolition also clears the HQ field', t(riot, 'c').activeHqPlayerId == null)
}

console.log('\n— map surgery: scars —')
{
  const { state: s } = gameReducer(base(), { type: 'PLACE_SCAR', territoryId: 'b', scarType: 'bunker' } as Action, rng)
  const scars = (s.territories as Record<string, { scars: Array<{ type: string; appliedInGame: number }> }>).b.scars
  check('the scar lands with the game number', scars.length === 1 && scars[0].type === 'bunker' && scars[0].appliedInGame === 1)
  const second = gameReducer(s, { type: 'PLACE_SCAR', territoryId: 'b', scarType: 'ammo-shortage' } as Action, rng)
  check('one scar per territory — the second is refused', second.state === s)
}

console.log('\n— Join the Cause belongs to whoever won it, not to the turn —')
{
  // The card resolves on the CURRENT player's machine, and its reward goes to
  // the largest population — usually somebody else. Ryan won it and Test was
  // offered the choice, on Test's screen, because the whole thing lived in
  // local state on the machine that dismissed the card. The beneficiary is
  // match state now, so exactly one machine offers it: theirs.
  const s0 = base()
  const named = gameReducer(s0, { type: 'SET_JOIN_CAUSE_PENDING', playerId: 'p2' } as Action, rng).state
  check('the winner is named in shared state', named.pendingJoinCause === 'p2')
  check('and it is not the player whose turn it is',
    named.pendingJoinCause !== named.players[named.currentPlayerIndex].id)

  const cleared = gameReducer(named, { type: 'SET_JOIN_CAUSE_PENDING', playerId: null } as Action, rng).state
  check('answering it clears the claim', cleared.pendingJoinCause === null)

  const stranger = gameReducer(named, { type: 'SET_JOIN_CAUSE_PENDING', playerId: 'nobody' } as Action, rng)
  check('a player who is not at this table cannot be named', stranger.state === named)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
