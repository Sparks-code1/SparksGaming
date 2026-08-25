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
import type { FactionId } from '@/types/Dune/Faction'
import { LEADER_PORTRAITS, LeaderDisc } from '@/components/dune/LeaderDisc'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
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
 * A FACTION'S OWN FIGURE IS NOT ONE OF ITS LEADERS, and three of these are
 * that. The Baron is the Harkonnen player and has no disc; the Emperor is the
 * same, his five being Hasimir Fenring, Captain Aramsham, Caid, Burseg and
 * Bashar; and Reverend Mother Mohiam is the Bene Gesserit's, theirs being
 * Mother Ramallo, Wanna Yueh, Margot Lady Fenring, Princess Irulan and Alia.
 * Each is the person their faction IS, which is exactly why none of them takes
 * a disc and fights.
 *
 * EDRIC IS THE ODD ONE OUT, and the distinction is worth keeping rather than
 * flattening into "not a leader". He is a Guild navigator — not the Guild's
 * own figure either, that being the Guild Representative, who IS one of their
 * five and does have a portrait. Edric is simply held for something later.
 *
 * All four are kept for screens that do not exist yet.
 *
 * NAMED ONE BY ONE, not waved through by a pattern. Each entry is a claim that
 * somebody looked at that file and decided it belongs to nobody — which is the
 * opposite of the mistake this suite exists to catch, where a portrait sits in
 * the folder unregistered and nothing says whether that was meant. A second
 * stray file still fails, because the list is exact.
 */
const NOT_A_LEADER = ['Baron.png', 'Edric.png', 'Emperor.png', 'Mother_Mohiam.png']

const everyLeader = FACTION_IDS.flatMap(id =>
  (factionById(id)?.leaders ?? []).map(l => ({ ...l, faction: id })))

// ── the exclusions mean something ─────────────────────────────────────────
// The list is enumerated one by one so each entry is a claim somebody made
// about a file. That is only worth anything while every entry is doing work: a
// name whose file has gone, or a name that is ALSO registered as a leader's
// portrait, is an entry that excludes nothing and quietly makes the list
// longer and less trustworthy.
//
// Sabotage found the second case — adding a registered portrait to the list
// changed no outcome, because a registered file never appears in the
// pointing-at-nobody list to be excluded from in the first place.
{
  const missing = NOT_A_LEADER.filter(f => !files.includes(f))
  check('every excluded file is actually there', missing, [])

  const registered = new Set(Object.values(LEADER_PORTRAITS).map(p => p.src.split('/').pop()))
  const both = NOT_A_LEADER.filter(f => registered.has(f))
  check('...and none of them is a registered portrait too', both, [])
}

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
// Not a pass/fail on completeness. It prints, so a faction quietly losing its
// portraits is visible in the run rather than only on the screen.
{
  for (const id of FACTION_IDS) {
    const leaders = factionById(id)?.leaders ?? []
    const with_ = leaders.filter(l => LEADER_PORTRAITS[l.name]).length
    console.log(`        ${id.padEnd(15)} ${with_}/${leaders.length} portraits`)
  }
  // THE FALLBACK IS TESTED DIRECTLY, against a leader that does not exist.
  //
  // This used to assert `total < everyLeader.length` — that SOME leader still
  // had no art, so the plain-counter path was being exercised somewhere. That
  // was a proxy, and it held only while the artwork was incomplete: the last
  // two Guild portraits arriving turned a passing check into a failing one
  // without anything about the fallback changing. A check that breaks when the
  // game gets MORE finished is measuring the wrong thing.
  const nameless = { name: 'Nobody At All', strength: 3 }
  const plain = renderToStaticMarkup(createElement(LeaderDisc, {
    leader: nameless, faction: 'atreides' as FactionId, r: 40,
  }))
  check('a leader with no portrait still renders as a plain counter',
    plain.includes('Nobody At All — strength 3'), true)
  check('...showing its strength', plain.includes('3'), true)
  check('...and no image', /<image/.test(plain), false)
}

// ── the other side of the disc ───────────────────────────────────────────
// A leader disc is TWO-SIDED and both sides get used: leaders go face down in
// the Tleilaxu Tanks when they are killed. Face down is not "not rendered" —
// it is a disc you can still see and still tell the owner of. Which faction
// lost a leader is public; WHICH leader is not always, and that is the whole
// difference between the two sides.
{
  for (const id of FACTION_IDS) {
    const leader = factionById(id)?.leaders[0]
    if (!leader) continue
    const down = renderToStaticMarkup(createElement(LeaderDisc, {
      leader, faction: id, r: 40, faceDown: true,
    }))
    // THE MARK, so a disc in the tanks is recognisably the faction whose seat
    // it came from — the same drawing, not a second one.
    check(`${id}: the back carries the faction`,
      down.includes(`data-faction="${id}"`) && down.includes('data-face="down"'), true)
    // AND NOT THE LEADER. A face-down disc that names the leader is a disc
    // that is not face down, and nothing about the picture would say so.
    check(`...and not who the leader is`,
      down.includes(leader.name) || down.includes(`strength ${leader.strength}`), false)

    // The front still does both, or the check above passes on a disc that
    // never says anything.
    const up = renderToStaticMarkup(createElement(LeaderDisc, {
      leader, faction: id, r: 40,
    }))
    check(`...while the front still names them`,
      up.includes(`${leader.name} — strength ${leader.strength}`), true)
  }
}
console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')
process.exit(pass ? 0 : 1)
