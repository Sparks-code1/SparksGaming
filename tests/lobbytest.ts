// The lobby: one host, joiners who ready up, and exactly ONE start.
//
// Before this each machine ran its own setup screen and created its own match,
// so two people "starting the same game" produced two different games that knew
// nothing about each other. The rules below are what makes a hosted game a
// single object: who may sit down, when Start unlocks, and why it is refused.
import {
  lobbyReadiness, nextFreeSeat, seatRefusal, reconcileSeats, MIN_SEATS, MAX_SEATS,
  type LobbySeat,
} from '@/lib/lobby'
import { generateAiName, nextAiSeatName, AI_NAME_POOL } from '@/lib/aiNames'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

const human = (seat: number, playerId: string, name: string, ready: boolean, userId = `u-${playerId}`): LobbySeat =>
  ({ seat, playerId, userId, name, factionId: 'unassigned', isAI: false, aiDifficulty: null, ready })
const ai = (seat: number, playerId: string, name = 'Computer'): LobbySeat =>
  ({ seat, playerId, userId: null, name, factionId: 'unassigned', isAI: true, aiDifficulty: 'medium', ready: true })

// ─── 1. Waiting for people to arrive ──────────────────────────────────────
console.log('--- the host is waiting ---')
{
  // Host has opened a 3-human game and is alone in it.
  const r = lobbyReadiness({ humanSlots: 3, seats: [human(0, 'p1', 'Ryan', true)] })
  check('cannot start with empty seats', r.canStart, false)
  check('and says how many are missing', r.reason, 'Waiting for 2 more players to join')
  check('counts what is there', [r.humansSeated, r.humansExpected, r.waitingFor], [1, 3, 2])

  const one = lobbyReadiness({ humanSlots: 2, seats: [human(0, 'p1', 'Ryan', true)] })
  check('one missing is singular, not "1 more players"',
    one.reason, 'Waiting for 1 more player to join')
}

// ─── 2. Waiting for people to be ready ────────────────────────────────────
console.log('\n--- everyone has arrived, not everyone is ready ---')
{
  const seats = [human(0, 'p1', 'Ryan', true), human(1, 'p2', 'Chris', false), human(2, 'p3', 'Ana', false)]
  const r = lobbyReadiness({ humanSlots: 3, seats })
  check('a full lobby is still not a ready one', r.canStart, false)
  check('and names who is holding it up', r.reason, 'Waiting for Chris, Ana to be ready')
  check('ready count is tracked', [r.humansReady, r.humansSeated], [1, 3])

  seats[1] = { ...seats[1], ready: true }
  check('one more to go',
    lobbyReadiness({ humanSlots: 3, seats }).reason, 'Waiting for Ana to be ready')

  seats[2] = { ...seats[2], ready: true }
  const go = lobbyReadiness({ humanSlots: 3, seats })
  check('everyone ready unlocks Start', go.canStart, true)
  check('with nothing left to report', go.reason, null)
  check('everyoneReady agrees', go.everyoneReady, true)
}

// ─── 3. AI seats need nobody ──────────────────────────────────────────────
console.log('\n--- computer players ---')
{
  const r = lobbyReadiness({ humanSlots: 1, seats: [human(0, 'p1', 'Ryan', true), ai(1, 'p2'), ai(2, 'p3')] })
  check('a solo host with two AI can start', r.canStart, true)
  check('AI are counted as seats', [r.aiSeats, r.totalSeats], [2, 3])
  check('but not as people to wait for', r.waitingFor, 0)

  // AI must not be able to satisfy a human seat that nobody has taken.
  const short = lobbyReadiness({ humanSlots: 2, seats: [human(0, 'p1', 'Ryan', true), ai(2, 'p3')] })
  check('an AI does not fill a human seat', short.canStart, false)
  check('and the wait is still reported', short.reason, 'Waiting for 1 more player to join')
}

// ─── 4. The board's limits ────────────────────────────────────────────────
console.log('\n--- table size ---')
{
  check('one player is not a game',
    lobbyReadiness({ humanSlots: 1, seats: [human(0, 'p1', 'Ryan', true)] }).reason,
    `A game needs at least ${MIN_SEATS} players`)
  check('six will not fit',
    lobbyReadiness({ humanSlots: 6, seats: [human(0, 'p1', 'R', true)] }).reason,
    `A game holds at most ${MAX_SEATS} players`)
  check('five is fine', lobbyReadiness({
    humanSlots: 5,
    seats: [0, 1, 2, 3, 4].map(i => human(i, `p${i + 1}`, `P${i}`, true)),
  }).canStart, true)

  // Two people racing into the last seat is a real possibility; the readiness
  // check must notice rather than starting a six-player game.
  check('more joiners than seats is refused', lobbyReadiness({
    humanSlots: 2,
    seats: [human(0, 'p1', 'A', true), human(1, 'p2', 'B', true), human(2, 'p3', 'C', true)],
  }).reason, 'More players have joined than there are seats')
}

// ─── 5. Who may take which seat ───────────────────────────────────────────
console.log('\n--- sitting down ---')
{
  const seats = [human(0, 'p1', 'Ryan', true, 'u-ryan'), human(1, 'p2', 'Chris', false, 'u-chris')]

  check('a free name in a lobby with room is allowed',
    seatRefusal(seats, 'p3', 'u-ana', 3), null)
  check('a name someone else is playing is refused',
    seatRefusal(seats, 'p2', 'u-ana', 3), 'Somebody has already taken that name in this game')
  check('you cannot take a second seat',
    seatRefusal(seats, 'p3', 'u-chris', 3), 'You are already in this game as p2')
  check('re-taking your OWN seat is allowed — it is a rename, not a new seat',
    seatRefusal(seats, 'p2', 'u-chris', 3), null)
  check('a full game refuses a newcomer',
    seatRefusal(seats, 'p3', 'u-ana', 2), 'This game is full')
  check('but someone already seated is not blocked by fullness',
    seatRefusal(seats, 'p1', 'u-ryan', 2), null)

  // AI occupy seats but must not count against the human capacity check.
  const withAi = [...seats, ai(2, 'p3')]
  check('an AI seat does not make the game full to a human',
    seatRefusal(withAi, 'p4', 'u-ana', 3), null)
}

// ─── 6. Seat numbering ────────────────────────────────────────────────────
console.log('\n--- seat allocation ---')
{
  check('the first seat of an empty lobby', nextFreeSeat([]), 0)
  check('the next one along', nextFreeSeat([{ seat: 0 }]), 1)
  check('gaps are reused — somebody left',
    nextFreeSeat([{ seat: 0 }, { seat: 2 }]), 1)
  check('a full table has no free seat',
    nextFreeSeat([0, 1, 2, 3, 4].map(seat => ({ seat }))), MAX_SEATS)
}

// ─── 7. Names become identities only at Start ─────────────────────────────
console.log('\n--- reconciling seats onto the roster ---')
{
  // The campaign so far: a founder and one past player, plus an old AI.
  const roster = [
    { id: 'p1', name: 'Ryan', joinedInGame: 1, userId: 'u-ryan' },
    { id: 'p2', name: 'Chris', joinedInGame: 1, userId: 'u-chris' },
    { id: 'p3', name: 'Hard', joinedInGame: 1 },
  ] as any

  // A lobby: both humans, the old AI typed back in, and a brand-new AI.
  const seats = [
    { seat: 0, name: 'Ryan', userId: 'u-ryan', isAI: false, aiDifficulty: null },
    { seat: 1, name: 'Chris', userId: 'u-chris', isAI: false, aiDifficulty: null },
    { seat: 2, name: 'hard', userId: null, isAI: true, aiDifficulty: 'hard' as const },
    { seat: 3, name: 'General Vex', userId: null, isAI: true, aiDifficulty: 'easy' as const },
  ]
  const rec = reconcileSeats(seats, roster)
  check('a full table reconciles', rec.ok, true)
  check('humans are matched by ACCOUNT, not by name',
    rec.resolved.filter(r => !r.isAI).map(r => r.playerId), ['p1', 'p2'])
  check('typing an old AI name brings back its identity, case and all',
    rec.resolved[2], { seat: 2, playerId: 'p3', name: 'Hard', isAI: true, aiDifficulty: 'hard', userId: null })
  check('a new AI gets the next free id', rec.resolved[3].playerId, 'p4')
  check('and is queued for the roster', rec.aiToAdd, [{ name: 'General Vex', difficulty: 'easy' }])

  // A human the roster has never heard of means a join that never saved —
  // refuse with their name, never invent an identity for them.
  const stranger = reconcileSeats(
    [{ seat: 0, name: 'Zed', userId: 'u-zed', isAI: false, aiDifficulty: null }], roster)
  check('an unknown human is refused by name', stranger.ok, false)
  check('and the reason says who', /Zed/.test(stranger.reason ?? ''), true)

  // Two new AI must get two DIFFERENT ids — the simulation has to grow.
  const twoNew = reconcileSeats([
    { seat: 0, name: 'Ryan', userId: 'u-ryan', isAI: false, aiDifficulty: null },
    { seat: 1, name: 'Vex', userId: null, isAI: true, aiDifficulty: null },
    { seat: 2, name: 'Krieg', userId: null, isAI: true, aiDifficulty: null },
  ], roster)
  check('two new AI take consecutive free ids',
    twoNew.resolved.filter(r => r.isAI).map(r => r.playerId), ['p4', 'p5'])

  // A fifth new name on a full roster has nowhere to go.
  const fullRoster = ['a', 'b', 'c', 'd', 'e'].map((n, i) =>
    ({ id: `p${i + 1}`, name: n, joinedInGame: 1, userId: i === 0 ? 'u-a' : undefined })) as any
  const overflow = reconcileSeats([
    { seat: 0, name: 'a', userId: 'u-a', isAI: false, aiDifficulty: null },
    { seat: 1, name: 'Newcomer', userId: null, isAI: true, aiDifficulty: null },
  ], fullRoster)
  check('a full roster refuses a new AI name', overflow.ok, false)
  check('and suggests the way out', /rename Newcomer/.test(overflow.reason ?? ''), true)
}

// ─── 8. Generated AI names ────────────────────────────────────────────────
console.log('\n--- AI names ---')
{
  const first = generateAiName([], () => 0)
  check('a name comes from the themed pool', AI_NAME_POOL.includes(first as never), true)
  check('a taken name is never handed out',
    generateAiName([first], () => 0) !== first, true)
  check('taken-ness ignores case',
    generateAiName([first.toUpperCase()], () => 0) !== first, true)
  const all = [...AI_NAME_POOL]
  check('an exhausted pool falls back to numbering',
    generateAiName(all, () => 0), 'Computer 1')
  check('and the numbering itself never collides',
    generateAiName([...all, 'Computer 1'], () => 0), 'Computer 2')

  // The Admiral Hark bug: on a FULL roster a fresh pool name can never be
  // added, so it would be refused at Start. There, an AI seat must reuse a
  // free campaign identity instead.
  const fullRoster = [
    { name: 'Ryan', userId: 'u-ryan' }, { name: 'Chris', userId: 'u-chris' },
    { name: 'Hard' }, { name: 'Medium' }, { name: 'East' },
  ]
  check('a full roster reuses a free identity, not a fresh name',
    nextAiSeatName(fullRoster, ['Ryan', 'Chris'], 5, () => 0), 'Hard')
  check('identities already at the table are skipped',
    nextAiSeatName(fullRoster, ['Ryan', 'Chris', 'Hard'], 5, () => 0), 'Medium')
  check('claimed identities are never given to an AI',
    nextAiSeatName(fullRoster, ['Hard', 'Medium', 'East'], 5, () => 0) !== 'Ryan', true)
  check('a roster WITH room still generates from the pool',
    AI_NAME_POOL.includes(nextAiSeatName(fullRoster.slice(0, 3), ['Ryan', 'Chris'], 5, () => 0) as never), true)
  check('room is judged against names the table will ADD, not just size: '
    + 'four on the roster plus one new human at the table is full',
    nextAiSeatName(fullRoster.slice(0, 4), ['Ryan', 'Chris', 'Newcomer'], 5, () => 0), 'Hard')
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
