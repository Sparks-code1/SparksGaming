// Every campaign write in the effect interpreter belongs to ONE machine.
//
// applyCombatEffect runs on every machine in a match: the actor's, because it
// dispatched, and everyone else's, because the action and its effects are
// broadcast so spectators can watch the battle. `remote` marks the second kind,
// and the rule the file already follows is that a REMOTE effect may animate,
// notice and sound, but must not write the campaign — the acting machine does
// that, once.
//
// First Blood was the exception, and it was correct by accident rather than by
// design: the flag it sets is the same value on every machine and the mercenary
// card ids dedup, so N clients racing to write the same thing converged. The
// next field added beside it would not have been so forgiving, and until then
// every elimination cost a campaign write per machine, N-1 of them losing the
// version race and burning a re-read and a retry each.
//
// So this is a rule about the FUNCTION, not about one write in it: a new case
// that saves the campaign without saying which machine it belongs to fails
// here, which is the only way that mistake gets caught before a live game.
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) { pass++; console.log(`  ok   ${label}`) }
  else {
    fail++
    console.log(`  FAIL ${label}\n         got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
  }
}

const board = readFileSync('src/components/GameBoard.tsx', 'utf8')
const fnAt = board.indexOf('function applyCombatEffect(e: Effect, remote = false)')
const fnEnd = board.indexOf('applyEffectRef.current = applyCombatEffect', fnAt)
const body = fnAt < 0 || fnEnd < 0 ? '' : board.slice(fnAt, fnEnd)

console.log('\n— the effect interpreter is where it was found —')
check('applyCombatEffect located', body.length > 0, true)
// A guard against the extraction silently matching nothing: if the anchors ever
// drift, every check below passes over an empty string and says so cheerfully.
check('...and it contains campaign writes to check',
  [...body.matchAll(/saveLegacyState\(/g)].length > 0, true)

console.log('\n— and every campaign write in it names its machine —')
{
  const saves = [...body.matchAll(/saveLegacyState\(/g)].map(m => m.index as number)
  const unguarded = saves.filter(i => {
    // Either the whole case stands down for remote effects up front...
    const caseAt = body.slice(0, i).lastIndexOf("case '")
    const caseBlock = body.slice(caseAt < 0 ? 0 : caseAt, i)
    if (/if \(remote\) break/.test(caseBlock)) return false
    // ...or this particular write is gated where it happens.
    return !/!remote/.test(body.slice(Math.max(0, i - 80), i))
  }).map(i => {
    // Report WHICH line, so a failure is actionable rather than a count.
    const line = board.slice(0, fnAt + i).split('\n').length
    return `GameBoard.tsx:${line}`
  })
  check('no campaign write runs on every machine', unguarded, [])
}

console.log('\n— First Blood in particular —')
{
  const at = body.indexOf('const markFirstBlood = (b: LegacyState): LegacyState =>')
  const fn = at < 0 ? '' : body.slice(at, at + 600)
  check('the mark is a function of the row', at > 0, true)
  // IDEMPOTENT, because the rebuild may run against a row where another machine
  // already recorded it — and a second pass must not shuffle the mercenaries
  // into the scar deck again.
  check('...idempotent, so a rebuild against a recorded row is a no-op',
    /b\.firstEliminationTriggered\s*\?\s*b/.test(fn), true)
  check('...and it dedups the mercenary cards it adds',
    /\[\.\.\.new Set\(\[\.\.\.\(b\.scarDeck \?\? \[\]\), \.\.\.MERCENARY_CARD_IDS\]\)\]/.test(fn), true)
  check('the write is the acting machine\'s and carries its rebuild',
    body.includes('if (!remote) saveLegacyState(next, { reapply: markFirstBlood })'), true)

  // THE LOCAL UPDATE STAYS EVERYWHERE. The flag is read by this screen — the
  // mercenary entry in the legacy panel, and whether the comeback modal calls
  // itself the first — and nothing subscribes to the campaign row, so a remote
  // machine that skipped the state update would not learn it until a reload.
  const setAt = body.indexOf('setLegacyState(prev => {', at)
  const setBlock = setAt < 0 ? '' : body.slice(setAt, setAt + 420)
  check('every machine still updates its own copy',
    /setLegacyState\(prev => \{[\s\S]{0,200}?const next = markFirstBlood\(prev\)/.test(setBlock), true)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
