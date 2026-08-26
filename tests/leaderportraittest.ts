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
import { FACTION_FIGURES, FigureDisc, portraitPlacement } from '@/components/dune/LeaderDisc'
import type { Portrait } from '@/components/dune/LeaderDisc'
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
 * Two tables, and every picture belongs to one of them.
 *
 * THERE USED TO BE AN EXCLUSION LIST HERE — Baron.png, Edric.png, Emperor.png
 * and Mother_Mohiam.png, four files named one by one as belonging to nobody,
 * "kept for screens that do not exist yet". The strategy card is that screen,
 * and FACTION_FIGURES is where they went, so the list is gone and the rule is
 * absolute again: a file in the folder is claimed by a leader or by a faction,
 * or the suite says so.
 *
 * A FACTION'S OWN FIGURE IS NOT ONE OF ITS LEADERS, which is the whole reason
 * for the second table. The Baron is the Harkonnen PLAYER and has no disc; the
 * Emperor is the same, his five being Hasimir Fenring, Captain Aramsham, Caid,
 * Burseg and Bashar; Mohiam is the Bene Gesserit's, theirs being Mother
 * Ramallo, Wanna Yueh, Margot Lady Fenring, Princess Irulan and Alia; and
 * Edric represents the Guild without being the Guild Representative, who IS one
 * of their five and does fight. None of them takes a disc.
 */
const fileOf = (src: string) => src.split('/').pop()!
const leaderFiles = new Set(Object.values(LEADER_PORTRAITS).map(p => fileOf(p.src)))
const figureFiles = new Set(
  Object.values(FACTION_FIGURES).flatMap(f => (f.portrait ? [fileOf(f.portrait.src)] : [])))

const everyLeader = FACTION_IDS.flatMap(id =>
  (factionById(id)?.leaders ?? []).map(l => ({ ...l, faction: id })))

// ── a figure is not a leader ──────────────────────────────────────────────
// The two tables must not overlap in either direction. The same picture in
// both would put the Baron on a disc in the Tleilaxu Tanks; the same NAME in
// both would mean somebody had made the faction's own figure fight.
{
  check('there are figures to check', figureFiles.size > 0, true)
  check('no figure picture is also a leader portrait',
    [...figureFiles].filter(f => leaderFiles.has(f)).sort(), [])

  const leaderNames = new Set(everyLeader.map(l => l.name))
  check('...and no figure is one of the five who fight',
    Object.values(FACTION_FIGURES).filter(f => leaderNames.has(f.name)).map(f => f.name), [])

  // EVERY faction, including the two with no picture yet: a faction with no
  // figure at all has a strategy card with a blank where it says who they are.
  check('every faction has a figure',
    FACTION_IDS.filter(id => !FACTION_FIGURES[id]?.name), [])
  check('every registered figure picture is on disk',
    [...figureFiles].filter(f => !files.includes(f)), [])
  check('...by an absolute path',
    Object.values(FACTION_FIGURES)
      .filter(f => f.portrait && !f.portrait.src.startsWith('/'))
      .map(f => f.name), [])
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

  // And the reverse: a file claimed by neither table. NONE is expected now —
  // see the note above. Paul and Liet-Kynes have no picture yet, so this is
  // also what will speak up the day one is dropped into the folder and nobody
  // registers it, which is the mistake this whole suite exists to catch.
  const orphans = files.filter(f => !leaderFiles.has(f) && !figureFiles.has(f))
  check('no artwork is left pointing at nobody', orphans, [])
}

// ── the entries describe the pictures they name ───────────────────────────
// w and h are what the zoom is computed against — see LeaderDisc — so a wrong
// aspect ratio crops the face rather than failing. Read from the PNG header
// rather than trusted.
{
  const { readFileSync } = await import('node:fs')
  // BOTH TABLES. The figures are framed by the same three knobs and cropped by
  // the same arithmetic, so a wrong size crops a face there exactly as it does
  // here — and two of the four are the shapes most likely to expose it, the
  // folder's only landscape picture and its tallest.
  const every: [string, Portrait][] = [
    ...Object.entries(LEADER_PORTRAITS),
    ...Object.values(FACTION_FIGURES)
      .flatMap(f => (f.portrait ? [[f.name, f.portrait] as [string, Portrait]] : [])),
  ]
  const wrong: string[] = []
  for (const [name, p] of every) {
    const buf = readFileSync('public' + p.src)
    // IHDR is the first chunk: width and height are bytes 16..24.
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20)
    if (w !== p.w || h !== p.h) wrong.push(`${name} says ${p.w}x${p.h}, file is ${w}x${h}`)
  }
  check('every entry states the picture\'s real size', wrong, [])

  // The focus is a fraction of the height. Outside 0..1 it points off the
  // picture, and the shift uncovers faction colour behind the portrait.
  check('every focus is on the picture',
    every.filter(([, p]) => (p.focusY != null && (p.focusY < 0 || p.focusY > 1))
      || (p.focusX != null && (p.focusX < 0 || p.focusX > 1))).map(([n]) => n), [])

  // ── the crop covers the circle ──────────────────────────────────────────
  // THE PROPERTY THE ARITHMETIC EXISTS FOR, checked against every picture
  // rather than against the formula. A portrait shifted to put a face in the
  // middle must still reach the circle's edge on all four sides; where it does
  // not, faction colour shows through the picture and reads as a rendering
  // fault. Landscape and very tall sources are where a rule of thumb fails,
  // and the figures brought one of each into the folder.
  const R = 50
  check('every picture still covers its circle after the shift',
    every.filter(([, p]) => {
      const box = portraitPlacement(p, R)
      return !(box.x <= -R && box.y <= -R
        && box.x + box.width >= R && box.y + box.height >= R)
    }).map(([n]) => n), [])

  // AND THE SHIFT IS THE ONE THE ENTRY ASKED FOR. Covering is necessary and
  // not sufficient: hard-coding the focus to the middle of every picture still
  // covers every circle, and simply ignores the one knob each entry has. What
  // the focus MEANS is that the point it names lands at the centre of the
  // circle, so that is what is asserted — the numbers here are the difference
  // between a face and a collar.
  check('every picture is shifted to the point its entry names',
    every.filter(([, p]) => {
      const box = portraitPlacement(p, R)
      const atX = (0 - box.x) / box.width
      const atY = (0 - box.y) / box.height
      return Math.abs(atX - (p.focusX ?? 0.5)) > 0.001
        || Math.abs(atY - (p.focusY ?? 0.5)) > 0.001
    }).map(([n]) => n), [])
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
  for (const id of FACTION_IDS) {
    const f = FACTION_FIGURES[id]
    console.log(`        ${id.padEnd(15)} figure: ${f.name}${f.portrait ? '' : ' (no picture yet)'}`)
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

// ── the figure disc ──────────────────────────────────────────────────────
// Two paths, and the one without a picture is the one that will rot: it is the
// state Paul and Liet-Kynes are in today and the state nothing will be in once
// somebody draws them, so it is rendered here rather than relied on.
{
  const drawn = (id: FactionId) =>
    renderToStaticMarkup(createElement(FigureDisc, { faction: id, r: 40 }))

  const baron = drawn('harkonnen' as FactionId)
  check('a figure with a picture draws it', /<image[^>]+Baron\.png/.test(baron), true)
  check('...and says whose face it is', baron.includes('Baron Vladimir Harkonnen'), true)

  const paul = drawn('atreides' as FactionId)
  // NO PORTRAIT — not "no image". The Atreides mark is itself a supplied
  // picture (see IMAGE_MARKS in SeatLayer), so the disc carries an <image>
  // either way; what must not be on it is a face out of the leader folder.
  check('a figure with none draws no portrait',
    /<image[^>]+dune-leaders/.test(paul), false)
  // The faction's mark instead — the same drawing as the back of its leaders'
  // discs, which is what data-face="down" identifies. A bare coloured circle
  // would read as a picture that failed to load.
  check('...and falls back to the faction mark', paul.includes('data-face="down"'), true)
  check('...while still naming them', paul.includes('Paul Atreides'), true)
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
