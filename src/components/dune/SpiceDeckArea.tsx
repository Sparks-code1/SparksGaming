/**
 * The spice deck and its discard pile(s), drawn into the box on the board.
 *
 * That box used to be labelled SPICE BANK. The bank turned out not to be a
 * place: spice paid leaves one purse and arrives in another, and the purses are
 * per-seat and hidden in match_secrets. What actually sits there in a game of
 * Dune is the spice deck and what has been turned over from it, so that is what
 * is drawn.
 *
 * AN OVERLAY, like SeatLayer, and for the same reason. The generator draws what
 * is true of every game — here, the box and its label. The cards change every
 * single turn, and how many discard piles there even are depends on the mode:
 * one in the basic game, two in the advanced. None of that can be printed once.
 *
 * The coordinates come from DUNE_SPICE_DECK_AREA, which is the largest
 * rectangle that FITS INSIDE the printed box — not the box's bounding box. The
 * box is a wedge with the board's rim curving through one corner of it, and the
 * first version of this laid the cards out on the bbox, which put two of the
 * three on the navy surround outside the box entirely. Every number agreed with
 * every other number, because they all came from the same wrong rectangle.
 *
 * WHAT THE TOP CARD IS FOR. It is not decoration. Shai-Hulud devours everything
 * in the territory showing on the pile it was drawn into — so which card is
 * face up is a rule input, and a pile drawn bottom-up would be showing the wrong
 * one. `showing` in lib/dune/spiceBlow is the single answer to that question and
 * this reads it rather than indexing the array itself.
 */
import { DUNE_SPICE_DECK_AREA } from '@/data/dune/boardData'
import type { DuneArea } from '@/data/dune/boardData'
import { showing } from '@/lib/dune/spiceBlow'
import type { GameMode, SpiceCard, SpiceDeckPublic } from '@/types/Dune/Game'

const INK = '#3f2c1a'
const SAND = '#f0e2bb'
const NAVY = '#111a30'
const SERIF = "Georgia, 'Times New Roman', serif"

/** Cards are 5:7, the ratio the generated card art uses. */
const CARD_RATIO = 7 / 5

// The printed SPICE DECK label is not a concern here. It sits in the thin tail
// of the wedge, which is outside this rectangle — the generator puts it there
// precisely because that is the part of the box no card can occupy.
const PAD = 8
const GAP = 6
/** Caption height beneath a slot that has one. */
const CAPTION = 12
/**
 * Room for a stacked pile's label, which sits BESIDE it rather than under it.
 *
 * Only the advanced game pays this. Two piles stacked are short of height and
 * flush with width, so a caption under each would come straight off the cards;
 * one pile has height to spare and is captioned underneath like the deck.
 */
const SIDE_LABEL_W = 26

/**
 * The spice spiral, the same curve the board's own marks are drawn from.
 *
 * Copied as a FORMULA rather than as a path, so it is the same shape at any
 * size: `spiceSpiral` in scripts/build-dune-board.mjs walks the same 30 steps
 * of the same Archimedean arm. Its `scale = 1` reaches a radius of about 6.3,
 * which is where the divisor comes from — passing a radius here means the
 * spiral actually ends at that radius.
 */
function SpiceSpiral({ x, y, r, stroke, width = 1.1 }: {
  x: number; y: number; r: number; stroke: string; width?: number
}) {
  const scale = r / 6.2978
  const arm: string[] = []
  for (let k = 0; k <= 30; k++) {
    const th = (k / 30) * 2.5 * Math.PI
    const rr = (0.8 + th * 0.7) * scale
    arm.push(`${(x + rr * Math.cos(th)).toFixed(2)},${(y + rr * Math.sin(th)).toFixed(2)}`)
  }
  return (
    <polyline points={arm.join(' ')} fill="none" stroke={stroke} strokeWidth={width}
      strokeLinecap="round" strokeLinejoin="round" />
  )
}

/**
 * Break a name onto as many lines as it needs.
 *
 * Measured in characters, like the generator's own wrapText. SVG cannot wrap
 * text, and 'Habbanya Ridge Flat' across a 100-unit card is otherwise one long
 * line running out of both sides of it.
 */
function wrap(text: string, perLine: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    if (line && (line + ' ' + word).length > perLine) { out.push(line); line = word }
    else line = line ? line + ' ' + word : word
  }
  if (line) out.push(line)
  return out
}

/**
 * Where the deck and the discard pile(s) sit.
 *
 * TWO ARRANGEMENTS, because the two games want different ones.
 *
 * The advanced game has two piles. Three cards abreast in a box this shape are
 * bound by its width and none of them can use its height — the deck came out 46
 * wide with 60 of the box's 144 going spare beneath it. Standing the deck up on
 * its own down the left and stacking the two piles beside it takes the deck to
 * 78 wide and leaves the piles about where they were.
 *
 * The basic game has one pile, and side by side is the best it can do. Stacking
 * a single pile gives it height it cannot use and takes the width off the deck,
 * which is what a first attempt at this did: a 91-wide discard beside a 31-wide
 * deck. The arithmetic said it was fine; the two numbers said it was not.
 *
 * The box is a PARAMETER, defaulting to the printed one — the real box is short
 * and wide enough that its height always binds, so with it alone the width term
 * can never be shown to do anything.
 */
export function slotLayout(slots: number, area: DuneArea = DUNE_SPICE_DECK_AREA) {
  const { x, y, width, height } = area
  const piles = Math.max(1, slots - 1)
  const usableW = width - PAD * 2
  const usableH = height - PAD * 2
  const left = x + PAD

  if (piles < 2) {
    // Side by side, both captioned underneath.
    const colW = (usableW - GAP) / 2
    const cardH = Math.min(usableH - CAPTION, colW * CARD_RATIO)
    const cardW = cardH / CARD_RATIO
    const top = y + (height - cardH - CAPTION) / 2
    return {
      deckW: cardW, deckH: cardH, deckX: left, deckY: top,
      pileW: cardW, pileH: cardH, pileX: left + cardW + GAP, pileY: top,
      pileStep: 0, sideLabels: false,
      cardW, cardH, top, left,
    }
  }

  // Stacked: the piles' height is fixed by how many there are, their width
  // follows from that, and the deck takes what is left across.
  // Bound by BOTH axes. Sized by the stack's height alone, a tall narrow box
  // gave piles 135 wide inside 104 of usable width — the same class of mistake
  // as the row of three, in the other direction.
  const slotH = (usableH - GAP * (piles - 1)) / piles
  const pileW = Math.min(slotH / CARD_RATIO, (usableW - GAP - SIDE_LABEL_W) * 0.45)
  const pileH = pileW * CARD_RATIO
  const deckW = Math.min(usableW - GAP - pileW - SIDE_LABEL_W, (usableH - CAPTION) / CARD_RATIO)
  const deckH = deckW * CARD_RATIO
  return {
    deckW, deckH, deckX: left, deckY: y + (height - deckH - CAPTION) / 2,
    pileW, pileH, pileX: x + width - PAD - pileW - SIDE_LABEL_W, pileY: y + PAD,
    pileStep: pileH + GAP, sideLabels: true,
    // Kept so a caller can speak of "a card" without knowing which it is.
    cardW: Math.min(deckW, pileW), cardH: Math.min(deckH, pileH),
    top: y + PAD, left,
  }
}

/** The face-down back: navy, a cream rule inside the edge, and the spiral. */
function CardBack({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={5} fill={NAVY} stroke={SAND} strokeWidth={1.2} />
      <rect x={x + 5} y={y + 5} width={w - 10} height={h - 10} rx={3}
        fill="none" stroke={SAND} strokeWidth={0.7} opacity={0.55} />
      <SpiceSpiral x={x + w / 2} y={y + h / 2} r={w * 0.26} stroke={SAND} width={1.4} />
    </g>
  )
}

/** An empty slot: the outline of a card nobody has put anything in yet. */
function EmptySlot({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <rect x={x} y={y} width={w} height={h} rx={5} fill={INK} fillOpacity={0.06}
      stroke={INK} strokeWidth={1} strokeDasharray="4 4" opacity={0.6} />
  )
}

/** A card face up: what it is, and the one number that matters on it. */
function CardFace({ card, x, y, w, h }: {
  card: SpiceCard; x: number; y: number; w: number; h: number
}) {
  const worm = card.kind === 'shai-hulud'
  const bg = worm ? NAVY : SAND
  const fg = worm ? SAND : INK
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={5} fill={bg} stroke={INK} strokeWidth={1.2} />
      {worm ? (
        <>
          <image href="/icons/sandworm.svg" x={x + w * 0.1} y={y + h * 0.22}
            width={w * 0.8} height={h * 0.38} preserveAspectRatio="xMidYMid meet" />
          <text x={x + w / 2} y={y + h * 0.74} fontSize={w * 0.135} fill={fg}
            textAnchor="middle" fontFamily={SERIF} letterSpacing={0.5}>SHAI-</text>
          <text x={x + w / 2} y={y + h * 0.86} fontSize={w * 0.135} fill={fg}
            textAnchor="middle" fontFamily={SERIF} letterSpacing={0.5}>HULUD</text>
        </>
      ) : (
        <>
          {/* Wrapped and centred vertically on the upper two thirds, so a
              one-line name and a three-line name both sit where the eye looks. */}
          {wrap(card.name.toUpperCase(), 11).map((line, i, all) => (
            <text key={line} x={x + w / 2}
              y={y + h * 0.38 + (i - (all.length - 1) / 2) * w * 0.155}
              fontSize={w * 0.13} fill={fg} textAnchor="middle" dominantBaseline="central"
              fontFamily={SERIF} letterSpacing={0.4}>{line}</text>
          ))}
          <circle cx={x + w * 0.34} cy={y + h * 0.74} r={w * 0.115}
            fill="#f6ecd2" stroke={INK} strokeWidth={0.9} />
          <SpiceSpiral x={x + w * 0.34} y={y + h * 0.74} r={w * 0.075} stroke={INK} width={0.8} />
          <text x={x + w * 0.62} y={y + h * 0.74} fontSize={w * 0.24} fill={fg}
            textAnchor="middle" dominantBaseline="central" fontWeight="bold"
            fontFamily={SERIF}>{card.spice}</text>
        </>
      )}
    </g>
  )
}

/**
 * One label under a slot.
 *
 * SIZED TO THE CARD. At a fixed 9.5 the three captions of an advanced game ran
 * into each other — the cards are 46 wide there and 'PILE A' with tracking is
 * wider than that. Anything drawn under a card has to shrink with it.
 */
function Caption({ x, y, w, text }: { x: number; y: number; w: number; text: string }) {
  const size = Math.min(9.5, w * 0.17)
  return (
    <text x={x + w / 2} y={y} fontSize={size} fill={INK} textAnchor="middle"
      dominantBaseline="hanging" letterSpacing={size * 0.09} fontFamily={SERIF} opacity={0.85}>
      {text}
    </text>
  )
}

/**
 * How many cards are in a pile, as a corner badge.
 *
 * On the CARD rather than in the caption, which is where it was: appended to
 * the label it made the widest string on the board sit under the narrowest
 * card. It also reads better beside the count on the deck back, which is the
 * same fact about a different stack.
 */
function Depth({ x, y, w, count }: { x: number; y: number; w: number; count: number }) {
  if (count < 2) return null
  const r = w * 0.15
  return (
    <g data-depth={count}>
      <circle cx={x + w - r * 0.9} cy={y + r * 0.9} r={r} fill="#f6ecd2"
        stroke={INK} strokeWidth={0.8} />
      <text x={x + w - r * 0.9} y={y + r * 0.9} fontSize={r * 1.25} fill={INK}
        textAnchor="middle" dominantBaseline="central" fontFamily={SERIF}>{count}</text>
    </g>
  )
}

/**
 * A discard pile: the top card face up, over a hint of the ones under it.
 *
 * The depth marks are drawn BEHIND and offset, which is the only way a pile of
 * one and a pile of nine look different when only the top card is ever visible.
 */
function Pile({ cards, x, y, w, h, caption, sideLabel }: {
  cards: readonly SpiceCard[]; x: number; y: number; w: number; h: number
  caption: string
  /** Beside the card rather than under it, where height is the scarce axis. */
  sideLabel?: boolean
}) {
  const top = showing(cards)
  return (
    <g>
      {top && Array.from({ length: Math.min(cards.length - 1, 3) }, (_, i) => (
        <rect key={i} x={x - (i + 1) * 1.8} y={y + (i + 1) * 1.8} width={w} height={h} rx={5}
          fill={SAND} stroke={INK} strokeWidth={0.8} opacity={0.45} />
      ))}
      {top
        ? <CardFace card={top} x={x} y={y} w={w} h={h} />
        : <EmptySlot x={x} y={y} w={w} h={h} />}
      <Depth x={x} y={y} w={w} count={cards.length} />
      {sideLabel
        ? <text x={x + w + 4} y={y + h / 2} fontSize={Math.min(10, w * 0.26)} fill={INK}
            dominantBaseline="central" letterSpacing={0.8} fontFamily={SERIF} opacity={0.85}>
            {caption}
          </text>
        : <Caption x={x} y={y + h + 4} w={w} text={caption} />}
      <title>
        {top
          ? `${caption}: showing ${top.kind === 'shai-hulud' ? 'Shai-Hulud' : top.name}`
            + ` (${cards.length} card${cards.length === 1 ? '' : 's'})`
          : `${caption}: empty`}
      </title>
    </g>
  )
}

export interface SpiceDeckAreaProps {
  /**
   * The public projection, straight off the shared row.
   *
   * NOT the deck. There is no way to hand this component a card order, because
   * SpiceDeckPublic has no field for one — the order lives in match_decks and no
   * client can read it. `remaining` is a published number, which is also why it
   * is not recomputed here from the piles: cards leave the deck without reaching
   * a discard, so any sum done on this side would be wrong.
   */
  deck: SpiceDeckPublic
  /** Basic draws one discard pile, advanced two. */
  mode: GameMode
}

export function SpiceDeckArea({ deck, mode }: SpiceDeckAreaProps) {
  const advanced = mode === 'advanced'
  const L = slotLayout(advanced ? 3 : 2)
  return (
    <g data-layer="spice-deck" data-mode={mode}>
      {/* The deck itself: face down, and the only thing said about it is how
          much of it is left. */}
      <g>
        <CardBack x={L.deckX} y={L.deckY} w={L.deckW} h={L.deckH} />
        {/* The count rides on the back rather than in the caption: it is the
            reason the deck is drawn at all, and it changes every turn. */}
        <circle cx={L.deckX + L.deckW / 2} cy={L.deckY + L.deckH * 0.78} r={L.deckW * 0.16}
          fill={SAND} stroke={INK} strokeWidth={1} />
        <text x={L.deckX + L.deckW / 2} y={L.deckY + L.deckH * 0.78} fontSize={L.deckW * 0.2}
          fill={INK} textAnchor="middle" dominantBaseline="central" fontWeight="bold"
          fontFamily={SERIF}>
          {deck.remaining}
        </text>
        <Caption x={L.deckX} y={L.deckY + L.deckH + 3} w={L.deckW} text="DECK" />
        <title>{`Spice deck: ${deck.remaining} card${deck.remaining === 1 ? '' : 's'} face down`}</title>
      </g>

      <Pile cards={deck.discardA} x={L.pileX} y={L.pileY} w={L.pileW} h={L.pileH}
        caption={advanced ? 'A' : 'DISCARD'} sideLabel={L.sideLabels} />

      {/* Pile B exists only in the advanced game. Not drawn empty in the basic
          one — an empty slot on the board says "nothing here yet", which is a
          different and wrong thing from "this pile is not in this game". */}
      {advanced && (
        <Pile cards={deck.discardB} x={L.pileX} y={L.pileY + L.pileStep}
          w={L.pileW} h={L.pileH} caption="B" sideLabel={L.sideLabels} />
      )}
    </g>
  )
}

export default SpiceDeckArea
