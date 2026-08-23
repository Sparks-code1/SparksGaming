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
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import { SpiceDeckArea, slotLayout } from '@/components/dune/SpiceDeckArea'
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

function flattenPath(d: string, steps = 24): [number, number][] {
  const pts: [number, number][] = []
  let cx = 0, cy = 0, sx = 0, sy = 0
  for (const m of d.matchAll(/([MLHVCZmlhvcz])([^MLHVCZmlhvcz]*)/g)) {
    const a = (m[2].match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number)
    switch (m[1]) {
      case 'M': cx = a[0]; cy = a[1]; sx = cx; sy = cy; pts.push([cx, cy]); break
      case 'L': for (let i = 0; i < a.length; i += 2) { cx = a[i]; cy = a[i + 1]; pts.push([cx, cy]) } break
      case 'H': for (const v of a) { cx = v; pts.push([cx, cy]) } break
      case 'V': for (const v of a) { cy = v; pts.push([cx, cy]) } break
      case 'C':
        for (let i = 0; i < a.length; i += 6) {
          const [x1, y1, x2, y2, x3, y3] = a.slice(i, i + 6)
          for (let k = 1; k <= steps; k++) {
            const t = k / steps, u = 1 - t
            pts.push([
              u * u * u * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
              u * u * u * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
            ])
          }
          cx = x3; cy = y3
        }
        break
      case 'Z': case 'z': pts.push([sx, sy]); break
    }
  }
  return pts
}

/** Ray casting. */
function inPolygon([px, py]: [number, number], poly: readonly [number, number][]): boolean {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

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
  check('the published count is what appears', />4</.test(odd), true)
  check('...and no arithmetic on the piles appears instead',
    />(?:12|17|21)</.test(odd), false)

  // Zero is falsy, and this codebase has shipped `{n && ...}` before. An empty
  // deck must read as 0, not vanish.
  check('an empty deck shows 0 rather than nothing',
    />0</.test(draw({ deck: { remaining: 0, discardA: [], discardB: [] } })), true)
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
  check('advanced play draws both, named', [/PILE A/.test(adv), /PILE B/.test(adv)], [true, true])

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

// ── the cards land inside the box the board prints ────────────────────────
// AGAINST THE SHAPE, NOT THE BOUNDING BOX. This is the check that was missing,
// and its absence cost the first version of this layout: the box is a wedge —
// the board's rim curves through one corner of it — so its bbox is 351 x 215
// while the largest rectangle actually inside it is 174 x 144. Cards laid out
// on the bbox sat on the navy surround, and every assertion passed, because
// every one of them was measured against the same wrong rectangle.
//
// A rectangle cannot be checked against another rectangle here. It has to be
// checked against the path the board actually draws.
{
  const { x, y, width, height } = DUNE_SPICE_DECK_AREA
  const poly = spiceBoxPolygon()
  check('the printed box can be found and flattened', poly.length > 20, true)

  for (const slots of [2, 3]) {
    const L = slotLayout(slots)
    const right = L.left + L.cardW * slots + 12 * (slots - 1)
    check(`${slots} slots start inside the area`, L.left >= x - 0.01 && L.top >= y - 0.01, true)
    check(`...and end inside it`, right <= x + width + 0.01, true)
    check(`...and inside its height, captions included`,
      L.top + L.cardH + 12 <= y + height + 0.01, true)
    // Every corner of every card, in the shape itself.
    const corners: [number, number][] = []
    for (let i = 0; i < slots; i++) {
      const cx0 = L.left + i * L.step
      corners.push([cx0, L.top], [cx0 + L.cardW, L.top],
        [cx0, L.top + L.cardH], [cx0 + L.cardW, L.top + L.cardH])
    }
    check(`...with every card corner inside the printed box`,
      corners.filter(p => !inPolygon(p, poly)).length, 0)
    check(`...with cards big enough to read`, L.cardW > 40, true)
  }

  // THE WIDTH HALF OF THE FIT. The printed box is short and wide, so its height
  // binds first and no change to the width term can push a card outside it —
  // the bounds check above passes on a layout with the width constraint removed
  // altogether. A narrow box is the only way to make that half do anything.
  const narrow = { x: 0, y: 0, width: 120, height: 400 }
  for (const slots of [2, 3]) {
    const L = slotLayout(slots, narrow)
    const row = L.cardW * slots + 12 * (slots - 1)
    check(`${slots} slots fit a narrow box across`,
      L.left >= narrow.x - 0.01 && L.left + row <= narrow.x + narrow.width + 0.01, true)
    check(`...by shrinking rather than overflowing`, L.cardH < narrow.height, true)
  }

  // AND THE HEIGHT HALF, for the same reason in the other direction. The
  // printed box is wide enough that its width always binds first, so the height
  // term is dead against it — a layout with the height cap removed altogether
  // lays out identically and every check above still passes. A short box is
  // what makes that term do anything.
  const short = { x: 0, y: 0, width: 400, height: 90 }
  for (const slots of [2, 3]) {
    const L = slotLayout(slots, short)
    check(`${slots} slots fit a short box down`,
      L.top + L.cardH + 12 <= short.y + short.height + 0.01, true)
    check(`...by shrinking rather than overflowing`, L.cardW < short.width, true)
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

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')
process.exit(pass ? 0 : 1)
