// Spectator missiles: one die, one missile, first click wins, server's word.
//
// The window lives in REDUCER state (matches.state.combatWindow), so the same
// bytes run on the server and in the actor's optimistic apply. The edge
// function refuses an illegal spend BEFORE applying it — `spectatorMissileRefusal`
// is that gate, and a refusal means the missile was never charged. These
// asserts pin both halves, plus the version-CAS story that makes two missiles
// on one die impossible rather than merely unlikely.
import { gameReducer, createMathRng, spectatorMissileRefusal, type Action } from '@/lib/gameReducer'
import { battleMissileControls } from '@/lib/gameLogic'
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
  phase: 'attack', currentPlayerIndex: 0, turnNumber: 3,
  players: [
    { id: 'p1', name: 'Attacker', cards: [], isEliminated: false },
    { id: 'p2', name: 'Defender', cards: [], isEliminated: false },
    { id: 'p3', name: 'Watcher', cards: [], isEliminated: false },
  ] as never,
  territories: { src: terr('src', 'p1', 8), tgt: terr('tgt', 'p2', 3), home: terr('home', 'p3', 2) } as never,
  deck: [], discardPile: [], winnerId: null,
  legacySnapshot: {} as never, activeHqs: {},
  turn: initialTurnState(),
} as never)

const open = (over: object = {}): Action => ({
  type: 'OPEN_COMBAT_WINDOW', roundKey: 'src>tgt#3.1', srcId: 'src', tgtId: 'tgt',
  atkDice: [5, 3, 2], defDice: [4, 1], ...over,
} as Action)

const missile = (over: object = {}): Action => ({
  type: 'SPECTATOR_MISSILE', roundKey: 'src>tgt#3.1', side: 'def', dieIndex: 0, playerId: 'p3', ...over,
} as Action)

console.log('\n— the window opens with the round\'s dice —')
{
  const { state: s } = gameReducer(base(), open(), rng)
  check('the window is set', s.combatWindow?.roundKey === 'src>tgt#3.1')
  check('dice are held', JSON.stringify(s.combatWindow?.atkDice) === '[5,3,2]' && JSON.stringify(s.combatWindow?.defDice) === '[4,1]')
  check('no flips yet', s.combatWindow?.flips.length === 0)
  const junk = gameReducer(base(), open({ atkDice: [99, -2, 'x', 4, 4], defDice: [3] }), rng).state
  check('garbage dice clamp into 1–6, at most 3', JSON.stringify(junk.combatWindow?.atkDice) === '[6,1,1]')
}

console.log('\n— one missile turns exactly one die into a 6 —')
{
  const { state: s1 } = gameReducer(base(), open(), rng)
  const { state: s2, effects } = gameReducer(s1, missile(), rng)
  check('the targeted die is a 6', s2.combatWindow?.defDice[0] === 6)
  check('its neighbour is untouched', s2.combatWindow?.defDice[1] === 1)
  check('the attacker row is untouched', JSON.stringify(s2.combatWindow?.atkDice) === '[5,3,2]')
  check('the flip is recorded with its spender', s2.combatWindow?.flips[0]?.playerId === 'p3')
  check('the spend lands in the match ledger', s2.missileSpends?.p3 === 1)
  const eff = effects.find(e => e.kind === 'spectator-missile')
  check('an effect tells every screen', !!eff && (eff as { dieIndex: number }).dieIndex === 0)
}

console.log('\n— first click wins; different dice both land —')
{
  const { state: s1 } = gameReducer(base(), open(), rng)
  const { state: s2 } = gameReducer(s1, missile(), rng)
  // The same die again — the reducer refuses to double-apply even if the edge
  // gate were somehow bypassed.
  const { state: s3, effects } = gameReducer(s2, missile({ playerId: 'p2' }), rng)
  check('a second missile on the same die is a no-op', s3 === s2 || JSON.stringify(s3) === JSON.stringify(s2))
  check('and emits nothing', effects.length === 0)
  // A different die from another spectator applies cleanly.
  const { state: s4 } = gameReducer(s2, missile({ side: 'atk', dieIndex: 2 }), rng)
  check('a different die still flips', s4.combatWindow?.atkDice[2] === 6)
  check('both spends are on the ledger', s4.missileSpends?.p3 === 2)
}

console.log('\n— the refusal gate (what the edge function runs BEFORE charging) —')
{
  const { state: w } = gameReducer(base(), open(), rng)
  const ok = { legacyMissiles: 2, isAttacker: false }
  check('a legal spend passes', spectatorMissileRefusal(w, missile() as never, 'p3', ok) === null)
  check('no window → window-closed', spectatorMissileRefusal(base(), missile() as never, 'p3', ok) === 'window-closed')
  check('a stale round key → window-closed',
    spectatorMissileRefusal(w, missile({ roundKey: 'old#1' }) as never, 'p3', ok) === 'window-closed')
  check('an out-of-range die → bad-die',
    spectatorMissileRefusal(w, missile({ dieIndex: 5 }) as never, 'p3', ok) === 'bad-die')
  check('the ATTACKER is refused — their conversions have their own phase',
    spectatorMissileRefusal(w, missile() as never, 'p1', { ...ok, isAttacker: true }) === 'not-a-spectator')
  check('the DEFENDER fires like any spectator — missiles against the AI',
    spectatorMissileRefusal(w, missile() as never, 'p2', ok) === null)
  check('no missiles left → no-missiles',
    spectatorMissileRefusal(w, missile() as never, 'p3', { ...ok, legacyMissiles: 0 }) === 'no-missiles')

  const { state: taken } = gameReducer(w, missile(), rng)
  check('a claimed die → die-taken (the loser is refunded by never paying)',
    spectatorMissileRefusal(taken, missile() as never, 'p2', ok) === 'die-taken')
  check('the ledger counts against the campaign stock: 2 owned, 2 spent → no-missiles',
    spectatorMissileRefusal(
      { ...taken, missileSpends: { p3: 2 } }, missile({ dieIndex: 1 }) as never, 'p3', ok,
    ) === 'no-missiles')
}

console.log('\n— the window closes and cannot be reopened by accident —')
{
  const { state: s1 } = gameReducer(base(), open(), rng)
  const { state: s2 } = gameReducer(s1, { type: 'CLOSE_COMBAT_WINDOW', roundKey: 'src>tgt#3.1' } as Action, rng)
  check('CLOSE clears it', s2.combatWindow === null)
  // A stale CLOSE from the previous round must not slam a newer window.
  const { state: s3 } = gameReducer(s2, open({ roundKey: 'src>tgt#3.2' }), rng)
  const { state: s4 } = gameReducer(s3, { type: 'CLOSE_COMBAT_WINDOW', roundKey: 'src>tgt#3.1' } as Action, rng)
  check('a stale CLOSE is ignored', s4.combatWindow?.roundKey === 'src>tgt#3.2')

  // Battle resolution and turn end both sweep the window away.
  const { state: s5 } = gameReducer(s3, {
    type: 'RESOLVE_COMBAT', srcId: 'src', tgtId: 'tgt',
    totalAtkLoss: 0, totalDefLoss: 3, captured: true, troopsToAdvance: 2,
    entryCostTotal: 0, entryCostFalloutHalf: false, defenderCloningBonus: 0,
  } as Action, rng)
  check('RESOLVE_COMBAT clears the window', s5.combatWindow === null)
  const { state: s6 } = gameReducer(s3, { type: 'END_TURN', endTerritories: {} } as Action, rng)
  check('END_TURN clears the window', s6.combatWindow === null)
  check('but the spend ledger survives the battle',
    gameReducer(gameReducer(s3, missile({ roundKey: 'src>tgt#3.2' }), rng).state, {
      type: 'CLOSE_COMBAT_WINDOW', roundKey: 'src>tgt#3.2',
    } as Action, rng).state.missileSpends?.p3 === 1)
}

console.log('\n— the ledger folds into the campaign exactly once, at game end —')
{
  // The arithmetic finalizeAndReturnToLobby applies: campaign stock minus the
  // match ledger, floored at zero.
  const fold = (missiles: Record<string, number>, spends: Record<string, number>) =>
    Object.fromEntries(Object.entries(missiles).map(([pid, n]) => [pid, Math.max(0, n - (spends[pid] ?? 0))]))
  check('a spend comes off the stock', JSON.stringify(fold({ p3: 2, p2: 1 }, { p3: 1 })) === '{"p3":1,"p2":1}')
  check('the floor is zero even if counts drifted', fold({ p3: 1 }, { p3: 5 }).p3 === 0)
}

console.log('\n— the battle-side phase: whose missiles this screen may spend —')
{
  // The other half of the same rule, and the half that was wrong. The server
  // refuses the attacker from the WINDOW because the attacker has their own
  // phase — but that phase ran on the attacker's screen with the DEFENDER's
  // dice on it too, charged to the defender's stockpile. Test spent Ryan's
  // missiles for him, and Ryan never saw it offered.
  const hotseat = battleMissileControls({
    attackerMissiles: 2, defenderMissiles: 3, remoteHumanDefender: false })
  check('at one keyboard both players click their own dice here',
    hotseat.attacker === 2 && hotseat.defender === 3, JSON.stringify(hotseat))

  const online = battleMissileControls({
    attackerMissiles: 2, defenderMissiles: 3, remoteHumanDefender: true })
  check('online, the attacker spends only their own',
    online.attacker === 2, JSON.stringify(online))
  check('a remote human defender\'s missiles are not on this screen',
    online.defender === 0, JSON.stringify(online))

  // An AI defender has no screen of its own, so its missiles stay here — the
  // attacker's machine is the only machine that can play them at all.
  const vsAi = battleMissileControls({
    attackerMissiles: 0, defenderMissiles: 2, remoteHumanDefender: false })
  check('an AI defender still spends through the attacker\'s machine', vsAi.defender === 2)

  // …and with the defender's dice gone from this phase, a battle where ONLY
  // the defender holds missiles has no battle-side phase to open at all. It
  // goes straight to the window, which is where that defender fires.
  const onlyDefender = battleMissileControls({
    attackerMissiles: 0, defenderMissiles: 4, remoteHumanDefender: true })
  check('no phase to open when only the remote defender is armed',
    onlyDefender.attacker === 0 && onlyDefender.defender === 0, JSON.stringify(onlyDefender))

  check('negative counts never become clickable dice',
    battleMissileControls({ attackerMissiles: -1, defenderMissiles: -1, remoteHumanDefender: false })
      .attacker === 0)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
