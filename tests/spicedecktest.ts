// The spice deck area: what is drawn in the box, and what is not.
//
// The box on the board used to be the Spice Bank. It now holds the deck and its
// discard pile(s), and the reason that is worth a suite of its own is that the
// deck is HIDDEN and the piles are not. The order of the deck lives in
// match_decks, which has RLS on and no policy at all, so no client can read it;
// what crosses to the table is a COUNT. Everything here is about keeping those
// two facts apart — and about the top card, which is a rule input rather than
// decoration, because Shai-Hulud devours the territory showing on the pile.
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { flattenPath, inPolygon } from './lib/svgPath'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import { SpiceDeckArea } from '@/components/dune/SpiceDeckArea'
import { SPICE_DECK_LAYOUT, SPICE_CAPTION_ROOM } from '@/data/dune/spiceDeckLayout'
import type { SpiceDeckAreaProps } from '@/components/dune/SpiceDeckArea'
import { publicSpiceDeck, buildSpiceDeck } from '@/lib/dune/spiceBlow'
import { DUNE_SPICE_DECK_AREA } from '@/data/dune/boardData'
import type { SpiceCard } from '@/types/Dune/Game'

/**
 * The right-hand box, as a polygon, read out of the board that ships.
 *
 * Flattened from the path rather than compared to a rectangle, because the
 * whole point is that the shape is NOT a rectangle. Only the commands the
 * generator's export actually uses are handled — M, L, H, V, C, Z.
 */
function spiceBoxPolygon(side: 'right' | 'left' = 'right'): [number, number][] {
  const svg = readFileSync('public/dune-board.svg', 'utf8')
  // The two off-board boxes are the only paths filled with the box colour, and
  // they sit either side of the board's centre line.
  const paths = [...svg.matchAll(/<path d="([^"]+)" fill="#c2bd9e"\/>/g)].map(x => x[1])
  // NOT `paths.map(flattenPath)`: map passes (value, index, array), so the
  // second argument arrives as the array index and every curve flattens to 0 or
  // 1 steps — which turns the wedge back into the rectangle this is here to
  // disprove.
  const flat = paths.map(d => flattenPath(d))
  return flat.find(p => side === 'right'
    ? p.every(([px]) => px > 485)
    : p.every(([px]) => px < 485)) ?? []
}


/** What a caption needs beneath a card, from where the layout lives. */
const CAPTION_ROOM = SPICE_CAPTION_ROOM

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

const terr = (name: string, spice = 6): SpiceCard =>
  ({ kind: 'territory', territoryId: 'territory-01', name, spice, sector: 'sector-1' })
const worm: SpiceCard = { kind: 'shai-hulud' }

const base: SpiceDeckAreaProps = {
  deck: { remaining: 12, discardA: [terr('Old Gap')], discardB: [] },
  mode: 'basic',
}
const draw = (over: Partial<SpiceDeckAreaProps> = {}) =>
  renderToStaticMarkup(createElement(SpiceDeckArea, { ...base, ...over }))

// ── the deck's order never gets this far ──────────────────────────────────
// Not "is not drawn" — CANNOT BE DRAWN. SpiceDeckPublic has no field holding a
// card order, so there is no prop to leak through and no derivation to get it
// wrong. This is the same shape as the treachery hand: the projection is the
// boundary, and the component simply has nothing to be careless with.
{
  const real = buildSpiceDeck()
  const projected = publicSpiceDeck({ deck: real, discardA: [], discardB: [] })
  const json = JSON.stringify(projected)
  check('the projection names no card that is still in the deck',
    real.filter(c => c.kind === 'territory' && json.includes(c.name)).length, 0)
  check('...and publishes how many there are', projected.remaining, real.length)

  // Handed out by value. Returning the server's own arrays means a later push
  // onto a pile silently rewrites a row that was already sent.
  const live: SpiceCard[] = [terr('Old Gap')]
  const snap = publicSpiceDeck({ deck: real, discardA: live, discardB: [] })
  live.push(worm)
  check('the piles are copied, not handed out live', snap.discardA.length, 1)
}

// ── the count is published, never recomputed ──────────────────────────────
// THE ONE WITH TEETH. `remaining` cannot be reconstructed on this side, and the
// obvious reconstruction is wrong twice over: worms drawn on the first turn are
// set aside without reaching a pile, and an exhausted deck is rebuilt from the
// discard, which resets both numbers at once. A component that quietly computed
// `total - discarded` would look right in a mid-game screenshot and be wrong on
// turn one and after every reshuffle.
{
  // Deliberately incoherent: 4 left with 9 discarded adds up to nothing in a
  // 21-card deck. The number shown must be the one that was published.
  const odd = draw({ deck: { remaining: 4, discardA: Array(9).fill(terr('Old Gap')), discardB: [] } })
  check('the published count is what appears', odd.includes('>4 LEFT<'), true)
  check('...and no arithmetic on the piles appears instead',
    /\b(?:12|17|21) LEFT\b/.test(odd), false)

  // Zero is falsy, and this codebase has shipped `{n && ...}` before. An empty
  // deck must read as 0, not vanish.
  check('an empty deck shows 0 rather than nothing',
    draw({ deck: { remaining: 0, discardA: [], discardB: [] } }).includes('>0 LEFT<'), true)
}

// ── the top card is the one showing ───────────────────────────────────────
// A pile drawn from the bottom would show the wrong card, and the wrong card is
// the wrong territory for a worm to devour. The pile order here is the order
// they were discarded, so the LAST one is face up.
{
  const m = draw({ deck: {
    remaining: 5,
    discardA: [terr('Old Gap'), terr('Red Chasm'), terr('Sihaya Ridge')],
    discardB: [],
  } })
  check('the last card discarded is the one face up', m.includes('SIHAYA'), true)
  check('...and the ones under it are not named',
    ['OLD GAP', 'RED CHASM'].filter(x => m.includes(x)), [])
  // The pile is three deep and that has to be visible somewhere, or a pile of
  // one and a pile of nine are the same picture. Matched on the badge's own
  // attribute, not on a loose '3': every SVG coordinate in the markup contains
  // digits, and `includes('3')` was true no matter what was drawn.
  check('...but the pile says how deep it is', m.includes('data-depth="3"'), true)
  // A pile of one has no depth to report, and a badge reading 1 on every pile
  // is noise that hides the piles that do.
  check('...and a single card carries no depth badge',
    draw().includes('data-depth'), false)
}

// ── a worm on top is a worm ───────────────────────────────────────────────
// It can be: a second consecutive Shai-Hulud finds no territory showing, and
// the pile is left with a worm face up. Rendering it as a blank card would hide
// exactly the state that explains why nothing was devoured.
{
  const m = draw({ deck: { remaining: 5, discardA: [terr('Old Gap'), worm], discardB: [] } })
  check('a worm showing renders as Shai-Hulud', m.includes('HULUD'), true)
  check('...and not as the territory beneath it', m.includes('OLD GAP'), false)
}

// ── one pile in the basic game, two in the advanced ───────────────────────
{
  const basic = draw({ mode: 'basic' })
  const adv = draw({ mode: 'advanced' })
  check('basic play draws one pile', [/PILE A/.test(basic), /PILE B/.test(basic)], [false, false])
  check('...labelled simply DISCARD, there being no other', basic.includes('DISCARD'), true)
  // UNLETTERED, deliberately: two cards stacked beside a deck are the two
  // discard piles without being told so. They keep a name for the title and for
  // anything reading the markup — a pile that cannot be told from the other is
  // a different problem from a pile that is not labelled on screen.
  check('advanced play draws both piles',
    [/data-pile="Discard pile A"/.test(adv), /data-pile="Discard pile B"/.test(adv)],
    [true, true])
  check('...without printing a letter beside either',
    [/>A</.test(adv), />B</.test(adv)], [false, false])

  // A basic game handed a stale B pile must not grow a second pile. The mode is
  // the authority on how many there are, not whether the array happens to be
  // empty — otherwise switching to basic mid-session leaves B on the board.
  const stale = draw({ mode: 'basic', deck: {
    remaining: 5, discardA: [terr('Old Gap')], discardB: [terr('Red Chasm')],
  } })
  check('a basic game ignores a pile B it was handed anyway',
    stale.includes('RED CHASM'), false)
}

// ── an empty pile is empty, not missing ───────────────────────────────────
{
  const m = draw({ deck: { remaining: 21, discardA: [], discardB: [] } })
  check('an empty pile still draws its slot', m.includes('stroke-dasharray'), true)
  check('...and still carries its caption', m.includes('DISCARD'), true)
}

// ── the chosen positions land inside the box the board prints ────────────
// The layout is a table of hand-set numbers now, not a computation — see
// SPICE_DECK_LAYOUT for why. That changes what there is to check but not how
// much: a number somebody typed can be outside the box exactly as easily as a
// number something calculated, and rather more quietly, because nothing
// recomputes it when the board changes underneath.
//
// AGAINST THE SHAPE, NOT THE BOUNDING BOX. The box is a wedge — the board's rim
// curves through one corner of it — so its bbox is 351 x 215 while the largest
// rectangle actually inside it is 174 x 144. An earlier layout sat on the navy
// surround with every assertion passing, because all of them were measured
// against the same wrong rectangle.
{
  const poly = spiceBoxPolygon()
  check('the printed box can be found and flattened', poly.length > 20, true)

  const corners = (c: { x: number; y: number; w: number; h: number }): [number, number][] =>
    [[c.x, c.y], [c.x + c.w, c.y], [c.x, c.y + c.h], [c.x + c.w, c.y + c.h]]

  // THE ROOM HAS TO BE ROOM. Every check below reserves CAPTION_ROOM under a
  // card, so setting it to zero silently turns "the caption fits" into "the
  // card's bottom edge fits" — the check keeps passing and stops meaning
  // anything. Nothing else notices, because no layout is wrong for it.
  check('the caption reserves actual space', CAPTION_ROOM > 0, true)

  for (const [name, card] of Object.entries(SPICE_DECK_LAYOUT)) {
    check(`${name}: every corner is inside the printed box`,
      corners(card).filter(p => !inPolygon(p, poly)).length, 0)
    // The caption hangs below the deck, so its room has to be in there too.
    check(`...with room beneath it for a caption`,
      inPolygon([card.x + card.w / 2, card.y + card.h + CAPTION_ROOM], poly), true)
    check(`...and is big enough to read`, card.w > 30, true)
    // A card, not a smear: the art is drawn 5:7 and a box far off that ratio
    // letterboxes or stretches whatever is put in it.
    const ratio = card.h / card.w
    check(`...and roughly a card's shape`, ratio > 1.25 && ratio < 1.55, true)
  }

  // NOT ON TOP OF EACH OTHER. Three boxes set by hand can overlap without any
  // single one of them being wrong, and the result reads as a rendering fault
  // rather than as a placement someone chose.
  const boxes = Object.entries(SPICE_DECK_LAYOUT)
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const [an, A] = boxes[i], [bn, B] = boxes[j]
      const apart = A.x + A.w <= B.x || B.x + B.w <= A.x
        || A.y + A.h <= B.y || B.y + B.h <= A.y
      check(`${an} and ${bn} do not overlap`, apart, true)
    }
  }
}

// ── the tuning tool is telling the truth ─────────────────────────────────
// The layout is placed by eye in /spice-deck-editor.html and pasted back into
// the data module. Its whole value depends on showing the LIVE numbers against
// the REAL boundary: a tool that opens on a stale copy, or draws a boundary
// that is not the boundary, keeps working and quietly yields a layout that is
// wrong in a way that looks carefully placed.
//
// Both halves of that have already gone wrong once, so both are checked here.
{
  const tool = readFileSync('public/spice-deck-editor.html', 'utf8')
  check('the tool exists', tool.length > 0, true)

  check('it reads the layout from the source of truth',
    tool.includes("from '/src/data/dune/spiceDeckLayout.ts'"), true)

  // NOT A .tsx. A page in public/ is served untransformed and never receives
  // @vitejs/plugin-react's refresh preamble, so importing a component throws
  // "can't detect preamble" and the tool renders nothing. That is why the
  // layout lives in a data module at all.
  check('...and imports no component', /from '\/src\/[^']*\.tsx'/.test(tool), false)

  // ...which only holds while the data module stays plain data. A React import
  // added to it later would break the tool in the browser and nothing else,
  // which is the sort of breakage that sits undiscovered for a month.
  const data = readFileSync('src/data/dune/spiceDeckLayout.ts', 'utf8')
  check('the layout module pulls in nothing at runtime',
    /^import (?!type )/m.test(data), false)

  // THE BOUNDARY IS THE PRINTED SHAPE. It was DUNE_SPICE_DECK_AREA at first —
  // the largest rectangle that fits inside the box. That rectangle is a
  // sufficient condition and not a necessary one: the box is a wedge, wider
  // than its inscribed rectangle at nearly every height, so the tool marked
  // perfectly good placements as errors and the layout it was steering people
  // towards was needlessly cramped.
  check('the tool finds the box by the fill the board prints it with',
    tool.includes("const BOX_FILL = '#c2bd9e'"), true)
  check('...and asks the path itself what contains what',
    tool.includes('isPointInFill'), true)
  // Mention is fine — the comment above BOX_FILL explains why the rectangle is
  // not the boundary. USE is what must be gone.
  check('...rather than measuring against the inscribed rectangle',
    tool.includes('DUNE_SPICE_DECK_AREA.'), false)
  check('...and does not even load it', tool.includes('boardData.ts'), false)

  // No second copy of the layout, which is the other failure being designed out.
  check('the tool hard-codes no layout of its own',
    /const START = \{/.test(tool), false)
  check('...nor its own caption room',
    /const CAPTION_ROOM = \d/.test(tool), false)

  // It EXPORTS the shape the source declares. A paste block naming a field the
  // interface does not have is a compile error at the moment of pasting, which
  // is the worst moment to discover it.
  check('...and exports a block shaped like the declaration',
    tool.includes("export const SPICE_DECK_LAYOUT: Record<'deck' | 'discardA' | 'discardB', SpiceCardBox> = {"),
    true)

  // And it is a TOOL, not a second source of truth: it hands back text for a
  // person to paste, and writes nothing itself.
  for (const verb of ['POST', 'PUT', 'PATCH']) {
    check(`...and never ${verb}s anything`, tool.includes(`'${verb}'`), false)
  }
}

// ── the board itself agrees ───────────────────────────────────────────────
// Read the generated SVG, not the generator: what ships is the file. The label
// is placed off the box's own edges — text at x1-59, baseline at y1-26 — so
// finding it where the exported rectangle predicts proves the export describes
// the shape that was actually drawn, rather than a second set of numbers.
{
  // FIRST, or the two checks below read yesterday's board and agree with
  // themselves. `verify:board` exists but nothing in the test run called it, so
  // an edit to the generator without a regenerate shipped silently — and both
  // files this section compares are generated ones.
  const fresh = (() => {
    try { execSync('node scripts/build-dune-board.mjs --check', { stdio: 'pipe' }); return true }
    catch { return false }
  })()
  check('the board and boardData are current with the generator', fresh, true)

  const svg = readFileSync('public/dune-board.svg', 'utf8')
  check('the board no longer calls the box a bank', svg.includes('SPICE BANK'), false)
  check('...it calls it the spice deck', svg.includes('SPICE DECK'), true)

  const m = svg.match(/<text x="([\d.]+)" y="([\d.]+)"[^>]*>SPICE DECK<\/text>/)
  check('the printed label can be located', m !== null, true)
  if (m) {
    // Placed off the BOX, not off the card area — the generator anchors it 26
    // in from the box's left edge with the mark leading, 26 up from its foot.
    // Read from the shape that ships, so the label and the export are checked
    // against the drawing rather than against each other.
    const box = spiceBoxPolygon()
    const bx = Math.min(...box.map(p => p[0])), by = Math.max(...box.map(p => p[1]))
    check('...at the x the printed box predicts', Math.abs(+m[1] - (bx + 59)) < 0.5, true)
    check('...and the y', Math.abs(+m[2] - (by - 26)) < 0.5, true)
    check('...anchored from the left, so it runs into the tail not the cards',
      /text-anchor="start"[^>]*>SPICE DECK/.test(svg), true)
  }
  // The tanks box is the other one and keeps its own label — a rename that
  // caught both boxes would leave the tanks holding cards.
  check('the tanks box is untouched', svg.includes('TLEILAXU TANKS'), true)

  // MIRRORED. The two boxes are mirror images, so their thin tails are on
  // opposite sides: the spice deck's at its left, the tanks' at its right. Each
  // label sits in its own tail, which puts them either side of the board's
  // lower centre instead of one being marooned in the far corner. Anchored from
  // the opposite end, so each reads inward.
  const tanks = svg.match(
    /<text x="([\d.]+)" y="([\d.]+)"[^>]*text-anchor="([a-z]+)"[^>]*>TLEILAXU TANKS<\/text>/)
  check('the tanks label can be located', tanks !== null, true)
  if (tanks && m) {
    const box = spiceBoxPolygon('left')
    const bx1 = Math.max(...box.map(p => p[0])), by1 = Math.max(...box.map(p => p[1]))
    check('...at the right-hand end of its own box',
      Math.abs(+tanks[1] - (bx1 - 59)) < 0.5, true)
    check('...on the same baseline as the spice deck\'s',
      Math.abs(+tanks[2] - (by1 - 26)) < 0.5, true)
    check('...anchored from that end, so it reads inward', tanks[3], 'end')
    // Both toward the middle, flanking it. Board centre is 483.
    check('...and the two labels flank the board\'s centre',
      +tanks[1] < 483 && +m[1] > 483, true)
  }

  // The label lives in the wedge's thin tail, which is where it was moved TO:
  // the fat corner is the only part of the box that holds cards, and a label
  // under a card is a label nobody reads. Its own end is generous — 10 letters
  // of 13pt serif with tracking is about 90 — so a label that drifted right
  // would be caught before it reached the cards rather than after.
  if (m) {
    const textEnd = +m[1] + 95
    check('the printed label ends before the cards begin',
      textEnd <= DUNE_SPICE_DECK_AREA.x, true)
  }
}

// ── the basic discard sits on the deck's own line ─────────────────────────
{
  const { SPICE_DECK_LAYOUT } = await import('@/data/dune/spiceDeckLayout')
  const basicY = draw({ mode: 'basic' })
  check('the basic pile shares the deck\'s y axis',
    basicY.includes(`y="${SPICE_DECK_LAYOUT.deck.y}"`)
      && !basicY.includes(`y="${SPICE_DECK_LAYOUT.discardA.y}"`), true)
  check('...while the advanced pair keeps its stack',
    draw({ mode: 'advanced' }).includes(`y="${SPICE_DECK_LAYOUT.discardA.y}"`), true)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')
process.exit(pass ? 0 : 1)
