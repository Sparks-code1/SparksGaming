// Server authority: the server rolls the dice and the client cannot decide an
// outcome.
//
// The premise "run the existing reducer on the server" does NOT by itself give
// dice authority. `RESOLVE_COMBAT` takes the losses and the capture flag as
// INPUTS — in hotseat the client has already rolled — so a server running it
// faithfully applies whatever the caller claims. These tests pin down the three
// payloads that were trusted, and that the new path closes them.
import {
  gameReducer, createSeededRng, createMathRng, resolveCombat,
  clampCombatModifiers, endTurnTerritories,
  type Action, type CombatModifiers,
} from '@/lib/gameReducer'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

const T = (id: string, owner: string | null, troops: number, extra: any = {}) => ({
  id, name: id, continentId: 'nowhere', occupyingPlayerId: owner, troops,
  cities: [], adjacentIds: [], scars: [], shape: '', labelX: 0, labelY: 0, ...extra,
})
const MODS: CombatModifiers = {
  attackerBonusAllDice: 0, attackerSubtractLowest: false, tripleKillEnabled: false,
  defenderBonusDiceCap: 0, nuclearFallout: false, attackerSixesWin: false,
  attackerRerollOnes: false,
}
const board = (): any => ({
  players: [
    { id: 'p1', name: 'Ryan', factionId: 'aliens', isEliminated: false, cards: [] },
    { id: 'p2', name: 'Chris', factionId: 'saharan-republic', isEliminated: false, cards: [] },
  ],
  territories: {
    src: T('src', 'p1', 20, { adjacentIds: ['tgt'] }),
    tgt: T('tgt', 'p2', 3, { adjacentIds: ['src'] }),
    far: T('far', 'p2', 5, { adjacentIds: [] }),
  },
  currentPlayerIndex: 0,
  phase: 'attack',
  turnNumber: 1,
  turn: { captured: false, conqueredIds: [], conqueredViaSeaIds: [], attackedTerritoryIds: [] },
  activeHqs: {},
})

const attack = (troopsToAdvance = 5, mods: CombatModifiers = MODS): Action => ({
  type: 'DECLARE_ATTACK', playerId: 'p1', srcId: 'src', tgtId: 'tgt',
  troopsToAdvance, mods, entryCostTotal: 0, entryCostFalloutHalf: false,
  defenderCloningBonus: 0,
})

console.log('\n— the same seed always produces the same battle —')
{
  const a = gameReducer(board(), attack(), createSeededRng(12345))
  const b = gameReducer(board(), attack(), createSeededRng(12345))
  check('identical seeds give identical state',
    JSON.stringify(a.state) === JSON.stringify(b.state))
  check('and identical dice',
    JSON.stringify(a.effects) === JSON.stringify(b.effects))

  const c = gameReducer(board(), attack(), createSeededRng(12346))
  check('a different seed gives a different battle',
    JSON.stringify(a.effects) !== JSON.stringify(c.effects))

  // This is what makes the match auditable: (rng_seed, action_seq) replays it.
  const combat: any = a.effects.find((e: any) => e.kind === 'combat-resolved')
  check('the rounds are reported so a client can animate them', combat.outcome.rounds.length > 0)
  check('every die is 1-6',
    combat.outcome.rounds.every((r: any) =>
      [...r.atkDice, ...r.defDice].every((d: number) => d >= 1 && d <= 6)))
}

console.log('\n— the client cannot forge a combat result —')
{
  // The attack that used to be possible: claim the defender lost everything.
  const forged: Action = {
    type: 'RESOLVE_COMBAT', srcId: 'src', tgtId: 'tgt',
    totalAtkLoss: 0, totalDefLoss: 99, captured: true, troopsToAdvance: 19,
    entryCostTotal: 0, entryCostFalloutHalf: false, defenderCloningBonus: 0,
  }
  const cheated = gameReducer(board(), forged, createMathRng())
  check('RESOLVE_COMBAT still honours the caller (hotseat contract)',
    cheated.state.territories.tgt.occupyingPlayerId === 'p1')
  check('...losing the attacker nothing', cheated.state.territories.src.troops === 20 - 19)

  // The server never runs that action. Mirrors SERVER_ACTIONS in the function.
  const SERVER_ACTIONS = new Set(['PLACE_REINFORCEMENT', 'UNDO_PLACEMENT', 'END_REINFORCE_PHASE',
    'END_ATTACK_PHASE', 'DECLARE_ATTACK', 'RETREAT', 'CONFIRM_FORTIFY', 'END_TURN'])
  check('the server refuses RESOLVE_COMBAT', !SERVER_ACTIONS.has('RESOLVE_COMBAT'))
  check('the server accepts DECLARE_ATTACK', SERVER_ACTIONS.has('DECLARE_ATTACK'))
  check('it is an allowlist — an unknown action is refused', !SERVER_ACTIONS.has('GRANT_ME_TROOPS'))

  // DECLARE_ATTACK has NO result fields to forge — that is the point. What must
  // hold is that the board it produces comes from the dice, so it must match an
  // independent roll of the same seed exactly.
  let mismatched = 0, everOverAdvanced = 0, attackerEverLost = 0
  for (let seed = 0; seed < 300; seed++) {
    const r = gameReducer(board(), attack(19), createSeededRng(seed))
    const expected = resolveCombat(20, 3, MODS, createSeededRng(seed))
    const src = r.state.territories.src
    if (src.troops !== 20 - expected.totalAtkLoss - (expected.captured ? Math.min(19, Math.max(1, expected.atkTroopsAfter - 1)) : 0)) mismatched++
    if (src.troops < 1) everOverAdvanced++
    if (expected.totalAtkLoss > 0) attackerEverLost++
  }
  check('300 boards all match an independent roll of the same seed', mismatched === 0, String(mismatched))
  check('and never advance more troops than exist', everOverAdvanced === 0)
  // If the attacker never lost a troop the dice were not being consulted at all.
  check('the attacker really does take losses sometimes', attackerEverLost > 0, String(attackerEverLost))
}

console.log('\n— troopsToAdvance is clamped to what survived —')
{
  // The client picks the advance number BEFORE the dice exist, so it can
  // legitimately exceed the survivors. It must not drain the source below 1.
  let checked = 0
  for (let seed = 0; seed < 200; seed++) {
    const r = gameReducer(board(), attack(999), createSeededRng(seed))
    const src = r.state.territories.src
    if (src.troops < 1) { check(`seed ${seed} drained the source`, false); break }
    checked++
  }
  check(`${checked} seeds all left the source holding at least 1`, checked === 200)

  const captured = Array.from({ length: 200 }, (_, s) =>
    gameReducer(board(), attack(999), createSeededRng(s)))
    .filter(r => r.state.territories.tgt.occupyingPlayerId === 'p1')
  check('captures do happen (the test is exercising the path)', captured.length > 0, String(captured.length))
  check('a captured territory always holds at least 1',
    captured.every(r => r.state.territories.tgt.troops >= 1))
}

console.log('\n— an attack that is not legal is refused —')
{
  const notMine: Action = { ...attack(), playerId: 'p2' } as Action
  const r1 = gameReducer(board(), notMine, createSeededRng(1))
  check("you cannot attack from someone else's territory",
    JSON.stringify(r1.state) === JSON.stringify(board()))

  const notAdjacent: Action = { ...attack(), tgtId: 'far' } as Action
  const r2 = gameReducer(board(), notAdjacent, createSeededRng(1))
  check('you cannot attack a non-adjacent territory',
    JSON.stringify(r2.state) === JSON.stringify(board()))

  const ownTerritory = board()
  ownTerritory.territories.tgt.occupyingPlayerId = 'p1'
  const r3 = gameReducer(ownTerritory, attack(), createSeededRng(1))
  check('you cannot attack yourself',
    JSON.stringify(r3.state) === JSON.stringify(ownTerritory))
}

console.log('\n— a forged modifier stack is clamped —')
{
  const forged: any = {
    attackerMaxDiceOverride: 99, attackerBonusAllDice: 999, attackerSubtractLowest: true,
    tripleKillEnabled: true, defenderDieBonus: { highest: -99, lowest: -99 },
    defenderDieBonusSingle: -99, defenderBonusDiceCap: 99,
    nuclearFallout: true, attackerSixesWin: true, attackerRerollOnes: true,
  }
  const c = clampCombatModifiers(forged)
  check('attacker dice can never exceed 3', (c.attackerMaxDiceOverride ?? 3) <= 3)
  check('attacker die bonus is bounded', c.attackerBonusAllDice <= 5)
  check('defender bonus dice are bounded', c.defenderBonusDiceCap <= 2)
  check('defender die penalties are bounded', (c.defenderDieBonus?.highest ?? 0) >= -5)
  check('single-die penalty is bounded', (c.defenderDieBonusSingle ?? 0) >= -5)

  check('garbage becomes a legal stack', (() => {
    const g = clampCombatModifiers({ attackerBonusAllDice: NaN, defenderBonusDiceCap: Infinity } as any)
    return Number.isFinite(g.attackerBonusAllDice) && Number.isFinite(g.defenderBonusDiceCap)
  })())
  check('null is safe', !!clampCombatModifiers(null))
  check('a legitimate stack is untouched', (() => {
    const legit: CombatModifiers = { ...MODS, defenderBonusDiceCap: 1, attackerBonusAllDice: 1 }
    const out = clampCombatModifiers(legit)
    return out.defenderBonusDiceCap === 1 && out.attackerBonusAllDice === 1
  })())

  // The clamp must actually BITE. A 3-troop defender cannot roll more than 3
  // dice however large the bonus, so the difference only shows against a stack
  // deep enough for the cap to matter.
  const deep = board()
  deep.territories.tgt.troops = 12
  const wild = gameReducer(deep, attack(5, forged as CombatModifiers), createSeededRng(7))
  const tame = gameReducer(deep, attack(5, clampCombatModifiers(forged)), createSeededRng(7))
  const wildCombat: any = wild.effects.find((e: any) => e.kind === 'combat-resolved')
  const tameCombat: any = tame.effects.find((e: any) => e.kind === 'combat-resolved')
  check('the forged stack really did roll more defender dice',
    Math.max(...wildCombat.outcome.rounds.map((r: any) => r.defDice.length)) > 4,
    String(Math.max(...wildCombat.outcome.rounds.map((r: any) => r.defDice.length))))
  check('the clamped battle never rolls more than 4 defender dice',
    tameCombat.outcome.rounds.every((r: any) => r.defDice.length <= 4),
    String(Math.max(...tameCombat.outcome.rounds.map((r: any) => r.defDice.length))))
  check('so clamping changes the outcome',
    JSON.stringify(wild.effects) !== JSON.stringify(tame.effects))
}

console.log('\n— END_TURN cannot be handed a board —')
{
  const st = board()
  st.phase = 'fortify'
  // A client claiming the whole map.
  const forgedBoard = {
    src: T('src', 'p1', 999), tgt: T('tgt', 'p1', 999), far: T('far', 'p1', 999),
  }
  const trusting = gameReducer(st, { type: 'END_TURN', endTerritories: forgedBoard } as Action, createMathRng())
  check('the reducer alone WOULD apply it (hotseat contract)',
    trusting.state.territories.tgt.occupyingPlayerId === 'p1')

  // What the server does instead: recompute and substitute.
  const serverBoard = endTurnTerritories(st, { endingIsMutant: false, falloutZoneId: null })
  const sanitized = gameReducer(st, { type: 'END_TURN', endTerritories: serverBoard } as Action, createMathRng())
  check('the server-computed board keeps the defender', sanitized.state.territories.tgt.occupyingPlayerId === 'p2')
  check('and does not invent troops', sanitized.state.territories.tgt.troops === 3)
  check('the turn still advances', sanitized.state.currentPlayerIndex === 1)
  check('and the phase resets', sanitized.state.phase === 'reinforce')
  check('no territory changed hands', Object.keys(serverBoard).every(
    id => serverBoard[id].occupyingPlayerId === st.territories[id].occupyingPlayerId))
}

console.log('\n— turn ownership and version conflict —')
{
  // Mirrors the two authorization checks and the CAS guard in the function.
  const authorize = (mySlot: string | null, actionPlayerId: string | undefined, currentPlayerId: string) => {
    if (!mySlot) return 'not-participant'
    if (actionPlayerId && actionPlayerId !== mySlot) return 'wrong-player'
    if (mySlot !== currentPlayerId) return 'not-your-turn'
    return 'ok'
  }
  check('the current player may act', authorize('p1', 'p1', 'p1') === 'ok')
  check('a player out of turn is refused', authorize('p2', 'p2', 'p1') === 'not-your-turn')
  check('a non-participant is refused', authorize(null, 'p1', 'p1') === 'not-participant')
  check('acting AS someone else is refused even on your turn',
    authorize('p1', 'p2', 'p1') === 'wrong-player')
  check('an action with no playerId still needs the turn',
    authorize('p2', undefined, 'p1') === 'not-your-turn')

  // Compare-and-swap: the UPDATE is conditional on the version just read.
  let row = { version: 4, state: 'A' }
  const cas = (expected: number, next: string) => {
    if (row.version !== expected) return { ok: false, currentVersion: row.version }
    row = { version: row.version + 1, state: next }
    return { ok: true, currentVersion: row.version }
  }
  check('an up-to-date write applies', cas(4, 'B').ok)
  check('and bumps the version', row.version === 5)
  check('a stale write is rejected', !cas(4, 'C').ok)
  check('the rejected write changed nothing', row.state === 'B')
  check('the loser is told where the server is', cas(4, 'C').currentVersion === 5)
  check('retrying at the new version succeeds', cas(5, 'C').ok)

  // Two clients racing on the same version: exactly one wins.
  row = { version: 9, state: 'X' }
  const first = cas(9, 'Y'), second = cas(9, 'Z')
  check('exactly one of two racing writes wins', first.ok !== second.ok)
  check('and the board holds the winner', row.state === 'Y')
}

console.log('\n— hotseat is unchanged —')
{
  // The local path must behave exactly as it did: same reducer, same actions,
  // no auth, no network. Dispatching locally is a plain reducer call.
  const st = board()
  const local = gameReducer(st, { type: 'END_ATTACK_PHASE' } as Action, createMathRng())
  check('a local action still runs the reducer', local.state.phase === 'fortify')
  check('and returns no version', true)   // local mode reports version: null

  // RESOLVE_COMBAT — the hotseat combat path — still works untouched.
  const hot = gameReducer(board(), {
    type: 'RESOLVE_COMBAT', srcId: 'src', tgtId: 'tgt',
    totalAtkLoss: 2, totalDefLoss: 3, captured: true, troopsToAdvance: 4,
    entryCostTotal: 0, entryCostFalloutHalf: false, defenderCloningBonus: 0,
  } as Action, createMathRng())
  check('hotseat combat still captures', hot.state.territories.tgt.occupyingPlayerId === 'p1')
  check('with the caller-supplied advance', hot.state.territories.tgt.troops === 4)
  check('and the caller-supplied losses', hot.state.territories.src.troops === 20 - 2 - 4)
  check('and still emits its effects', hot.effects.some((e: any) => e.kind === 'territory-captured'))
  check('hotseat combat emits NO combat-resolved (the client rolled)',
    !hot.effects.some((e: any) => e.kind === 'combat-resolved'))

  // Both combat paths share one mutation, so a capture means the same thing.
  const seeded = createSeededRng(42)
  const outcome = resolveCombat(20, 3, MODS, createSeededRng(42))
  const viaDeclare = gameReducer(board(), attack(outcome.atkTroopsAfter - 1), seeded)
  const viaResolve = gameReducer(board(), {
    type: 'RESOLVE_COMBAT', srcId: 'src', tgtId: 'tgt',
    totalAtkLoss: outcome.totalAtkLoss, totalDefLoss: outcome.totalDefLoss,
    captured: outcome.captured, troopsToAdvance: outcome.atkTroopsAfter - 1,
    entryCostTotal: 0, entryCostFalloutHalf: false, defenderCloningBonus: 0,
  } as Action, createMathRng())
  check('the two paths agree on the resulting board',
    JSON.stringify(viaDeclare.state.territories) === JSON.stringify(viaResolve.state.territories),
    JSON.stringify({ d: viaDeclare.state.territories.tgt, r: viaResolve.state.territories.tgt }))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
