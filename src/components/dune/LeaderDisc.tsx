/**
 * A leader disc: portrait, faction colour, name, battle strength.
 *
 * Laid out as a medallion rather than a card. The portrait has its own circle
 * inside the disc, sat high; the name curves along the gap beneath it; the
 * strength is a bare numeral on the portrait's right edge. No band, no badge —
 * the faction colour is the ground everything else sits on.
 *
 * Three things about it are load-bearing:
 *
 *   The portrait circle is OFF CENTRE, pushed up by a tenth of the radius. A
 *   circle centred in a circle leaves an even ring, and an even ring has no room
 *   at the bottom for a name. Everything the name gets comes from that shift.
 *
 *   The name is set on an arc struck from the PORTRAIT's centre, not the disc's,
 *   so it stays parallel to the edge it hangs under. Text-anchor middle at
 *   startOffset 50% centres it on that arc whatever its length, which is what
 *   keeps a five-letter name and a thirteen-letter one both centred.
 *
 *   The strength has a dark halo behind it rather than a badge. It sits half on
 *   the portrait and half on the faction colour, so it has to survive both, and
 *   a stroke drawn behind the glyph does that without putting a shape around it.
 *
 * Sizes are all fractions of the radius, so one number scales the whole disc.
 */
import { useId } from 'react'
import type { FactionId } from '@/types/Dune/Faction'
import type { Leader } from '@/types/Dune/Faction'
import { FACTION_LOOK } from './SeatLayer'

const PALE = '#f0e2bb'

export interface Portrait {
  src: string
  /**
   * Natural size. Held here rather than measured at render time so the crop is
   * arithmetic instead of a layout that settles after the image loads.
   */
  w: number
  h: number
  /**
   * How much of the disc the image's shorter side covers.
   *
   * 1 fills the disc edge to edge and crops whatever does not fit. Below 1 the
   * whole picture gets closer to fitting and the faction colour shows at the
   * sides, like a cameo. A tall portrait cannot do both: 400x500 in a circle
   * with a name band across the bottom shows about 56% of its height at zoom 1,
   * which is what cut Stilgar's chin.
   */
  zoom?: number
  /** Which point of the picture, 0..1, sits at the middle of the visible area.
   *  focusY below 0.5 shows more of the top; above, more of the bottom. */
  focusX?: number
  focusY?: number
}

/**
 * Which portrait belongs to which leader, and how it is framed.
 *
 * Keyed by the leader's name exactly as factions.ts writes it, so a rename there
 * shows up here as a missing portrait rather than as the wrong face. Only the
 * Fremen are complete so far; see the notes at the foot of this file.
 *
 * The framing is per leader on purpose. These are photographs of different
 * people at different distances, and one rule for all of them will always be
 * wrong for some — the alternative is cropping the source files, which fixes it
 * at the other end and needs no knob here at all.
 */
export const LEADER_PORTRAITS: Record<string, Portrait> = {
  // Taller than it is wide, so it has height to spare and can be pushed up to
  // keep the face out of the bottom of the circle.
  Stilgar: { src: '/dune-leaders/Stilgar.png', w: 400, h: 500, focusY: 0.40 },
  // Square, so at zoom 1 the picture is exactly the portrait circle's bounding
  // box: dead centre shows all of it and only the corners are clipped. Their
  // detail sits within a few percent of the middle in every case — measured off
  // row-by-row edge energy, since faces carry far more local contrast than the
  // ground behind them — so there is nothing to gain by shifting any of them.
  Chani: { src: '/dune-leaders/Chani.png', w: 400, h: 400, focusY: 0.5 },
  Otheym: { src: '/dune-leaders/Otheym.png', w: 400, h: 400, focusY: 0.5 },
  'Shadout Mapes': { src: '/dune-leaders/Shadout_mapes.png', w: 400, h: 400, focusY: 0.5 },
  Jamis: { src: '/dune-leaders/Jamis.png', w: 400, h: 400, focusY: 0.5 },
}

export function LeaderDisc({
  leader, faction, r = 60,
}: { leader: Leader; faction: FactionId; r?: number }) {
  const id = useId()
  const clip = `leader-clip-${id}`
  const arc = `leader-arc-${id}`
  const look = FACTION_LOOK[faction]
  const portrait = LEADER_PORTRAITS[leader.name]

  // The portrait's own circle: a shade over three quarters of the disc across,
  // lifted so the space it leaves is all at the bottom where the name goes.
  const pr = r * 0.78
  const pcy = -r * 0.12

  // The name's baseline, struck from the portrait's centre so it runs parallel
  // to the portrait's edge. 20 degrees off horizontal at each end keeps the
  // first and last letters clear of the rim.
  // Dropped from 0.15 to 0.21 to sit the name lower in the gap.
  //
  // What limits this is NOT the bottom of the arc but its ENDS. The arc is
  // struck from the portrait centre, which is above the disc centre, so its
  // lowest point is the closest to the middle and its sides swing outward: at
  // this radius the arc would leave the disc entirely if it ran to horizontal.
  // Hence the ends stop at 38 rather than 20 degrees.
  const tr = pr + r * 0.21
  const end = (deg: number) => {
    const a = (deg * Math.PI) / 180
    return `${(tr * Math.cos(a)).toFixed(2)} ${(pcy + tr * Math.sin(a)).toFixed(2)}`
  }
  // Sweep 0 takes the long way round the bottom, which is what puts the letters
  // upright; sweep 1 runs them over the top and upside down.
  const namePath = `M ${end(142)} A ${tr.toFixed(2)} ${tr.toFixed(2)} 0 0 0 ${end(38)}`
  const nameSize = r * (leader.name.length > 12 ? 0.135 : leader.name.length > 8 ? 0.15 : 0.17)

  return (
    <g>
      <title>{`${leader.name} — strength ${leader.strength}`}</title>
      <defs>
        <clipPath id={clip}>
          <circle cx="0" cy={pcy} r={pr} />
        </clipPath>
        <path id={arc} d={namePath} fill="none" />
      </defs>

      {/* The faction colour is the whole ground. */}
      <circle cx="0" cy="0" r={r} fill={look.colour} />

      {portrait && (() => {
        // Placed by hand rather than by preserveAspectRatio, which only offers
        // nine fixed alignments and none of them is "put the face here". zoom is
        // measured against the PORTRAIT circle now, not the disc, so zoom 1 fills
        // that circle exactly and a square source needs no adjustment at all.
        const focusX = portrait.focusX ?? 0.5
        const focusY = portrait.focusY ?? 0.5

        // Zoom in far enough that the picture still covers the circle once it
        // has been shifted to put the focus in the middle.
        //
        // Moving the focus off centre slides the picture, and a picture only
        // just big enough to cover the circle slides a bare patch in behind it —
        // faction colour showing through the portrait, which looks like a
        // rendering fault rather than a crop. The default focus used to be 0.45,
        // which did exactly that to every square portrait: 400x400 at zoom 1 is
        // precisely the circle's bounding box, so ANY shift uncovered it.
        //
        // Derived rather than guarded against: the picture must reach the
        // circle's edge on the far side of the focus, in both axes.
        const short = Math.min(portrait.w, portrait.h)
        const cover = Math.max(
          short / (2 * portrait.w * Math.min(focusX, 1 - focusX)),
          short / (2 * portrait.h * Math.min(focusY, 1 - focusY)),
        )
        const zoom = Math.max(portrait.zoom ?? 1, cover)
        const scale = (2 * pr * zoom) / short
        const dw = portrait.w * scale
        const dh = portrait.h * scale
        return (
          <image
            href={portrait.src}
            x={-focusX * dw} y={pcy - focusY * dh}
            width={dw} height={dh}
            preserveAspectRatio="none"
            clipPath={`url(#${clip})`}
          />
        )
      })()}

      {/* The name, hanging under the portrait. */}
      <text
        fontSize={nameSize} fill={PALE}
        fontFamily="Georgia, 'Times New Roman', serif" letterSpacing={r * 0.015}
      >
        <textPath href={`#${arc}`} startOffset="50%" textAnchor="middle">
          {leader.name.toUpperCase()}
        </textPath>
      </text>

      {/* Strength: bare, bold, on the portrait's right edge. paint-order puts
          the dark stroke BEHIND the glyph, so it reads as a halo rather than as
          an outline around the number. */}
      <text
        x={pr * 0.99} y={pcy}
        fontSize={r * 0.38} fill={PALE} textAnchor="middle" dominantBaseline="central"
        fontFamily="Georgia, 'Times New Roman', serif" fontWeight="bold"
        paintOrder="stroke" stroke="#00000099" strokeWidth={r * 0.055} strokeLinejoin="round"
      >{leader.strength}</text>

      {/* The rim last, over everything. */}
      <circle cx="0" cy="0" r={r - r * 0.02} fill="none" stroke={PALE} strokeWidth={r * 0.045} />
    </g>
  )
}

// ─── Portraits still missing, and two that do not belong where they look ─────
//
// public/dune-leaders holds fifteen images. They do not map one-to-one onto the
// leaders in factions.ts:
//
//   Fremen        complete — all five.
//   Harkonnen     four of five by name, plus Captain_IakinNefud.png, which is a
//                 HARKONNEN leader despite sitting between two Emperor ones in
//                 the folder listing. Baron.png is not a leader in the data at
//                 all — the Baron has no disc in Dune. Kept anyway: at faction
//                 SELECTION the plan is to show a faction's leaders, and the
//                 Baron is the face of the Harkonnen even without a disc. That
//                 screen does not exist yet — this note is so the file is not
//                 mistaken for dead weight and deleted before it does.
//   Emperor       four of five. Bashar (strength 2) has no portrait.
//   Atreides      none of the five.
//   Spacing Guild none.
//   Bene Gesserit none.
//
// A leader with no portrait still renders: the disc comes out in the faction
// colour with the name and strength on it, which is a usable counter and an
// obvious gap rather than a broken image.
