// Battle backgrounds: artwork for a phase that does not exist yet.
//
// WHY THIS EXISTS. public/dune-battle holds backdrops for the Battle Phase,
// which is not built. Nothing points at them, so nothing would notice a file
// that was misspelt, truncated, or dropped in and forgotten — and "dropped in
// and forgotten" is not hypothetical here. Five Atreides leader portraits sat
// in public/dune-leaders unreferenced while the game screen showed five blank
// discs, and Paul's and Liet-Kynes's arrived the same way; the check that
// finally caught those is the one this copies.
//
// So the folder is enumerated one by one. Adding a file fails this suite until
// somebody says what it is, which is the point rather than an inconvenience.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { DUNE_TERRITORIES } from '@/data/dune/boardData'
import { FACTION_IDS } from '@/data/dune/factions'
import { FACTION_LOOK } from '@/components/dune/SeatLayer'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

const DIR = 'public/dune-battle'

/**
 * Every backdrop, named one at a time.
 *
 * NOT A PATTERN THAT WAVES THEM THROUGH. Each entry is somebody having looked
 * at that file and said which place it shows — which is the opposite of the
 * mistake this suite exists to catch, where a picture sits in a folder and
 * nothing says whether anybody meant it to be there.
 */
const BACKDROPS = [
  'Arrakeen.jpg',
  'Arrakeen-Atreides.jpg',
  'Carthag.jpg',
  'Carthag-Harkonnen.jpg',
]

const files = readdirSync(DIR).filter(f => !f.endsWith('.md'))

// ── the folder is what it says it is ──────────────────────────────────────
{
  check('every backdrop listed is actually there',
    BACKDROPS.filter(f => !files.includes(f)), [])
  // AND NOTHING ELSE IS. A file nobody has claimed is a file nobody will
  // notice is missing from a screen that has not been written yet.
  check('...and nothing is there that is not listed',
    files.filter(f => !BACKDROPS.includes(f)), [])

  // The note travels with the pictures, because there is no code to put it in.
  check('the folder explains itself', existsSync(`${DIR}/README.md`), true)
}

// ── the names mean something ──────────────────────────────────────────────
// <Territory>.jpg, or <Territory>-<Faction>.jpg. Both halves are matched
// against the game's own data, so a misspelt file is caught now rather than as
// a battle that loads no picture.
{
  const territories = new Map(DUNE_TERRITORIES.map(t => [t.displayName, t.id]))
  const factions = new Map(FACTION_IDS.map(f => [FACTION_LOOK[f].name, f]))

  const parse = (file: string) => {
    const stem = file.replace(/\.jpg$/, '')
    const dash = stem.indexOf('-')
    return dash < 0
      ? { place: stem, faction: null as string | null }
      : { place: stem.slice(0, dash), faction: stem.slice(dash + 1) }
  }

  const unknownPlace = BACKDROPS.filter(f => !territories.has(parse(f).place))
  check('every backdrop names a territory the board has', unknownPlace, [])

  const unknownFaction = BACKDROPS
    .map(parse)
    .filter(p => p.faction !== null && !factions.has(p.faction))
    .map(p => p.faction)
  check('...and every faction variant names a faction in the game', unknownFaction, [])

  // A FACTION VARIANT NEEDS ITS PLAIN COUNTERPART. A battle in Arrakeen where
  // the Atreides are not present still has to draw Arrakeen.
  const orphanedVariants = BACKDROPS
    .map(parse)
    .filter(p => p.faction !== null && !BACKDROPS.includes(`${p.place}.jpg`))
    .map(p => `${p.place}-${p.faction}.jpg`)
  check('...and no faction variant stands alone', orphanedVariants, [])

  // WHAT IS COVERED SO FAR. Printed rather than asserted: the folder is being
  // filled a few at a time and a missing stronghold is a gap, not a fault.
  const strongholds = DUNE_TERRITORIES.filter(t => t.stronghold)
  const covered = strongholds.filter(t => BACKDROPS.includes(`${t.displayName}.jpg`))
  console.log(`        backdrops for ${covered.length} of ${strongholds.length} strongholds: `
    + `${covered.map(t => t.displayName).join(', ')}`)
  console.log('        still to draw: '
    + strongholds.filter(t => !covered.includes(t)).map(t => t.displayName).join(', '))
}

// ── they are real pictures ────────────────────────────────────────────────
// An empty or truncated file looks exactly like a missing one on screen, and
// this folder will not be on a screen for a while — so it is checked by magic
// bytes rather than by extension, and by size rather than by existing.
{
  const broken = BACKDROPS.filter(f => {
    const bytes = readFileSync(`${DIR}/${f}`)
    if (bytes.length <= 2048) return true
    return !(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
  })
  check('every backdrop is a JPEG with something in it', broken, [])
}

// ── and nothing is using them yet ─────────────────────────────────────────
// THE STALE GUARD. The README says the Battle Phase does not exist. When it
// does, and something finally points at this folder, this check fails — which
// is the prompt to rewrite that note rather than leave it describing a state
// of affairs that ended months ago.
//
// Failing on GOOD news is unusual and deliberate. The alternative is a README
// that quietly becomes wrong, and a folder whose rules nobody re-reads.
{
  const src: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`
      if (entry.isDirectory()) walk(path)
      else if (/\.(ts|tsx)$/.test(entry.name)) src.push(readFileSync(path, 'utf8'))
    }
  }
  walk('src')
  const referenced = src.some(text => text.includes('dune-battle'))
  check('nothing in the app points at these yet — see the README when it does',
    referenced, false)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
