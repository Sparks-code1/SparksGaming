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
  check('...and the deck orders to the deck store',
    /decksFromState\(/.test(fn), true)
  // The server is the only thing that can read match_decks — it has no policy
  // at all — so if it does not read them back, nothing can.
  check('...which the server reads back before reducing',
    /from\('match_decks'\)/.test(fn), true)
  // Reading them and not USING them is silent: the decks come back empty and
  // every other check still passes. hydrateState takes them as a required
  // argument now, which catches it anywhere tsc looks — and tsc does not look at
  // supabase/functions, so it is asserted here as well.
  check('...and hands them to the rehydration rather than dropping them',
    /hydrateState\([^)]*heldDecks/.test(fn), true)
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

// ── the Dune server, which nothing was looking at ──────────────────────────
// The guard above reads apply-action, which is Risk's. dune-action runs the
// auction and had no offline coverage whatsoever — and it held two faults that
// only a real call would have found, both of them invisible to tsc because it
// does not read supabase/functions.
{
  const fn = SRC.find(f => f.path === 'supabase/functions/dune-action/index.ts')?.text ?? ''
  check('the Dune write path exists to be checked', fn.length > 0, true)

  // A SEAT IS NOT A FACTION. Seats are 'p1'..'p6'; the auction's order, the
  // hand limits and the Emperor's redirect are all keyed by faction. Handing a
  // seat id to answerBid compared 'p1' against 'atreides' and refused every bid
  // as not-your-turn — forever, because nothing could ever match.
  check('the bidder is identified by faction, not by seat',
    fn.includes('answerBid(step.carry, myFaction'), true)
  check('...and never by seat id', fn.includes('answerBid(step.carry, playerId'), false)
  check('the faction is resolved from the roster, not from the request',
    /faction_id/.test(fn) && /factionOfSeat/.test(fn), true)
  // Settlement is keyed by faction going in and by seat coming out, because
  // match_secrets is keyed by seat. One namespace in, the other out, and the
  // mapping named in both directions.
  // BOTH mappings, each anchored on what it builds. Checking for the mere
  // presence of `factionOfSeat[r.player_id` passed while `hands` reverted to
  // seat keys, because three other lines still used it — a settlement reading
  // two namespaces at once, which finds no winner and refuses every auction.
  // Counting occurrences was no better: the threshold is a guess about how many
  // other uses exist, and it was wrong the first time.
  check('the hands are keyed by faction for the settlement',
    fn.includes('[factionOfSeat[r.player_id as string], ((r.data'), true)
  check('...and so are the purses',
    fn.includes('[factionOfSeat[r.player_id as string], readSpice('), true)
  check('...and mapped back to a seat before being written',
    fn.includes('seatOfFaction[faction]'), true)
  check('...refusing a winner no seat holds rather than dropping them',
    /unseated-winner/.test(fn), true)

  // The reshuffle's seed. Reading columns the query never selected gives NaN,
  // which mulberry32 floors to 1 — so every match on the planet would reshuffle
  // into the same order. Deterministic, replayable, and identical everywhere:
  // the one failure a seeded shuffle exists to prevent.
  check('the match row is read with the columns the shuffle seeds from',
    fn.includes("select('state, version, rng_seed, action_seq')"), true)
  check('...and the shuffle uses them', fn.includes('shuffleWithSeed(Number(match.rng_seed)'), true)

  // The same three-store transaction the Risk side has, for the same reason.
  check('cards, spice and the discard are written in one call',
    /p_decks/.test(fn) && /p_secrets: secretsPatch/.test(fn), true)

  // ── the two effects that are invisible in the response ───────────────────
  // Both were reported missing after a real run. They have to be in the
  // SETTLEMENT's call specifically — not merely somewhere in the file, which
  // OPEN_BIDDING's own p_decks would satisfy — so the block is sliced out and
  // read on its own.
  {
    const at = fn.indexOf('const secretsPatch')
    const settleCall = at < 0 ? '' : fn.slice(at, at + 1400)
    check('the settlement block is where it is expected', settleCall.length > 0, true)
    // Without this the phase never ends: the row still holds an open auction
    // and every client goes on waiting for a bid nobody can make.
    check('...and it closes the auction out of the public row',
      settleCall.includes('auction: null'), true)
    // Without this a retry deals the same cards a second time, from a lot that
    // was never cleared.
    check('...and empties the lot in the same call',
      settleCall.includes("'auction-lot': []"), true)
    check('...both inside the one apply_match_write',
      settleCall.indexOf('apply_match_write') < settleCall.indexOf("'auction-lot': []"), true)
    // And the write is made to prove it landed, because a success that did
    // nothing leaves no way to tell a stale deploy from a bug.
    check('...and the write reads back to confirm both took effect',
      fn.includes('settlement-incomplete'), true)
  }
  check('the auction runs from the shared bundle, not a copy',
    /_shared\/duneBidding\.gen\.ts/.test(fn), true)
  check('...and so does the settlement', /_shared\/duneAuction\.gen\.ts/.test(fn), true)

  // EVERY SHARED NAME IT USES IS IMPORTED. tsc does not read this directory, so
  // a missing import is not a compile error here — it is a ReferenceError on the
  // first real call and nowhere before that.
  //
  // It happened, to all nine at once: two patches anchored on an import line
  // that exists in apply-action and not in this file, so they no-op'd while the
  // code that used the names landed. The function referenced nine identifiers it
  // never imported and every other check stayed green.
  {
    const imported = new Set(
      [...fn.matchAll(/import \{([^}]*)\} from/g)]
        .flatMap(m => m[1].split(',').map(x => x.trim()))
        .filter(Boolean))
    const shared = [
      'applySpiceMoves', 'BANK', 'settleAuction', 'beginAuction', 'answerBid',
      'cardsOnOffer', 'BID_SECONDS', 'drawTreachery', 'discardUnsold', 'shuffleWithSeed',
    ]
    const used = shared.filter(name => new RegExp(`\\b${name}\\b`).test(fn))
    // The rule is only worth anything if it is looking at names actually in use.
    check('the Dune server uses the shared modules', used.length > 5, true)
    check('...and imports every name it uses from them',
      used.filter(name => !imported.has(name)), [])
  }
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

// ── the write covers all three tables at once ──────────────────────────────
// A state whose draw pile has been dealt from, committed without the pile it
// dealt from, is a game that deals the same card twice. The hands made this
// argument first and it does not get weaker for a table nobody can read.
{
  const sql = readFileSync('supabase/migrations/20260822010000_apply_match_write_decks.sql', 'utf8')
  check('apply_match_write writes the decks too', /insert into match_decks/.test(sql), true)
  check('...in the same function as the state and the secrets',
    /insert into match_secrets[\s\S]*insert into match_decks/.test(sql), true)
  // Overloading on arity would leave a four-argument call ambiguous, and the
  // failure appears at the caller long after this migration reports success.
  check('...and the old four-argument version is dropped, not left beside it',
    /drop function if exists apply_match_write\(uuid, int, jsonb, jsonb\)/.test(sql), true)
  check('...with the overload count asserted', /overloads/.test(sql), true)
  check('...and no client role able to execute it',
    /revoke all on function apply_match_write\(uuid, int, jsonb, jsonb, jsonb\) from authenticated/.test(sql), true)
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

  /**
   * Source with its comments removed.
   *
   * BOTH helpers below read structure out of source text, and both were wrong
   * about comments in the same way — one took a line comment's `//` for a
   * property name, the other took the word "board" out of a sentence and
   * resolved it as a variable. Prose is not code, and it is stripped once here
   * rather than remembered twice.
   */
  const stripComments = (text: string) =>
    text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

  /** The object literal passed to the FIRST .insert() after .from(table). */
  /**
   * EVERY insert into `table`, not the first.
   *
   * It read only the first, and the moment a second match was seeded for the
   * Dune auction probe that insert went unchecked — a whole row's mandatory
   * columns unexamined, silently, because the guard had already found one.
   * "The first one is fine" is not what this claims to check.
   */
  const insertBodies = (table: string): string[] => {
    const out: string[] = []
    const re = new RegExp(`\\.from\\('${table}'\\)[\\s\\S]{0,40}?\\.insert\\(`, 'g')
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

  /**
   * The property NAMES of one object literal.
   *
   * Split on top-level commas and take the leading identifier of each part,
   * rather than matching `name:`. Shorthand properties have no colon —
   * `{ match_id: matchId, deck, cards }` supplies all three — and reading only
   * the colon form reported two of them missing against a seed that was
   * correct. A privacy suite that cries wolf teaches people to skip it.
   */
  const keysOf = (row: string): Set<string> => {
    // Comments go first. A line comment sitting above a property makes that
    // property's fragment begin with `//`, so its leading identifier is not the
    // key and the column reads as missing — a false alarm against a seed that
    // supplies it, which is how this was found.
    const body = stripComments(row).replace(/^\s*\{/, '').replace(/\}\s*$/, '')
    const parts: string[] = []
    let depth = 0, start = 0
    for (let i = 0; i < body.length; i++) {
      const c = body[i]
      if ('{[('.includes(c)) depth++
      else if ('}])'.includes(c)) depth--
      else if (c === ',' && depth === 0) { parts.push(body.slice(start, i)); start = i + 1 }
    }
    parts.push(body.slice(start))
    return new Set(parts
      .map(p => /^\s*(?:\.\.\.)?([A-Za-z_$][\w$]*)/.exec(p)?.[1])
      .filter((k): k is string => !!k))
  }

  for (const table of ['campaigns', 'matches', 'match_players', 'match_secrets', 'match_decks']) {
    const required = requiredColumns(table)
    const bodies = insertBodies(table)
    const rows = bodies.flatMap(rowsIn)
    const missing = rows.length === 0
      ? ['<no insert found for this table>']
      : rows.flatMap((row, i) => {
        const supplied = keysOf(row)
        return required.filter(c => !supplied.has(c)).map(c => `row ${i}: ${c}`)
      })
    check(`the seed supplies every mandatory column of ${table}, in every row`, missing, [])
  }
  // The probe seeds a SECOND match — Dune's state is a different shape from
  // Risk's, so one board cannot serve both. Asserted so that "every row" above
  // is known to be looking at more than one of them.
  check('both matches the probes need are seeded',
    insertBodies('matches').length >= 2, true)
  check('...each with its own seats', insertBodies('match_players').length >= 2, true)

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
    // An ABSENCE claim is a negated one. A bare check that merely MENTIONS a
    // secret is usually a control asserting the opposite — 'the loser's purse
    // was written' names LOSER_SPICE and is exactly what the rule wants to
    // exist. Flagging those made the guard fail on the controls it depends on.
    const asserts = (c: string) => /!s*(JSON.stringify|[A-Za-z_$][w$.]*)s*[.(]/.test(c)
    check('no uncontrolled check asserts that a foreign secret is absent',
      calls.filter(c => asserts(c)
        && /SECRET_B|DECK_SECRET|SPICE_B|BOUGHT|LOSER_SPICE|CARD_ON_OFFER|CARD_UNDRAWN/.test(c))
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
  // check reads back, and a seed that puts a secret in the row fails against its
  // own fixture — a failure that looks exactly like the wiring being broken.
  // That happened, twice: once with the hands and once with the deck orders.
  //
  // WHAT THIS RULE COVERS, AND WHAT IT CANNOT. It catches a secret written
  // LITERALLY into a payload. It cannot see through a derivation — the seed
  // passes `state: publicHalf`, and publicHalf now comes out of probeSeed, so
  // there is no text here to search. Three sabotages walked past this guard for
  // exactly that reason.
  //
  // The derivation is covered instead by RUNNING it: probewritepathtest calls
  // probeSeed and asserts that every pile handed to the deck store is empty in
  // the row, which is the invariant a duplicated key breaks. A source guard and
  // a behavioural one, each doing the half the other cannot.
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

    const toMatches = payloadsTo('matches')
    // Without this the rule below is vacuous: no payloads found, nothing to
    // contain a secret, green forever. The script writes the row twice — once
    // seeding and once to provoke a frame.
    check('the guard can see what the seed writes to matches', toMatches.length >= 2, true)
    check('no payload written to matches carries a hand, a purse or a deck order',
      toMatches.filter(p => /SECRET_A|SECRET_B|DECK_SECRET|SPICE_A|SPICE_B/.test(p))
        .map(p => p.slice(0, 70).replace(/\s+/g, ' ')),
      [])
    // And the counterpart: the hands DO have to be written somewhere, or the
    // check is asserting the absence of something that was never seeded.
    const toSecrets = payloadsTo('match_secrets')
    check('the hands are written to match_secrets instead',
      toSecrets.some(p => /SECRET_A/.test(p)) && toSecrets.some(p => /SECRET_B/.test(p)), true)
    // ...and the purses with them, or the spice claims assert an absence against
    // a store that never held one.
    check('the purses are written there too',
      toSecrets.some(p => /SPICE_A/.test(p)) && toSecrets.some(p => /SPICE_B/.test(p)), true)
    // EVERY row that carries a hand carries a purse. Checking "some payload
    // mentions it" was not enough: the seed writes the secrets twice, once to
    // insert and once to provoke a frame, and dropping the purse from only the
    // insert left the other payload satisfying the rule.
    check('no seeded secrets row has a hand without a purse',
      toSecrets.filter(p => /SECRET_A/.test(p) && !/SPICE_A/.test(p))
        .map(p => p.slice(0, 60).replace(/\s+/g, ' ')), [])

    // The purses themselves have to be usable as evidence. Spice is a NUMBER,
    // so it cannot carry a tag the way a hand can — which makes two properties
    // load-bearing that would be obvious for a string.
    const constant = (name: string) => {
      const m = new RegExp(`const ${name} = (-?\\d+)`).exec(script)
      return m ? Number(m[1]) : null
    }
    const a = constant('SPICE_A')
    const b = constant('SPICE_B')
    check('both purses are seeded with something', [a !== null, b !== null], [true, true])
    // Zero is absent from every result, so "B's purse is not here" would be true
    // of a store holding no spice at all — the vacuity that let the legacy hands
    // through, in its arithmetic form.
    check('...and neither is zero, which no search can find', [a === 0, b === 0], [false, false])
    // Equal purses would make "whose did A see" unanswerable: finding the number
    // would prove nothing about which seat it came from.
    check('...and they differ, so a hit names a seat', a === b, false)

    // ── the completed auction ─────────────────────────────────────────────
    // Its claims are absences too, and absences are free unless the thing was
    // actually written. The bought card has to reach a secrets row, or "no
    // other seat has it" is true of a match where no auction ever happened.
    check('the bought card is seeded into a hand',
      payloadsTo('match_secrets').some(p => /BOUGHT/.test(p)), true)
    check('...and the losing bidder\'s purse is written',
      payloadsTo('match_secrets').some(p => /LOSER_SPICE/.test(p)), true)
    check('...and the unsold card into the public state',
      payloadsTo('matches').some(p => /UNSOLD/.test(p)), true)
    // The live auction probe's card has to be IN the deck it is drawn from, or
    // "the winner holds it" is a claim about a card that was never on offer.
    check('the auctioned card is seeded into the deck it is drawn from',
      payloadsTo('match_decks').some(p => /CARD_ON_OFFER/.test(p)), true)
    check('...along with one that stays undrawn, to prove the deck is still hidden',
      payloadsTo('match_decks').some(p => /CARD_UNDRAWN/.test(p)), true)

    // THE DISCARD IS A PRESENCE CLAIM, not an absence. It is public — face up at
    // a table — so asserting it is hidden would be the opposite bug. Flipping it
    // fails loudly the moment the script runs against a real database, since the
    // seed writes it; this catches it without waiting for that.
    {
      const at = script.indexOf('AUCTION-DISCARD')
      const claim = at < 0 ? '' : script.slice(at, at + 400)
      check('the discard claim exists', claim.length > 0, true)
      check('...and asserts the card is THERE, not absent',
        // Not `[^)]*`: there is a close paren between the negation and UNSOLD,
        // so that stopped short and the flip went through unnoticed.
        /!\s*JSON\.stringify[\s\S]{0,80}UNSOLD/.test(claim), false)
      check('...which is a claim about UNSOLD at all', claim.includes('UNSOLD'), true)
    }
    // ...and the decks likewise, through the store's own insert.
    check('the decks are written to match_decks',
      payloadsTo('match_decks').length > 0, true)
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
