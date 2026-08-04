// A sea line placed while the win screen is open must survive.
//
// The win screen snapshots campaign state when it mounts and hands its edited
// copy back on close. Writing that copy back wholesale reverted anything placed
// meanwhile — the Island Empire sea line renders at z-9000, ABOVE the win screen
// at z-2000, so it is placed exactly in that window. Both `customSeaLines` and
// its history entry are written in one update, so both vanished together.
import { mergeLegacyEdits, applyCustomSeaLines } from '@/lib/gameLogic'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

const log = (...entries: string[]) =>
  entries.map((e, i) => ({ timestamp: `t${i}`, entry: e }))

/** The campaign state the win screen opened with. */
const baseline: any = {
  customSeaLines: [],
  stickers: [{ id: 's1', description: 'city:minor' }],
  victoryLog: [],
  missiles: { p1: 1 },
  historyLog: log('game started'),
}

console.log('\n— the reported bug —')
{
  // Meanwhile: the player places a sea line from the modal above the win screen.
  const latest = {
    ...baseline,
    customSeaLines: [['iceland', 'brazil']],
    historyLog: [...baseline.historyLog, { timestamp: 't9', entry: '⚓ New sea line drawn' }],
  }
  // The win screen, working from its own older copy, founds a city and logs a win.
  const edited = {
    ...baseline,
    stickers: [...baseline.stickers, { id: 's2', description: 'city:major' }],
    victoryLog: [{ gameNumber: 6, winnerName: 'Ryan' }],
    historyLog: [...baseline.historyLog, { timestamp: 't8', entry: 'Ryan won Game #6' }],
  }

  check('writing the edited copy back wholesale LOSES the sea line',
    (edited as any).customSeaLines.length === 0)

  const merged: any = mergeLegacyEdits(latest, baseline, edited)
  check('the merge keeps the sea line', merged.customSeaLines.length === 1)
  check('...with the right endpoints', merged.customSeaLines[0].join('-') === 'iceland-brazil')
  check('and still applies the founded city', merged.stickers.length === 2)
  check('and the victory record', merged.victoryLog.length === 1)
  check('untouched fields survive', merged.missiles.p1 === 1)

  const entries = merged.historyLog.map((e: any) => e.entry)
  check('BOTH history entries are kept', entries.length === 3, JSON.stringify(entries))
  check('the sea line entry survives', entries.includes('⚓ New sea line drawn'))
  check('the win entry survives', entries.includes('Ryan won Game #6'))
  check('no duplicates of the shared baseline entry',
    entries.filter((e: string) => e === 'game started').length === 1)
}

console.log('\n— the merge is otherwise faithful —')
{
  const latest = { ...baseline }
  const edited = { ...baseline, missiles: { p1: 3 }, historyLog: baseline.historyLog }
  const merged: any = mergeLegacyEdits(latest, baseline, edited)
  check('an edited field is applied', merged.missiles.p1 === 3)

  // Nothing happened elsewhere: the merge must equal the edit.
  const untouched: any = mergeLegacyEdits(baseline, baseline, edited)
  check('with no concurrent change, the edit wins outright', untouched.missiles.p1 === 3)

  // Both sides edited the SAME field: the screen's edit is the authority.
  const bothLatest = { ...baseline, missiles: { p1: 9 } }
  const bothMerged: any = mergeLegacyEdits(bothLatest, baseline, edited)
  check('on a genuine conflict the screen wins', bothMerged.missiles.p1 === 3)

  // A field the screen did NOT touch, changed elsewhere.
  const elsewhere = { ...baseline, worldCapitalTerritoryId: 'brazil' }
  const kept: any = mergeLegacyEdits(elsewhere, baseline, edited)
  check('a field only the other side changed is kept', kept.worldCapitalTerritoryId === 'brazil')

  // A key the screen deleted.
  const withExtra = { ...baseline, temp: 1 }
  const removed: any = mergeLegacyEdits(withExtra, withExtra, (() => {
    const e: any = { ...withExtra }; delete e.temp; return e
  })())
  check('a key the screen deleted is removed', !('temp' in removed))
}

console.log('\n— empty and missing logs —')
{
  const noLog: any = mergeLegacyEdits({ a: 1 } as any, { a: 1 } as any, { a: 2 } as any)
  check('a state with no historyLog is safe', noLog.a === 2 && Array.isArray(noLog.historyLog))
  const emptied: any = mergeLegacyEdits(
    { historyLog: [] } as any, { historyLog: [] } as any, { historyLog: [] } as any)
  check('empty logs merge to empty', emptied.historyLog.length === 0)
}

console.log('\n— a sea line is a real two-way adjacency —')
{
  const t: any = {
    iceland: { id: 'iceland', adjacentIds: ['greenland'] },
    brazil: { id: 'brazil', adjacentIds: ['peru'] },
  }
  const linked: any = applyCustomSeaLines(t, [['iceland', 'brazil']])
  check('iceland reaches brazil', linked.iceland.adjacentIds.includes('brazil'))
  check('brazil reaches iceland', linked.brazil.adjacentIds.includes('iceland'))
  check('existing adjacency is untouched', linked.iceland.adjacentIds.includes('greenland'))

  const twice: any = applyCustomSeaLines(linked, [['iceland', 'brazil']])
  check('applying the same line twice does not duplicate it',
    twice.iceland.adjacentIds.filter((x: string) => x === 'brazil').length === 1)

  const missing: any = applyCustomSeaLines(t, [['iceland', 'atlantis']])
  check('a line to a territory that does not exist is ignored',
    !missing.iceland.adjacentIds.includes('atlantis'))
  check('no lines at all is a no-op', applyCustomSeaLines(t, []) === t)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
