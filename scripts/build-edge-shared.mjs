// Generate the Deno-side copies of shared logic from the SAME source the
// client uses.
//
// The edge function needs `gameReducer`, and now also the state projections
// that decide what may go in the shared row. Deno cannot resolve Vite's `@/`
// alias and the repo is not published as a package. The obvious workaround is
// to copy the files into supabase/functions/_shared/ by hand — and a hand-copied
// rules engine is a fork. The moment the two disagree the server and the client
// are playing different games, which is the one failure this whole architecture
// exists to prevent.
//
// That argument applies twice over to the projections. If the server's idea of
// what is public drifts from the client's, the client asserts against a rule the
// server is no longer following, and the disagreement shows up as a privacy leak
// rather than as a broken build.
//
// So they are GENERATED. esbuild bundles each entry and its handful of runtime
// imports into one dependency-free ESM file. Type-only imports are erased, so
// nothing from React/PixiJS/Supabase can leak in. Run it before deploying:
//
//   npm run build:edge
//
// The output is checked in (Supabase deploys from the working tree) but must
// never be edited — `npm run verify:edge` fails the build if it is stale.
import { build } from 'esbuild'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const TARGETS = [
  {
    entry: 'src/lib/gameReducer.ts',
    out: 'supabase/functions/_shared/gameReducer.gen.ts',
    what: 'rules engine',
    // The server MUST run the same bytes: a divergence here is two machines
    // playing different games while both believe they agree.
    mustExport: /export\s*\{[^}]*gameReducer/,
    exportName: 'gameReducer',
  },
  {
    entry: 'src/lib/dune/bidding.ts',
    out: 'supabase/functions/_shared/duneBidding.gen.ts',
    what: 'treachery auction',
    mustExport: /beginAuction/,
    exportName: 'beginAuction',
  },
  {
    entry: 'src/lib/dune/treacheryDeck.ts',
    out: 'supabase/functions/_shared/duneDeck.gen.ts',
    what: 'treachery deck',
    mustExport: /drawTreachery/,
    exportName: 'drawTreachery',
  },
  {
    entry: 'src/lib/dune/auctionSettlement.ts',
    out: 'supabase/functions/_shared/duneAuction.gen.ts',
    what: 'auction settlement',
    // The one place cards and payment are decided together. A second copy on
    // the server could deal a card the client thinks was refused.
    mustExport: /export\s*\{[^}]*settleAuction/,
    exportName: 'settleAuction',
  },
  {
    entry: 'src/lib/dune/spice.ts',
    out: 'supabase/functions/_shared/duneSpice.gen.ts',
    what: 'spice ledger',
    // A second implementation on the server would be a second answer to
    // "did that purse have enough", and the two would disagree the first
    // time either was fixed.
    mustExport: /export\s*\{[^}]*applySpiceMoves/,
    exportName: 'applySpiceMoves',
  },
  {
    entry: 'src/lib/stateView.ts',
    out: 'supabase/functions/_shared/stateView.gen.ts',
    what: 'state projections',
    // publicView decides what goes in the row every client can read. If the
    // server stops applying it, every hand is public again.
    mustExport: /export\s*\{[^}]*publicView/,
    exportName: 'publicView',
  },
]

const bannerFor = t => `// AUTO-GENERATED — DO NOT EDIT.
//
// Built from ${t.entry} by scripts/build-edge-shared.mjs.
// Edit the source and re-run \`npm run build:edge\`.
//
// This is the exact ${t.what} the client runs. The server MUST run the same
// bytes: a divergence here is two machines disagreeing while both believe they
// agree.
`

// A bundle that quietly acquires a runtime dependency breaks at deploy time
// rather than here, so the shapes that could cause it are refused up front.
const FORBIDDEN = [/from ["']react/, /from ["']@supabase/, /from ["']pixi/, /require\(/, /process\.env/]

const check = process.argv.includes('--check')
let stale = false

for (const t of TARGETS) {
  const outPath = resolve(root, t.out)
  const result = await build({
    entryPoints: [resolve(root, t.entry)],
    bundle: true,
    format: 'esm',
    // 'neutral' so esbuild injects no Node or browser shims — the output has to
    // run on Deno with nothing polyfilled.
    platform: 'neutral',
    target: 'es2022',
    alias: { '@': resolve(root, 'src') },
    write: false,
    // Readable output: this is checked in, and a reviewer has to be able to see
    // that the server's rules are the ones they reviewed.
    minify: false,
    legalComments: 'none',
  })

  const code = result.outputFiles[0].text
  const contents = bannerFor(t) + '\n' + code

  const offenders = FORBIDDEN.filter(re => re.test(code))
  if (offenders.length > 0) {
    console.error(`FAILED: ${t.entry} pulled in a runtime dependency:`, offenders.map(String).join(', '))
    process.exit(1)
  }
  if (!t.mustExport.test(code)) {
    console.error(`FAILED: ${t.exportName} is not exported from the ${t.entry} bundle`)
    process.exit(1)
  }

  if (check) {
    const onDisk = readFileSync(outPath, 'utf8')
    if (onDisk !== contents) {
      console.error(`FAILED: ${t.out} is stale. Run \`npm run build:edge\`.`)
      stale = true
    } else {
      console.log(`${t.out} is up to date`)
    }
    continue
  }

  writeFileSync(outPath, contents)
  console.log(`wrote ${t.out} — ${code.split('\n').length} lines, no runtime deps`)
}

if (stale) process.exit(1)
