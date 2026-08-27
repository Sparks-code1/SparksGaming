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
import { PhaseTimer } from './PhaseTimer'

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

/**
 * How much room that cell has before its bubbles cross into another territory.
 *
 * The fallback is for the centroid path above: a sector that is not one of the
 * territory's own has no cell and no measurement, so it gets a modest number
 * rather than either extreme — nothing should be laid out generously on the
 * strength of a lookup that already failed.
 */
export function cellRoom(territoryId: string, sector: string): number {
  const t = DUNE_TERRITORIES.find(x => x.id === territoryId)
  return t?.cells.find(c => c.sector === sector)?.room ?? 14
}

/** The bubble as it has always been drawn, when a faction stands alone. */
export const BUBBLE_R = 9
/**
 * The smallest a bubble may be squeezed to.
 *
 * A FLOOR RATHER THAN A FIT AT ANY COST. Some cells are slivers — the tightest
 * on the board has barely a pixel of clearance — and a layout that always fit
 * would draw six dots too small to carry a number, which loses the one thing
 * the bubble exists to say. Past this point the cluster is allowed to sit proud
 * of a small territory instead: overflowing a border is a thing you can see and
 * reason about, and a faction you cannot see at all is not.
 */
export const BUBBLE_MIN_R = 6.5
/** A little daylight, so neighbouring bubbles read as two and not a peanut. */
const GAP = 1.06

export interface StackSlot { x: number; y: number; r: number }

/**
 * What a territory holds, gathered across every sector it spans.
 *
 * WHY BY TERRITORY, when the bubbles are laid out by cell. Battle is by
 * TERRITORY and the storm is by SECTOR, so the two rules read the same board
 * differently and the board has to answer both. Two factions in Old Gap fight
 * whether they are both in sector 9 or one is in 9 and the other in 11 — the
 * bubbles cannot say that, because saying it is exactly what they must not do:
 * pile the cells together and the storm becomes unreadable.
 *
 * So occupancy is counted here, once, over the whole territory. A faction
 * standing in three sectors of one territory is one faction, not three.
 */
export interface TerritoryHold {
  territoryId: string
  /** Every faction with a force anywhere in it, however many sectors. */
  factions: FactionId[]
  /** The cells they are standing in — one point per occupied sector. */
  cells: { x: number; y: number }[]
  /**
   * Whether a battle is pending here.
   *
   * ADVISORS DO NOT MAKE A FIGHT. A Bene Gesserit advisor is in the territory
   * and not in the battle — that is the whole point of the posture — so a
   * territory holding one faction's fighters and an advisor is not contested,
   * and marking it would send people looking for a battle that cannot happen.
   */
  contested: boolean
}

export function territoryHolds(stacks: readonly DuneBoardStack[]): TerritoryHold[] {
  const held = new Map<string, {
    factions: Set<FactionId>; fighters: Set<FactionId>; cells: Map<string, { x: number; y: number }>
  }>()
  for (const s of stacks) {
    if (s.count <= 0 || !s.faction) continue
    let t = held.get(s.territoryId)
    if (!t) {
      t = { factions: new Set(), fighters: new Set(), cells: new Map() }
      held.set(s.territoryId, t)
    }
    t.factions.add(s.faction)
    if (s.posture !== 'advisor') t.fighters.add(s.faction)
    const at = cellAt(s.territoryId, s.sector)
    if (at) t.cells.set(s.sector, at)
  }
  return [...held.entries()].map(([territoryId, t]) => ({
    territoryId,
    factions: [...t.factions].sort(),
    cells: [...t.cells.values()],
    contested: t.fighters.size >= 2,
  }))
}

/**
 * Where each faction's bubble goes when several share one cell.
 *
 * WHY THIS EXISTS. Every stack used to be drawn at the cell's anchor point —
 * the same coordinates for all of them — so a second faction landed exactly on
 * top of the first and the board showed one. The Bene Gesserit advisor covering
 * the Atreides at setup was how it surfaced, but nothing about it was to do
 * with setup: any two factions in a territory drew as one, at any point in the
 * game. Two factions in a territory is the precondition for a battle, so a
 * board that draws them as one is a board that hides the fights.
 *
 * A RING, evenly spaced from the anchor. n bubbles of radius r keep clear of
 * each other when their centres sit r/sin(π/n) out, which is where the spread
 * below comes from; the bubbles then shrink until the whole ring fits the room
 * the cell has, down to the floor above. Slot 0 is at the top and they run
 * clockwise, so a given set of factions always lays out the same way — a board
 * whose pieces move when nothing moved is a board you cannot read at a glance.
 *
 * A LONE STACK IS UNTOUCHED: same point, same size as it has always been. It
 * has always sat proud of the tightest cells and nobody has ever needed it to
 * do otherwise, so this fixes the crowd without redrawing the quiet 90%.
 */
export function fanOut(n: number, room: number): StackSlot[] {
  if (n <= 0) return []
  if (n === 1) return [{ x: 0, y: 0, r: BUBBLE_R }]
  const spread = GAP / Math.sin(Math.PI / n)
  const r = Math.max(BUBBLE_MIN_R, Math.min(BUBBLE_R, room / (1 + spread)))
  const d = r * spread
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n
    return { x: d * Math.cos(a), y: d * Math.sin(a), r }
  })
}

/**
 * The stacks standing in each cell, in a fixed order.
 *
 * BY CELL, not by territory: troops occupy a (territory, sector) pair, and two
 * sectors of one territory are two places the storm treats differently. They
 * are one place for a battle, which is a thing the board says by drawing them
 * inside one outline.
 *
 * Sorted by faction so the ring is stable between renders — the same six
 * factions in the same cell must not swap seats because a server sent them in
 * a different order.
 */
export function stacksByCell(
  stacks: readonly DuneBoardStack[],
): [string, DuneBoardStack[]][] {
  const cells = new Map<string, DuneBoardStack[]>()
  for (const s of stacks) {
    if (s.count <= 0) continue
    const key = `${s.territoryId}|${s.sector}`
    const at = cells.get(key)
    if (at) at.push(s); else cells.set(key, [s])
  }
  for (const group of cells.values()) {
    group.sort((a, b) => (a.faction ?? '~').localeCompare(b.faction ?? '~')
      || (a.posture ?? '').localeCompare(b.posture ?? ''))
  }
  return [...cells.entries()]
}

export interface DuneBoardStack {
  territoryId: string
  sector: string
  faction?: FactionId
  count: number
  /** How many of the count are elite — drawn as a star on the bubble. */
  starred?: number
  /** An advisor stack draws checkered; a fighter draws solid. */
  posture?: 'fighter' | 'advisor'
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
   * When the running phase shuts, or null when nothing is timed.
   *
   * On the BOARD, in the band between the two off-board boxes, for the reason
   * the awaiting ring is: that is where everyone is already looking. A deadline
   * only the seat with the right panel open can see is a deadline the rest of
   * the table is surprised by.
   */
  closesAt?: number | null
  /** The window's full length, for the bar. See PhaseTimer. */
  windowMs?: number
  /** This client's clock, injected like every other. */
  now?: number
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
  closesAt = null, windowMs, now = 0,
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

  /** Every occupied cell, with a place worked out for each faction in it. */
  const laidOut = stacksByCell(stacks).map(([key, group]) => {
    const [territoryId, sector] = key.split('|')
    return {
      key, group,
      at: cellAt(territoryId, sector),
      slots: fanOut(group.length, cellRoom(territoryId, sector)),
    }
  })
  /** What each territory holds, for the outline and the tether below. */
  const holds = territoryHolds(stacks)

  /** How far each cell's bubbles reach, for anything drawn near them. */
  const crowding = new Map(laidOut.map(c =>
    [c.key, Math.max(0, ...c.slots.map(s => Math.hypot(s.x, s.y) + s.r))]))

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

        {/* THE ADVISOR WEAVE, one pattern per faction that needs it. A checker
            in the faction's own colour: the piece is unmistakably theirs and
            unmistakably not fighting, which is the whole message an advisor
            bubble has to carry. Defined once here rather than per stack, since
            two advisor stacks reusing one id is the point of a pattern. */}
        <defs>
          {[...new Set(stacks.filter(s => s.posture === 'advisor' && s.faction)
            .map(s => s.faction as FactionId))].map(f => (
            <pattern key={f} id={`advisor-check-${f}`} width="5" height="5"
              patternUnits="userSpaceOnUse">
              <rect width="5" height="5" fill={FACTION_LOOK[f].colour} />
              <rect width="2.5" height="2.5" fill={PALE} fillOpacity="0.85" />
              <rect x="2.5" y="2.5" width="2.5" height="2.5" fill={PALE} fillOpacity="0.85" />
            </pattern>
          ))}
        </defs>

        {/* ── ONE PLACE FOR A BATTLE, SEVERAL FOR THE STORM ──────────────────
            The bubbles are laid out per cell, because a stack in sector 9 dies
            to a storm there and one in sector 11 does not. But a battle is by
            TERRITORY, so two clusters inside one outline are one fight — and
            nothing on the board said so. These two marks say it.

            UNDER THE BUBBLES, deliberately: they are context for the pieces,
            not pieces themselves, and a tether drawn over a stack would hide
            the number it is there to connect. */}
        {holds.map(h => {
          const t = DUNE_TERRITORIES.find(x => x.id === h.territoryId)
          if (!t) return null
          return (
            <g key={`hold-${h.territoryId}`} data-hold={h.territoryId}
              data-contested={h.contested ? 'yes' : undefined}>
              {/* THE OUTLINE THE BOARD ALREADY PRINTS, traced. Marking the
                  territory rather than the cells is the whole point: the
                  question a player is asking is "is there a fight here", and
                  "here" means the outline, whatever sectors it spans. */}
              {h.contested && (
                <path d={t.outline} fill="#c9542a" fillOpacity={0.10}
                  stroke="#e07a45" strokeWidth={2.2} strokeOpacity={0.9}
                  strokeLinejoin="round" pointerEvents="none">
                  <title>{`${t.displayName}: ${h.factions.length} factions — battle pending`}</title>
                </path>
              )}
              {/* AND THE TETHER, when one territory is occupied in more than one
                  sector. Without it two clusters a long way apart read as two
                  places; the line says they are one, and being drawn between
                  the cells rather than round them keeps the sector positions —
                  which the storm reads — exactly where they were. */}
              {h.cells.length > 1 && h.cells.slice(1).map((c, i) => (
                <line key={i} x1={h.cells[i].x} y1={h.cells[i].y} x2={c.x} y2={c.y}
                  stroke={h.contested ? '#e07a45' : PALE}
                  strokeOpacity={0.5} strokeWidth={1.4} strokeDasharray="5 4"
                  pointerEvents="none" />
              ))}
            </g>
          )
        })}

{/* ONE BUBBLE PER FACTION, laid out per CELL rather than per stack — see
            fanOut. Drawing each stack at the cell's anchor put them on top of
            one another, so a contested territory showed a single faction. */}
        {laidOut.map(({ key, group, at, slots }) => {
          if (!at) return null
          return group.map((s, i) => {
            const slot = slots[i]
            const x = at.x + slot.x
            const y = at.y + slot.y
            // EVERYTHING ON THE BUBBLE SCALES WITH IT. A badge kept at its
            // full size on a squeezed bubble covers the number underneath.
            const k = slot.r / BUBBLE_R
            const advisor = s.posture === 'advisor'
            const starred = s.starred ?? 0
            return (
              <g key={`${key}|${s.faction ?? ''}|${s.posture ?? ''}`}
                data-cell={key}
                data-posture={advisor ? 'advisor' : undefined}
                data-starred={starred > 0 ? starred : undefined}>
                {/* WHOSE IT IS, in words, for the crowded cells where the ring
                    has shrunk the colour discs to something you would want to
                    hover to be sure of. */}
                <title>{`${s.faction ? FACTION_LOOK[s.faction].name : 'Forces'}: ${s.count}`}</title>
                <circle cx={x} cy={y} r={slot.r}
                  fill={advisor && s.faction
                    ? `url(#advisor-check-${s.faction})`
                    : s.faction ? FACTION_LOOK[s.faction].colour : '#1d3f70'}
                  stroke={PALE} strokeWidth={1.5 * k} />
                <text x={x} y={y} fontSize={10 * k}
                  fill={advisor ? '#1a1208' : PALE}
                  stroke={advisor ? PALE : undefined} strokeWidth={advisor ? 2.4 * k : undefined}
                  paintOrder="stroke"
                  textAnchor="middle" dominantBaseline="central"
                  fontFamily="Georgia, serif">{s.count}</text>
                {/* THE ELITES ARE IN THIS STACK. A star badge, with the number
                    beside it when the stack is mixed — three Fedaykin standing
                    with seven plain is a different thing from ten plain, and the
                    storm does not care but every battle plan does. */}
                {starred > 0 && (
                  <g>
                    <title>{`${starred} elite of ${s.count}`}</title>
                    <circle cx={x + 8 * k} cy={y - 8 * k}
                      r={(starred >= s.count ? 5.2 : 6.4) * k}
                      fill="#3f2c1a" stroke="#f0c93f" strokeWidth={k} />
                    <text x={x + 8 * k} y={y - 8 * k} fontSize={7.5 * k} fill="#f0c93f"
                      textAnchor="middle" dominantBaseline="central"
                      fontFamily="Georgia, serif">
                      {starred >= s.count ? '★' : `★${starred}`}
                    </text>
                  </g>
                )}
              </g>
            )
          })
        })}

        {Object.entries(spice).map(([id, n]) => {
          const t = DUNE_TERRITORIES.find(x => x.id === id)
          const sector = t?.spiceSector ?? ''
          const at = t ? cellAt(id, sector) ?? t.centroid : null
          if (!at || n <= 0) return null
          // PUSHED CLEAR OF THE FORCES STANDING HERE. The token sat at a fixed
          // offset that used to clear a single bubble; a ring of six reaches
          // past it, and spice drawn over a stack hides the stack.
          const reach = crowding.get(`${id}|${sector}`) ?? 0
          const off = Math.max(15, reach + 11)
          return (
            <g key={id}>
              <circle cx={at.x + off} cy={at.y - off * 0.87} r="10" fill="#c98a1e" stroke="#3f2c1a" strokeWidth="1.4" />
              <text x={at.x + off} y={at.y - off * 0.87} fontSize="11" fill="#3f2c1a" textAnchor="middle"
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
        {/* Between the two off-board boxes, in the one band of the lower board
            with nothing printed in it. */}
        {phase && <PhaseTimer phase={phase} closesAt={closesAt} windowMs={windowMs} now={now} />}

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
