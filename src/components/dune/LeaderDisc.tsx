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
import { FACTION_LOOK, SeatMark, SeatFilters } from './SeatLayer'

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

  // Emperor. Four of the five; Bashar has no portrait and renders as a plain
  // faction counter.
  'Hasimir Fenring': { src: '/dune-leaders/Hasimir_Fenring.png', w: 400, h: 533, focusY: 0.48 },
  'Captain Aramsham': { src: '/dune-leaders/Captain_Aramsham.png', w: 400, h: 500, focusY: 0.43 },
  Caid: { src: '/dune-leaders/Caid.png', w: 400, h: 533, focusY: 0.43 },
  Burseg: { src: '/dune-leaders/Burseg.png', w: 400, h: 533, focusY: 0.52 },

  // Harkonnen. All five — Captain Iakin Nefud is one of theirs, not the
  // Emperor's, however the folder happens to sort.
  'Feyd-Rautha': { src: '/dune-leaders/Feyd-Rautha.png', w: 400, h: 400, focusY: 0.5 },
  'Beast Rabban': { src: '/dune-leaders/Beast_Rabban.png', w: 400, h: 500, focusY: 0.53 },
  'Piter De Vries': { src: '/dune-leaders/Piter_De_Vries.png', w: 400, h: 400, focusY: 0.5 },
  'Captain Iakin Nefud': { src: '/dune-leaders/Captain_IakinNefud.png', w: 400, h: 533, focusY: 0.46 },
  'Umman Kudu': { src: '/dune-leaders/UmmanKudu.png', w: 400, h: 534, focusY: 0.44 },

  // Atreides. All five. The artwork had been sitting in public/dune-leaders for
  // a while with nothing pointing at it, which is why the Atreides — the seat
  // the game screen opens on — showed five blank discs while the traitor panel
  // beside them showed portraits. Nothing referenced this table from a test, so
  // nothing said so. See tests/leaderportraittest.
  'Lady Jessica': { src: '/dune-leaders/Lady_Jessica.png', w: 400, h: 500, focusY: 0.49 },
  'Thufir Hawat': { src: '/dune-leaders/Thufir_Hawat.png', w: 400, h: 500, focusY: 0.43 },
  'Gurney Halleck': { src: '/dune-leaders/Gurney_halleck.png', w: 400, h: 500, focusY: 0.46 },
  'Duncan Idaho': { src: '/dune-leaders/Duncan_Idaho.png', w: 400, h: 533, focusY: 0.44 },
  'Dr. Wellington Yueh': { src: '/dune-leaders/Dr_Wellington_Yueh.png', w: 400, h: 533, focusY: 0.48 },

  // Bene Gesserit. All five.
  'Mother Ramallo': { src: '/dune-leaders/Mother_Ramallo.png', w: 400, h: 500, focusY: 0.48 },
  'Wanna Yueh': { src: '/dune-leaders/Wanna_yueh.png', w: 400, h: 509, focusY: 0.49 },
  'Margot Lady Fenring': { src: '/dune-leaders/Margot_ladyy_Fenring.png', w: 400, h: 500, focusY: 0.51 },
  'Princess Irulan': { src: '/dune-leaders/Princess_Irulan.png', w: 400, h: 500, focusY: 0.47 },
  Alia: { src: '/dune-leaders/Alia.png', w: 400, h: 500, focusY: 0.52 },

  // The Emperor's fifth. The file is spelled Bushar and the leader is Bashar,
  // which is most of why it was never wired up.
  Bashar: { src: '/dune-leaders/Bushar.png', w: 400, h: 500, focusY: 0.52 },

  // Spacing Guild, all five.
  'Staban Tuek': { src: '/dune-leaders/Staban_Tuek.png', w: 400, h: 500, focusY: 0.49 },
  'Master Bewt': { src: '/dune-leaders/Master_Bewt.png', w: 400, h: 500, focusY: 0.55 },
  'Esmar Tuek': { src: '/dune-leaders/Esmar_tuek.png', w: 400, h: 533, focusY: 0.49 },
  'Soo-Soo Sook': { src: '/dune-leaders/Soo_Soo_Sook.png', w: 400, h: 500, focusY: 0.49 },
  // The GUILD REPRESENTATIVE IS A LEADER — strength 1, the fifth of the five —
  // and not a faction namesake like the Baron or the Emperor. Easy to file with
  // those by the sound of the name, and wrong: he takes a disc and fights.
  'Guild Representative': { src: '/dune-leaders/Guild_rep.png', w: 400, h: 500, focusY: 0.49 },
}

// The framings above are derived, not eyeballed: each tall portrait is centred a
// little above its own DETAIL CENTROID — the vertical centre of mass of local
// contrast, which tracks the face because a face carries far more edge energy
// than the ground behind it. The offset upward is because a standing portrait
// puts costume detail below the head and that drags the centroid down. Squares
// stay dead centre, where the picture is exactly the circle's bounding box and
// nothing is cropped at all. All of them are one number each to nudge.

/**
 * Where a portrait goes inside a circle of radius `pr` centred on (cx, cy).
 *
 * Placed by hand rather than by preserveAspectRatio, which only offers nine
 * fixed alignments and none of them is "put the face here". zoom is measured
 * against the PORTRAIT circle, not the disc, so zoom 1 fills that circle
 * exactly and a square source needs no adjustment at all.
 *
 * Zoomed far enough that the picture still covers the circle once it has been
 * shifted to put the focus in the middle. Moving the focus off centre slides
 * the picture, and a picture only just big enough to cover the circle slides a
 * bare patch in behind it — faction colour showing through the portrait, which
 * looks like a rendering fault rather than a crop. The default focus used to be
 * 0.45, which did exactly that to every square portrait: 400x400 at zoom 1 is
 * precisely the circle's bounding box, so ANY shift uncovered it.
 *
 * Derived rather than guarded against: the picture must reach the circle's edge
 * on the far side of the focus, in both axes.
 *
 * A FUNCTION BECAUSE TWO DISCS DRAW PORTRAITS. This was inside LeaderDisc's
 * render, where the figure disc below could not reach it — and a second copy of
 * this arithmetic would crop one of them wrong the first time either was
 * tuned, silently, because a bad crop looks like a bad photograph.
 */
export function portraitPlacement(portrait: Portrait, pr: number, cx = 0, cy = 0) {
  const focusX = portrait.focusX ?? 0.5
  const focusY = portrait.focusY ?? 0.5
  const short = Math.min(portrait.w, portrait.h)
  const cover = Math.max(
    short / (2 * portrait.w * Math.min(focusX, 1 - focusX)),
    short / (2 * portrait.h * Math.min(focusY, 1 - focusY)),
  )
  const zoom = Math.max(portrait.zoom ?? 1, cover)
  const scale = (2 * pr * zoom) / short
  const width = portrait.w * scale
  const height = portrait.h * scale
  return { x: cx - focusX * width, y: cy - focusY * height, width, height }
}

/**
 * The person a faction IS, as opposed to the five who fight for it.
 *
 * THE FOUR PICTURES NO LEADER CLAIMS. public/dune-leaders has held Baron.png,
 * Emperor.png, Mother_Mohiam.png and Edric.png since the leaders were wired up,
 * pointed at by nothing, with a note at the foot of this file saying they were
 * kept for a screen that did not exist yet. The strategy card is that screen.
 *
 * None of them takes a disc and fights, which is exactly why they are here and
 * not in LEADER_PORTRAITS: the Baron is the Harkonnen PLAYER, and the Emperor's
 * five are Hasimir Fenring, Captain Aramsham, Caid, Burseg and Bashar. Edric is
 * the Guild's representative in the same sense — not the Guild Representative,
 * who is one of their five and does fight.
 *
 * ALL SIX HAVE A PICTURE. Paul and Liet-Kynes were the two gaps, drawn as the
 * faction's mark instead of a face; their artwork arrived and the orphan check
 * in leaderportraittest is what said so — the files were in the folder, nothing
 * pointed at them, and the suite went red until these two rows existed. That is
 * the rule the leaders live under and it worked in both directions.
 *
 * The fallback path is still real and still tested: FigureDisc draws the
 * faction's mark for any figure without a portrait, which is what the next
 * faction added to the game will get.
 *
 * The framings are the same knobs LEADER_PORTRAITS uses, and needed here more
 * than there: Emperor.png is the only landscape picture in the folder and Edric
 * is the tallest, and both would frame badly on any single rule.
 */
export interface FactionFigure {
  /** Who they are, spelled as the rules spell it. */
  name: string
  /** Their picture, or nothing. See the note above. */
  portrait?: Portrait
}

export const FACTION_FIGURES: Record<FactionId, FactionFigure> = {
  // The largest source in the folder at 1122x1402, and close-framed already —
  // head and shoulders against sand. Cropped to the top 60% so the face sits a
  // little above the disc's centre, as the other portraits do.
  atreides: {
    name: 'Paul Atreides',
    portrait: { src: '/dune-leaders/Paul_Atreides.png', w: 1122, h: 1402, focusX: 0.52, focusY: 0.30 },
  },
  // Same 400x500 shape as Stilgar and Mohiam, but framed higher in its own
  // canvas — hence a tighter crop than theirs rather than the same number.
  fremen: {
    name: 'Liet-Kynes',
    portrait: { src: '/dune-leaders/Liet_Kynes.png', w: 400, h: 500, focusY: 0.28 },
  },
  // Square, and the head sits above the middle of it — the lift is small
  // because the picture is already close-framed.
  harkonnen: {
    name: 'Baron Vladimir Harkonnen',
    portrait: { src: '/dune-leaders/Baron.png', w: 600, h: 600, focusY: 0.44 },
  },
  // The only LANDSCAPE picture in the folder, and it is nearly three to two.
  // The circle can only ever show a square of it, so the focus decides which
  // square: he is seated left of centre with his head high in the frame.
  emperor: {
    name: 'Shaddam IV',
    portrait: { src: '/dune-leaders/Emperor.png', w: 400, h: 267, focusX: 0.49, focusY: 0.28 },
  },
  // The tallest in the folder at nearly 1:1.8. At the middle it would show him
  // from the chest down.
  'spacing-guild': {
    name: 'Edric',
    portrait: { src: '/dune-leaders/Edric.png', w: 400, h: 717, focusY: 0.27 },
  },
  'bene-gesserit': {
    name: 'Reverend Mother Mohiam',
    portrait: { src: '/dune-leaders/Mother_Mohiam.png', w: 400, h: 500, focusY: 0.40 },
  },
}

/**
 * A faction's own figure, as a disc.
 *
 * NO NAME ON IT and no strength, which is what separates it from a leader disc.
 * A leader's name is set on an arc inside the rim, and the arc is a fixed
 * length: CAPTAIN IAKIN NEFUD at nineteen characters is already at the smallest
 * of the four sizes, and BARON VLADIMIR HARKONNEN is twenty-four. The caption
 * goes under the disc in ordinary text instead, where it can be read.
 *
 * A figure with no portrait draws the faction's mark — the same one on its seat
 * on the board and on the back of its leaders' discs. A blank coloured circle
 * would read as a picture that failed to load.
 */
export function FigureDisc(
  { faction, r = 60, figure = FACTION_FIGURES[faction] }:
  { faction: FactionId; r?: number; figure?: FactionFigure },
) {
  const id = useId()
  const clip = `figure-clip-${id}`
  const look = FACTION_LOOK[faction]
  const portrait = figure.portrait
  // Nearly the whole disc: there is no name inside the rim to leave room for,
  // so the portrait circle is concentric and the faction colour shows only as
  // the ring the rim sits on.
  const pr = r * 0.93

  return (
    <g data-figure={figure.name} data-faction={faction}>
      <title>{`${figure.name} — ${look.name}`}</title>
      <defs>
        <clipPath id={clip}>
          <circle cx="0" cy="0" r={pr} />
        </clipPath>
      </defs>
      <circle cx="0" cy="0" r={r} fill={look.colour} />
      {portrait ? (
        <>
          <image href={portrait.src} {...portraitPlacement(portrait, pr)}
            preserveAspectRatio="none" clipPath={`url(#${clip})`} />
          {/* The rim last, over everything, as on a leader disc. */}
          <circle cx="0" cy="0" r={r - r * 0.02} fill="none" stroke={PALE} strokeWidth={r * 0.045} />
        </>
      ) : (
        // AT THE FULL RADIUS, and no rim over it: a seat mark draws its own
        // pale ring, and a second one three units inside that reads as a
        // banded double edge rather than as the edge of a disc.
        <LeaderDiscBack faction={faction} r={r} />
      )}
    </g>
  )
}

/**
 * The other side of a leader disc: the faction's symbol, and nothing else.
 *
 * A LEADER DISC IS TWO-SIDED, and both sides get used. Leaders go face DOWN in
 * the Tleilaxu Tanks when they are killed, and face down is not "not rendered"
 * — it is a disc you can still see, still count and still tell the owner of.
 * Which faction lost a leader is public; WHICH leader is not always, and the
 * back is the difference.
 *
 * The mark is SeatMark, the same one on the faction's seat on the board and on
 * its bubble in the HUD. One drawing of each faction's symbol, so a disc in the
 * tanks is recognisably the same faction as the seat it came from.
 */
export function LeaderDiscBack({ faction, r = 60 }: { faction: FactionId; r?: number }) {
  return (
    <g data-face="down" data-faction={faction}>
      <SeatFilters />
      <SeatMark faction={faction} x={0} y={0} r={r} />
    </g>
  )
}

export function LeaderDisc({
  leader, faction, r = 60, faceDown = false,
}: { leader: Leader; faction: FactionId; r?: number; faceDown?: boolean }) {
  // Hooks before any early return, or the count changes between renders when a
  // disc is turned over and React loses track of which state belongs to which.
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
  // Four tiers, because the names run from 5 characters to 19 and the arc is a
  // fixed length. Twelve was enough while only the Fremen existed; CAPTAIN IAKIN
  // NEFUD is nineteen and overruns the arc at the next size up.
  const len = leader.name.length
  const nameSize = r * (len > 16 ? 0.115 : len > 12 ? 0.135 : len > 8 ? 0.15 : 0.17)

  if (faceDown) return <LeaderDiscBack faction={faction} r={r} />

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

      {portrait && (
        <image
          href={portrait.src}
          {...portraitPlacement(portrait, pr, 0, pcy)}
          preserveAspectRatio="none"
          clipPath={`url(#${clip})`}
        />
      )}

      {/* The name, hanging under the portrait. */}
      <text
        fontSize={nameSize} fill={PALE}
        // Spacing tracks the type size rather than the disc, so the tiers above
        // tighten the letters as they shrink instead of leaving long names
        // spaced out like short ones.
        fontFamily="Georgia, 'Times New Roman', serif" letterSpacing={nameSize * 0.088}
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
//   Emperor       all five.
//   Atreides      all five.
//   Bene Gesserit all five.
//   Spacing Guild three of five. Soo-Soo Sook and the Guild Representative
//                 have none yet.
//
// The framings above are derived the same way as the originals: decode the PNG,
// take row-by-row edge energy, read the vertical centre of mass off it, and sit
// the focus a little above it. Faces carry far more local contrast than the
// ground behind them, so that centroid lands on the face; the offset is
// calibrated against the entries that were already tuned by hand.
//
// A leader with no portrait still renders: the disc comes out in the faction
// colour with the name and strength on it, which is a usable counter and an
// obvious gap rather than a broken image.
