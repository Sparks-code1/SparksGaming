import { readFileSync } from 'node:fs'
import { careerWins, hasSignedBoard, campaignHasSignature, consolationStar, earnedStars, redStarTotal } from '@/lib/redStars'
import type { LegacyState } from '@/types/legacy'
import type { Territory } from '@/types/territory'
// THE CONSOLATION STAR (confirmed 2026-09-07): every player who has yet to
// sign the board holds one red star for the game. A signature brings a
// missile at every game start instead, so the unsigned start on two — their
// HQ and this — and the table is even. It is a fact about the record, not a
// stored token: nothing grants it, nothing zeroes it, and the game after a
// player first wins it is simply not there.
//
// COUNTED ONCE. A second implementation wrote the same star into
// `purchasedStars` at the start of every game from the second on, and for two
// days both applied: Grant took a second HQ on turn one of game 3 and the
// board declared him the winner on three of the four stars the table could
// see (2026-09-09). The writer is gone; `consolationStar` is the whole rule.
//
// AND ONLY OPPOSITE A MISSILE. In game one nobody has signed, so nobody draws
// a missile — and nobody draws a star either, or every faction would start on
// two and the first game would be a race to two more.
let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`}`)
}
const bare = (src: string) => src.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}/g, '')
const legacy = (o: Record<string, unknown>) => ({ historyLog: [], victoryLog: [], roster: [], ...o }) as unknown as LegacyState
/** A campaign somebody has already won — the state every game after the first is in. */
const played = (o: Record<string, unknown> = {}) => legacy({
  ...o,
  playerWins: { winner: 1, ...(o.playerWins as Record<string, number> ?? {}) },
})
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

console.log('\n— a board nobody has signed —')
{
  check('game one: no signature anywhere', campaignHasSignature(legacy({})), false)
  check('...so nobody carries a consolation star', consolationStar(legacy({}), 'p1'), 0)
  check('...and a faction on its own HQ starts on one, not two',
    redStarTotal(legacy({}), 'p1', map(['alaska', 'p1', 'p1'])), 1)
  check('a win recorded anywhere opens it', campaignHasSignature(played()), true)
  check('...a victory log alone opens it too',
    campaignHasSignature(legacy({ victoryLog: [{ gameNumber: 1, winnerPlayerId: 'p2', winnerName: 'Hugh', winCondition: 'stars' }] })), true)
  check('...and a log of nothing does not', campaignHasSignature(legacy({ playerWins: { p1: 0 }, victoryLog: [] })), false)
  check('nothing at all does not throw', [campaignHasSignature(null), consolationStar(undefined, 'p1')], [false, 0])
}

console.log('\n— the star itself —')
{
  check('one for the unsigned', consolationStar(played(), 'p1'), 1)
  check('none for the signed', consolationStar(played({ playerWins: { p1: 2 } }), 'p1'), 0)
  check('the earned ledger is separate', earnedStars(played({ purchasedStars: { p1: 2 } }), 'p1'), 2)
}

console.log('\n— the total: HQ + earned + consolation —')
{
  const board = map(['alaska', 'p1', 'p1'], ['peru', 'p1', 'p2'], ['china', 'p2', null], ['japan', 'p2', 'p3'])
  check('an unsigned player on their own HQ starts on two', redStarTotal(played(), 'p1', map(['alaska', 'p1', 'p1'])), 2)
  check('a signed player on their own HQ starts on one', redStarTotal(played({ playerWins: { p1: 1 } }), 'p1', map(['alaska', 'p1', 'p1'])), 1)
  check('two HQs held + one earned + unsigned = four, the win', redStarTotal(played({ purchasedStars: { p1: 1 } }), 'p1', board), 4)
  check('...the same player signed needs one more', redStarTotal(played({ purchasedStars: { p1: 1 }, playerWins: { p1: 1 } }), 'p1', board), 3)
  check('an award checks with the ledger it is about to store', redStarTotal(played({ purchasedStars: { p1: 1 } }), 'p1', board, 2), 5)
  check('a captured HQ counts for its holder, not its owner', redStarTotal(played({ playerWins: { p2: 1 } }), 'p2', board), 1)
  // THE GAME THAT ENDED WRONGLY, as the row recorded it: Grant held his own HQ
  // and the computer's, had bought nothing, and had not signed.
  check("Grant's three stars are three", redStarTotal(played(), 'p3',
    map(['north-africa', 'p3', 'p3'], ['great-britain', 'p3', 'p5'], ['venezuela', 'p2', 'p2'])), 3)
}

console.log('\n— one count, one writer —')
{
  const board = bare(readFileSync('src/components/GameBoard.tsx', 'utf8'))
  check('no board count adds HQ and purchased by hand any more',
    (board.match(/hqStars \+ purchased(After)?\b/g) ?? []).length + (board.match(/hqStars \+ target\b/g) ?? []).length, 0)
  check('the HUD count, the two victory watchers and the award checks route through redStarTotal',
    (board.match(/redStarTotal\(/g) ?? []).length >= 8, true)
  check('NOTHING writes the star into the stored ledger',
    /bonusPlayerIds|playerSignatureCount\(initialLegacy/.test(board), false)
  check('...and the only writes to purchasedStars are awards, purchases, repairs and the reset',
    (board.match(/purchasedStars: \{/g) ?? []).length <= 7, true)
  check('the game-start grant reads career wins the same way the star does', /const wins = careerWins\(prev, p\.id\)/.test(board), true)
  check('...and the log names who starts on two', /Consolation stars — one for each player yet to sign the board/.test(board), true)
  check('the legend explains the star', /No signature yet = /.test(board), true)
  check('...and the map under it still takes clicks — the wider legend covered Greenland (2026-09-07)',
    /gap: 16, pointerEvents: 'none' \}\}>[\s\S]{0,500}?No signature yet = /.test(board), true)
  const ai = bare(readFileSync('src/lib/ai.ts', 'utf8'))
  check('the AI counts through the same function', /export function playerRedStars\([^)]*\): number \{\s*return redStarTotal\(legacy, playerId, state\.territories\)/.test(ai), true)
}

console.log(pass ? '\nall consolation-star pins hold' : '\nFAILED')
process.exit(pass ? 0 : 1)
