// A stored campaign that is missing a field must not take the app down.
//
// WHAT HAPPENED. scripts/seed-dune-match.mjs minted a campaign per run with
// `legacy_state: {}`, because matches.campaign_id was NOT NULL and a Dune match
// had to be filed under something. Those rows showed up in RISK'S campaign
// picker beside real campaigns. Opening one put a state with no `scars` in
// front of BetweenGameScreen, which reads `legacy.scars.length` unguarded.
//
// React unmounts the whole tree on a render error, so the app went white and
// the last frame stayed on screen — which is why it was reported as a hang
// rather than as an error. Ten of those rows had accumulated.
//
// TWO FIXES, and this suite is about the first: the loader fills in whatever
// the blob is missing, so no stored state can crash a screen however it got
// written. The second is that the seed no longer writes such rows.
//
// The blob is JSON written by whatever last saved it — including older versions
// of this app, and anything else that ever inserted a campaigns row. Trusting
// its shape is the mistake; this is where that stops.
import { readFileSync } from 'node:fs'
import { hydrateLegacyState, defaultLegacyState } from '@/lib/legacyApi'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}
const code = (path: string) => readFileSync(path, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// ── the empty blob, which is the one that crashed ─────────────────────────
{
  const filled = hydrateLegacyState({}, 'dune-seed-abc')

  // EVERY FIELD THE SCREEN INDEXES INTO. Checked as a group rather than one at
  // a time, because the failure is not "scars is missing" — it is "some array
  // this screen reaches for is missing", and next time it will be another one.
  const arrays = ['scars', 'stickers', 'unlockedContent', 'roster', 'destroyedCities',
    'destroyedHqs', 'renamedTerritories', 'continentBonusModifiers', 'removedCardIds',
    'dealtScars', 'historyLog', 'victoryLog'] as const
  const notArray = arrays.filter(k => !Array.isArray((filled as unknown as Record<string, unknown>)[k]))
  check('an empty blob comes back with every list it should have', notArray, [])

  // THE EXACT READ THAT THREW, spelled out: BetweenGameScreen.tsx does
  // legacy.scars.length, unguarded, on the campaign screen.
  check('...so the read that took the app down now works', filled.scars.length, 0)
  check('...and the two beside it', [filled.stickers.length, filled.unlockedContent.length], [0, 0])

  // NOTHING IS MISSING AT ALL, compared against the default rather than against
  // a list written here — a list would go stale the first time a field was
  // added, and go stale silently.
  const missing = Object.keys(defaultLegacyState())
    .filter(k => !(k in (filled as unknown as Record<string, unknown>)))
  check('...and no field of a campaign is absent', missing, [])
}

// ── the row wins, including its id ────────────────────────────────────────
{
  // THE ID IS THE ROW'S PRIMARY KEY, whatever the blob says. defaultLegacyState
  // mints a fresh one every call, and letting that through would rename
  // somebody's campaign on load — the id is what every later write is keyed by.
  check('the campaign keeps the id it was loaded from',
    hydrateLegacyState({}, 'camp-1').campaignId, 'camp-1')
  check('...even when the blob disagrees',
    hydrateLegacyState({ campaignId: 'stale' }, 'camp-1').campaignId, 'camp-1')
  check('...and falls back to the blob when no id is given',
    hydrateLegacyState({ campaignId: 'from-blob' }).campaignId, 'from-blob')

  // AND EVERYTHING ELSE THE BLOB HAS IS KEPT. A hydration that overwrote real
  // data with defaults would be worse than the crash: it would look like it
  // worked and lose a campaign.
  const real = hydrateLegacyState({
    worldName: 'Arrakis', currentGameNumber: 4,
    scars: [{ type: 'a', territoryId: 't', appliedInGame: 1 }],
  } as never, 'camp-2')
  check('a real campaign keeps its name', real.worldName, 'Arrakis')
  check('...its game number', real.currentGameNumber, 4)
  check('...and its own scars rather than an empty list', real.scars.length, 1)
}

// ── anything at all, without throwing ─────────────────────────────────────
// The blob is whatever is in the column. A row written by something that is
// not this app is not a hypothetical — that is exactly how this happened.
{
  for (const [what, raw] of [
    ['null', null], ['undefined', undefined], ['a number', 7],
    ['a string', 'not a state'], ['an array', []], ['true', true],
  ] as const) {
    let ok = true
    try { hydrateLegacyState(raw, 'c') } catch { ok = false }
    check(`${what} in the column does not throw`, ok, true)
  }
  check('...and still yields a usable list',
    Array.isArray(hydrateLegacyState('rubbish', 'c').scars), true)

  // AND CONTRIBUTES NOTHING OF ITSELF. Spreading a string gives {0:'r',1:'u'…};
  // spreading a number gives {}. Neither throws, so "does it throw" was a check
  // that could not fail — the guard's actual job is to stop a value that is not
  // a campaign from putting keys into one.
  const fromString = hydrateLegacyState('rubbish', 'c') as unknown as Record<string, unknown>
  check('a string contributes no keys of its own',
    Object.keys(fromString).filter(k => /^\d+$/.test(k)), [])
  check('...and the campaign is otherwise the default',
    Object.keys(fromString).length, Object.keys(defaultLegacyState()).length)
}

// ── the loader actually uses it ───────────────────────────────────────────
// The function being right does not make the screen safe. The whole failure
// was a loader handing the raw blob straight to React.
{
  const api = code('src/lib/legacyApi.ts')
  check('the loader hydrates what it read',
    /const ls = hydrateLegacyState\(row\.legacy_state, campaignId\)/.test(api), true)
  check('...rather than taking the blob raw',
    /const ls = row\.legacy_state\b/.test(api), false)
}

// ── and the seed stops making them ────────────────────────────────────────
// The other half. The loader means no stored state can crash a screen; this
// means these particular ones stop being written.
{
  const seed = code('scripts/seed-dune-match.mjs')
  check('the seed writes no campaign row', /from\('campaigns'\)\.insert/.test(seed), false)
  check('...and files its match under none', /campaign_id: null,/.test(seed), true)
  check('...with nothing left writing an empty legacy state',
    /legacy_state: \{\}/.test(seed), false)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
