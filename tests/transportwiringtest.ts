// The transport is BUILT BUT NOT PLUGGED IN, and this suite says so out loud.
//
// Three pieces exist and are correct in isolation:
//   viewForSeat        strips other seats' hands  — proved by handprivacytest
//   startSecretsSync   subscribes a seat to its own secrets — proved by secretssynctest
//   match_secrets      RLS'd read-your-own, no client writes — proved by its migration
//
// None of them has a caller. A projection nothing applies and a channel nothing
// opens leave the leak exactly where it was: every hand still travels in
// matches.state, which the changefeed delivers whole to every subscriber. The
// unit tests above all pass, and the running app is still wrong, which is the
// precise gap a call-graph assertion closes and a unit test cannot.
//
// WRITTEN TO FAIL. This suite is red today on purpose and goes green when the
// wiring lands, not before. A check that has never failed has not been shown to
// catch anything.
//
// It does not claim the wiring is CORRECT — that is what handprivacytest,
// secretssynctest and scripts/check-seat-privacy.mjs are for. It claims only
// that it exists, which is the one thing those three cannot see.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

/** Every .ts/.tsx under src, with its text. */
function sources(dir = 'src'): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) { out.push(...sources(full)); continue }
    if (/\.tsx?$/.test(entry)) out.push({ path: full.replace(/\\/g, '/'), text: readFileSync(full, 'utf8') })
  }
  return out
}

const SRC = sources()

/**
 * Files that CALL `name`, excluding the file that defines it.
 *
 * Looks for the call rather than the import: an import that nothing invokes is
 * exactly the state being tested against, and would otherwise satisfy the check
 * without changing what the app does.
 */
const callersOf = (name: string, definedIn: string) =>
  SRC.filter(f => f.path !== definedIn && new RegExp(`\\b${name}\\s*\\(`).test(f.text))
    .map(f => f.path)
    .sort()

// ── the projection has to be applied somewhere ─────────────────────────────
{
  const callers = callersOf('viewForSeat', 'src/lib/stateView.ts')
  check('something applies viewForSeat', callers.length > 0, true)
  // Named, not just counted, so the failure says what is missing and a later
  // reader can see where the wiring went.
  check('...and it is reachable from the sync path',
    callers.length === 0 ? 'NOTHING CALLS IT' : 'called', 'called')
}

// ── a seat has to subscribe to its own secrets ─────────────────────────────
{
  const callers = callersOf('startSecretsSync', 'src/lib/secretsSync.ts')
  check('something calls startSecretsSync', callers.length > 0, true)
  check('...and it is reachable from the sync path',
    callers.length === 0 ? 'NOTHING CALLS IT' : 'called', 'called')
}

// ── the deck store has to exist before anything can be dealt into it ───────
// Asserted against the migration rather than the database, because a test
// cannot reach the database. It proves the migration was WRITTEN with no
// policy; that it was APPLIED, and that the policy is genuinely absent in
// Postgres, is what the migration's own verify block and
// scripts/check-seat-privacy.mjs are for.
{
  const path = 'supabase/migrations/20260822000000_match_decks.sql'
  const sql = readFileSync(path, 'utf8')
  check('the deck store migration exists', sql.length > 0, true)
  check('...with RLS enabled', /alter table match_decks enable row level security/.test(sql), true)
  // The whole point of this table. Any create policy on it is a way in.
  check('...and no policy of any kind on it',
    /create\s+policy[\s\S]*?on\s+match_decks/i.test(sql), false)
  check('...and it asserts its own policy count is zero',
    /pg_policies[\s\S]*match_decks[\s\S]*raise exception/i.test(sql), true)
  check('...and it is kept off the realtime publication',
    /supabase_realtime[\s\S]*match_decks[\s\S]*raise exception/i.test(sql), true)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
