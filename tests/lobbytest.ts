// The lobby: one host, joiners who ready up, and exactly ONE start.
//
// Before this each machine ran its own setup screen and created its own match,
// so two people "starting the same game" produced two different games that knew
// nothing about each other. The rules below are what makes a hosted game a
// single object: who may sit down, when Start unlocks, and why it is refused.
import {
  lobbyReadiness, nextFreeSeat, seatRefusal, MIN_SEATS, MAX_SEATS,
  type LobbySeat,
} from '@/lib/lobby'

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

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
