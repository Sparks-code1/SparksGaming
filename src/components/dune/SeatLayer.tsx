/**
 * The six seats around the rim, drawn as an overlay.
 *
 * Deliberately NOT emitted by the board generator. Everything the generator
 * draws is a property of the board itself and identical in every game; who is
 * sitting where is a property of THIS game, changes at setup, and leaves two to
 * four of the six positions empty. Baking a faction into the printed board would
 * mean regenerating it per match, which is the opposite of what the generator is
 * for.
 *
 * So the board stays neutral — six blank circles are already printed on it — and
 * this layer sits on top in the same coordinate system, reading the positions
 * from board data so the marks land exactly on the printed circles rather than
 * on a second set of numbers measured off a picture.
 *
 * Colours are the ones the 1979 Avalon Hill game used, because a player who
 * knows Dune already knows green is Atreides. They live here rather than in
 * factions.ts: that file is rules, and a colour is not a rule.
 */
import type { FactionId } from '@/types/Dune/Faction'
import { DUNE_PLAYER_POSITIONS } from '@/data/dune/boardData'

/** Pale sand, the same ink the board uses for marks on dark ground. */
const PALE = '#f0e2bb'
/** PALE as 0..1 components, for the colour matrices below. */
const CREAM = [0xf0 / 255, 0xe2 / 255, 0xbb / 255] as const
/** Rec.709 luminance weights. */
const LUMA = [0.2126, 0.7152, 0.0722] as const

/**
 * Three of the marks are supplied artwork rather than drawn here, and they
 * arrive in their own colours — a red hawk, a rust emblem, a blue crest. They
 * are recoloured to cream at render time by an SVG filter instead of the files
 * being edited, so the originals stay untouched and swapping one out is a path
 * change rather than an image edit.
 *
 * TWO filters, because one is not enough, and the reason is worth keeping.
 *
 * A flat fill — force every channel to cream, keep the alpha — is right for art
 * whose shape is carried by its ALPHA: a single-colour silhouette stays exactly
 * itself. That is the hawk and the Fremen emblem.
 *
 * It destroys art whose shape is carried by its COLOUR. The Harkonnen crest is
 * blue over black line work, all of it opaque, so flattening merges every part
 * into one shape and it renders as static — I flattened it, looked at the
 * pixels, and it was unreadable. Keeping luminance and tinting it cream instead
 * lets the black stay dark against the near-black disc, which is what holds the
 * drawing together.
 *
 * The gain is why the second filter is not simply darker overall: a saturated
 * source colour has low luminance (that blue is 121 of 255), so without
 * amplification the whole mark comes out at half strength.
 */
const flatMatrix = () =>
  CREAM.map(c => `0 0 0 0 ${c.toFixed(4)}`).join('  ') + '  0 0 0 1 0'

const shadedMatrix = (gain: number) =>
  CREAM.map(c => LUMA.map(l => (l * gain * c).toFixed(4)).join(' ') + ' 0 0').join('  ')
  + '  0 0 0 1 0'

const FLAT_FILTER = 'dune-seat-flat'
const SHADED_FILTER = 'dune-seat-shaded'

/**
 * The supplied art, and how each one has to be recoloured.
 *
 * A faction listed here uses its image; anything absent falls through to the
 * drawn glyph below.
 */
const IMAGE_MARKS: Partial<Record<FactionId, { src: string; filter: string }>> = {
  atreides: { src: '/icons/Atreides.webp', filter: FLAT_FILTER },
  fremen: { src: '/icons/Fremen.webp', filter: FLAT_FILTER },
  harkonnen: { src: '/icons/Harkonnen.webp', filter: SHADED_FILTER },
}

/**
 * The filters themselves, rendered once per layer.
 *
 * Inside the layer's own <g> rather than a page-level <defs> so the component
 * stays self-contained — drop it into any SVG and the marks come out right.
 */
function SeatFilters() {
  return (
    <defs>
      <filter id={FLAT_FILTER} colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values={flatMatrix()} />
      </filter>
      <filter id={SHADED_FILTER} colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values={shadedMatrix(2.1)} />
      </filter>
    </defs>
  )
}

export const FACTION_LOOK: Record<FactionId, { colour: string; name: string }> = {
  atreides: { colour: '#2f8f4e', name: 'Atreides' },
  harkonnen: { colour: '#17171a', name: 'Harkonnen' },
  emperor: { colour: '#b5342c', name: 'Emperor' },
  fremen: { colour: '#d3a11d', name: 'Fremen' },
  'spacing-guild': { colour: '#dd7a1c', name: 'Spacing Guild' },
  'bene-gesserit': { colour: '#2f6fb5', name: 'Bene Gesserit' },
}

/**
 * The mark for each faction, drawn in a 24-wide box centred on the origin.
 *
 * Kept to one or two paths each and to shapes that survive being 14px across —
 * a silhouette that needs detail to be recognised is not a symbol at this size,
 * it is a smudge. The colour does most of the identifying work; the glyph is
 * what tells them apart in one colour, or for anyone who cannot separate the
 * green from the red.
 */
function glyph(faction: FactionId): JSX.Element | null {
  switch (faction) {
    // A hawk, wings out. The Atreides banner.
    case 'atreides':
      return <path d="M0 -6 L2 -2 L9 -5 L4 1 L9 3 L2 3 L0 7 L-2 3 L-9 3 L-4 1 L-9 -5 L-2 -2 Z"
        fill={PALE} />
    // A ram's horns, curling out and down.
    case 'harkonnen':
      return <g fill="none" stroke={PALE} strokeWidth="2.4" strokeLinecap="round">
        <path d="M0 -6 C-5 -6 -9 -3 -9 1 C-9 4 -6 6 -4 4.5 C-2.5 3.4 -3 1 -5 1" />
        <path d="M0 -6 C5 -6 9 -3 9 1 C9 4 6 6 4 4.5 C2.5 3.4 3 1 5 1" />
      </g>
    // A crown, for the Padishah Emperor.
    case 'emperor':
      return <path d="M-9 5 L-9 -5 L-4.5 -1 L0 -6.5 L4.5 -1 L9 -5 L9 5 Z" fill={PALE} />
    // Three rings in a row, joined by a short link between each pair.
    // Rings rather than discs: a chain reads as a chain because you can see
    // through it, and three filled dots would read as a full stop.
    case 'spacing-guild':
      return <g fill="none" stroke={PALE} strokeWidth="1.9" strokeLinecap="round">
        <circle cx="-8" cy="0" r="3.2" />
        <circle cx="0" cy="0" r="3.2" />
        <circle cx="8" cy="0" r="3.2" />
        <path d="M-4.8 0 H-3.2 M3.2 0 H4.8" />
      </g>
    // Shai-Hulud, rising out of the sand and back into it.
    case 'fremen':
      return <g fill="none" stroke={PALE} strokeLinecap="round">
        <path d="M-9 6 C-5 6 -5 -2 -0.5 -2 C3 -2 3 -5.5 6 -6" strokeWidth="3" />
        <circle cx="7.5" cy="-6" r="2.1" fill={PALE} stroke="none" />
      </g>
    // The eye, for the sisterhood that sees.
    case 'bene-gesserit':
      return <g>
        <path d="M-9.5 0 C-5 -6 5 -6 9.5 0 C5 6 -5 6 -9.5 0 Z" fill={PALE} />
        <circle cx="0" cy="0" r="2.9" fill="#00000099" />
      </g>
    // The three that use supplied art never reach here.
    default:
      return null
  }
}

/** A taken seat: the faction's colour, with its mark on top. */
export function SeatMark(
  { faction, x, y, r = 19 }: { faction: FactionId; x: number; y: number; r?: number },
) {
  const look = FACTION_LOOK[faction]
  const art = IMAGE_MARKS[faction]
  // The glyphs are drawn in a 24-wide box, so this is what fits one inside r.
  const k = (r * 0.78) / 12
  // A square this wide sits inside the ring with its corners clear: the largest
  // square inscribed in r is r*1.414 across, and this leaves room for the ring.
  const box = r * 1.26
  return (
    <g>
      <title>{look.name}</title>
      <circle cx={x} cy={y} r={r} fill={look.colour} stroke={PALE} strokeWidth="2" />
      {art
        ? <image href={art.src} x={x - box / 2} y={y - box / 2} width={box} height={box}
            preserveAspectRatio="xMidYMid meet" filter={`url(#${art.filter})`} />
        : <g transform={`translate(${x} ${y}) scale(${k.toFixed(3)})`}>{glyph(faction)}</g>}
    </g>
  )
}

/**
 * A seat nobody took.
 *
 * An outline, not a greyed-out symbol: an empty chair should read as absence at
 * a glance, and anything drawn inside it invites the question of which faction
 * it is. Two to six players means this is the common case, not an edge one.
 */
export function EmptySeat({ x, y, r = 19 }: { x: number; y: number; r?: number }) {
  return (
    <g>
      <title>empty</title>
      <circle cx={x} cy={y} r={r} fill="#00000033" stroke={PALE} strokeWidth="1.4"
        strokeOpacity="0.45" strokeDasharray="3 4" />
    </g>
  )
}

/**
 * All six positions at once.
 *
 * `seating` maps a player position's id to the faction sitting there; anything
 * absent or null is drawn as an empty chair. The same map shape the storm's
 * seatsFromPositions takes, so the board and the turn order cannot disagree
 * about who is at the table.
 */
export function SeatLayer(
  { seating, r = 19 }: { seating: Readonly<Record<string, FactionId | null | undefined>>; r?: number },
) {
  return (
    <g data-layer="seats">
      <SeatFilters />
      {DUNE_PLAYER_POSITIONS.map(p => {
        const faction = seating[p.id]
        return faction
          ? <SeatMark key={p.id} faction={faction} x={p.x} y={p.y} r={r} />
          : <EmptySeat key={p.id} x={p.x} y={p.y} r={r} />
      })}
    </g>
  )
}
