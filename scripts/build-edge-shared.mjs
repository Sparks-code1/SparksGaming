// Generate the Deno-side copy of the rules engine from the SAME source the
// client uses.
//
// The edge function needs `gameReducer`, but Deno cannot resolve Vite's `@/`
// alias and the repo is not published as a package. The obvious workaround is
// to copy src/lib/gameReducer.ts into supabase/functions/_shared/ by hand — and
// a hand-copied rules engine is a fork. The moment the two disagree the server
// and the client are playing different games, which is the one failure this
// whole architecture exists to prevent.
//
// So it is GENERATED. esbuild bundles the reducer and its handful of runtime
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
const OUT = resolve(root, 'supabase/functions/_shared/gameReducer.gen.ts')

const BANNER = `// AUTO-GENERATED — DO NOT EDIT.
//
// Built from src/lib/gameReducer.ts by scripts/build-edge-shared.mjs.
// Edit the source and re-run \`npm run build:edge\`.
//
// This is the exact rules engine the client runs. The server MUST run the same
// bytes: a divergence here is two machines playing different games while both
// believe they agree.
`

const result = await build({
  entryPoints: [resolve(root, 'src/lib/gameReducer.ts')],
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
writeFileSync(OUT, BANNER + '\n' + code)

// Guard against the bundle quietly acquiring a runtime dependency. The reducer
// is meant to be pure; if someone imports Supabase or a browser API into it,
// the edge function breaks at deploy time instead of here.
const forbidden = [/from ["']react/, /from ["']@supabase/, /from ["']pixi/, /require\(/, /process\.env/]
const offenders = forbidden.filter(re => re.test(code))
if (offenders.length > 0) {
  console.error('FAILED: the reducer bundle pulled in a runtime dependency:', offenders.map(String).join(', '))
  process.exit(1)
}
if (!/export\s*\{[^}]*gameReducer/.test(code)) {
  console.error('FAILED: gameReducer is not exported from the bundle')
  process.exit(1)
}

const lines = code.split('\n').length
console.log(`wrote ${OUT.replace(root + '\\', '').replace(/\\/g, '/')} — ${lines} lines, no runtime deps`)

// `--check` mode for CI / pre-deploy: fail if the checked-in copy is stale.
if (process.argv.includes('--check')) {
  const onDisk = readFileSync(OUT, 'utf8')
  if (onDisk !== BANNER + '\n' + code) {
    console.error('FAILED: the checked-in bundle is stale. Run `npm run build:edge`.')
    process.exit(1)
  }
  console.log('bundle is up to date')
}
