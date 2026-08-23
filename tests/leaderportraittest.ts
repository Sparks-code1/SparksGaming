// Leader portraits: the table, and the folder it points at.
//
// WHY THIS EXISTS. Five Atreides portraits sat in public/dune-leaders with
// nothing pointing at them, and the game screen — which opens on the Atreides
// seat — showed five blank discs beside a traitor panel showing portraits. The
// component was right, the artwork was there, and the only thing missing was a
// row in a table. Nothing in the suite referenced that table, so nothing said
// so; it took somebody looking at the screen and asking.
//
// Both directions are checked, because each catches a different mistake:
//
//   A registered file that is not on disk is a broken image, and a broken image
//   inside an <image> tag in an SVG renders as NOTHING — not a placeholder, not
//   an error, just a disc with no face. Indistinguishable from a leader who has
//   no portrait yet.
//
//   A file on disk that nothing registers is the case above: art that was drawn,
//   committed, and never appeared.
import { readdirSync, existsSync } from 'node:fs'
import { LEADER_PORTRAITS } from '@/components/dune/LeaderDisc'
import { FACTION_IDS, factionById } from '@/data/dune/factions'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

const DIR = 'public/dune-leaders'
const files = readdirSync(DIR).filter(f => f.endsWith('.png'))

/**
 * Artwork that deliberately matches no leader.
 *
 * The Baron has no disc in Dune — he is the Harkonnen player, not one of their
 * five leaders. The file is kept for a faction-selection screen that does not
 * exist yet, and is named here so it does not read as an oversight and so a
 * SECOND stray file still fails.
 */
const NOT_A_LEADER = ['Baron.png']

const everyLeader = FACTION_IDS.flatMap(id =>
  (factionById(id)?.leaders ?? []).map(l => ({ ...l, faction: id })))

// ── the table points at files that exist ──────────────────────────────────
{
  check('there are portraits to check', Object.keys(LEADER_PORTRAITS).length > 0, true)
  const missing = Object.entries(LEADER_PORTRAITS)
    .filter(([, p]) => !existsSync('public' + p.src))
    .map(([name]) => name)
  check('every registered portrait is on disk', missing, [])

  // The path is served from public/, so it must be absolute from the web root.
  // A relative one resolves against whatever page is open and works on exactly
  // one route.
  check('...by an absolute path',
    Object.entries(LEADER_PORTRAITS).filter(([, p]) => !p.src.startsWith('/')).map(([n]) => n), [])
}

// ── every leader whose art exists is registered ───────────────────────────
// THE ONE THAT WAS MISSING. Matching is by file stem against the leader's name
// with the same punctuation dropped, which is loose on purpose: the folder
// spells them Gurney_halleck, Dr_Wellington_Yueh and — for the Emperor's Bashar
// — Bushar. A strict match would report every one of those as "no art" and be
// no use at all.
{
  const key = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')
  const stems = new Map(files.map(f => [key(f.replace(/\.png$/, '')), f]))

  const unregistered = everyLeader
    .filter(l => !LEADER_PORTRAITS[l.name])
    .filter(l => stems.has(key(l.name)))
    .map(l => `${l.name} (${stems.get(key(l.name))})`)
  check('no leader has artwork nobody points at', unregistered, [])

  // And the reverse: a file matching no leader at all. One is expected.
  const claimed = new Set(Object.values(LEADER_PORTRAITS).map(p => p.src.split('/').pop()))
  const orphans = files.filter(f => !claimed.has(f) && !NOT_A_LEADER.includes(f))
  check('no artwork is left pointing at nobody', orphans, [])
}

// ── the entries describe the pictures they name ───────────────────────────
// w and h are what the zoom is computed against — see LeaderDisc — so a wrong
// aspect ratio crops the face rather than failing. Read from the PNG header
// rather than trusted.
{
  const { readFileSync } = await import('node:fs')
  const wrong: string[] = []
  for (const [name, p] of Object.entries(LEADER_PORTRAITS)) {
    const buf = readFileSync('public' + p.src)
    // IHDR is the first chunk: width and height are bytes 16..24.
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20)
    if (w !== p.w || h !== p.h) wrong.push(`${name} says ${p.w}x${p.h}, file is ${w}x${h}`)
  }
  check('every entry states the picture\'s real size', wrong, [])

  // The focus is a fraction of the height. Outside 0..1 it points off the
  // picture, and the shift uncovers faction colour behind the portrait.
  check('every focus is on the picture',
    Object.entries(LEADER_PORTRAITS)
      .filter(([, p]) => p.focusY != null && (p.focusY < 0 || p.focusY > 1))
      .map(([n]) => n), [])
}

// ── how much of the game is covered ───────────────────────────────────────
// Not a pass/fail on completeness — the Spacing Guild has no art yet and that
// is fine. It prints, so a faction quietly losing its portraits is visible in
// the run rather than only on the screen.
{
  for (const id of FACTION_IDS) {
    const leaders = factionById(id)?.leaders ?? []
    const with_ = leaders.filter(l => LEADER_PORTRAITS[l.name]).length
    console.log(`        ${id.padEnd(15)} ${with_}/${leaders.length} portraits`)
  }
  const total = everyLeader.filter(l => LEADER_PORTRAITS[l.name]).length
  check('a leader with no portrait still renders as a plain counter',
    total < everyLeader.length, true)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')
process.exit(pass ? 0 : 1)
