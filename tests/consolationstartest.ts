import { readFileSync } from 'node:fs'
import { careerWins, hasSignedBoard, consolationStar, earnedStars, redStarTotal } from '@/lib/redStars'
import type { LegacyState } from '@/types/legacy'
import type { Territory } from '@/types/territory'
// THE CONSOLATION STAR (confirmed 2026-09-07): every player who has yet to
// sign the board holds one red star for the game. A signature brings a
// missile at every game start instead, so the unsigned start on two — their
// HQ and this — and the table is even. It is a fact about the record, not a
// stored token: nothing grants it, nothing zeroes it, and the game after a
// player first wins it is simply not there.
//
// The field for it existed from the first commit — typed as consolation
// TROOPS — and nothing ever wrote it. This is the first time the rule has
// been in the code.
let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`}`)
}
const bare = (src: string) => src.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}/g, '')
const legacy = (o: Record<string, unknown>) => ({ historyLog: [], victoryLog: [], roster: [], ...o }) as unknown as LegacyState
const map = (...ts: Array<[string, string, string | null]>): Record<string, Territory> =>
  Object.fromEntries(ts.map(([id, owner, hq]) => [id, { id, occupyingPlayerId: owner, activeHqPlayerId: hq, troops: 1 } as unknown as Territory]))

console.log('\n— who has signed the board —')
{
  check('a fresh campaign: nobody has', hasSignedBoard(legacy({}), 'p1'), false)
  check('a career win is a signature', hasSignedBoard(legacy({ playerWins: { p1: 1 } }), 'p1'), true)
  check('...and a win in the record counts on a campaign that predates playerWins',
    hasSignedBoard(legacy({ victoryLog: [{ gameNumber: 1, winnerPlayerId: 'p2', winnerName: 'Hugh', winCondition: 'stars' }] }), 'p2'), true)
  check('...for that player only', careerWins(legacy({ victoryLog: [{ gameNumber: 1, winnerPlayerId: 'p2', winnerName: 'Hugh', winCondition: 'stars' }] }), 'p1'), 0)
  check('an explicit zero in playerWins is a zero', hasSignedBoard(legacy({ playerWins: { p1: 0 } }), 'p1'), false)
}

console.log('\n— the star itself —')
{
  check('one for the unsigned', consolationStar(legacy({}), 'p1'), 1)
  check('none for the signed', consolationStar(legacy({ playerWins: { p1: 2 } }), 'p1'), 0)
  check('the earned ledger is separate', earnedStars(legacy({ purchasedStars: { p1: 2 } }), 'p1'), 2)
}

console.log('\n— the total: HQ + earned + consolation —')
{
  const board = map(['alaska', 'p1', 'p1'], ['peru', 'p1', 'p2'], ['china', 'p2', null], ['japan', 'p2', 'p3'])
  check('an unsigned player on their own HQ starts on two', redStarTotal(legacy({}), 'p1', map(['alaska', 'p1', 'p1'])), 2)
  check('a signed player on their own HQ starts on one', redStarTotal(legacy({ playerWins: { p1: 1 } }), 'p1', map(['alaska', 'p1', 'p1'])), 1)
  check('two HQs held + one earned + unsigned = four, the win', redStarTotal(legacy({ purchasedStars: { p1: 1 } }), 'p1', board), 4)
  check('...the same player signed needs one more', redStarTotal(legacy({ purchasedStars: { p1: 1 }, playerWins: { p1: 1 } }), 'p1', board), 3)
  check('an award checks with the ledger it is about to store', redStarTotal(legacy({ purchasedStars: { p1: 1 } }), 'p1', board, 2), 5)
  check('a captured HQ counts for its holder, not its owner', redStarTotal(legacy({ playerWins: { p2: 1 } }), 'p2', board), 1)
}

console.log('\n— one count, everywhere —')
{
  const board = bare(readFileSync('src/components/GameBoard.tsx', 'utf8'))
  check('no board count adds HQ and purchased by hand any more',
    (board.match(/hqStars \+ purchased(After)?\b/g) ?? []).length + (board.match(/hqStars \+ target\b/g) ?? []).length, 0)
  check('the HUD count, the two victory watchers and the award checks route through redStarTotal',
    (board.match(/redStarTotal\(/g) ?? []).length >= 8, true)
  check('the game-start grant reads career wins the same way the star does', /const wins = careerWins\(prev, p\.id\)/.test(board), true)
  check('...and the log names who starts on two', /Consolation stars — one for each player yet to sign the board/.test(board), true)
  check('the legend explains the star', /No signature yet = /.test(board), true)
  const ai = bare(readFileSync('src/lib/ai.ts', 'utf8'))
  check('the AI counts through the same function', /export function playerRedStars\([^)]*\): number \{\s*return redStarTotal\(legacy, playerId, state\.territories\)/.test(ai), true)
}

console.log(pass ? '\nall consolation-star pins hold' : '\nFAILED')
process.exit(pass ? 0 : 1)
