// Two games were played in the Test8 campaign. Both were recorded as game 1.
//
// The cause was a lost bump: the campaign's currentGameNumber write was
// refused and rebuilt from a stale read (the pre-S36 clobber), so the second
// match's board opened still believing it was game 1. Its ceremony then
// stamped a second "g1" victory-log entry — and the session record, which
// names the winner by finding the entry for that game number, found the FIRST
// one and filed Test's win under ryan's name.
//
// These asserts pin both halves: the number a ceremony records, and the
// winner a finished game reports.
import { recordedGameNumber } from '@/lib/gameLogic'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

const entry = (gameNumber: number, winnerPlayerId: string) =>
  ({ gameNumber, winnerPlayerId })

// ─── 1. The ordinary campaign is untouched ──────────────────────────────────
console.log('--- a board with a number nobody has won keeps it ---')
{
  check('first game of a fresh campaign', recordedGameNumber(1, [], 'p1'), 1)
  check('game 2 after p1 won game 1',
    recordedGameNumber(2, [entry(1, 'p1')], 'p2'), 2)
  check('log undefined (pre-roster campaign)',
    recordedGameNumber(3, undefined, 'p1'), 3)
}

// ─── 2. The stale board, as it happened ─────────────────────────────────────
console.log('--- a board still saying "game 1" after game 1 was won ---')
{
  const log = [entry(1, 'p1')]
  check('Test wins on a board that lost the bump',
    recordedGameNumber(1, log, 'p2'), 2)

  // And a stale board landing on a campaign that has moved further on.
  const after = [entry(1, 'p1'), entry(2, 'p2')]
  check('a stale game lands past the whole log, not just past the clash',
    recordedGameNumber(1, after, 'p3'), 3)
}

// ─── 3. The winner's own number is never moved out from under them ──────────
// This is the constraint that decides the rule, and it is not hypothetical:
// every runner-up's reward slice opens AFTER the winner publishes their
// victory entry, on a legacy that already contains it, with `winner` set to
// that same winner. Numbering by "one past everything logged" would push
// those slices to a game nobody played, and stamp each runner-up's minor city
// with it. Ownership is what holds them on the real game.
console.log('--- the winner keeps their own number ---')
{
  const log = [entry(1, 'p1')]
  check('a runner-up slice for p1\'s win stays on game 1',
    recordedGameNumber(1, log, 'p1'), 1)
  // The same reason a reconnect that re-adopts the ceremony does not invent
  // a game.
  check('re-adopting is still the same game', recordedGameNumber(1, log, 'p1'), 1)
}

// ─── 4. Pre-roster entries count as taken ───────────────────────────────────
console.log('--- an entry with no roster id cannot be claimed ---')
{
  const log = [{ gameNumber: 1 }]
  check('unowned game 1 blocks a second game 1',
    recordedGameNumber(1, log, 'p1'), 2)
}

// ─── 5. The winner lookup that named the wrong player ───────────────────────
// GameBoard's finalize reads the winner's signature back out of the log. With
// two entries sharing a number, find-by-number returns the first — ryan.
// Matching the winner ID is what makes it Test's name.
console.log('--- naming the winner of a game whose number repeats ---')
{
  const log = [
    { gameNumber: 1, winnerPlayerId: 'p1', winnerName: 'ryan' },
    { gameNumber: 1, winnerPlayerId: 'p2', winnerName: 'Test' },
  ]
  const byNumberOnly = log.find(v => v.gameNumber === 1)?.winnerName
  check('the old lookup, reproducing the bug', byNumberOnly, 'ryan')

  const pick = (winnerId: string, gameNumber: number) =>
    ([...log].reverse().find(v => v.winnerPlayerId === winnerId && v.gameNumber === gameNumber)
      ?? [...log].reverse().find(v => v.winnerPlayerId === winnerId)
      ?? [...log].reverse().find(v => v.gameNumber === gameNumber))?.winnerName ?? null
  check('Test\'s win reports Test', pick('p2', 1), 'Test')
  check('ryan\'s win still reports ryan', pick('p1', 1), 'ryan')
  // A winner whose entry was renumbered underneath them is still found.
  check('id match wins over a stale number', pick('p2', 9), 'Test')
}

// ─── 6. The campaign advance never goes backwards ───────────────────────────
// finalize sets currentGameNumber to max(current, justPlayed) + 1. A campaign
// stuck one behind heals on the next ceremony instead of staying behind
// forever.
console.log('--- the campaign advance ---')
{
  const advance = (current: number, played: number) => Math.max(current, played) + 1
  check('normal advance', advance(1, 1), 2)
  check('stuck campaign catches up to the game played', advance(1, 2), 3)
  check('a campaign ahead of a stale board is not pulled back', advance(3, 1), 4)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES')
if (!pass) process.exit(1)
