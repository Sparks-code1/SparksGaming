// The turn dial: which wedge is which turn.
//
// The dial prints ten numbers and, until now, no indication of which one you
// are on. Marking the right one means knowing where turn 1 is and which way
// round they run, and the artwork says neither in words — the numerals are
// glyph paths, not text, so nothing in the file is labelled "1".
//
// So the reading is DERIVED, and this is where it is checked. Two independent
// pieces of evidence, either of which would catch a dial marked backwards or
// off by one — both of which look entirely plausible on screen, and one of
// which would only be noticed in the tenth turn of a real game:
//
//   The ten wedge arcs in the artwork. Each BEGINS on the rim at its own
//   leading edge, so their starting points are the ten boundaries exactly —
//   0, 36, 72 and so on round to 324. No other alignment of ten wedges, and
//   neither direction of travel, produces that set.
//
//   The printed numerals. The 1 sits in the first wedge and the 1 of the 10 in
//   the last, which is what fixes the DIRECTION: 10 immediately anticlockwise
//   of 1 means the numbers advance clockwise.
import { readFileSync } from 'node:fs'
import { DUNE_TURN_DIAL } from '@/data/dune/boardData'
import { turnWedgePath, DIAL_WEDGES } from '@/components/dune/DuneBoard'
import { flattenPath, bounds } from './lib/svgPath'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

const svg = readFileSync('public/dune-board.svg', 'utf8')
const { x: CX, y: CY, r: R, rInner: RI } = DUNE_TURN_DIAL

const bearing = (x: number, y: number) => {
  const b = (Math.atan2(x - CX, -(y - CY)) * 180) / Math.PI
  return b < 0 ? b + 360 : b
}
/** Which wedge a bearing falls in, 1..10. */
const wedgeAt = (deg: number) => Math.floor(((deg % 360) + 360) % 360 / (360 / DIAL_WEDGES)) + 1

// ── the export describes the circle the board prints ──────────────────────
{
  const circles = [...svg.matchAll(/<circle([^>]*)>/g)].map(m => {
    const n = (s: string) => Number(m[1].match(new RegExp(`${s}="([\\d.-]+)"`))?.[1] ?? NaN)
    return { cx: n('cx'), cy: n('cy'), r: n('r') }
  })
  const dial = circles.find(c =>
    Math.abs(c.cx - CX) < 0.5 && Math.abs(c.cy - CY) < 0.5 && Math.abs(c.r - R) < 0.5)
  check('the dial the export names is on the board', dial !== undefined, true)
  // The moon is the same size and colour, mirrored across the board's centre —
  // so "a circle of about this radius" would find two. This one is the LEFT one.
  check('...and is the left-hand one, not the moon it was mirrored to',
    CX < 485, true)
}

// ── the wedge arcs agree with a ten-wedge dial starting at the top ────────
// Each wedge's arc BEGINS on the rim at that wedge's leading edge, so the ten
// starting points are the ten boundaries — exact numbers straight out of the
// artwork, needing no curve flattening and no bounding boxes to blur them.
{
  const starts = [...svg.matchAll(/<path[^>]*\sd="M([\d.]+) ([\d.]+)C/g)]
    .map(m => ({ x: Number(m[1]), y: Number(m[2]) }))
    .filter(p => Math.abs(Math.hypot(p.x - CX, p.y - CY) - R) < 1.5)
    .map(p => Math.round(bearing(p.x, p.y)))
  // Each arc is drawn TWICE in the export — once filled, once stroked — so the
  // twenty starts are ten boundaries apiece. Deduplicated rather than divided
  // by two, which would keep passing if the artwork ever stopped doubling them.
  const edges = [...new Set(starts)].sort((u, v) => u - v)

  check('every wedge edge is drawn twice, filled and stroked',
    starts.length, edges.length * 2)
  check('the dial has ten wedges drawn on it', edges.length, DIAL_WEDGES)
  // THE WHOLE READING, in one line. Ten boundaries, 36 apart, the first at the
  // top. A dial that ran the other way or started anywhere else would not
  // produce this set.
  check('...whose edges are the ten turn boundaries',
    edges, [0, 36, 72, 108, 144, 180, 216, 252, 288, 324])
}

// ── the printed numerals fall in the wedges they name ─────────────────────
// The glyphs are paths. These two are found by their exact opening commands,
// which is stable because they are generated from the source artwork verbatim.
{
  // FLATTENED PROPERLY. These glyphs are drawn `M111 42 V59 H107 V45 …`, and
  // pairing the numbers off as coordinates shifts parity at every H and V —
  // which put the 1 on the far side of the dial, in turn 10's wedge, with
  // complete confidence.
  const glyphAt = (prefix: string) => {
    const m = svg.match(new RegExp(`d="(${prefix}[^"]*)"`))
    if (!m) return null
    const b = bounds(flattenPath(m[1]))
    return bearing(b.cx, b.cy)
  }

  // The standalone 1, right of the dial's centre line at the top.
  const one = glyphAt('M111\\.532 42\\.3599V59\\.8145')
  check('the printed 1 can be found', one !== null, true)
  check('...and it is in the first wedge', one === null ? null : wedgeAt(one), 1)

  // The 1 of the 10, left of the centre line. Its presence on the OTHER side of
  // the top is what fixes the direction: 10 before 1 means clockwise.
  const ten = glyphAt('M64\\.8425 42\\.3599V59\\.8145')
  check('the 1 of the 10 can be found', ten !== null, true)
  check('...and it is in the last wedge', ten === null ? null : wedgeAt(ten), DIAL_WEDGES)
}

// ── the wedge the overlay draws ───────────────────────────────────────────
{
  check('a wedge is drawn for every turn of a game',
    Array.from({ length: DIAL_WEDGES }, (_, i) => turnWedgePath(i + 1)).filter(d => d === null), [])
  check('...and for no turn outside one',
    [turnWedgePath(0), turnWedgePath(DIAL_WEDGES + 1), turnWedgePath(1.5)],
    [null, null, null])

  // AN ANNULAR SECTOR, which is the shape the printed wedges are. It was a cone
  // struck from the dial's centre, which covered a hub the wedges stop short of
  // and was simply a different shape from the thing it was marking.
  //
  //   M outer-start  A outer  outer-end  L inner-end  A inner  inner-start  Z
  const SHAPE = /^M (\S+) (\S+) A (\S+) \S+ 0 0 1 (\S+) (\S+) L (\S+) (\S+) A (\S+) \S+ 0 0 0 (\S+) (\S+) Z$/
  const parts = (turn: number) => turnWedgePath(turn)!.match(SHAPE)

  check('every wedge is drawn as an annular sector',
    Array.from({ length: DIAL_WEDGES }, (_, i) => parts(i + 1) === null).filter(Boolean), [])

  const startOf = (turn: number) => {
    const p = parts(turn)!
    return Math.round(bearing(Number(p[1]), Number(p[2])))
  }
  check('the wedges start where the turn number says',
    Array.from({ length: DIAL_WEDGES }, (_, i) => startOf(i + 1)),
    [0, 36, 72, 108, 144, 180, 216, 252, 288, 324])

  // The two radii are the dial's own, not invented: inside the printed rim and
  // outside the hub, so the mark sits within its wedge rather than over the
  // lines either side of it.
  {
    const p = parts(1)!
    const outer = Number(p[3]), inner = Number(p[8])
    check('the outer edge is just inside the rim', outer > R * 0.9 && outer < R, true)
    check('the inner edge is just outside the hub',
      inner > RI && inner < RI * 1.25, true)
    // Every corner lands on one of those two radii — a wedge with one corner at
    // the centre is the cone this replaced.
    const at = (i: number) => Math.hypot(Number(p[i]) - CX, Number(p[i + 1]) - CY)
    check('...and all four corners sit on them',
      [at(1), at(4), at(6), at(9)].map(v => Math.round(v)),
      [Math.round(outer), Math.round(outer), Math.round(inner), Math.round(inner)])
    check('...so none of them is the dial centre',
      [at(1), at(4), at(6), at(9)].some(v => v < 1), false)
  }
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')
process.exit(pass ? 0 : 1)
