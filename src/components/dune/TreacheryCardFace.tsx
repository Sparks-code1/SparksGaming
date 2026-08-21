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
 *
 * THE TEXT FITS BY CONSTRUCTION. A fixed size and a fixed art box worked for a
 * weapon and ran off the bottom of the card for the Lasgun, which carries seven
 * times as much text. So the layout is computed per card: the art box gives up
 * height until the words fit at a size still worth reading. Anything that only
 * works for the shortest card in the deck is not a layout, it is a coincidence.
 */
import { TREACHERY_HEADER } from '@/types/Dune/Treachery'
import type { TreacheryCard, TreacheryKind } from '@/types/Dune/Treachery'

const SAND = '#f0e2bb'
const BLACK = '#000000'

/** The face is drawn at this size and scaled by the caller. */
export const CARD_W = 168
export const CARD_H = 236

/** Georgia's average advance, as a fraction of the type size. An estimate, and
 *  the reason `perLine` is approximate rather than exact — see fitCardText. */
const CHAR_W = 0.5
const LINE_H = 1.28

const ART = { x: 15, y: 50, w: CARD_W - 30 }
/** The name starts here and must stop before the header mark. */
export const NAME_X = 12
export const NAME_W = CARD_W - NAME_X - 36
const TEXT_BOTTOM = CARD_H - 9
const TEXT_W = CARD_W - 24

/**
 * Break rules text into lines that fit.
 *
 * By character count rather than by measuring, which is crude and deliberate:
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
 * The largest size at which this text fits the space, and the lines it makes.
 *
 * Walks down from `max` rather than solving, because the number of lines is a
 * step function of the size — wrapping is discrete — and stepping is both easier
 * to follow and impossible to get subtly wrong.
 *
 * `fits` is reported rather than assumed: at `min` the text may still overflow,
 * and a caller that needs to know (to give up art space, say) should be able to
 * ask instead of measuring the result again.
 */
export function fitCardText(text: string, width: number, height: number, max: number, min: number) {
  for (let size = max; size >= min; size -= 0.2) {
    const perLine = Math.max(10, Math.floor(width / (size * CHAR_W)))
    const lines = wrapCardText(text, perLine)
    if (lines.length * size * LINE_H <= height) return { size, lines, fits: true }
  }
  const perLine = Math.max(10, Math.floor(width / (min * CHAR_W)))
  const lines = wrapCardText(text, perLine)
  return { size: min, lines, fits: lines.length * min * LINE_H <= height }
}

/**
 * Where everything goes on this particular card.
 *
 * The art box is the flexible part. It starts at its full height and steps down
 * only when the text cannot otherwise be read — text is what a rules card is
 * for, and a picture that squeezed the rules off the bottom would have it
 * backwards.
 */
export function layoutCard(card: TreacheryCard) {
  if (!card.image) {
    const textTop = 56
    return { artH: 0, textTop, ...fitCardText(card.text, TEXT_W, TEXT_BOTTOM - textTop, 7.5, 4.6) }
  }
  for (const artH of [104, 92, 80, 68, 56]) {
    const textTop = ART.y + artH + 13
    const fit = fitCardText(card.text, TEXT_W, TEXT_BOTTOM - textTop, 8.4, 6.4)
    if (fit.fits) return { artH, textTop, ...fit }
  }
  // Nothing fits at a readable size, so take the smallest picture and the
  // smallest type. Reached by no card in the deck today.
  const artH = 56, textTop = ART.y + artH + 13
  return { artH, textTop, ...fitCardText(card.text, TEXT_W, TEXT_BOTTOM - textTop, 8.4, 4.6) }
}

/**
 * The mark at the right-hand end of the header.
 *
 * A stop hand on the specials, an asterisk on the worthless cards, nothing on
 * weapons and defences. It MEANS NOTHING in either case — it is how the printed
 * cards look, and that is the whole of it. Worth saying plainly, because a hand
 * signalling stop on exactly the cards that interrupt phases is the kind of
 * coincidence somebody later reads a rule into. Nothing branches on it and
 * nothing should.
 *
 * The asterisk is drawn rather than typed. A text `*` sits high in the line
 * where a superscript would, so it would hang off the top of a 27-pixel band
 * instead of sitting in the middle of it.
 */
function HeaderMark({ kind }: { kind: TreacheryKind }) {
  const cx = CARD_W - 20, cy = 20, r = 10.5

  if (kind === 'special') {
    return (
      <image href="/treachery/stop.svg"
        x={cx - r} y={cy - r} width={r * 2} height={r * 2}
        preserveAspectRatio="xMidYMid meet" />
    )
  }
  if (kind === 'worthless') {
    return (
      <g stroke={BLACK} strokeWidth={r * 0.3} strokeLinecap="round">
        {[0, 60, 120].map(a => (
          <path key={a} d={`M${cx - r * 0.82} ${cy} H${cx + r * 0.82}`}
            transform={`rotate(${a} ${cx} ${cy})`} />
        ))}
      </g>
    )
  }
  return null
}

/**
 * The size the name is set at.
 *
 * The name shares the header with the mark, so it cannot simply be as large as
 * it likes: "Captain Iakin Nefud" is three times the length of "Shield" and both
 * have to stop before the mark. Computed from the room available rather than
 * stepped through tiers, which is what the tiers were approximating anyway.
 */
export function fitNameSize(name: string, width: number, max = 15.5, min = 8) {
  const size = width / (Math.max(1, name.length) * 0.68)
  return Math.max(min, Math.min(max, size))
}

export function TreacheryCardFace({ card, width = CARD_W }: { card: TreacheryCard; width?: number }) {
  const { artH, textTop, size, lines } = layoutCard(card)
  const textOnly = !card.image

  const nameSize = fitNameSize(card.name, NAME_W)

  return (
    <svg viewBox={`0 0 ${CARD_W} ${CARD_H}`} width={width} height={width * (CARD_H / CARD_W)}>
      <title>{card.name}</title>

      <rect x="1" y="1" width={CARD_W - 2} height={CARD_H - 2} rx="10"
        fill={SAND} stroke={BLACK} strokeWidth="2" />

      {/* header, squared off at the bottom so it reads as a band rather than a pill */}
      <path d={`M1 11 a10 10 0 0 1 10 -10 h${CARD_W - 22} a10 10 0 0 1 10 10 v27 h-${CARD_W - 2} z`}
        fill={TREACHERY_HEADER[card.kind]} stroke={BLACK} strokeWidth="2" />
      <text x={NAME_X} y="25" fontSize={nameSize} fill={BLACK} textAnchor="start"
        fontFamily="Georgia, 'Times New Roman', serif" letterSpacing="0.5">
        {card.name.toUpperCase()}
      </text>
      <HeaderMark kind={card.kind} />

      {card.image && (
        <>
          <rect x={ART.x} y={ART.y} width={ART.w} height={artH}
            fill="none" stroke={BLACK} strokeWidth="1.8" />
          {/* Fitted to the WHOLE box rather than to a square inside it: four of
              the weapon images are square and the Maula Pistol is wide, and a
              square slot would waste most of the box on the wide one. */}
          <image href={card.image}
            x={ART.x} y={ART.y} width={ART.w} height={artH}
            preserveAspectRatio="xMidYMid meet" />
        </>
      )}

      <g fontFamily="Georgia, 'Times New Roman', serif" fill={BLACK}>
        {lines.map((line, i) => (
          <text key={i} x={textOnly ? 12 : CARD_W / 2} y={textTop + i * (size * LINE_H)}
            fontSize={size} textAnchor={textOnly ? 'start' : 'middle'}>
            {line}
          </text>
        ))}
      </g>
    </svg>
  )
}
