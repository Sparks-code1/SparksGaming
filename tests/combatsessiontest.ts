// Interactive online combat: the battle is shared state, so the defender
// fights from their own machine and everyone else watches the state.
//
// The rules under test: auto-resolve needs BOTH players (either one
// preferring dice forces a manual battle); each side's raw dice post once
// per round and the attacker never waits for the defender; a stale key or a
// wrong round is refused; the session dies with the battle, the retreat and
// the turn.
import { gameReducer, createMathRng, type Action } from '@/lib/gameReducer'
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

const base = (): GameState => ({
  id: 'g', campaignId: 'c', gameNumber: 1,
  phase: 'attack', currentPlayerIndex: 0, turnNumber: 2,
  players: [
    { id: 'p1', name: 'Attacker', cards: [], isEliminated: false },
    { id: 'p2', name: 'Defender', cards: [], isEliminated: false },
  ] as never,
  territories: { src: terr('src', 'p1', 8), tgt: terr('tgt', 'p2', 4) } as never,
  deck: [], discardPile: [], winnerId: null,
  legacySnapshot: {} as never, activeHqs: {},
  turn: initialTurnState(),
} as never)

const offer = (over: object = {}): Action => ({
  type: 'COMBAT_OFFER', key: 'k1', srcId: 'src', tgtId: 'tgt',
  attackerId: 'p1', defenderId: 'p2', defDiceMax: 2, ...over,
} as Action)

console.log('\n— the offer opens a session judged against the board —')
{
  const { state: s } = gameReducer(base(), offer(), rng)
  check('the session exists', s.combat?.key === 'k1' && s.combat.round === 1)
  check('the defender die entitlement rides along', s.combat?.defDiceMax === 2)
  const forged = gameReducer(base(), offer({ attackerId: 'p2', defenderId: 'p1' }), rng)
  check('an offer that lies about who owns what is refused', !forged.state.combat)
  const junk = gameReducer(base(), offer({ defDiceMax: 99 }), rng)
  check('the die entitlement clamps to 1–3', junk.state.combat?.defDiceMax === 3)
}

console.log('\n— auto-resolve needs both players —')
{
  const { state: s1 } = gameReducer(base(), offer(), rng)
  const { state: s2 } = gameReducer(s1, { type: 'COMBAT_PROPOSE_AUTO', key: 'k1' } as Action, rng)
  check('the proposal is recorded', s2.combat?.autoProposed === true)
  const { state: yes } = gameReducer(s2, { type: 'COMBAT_DEFENSE_CHOICE', key: 'k1', accept: true } as Action, rng)
  check('the defender may accept', yes.combat?.defenderAuto === true)
  const { state: no } = gameReducer(s2, { type: 'COMBAT_DEFENSE_CHOICE', key: 'k1', accept: false } as Action, rng)
  check('or force dice', no.combat?.defenderAuto === false)
  const flip = gameReducer(no, { type: 'COMBAT_DEFENSE_CHOICE', key: 'k1', accept: true } as Action, rng)
  check('one answer per battle — no flip-flopping', flip.state.combat?.defenderAuto === false)
  const stale = gameReducer(s2, { type: 'COMBAT_DEFENSE_CHOICE', key: 'OLD', accept: true } as Action, rng)
  check('a stale key is refused', stale.state.combat?.defenderAuto === null)
}

console.log('\n— dice post once per side per round; the attacker never waits —')
{
  const { state: s1 } = gameReducer(base(), offer(), rng)
  // The attacker rolls first — no defense dice exist yet.
  const { state: s2 } = gameReducer(s1, { type: 'POST_COMBAT_DICE', key: 'k1', round: 1, side: 'atk', dice: [6, 4, 2] } as Action, rng)
  check('the attacker posts without waiting', JSON.stringify(s2.combat?.atkDice) === '[6,4,2]' && s2.combat?.defDice === null)
  const { state: s3 } = gameReducer(s2, { type: 'POST_COMBAT_DICE', key: 'k1', round: 1, side: 'def', dice: [5, 3] } as Action, rng)
  check('the defense lands beside it', JSON.stringify(s3.combat?.defDice) === '[5,3]')
  check('the defense is marked as the defender\'s own roll', s3.combat?.defDiceBy === 'defender')

  const rerollA = gameReducer(s3, { type: 'POST_COMBAT_DICE', key: 'k1', round: 1, side: 'atk', dice: [6, 6, 6] } as Action, rng)
  check('a second attacker post is refused — the roll stands', JSON.stringify(rerollA.state.combat?.atkDice) === '[6,4,2]')
  const wrongRound = gameReducer(s3, { type: 'POST_COMBAT_DICE', key: 'k1', round: 2, side: 'atk', dice: [1] } as Action, rng)
  check('a wrong round number is refused', wrongRound.state === s3)
  const garbage = gameReducer(s1, { type: 'POST_COMBAT_DICE', key: 'k1', round: 1, side: 'atk', dice: [99, -3, 'six', 4] } as Action, rng)
  check('garbage dice clamp into 1–6, at most 3',
    JSON.stringify(garbage.state.combat?.atkDice) === '[6,1,1]', JSON.stringify(garbage.state.combat?.atkDice))

  // Idle fallback: the attacker's machine rolled for a sleeping defender.
  const { state: idle } = gameReducer(s2, { type: 'POST_COMBAT_DICE', key: 'k1', round: 1, side: 'def', dice: [2, 2], by: 'attacker-idle' } as Action, rng)
  check('an idle roll is labelled as such', idle.combat?.defDiceBy === 'attacker-idle')

  const { state: s4 } = gameReducer(s3, { type: 'COMBAT_NEXT_ROUND', key: 'k1', round: 1 } as Action, rng)
  check('the next round clears both slots', s4.combat?.round === 2 && s4.combat.atkDice === null && s4.combat.defDice === null)
  const staleAdvance = gameReducer(s4, { type: 'COMBAT_NEXT_ROUND', key: 'k1', round: 1 } as Action, rng)
  check('a duplicate advance is refused', staleAdvance.state.combat?.round === 2)
}

console.log('\n— the session dies with the battle —')
{
  const { state: s1 } = gameReducer(base(), offer(), rng)
  const resolved = gameReducer(s1, {
    type: 'RESOLVE_COMBAT', srcId: 'src', tgtId: 'tgt',
    totalAtkLoss: 1, totalDefLoss: 4, captured: true, troopsToAdvance: 2,
    entryCostTotal: 0, entryCostFalloutHalf: false, defenderCloningBonus: 0,
  } as Action, rng)
  check('RESOLVE_COMBAT closes it', resolved.state.combat === null)
  const retreated = gameReducer(s1, { type: 'RETREAT' } as Action, rng)
  check('RETREAT closes it', retreated.state.combat === null)
  const ended = gameReducer(s1, { type: 'END_TURN', endTerritories: {} } as Action, rng)
  check('END_TURN closes it', ended.state.combat === null)
  const cleared = gameReducer(s1, { type: 'CLEAR_COMBAT' } as Action, rng)
  check('CLEAR_COMBAT closes it', cleared.state.combat === null)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
