// A seat nobody can play.
//
// Game 4 of the Test8 campaign went online with Marshal Krieg, Warlord Osk and
// Praetor Volk seated as HUMANS. They hold no account, and the server accepts
// an action only from the account holding the seat — so nobody could act for
// them: not their "owner", who does not exist, and not the host, who is
// refused. The game stopped the first time the turn reached one, and to the
// table it looked like a player who would not move.
//
// The rule below is an invariant of online play, and it is checked in both
// places that decide it: the board the AI driver reads, and the seat rows the
// server reads. They must agree, or the game is stuck in a different way.
import { isComputerSeat, seatsFromGameState } from '@/lib/onlineMatch'
import type { GameState } from '@/types/game'
import type { LegacyState } from '@/types/legacy'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

// ─── 1. The rule ───────────────────────────────────────────────────────────
console.log('--- who plays this seat ---')
{
  check('online, no account -> the computer plays it',
    isComputerSeat({ online: true, markedAI: false, accountUserId: null }), true)
  check('online, an account -> a person plays it',
    isComputerSeat({ online: true, markedAI: false, accountUserId: 'u-1' }), false)
  check('marked AI is still AI even with an account attached',
    isComputerSeat({ online: true, markedAI: true, accountUserId: 'u-1' }), true)

  // Offline the rule does not apply: an unclaimed seat is somebody at the
  // keyboard, which is the whole of hotseat play.
  check('offline, no account -> a person at this keyboard',
    isComputerSeat({ online: false, markedAI: false, accountUserId: null }), false)
  check('offline, marked AI -> still AI',
    isComputerSeat({ online: false, markedAI: true, accountUserId: null }), true)
  check('an empty string is not an account',
    isComputerSeat({ online: true, accountUserId: '' }), true)
  check('an absent field is not an account',
    isComputerSeat({ online: true }), true)
}

// ─── 2. The seat rows written for a match ──────────────────────────────────
console.log('--- seats built from a board ---')
{
  const state = {
    players: [
      { id: 'p1', name: 'ryan', factionId: 'bear', isAI: false },
      { id: 'p2', name: 'Test', factionId: 'aliens', isAI: false },
      // The three that broke game 4: no account, not marked AI.
      { id: 'p3', name: 'Marshal Krieg', factionId: 'mechaniker', isAI: false },
      { id: 'p4', name: 'Warlord Osk', factionId: 'khan', isAI: false },
      { id: 'p5', name: 'Praetor Volk', factionId: 'balkania', isAI: false },
    ],
  } as unknown as GameState
  const legacy = {
    roster: [
      { id: 'p1', name: 'ryan', joinedInGame: 1, userId: 'u-ryan' },
      { id: 'p2', name: 'Test', joinedInGame: 1, userId: 'u-test' },
      { id: 'p3', name: 'Marshal Krieg', joinedInGame: 1 },
      { id: 'p4', name: 'Warlord Osk', joinedInGame: 1 },
      { id: 'p5', name: 'Praetor Volk', joinedInGame: 1 },
    ],
  } as unknown as LegacyState

  const seats = seatsFromGameState(state, legacy)
  check('the accounts are seated as people',
    seats.filter(s => !s.isAI).map(s => s.playerId), ['p1', 'p2'])
  check('the accountless are seated as computers',
    seats.filter(s => s.isAI).map(s => s.playerId), ['p3', 'p4', 'p5'])
  check('a computer seat is given a difficulty to play at',
    seats.filter(s => s.isAI).every(s => !!s.aiDifficulty), true)
  check('a human seat is not', seats.find(s => s.playerId === 'p1')?.aiDifficulty, null)
  check('accounts are carried onto the seats',
    seats.map(s => s.userId), ['u-ryan', 'u-test', null, null, null])
  check('seat order follows the board (which is turn order)',
    seats.map(s => s.seat), [0, 1, 2, 3, 4])

  // A difficulty already chosen for an AI is not overwritten by the default.
  const withDiff = {
    players: [{ id: 'p3', name: 'Krieg', factionId: 'x', isAI: true, aiDifficulty: 'hard' }],
  } as unknown as GameState
  check('a chosen difficulty survives',
    seatsFromGameState(withDiff, legacy)[0].aiDifficulty, 'hard')
}

console.log(pass ? '\nALL PASS' : '\nFAILURES')
if (!pass) process.exit(1)
