// Dune board: clean the Figma SVG and derive its data module.
//
// The source export (public/dune-board (1).svg) is art, not data: one flat list
// of anonymous shapes, no groups, no ids, no text. This script is the single
// pass that turns it into both things the app needs —
//
//   public/dune-board.svg        same geometry, ids on every sector + territory
//   src/data/dune/boardData.ts   territories, sectors, markers, adjacency
//
// Both are emitted from one parse so they cannot drift apart. Nothing here is
// hand-edited: to change a name, edit TERRITORY_NAMES below and re-run.
//
//   node scripts/build-dune-board.mjs            write both outputs
//   node scripts/build-dune-board.mjs --report   classify and print, write nothing
//
// The geometry is exact (areas, centroids, sector overlap are computed from the
// path data). The NAMES are not derivable from the file — see TERRITORY_NAMES.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// The pristine Figma export, kept beside the generated board so the build stays
// reproducible. Distinct filenames on purpose: OUT_SVG is overwritten on every
// run, and pointing the two at one path would destroy the source.
const SRC = join(root, 'public', 'dune-board.source.svg')
const OUT_SVG = join(root, 'public', 'dune-board.svg')
const OUT_TS = join(root, 'src', 'data', 'dune', 'boardData.ts')

const reportOnly = process.argv.includes('--report')

/**
 * Decoration palette, matched to the printed board.
 *
 * Borders are drawn as stacked strokes rather than as offset outlines: a wide
 * dark stroke with a narrower fill-coloured stroke on top leaves the two edges
 * of the wide one showing, which reads as a double line. Adding a third,
 * narrow dark stroke gives a triple. It is the only way to get parallel
 * borders out of a single path without offsetting the geometry.
 */
const DECOR = {
  ink: '#3f2c1a',            // territory borders and label text
  sand: { fill: '#f0e2bb', borders: 1 },
  rock: { fill: '#c9905f', borders: 2 },
  'polar-sink': { fill: '#f8f6ee', borders: 1 },
  stronghold: { fill: '#93373a', borders: 3, text: '#f6ead4' },
  badge: { fill: '#f6ecd2', ring: '#3f2c1a', text: '#3f2c1a' },
  badgeRadius: 452,          // just outside the rim, clear of the seat circles
  label: 10,                 // territory name size, before any scaling
}

/**
 * Scales every territory label at once. Applied AFTER the automatic fit, so
 * pushing it above 1 can overflow the narrow shapes the fit was protecting —
 * that is the intent of a global knob, but it is why the fit does not simply
 * bake it in.
 */
const LABEL_SCALE = 1

/**
 * Hand adjustments for the labels geometry cannot place well — the thin
 * crescents, mostly, where there is no interior left to nudge into.
 *
 * Keyed by territory id. Every field is optional and falls back to the computed
 * value, so an entry states only what it changes:
 *
 *   rotate  degrees clockwise, pivoting on the label's own anchor
 *   scale   multiplier on the fitted font size, on top of LABEL_SCALE
 *   dx, dy  offset in board units, applied after the repulsion pass
 *
 *   'territory-37': { rotate: -18, dy: 6 },
 *
 * These are applied last and always win: automatic placement runs first, then
 * repulsion, then this. Ids are checked at build time, so a typo fails the
 * build rather than silently doing nothing.
 */
const LABEL_OVERRIDES = {
}

// ─── Board frame ──────────────────────────────────────────────────────────────
// Taken from the one full-board circle in the export, not guessed.
const CX = 483.097, CY = 556.456, RIM = 432.5

/**
 * Names for the 44 territory shapes, keyed by the positional id this script
 * assigns (territory-01 … territory-44, ordered by ring then bearing).
 *
 * DELIBERATELY EMPTY. The SVG carries no text, no ids and no orientation
 * anchor, so nothing in the file says which polygon is Carthag and which is
 * Hagga Basin. Filling these from memory of the board would be guessing at a
 * 44-way assignment — and a wrong name here silently corrupts every rule that
 * reads it later.
 *
 * To name them: open the cleaned SVG beside a board image, read off the ids,
 * and add entries here. Re-running rewrites the SVG ids and the data module
 * together, so the two can never disagree.
 *
 *   'territory-07': 'Carthag',
 */
/**
 * The 42 territories, read off the physical board against the generated ids.
 *
 * None of this is in the SVG — it carries no text — so it is the one part of
 * the build that is transcribed rather than computed. Three assertions below
 * tie it back to the geometry so a mis-keyed row cannot pass silently:
 * the Polar Sink must be the central shape, every territory must have exactly
 * one entry, and the spiceBlow set must match the rect markers the geometry
 * finds, territory for territory.
 *
 *   terrain      'sand' | 'rock' | 'polar-sink'; null where not yet recorded
 *   stronghold   the five that are
 *   spiceBlow    6–12, and only on the fifteen carrying a marker
 *   spiceIncome  the fixed 2 / 2 / 1 the three city strongholds pay out,
 *                which is NOT a blow — none of them has a marker
 */
const TERRITORY_DATA = {
  'territory-01': { name: 'False Wall East',     terrain: 'rock' },
  'territory-02': { name: 'Harg Pass',           terrain: 'sand' },
  'territory-03': { name: 'Polar Sink',          terrain: 'polar-sink' },
  'territory-04': { name: 'Wind Pass',           terrain: 'sand' },
  'territory-05': { name: 'Imperial Basin',      terrain: 'sand' },
  'territory-06': { name: 'Shield Wall',         terrain: 'rock' },
  'territory-07': { name: 'The Minor Erg',       terrain: 'sand', spiceBlow: 8 },
  'territory-08': { name: 'Cielago North',       terrain: 'sand', spiceBlow: 8 },
  'territory-09': { name: 'Wind Pass North',     terrain: 'sand', spiceBlow: 6 },
  'territory-10': { name: 'False Wall West',     terrain: 'rock' },
  'territory-11': { name: 'Hagga Basin',         terrain: 'sand', spiceBlow: 6 },
  'territory-12': { name: 'Arsunt',              terrain: 'sand' },
  'territory-13': { name: 'Arrakeen',            terrain: 'stronghold', stronghold: true, spiceIncome: 2, ornithopters: true },
  'territory-14': { name: 'Rim Wall West',       terrain: 'rock' },
  'territory-15': { name: 'Hole In The Rock',    terrain: 'sand' },
  'territory-16': { name: 'Pasty Mesa',          terrain: 'rock' },
  'territory-17': { name: 'False Wall South',    terrain: 'rock' },
  'territory-18': { name: 'Cielago Depression',  terrain: 'sand' },
  'territory-19': { name: 'Cielago West',        terrain: 'sand' },
  'territory-20': { name: 'Habbanya Erg',        terrain: 'sand', spiceBlow: 8 },
  'territory-21': { name: 'The Greater Flat',    terrain: 'sand' },
  'territory-22': { name: 'The Great Flat',      terrain: 'sand', spiceBlow: 8 },
  'territory-23': { name: 'Funeral Plain',       terrain: 'sand', spiceBlow: 6 },
  'territory-24': { name: 'Plastic Basin',       terrain: 'rock' },
  'territory-25': { name: 'Tsimpo',              terrain: 'sand' },
  'territory-26': { name: 'Carthag',             terrain: 'stronghold', stronghold: true, spiceIncome: 2, ornithopters: true },
  'territory-27': { name: 'Old Gap',             terrain: 'sand', spiceBlow: 6 },
  'territory-28': { name: 'Basin',               terrain: 'sand' },
  'territory-29': { name: 'Sihaya Ridge',        terrain: 'sand', spiceBlow: 6 },
  'territory-30': { name: 'Gara Kulon',          terrain: 'sand' },
  'territory-31': { name: 'Red Chasm',           terrain: 'sand', spiceBlow: 8 },
  'territory-32': { name: 'South Mesa',          terrain: 'sand', spiceBlow: 10 },
  'territory-33': { name: "Tuek's Sietch",       terrain: 'stronghold', stronghold: true, spiceIncome: 1 },
  'territory-34': { name: 'Cielago East',        terrain: 'sand' },
  'territory-35': { name: 'Cielago South',       terrain: 'sand', spiceBlow: 12 },
  'territory-36': { name: 'Meridian',            terrain: 'sand' },
  'territory-37': { name: 'Habbanya Ridge Flat', terrain: 'sand', spiceBlow: 10 },
  'territory-38': { name: 'Habbanya Sietch',     terrain: 'stronghold', stronghold: true },
  'territory-39': { name: 'Bight Of The Cliff',  terrain: 'sand' },
  'territory-40': { name: 'Sietch Tabr',         terrain: 'stronghold', stronghold: true },
  'territory-41': { name: 'Rock Outcroppings',   terrain: 'sand', spiceBlow: 6 },
  'territory-42': { name: 'Broken Land',         terrain: 'sand', spiceBlow: 8 },
}

/** The Polar Sink is the one name the geometry can check: it must be the shape
 *  sitting on the board's centre, and unambiguously so. */
const CENTRE_NAME = 'Polar Sink'
const CENTRE_MAX_R = 40      // must be this close to the true centre
const CENTRE_MARGIN = 3      // and this many times closer than the runner-up

/**
 * Sector numbering.
 *
 * The board does not print sector numbers and the export carries none, so this
 * is a chosen convention rather than a transcription: sector 1 is the wedge on
 * the south-southwest, and numbering runs COUNTER-clockwise from there, which
 * puts Arrakeen in 10 and Carthag in 11.
 *
 * Expressed as a bearing lying inside sector 1 rather than as a fixed index, so
 * it survives the geometry being re-derived. Changing either constant renumbers
 * every sector id, every territory's spiceSector, and all 104 cells in one
 * rebuild — cheap now, expensive once rules read these ids.
 */
const SECTOR_ONE_BEARING = 199.5     // a bearing lying inside the board's sector 1
const SECTOR_COUNTERCLOCKWISE = true

// ─── SVG parsing ──────────────────────────────────────────────────────────────

/** Every element in document order, with its raw text so we can re-emit it. */
function parseElements(svg) {
  const out = []
  const re = /<(svg|path|circle|rect|mask|\/mask)\b([^>]*?)(\/?)>/g
  let m, maskDepth = 0
  while ((m = re.exec(svg))) {
    const [raw, tag, attrText, selfClose] = m
    if (tag === '/mask') { maskDepth--; continue }
    const attrs = Object.fromEntries([...attrText.matchAll(/([\w:-]+)="([^"]*)"/g)].map(a => [a[1], a[2]]))
    out.push({ tag, attrs, raw, index: m.index, inMask: maskDepth > 0 })
    if (tag === 'mask' && !selfClose) maskDepth++
  }
  return out
}

/** Flatten a path 'd' to a polyline. The export uses only M / L / C / Z. */
function flatten(d, steps = 16) {
  const toks = d.match(/[MmLlCcZzHhVv]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? []
  const pts = []
  let i = 0, cur = [0, 0], start = [0, 0], cmd = 'M'
  const num = () => parseFloat(toks[i++])
  while (i < toks.length) {
    if (/[MmLlCcZzHhVv]/.test(toks[i])) cmd = toks[i++]
    if (cmd === 'Z' || cmd === 'z') { cur = start.slice(); continue }
    const rel = cmd === cmd.toLowerCase()
    const ox = rel ? cur[0] : 0, oy = rel ? cur[1] : 0
    if (cmd === 'M' || cmd === 'm') {
      cur = [num() + ox, num() + oy]; start = cur.slice(); pts.push(cur.slice()); cmd = rel ? 'l' : 'L'
    } else if (cmd === 'L' || cmd === 'l') {
      cur = [num() + ox, num() + oy]; pts.push(cur.slice())
    } else if (cmd === 'H' || cmd === 'h') {
      cur = [num() + ox, cur[1]]; pts.push(cur.slice())
    } else if (cmd === 'V' || cmd === 'v') {
      cur = [cur[0], num() + oy]; pts.push(cur.slice())
    } else if (cmd === 'C' || cmd === 'c') {
      const p0 = cur
      const p1 = [num() + ox, num() + oy], p2 = [num() + ox, num() + oy], p3 = [num() + ox, num() + oy]
      for (let s = 1; s <= steps; s++) {
        const t = s / steps, u = 1 - t
        pts.push([
          u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
          u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1],
        ])
      }
      cur = p3
    } else { i++ }
  }
  return pts
}

// ─── Polygon maths ────────────────────────────────────────────────────────────

function signedArea(p) {
  let a = 0
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][0]*p[i][1] - p[i][0]*p[j][1]
  return a / 2
}

/** Area-weighted centroid. Falls back to the mean for degenerate rings. */
function centroid(p) {
  const a = signedArea(p)
  if (Math.abs(a) < 1e-6) {
    return [p.reduce((s,q)=>s+q[0],0)/p.length, p.reduce((s,q)=>s+q[1],0)/p.length]
  }
  let cx = 0, cy = 0
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const f = p[j][0]*p[i][1] - p[i][0]*p[j][1]
    cx += (p[j][0] + p[i][0]) * f
    cy += (p[j][1] + p[i][1]) * f
  }
  return [cx / (6*a), cy / (6*a)]
}

function inside(pt, poly) {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

function bbox(p) {
  return [Math.min(...p.map(q=>q[0])), Math.min(...p.map(q=>q[1])),
          Math.max(...p.map(q=>q[0])), Math.max(...p.map(q=>q[1]))]
}

/** Bearing in degrees: 0 = due north, increasing clockwise. */
const bearing = (x, y) => { const b = Math.atan2(x - CX, -(y - CY)) * 180 / Math.PI; return b < 0 ? b + 360 : b }
const radius = (x, y) => Math.hypot(x - CX, y - CY)

/** Distance from a point to the nearest edge of a polygon. */
function edgeDistance(p, poly) {
  let d = Infinity
  for (let k = 0, l = poly.length - 1; k < poly.length; l = k++) {
    const [ax, ay] = poly[l], [bx, by] = poly[k]
    const vx = bx-ax, vy = by-ay, wx = p[0]-ax, wy = p[1]-ay
    const t = Math.max(0, Math.min(1, (wx*vx + wy*vy) / (vx*vx + vy*vy || 1)))
    d = Math.min(d, Math.hypot(wx - t*vx, wy - t*vy))
  }
  return d
}

/**
 * The most interior point of the shape — furthest from any edge — not the area
 * centroid.
 *
 * The difference matters on the crescents. A centroid sits at the balance point,
 * which on a curved band is near the pinch, so a troop counter or a name anchored
 * there crowds the border and lands on the neighbour. The pole of inaccessibility
 * sits in the middle of the widest part, which is where the printed board puts
 * its labels.
 *
 * Coarse grid, then a shrinking local search, because a grid fine enough to be
 * accurate everywhere would be far slower than this over 42 shapes.
 */
function markerPoint(poly) {
  const [x0, y0, x1, y1] = bbox(poly)
  let best = centroid(poly), bestD = inside(best, poly) ? edgeDistance(best, poly) : -1
  const N = 32
  for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) {
    const p = [x0 + (x1-x0)*i/N, y0 + (y1-y0)*j/N]
    if (!inside(p, poly)) continue
    const d = edgeDistance(p, poly)
    if (d > bestD) { bestD = d; best = p }
  }
  let step = Math.max((x1-x0), (y1-y0)) / N
  for (let pass = 0; pass < 4; pass++) {
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const p = [best[0] + i*step/2, best[1] + j*step/2]
      if (!inside(p, poly)) continue
      const d = edgeDistance(p, poly)
      if (d > bestD) { bestD = d; best = p }
    }
    step /= 2
  }
  return best
}

// ─── Classify ─────────────────────────────────────────────────────────────────

if (resolve(SRC) === resolve(OUT_SVG)) {
  throw new Error('source and output are the same file — the build would overwrite its own input')
}

// Tolerate being handed an already-generated board: strip the ids this script
// assigns before parsing, or a second run appends a duplicate id to every
// shape. Figma's own mask ids are left alone — the masks reference them.
const MY_IDS = / (?:id="(?:sector|territory|player-position|spice|track)-\d+"|data-name="[^"]*")/g
// The decoration layers carry <path> elements of their own. Left in place on a
// re-read they would be classified as territories and sectors, so they come out
// before anything is parsed. Both layers are flat, which is what lets a
// non-greedy match to the first </g> take exactly one layer.
const MY_LAYERS = /<g id="dune-(?:terrain|labels)">[\s\S]*?<\/g>\s*/g
const svg = readFileSync(SRC, 'utf8').replace(MY_LAYERS, '').replace(MY_IDS, '')
const els = parseElements(svg)

const paths = els.filter(e => e.tag === 'path' && e.attrs.d)
const sectorPaths = paths.filter(e => e.attrs['stroke-dasharray'] && !e.inMask)
const strokeOnly = paths.filter(e => !e.attrs['stroke-dasharray'] && !e.attrs.fill && !e.attrs.mask && !e.inMask)

// Territory candidates are the closed stroke shapes that actually sit on the
// board. The export also carries off-board furniture drawn the same way, which
// would otherwise be counted as territories.
const onBoard = [], offBoard = []
for (const e of strokeOnly) {
  const poly = flatten(e.attrs.d)
  const c = centroid(poly)
  const frac = poly.filter(([x,y]) => radius(x,y) <= RIM * 1.02).length / poly.length
  ;(frac >= 0.5 && radius(c[0], c[1]) <= RIM ? onBoard : offBoard).push({ el: e, poly, c, frac })
}

// ─── Sectors ──────────────────────────────────────────────────────────────────
// Each wedge's angular span is read from its own rim arc — the points near the
// centre converge and carry no reliable bearing.
const sectors = sectorPaths.map(e => {
  const poly = flatten(e.attrs.d)
  const rimPts = poly.filter(([x,y]) => radius(x,y) > RIM * 0.7).map(([x,y]) => bearing(x,y))
  // Unwrap across due north before averaging, or a wedge straddling 0° averages to 180°.
  const wraps = Math.max(...rimPts) - Math.min(...rimPts) > 180
  const adj = rimPts.map(b => (wraps && b > 180 ? b - 360 : b))
  return { el: e, poly, from: Math.min(...adj), to: Math.max(...adj) }
})

const norm = a => ((a % 360) + 360) % 360
const spans = (s, b) => {
  const f = norm(s.from), t = norm(s.to)
  return f > t ? (b >= f || b <= t) : (b >= f && b <= t)
}

// Geometric order first: sorted by bearing, so list neighbours are board
// neighbours. The boundary snapping below depends on that and must happen
// before any renumbering rearranges the list.
const byBearing = [...sectors].sort((a, b) => norm(a.from) - norm(b.from))

// The dashed wedges are drawn with a stroke width, so consecutive spans leave
// sub-degree gaps between them. Left alone, a bearing landing in a gap belongs
// to no sector — fine for the precomputed lookup, wrong for any runtime "which
// sector is the storm in?" query. Snap each boundary to the midpoint of the gap
// so the 18 sectors partition the circle exactly.
for (let i = 0; i < byBearing.length; i++) {
  const cur = byBearing[i], next = byBearing[(i + 1) % byBearing.length]
  let gap = norm(next.from) - norm(cur.to)
  if (gap > 180) gap -= 360
  if (gap < -180) gap += 360
  const mid = norm(cur.to) + gap / 2
  cur.to = mid
  next.from = mid
}

// Now the board's own numbering: rotate so sector 1 is the anchor wedge, and
// reverse the rest if the board counts counter-clockwise. Reversing the TAIL
// keeps the anchor at position 1 while flipping the direction of travel.
const first = byBearing.findIndex(s => spans(s, norm(SECTOR_ONE_BEARING)))
if (first < 0) {
  throw new Error(`no wedge contains bearing ${SECTOR_ONE_BEARING}° — check SECTOR_ONE_BEARING`)
}
const clockwise = [...byBearing.slice(first), ...byBearing.slice(0, first)]
const ordered = SECTOR_COUNTERCLOCKWISE
  ? [clockwise[0], ...clockwise.slice(1).reverse()]
  : clockwise
ordered.forEach((s, i) => { s.id = `sector-${i + 1}`; s.number = i + 1 })

/** Which sector a bearing falls in. */
function sectorAt(b) {
  for (const s of ordered) {
    const f = norm(s.from), t = norm(s.to)
    if (f > t ? (b >= f || b <= t) : (b >= f && b <= t)) return s
  }
  return null
}

// ─── Territories ──────────────────────────────────────────────────────────────
// Ordered ring-inward-out then clockwise, so the ids are stable and a human
// naming them can walk the board in a predictable order.
const RING_EDGES = [0, 120, 250, 340, Infinity]
const ringOf = r => RING_EDGES.findIndex((e, i) => r >= e && r < RING_EDGES[i + 1])

const territories = onBoard.map(t => {
  const r = radius(t.c[0], t.c[1])
  return { ...t, ring: ringOf(r), cr: r, bearing: bearing(t.c[0], t.c[1]) }
}).sort((a, b) => a.ring - b.ring || a.bearing - b.bearing)

territories.forEach((t, i) => { t.id = `territory-${String(i + 1).padStart(2, '0')}` })

// Sector overlap by area sampling. A hairline of a neighbouring sector clipping
// a corner is not an overlap the storm should care about, so a sector has to
// hold a real share of the territory's area to count — borderline cases are
// reported rather than silently included or dropped.
const OVERLAP_MIN = 0.02, OVERLAP_REVIEW = 0.05
const borderline = []
for (const t of territories) {
  const [x0, y0, x1, y1] = bbox(t.poly)
  const N = 60
  const hits = new Map(), bucket = new Map()
  let total = 0
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const p = [x0 + (x1-x0)*i/N, y0 + (y1-y0)*j/N]
    if (!inside(p, t.poly)) continue
    total++
    const s = sectorAt(bearing(p[0], p[1]))
    if (!s) continue
    hits.set(s.number, (hits.get(s.number) ?? 0) + 1)
    if (!bucket.has(s.number)) bucket.set(s.number, [])
    bucket.get(s.number).push(p)
  }
  t.samples = total
  t.sectors = [...hits.entries()]
    .map(([n, c]) => ({ n, share: c / (total || 1) }))
    .filter(s => s.share >= OVERLAP_MIN)
    .sort((a, b) => a.n - b.n)

  // Troops occupy a SECTOR of a territory, not the territory as a whole: a
  // stack in Broken Land sector 18 dies to a storm in 18 and survives one in 1.
  // So every (territory, sector) pair needs its own point to draw on. Taken as
  // the mean of that sector's samples, pulled back to the nearest real sample
  // when the mean lands outside the shape or drifts into the neighbouring
  // sector — which it will, on the crescent-shaped regions.
  t.cells = []
  for (const s of t.sectors) {
    const pts = bucket.get(s.n) ?? []
    if (!pts.length) continue
    const mean = [pts.reduce((a, p) => a + p[0], 0) / pts.length,
                  pts.reduce((a, p) => a + p[1], 0) / pts.length]
    const good = p => inside(p, t.poly) && sectorAt(bearing(p[0], p[1]))?.number === s.n
    let pick = mean
    if (!good(mean)) {
      let best = null, bestD = Infinity
      for (const p of pts) {
        if (!good(p)) continue
        const d = Math.hypot(p[0] - mean[0], p[1] - mean[1])
        if (d < bestD) { bestD = d; best = p }
      }
      pick = best ?? pts[0]
    }
    t.cells.push({ n: s.n, share: s.share, at: pick })
  }
  for (const s of t.sectors) {
    if (s.share < OVERLAP_REVIEW) borderline.push({ id: t.id, sector: s.n, share: s.share })
  }
  t.marker = markerPoint(t.poly)
}

// markerPoint falls back to the raw centroid when no interior sample lands
// (a sliver polygon). That would put a troop marker outside its own border and
// nothing downstream would notice, so fail loudly here instead.
const escaped = territories.filter(t => !inside(t.marker, t.poly))
if (escaped.length) {
  throw new Error(`marker point outside its own territory: ${escaped.map(t => t.id).join(', ')}`)
}
const emptySectors = territories.filter(t => t.sectors.length === 0)
if (emptySectors.length) {
  throw new Error(`territory overlaps no sector: ${emptySectors.map(t => t.id).join(', ')}`)
}

// ── Tie the transcribed table back to the geometry ────────────────────────────
// The names are hand-entered against a numbered image, which is exactly the
// step where a row can slip. These three checks would catch that.

// 1. Every territory named once, no entry for a territory that does not exist.
const missing = territories.filter(t => !TERRITORY_DATA[t.id]).map(t => t.id)
const orphan = Object.keys(TERRITORY_DATA).filter(id => !territories.some(t => t.id === id))
if (missing.length) throw new Error(`no TERRITORY_DATA entry for: ${missing.join(', ')}`)
if (orphan.length) throw new Error(`TERRITORY_DATA names a territory that is not on the board: ${orphan.join(', ')}`)
const dupeNames = Object.values(TERRITORY_DATA).map(d => d.name)
  .filter((n, i, a) => a.indexOf(n) !== i)
if (dupeNames.length) throw new Error(`two territories share a name: ${[...new Set(dupeNames)].join(', ')}`)

// 2. The Polar Sink must be the shape on the centre, and unambiguously so.
const byCentre = [...territories].sort((a, b) => a.cr - b.cr)
// Exactly one, and it must be the centre shape. Written as a hard requirement
// rather than "if we found one", or the check quietly passes itself the moment
// the name it looks for stops existing.
const sinkIds = Object.keys(TERRITORY_DATA).filter(id => TERRITORY_DATA[id].name === CENTRE_NAME)
if (sinkIds.length !== 1) {
  throw new Error(`expected exactly one territory named ${CENTRE_NAME}, found ${sinkIds.length}`
    + ` — the centre check cannot run, so the table is unverified`)
}
const sinkId = sinkIds[0]
if (!(byCentre[0].id === sinkId && byCentre[0].cr <= CENTRE_MAX_R
      && byCentre[0].cr * CENTRE_MARGIN < byCentre[1].cr)) {
  throw new Error(`${CENTRE_NAME} is ${sinkId}, but the shape on the board's centre is `
    + `${byCentre[0].id} (${byCentre[0].cr.toFixed(0)}px vs next ${byCentre[1].cr.toFixed(0)}px). `
    + `The names are off by at least one row.`)
}
const centreNote = `${sinkId} = ${CENTRE_NAME}, ${byCentre[0].cr.toFixed(0)}px from centre (next ${byCentre[1].cr.toFixed(0)}px)`

// 3. spiceBlow vs the markers — checked below, once the markers are found.

// ─── Markers ──────────────────────────────────────────────────────────────────
const circles = els.filter(e => e.tag === 'circle')
const rects = els.filter(e => e.tag === 'rect')
const num = v => parseFloat(v)

/** Exact-duplicate circles collapse to one. */
const dedupe = (list, key) => {
  const seen = new Set(), out = []
  for (const e of list) { const k = key(e); if (seen.has(k)) continue; seen.add(k); out.push(e) }
  return out
}
const uniqCircles = dedupe(circles, e => `${e.attrs.cx}|${e.attrs.cy}|${e.attrs.r}`)

const playerPositions = uniqCircles
  .filter(e => Math.abs(num(e.attrs.r) - 20) < 1 && radius(num(e.attrs.cx), num(e.attrs.cy)) > RIM)
  .map(e => ({ el: e, x: num(e.attrs.cx), y: num(e.attrs.cy) }))
  .sort((a, b) => bearing(a.x, a.y) - bearing(b.x, b.y))
playerPositions.forEach((p, i) => { p.id = `player-position-${i + 1}` })

const trackStops = uniqCircles
  .filter(e => Math.abs(num(e.attrs.r) - 25.5559) < 0.5)
  .map(e => ({ el: e, x: num(e.attrs.cx), y: num(e.attrs.cy) }))
  .sort((a, b) => a.x - b.x)
trackStops.forEach((s, i) => { s.id = `track-${i + 1}` })

const spiceMarkers = rects
  .map(e => ({ el: e, x: num(e.attrs.x) + num(e.attrs.width)/2, y: num(e.attrs.y) + num(e.attrs.height)/2 }))
  .map(s => {
    const host = territories.find(t => inside([s.x, s.y], t.poly))
    const sec = sectorAt(bearing(s.x, s.y))
    return { ...s, territoryId: host?.id ?? null, sectorNumber: sec?.number ?? null }
  })
  .sort((a, b) => bearing(a.x, a.y) - bearing(b.x, b.y))
spiceMarkers.forEach((s, i) => { s.id = `spice-${i + 1}` })

// Check 3 from above. The rects are found geometrically and the amounts are
// transcribed by hand, so agreement between them is real evidence the ids were
// read off correctly — and a mismatch is the likeliest symptom of the table
// being off by a row.
const markerHosts = new Set(spiceMarkers.map(s => s.territoryId).filter(Boolean))
const blowIds = new Set(Object.keys(TERRITORY_DATA).filter(id => TERRITORY_DATA[id].spiceBlow != null))
const noMarker = [...blowIds].filter(id => !markerHosts.has(id))
const noAmount = [...markerHosts].filter(id => !blowIds.has(id))
const homeless = spiceMarkers.filter(s => !s.territoryId).length
if (noMarker.length || noAmount.length) {
  throw new Error('spice does not line up with the markers drawn on the board:'
    + (noMarker.length ? `\n  spiceBlow set but no marker there: ${noMarker.join(', ')}` : '')
    + (noAmount.length ? `\n  marker there but no spiceBlow: ${noAmount.join(', ')}` : ''))
}
if (homeless) throw new Error(`${homeless} spice marker(s) fall outside every territory`)

// A blow lands in one SECTOR of its territory, and the marker's position is
// what says which — Broken Land spans 1 and 18, and the spice is in 18. Hang
// that off the territory so a mining rule does not have to re-derive it.
for (const t of territories) {
  const m = spiceMarkers.find(s => s.territoryId === t.id)
  t.spiceSector = m?.sectorNumber ?? null
  if (t.spiceSector != null && !t.sectors.some(s => s.n === t.spiceSector)) {
    throw new Error(`${t.id} carries its spice in sector-${t.spiceSector}, which is not among the `
      + `sectors it overlaps (${t.sectors.map(s => s.n).join(', ')})`)
  }
}

// Every placement cell must be inside its own territory AND in the sector it
// claims, or troops render in the wrong sector and the storm reads them wrong.
for (const t of territories) {
  for (const c of t.cells) {
    const inShape = inside(c.at, t.poly)
    const inSector = sectorAt(bearing(c.at[0], c.at[1]))?.number === c.n
    if (!inShape || !inSector) {
      throw new Error(`${t.id} cell for sector-${c.n} is ${!inShape ? 'outside the territory' : 'in the wrong sector'}`)
    }
  }
  if (t.cells.length !== t.sectors.length) {
    throw new Error(`${t.id} overlaps ${t.sectors.length} sectors but produced ${t.cells.length} placement cells`)
  }
}

// ─── Report ───────────────────────────────────────────────────────────────────
const round = (n, d = 2) => Number(n.toFixed(d))

console.log(`source        ${paths.length} paths, ${circles.length} circles, ${rects.length} rects`)
console.log(`sectors       ${sectors.length}`)
console.log(`territories   ${territories.length} on-board  (+${offBoard.length} off-board stroke shapes left unnamed)`)
for (const o of offBoard) {
  console.log(`   off-board: centroid r=${radius(o.c[0], o.c[1]).toFixed(0)} bearing=${bearing(o.c[0], o.c[1]).toFixed(0)}° `
    + `${(o.frac*100).toFixed(0)}% of its outline inside the rim`)
}
console.log(`markers       ${playerPositions.length} player positions, ${spiceMarkers.length} spice, ${trackStops.length} track stops`)
console.log(`deduped       ${circles.length - uniqCircles.length} duplicate circles`)
const named = territories.filter(t => TERRITORY_DATA[t.id]?.name).length
const holds = Object.values(TERRITORY_DATA).filter(d => d.stronghold).length
const blows = Object.values(TERRITORY_DATA).filter(d => d.spiceBlow != null)
const noTerrain = Object.entries(TERRITORY_DATA).filter(([, d]) => !d.terrain).map(([id]) => id)
console.log(`named         ${named}/${territories.length}`)
console.log(`centre        ${centreNote}`)
console.log(`strongholds   ${holds}  ${Object.values(TERRITORY_DATA).filter(d => d.stronghold).map(d => d.name).join(', ')}`)
console.log(`spice blow    ${blows.length} territories, ${blows.reduce((s, d) => s + d.spiceBlow, 0)} total — matches all ${spiceMarkers.length} markers`)
if (noTerrain.length) console.log(`terrain       ${noTerrain.length} without one: ${noTerrain.map(id => TERRITORY_DATA[id].name).join(', ')}`)

const spanCounts = territories.reduce((m, t) => (m[t.sectors.length] = (m[t.sectors.length] ?? 0) + 1, m), {})
console.log(`sector spans  ${Object.entries(spanCounts).map(([k,v]) => `${v}×${k}`).join(', ')}`)
if (borderline.length) {
  console.log(`\nborderline overlaps (<${OVERLAP_REVIEW*100}% of area — included, worth a look):`)
  for (const b of borderline) console.log(`   ${b.id} ∩ sector-${b.sector}  ${(b.share*100).toFixed(1)}%`)
}
const offCentre = territories.filter(t => !inside(centroid(t.poly), t.poly))
if (offCentre.length) console.log(`\n${offCentre.length} concave territories: marker moved off the centroid to stay inside the shape`)

if (reportOnly) process.exit(0)

// ─── Emit: cleaned SVG ────────────────────────────────────────────────────────
// Same geometry, same draw order, same visual result — ids added, duplicate
// circles dropped. No colour and no text, as asked.
const idFor = new Map()
for (const s of ordered) idFor.set(s.el, s.id)
for (const t of territories) idFor.set(t.el, t.id)
for (const p of playerPositions) idFor.set(p.el, p.id)
for (const s of trackStops) idFor.set(s.el, s.id)
for (const s of spiceMarkers) idFor.set(s.el, s.id)

const dropped = new Set(circles.filter(c => !uniqCircles.includes(c)))
const dataFor = t => TERRITORY_DATA[t.id] ?? {}
const nameOf = t => dataFor(t).name

let out = svg
const edits = []
for (const e of els) {
  if (dropped.has(e)) { edits.push({ at: e.index, len: e.raw.length, text: '' }); continue }
  const id = idFor.get(e)
  if (!id) continue
  const label = e.tag === 'path' && nameOf({ id }) ? ` data-name="${nameOf({ id })}"` : ''
  edits.push({ at: e.index, len: e.raw.length, text: e.raw.replace(/^<(\w+)/, `<$1 id="${id}"${label}`) })
}
edits.sort((a, b) => b.at - a.at)
for (const e of edits) out = out.slice(0, e.at) + e.text + out.slice(e.at + e.len)

// ─── Decoration ───────────────────────────────────────────────────────────────
// Terrain fills, borders, names and spice badges, all derived from the same
// territory records the data module is written from. Two flat layers, no
// nesting: the strip regex that keeps this build idempotent matches to the
// first </g>, so a nested group would leave half a layer behind on a re-read.

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const styleFor = t => DECOR[dataFor(t).terrain] ?? DECOR.sand

/** Split at the space nearest the middle, as the printed board does. */
function wrap(name) {
  if (!name.includes(' ')) return [name]
  const mid = name.length / 2
  let best = -1
  for (let i = 0; i < name.length; i++) {
    if (name[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i
  }
  return best < 0 ? [name] : [name.slice(0, best), name.slice(best + 1)]
}

/** How wide the territory actually is on the line the label sits on. Using the
 *  bounding box instead would badly over-estimate the crescents, which is how
 *  a name ends up written across its neighbour. */
function widthAt(poly, y) {
  const xs = []
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [x1, y1] = poly[j], [x2, y2] = poly[i]
    if ((y1 > y) === (y2 > y)) continue
    xs.push(x1 + (y - y1) / (y2 - y1) * (x2 - x1))
  }
  return xs.length < 2 ? 0 : Math.max(...xs) - Math.min(...xs)
}

/** Pick the wrapping and size that fit the space the shape actually offers. */
const CHAR_W = 0.58          // caps serif, as a fraction of font size
function fitLabel(t, name) {
  const avail = Math.max(widthAt(t.poly, t.marker[1]), 24) * 0.92
  let best = null
  for (const lines of [[name], wrap(name)]) {
    const longest = Math.max(...lines.map(l => l.length))
    const size = Math.min(DECOR.label, avail / (CHAR_W * longest))
    if (!best || size > best.size) best = { lines, size }
  }
  return { lines: best.lines, size: Math.max(5.5, round(best.size, 1)) }
}

const terrain = []
// Fills first, then every border pass, so no fill can paint over a neighbour's
// border. The original black strokes stay on top of all of it.
for (const t of territories) {
  terrain.push(`<path d="${t.el.attrs.d}" fill="${styleFor(t).fill}"/>`)
}
// The Polar Sink is mottled rather than flat: a few faint blobs clipped to its
// own outline. Clip paths are declared inline so the layer stays self-contained.
const sinkT = territories.find(t => dataFor(t).terrain === 'polar-sink')
if (sinkT) {
  terrain.push(`<clipPath id="clip-${sinkT.id}"><path d="${sinkT.el.attrs.d}"/></clipPath>`)
  const [mx, my] = sinkT.marker
  for (const [dx, dy, r, o] of [[-18, -12, 26, 0.05], [14, 8, 20, 0.07], [-4, 22, 16, 0.04], [22, -18, 13, 0.06]]) {
    terrain.push(`<ellipse cx="${round(mx + dx)}" cy="${round(my + dy)}" rx="${r}" ry="${round(r * 0.72)}" `
      + `fill="#8d7f63" opacity="${o}" clip-path="url(#clip-${sinkT.id})"/>`)
  }
}
for (const t of territories) {
  const s = styleFor(t)
  // pass 0 is the widest dark stroke; odd passes paint the fill back over its
  // middle, leaving parallel dark edges showing.
  const widths = { 1: [2], 2: [5, 2.2], 3: [7.5, 5, 1.8] }[s.borders] ?? [2]
  widths.forEach((w, i) => {
    terrain.push(`<path d="${t.el.attrs.d}" fill="none" stroke="${i % 2 ? s.fill : DECOR.ink}" `
      + `stroke-width="${w}" stroke-linejoin="round"/>`)
  })
}

// Label anchors start at the territory's marker point and are then pushed
// apart where the TEXT BOXES overlap — which happens even though the shapes do
// not, most visibly where a sietch sits in the middle of the flat it is named
// after. Nudging is cosmetic and applies to the labels only: the centroids in
// the data module stay purely geometric, because troop placement should not
// drift to make room for a caption.
const placed = territories.map(t => {
  const { lines, size } = fitLabel(t, dataFor(t).name)
  return {
    t, lines, size,
    at: t.marker.slice(),
    w: Math.max(...lines.map(l => l.length)) * CHAR_W * size,
    h: lines.length * size * 1.15,
  }
})
for (let pass = 0; pass < 6; pass++) {
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i], b = placed[j]
      const ox = (a.w + b.w) / 2 - Math.abs(a.at[0] - b.at[0])
      const oy = (a.h + b.h) / 2 - Math.abs(a.at[1] - b.at[1])
      if (ox <= 0 || oy <= 0) continue          // boxes clear of each other
      // Separate along the shallower axis, and only keep a move that leaves
      // the anchor inside its own territory.
      const dy = Math.sign(a.at[1] - b.at[1]) || 1
      const shift = Math.min(oy / 2 + 0.5, 6)
      for (const [g, dir] of [[a, dy], [b, -dy]]) {
        const next = [g.at[0], g.at[1] + dir * shift]
        if (inside(next, g.t.poly)) g.at = next
      }
    }
  }
}
// Hand overrides go on last, after placement and repulsion, so they always win.
// Nothing here touches t.marker — the exported centroid stays where the
// geometry put it, because troop placement should not follow a label tweak.
const unknownOverrides = Object.keys(LABEL_OVERRIDES).filter(id => !territories.some(t => t.id === id))
if (unknownOverrides.length) {
  throw new Error(`LABEL_OVERRIDES names territories that do not exist: ${unknownOverrides.join(', ')}`)
}
for (const p of placed) {
  const o = LABEL_OVERRIDES[p.t.id] ?? {}
  // Keep what the automatic passes decided, before any override touches it.
  // The label editor needs this to work out what an override VALUE should be:
  // reading only the final position, it could not tell an entry that already
  // exists from one still to be written, and tuning would compound each save.
  p.base = { x: p.at[0], y: p.at[1], size: round(p.size * LABEL_SCALE, 2) }
  p.size = round(p.size * LABEL_SCALE * (o.scale ?? 1), 2)
  p.at = [p.at[0] + (o.dx ?? 0), p.at[1] + (o.dy ?? 0)]
  p.rotate = o.rotate ?? 0
}

const anchorOf = new Map(placed.map(p => [p.t, p]))

const labels = []
for (const t of territories) {
  const d = dataFor(t)
  const s = styleFor(t)
  const p = anchorOf.get(t)
  const [x, y] = p.at
  const { lines, size } = p
  const top = y - ((lines.length - 1) * size * 0.58)
  // One pivot for every line of a wrapped name — the anchor itself — so the
  // block turns as a unit instead of each line swinging about its own centre.
  const spin = p.rotate ? ` transform="rotate(${round(p.rotate, 2)} ${round(x)} ${round(y)})"` : ''
  lines.forEach((line, i) => {
    // paint-order puts the stroke behind the glyphs, so a fill-coloured halo
    // keeps the name legible where it crosses its own border without showing
    // as an outline on flat ground.
    labels.push(`<text x="${round(x)}" y="${round(top + i * size * 1.15)}" font-size="${size}" `
      + `fill="${s.text ?? DECOR.ink}" text-anchor="middle" dominant-baseline="middle" `
      + `font-family="Georgia, 'Times New Roman', serif" letter-spacing="0.5" `
      + `paint-order="stroke" stroke="${s.fill}" stroke-width="${round(size * 0.28, 2)}" stroke-linejoin="round"`
      + ` data-territory="${t.id}" data-bx="${round(p.base.x)}" data-by="${round(p.base.y)}" data-bs="${p.base.size}"`
      + `${d.stronghold ? ' font-weight="bold"' : ''}${spin}>${esc(line.toUpperCase())}</text>`)
  })
}

// Spice badges sit outside the rim, on the bearing of the sector the blow
// actually lands in — so a two-sector territory's badge points at the half
// that can be mined, not at the middle of the whole shape.
// Two territories can draw their spice from the same sector — The Great Flat
// and Funeral Plain both mine sector-15 — and their badges would land on the
// same bearing. Fan those apart within the wedge instead of stacking them.
const badgeGroups = new Map()
for (const t of territories) {
  if (dataFor(t).spiceBlow == null || t.spiceSector == null) continue
  if (!badgeGroups.has(t.spiceSector)) badgeGroups.set(t.spiceSector, [])
  badgeGroups.get(t.spiceSector).push(t)
}
for (const t of territories) {
  const d = dataFor(t)
  if (d.spiceBlow == null || t.spiceSector == null) continue
  const sec = ordered.find(s => s.number === t.spiceSector)
  let span = norm(sec.to) - norm(sec.from)
  if (span < 0) span += 360
  const group = badgeGroups.get(t.spiceSector)
  const slot = group.indexOf(t) - (group.length - 1) / 2
  const a = (norm(sec.from) + span / 2 + slot * span * 0.42 - 90) * Math.PI / 180
  const bx = CX + DECOR.badgeRadius * Math.cos(a), by = CY + DECOR.badgeRadius * Math.sin(a)
  labels.push(`<circle cx="${round(bx)}" cy="${round(by)}" r="15" fill="${DECOR.badge.fill}" `
    + `stroke="${DECOR.badge.ring}" stroke-width="1.6"/>`)
  // A small Archimedean spiral, the board's mark for spice.
  const arm = []
  for (let k = 0; k <= 26; k++) {
    const th = k / 26 * 3.4 * Math.PI, rr = 0.9 + th * 0.72
    arm.push(`${round(bx - 6 + rr * Math.cos(th))},${round(by - 5.5 + rr * Math.sin(th))}`)
  }
  labels.push(`<polyline points="${arm.join(' ')}" fill="none" stroke="${DECOR.badge.ring}" `
    + `stroke-width="1.1" stroke-linecap="round" opacity="0.85"/>`)
  labels.push(`<text x="${round(bx + 4)}" y="${round(by + 5)}" font-size="12" fill="${DECOR.badge.text}" `
    + `text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="bold">${d.spiceBlow}</text>`)
}

out = out.replace(/(<svg[^>]*>)/, `$1\n<g id="dune-terrain">\n${terrain.join('\n')}\n</g>`)
out = out.replace('</svg>', `<g id="dune-labels">\n${labels.join('\n')}\n</g>\n</svg>`)
out = out.replace(/\n{2,}/g, '\n')
writeFileSync(OUT_SVG, out)

// ─── Emit: data module ────────────────────────────────────────────────────────
const q = s => (s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "\\'")}'`)

const lines = []
lines.push(`// GENERATED by scripts/build-dune-board.mjs — do not edit by hand.`)
lines.push(`// Source: public/dune-board (1).svg  →  public/dune-board.svg`)
lines.push(`//`)
lines.push(`// Geometry (centroids, sector spans) is computed from the SVG paths. Names,`)
lines.push(`// terrain and stronghold status are NOT in the SVG: fill TERRITORY_NAMES in`)
lines.push(`// the script and the placeholder fields here, then re-run so the SVG ids and`)
lines.push(`// this module stay in step.`)
lines.push(``)
lines.push(`export type DuneTerrain = 'sand' | 'rock' | 'polar-sink' | 'stronghold'`)
lines.push(``)
lines.push(`export interface DuneTerritory {`)
lines.push(`  id: string`)
lines.push(`  displayName: string`)
lines.push(`  /** Storm sectors this territory overlaps, computed from the geometry. */`)
lines.push(`  sectors: string[]`)
lines.push(`  /** Where a troop marker sits. Inside the shape even when it is concave. */`)
lines.push(`  centroid: { x: number; y: number }`)
lines.push(`  terrain: DuneTerrain`)
lines.push(`  /** The sector a blow puts spice in — one sector, not the whole`)
lines.push(`   *  territory. Broken Land spans 1 and 18; its spice is in 18. */`)
lines.push(`  spiceSector: string | null`)
lines.push(`  /** One per sector this territory overlaps. Troops occupy a CELL, not a`)
lines.push(`   *  territory: a stack in Broken Land sector-18 dies to a storm in 18 and`)
lines.push(`   *  survives one in sector-1. */`)
lines.push(`  cells: DuneCell[]`)
lines.push(`  stronghold: boolean`)
lines.push(`  /** Spice a blow places here (6–12). Exactly the fifteen territories`)
lines.push(`   *  carrying a marker on the board — the build asserts the two agree. */`)
lines.push(`  spiceBlow: number | null`)
lines.push(`  /** The fixed payout of the three city strongholds (2 / 2 / 1). Not a`)
lines.push(`   *  blow: none of them has a marker. */`)
lines.push(`  spiceIncome: number | null`)
lines.push(`  /** Arrakeen and Carthag. */`)
lines.push(`  ornithopters: boolean`)
lines.push(`}`)
lines.push(``)
lines.push(`/** A (territory, sector) pair — the actual unit of occupancy. 'at' is where`)
lines.push(` *  to draw the stack; areaShare is how much of the territory this cell is. */`)
lines.push(`export interface DuneCell { sector: string; at: { x: number; y: number }; areaShare: number }`)
lines.push(``)
lines.push(`export interface DuneSector { id: string; number: number; fromBearing: number; toBearing: number }`)
lines.push(`export interface DuneMarker { id: string; x: number; y: number }`)
lines.push(`export interface DuneSpiceMarker extends DuneMarker { territoryId: string | null; sectorId: string | null }`)
lines.push(``)
lines.push(`/** The board circle, from the export's own rim circle. */`)
lines.push(`export const DUNE_BOARD = { cx: ${CX}, cy: ${CY}, radius: ${RIM}, viewBox: '0 0 970 1099' } as const`)
lines.push(``)
lines.push(`/** 18 storm sectors. sector-1 contains due north; numbering runs clockwise. */`)
lines.push(`export const DUNE_SECTORS: DuneSector[] = [`)
for (const s of ordered) {
  lines.push(`  { id: ${q(s.id)}, number: ${s.number}, fromBearing: ${round(norm(s.from), 1)}, toBearing: ${round(norm(s.to), 1)} },`)
}
lines.push(`]`)
lines.push(``)
lines.push(`export const DUNE_TERRITORIES: DuneTerritory[] = [`)
for (const t of territories) {
  const d = dataFor(t)
  lines.push(`  {`)
  lines.push(`    id: ${q(t.id)},`)
  lines.push(`    displayName: ${q(d.name)},`)
  lines.push(`    sectors: [${t.sectors.map(s => q(`sector-${s.n}`)).join(', ')}],`)
  lines.push(`    centroid: { x: ${round(t.marker[0])}, y: ${round(t.marker[1])} },`)
  lines.push(`    terrain: ${q(d.terrain)},`)
  lines.push(`    spiceSector: ${t.spiceSector ? q(`sector-${t.spiceSector}`) : 'null'},`)
  lines.push(`    stronghold: ${d.stronghold ? 'true' : 'false'},`)
  lines.push(`    spiceBlow: ${d.spiceBlow ?? 'null'},`)
  lines.push(`    spiceIncome: ${d.spiceIncome ?? 'null'},`)
  lines.push(`    ornithopters: ${d.ornithopters ? 'true' : 'false'},`)
  lines.push(`    cells: [`)
  for (const c of t.cells) {
    lines.push(`      { sector: ${q(`sector-${c.n}`)}, at: { x: ${round(c.at[0])}, y: ${round(c.at[1])} }, areaShare: ${round(c.share, 3)} },`)
  }
  lines.push(`    ],`)
  lines.push(`  },`)
}
lines.push(`]`)
lines.push(``)
lines.push(`/** Six seats around the rim, clockwise from due north. */`)
lines.push(`export const DUNE_PLAYER_POSITIONS: DuneMarker[] = [`)
for (const p of playerPositions) lines.push(`  { id: ${q(p.id)}, x: ${round(p.x)}, y: ${round(p.y)} },`)
lines.push(`]`)
lines.push(``)
lines.push(`/** Spice blow markers, with the territory and sector each one sits in. */`)
lines.push(`export const DUNE_SPICE_MARKERS: DuneSpiceMarker[] = [`)
for (const s of spiceMarkers) {
  lines.push(`  { id: ${q(s.id)}, x: ${round(s.x)}, y: ${round(s.y)}, territoryId: ${q(s.territoryId)}, sectorId: ${s.sectorNumber ? q(`sector-${s.sectorNumber}`) : 'null'} },`)
}
lines.push(`]`)
lines.push(``)
lines.push(`/** The nine-stop track arcing above the board. Purpose not yet established. */`)
lines.push(`export const DUNE_TRACK: DuneMarker[] = [`)
for (const s of trackStops) lines.push(`  { id: ${q(s.id)}, x: ${round(s.x)}, y: ${round(s.y)} },`)
lines.push(`]`)
lines.push(``)
lines.push(`/** Territories the storm hits when it sits in a given sector. */`)
lines.push(`export const TERRITORIES_BY_SECTOR: Record<string, string[]> = {`)
for (const s of ordered) {
  const ids = territories.filter(t => t.sectors.some(x => x.n === s.number)).map(t => t.id)
  lines.push(`  ${q(s.id)}: [${ids.map(q).join(', ')}],`)
}
lines.push(`}`)
lines.push(``)

mkdirSync(dirname(OUT_TS), { recursive: true })
writeFileSync(OUT_TS, lines.join('\n'))

console.log(`\nwrote  public/dune-board.svg`)
console.log(`wrote  src/data/dune/boardData.ts`)
