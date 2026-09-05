// A counter must be re-derived, not replayed.
//
// The refusal protocol rebuilds a losing write on top of whoever beat it, and
// for most of the campaign that is enough: lists merge by entry, maps merge by
// key, and replaying "this field now holds X" is right because X is a fact
// about one field.
//
// It is NOT right for arithmetic. "This player now has two missiles" is a claim
// about the whole campaign computed from a copy that has since moved on, and
// replaying it onto a newer row hands back whatever else changed. The four
// sites that did this were the Bringer's +2 bonus, the hotseat missile spend,
// the end-of-game ledger fold, and the campaign's game-number bump.
//
// Two of the rules were written out twice — the fold once per finalize path,
// the bump once in each — which is how the online copy of each gained a guard
// the offline copy did not. They live in gameLogic now and are checked here.
import { readFileSync } from 'node:fs'
import { foldMissileSpends, nextGameNumber } from '@/lib/gameLogic'

let pass = 0, fail = 0
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) { pass++; console.log(`  ok   ${label}`) }
  else {
    fail++
    console.log(`  FAIL ${label}\n         got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
  }
}

console.log('\n— the missile ledger folds back once —')
{
  check('spends are subtracted from the campaign counts',
    foldMissileSpends({ p1: 3, p2: 1 }, { p1: 2 }), { p1: 1, p2: 1 })
  check('a player who spent more than they had floors at zero',
    foldMissileSpends({ p1: 1 }, { p1: 4 }), { p1: 0 })
  check('an empty ledger leaves the counts exactly alone',
    foldMissileSpends({ p1: 3 }, {}), { p1: 3 })
  // A SPEND FOR SOMEBODY NOT IN THE COUNTS is not invented into existence —
  // the map is keyed by the campaign's players, and the ledger is match state.
  check('a spend for an unknown player adds no key',
    foldMissileSpends({ p1: 3 }, { ghost: 1 }), { p1: 3 })

  // NOT IDEMPOTENT, and deliberately so: the missiles are simply gone the
  // second time. The guard belongs to the caller, and both finalize paths key
  // it on a flag they set in the same write. This asserts the sharp edge is
  // still sharp, so nobody moves the guard out on the assumption it is safe.
  const once = foldMissileSpends({ p1: 3 }, { p1: 1 })
  check('applying the fold twice really does subtract twice',
    foldMissileSpends(once, { p1: 1 }), { p1: 1 })
}

console.log('\n— and the campaign advances exactly one game —')
{
  check('finishing the game you are on moves to the next', nextGameNumber(4, 4), 5)
  // THE BUG THIS REPLACED. `Math.max(current, finished) + 1` applied to a
  // campaign already past this game advanced it AGAIN, skipping a game — safe
  // only while nothing could re-run it, which handing it to `reapply` undoes.
  check('a campaign already past this game is left alone', nextGameNumber(5, 4), 5)
  check('...and applying it twice is the same as once',
    nextGameNumber(nextGameNumber(4, 4), 4), 5)
  // Still catches up: a bump lost once must not leave the campaign behind for
  // the rest of its life.
  check('a campaign left behind is brought forward', nextGameNumber(2, 4), 5)
}

// ── The wiring. The rules being right buys nothing if the sites do not use them.
console.log('\n— every counter site hands the save a way to rebuild —')
{
  const board = readFileSync('src/components/GameBoard.tsx', 'utf8')
  const win = readFileSync('src/components/WinScreen.tsx', 'utf8')

  // 1. The Bringer's +2. This effect has no dependency array and no authority
  //    gate, so it runs on EVERY machine — the one site of the four where two
  //    clients genuinely race.
  const bringerAt = board.indexOf('const grantBonus = (b: LegacyState): LegacyState =>')
  const bringer = bringerAt < 0 ? '' : board.slice(bringerAt, bringerAt + 900)
  check('the Bringer bonus is a function of the row',
    /\(\(b\.missiles \?\? \{\}\)\[bringer\.id\] \?\? 0\) \+ 2/.test(bringer), true)
  check('...idempotent by the game it was granted in',
    /if \(b\.bringerBonusMissilesGame === gameState\.gameNumber\) return b/.test(bringer), true)
  check('...and passed as the rebuild',
    board.includes('saveLegacyState(next, { reapply: grantBonus })'), true)

  // 2. The hotseat missile spend.
  const spendAt = board.indexOf('function spendMissile(playerId: string)')
  const spend = spendAt < 0 ? '' : board.slice(spendAt, spendAt + 700)
  check('a missile spend subtracts from the row', /\?\? 0\) - 1/.test(spend), true)
  check('...and is passed as the rebuild',
    /saveLegacyState\(next, \{ reapply: spend \}\)/.test(spend), true)

  // 3. The offline close-out. Its online twin already had this shape; the
  //    asymmetry was the bug.
  check('the offline close-out is a function of the row',
    board.includes('const closeOut = (b: LegacyState): LegacyState =>'), true)
  check('...guarded so the ledger cannot fold twice',
    /const closeOut[\s\S]{0,200}?if \(!b\.gameInProgress\) return b/.test(board), true)
  check('...and passed through to the save',
    board.includes('saveFinishedCampaign(completed, closeOut)'), true)

  // 4. The win screen's close-out.
  check('the win screen close-out is a function of the row',
    win.includes('const cleanUp = (b: LegacyState): LegacyState =>'), true)
  check('...and passed as the rebuild',
    win.includes('saveLegacyState(cleaned, { reapply: cleanUp })'), true)

  // AND THE OLD EXPRESSION IS GONE FROM BOTH PLACES. It is the one that skips a
  // game, and it read as obviously correct, which is why it survived twice.
  //
  // COMMENTS STRIPPED FIRST. The prose above describes the banned expression by
  // name, so a scan of the raw file matches the explanation and reports the bug
  // it is explaining. That has already cost this project one green pin over a
  // gutted branch; a rule about CODE has to be asked of code.
  const codeOnly = (s: string) => s.split('\n')
    .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n')
  check('nothing bumps the game number with max(...) + 1 any more',
    /Math\.max\([^)]*currentGameNumber[^)]*\) \+ 1/.test(codeOnly(board) + codeOnly(win)), false)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
