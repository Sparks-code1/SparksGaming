// The multi-seat harness, and the boundary it must not move.
//
// The harness exists so one browser can play several seats. That is only safe
// because of HOW it does it: one authenticated client per seat, each signed in
// as that seat's own account, each reading its own match_secrets row under the
// same RLS everybody else is under. It is several browser windows in one
// process — not one window with more privilege.
//
// Every check here is about keeping it that shape. The tempting shortcuts all
// weaken the boundary in code that SHIPS:
//
//   an `actAs` parameter on an edge function, so one session can act as another
//   seat — a second, weaker source of truth beside the JWT;
//
//   a relaxed match_secrets policy "just for dev" — there is no dev-only
//   version of a policy;
//
//   the service-role key in the browser — which bypasses RLS entirely and would
//   make match_decks readable, the one table with no policy at all.
//
// And the harness itself must not reach a build a player runs, whatever guard
// the module carries internally.
import { readFileSync, readdirSync, statSync, rmSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

function sources(dir: string): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) { out.push(...sources(full)); continue }
    if (/\.tsx?$/.test(entry)) out.push({ path: full.replace(/\\/g, '/'), text: readFileSync(full, 'utf8') })
  }
  return out
}
const SRC = sources('src')
const read = (p: string) => SRC.find(f => f.path === p)?.text ?? ''

// ── the harness is unreachable from a production build ────────────────────
{
  const harness = read('src/dev/multiSeat.ts')
  check('the harness exists to be checked', harness.length > 0, true)

  // ── THE ONLY CHECK HERE THAT CANNOT LIE ────────────────────────────────
  // Build it and look. The source-shape checks below all passed on a version
  // that shipped the harness: the DEV flag was on the JSX but the lazy import
  // sat at module top level, so Rollup emitted a 4.6kB DuneMultiSeatView chunk
  // into dist — dead code that never loaded, and a file on the server anyone
  // could fetch. Nothing short of reading the build would have caught it.
  //
  // It costs about six seconds. That is the price of the claim being true.
  {
    const out = 'node_modules/.multiseat-build'
    execSync(`npx vite build --outDir ${out} --emptyOutDir --logLevel error`,
      { stdio: 'pipe' })
    const files = readdirSync(join(out, 'assets'))
    check('the production build has no harness chunk',
      files.filter(f => /multiseat/i.test(f)), [])
    // And none of its distinctive strings anywhere in the bundle, in case the
    // chunk is ever inlined into another one rather than emitted beside it.
    const bundled = files
      .filter(f => f.endsWith('.js'))
      .map(f => readFileSync(join(out, 'assets', f), 'utf8'))
      .join('')
    for (const needle of ['sb-dev-seat', 'startMultiSeat', 'development harness']) {
      check(`...and no trace of ${needle}`, bundled.includes(needle), false)
    }
    rmSync(out, { recursive: true, force: true })
  }

  const main = read('src/main.tsx')
  // A STATIC import puts it in the bundle whatever the guard around the render
  // says — tree-shaking cannot remove a module with side effects it cannot
  // prove absent, and this one creates clients. Dynamic, behind DEV, is what
  // keeps it out.
  check('main does not import the harness statically',
    /^import[^\n]*DuneMultiSeatView/m.test(main), false)
  check('...it imports it lazily', /lazy\(\(\) => import\([^)]*DuneMultiSeatView/.test(main), true)
  // THE FLAG IS AROUND THE IMPORT, not merely around the render. With it only
  // on the JSX the branch is dead but the import() survives, and Rollup emits
  // the chunk anyway — which is exactly what happened.
  check('...with the dev flag around the import itself',
    /import\.meta\.env\.DEV\s*\n?\s*\? lazy\(\(\) => import\(/.test(main), true)

  // And the module refuses on its own account, so a future caller that forgets
  // the gate fails loudly rather than shipping.
  check('the harness refuses to run outside a dev build',
    /if \(!import\.meta\.env\.DEV\)[\s\S]{0,120}throw new Error/.test(harness), true)
  check('...before it can create a client',
    harness.indexOf('function assertDev') < harness.indexOf('export function createSeatClient'), true)
  for (const fn of ['createSeatClient', 'startMultiSeat']) {
    const at = harness.indexOf(`export function ${fn}`)
    const body = harness.slice(at, at + 400)
    check(`...and ${fn} calls it`, body.includes('assertDev()'), true)
  }
}

// ── it holds sessions, not privileges ─────────────────────────────────────
{
  const harness = read('src/dev/multiSeat.ts')

  // ONE CLIENT PER SEAT, each with its own session storage. supabase-js keys
  // the persisted session by project, so two clients on one origin share it and
  // the second sign-in evicts the first — which looks exactly like the harness
  // working right up until one seat's requests go out as another.
  check('each seat gets its own session storage',
    /storageKey: `sb-dev-seat-\$\{seat\}`/.test(harness), true)
  check('...and its own client', /createClient\(/.test(harness), true)
  // Signed in as itself, with its own credentials.
  check('each seat signs itself in', /signInWithPassword/.test(harness), true)

  // The anon key, which is the key a browser is allowed to hold.
  check('it uses the anon key', /VITE_SUPABASE_ANON_KEY/.test(harness), true)
}

// ── the service-role key never reaches the browser ────────────────────────
// It bypasses RLS. In a page it would not merely let one seat read another's
// secrets, it would open match_decks — the deck order, the one table with no
// policy at all — to anyone with devtools.
{
  const offenders = SRC
    .filter(f => /SERVICE_ROLE|service_role/.test(f.text))
    .map(f => f.path)
  check('no source file mentions the service-role key', offenders, [])

  // The scripts MAY use it — they run on a developer's machine, not in a page.
  // Named here so the rule above reads as "not in src", not "nowhere".
  const script = readFileSync('scripts/check-seat-privacy.mjs', 'utf8')
  check('...though the privacy check still does, as it must',
    script.includes('SUPABASE_SERVICE_ROLE_KEY'), true)
}

// ── the server still decides who is acting ────────────────────────────────
// The acting seat is derived from the JWT. A parameter naming the seat would be
// a second source of truth, and unlike the harness it would ship.
{
  const fn = readFileSync('supabase/functions/dune-action/index.ts', 'utf8')
  check('the edge function derives the seat from the caller',
    /factionOfSeat\[playerId/.test(fn) || /factionOfSeat/.test(fn), true)
  check('...and takes no seat from the request body',
    /body[^\n]*\b(actAs|asSeat|impersonate)\b/i.test(fn), false)
  check('...nor any impersonation parameter at all',
    /\b(actAs|impersonate|onBehalfOf)\b/.test(fn), false)
}

// ── the secrets channel is per session, and still notices a foreign row ───
{
  const sync = read('src/lib/secretsSync.ts')
  // The client is a PARAMETER now, defaulting to the app's. That is what lets
  // the harness listen as several seats without anything else changing.
  check('the sync can listen on a given session',
    /client\?: SupabaseClient/.test(sync), true)
  check('...defaulting to the app\'s own', /handlers\.client \?\? supabase/.test(sync), true)

  // AND IT STILL WATCHES FOR A ROW THAT IS NOT ITS OWN. The harness is the one
  // place several seats are live at once, so it is the best placed to notice
  // RLS failing — and it passes its own seat in so that it does.
  const harness = read('src/dev/multiSeat.ts')
  check('each seat says which row is its own', /expectPlayerId: playerId/.test(harness), true)
  // AND IT ASKS THE ROSTER WHICH ROW THAT IS. The env line names an account;
  // it named the player_id too until the lobby began keying seats by the
  // account, at which point the guess read an empty hand in silence.
  // ...OFF ITS OWN ROSTER ROW, NARROWED BY USER. match_secrets is
  // read-your-own; match_players is read-your-TABLE's, because six people can
  // see who is sitting at it. A lookup filtered only by match therefore
  // returns all six rows, maybeSingle() refuses a set that size, and every
  // seat concludes it holds no seat — six empty hands from one missing clause.
  check('...having read the key off its own roster row',
    [/from\('match_players'\)[\s\S]{0,200}select\('player_id'\)/.test(harness),
      /this account holds no seat in that match/.test(harness)],
    [true, true])
  check('...narrowed by user, which RLS does not do for the roster',
    /select\('player_id'\)[\s\S]{0,160}\.eq\('user_id',/.test(harness), true)
  check('...and treats another seat\'s row as a failure',
    /onForeignRow[\s\S]{0,200}RLS is not holding/.test(harness), true)
}

// ── nothing outside the dev views reaches for it ──────────────────────────
{
  // VALUE imports only. `import type` is erased before a bundler ever sees it,
  // so a file naming SeatSession for its props pulls in nothing — and the
  // switcher does exactly that, deliberately. Counting both made this rule fail
  // on a file that cannot reach the harness at runtime even in principle.
  const valueImport = (text: string) =>
    /(^|\n)import\s+(?!type\b)[^\n]*from '(@\/dev\/multiSeat|\.\.\/\.\.\/dev\/multiSeat)'/.test(text)
  const importers = SRC.filter(f => valueImport(f.text)).map(f => f.path).sort()
  check('only the dev view imports the harness',
    importers, ['src/components/dune/DuneMultiSeatView.tsx'])

  // The switcher takes sessions as a prop rather than reaching for them, so it
  // is a view of whatever it is handed and cannot widen anything by itself.
  const switcher = read('src/components/dune/DevSeatSwitcher.tsx')
  check('the switcher only renders what it is given',
    /import type \{ SeatSession \}/.test(switcher) && !/startMultiSeat/.test(switcher), true)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')
process.exit(pass ? 0 : 1)
