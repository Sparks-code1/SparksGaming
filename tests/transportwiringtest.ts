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

// ── the privacy check's seed matches the schema ────────────────────────────
// scripts/check-seat-privacy.mjs writes real rows into a real project, so it
// fails on the FIRST missing column and hides the rest behind it. That is a
// round trip per mistake, each one needing a live database to discover: it
// failed on matches.campaign_id, and would then have failed on seat, name and
// faction_id one at a time.
//
// The schema already says which columns are mandatory, so this compares the
// seed against it and reports every gap at once. Offline, because the point is
// to stop finding these by running the thing.
{
  const schema = ['supabase/schema.sql', 'supabase/multiplayer-schema.sql',
    'supabase/migrations/20260816120000_match_secrets.sql',
    'supabase/migrations/20260822000000_match_decks.sql']
    .map(p => readFileSync(p, 'utf8')).join('\n')
  const script = readFileSync('scripts/check-seat-privacy.mjs', 'utf8')

  /** Columns a row cannot be inserted without: NOT NULL or PRIMARY KEY, and no
   *  default to fill them in. */
  const requiredColumns = (table: string): string[] => {
    const m = new RegExp(`create table if not exists ${table} \\(([\\s\\S]*?)\\n\\);`).exec(schema)
    if (!m) return ['<table not found in schema>']
    return m[1].split('\n')
      .map(l => l.replace(/--.*$/, '').trim())
      // Table-level constraints are not columns.
      .filter(l => l && !/^(primary key|unique|constraint|check|foreign key)\b/i.test(l))
      .filter(l => !/\bdefault\b/i.test(l)
        && (/\bnot null\b/i.test(l) || /\bprimary key\b/i.test(l)))
      .map(l => l.split(/\s+/)[0])
  }

  /** The object literal passed to the FIRST .insert() after .from(table). */
  const insertBody = (table: string): string => {
    const from = script.indexOf(`.from('${table}')`)
    if (from < 0) return ''
    const ins = script.indexOf('.insert(', from)
    if (ins < 0) return ''
    let depth = 0
    for (let i = ins + '.insert'.length; i < script.length; i++) {
      if (script[i] === '(') depth++
      else if (script[i] === ')' && --depth === 0) return script.slice(ins, i + 1)
    }
    return ''
  }

  /**
   * Each top-level object in an insert body, separately.
   *
   * ROW BY ROW, not as one bag of keys. Two of these inserts pass an ARRAY of
   * rows, and reading the whole body at once meant a column missing from one row
   * was still "supplied" by the other — sabotage caught three of those passing:
   * a seat could lose faction_id, or its seat number, and the check said nothing.
   *
   * Braces only, so nested values (`data: { hand: [...] }`) stay inside their
   * own row rather than being counted as rows of their own.
   */
  const rowsIn = (body: string): string[] => {
    const rows: string[] = []
    let depth = 0, start = 0
    for (let i = 0; i < body.length; i++) {
      if (body[i] === '{') { if (depth++ === 0) start = i }
      else if (body[i] === '}' && --depth === 0) rows.push(body.slice(start, i + 1))
    }
    return rows
  }

  for (const table of ['campaigns', 'matches', 'match_players', 'match_secrets', 'match_decks']) {
    const required = requiredColumns(table)
    const rows = rowsIn(insertBody(table))
    const missing = rows.length === 0
      ? ['<no insert found for this table>']
      : rows.flatMap((row, i) => {
        const supplied = new Set([...row.matchAll(/(\w+)\s*:/g)].map(m => m[1]))
        return required.filter(c => !supplied.has(c)).map(c => `row ${i}: ${c}`)
      })
    check(`the seed supplies every mandatory column of ${table}, in every row`, missing, [])
  }

  // ── no absence is asserted without a control ─────────────────────────────
  // The bug this exists to prevent, stated exactly: the script looked for B's
  // secret in a set of realtime frames, received no frames at all, found
  // nothing, and reported that as the secret being kept. Three checks passed by
  // searching an empty array — including the one the whole script is for.
  //
  // The rule that fixes it is mechanical, so it is enforced mechanically.
  // SECRET_B and DECK_SECRET are the values that must never be visible, and any
  // claim about them is a claim about an ABSENCE. An absence found by a broken
  // mechanism is indistinguishable from one found by a working one, so those
  // two values may only be asserted through checkGiven, which takes a control
  // and reports INCONCLUSIVE when the control fails.
  //
  // A's own values are the opposite case: asserting A CAN see them is what
  // proves the mechanism works, so a bare check on SECRET_A is correct.
  {
    /** Every argument list of a `check(` that is not a `checkGiven(`. */
    const bareChecks = (): string[] => {
      const out: string[] = []
      const re = /(?<!Given)\bcheck\(/g
      let m: RegExpExecArray | null
      while ((m = re.exec(script))) {
        let depth = 0
        for (let i = m.index + m[0].length - 1; i < script.length; i++) {
          if (script[i] === '(') depth++
          else if (script[i] === ')' && --depth === 0) { out.push(script.slice(m.index, i + 1)); break }
        }
      }
      return out
    }

    const calls = bareChecks()
    // The parser has to be finding calls at all, or the rule below is vacuous —
    // which would be this very bug, in the check written to prevent it.
    check('the guard can see the script\'s checks', calls.length > 5, true)
    check('no uncontrolled check asserts that a foreign secret is absent',
      calls.filter(c => /SECRET_B|DECK_SECRET/.test(c))
        .map(c => c.slice(0, 60).replace(/\s+/g, ' ')), [])
    // The control machinery itself lives in scripts/lib/controlledCheck.js and
    // its BEHAVIOUR is tested in controlledchecktest — a source guard can see
    // that a control is passed in, but not whether anything looks at it, which
    // a sabotage proved by changing the branch to if(false) and staying green.
    // What matters here is only that the script uses the shared checker instead
    // of defining a weaker one of its own.
    check('the script uses the shared, tested checker',
      script.includes("from './lib/controlledCheck.js'"), true)
    check('...and does not define a checker of its own beside it',
      /const checkGiven\s*=/.test(script), false)
  }

  // The seed is only half of it. Everything it creates hangs off the campaign,
  // so teardown deleting that is what makes the script safe to run twice.
  check('teardown deletes the campaign, which everything else cascades from',
    /from\('campaigns'\)\s*\.delete\(\)/.test(script), true)
  check('...and it runs even when the check throws',
    /finally\s*\{[\s\S]*from\('campaigns'\)\s*\.delete\(\)/.test(script), true)
  // A fixed id would collide with a crashed run's leftovers, and campaigns.id
  // is a TEXT primary key rather than a generated one.
  check('the campaign id is unique per run',
    /const RUN = .*Date\.now\(\)/.test(script), true)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
