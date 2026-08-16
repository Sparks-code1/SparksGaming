// A red star earned on one machine used to vanish at the next turn boundary.
//
// purchasedStars lives in the LEGACY blob, which has no live sync â€” every
// machine holds its own copy and writes the whole thing back. The CAS guard
// stopped the first clobber, then armed a later one: the refused machine
// adopted the winner's version NUMBER while keeping its stale CONTENT, so its
// next save was version-current and wrote the star straight back out. The
// other machine's autosave fires at every turn boundary, which is exactly
// when the star was seen to disappear.
//
// This suite pins the two rules that fix it, against the real award function:
//   1. a refused write leaves the loser holding the WINNER'S copy
//   2. an award re-applies itself onto that copy and goes again
import { awardRedStars } from '@/lib/legacyApi'
import type { LegacyState } from '@/types/legacy'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

const base = (): LegacyState => ({
  campaignId: 'c1', worldName: 'W', currentGameNumber: 3,
  historyLog: [], stickers: [], scars: [], dealtScars: [],
  removedCardIds: [], continentBonusModifiers: [], purchasedStars: {},
} as never)

const starsOf = (s: LegacyState, pid: string) => (s.purchasedStars ?? {})[pid] ?? 0

/**
 * The campaigns row: compare-and-swap, and a trigger that bumps the version on
 * every accepted write. `save` mirrors performSave â€” including the S29 rules
 * a caller opts into with `reapply`.
 */
function fakeRow(initial: LegacyState) {
  let version = 1
  let value = initial
  return {
    get version() { return version },
    get value() { return value },
    /** Returns the copy the CALLER should now hold. */
    save(expected: number, next: LegacyState, reapply?: (fresh: LegacyState) => LegacyState) {
      if (expected === version) {
        version += 1
        value = next
        return { ok: true, version, adopt: next }
      }
      // Refused. An award rebuilds itself on the winner's copy and retries;
      // anything else simply adopts the winner's copy.
      if (reapply) {
        const merged = reapply(value)
        version += 1
        value = merged
        return { ok: true, version, adopt: merged }
      }
      return { ok: false, version, adopt: value }
    },
  }
}

// â”€â”€â”€ 1. The bug as it shipped â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
console.log('--- the old protocol: the star dies at the next boundary ---')
{
  const row = fakeRow(base())
  // Both machines read v1.
  let ryan = row.value, ryanV = row.version
  let test = row.value, testV = row.version

  // Ryan earns the depletion star; his write lands.
  ryan = awardRedStars(ryan, 'p1', 1, 'Ryan', 3)
  const w = row.save(ryanV, ryan)
  ryanV = w.version
  check('the star is on the server', starsOf(row.value, 'p1'), 1)

  // test's autosave fires at the turn boundary from its STALE copy. Refused â€”
  // and the old code adopted only the version, keeping the stale content.
  const r1 = row.save(testV, { ...test, worldName: 'W' })
  testV = r1.version                       // version adoptedâ€¦
  check('the first clobber is refused', r1.ok, false)
  check('the star survives the refusal', starsOf(row.value, 'p1'), 1)

  // â€¦but the NEXT boundary write is version-current and carries the stale copy.
  const r2 = row.save(testV, { ...test, worldName: 'W' })
  check('the second write is accepted', r2.ok, true)
  check('and the star is gone â€” the reported bug', starsOf(row.value, 'p1'), 0)
}

// â”€â”€â”€ 2. Rule 1: the loser adopts the winner's copy â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
console.log('\n--- adopting the winner\'s copy disarms the delayed clobber ---')
{
  const row = fakeRow(base())
  let ryan = row.value, ryanV = row.version
  let test = row.value, testV = row.version

  ryan = awardRedStars(ryan, 'p1', 1, 'Ryan', 3)
  ryanV = row.save(ryanV, ryan).version

  const r1 = row.save(testV, { ...test, worldName: 'W' })
  check('the write is refused', r1.ok, false)
  test = r1.adopt                          // â† the fix: content, not just version
  testV = r1.version
  check('the loser now holds the star', starsOf(test, 'p1'), 1)

  const r2 = row.save(testV, { ...test, worldName: 'W2' })
  check('its next write is accepted', r2.ok, true)
  check('and the star is still there', starsOf(row.value, 'p1'), 1)
  check('the unrelated edit landed too', row.value.worldName, 'W2')
  void ryanV
}

// â”€â”€â”€ 3. Rule 2: an award re-applies itself and retries â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
console.log('\n--- losing the race costs a round trip, not a star ---')
{
  const row = fakeRow(base())
  const ryanV = row.version
  let ryan = row.value

  // Someone else writes first, so Ryan's award is built on a copy that is
  // already stale by the time it reaches the server.
  row.save(row.version, { ...row.value, worldName: 'Someone Else' })

  const applyStar = (b: LegacyState) => awardRedStars(b, 'p1', 1, 'Ryan', 3)
  ryan = applyStar(ryan)
  const res = row.save(ryanV, ryan, applyStar)
  check('the retry is accepted', res.ok, true)
  check('the star landed', starsOf(row.value, 'p1'), 1)
  check("the other machine's edit was not trampled", row.value.worldName, 'Someone Else')
  check('exactly one star was awarded, not two', starsOf(res.adopt, 'p1'), 1)
}

// â”€â”€â”€ 4. Two machines award at once â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
console.log('\n--- simultaneous awards both survive ---')
{
  const row = fakeRow(base())
  const vA = row.version, vB = row.version
  const applyA = (b: LegacyState) => awardRedStars(b, 'p1', 1, 'Ryan', 3)
  const applyB = (b: LegacyState) => awardRedStars(b, 'p2', 2, 'Test', 3)

  row.save(vA, applyA(row.value), applyA)
  row.save(vB, applyB(row.value), applyB)   // stale by now â€” rebuilds and retries
  check("Ryan's star survived", starsOf(row.value, 'p1'), 1)
  check("test's two stars survived", starsOf(row.value, 'p2'), 2)
  check('both awards are in the history', row.value.historyLog.length, 2)
}


// ─── A red star is a CAPTURED HQ, never your own ───────────────────────────
// Ryan took one HQ in game 2 and the board declared four stars and an
// instant win. The tally counted every HQ territory he occupied — his own
// included — so a player began the game already holding a star, and every
// count downstream (the HUD, the victory check, the coin-deck award, the
// star powers) inherited it.
{
  const hqStar = (t: { occupyingPlayerId: string | null; activeHqPlayerId?: string }, pid: string) =>
    t.occupyingPlayerId === pid && !!t.activeHqPlayerId && t.activeHqPlayerId !== pid

  check('your own HQ is not a red star',
    hqStar({ occupyingPlayerId: 'p1', activeHqPlayerId: 'p1' }, 'p1'), false)
  check('an HQ you captured is',
    hqStar({ occupyingPlayerId: 'p1', activeHqPlayerId: 'p2' }, 'p1'), true)
  check('an HQ you no longer hold is not yours to count',
    hqStar({ occupyingPlayerId: 'p2', activeHqPlayerId: 'p1' }, 'p1'), false)
  check('plain ground is not a star',
    hqStar({ occupyingPlayerId: 'p1' }, 'p1'), false)
}

console.log(pass ? '\nstarracetest: all passed' : '\nstarracetest: FAILURES PRESENT')
if (!pass) process.exit(1)
