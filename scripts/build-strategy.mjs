// Turn docs/Strategy.md into data the app can import.
//
// HOW THE MARKDOWN GETS IN. It does not — not at runtime. The document is
// parsed here, once, and written out as a TypeScript module that the app
// imports like any other data file. Three other routes were possible and this
// is the one that fits what is already here:
//
//   Import it with Vite's `?raw` and parse in the browser. The tests bundle
//   with esbuild and no raw loader is configured, so every suite that touched a
//   component reading it would fail to build; a malformed document would show
//   up as a blank card mid-game rather than as a failed build; and every client
//   would ship a parser it runs once.
//
//   Fetch it from public/. Same runtime parse, plus a network request, plus the
//   document has to be published to be read.
//
//   Type it into a .ts file by hand. That is a fork the moment either copy is
//   edited, and the document is the thing the wording is being drafted in.
//
// So: generated, checked in, and the checked-in copy is verified against the
// document by `npm run verify:strategy` — which tests/strategycardtest runs, so
// an edit to the markdown that nobody regenerated fails the suite rather than
// shipping stale text. Same shape as scripts/build-edge-shared.mjs, for the
// same reason.
//
//   npm run build:strategy     regenerate
//   npm run verify:strategy    fail if the checked-in copy is stale
//
// THE DOCUMENT'S SHAPE is three lines per faction, separated by blank lines:
// the faction's name, who they are, and a line beginning "Strategy:". The
// faction id is derived from the heading rather than looked up in a table here
// — 'Spacing Guild' → 'spacing-guild' — so this script holds no second list of
// the six factions to drift from the real one. A heading that maps to no
// faction is caught by the Record<FactionId, …> in the generated file, which
// tsc rejects, and by strategycardtest, which compares the keys against
// FACTION_IDS.
//
// The text is copied VERBATIM apart from collapsing runs of whitespace, which
// HTML would collapse anyway. Typos in the document are typos on the card: the
// document is the source, and correcting prose here would be the fork this
// script exists to avoid.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = 'docs/Strategy.md'
const OUT = 'src/data/dune/strategy.gen.ts'

const fail = (message) => {
  console.error(`FAILED: ${SRC} — ${message}`)
  process.exit(1)
}

const raw = readFileSync(resolve(root, SRC), 'utf8').replace(/\r\n/g, '\n')
const blocks = raw.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean)

if (blocks.length === 0) fail('no faction blocks found')

const entries = []
for (const block of blocks) {
  const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length !== 3) {
    fail(`"${lines[0]}" has ${lines.length} lines, expected 3 `
      + '(the faction, who they are, and a line beginning "Strategy:")')
  }
  const [heading, flavour, strategyLine] = lines
  if (!/^Strategy:/i.test(strategyLine)) {
    fail(`"${heading}" has no line beginning "Strategy:"`)
  }
  const strategy = strategyLine.replace(/^Strategy:\s*/i, '').trim()
  if (!strategy) fail(`"${heading}" has an empty strategy`)
  if (!flavour) fail(`"${heading}" says nothing about who they are`)

  const id = heading.toLowerCase().replace(/\s+/g, '-')
  if (entries.some(e => e.id === id)) fail(`two blocks head themselves "${heading}"`)

  const tidy = (s) => s.replace(/\s+/g, ' ').trim()
  entries.push({ id, heading: tidy(heading), flavour: tidy(flavour), strategy: tidy(strategy) })
}

const banner = `// AUTO-GENERATED — DO NOT EDIT.
//
// Built from ${SRC} by scripts/build-strategy.mjs.
// Edit the document and re-run \`npm run build:strategy\`.
//
// tests/strategycardtest runs \`--check\` against the document, so an edit
// nobody regenerated fails the suite rather than shipping stale text.
import type { FactionId } from '@/types/Dune/Faction'

/** One faction's page of the strategy notes. */
export interface FactionStrategy {
  /** The faction, as the document heads its section. */
  heading: string
  /** Who they are: the line under the heading. */
  flavour: string
  /** How to play them: the line beginning "Strategy:", with that word dropped. */
  strategy: string
}
`

const body = `
export const FACTION_STRATEGY: Record<FactionId, FactionStrategy> = {
${entries.map(e => `  '${e.id}': {
    heading: ${JSON.stringify(e.heading)},
    flavour: ${JSON.stringify(e.flavour)},
    strategy: ${JSON.stringify(e.strategy)},
  },`).join('\n')}
}
`

const contents = banner + body

const outPath = resolve(root, OUT)
if (process.argv.includes('--check')) {
  let onDisk = null
  try { onDisk = readFileSync(outPath, 'utf8') } catch { onDisk = null }
  if (onDisk !== contents) {
    console.error(`FAILED: ${OUT} is stale. Run \`npm run build:strategy\`.`)
    process.exit(1)
  }
  console.log(`${OUT} is up to date — ${entries.length} factions`)
} else {
  writeFileSync(outPath, contents)
  console.log(`wrote ${OUT} — ${entries.map(e => e.id).join(', ')}`)
}
