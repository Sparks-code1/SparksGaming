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
const TERRITORY_NAMES = {
  // (empty — add entries as 'territory-NN': 'Name')
}

/**
 * The one name derivable from the file itself.
 *
 * On the Dune map the Polar Sink is the region at the centre of the board, and
 * exactly one shape here sits on the centre. That is a geometric fact, not a
 * shape match, so it is resolved by measurement below rather than pinned to a
 * positional id that could shift if the ordering changes. It is only applied
 * when the centre shape is unambiguous — clearly central in absolute terms, and
 * clearly more central than the next candidate. Otherwise the build leaves it
 * unnamed and says so.
 */
const CENTRE_NAME = 'Polar Sink'
const CENTRE_MAX_R = 40      // must be this close to the true centre
const CENTRE_MARGIN = 3      // and this many times closer than the runner-up

/** Sector numbering: sector-1 is the wedge containing due north (bearing 0°),
 *  then clockwise. Stated as a convention because the export has no numbers. */
const SECTOR_ONE_BEARING = 0

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

/** A marker point guaranteed to sit inside the polygon — the centroid when it
 *  lands inside, otherwise the interior sample furthest from any edge. Concave
 *  territories (and the ring-shaped Polar Sink) need this or troop counters
 *  render outside their own borders. */
function markerPoint(poly) {
  const c = centroid(poly)
  if (inside(c, poly)) return c
  const [x0, y0, x1, y1] = bbox(poly)
  let best = c, bestD = -1
  const N = 40
  for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) {
    const p = [x0 + (x1-x0)*i/N, y0 + (y1-y0)*j/N]
    if (!inside(p, poly)) continue
    let d = Infinity
    for (let k = 0, l = poly.length - 1; k < poly.length; l = k++) {
      const [ax, ay] = poly[l], [bx, by] = poly[k]
      const vx = bx-ax, vy = by-ay, wx = p[0]-ax, wy = p[1]-ay
      const t = Math.max(0, Math.min(1, (wx*vx + wy*vy) / (vx*vx + vy*vy || 1)))
      d = Math.min(d, Math.hypot(wx - t*vx, wy - t*vy))
    }
    if (d > bestD) { bestD = d; best = p }
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
const svg = readFileSync(SRC, 'utf8').replace(MY_IDS, '')
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

// Number clockwise from the wedge that contains due north.
const norm = a => ((a % 360) + 360) % 360
const containsNorth = s => {
  const f = norm(s.from), t = norm(s.to)
  return f > t ? (SECTOR_ONE_BEARING >= f || SECTOR_ONE_BEARING <= t) : (SECTOR_ONE_BEARING >= f && SECTOR_ONE_BEARING <= t)
}
const startIdx = sectors.findIndex(containsNorth)
if (startIdx < 0) throw new Error('no sector wedge contains due north — check SECTOR_ONE_BEARING')
const byBearing = [...sectors].sort((a, b) => norm(a.from) - norm(b.from))
const first = byBearing.findIndex(s => s === sectors[startIdx])
const ordered = [...byBearing.slice(first), ...byBearing.slice(0, first)]
ordered.forEach((s, i) => { s.id = `sector-${i + 1}`; s.number = i + 1 })

// The dashed wedges are drawn with a stroke width, so consecutive spans leave
// sub-degree gaps between them. Left alone, a bearing landing in a gap belongs
// to no sector — fine for the precomputed lookup, wrong for any runtime "which
// sector is the storm in?" query. Snap each boundary to the midpoint of the gap
// so the 18 sectors partition the circle exactly.
for (let i = 0; i < ordered.length; i++) {
  const cur = ordered[i], next = ordered[(i + 1) % ordered.length]
  let gap = norm(next.from) - norm(cur.to)
  if (gap > 180) gap -= 360
  if (gap < -180) gap += 360
  const mid = norm(cur.to) + gap / 2
  cur.to = mid
  next.from = mid
}

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
  const hits = new Map()
  let total = 0
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const p = [x0 + (x1-x0)*i/N, y0 + (y1-y0)*j/N]
    if (!inside(p, t.poly)) continue
    total++
    const s = sectorAt(bearing(p[0], p[1]))
    if (s) hits.set(s.number, (hits.get(s.number) ?? 0) + 1)
  }
  t.samples = total
  t.sectors = [...hits.entries()]
    .map(([n, c]) => ({ n, share: c / (total || 1) }))
    .filter(s => s.share >= OVERLAP_MIN)
    .sort((a, b) => a.n - b.n)
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

// Resolve the centre shape by measurement, and only accept it if it is
// unambiguous. A near-tie means two regions straddle the middle and neither can
// be called the Polar Sink from geometry alone.
const byCentre = [...territories].sort((a, b) => a.cr - b.cr)
let centreNote = ''
if (byCentre.length >= 2 && byCentre[0].cr <= CENTRE_MAX_R && byCentre[0].cr * CENTRE_MARGIN < byCentre[1].cr) {
  TERRITORY_NAMES[byCentre[0].id] = CENTRE_NAME
  centreNote = `${byCentre[0].id} named ${CENTRE_NAME} (${byCentre[0].cr.toFixed(0)}px from centre; next nearest ${byCentre[1].cr.toFixed(0)}px)`
} else {
  centreNote = `centre shape ambiguous (nearest ${byCentre[0]?.cr.toFixed(0)}px, next ${byCentre[1]?.cr.toFixed(0)}px) — left unnamed`
}

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
const named = territories.filter(t => TERRITORY_NAMES[t.id]).length
console.log(`named         ${named}/${territories.length}  (${territories.length - named} awaiting TERRITORY_NAMES)`)
console.log(`centre        ${centreNote}`)

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
const nameOf = t => TERRITORY_NAMES[t.id]

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
lines.push(`export type DuneTerrain = 'sand' | 'rock' | 'imperial-basin' | 'polar-sink' | null`)
lines.push(``)
lines.push(`export interface DuneTerritory {`)
lines.push(`  id: string`)
lines.push(`  /** null until named — see TERRITORY_NAMES in the build script. */`)
lines.push(`  displayName: string | null`)
lines.push(`  /** Storm sectors this territory overlaps, computed from the geometry. */`)
lines.push(`  sectors: string[]`)
lines.push(`  /** Where a troop marker sits. Inside the shape even when it is concave. */`)
lines.push(`  centroid: { x: number; y: number }`)
lines.push(`  /** Placeholder — to fill in. */`)
lines.push(`  terrain: DuneTerrain`)
lines.push(`  /** Placeholder — to fill in. */`)
lines.push(`  stronghold: boolean | null`)
lines.push(`}`)
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
  const name = nameOf(t)
  lines.push(`  {`)
  lines.push(`    id: ${q(t.id)},`)
  lines.push(`    displayName: ${name ? q(name) : 'null'},`)
  lines.push(`    sectors: [${t.sectors.map(s => q(`sector-${s.n}`)).join(', ')}],`)
  lines.push(`    centroid: { x: ${round(t.marker[0])}, y: ${round(t.marker[1])} },`)
  lines.push(`    terrain: null,`)
  lines.push(`    stronghold: null,`)
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
