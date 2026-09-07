import { readFileSync } from 'node:fs'
import {
  rebaseOntoKnown, withLegacyEditBase, adoptLegacyForTests, onLegacyLineage,
} from '@/lib/legacyApi'
import type { LegacyState } from '@/types/legacy'
// A save is an EDIT, not a copy.
//
// FIELD REPORT, 2026-09-07. The campaign row was repaired — game 1 closed,
// game 2 open, the bought star zeroed — and fifteen seconds later it read
// "game 1, in progress, star intact" again, five writes on. Every guard was
// green. A page's saves run one after another, and the copy behind each was
// captured when its updater ran: the first save's rebuild adopted the server's
// copy and moved the version; the second, built from the page's copy BEFORE
// that adoption, matched the new version and wrote the old copy whole.
//
// Now every save knows the copy it was derived from. One derived from the copy
// the page agrees with (or any descendant of it) is written whole, as before.
// One derived from a copy older than that has only its own edit written,
// replayed onto the agreed copy — decided when the save RUNS, not when it was
// queued, because it is the waiting save that goes stale.
let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`}`)
}
const bare = (src: string) => src.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}/g, '')
const ls = (o: Record<string, unknown>) => ({ historyLog: [], stickers: [], scars: [], ...o }) as unknown as LegacyState

console.log('\n— the production sequence, replayed —')
{
  // The page read the row: game 1 in progress, Hugh holding a bought star.
  const P0 = ls({ campaignId: 'c', currentGameNumber: 1, gameInProgress: true, purchasedStars: { p4: 1 }, worldName: 'W' })
  adoptLegacyForTests(P0)
  check('the copy the page read is on its lineage', onLegacyLineage(P0), true)

  // An updater derived the acting machine's board mirror from it.
  const P1 = withLegacyEditBase(P0, () => ({ ...P0, activeGameState: { turn: 1 } }) as LegacyState)
  check('a copy derived from the agreed copy joins the lineage', onLegacyLineage(P1), true)
  check('...and is written as it is', rebaseOntoKnown(P1, { from: P0 }) === P1, true)

  // The repair moved the row on: game 2, star zeroed. The page's first save was
  // refused, rebuilt, and the merged copy adopted.
  const S1 = ls({ campaignId: 'c', currentGameNumber: 2, gameInProgress: true, purchasedStars: {}, worldName: 'W', activeGameState: { turn: 1 } })
  adoptLegacyForTests(S1)
  check('the adoption starts the lineage over', [onLegacyLineage(P0), onLegacyLineage(P1), onLegacyLineage(S1)], [false, false, true])

  // The save queued from P1 before the adoption now runs.
  const P2 = { ...P1, activeGameState: { turn: 2 } } as LegacyState
  const written = rebaseOntoKnown(P2, { from: P1 })
  check('the waiting save carries its edit', (written as unknown as { activeGameState: unknown }).activeGameState, { turn: 2 })
  check('...and not the page\'s staleness: the game number stays repaired', written.currentGameNumber, 2)
  check('...and the zeroed star stays zeroed', written.purchasedStars, {})
  check('...on a new object built from the agreed copy', written !== P2 && written !== S1, true)

  // A caller that states its edit as a reapply has it applied to the agreed copy instead.
  const viaReapply = rebaseOntoKnown(P2, { from: P1, reapply: b => ({ ...b, worldName: 'X' }) })
  check('an explicit reapply is the edit', [viaReapply.worldName, viaReapply.currentGameNumber], ['X', 2])

  // Older callers that name no base are written as given, exactly as before.
  check('a save with no base is taken as given', rebaseOntoKnown(P2) === P2, true)

  // From the adopted copy on, saves are whole again.
  const S2 = withLegacyEditBase(S1, () => ({ ...S1, worldName: 'Y' }) as LegacyState)
  check('a copy derived from the adopted copy is on the lineage and written whole',
    [onLegacyLineage(S2), rebaseOntoKnown(S2, { from: S1 }) === S2], [true, true])
  const S3 = withLegacyEditBase(S2, () => ({ ...S2, worldName: 'Z' }) as LegacyState)
  check('...and so is its descendant', rebaseOntoKnown(S3, { from: S2 }) === S3, true)

  // A copy derived from a STALE copy through an updater does not join the lineage.
  const P3 = withLegacyEditBase(P1, () => ({ ...P1, worldName: 'stale' }) as LegacyState)
  check('a copy derived from a stale copy stays off the lineage', onLegacyLineage(P3), false)
  check('...so its save is rebased too', [rebaseOntoKnown(P3, { from: P1 }).worldName, rebaseOntoKnown(P3, { from: P1 }).currentGameNumber], ['stale', 2])
}

console.log('\n— the base is scoped to the updater —')
{
  const A = ls({ campaignId: 'd', worldName: 'a' })
  adoptLegacyForTests(A)
  let seenInside: LegacyState | null = null
  let seenOutside: LegacyState | null = null
  const nested = withLegacyEditBase(A, () => {
    const inner = withLegacyEditBase({ ...A, worldName: 'inner' } as LegacyState, () => 'x')
    seenInside = inner as unknown as LegacyState
    return { ...A, worldName: 'b' } as LegacyState
  })
  seenOutside = nested
  check('a nested updater returns its own value and restores the outer base', [seenInside, (seenOutside as LegacyState).worldName], ['x', 'b'])
  check('an updater that throws still restores the base',
    (() => { try { withLegacyEditBase(A, () => { throw new Error('boom') }) } catch { /* expected */ } return rebaseOntoKnown({ ...A, worldName: 'c' } as LegacyState) })().worldName, 'c')
}

console.log('\n— the wiring —')
{
  const api = bare(readFileSync('src/lib/legacyApi.ts', 'utf8'))
  check('the rebase runs when the save RUNS, inside performSave',
    /async function performSave\([\s\S]{0,600}?const based = rebaseOntoKnown\(state, opts\)/.test(api), true)
  check('...before the guarded write', api.indexOf('const based = rebaseOntoKnown(state, opts)') < api.indexOf(".eq('legacy_version', expected)"), true)
  check('saveLegacyState reads the base while the updater is still running',
    /const from = opts\?\.from \?\? editBase \?\? undefined/.test(api), true)
  check('a fresh read is adopted', /noteKnownState\(ls, 'adopted'\)/.test(api), true)
  check('a refused write adopts the server copy', /noteKnownState\(fresh, 'adopted'\); publishFreshLegacy\(fresh\)/.test(api), true)
  check('a rebuilt save is filed on the server line', (api.match(/return performSave\(merged, opts, attempt \+ 1, true\)/g) ?? []).length, 2)
  check('a rebased write is handed to the page', (api.match(/if \(rebased\) publishFreshLegacy\(state\)/g) ?? []).length, 2)

  const board = bare(readFileSync('src/components/GameBoard.tsx', 'utf8'))
  check('every board updater runs inside withLegacyEditBase',
    /const setLegacyState = useCallback\([\s\S]{0,400}?withLegacyEditBase\(prev, \(\) => update\(prev\)\)/.test(board), true)
  check('the board keeps no bare setter', /setLegacyStateRaw\(/.test(board) && !/const \[legacyState, setLegacyState\] = useState/.test(board), true)
  check('the value-set map actions name their base', (board.match(/saveLegacyState\(newLegacy, \{ from: legacyState \}\)/g) ?? []).length, 3)
  check('the ceremony writes name theirs', (board.match(/reapply: applyRewards, from: rewardsBase/g) ?? []).length, 2)
  check('the finalize names its fresh read', /saveLegacyState\(working, \{ reapply: applyFinalize, from: base \}\)/.test(board), true)

  const screen = bare(readFileSync('src/components/BetweenGameScreen.tsx', 'utf8'))
  check('the roster edits name their base', (screen.match(/saveLegacyState\(updated, \{ from: legacy \}\)/g) ?? []).length, 2)
  const win = bare(readFileSync('src/components/WinScreen.tsx', 'utf8'))
  check('the win screen names its base', /\{ reapply: cleanUp, from: legacy \}/.test(win), true)
}

console.log(pass ? '\nall rebase pins hold' : '\nFAILED')
process.exit(pass ? 0 : 1)
