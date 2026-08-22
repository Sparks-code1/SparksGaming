// The transport, and whether it is actually plugged in.
//
// WAS RED ON PURPOSE. It was written before the wiring, when viewForSeat and
// startSecretsSync were both finished, both correct, both proved by their own
// suites — and neither had a caller. Every unit test passed and every hand
// still travelled in matches.state, because a projection nothing applies and a
// channel nothing opens change nothing about what crosses the wire. That gap is
// invisible to a unit test and is the whole reason this file exists.
//
// It is green now, and it stays honest by asserting the WIRING rather than the
// behaviour: that the server writes through publicView, that the hands go to
// the secrets store in the same transaction, that the response is projected,
// that the client subscribes and merges and asserts. Whether those things are
// CORRECT is handprivacytest, secretssynctest and
// scripts/check-seat-privacy.mjs; whether they RUN AT ALL is only this.
//
// Live equivalent, on the joiner's machine with a match open. Read the WIRE,
// not the app — inspecting React state only says what the client was handed to
// render, and the question is what crossed the network:
//
//   devtools -> Network -> WS -> the realtime socket -> Messages
//   search a frame for "cards"
//
// A frame must now show "cards" only for the seat receiving it, and
// "cardCount" for everyone else.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

/**
 * Every .ts/.tsx under a directory.
 *
 * Generated bundles are skipped. _shared/stateView.gen.ts is a copy of the
 * projections, so it CONTAINS every one of these names — counting it as a
 * caller would let the check pass on a file nothing imports.
 */
function sources(dir: string): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) { out.push(...sources(full)); continue }
    if (/\.gen\.tsx?$/.test(entry)) continue
    if (/\.tsx?$/.test(entry)) out.push({ path: full.replace(/\\/g, '/'), text: readFileSync(full, 'utf8') })
  }
  return out
}

// The server half lives in supabase/functions, not src. Scanning only src said
// "nothing applies viewForSeat" while the edge function was applying it on
// every write — the projection that matters most runs where the state is
// authored, which is not in the client tree at all.
const SRC = [...sources('src'), ...sources('supabase/functions')]

// ── the server strips every hand out of the shared row ─────────────────────
// The row is one record delivered whole to every subscriber, so this is the
// check the leak actually turns on. Everything else is a consequence.
{
  const server = 'supabase/functions/apply-action/index.ts'
  const fn = SRC.find(f => f.path === server)?.text ?? ''
  check('the write path exists to be checked', fn.length > 0, true)
  check('the shared row is written through publicView', /publicView\(/.test(fn), true)
  check('...and the hands go to the secrets store instead',
    /secretsFromState\(/.test(fn), true)
  check('...in one transaction, not two writes that can half-fail',
    /apply_match_write/.test(fn), true)
  // The regression this forbids: the reducer output going straight into the
  // row, which is what it did before and what an innocent-looking edit restores.
  //
  // Anchored on the WRITE argument rather than on the text `state: nextState`.
  // That phrase also appears in the destructuring of the reducer's result, where
  // it is entirely correct, and matching it there failed this check against
  // working code — a false alarm in a privacy suite is a good way to teach
  // somebody to ignore it.
  check('the raw state is never written into the row',
    /p_state:\s*nextState\b/.test(fn), false)
  check('...nor written around apply_match_write by a direct update',
    /from\('matches'\)[\s\S]{0,120}\.update\(\{[\s\S]{0,60}state:/.test(fn), false)
  // The response is a second copy of the whole state going to one client. A
  // private channel is still a channel.
  check('the action response is projected for the seat that asked',
    /viewForSeat\(nextState/.test(fn), true)
  // And the row no longer holds hands, so the reducer's input has to be rebuilt.
  check('the reducer input is rehydrated from the secrets store',
    /hydrateState\(/.test(fn), true)
}

// ── the client puts its own hand back, and checks what it was sent ─────────
{
  const callers = (name: string, definedIn: string) =>
    SRC.filter(f => f.path !== definedIn && new RegExp(`\\b${name}\\s*\\(`).test(f.text)).map(f => f.path)

  check('something calls startSecretsSync',
    callers('startSecretsSync', 'src/lib/secretsSync.ts').length > 0, true)
  check('something merges this seat\'s own hand back',
    callers('mergeOwnSecrets', 'src/lib/stateView.ts').length > 0, true)
  // The assertion, at the only place that can tell absent from hidden.
  check('leaksOtherSeatsSecrets is asserted where state arrives from the wire',
    callers('leaksOtherSeatsSecrets', 'src/lib/stateView.ts')
      .some(p => p.includes('useMatchSync') || p.includes('matchSync')), true)
}

// ── the two copies of the projection cannot drift ──────────────────────────
// The edge function runs a GENERATED copy of stateView. If it is stale, the
// server is applying a different rule from the one the client asserts against,
// and the disagreement surfaces as a privacy leak rather than a broken build.
{
  const gen = 'supabase/functions/_shared/stateView.gen.ts'
  check('the projections are shared with the server, not re-implemented',
    readFileSync(gen, 'utf8').includes('publicView'), true)
  check('...and generated rather than hand-copied',
    /AUTO-GENERATED/.test(readFileSync(gen, 'utf8')), true)
  check('...from the file the client uses',
    readFileSync(gen, 'utf8').includes('src/lib/stateView.ts'), true)
  // AND CURRENT. The bundle is checked in and deployed from the working tree,
  // so editing the source without regenerating leaves the server applying the
  // OLD rule while the client asserts against the new one. That disagreement
  // surfaces as a privacy leak rather than as a broken build, which is the
  // worst way for it to surface. Sabotage found this: changing publicView
  // without running build:edge left the whole suite green.
  check('...and regenerated since stateView last changed',
    (() => {
      try { execSync('node scripts/build-edge-shared.mjs --check', { stdio: 'pipe' }); return true }
      catch { return false }
    })(), true)
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

  // ── the seed must write the shape the server writes ──────────────────────
  // The check seeds matches.state directly with the service role, which never
  // goes near publicView. So whatever shape the seed writes is the shape the
  // check reads back, and if the seed puts hands in the row then PRIVATE-STATE
  // fails against its own fixture — a hand-written legacy row the server would
  // never produce.
  //
  // That happened, and it was convincing: identical failure, identical message,
  // before and after the wiring landed. A false negative that looks like a true
  // one is worse than a false positive, because it sends somebody to debug
  // working code.
  //
  // The rule is that no payload written to `matches` may contain either seat's
  // secret. The hands belong in match_secrets and nowhere else.
  {
    /** Every object literal written to `table` by insert or update. */
    const payloadsTo = (table: string): string[] => {
      const out: string[] = []
      const re = new RegExp(`\\.from\\('${table}'\\)[\\s\\S]{0,40}?\\.(insert|update)\\(`, 'g')
      let m: RegExpExecArray | null
      while ((m = re.exec(script))) {
        const open = script.indexOf('(', m.index + m[0].length - 1)
        let depth = 0
        for (let i = open; i < script.length; i++) {
          if (script[i] === '(') depth++
          else if (script[i] === ')' && --depth === 0) { out.push(script.slice(open, i + 1)); break }
        }
      }
      return out
    }

    /**
     * A payload, plus the source of any `const` it names.
     *
     * The payload used to be a literal, so searching its text was enough. Then
     * the seed grew a `state: publicHalf` variable and this guard went blind:
     * the literal it was reading no longer contained anything, and the sabotage
     * that puts hands back into the row walked straight past it.
     *
     * One level of indirection, which is all the seed uses. Deeper than that and
     * this would want a parser rather than a regex — but a guard that silently
     * stops looking is worse than one that admits a depth limit, so the limit is
     * asserted below rather than assumed.
     */
    const withReferents = (payload: string): string => {
      const names = new Set([...payload.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)].map(m => m[1]))
      let text = payload
      for (const name of names) {
        const at = script.indexOf(`const ${name} = `)
        if (at < 0) continue
        // To the end of the statement's outermost braces, or the line if it has
        // none — enough to catch a mapped object literal.
        const open = script.indexOf('{', at)
        if (open < 0 || open > script.indexOf('\n', at)) { text += script.slice(at, script.indexOf('\n', at)); continue }
        let depth = 0
        for (let i = open; i < script.length; i++) {
          if (script[i] === '{') depth++
          else if (script[i] === '}' && --depth === 0) { text += script.slice(at, i + 1); break }
        }
      }
      return text
    }

    const toMatches = payloadsTo('matches').map(withReferents)
    // Without this the rule below is vacuous: no payloads found, nothing to
    // contain a secret, green forever. The script writes the row twice — once
    // seeding and once to provoke a frame.
    check('the guard can see what the seed writes to matches', toMatches.length >= 2, true)
    // ...and can see THROUGH a variable, which is how it is written now. Without
    // this the rule below reads an identifier and finds nothing in it.
    check('...including the contents of a state it passes by name',
      toMatches.some(p => p.includes('cardCount')), true)
    check('no payload written to matches carries a seat secret',
      toMatches.filter(p => /SECRET_A|SECRET_B/.test(p)).map(p => p.slice(0, 70).replace(/\s+/g, ' ')),
      [])
    // And the counterpart: the hands DO have to be written somewhere, or the
    // check is asserting the absence of something that was never seeded.
    const toSecrets = payloadsTo('match_secrets')
    check('the hands are written to match_secrets instead',
      toSecrets.some(p => /SECRET_A/.test(p)) && toSecrets.some(p => /SECRET_B/.test(p)), true)
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
