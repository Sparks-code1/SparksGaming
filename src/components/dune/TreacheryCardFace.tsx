/**
 * A treachery card, drawn.
 *
 * Was a throwaway preview script for a while, which meant every design decision
 * lived in a file nobody would run again. This is the same layout as a component,
 * so the card face is a thing the app owns rather than a picture that was made
 * once.
 *
 * The layout in one line: a coloured header with the name, the artwork in a ruled
 * box, the rules text beneath. Cards with no artwork give the whole face to text.
 */
import { TREACHERY_HEADER } from '@/types/Dune/Treachery'
import type { TreacheryCard } from '@/types/Dune/Treachery'

const SAND = '#f0e2bb'
const BLACK = '#000000'

/** The face is drawn at this size and scaled by the caller. */
export const CARD_W = 168
export const CARD_H = 236

/**
 * Break rules text into lines that fit.
 *
 * By character count rather than by measuring, which is crude and good enough:
 * the alternative needs a text metric that only exists once the thing is on
 * screen, and a card that reflows after it renders is worse than one that is a
 * character or two off. Blank entries are paragraph breaks — the text uses \n\n
 * for those, and they carry meaning on cards like the Lasgun where the second
 * paragraph is a separate rule.
 */
export function wrapCardText(text: string, perLine: number): string[] {
  const paragraphs = text.split('\n\n')
  const out: string[] = []
  paragraphs.forEach((para, i) => {
    if (i > 0) out.push('')
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (next.length > perLine && line) { out.push(line); line = word }
      else line = next
    }
    if (line) out.push(line)
  })
  return out
}

/**
 * The stop hand.
 *
 * Every special card carries one, and it MEANS NOTHING. It is how the printed
 * cards look, and that is the whole of it — worth saying plainly, because a hand
 * signalling stop on exactly the cards that interrupt phases is the kind of
 * coincidence somebody later reads a rule into. There is no rule. Nothing
 * branches on it and nothing should.
 *
 * It is the supplied hand icon turned upright: the file is drawn lying down,
 * which is why the board's charity symbol rotates it by the same ninety degrees.
 */
function StopBadge({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const box = r * 1.25
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={SAND} stroke={BLACK} strokeWidth={r * 0.14} />
      <image
        href="/icons/hand.svg"
        x={cx - box / 2} y={cy - box / 2} width={box} height={box}
        preserveAspectRatio="xMidYMid meet"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
    </g>
  )
}

export function TreacheryCardFace({ card, width = CARD_W }: { card: TreacheryCard; width?: number }) {
  const header = TREACHERY_HEADER[card.kind]
  const isSpecial = card.kind === 'special'

  // A card with no picture gives its whole face to the text, and needs it —
  // Karama runs to seven times the length of a weapon.
  const textOnly = !card.image
  const perLine = textOnly ? 40 : 30
  const size = textOnly ? 7 : 8.4
  const lines = wrapCardText(card.text, perLine)
  const textTop = textOnly ? 56 : 168

  // The name shrinks rather than overrunning. Three tiers is enough for names
  // running from "Shield" to "Family Atomics".
  const nameSize = card.name.length > 13 ? 12 : card.name.length > 10 ? 13.5 : 15.5

  const art = { x: 15, y: 50, w: CARD_W - 30, h: 104 }

  return (
    <svg viewBox={`0 0 ${CARD_W} ${CARD_H}`} width={width} height={width * (CARD_H / CARD_W)}>
      <title>{card.name}</title>

      {/* the card itself */}
      <rect x="1" y="1" width={CARD_W - 2} height={CARD_H - 2} rx="10"
        fill={SAND} stroke={BLACK} strokeWidth="2" />

      {/* header, squared off at the bottom so it reads as a band rather than a pill */}
      <path d={`M1 11 a10 10 0 0 1 10 -10 h${CARD_W - 22} a10 10 0 0 1 10 10 v27 h-${CARD_W - 2} z`}
        fill={header} stroke={BLACK} strokeWidth="2" />
      <text x={CARD_W / 2} y="26" fontSize={nameSize} fill={BLACK} textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif" letterSpacing="0.5">
        {card.name.toUpperCase()}
      </text>

      {card.image && (
        <>
          {/* the picture sits in a ruled box, not loose on the card */}
          <rect x={art.x} y={art.y} width={art.w} height={art.h}
            fill="none" stroke={BLACK} strokeWidth="1.8" />
          <image href={card.image}
            x={art.x + (art.w - art.h) / 2} y={art.y} width={art.h} height={art.h}
            preserveAspectRatio="xMidYMid meet" />
          {/* the badge straddles the box's corner, so it reads as applied to the
              card rather than as part of the picture */}
          {isSpecial && <StopBadge cx={art.x + art.w - 6} cy={art.y + art.h - 4} r={17} />}
        </>
      )}

      {/* a special card with no picture still gets its badge, up beside the name */}
      {isSpecial && !card.image && <StopBadge cx={CARD_W - 26} cy={60} r={17} />}

      <g fontFamily="Georgia, 'Times New Roman', serif" fill={BLACK}>
        {lines.map((line, i) => (
          <text key={i} x={textOnly ? 12 : CARD_W / 2} y={textTop + i * (size * 1.28)}
            fontSize={size} textAnchor={textOnly ? 'start' : 'middle'}>
            {line}
          </text>
        ))}
      </g>
    </svg>
  )
}
