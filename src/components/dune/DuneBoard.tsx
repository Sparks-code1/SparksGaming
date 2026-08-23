/**
 * The board, and everything drawn on top of it.
 *
 * Two layers sharing one coordinate system: the generated SVG, fetched and
 * INLINED rather than dropped in an <img>, and an overlay <svg> with the same
 * viewBox over it. Inlined because an <img> is opaque — the overlay would have
 * to be positioned against a picture, by eye, and every marker would be wrong
 * the first time the board was regenerated. This way both are driven by the
 * numbers in boardData.
 *
 * Extracted from the dev view so the game screen and the dev harness draw the
 * SAME board. They were about to be two copies of the fetch, the width fix-up,
 * the storm wedge and the stack markers, and the copies do not stay equal.
 *
 * `children` are rendered INSIDE the overlay, in board coordinates, for the
 * things only one caller has — the dev harness's territory picker.
 */
import { useEffect, useState } from 'react'
import {
  DUNE_BOARD, DUNE_PLAYER_POSITIONS, DUNE_SECTORS, DUNE_STORM_RING, DUNE_TERRITORIES,
  DUNE_TRACK, DUNE_TURN_DIAL,
} from '@/data/dune/boardData'
import { DUNE_PHASES } from '@/types/Dune/Game'
import type { FactionId } from '@/types/Dune/Faction'
import type { GameMode, GamePhase, SectorId, SpiceDeckPublic, TerritoryId } from '@/types/Dune/Game'
import { SeatLayer, FACTION_LOOK } from './SeatLayer'
import { SpiceDeckArea } from './SpiceDeckArea'

const { cx, cy } = DUNE_BOARD
const PALE = '#f0e2bb'
const WAITING = '#c9542a'

function polar(bearing: number, r: number): [number, number] {
  const a = ((bearing - 90) * Math.PI) / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}

/** The storm marker: a wedge filling its sector of the ring the board draws. */
export function stormWedge(sector: SectorId): string | null {
  const s = DUNE_SECTORS.find(x => x.id === sector)
  if (!s) return null
  const { inner, outer } = DUNE_STORM_RING
  let span = s.toBearing - s.fromBearing
  if (span < 0) span += 360
  const [x1, y1] = polar(s.fromBearing, inner)
  const [x2, y2] = polar(s.fromBearing, outer)
  const [x3, y3] = polar(s.fromBearing + span, outer)
  const [x4, y4] = polar(s.fromBearing + span, inner)
  const big = span > 180 ? 1 : 0
  return [
    'M', x1, y1, 'L', x2, y2,
    'A', outer, outer, 0, big, 1, x3, y3,
    'L', x4, y4,
    'A', inner, inner, 0, big, 0, x1, y1, 'Z',
  ].join(' ')
}

/** Where a stack stands: the cell for this (territory, sector). */
export function cellAt(territoryId: string, sector: string) {
  const t = DUNE_TERRITORIES.find(x => x.id === territoryId)
  return t?.cells.find(c => c.sector === sector)?.at ?? t?.centroid ?? null
}

export interface DuneBoardStack {
  territoryId: string
  sector: string
  faction?: FactionId
  count: number
}

export interface DuneBoardProps {
  storm: SectorId
  stacks: readonly DuneBoardStack[]
  /** Spice lying in territories, keyed by territory id. */
  spice: Readonly<Record<string, number>>
  seating: Readonly<Record<string, FactionId | null | undefined>>
  deck: SpiceDeckPublic
  mode: GameMode
  /** Territories a worm surfaced in this turn. */
  worms?: readonly TerritoryId[]
  /**
   * The seat the table is waiting on, ringed so everyone can see who.
   *
   * On the BOARD rather than only in the HUD, because the board is where
   * everybody is already looking. Six people round a table can see who is
   * thinking; six people in six browsers cannot, and that is the commonest way
   * a networked game stalls with nobody sure whose move it is.
   */
  awaiting?: FactionId | null
  /**
   * The phase of the turn, marked on the board's own nine medallions.
   *
   * The board already prints the nine, in order, left to right along the top —
   * DUNE_TRACK, drawn with a symbol each by PHASE_SYMBOLS in the generator. A
   * second list of the same nine across the top of the screen was a duplicate
   * of something the board says better, and it took a strip of the screen to
   * say it worse.
   */
  phase?: GamePhase | null
  /**
   * Which turn it is, 1–10, marked on the dial the board prints top left.
   *
   * The dial has the ten numbers on it and no way of saying which one you are
   * on, which is a countdown you cannot read. Same argument as the phase track:
   * the board already draws the thing, so mark it there rather than printing a
   * second copy somewhere else.
   */
  turn?: number | null
  /** The board takes clicks only when a caller wants them. */
  interactive?: boolean
  children?: React.ReactNode
}

/**
 * Which of the nine medallions is lit.
 *
 * DUNE_TRACK is in phase order and runs left to right across the top — track-1
 * at x=239 through track-9 at x=730 — so the index IS the phase number minus
 * one. Both come from the same walk of the artwork in the generator, which is
 * what stops the mark landing on the wrong circle.
 *
 * A TINT AND A RING, not a filled disc: the medallion has a symbol printed in
 * it, and the symbol is what says which phase this is. Covering it to point at
 * it would be a strange way round.
 */
function PhaseMark({ phase }: { phase: GamePhase }) {
  const at = DUNE_PHASES.indexOf(phase)
  const stop = at >= 0 ? DUNE_TRACK[at] : undefined
  if (!stop) return null
  return (
    <g data-layer="phase-track" data-phase={phase} data-phase-number={at + 1} pointerEvents="none">
      <title>{`Phase ${at + 1} — ${phase}`}</title>
      <circle cx={stop.x} cy={stop.y} r={18.5} fill={WAITING} fillOpacity={0.28} />
      <circle cx={stop.x} cy={stop.y} r={21} fill="none" stroke={WAITING} strokeWidth={2.6} />
    </g>
  )
}

/** How many wedges the dial is divided into — a game is ten turns. */
export const DIAL_WEDGES = 10

/**
 * The wedge for one turn, as a pie slice of the dial.
 *
 * CLOCKWISE FROM THE TOP, 36 degrees each: turn N spans (N-1)*36 to N*36. See
 * DUNE_TURN_DIAL for where that reading comes from — it is derived from the
 * artwork's own wedge arcs and confirmed against the printed numerals, not
 * guessed from the picture.
 */
export function turnWedgePath(turn: number): string | null {
  if (!Number.isInteger(turn) || turn < 1 || turn > DIAL_WEDGES) return null
  const { x, y, r, rInner } = DUNE_TURN_DIAL
  const span = 360 / DIAL_WEDGES
  const at = (deg: number, rad: number): [number, number] => {
    const a = ((deg - 90) * Math.PI) / 180
    return [x + rad * Math.cos(a), y + rad * Math.sin(a)]
  }
  // AN ANNULAR SECTOR, which is the shape the numbers actually sit in. It was a
  // cone struck from the dial's centre, which is a different shape from the
  // wedge it was marking and covered a hub the wedges stop short of. Both radii
  // are pulled a hair inside the printed edges so the mark sits within its
  // wedge rather than on the lines either side of it.
  const ro = r * 0.965
  const ri = rInner * 1.06
  const [ox1, oy1] = at((turn - 1) * span, ro)
  const [ox2, oy2] = at(turn * span, ro)
  const [ix2, iy2] = at(turn * span, ri)
  const [ix1, iy1] = at((turn - 1) * span, ri)
  return `M ${ox1} ${oy1} A ${ro} ${ro} 0 0 1 ${ox2} ${oy2} `
    + `L ${ix2} ${iy2} A ${ri} ${ri} 0 0 0 ${ix1} ${iy1} Z`
}

/**
 * The turn, marked on the dial.
 *
 * A TINT AND AN EDGE, like the phase medallion: the number printed in the wedge
 * is what says which turn it is, so covering it to point at it would be an odd
 * way round.
 */
function TurnMark({ turn }: { turn: number }) {
  const d = turnWedgePath(turn)
  if (!d) return null
  return (
    <g data-layer="turn-dial" data-turn={turn} pointerEvents="none">
      <title>{`Turn ${turn} of ${DIAL_WEDGES}`}</title>
      <path d={d} fill={WAITING} fillOpacity={0.3} stroke={WAITING} strokeWidth={2}
        strokeLinejoin="round" />
    </g>
  )
}

/** The ring round the seat the game is waiting on. */
function AwaitingMark({ faction, seating }: {
  faction: FactionId
  seating: Readonly<Record<string, FactionId | null | undefined>>
}) {
  // Found by faction rather than by seat id: the caller says WHO is being
  // waited on, and where they sit is the seating's business.
  const entry = Object.entries(seating).find(([, f]) => f === faction)
  const pos = entry && DUNE_PLAYER_POSITIONS.find(p => p.id === entry[0])
  // Waiting on somebody who is not seated is a state worth failing quietly on:
  // a ring floating at the origin is worse than no ring.
  if (!pos) return null
  return (
    <g data-layer="awaiting" data-awaiting={faction} pointerEvents="none">
      <title>{`Waiting on ${FACTION_LOOK[faction].name}`}</title>
      <circle cx={pos.x} cy={pos.y} r={27} fill="none" stroke={WAITING} strokeWidth={3}>
        {/* A pulse, so it reads as "still waiting" rather than as decoration.
            SMIL rather than CSS: this element lives inside an inline <svg> the
            page has no stylesheet for, and an animation in a style attribute is
            not a thing that exists. */}
        <animate attributeName="r" values="27;31;27" dur="1.8s" repeatCount="indefinite" />
        <animate attributeName="stroke-opacity" values="1;0.35;1" dur="1.8s" repeatCount="indefinite" />
      </circle>
    </g>
  )
}

export function DuneBoard({
  storm, stacks, spice, seating, deck, mode,
  worms = [], awaiting = null, phase = null, turn = null, interactive = false, children,
}: DuneBoardProps) {
  const [svg, setSvg] = useState<string | null>(null)

  useEffect(() => {
    fetch('/dune-board.svg')
      .then(r => r.text())
      // Drop the fixed width/height so the board scales to its container off its
      // viewBox alone. Left in place it renders at its natural 970px, overflows,
      // and the overlay — which IS sized to the container — stops lining up with
      // it. The two must share one coordinate system or every marker is wrong.
      // WIDTH AND HEIGHT BOTH 100%. With width alone the board sized itself
      // off the column's width and took whatever height that implied, which is
      // why it sat in a column half again as tall as it was using. Given both,
      // its own viewBox and the default preserveAspectRatio scale it to the
      // largest size that fits and centre it — and the overlay below, given the
      // same box and the same rule, letterboxes to exactly the same rectangle,
      // which is what keeps every marker on its territory.
      .then(t => t.replace(/<svg([^>]*)>/, (_m, attrs: string) =>
        '<svg' + attrs.replace(/\s(width|height)="[^"]*"/g, '') +
        ' width="100%" height="100%" style="display:block">'))
      .then(setSvg)
      .catch(() => setSvg(null))
  }, [])

  const wedge = stormWedge(storm)

  return (
    // PINNED, not sized. Both layers fill the positioned box they are given and
    // scale themselves down to fit it — a percentage height resolves here
    // because `inset: 0` is a definite box however the parent lays out.
    <div data-layer="board" style={{
      position: 'absolute', inset: 0,
      // A BOARD IS NOT A DOCUMENT. Dragging across it caught the territory names
      // and lit them up like something you were about to copy, which is exactly
      // what a player does while reaching for a stack. It inherits into the
      // inlined board SVG as well, which is where nearly all the text is.
      // Risk's map does the same — see SVGMapLayer.
      userSelect: 'none', WebkitUserSelect: 'none',
    }}>
      {svg
        ? <div style={{ position: 'absolute', inset: 0 }}
            dangerouslySetInnerHTML={{ __html: svg }} />
        : <p style={{ color: PALE }}>loading /dune-board.svg…</p>}
      <svg viewBox={DUNE_BOARD.viewBox} style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        pointerEvents: interactive ? 'auto' : 'none',
      }}>
        {wedge && <path d={wedge} fill="#c9542a" fillOpacity="0.55" stroke="#f2d9a0" strokeWidth="2" />}

        {stacks.map(s => {
          const at = cellAt(s.territoryId, s.sector)
          if (!at || s.count <= 0) return null
          return (
            <g key={`${s.territoryId}|${s.sector}|${s.faction ?? ''}`}>
              <circle cx={at.x} cy={at.y} r="9"
                fill={s.faction ? FACTION_LOOK[s.faction].colour : '#1d3f70'}
                stroke={PALE} strokeWidth="1.5" />
              <text x={at.x} y={at.y} fontSize="10" fill={PALE} textAnchor="middle"
                dominantBaseline="central" fontFamily="Georgia, serif">{s.count}</text>
            </g>
          )
        })}

        {Object.entries(spice).map(([id, n]) => {
          const t = DUNE_TERRITORIES.find(x => x.id === id)
          const at = t ? cellAt(id, t.spiceSector ?? '') ?? t.centroid : null
          if (!at || n <= 0) return null
          return (
            <g key={id}>
              <circle cx={at.x + 15} cy={at.y - 13} r="10" fill="#c98a1e" stroke="#3f2c1a" strokeWidth="1.4" />
              <text x={at.x + 15} y={at.y - 13} fontSize="11" fill="#3f2c1a" textAnchor="middle"
                dominantBaseline="central" fontWeight="bold" fontFamily="Georgia, serif">{n}</text>
            </g>
          )
        })}

        {phase && <PhaseMark phase={phase} />}
        {turn != null && <TurnMark turn={turn} />}

        {/* Who is sitting where. An overlay, not part of the board: the seating
            changes every game and the printed circles do not. */}
        <SeatLayer seating={seating} />
        {awaiting && <AwaitingMark faction={awaiting} seating={seating} />}

        {/* The spice deck and its discards, in the box on the surround. */}
        <SpiceDeckArea mode={mode} deck={deck} />

        {worms.map(id => {
          const t = DUNE_TERRITORIES.find(x => x.id === id)
          const at = t ? cellAt(id, t.spiceSector ?? '') ?? t.centroid : null
          if (!at) return null
          return (
            <image key={id} href="/icons/sandworm.svg"
              x={at.x - 20} y={at.y - 20} width="40" height="40" />
          )
        })}

        {children}
      </svg>
    </div>
  )
}

export default DuneBoard
