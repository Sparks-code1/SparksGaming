// Spectator missiles: one die, one missile, first click wins, server's word.
//
// The window lives in REDUCER state (matches.state.combatWindow), so the same
// bytes run on the server and in the actor's optimistic apply. The edge
// function refuses an illegal spend BEFORE applying it — `spectatorMissileRefusal`
// is that gate, and a refusal means the missile was never charged. These
// asserts pin both halves, plus the version-CAS story that makes two missiles
// on one die impossible rather than merely unlikely.
import { gameReducer, createMathRng, spectatorMissileRefusal, MISSILE_WINDOW_MS, type Action } from '@/lib/gameReducer'
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
  check('the claim is pledged, not yet charged',
    (s2.combatWindow?.claims ?? []).length === 1 && s2.missileSpends?.p3 === undefined)
  const closed = gameReducer(s2, { type: 'CLOSE_COMBAT_WINDOW', roundKey: 'src>tgt#3.1' } as Action, rng)
  check('the ledger is charged when the window closes', closed.state.missileSpends?.p3 === 1)
  const eff = effects.find(e => e.kind === 'spectator-missile')
  check('an effect tells every screen', !!eff && (eff as { dieIndex: number }).dieIndex === 0)
}

console.log('\n— two people, one die: priority decides, not reflexes —')
{
  // The table: p1 attacks p2, p3 watches. Attacker outranks defender outranks
  // everyone else in turn order after the attacker.
  const { state: s1 } = gameReducer(base(), open(), rng)
  const prio = s1.combatWindow?.priority ?? {}
  check('the attacker outranks everyone', prio.p1 === 0)
  check('then the defender', prio.p2 === 1)
  check('then the rest of the table', prio.p3 === 2)

  // p3 (a spectator) claims first; the ATTACKER claims the same die after.
  const { state: s2 } = gameReducer(s1, missile({ playerId: 'p3' }), rng)
  const { state: s3, effects } = gameReducer(s2, missile({ playerId: 'p1' }), rng)
  check('the later claim is still recorded', (s3.combatWindow?.claims ?? []).length === 2)
  check('and it is announced like any other', effects.length === 1)
  check('the die belongs to the attacker, who claimed it SECOND',
    s3.combatWindow?.flips.filter(f => f.side === 'def' && f.dieIndex === 0)[0]?.playerId === 'p1')
  check('the die still reads 6 — only the name on it changed',
    s3.combatWindow?.defDice[0] === 6)

  const done = gameReducer(s3, { type: 'CLOSE_COMBAT_WINDOW', roundKey: 'src>tgt#3.1' } as Action, rng)
  check('only the winner pays', done.state.missileSpends?.p1 === 1)
  check('the loser is charged nothing — it was never taken',
    done.state.missileSpends?.p3 === undefined)

  // Order does not matter: attacker first, spectator second, same outcome.
  const { state: r2 } = gameReducer(s1, missile({ playerId: 'p1' }), rng)
  const { state: r3 } = gameReducer(r2, missile({ playerId: 'p3' }), rng)
  check('claiming first buys nothing',
    r3.combatWindow?.flips.filter(f => f.dieIndex === 0)[0]?.playerId === 'p1')

  // The same player cannot claim one die twice.
  const { state: twice, effects: none } = gameReducer(s2, missile({ playerId: 'p3' }), rng)
  check('one missile per die per player', (twice.combatWindow?.claims ?? []).length === 1)
  check('and the repeat announces nothing', none.length === 0)

  // DIFFERENT dice are not contested at all — both go through, both are paid.
  const { state: d2 } = gameReducer(s1, missile({ playerId: 'p2', side: 'def', dieIndex: 0 }), rng)
  const { state: d3 } = gameReducer(d2, missile({ playerId: 'p1', side: 'atk', dieIndex: 2 }), rng)
  const dDone = gameReducer(d3, { type: 'CLOSE_COMBAT_WINDOW', roundKey: 'src>tgt#3.1' } as Action, rng)
  check('two missiles on two dice both land',
    d3.combatWindow?.defDice[0] === 6 && d3.combatWindow?.atkDice[2] === 6)
  check('and both are charged',
    dDone.state.missileSpends?.p1 === 1 && dDone.state.missileSpends?.p2 === 1)
}

console.log('\n— every missile buys the other side time to answer —')
{
  const t0 = 1_000_000
  const { state: s1 } = gameReducer(base(), open({ expiresAt: t0 + MISSILE_WINDOW_MS }), rng)
  check('the window carries a deadline every screen counts down to',
    s1.combatWindow?.expiresAt === t0 + MISSILE_WINDOW_MS)
  const { state: s2 } = gameReducer(s1, missile({ expiresAt: t0 + 9_000 }), rng)
  check('a missile pushes the deadline out', s2.combatWindow?.expiresAt === t0 + 9_000)
  const { state: s3 } = gameReducer(s2, missile({ playerId: 'p2', expiresAt: t0 + 1_000 }), rng)
  check('and never pulls it back in', s3.combatWindow?.expiresAt === t0 + 9_000)
  const { state: s4 } = gameReducer(s2, missile({ playerId: 'p2', expiresAt: t0 + 999_999 }), rng)
  check('a client cannot hold the battle open by naming a distant hour — one'
    + ' missile buys one window, no more',
    s4.combatWindow?.expiresAt === t0 + 9_000 + MISSILE_WINDOW_MS,
    String(s4.combatWindow?.expiresAt))
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
  check('the ATTACKER fires into the same window as everyone else',
    spectatorMissileRefusal(w, missile() as never, 'p1', { ...ok, isAttacker: true }) === null)
  check('so does the DEFENDER',
    spectatorMissileRefusal(w, missile() as never, 'p2', ok) === null)
  check('no missiles left → no-missiles',
    spectatorMissileRefusal(w, missile() as never, 'p3', { ...ok, legacyMissiles: 0 }) === 'no-missiles')

  const { state: taken } = gameReducer(w, missile(), rng)
  check('a die somebody ELSE claimed is open — priority will settle it',
    spectatorMissileRefusal(taken, missile() as never, 'p2', ok) === null)
  check('but claiming your own die twice is refused',
    spectatorMissileRefusal(taken, missile() as never, 'p3', ok) === 'die-taken')
  check('the ledger counts against the campaign stock: 2 owned, 2 spent → no-missiles',
    spectatorMissileRefusal(
      { ...taken, missileSpends: { p3: 2 } }, missile({ dieIndex: 1 }) as never, 'p3', ok,
    ) === 'no-missiles')
  check('a pledge in the open window counts too: 2 owned, 1 charged, 1 pledged',
    spectatorMissileRefusal(
      { ...taken, missileSpends: { p3: 1 } }, missile({ dieIndex: 1 }) as never, 'p3', ok,
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

console.log('\n— three missiles on one roll: what counts, and what does not —')
{
  // The Nuclear Milestone fires on three missiles in a single roll, and the
  // board counts them from this window's FLIPS. That count moved here when
  // the attacker's private missile phase went away online — three missiles
  // landed on one roll and nothing happened, because the old counter lived in
  // a phase that no longer runs.
  const { state: w } = gameReducer(base(), open(), rng)
  const three = [
    missile({ playerId: 'p3', side: 'def', dieIndex: 0 }),
    missile({ playerId: 'p2', side: 'atk', dieIndex: 1 }),
    missile({ playerId: 'p1', side: 'atk', dieIndex: 2 }),
  ].reduce((s, a) => gameReducer(s, a, rng).state, w)
  check('three missiles on three dice are three flips',
    (three.combatWindow?.flips ?? []).length === 3,
    JSON.stringify(three.combatWindow?.flips))
  check('and the third one names the bringer',
    three.combatWindow?.flips[2]?.playerId === 'p1')

  // Two people reaching for the SAME die is one missile landing, not two.
  // Counting claims instead of flips would call this a milestone.
  const contested = [
    missile({ playerId: 'p3', side: 'def', dieIndex: 0 }),
    missile({ playerId: 'p2', side: 'def', dieIndex: 0 }),
    missile({ playerId: 'p1', side: 'def', dieIndex: 0 }),
  ].reduce((s, a) => gameReducer(s, a, rng).state, w)
  check('three claims on ONE die are three claims…',
    (contested.combatWindow?.claims ?? []).length === 3)
  check('…but only one missile lands, so it is not a milestone',
    (contested.combatWindow?.flips ?? []).length === 1,
    JSON.stringify(contested.combatWindow?.flips))
  check('and the one that landed is the attacker\'s',
    contested.combatWindow?.flips[0]?.playerId === 'p1')
}

console.log('\n— one pile: missile powers spend from it too —')
{
  // A missile power (EMP and the rest) discards a missile to fire. That
  // discard used to come out of the campaign blob while battle missiles came
  // out of the match ledger — two piles for one stock, so the board could
  // offer a missile another pile had already spent.
  const { state: s1 } = gameReducer(base(), { type: 'SPEND_MISSILE', playerId: 'p1' } as Action, rng)
  check('the discard lands on the match ledger', s1.missileSpends?.p1 === 1)
  const { state: s2 } = gameReducer(s1, { type: 'SPEND_MISSILE', playerId: 'p1' } as Action, rng)
  check('a second discard adds to it', s2.missileSpends?.p1 === 2)
  const stranger = gameReducer(s2, { type: 'SPEND_MISSILE', playerId: 'nobody' } as Action, rng)
  check('a player who is not at this table spends nothing', stranger.state === s2)

  // And it is the same pile the window's refusal counts against.
  const { state: w } = gameReducer(s1, open(), rng)
  check('a discard counts against what is left to fire in a battle',
    spectatorMissileRefusal(w, missile({ playerId: 'p1' }) as never, 'p1',
      { legacyMissiles: 1 }) === 'no-missiles')
  check('…and someone who has spent nothing may still fire',
    spectatorMissileRefusal(w, missile({ playerId: 'p3' }) as never, 'p3',
      { legacyMissiles: 1 }) === null)
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
