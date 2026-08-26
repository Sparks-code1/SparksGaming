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
import type { TreacheryCard } from '@/types/Dune/Treachery'

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
 * Was this picture drawn here, or supplied?
 *
 * Everything drawn here is SVG, authored to its own box, on nothing. Everything
 * supplied is a raster photograph of a silhouette with its own opaque ground.
 * The two want opposite treatment — see the border and the fit below — and they
 * ask the same question, so they ask it once.
 *
 * Format is the proxy, which is self-maintaining where a per-card flag would not
 * be: art is drawn as SVG or exported as a raster, and nobody has to remember to
 * set anything.
 */
export const isDrawnHere = (image: string) => image.endsWith('.svg')

/**
 * How a picture meets its box.
 *
 * Drawn art is fitted INSIDE the box; supplied art FILLS it.
 *
 * Not a style choice. The supplied pictures are wide subjects exported onto
 * square canvases, so fitting one inside the box scales it by its empty margin
 * rather than by its subject. The Lasgun is the clearest case: a rifle spanning
 * 93% of its canvas width but 24% of its height, so fitting the canvas into a
 * 56-tall box drew the gun 13 pixels tall with 82 pixels of nothing either
 * side. Filling crops the empty ground away and draws the same gun at 128 by 32.
 *
 * Filling crops, so it is only safe while subjects sit near the middle of their
 * canvas — which is what "exported onto a square canvas" amounts to in practice.
 * Drawn art is authored to its own box with no margin to spare, so it keeps the
 * fit that cannot crop.
 */
export const artFit = (image: string) =>
  isDrawnHere(image) ? 'xMidYMid meet' : 'xMidYMid slice'

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
 * What goes at the right-hand end of the header.
 *
 * Separated from the drawing because it is the only part that carries meaning,
 * and because the alternative was a copy of these rules living in the test —
 * which could then agree with itself while the card rendered something else.
 *
 * THE CLASS GLYPH IS THE POINT. A weapon and the defence that answers it share
 * a class, so they share a glyph: droplet for poison, crosshair for projectiles.
 * The defence wears it INSIDE A SHIELD. So the mark says two things at once —
 * which class, and whether this card is the threat or the answer to it — and it
 * says them across two different header colours, where colour alone cannot.
 *
 * The Lasgun's bolt is its own class and is never shielded, because nothing
 * answers a Lasgun. That absence is the rule, and it is asserted rather than
 * merely true today: a shielded bolt would mean somebody had invented a defence
 * the game does not have.
 *
 * The stop hand and the asterisk mean nothing at all. They are how the printed
 * cards look, and a hand signalling stop on exactly the cards that interrupt
 * phases is the kind of coincidence somebody later reads a rule into. Nothing
 * branches on any of it.
 */
export type HeaderGlyph = 'stop' | 'asterisk' | 'droplet' | 'crosshair' | 'bolt' | 'none'

export interface HeaderMarkSpec {
  glyph: HeaderGlyph
  /** Drawn inside a knight's shield: this card ANSWERS the class, not deals it. */
  shielded: boolean
}

export function headerMarkFor(card: TreacheryCard): HeaderMarkSpec {
  if (card.kind === 'special') return { glyph: 'stop', shielded: false }
  if (card.kind === 'worthless') return { glyph: 'asterisk', shielded: false }
  const glyph: HeaderGlyph =
    card.subtype === 'poison' ? 'droplet'
      : card.subtype === 'projectile' ? 'crosshair'
      : card.subtype === 'lasgun' ? 'bolt'
      : 'none'
  return { glyph, shielded: glyph !== 'none' && card.kind === 'defense' }
}

/** A drop: a point at the top opening into a round belly. The curve into the
 *  point is the whole of what makes it read as liquid. */
const Droplet = ({ cx, cy, r }: XYR) => (
  <path fill={BLACK} d={`M${cx} ${cy - r}
    C${cx + r * 0.52} ${cy - r * 0.32} ${cx + r * 0.78} ${cy + r * 0.2} ${cx} ${cy + r * 0.86}
    C${cx - r * 0.78} ${cy + r * 0.2} ${cx - r * 0.52} ${cy - r * 0.32} ${cx} ${cy - r}Z`} />
)

/** A crosshair: a ring broken by four ticks that overshoot it, with a dot at
 *  the centre. The overshoot is what separates it from a target — concentric
 *  rings alone read as something to hit rather than something aiming. */
const Crosshair = ({ cx, cy, r }: XYR) => (
  <g stroke={BLACK} strokeWidth={r * 0.24} strokeLinecap="round" fill="none">
    <circle cx={cx} cy={cy} r={r * 0.68} />
    <path d={`M${cx} ${cy - r} V${cy - r * 0.34}`} />
    <path d={`M${cx} ${cy + r} V${cy + r * 0.34}`} />
    <path d={`M${cx - r} ${cy} H${cx - r * 0.34}`} />
    <path d={`M${cx + r} ${cy} H${cx + r * 0.34}`} />
    <circle cx={cx} cy={cy} r={r * 0.1} fill={BLACK} stroke="none" />
  </g>
)

/** A bolt. Plotted on a unit square and mapped, because a zigzag written as
 *  absolute coordinates is unreadable and impossible to retune. */
const BOLT: readonly [number, number][] = [
  [0.62, 0.00], [0.17, 0.56], [0.45, 0.56], [0.33, 1.00], [0.82, 0.41], [0.53, 0.41],
]
const Bolt = ({ cx, cy, r }: XYR) => (
  <path fill={BLACK} d={BOLT.map(([u, v], i) =>
    `${i ? 'L' : 'M'}${cx - r + 2 * r * u} ${cy - r + 2 * r * v}`).join(' ') + 'Z'} />
)

/** A heater shield: flat across the top, straight down the flanks, tapering to
 *  a point. The straight upper flank is what makes it read as a shield rather
 *  than as a badge or a crest. */
const KnightShield = ({ cx, cy, r }: XYR) => {
  const hw = r * 0.95, hh = r * 1.02
  return (
    <path fill="none" stroke={BLACK} strokeWidth={r * 0.19} strokeLinejoin="round"
      d={`M${cx - hw} ${cy - hh} H${cx + hw} V${cy - hh * 0.1}
         Q${cx + hw} ${cy + hh * 0.58} ${cx} ${cy + hh}
         Q${cx - hw} ${cy + hh * 0.58} ${cx - hw} ${cy - hh * 0.1} Z`} />
  )
}

interface XYR { cx: number; cy: number; r: number }

function Glyph({ glyph, cx, cy, r }: XYR & { glyph: HeaderGlyph }) {
  if (glyph === 'droplet') return <Droplet cx={cx} cy={cy} r={r} />
  if (glyph === 'crosshair') return <Crosshair cx={cx} cy={cy} r={r} />
  if (glyph === 'bolt') return <Bolt cx={cx} cy={cy} r={r} />
  return null
}

/**
 * `data-mark` is on the output on purpose.
 *
 * headerMarkFor can be right while the card renders something else entirely —
 * including nothing, if the element is dropped — and the rule being exported
 * does not by itself tie it to the drawing. The attribute is what lets a test
 * read what the card actually drew and compare it against what the rule said,
 * rather than checking the rule against itself.
 *
 * Found by deliberately deleting the element and watching the suite stay green.
 */
function HeaderMark({ card }: { card: TreacheryCard }) {
  const cx = CARD_W - 20, cy = 20, r = 10.5
  const { glyph, shielded } = headerMarkFor(card)
  const mark = shielded ? `shield-${glyph}` : glyph

  if (glyph === 'stop') {
    return (
      <image data-mark={mark} href="/treachery/stop.svg"
        x={cx - r} y={cy - r} width={r * 2} height={r * 2}
        preserveAspectRatio="xMidYMid meet" />
    )
  }
  // Drawn rather than typed. A text `*` sits high in the line where a
  // superscript would, so it would hang off the top of a 27-pixel band instead
  // of sitting in the middle of it.
  if (glyph === 'asterisk') {
    return (
      <g data-mark={mark} stroke={BLACK} strokeWidth={r * 0.3} strokeLinecap="round">
        {[0, 60, 120].map(a => (
          <path key={a} d={`M${cx - r * 0.82} ${cy} H${cx + r * 0.82}`}
            transform={`rotate(${a} ${cx} ${cy})`} />
        ))}
      </g>
    )
  }
  if (glyph === 'none') return null
  if (!shielded) return <g data-mark={mark}><Glyph glyph={glyph} cx={cx} cy={cy} r={r} /></g>
  return (
    <g data-mark={mark}>
      <KnightShield cx={cx} cy={cy} r={r} />
      {/* Sat slightly high: the shield tapers, so its visual centre is above
          its geometric one and a glyph on the true centre looks dropped. */}
      <Glyph glyph={glyph} cx={cx} cy={cy - r * 0.1} r={r * 0.46} />
    </g>
  )
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
      <HeaderMark card={card} />

      {card.image && (
        <>
          {/* A ruled box around line art gives it an edge to sit against. Around
              a painted picture it reads as a second frame inside the card's own,
              so the supplied artwork goes without one. The file format is the
              proxy for which is which — everything drawn here is SVG and
              everything supplied is not — and it is self-maintaining, which a
              per-card flag would not be. */}
          {isDrawnHere(card.image) && (
            <rect x={ART.x} y={ART.y} width={ART.w} height={artH}
              fill="none" stroke={BLACK} strokeWidth="1.8" />
          )}
          <image href={card.image}
            x={ART.x} y={ART.y} width={ART.w} height={artH}
            preserveAspectRatio={artFit(card.image)} />
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

/**
 * The back of a treachery card.
 *
 * Same footprint as the face, because the two swap places in the same slot: a
 * card that changed size when it turned over would move everything beside it.
 *
 * IDENTICAL ON EVERY CARD, which is the rule that matters. A back exists to
 * be indistinguishable from every other back — anything that varies on it, even
 * a corner mark, is a way to tell one card from another without turning it
 * over, and the auction is built on nobody being able to. The word TREACHERY
 * and the pattern under it are the same on all of them and are generated from
 * the geometry rather than from the card, so there is nothing here that COULD
 * vary: the component does not even take a card.
 */
/**
 * How wide the word is drawn, inside the band and inside the card.
 *
 * Exported so the test can check it against the card rather than trusting the
 * number: a back whose lettering overflows clips to the middle of the word,
 * which looks like a rendering fault and is really an arithmetic one.
 */
export const LETTERING_W = CARD_W - 52

export function TreacheryCardBack({ width = CARD_W }: { width?: number }) {
  const step = 14
  const lines: JSX.Element[] = []
  for (let i = -CARD_H; i < CARD_W + CARD_H; i += step) {
    lines.push(<path key={i} d={`M${i} 0 L${i + CARD_H} ${CARD_H}`} />)
  }
  return (
    <svg viewBox={`0 0 ${CARD_W} ${CARD_H}`} width={width} height={width * (CARD_H / CARD_W)}>
      <title>a treachery card, face down</title>
      <defs>
        <clipPath id="dune-card-back-clip">
          <rect x="1" y="1" width={CARD_W - 2} height={CARD_H - 2} rx="10" />
        </clipPath>
      </defs>
      <rect x="1" y="1" width={CARD_W - 2} height={CARD_H - 2} rx="10"
        fill="#3a2c1a" stroke={BLACK} strokeWidth="2" />
      <g clipPath="url(#dune-card-back-clip)" stroke="#00000033" strokeWidth="5" fill="none">
        {lines}
      </g>
      <rect x="12" y="12" width={CARD_W - 24} height={CARD_H - 24} rx="5"
        fill="none" stroke="#00000055" strokeWidth="2" />

      {/* The name, across the middle, on a band so it reads against the
          hatching rather than fighting it. */}
      <rect x="12" y={CARD_H / 2 - 17} width={CARD_W - 24} height={34}
        fill="#1c140b" opacity="0.82" />

      {/* textLength IS THE POINT, not the font size.
          This was set at CARD_W * 0.15 with tracking to match — about 25pt with
          4.7 between letters, which needs roughly 201 units for nine capitals in
          a card 168 wide. Centred, it overflowed both ends and clipped to
          "reacher".
          Sizing by eye only moves the problem: glyph widths differ by font, and
          Georgia may not be installed. textLength tells the renderer the exact
          width the word must occupy and lengthAdjust lets it squeeze both the
          spacing and the glyphs to hit it, so it fits whatever is available to
          draw with. The font size below is now only a starting shape. */}
      <text x={CARD_W / 2} y={CARD_H / 2} textAnchor="middle" dominantBaseline="central"
        fontFamily="Georgia, 'Times New Roman', serif" fontSize={17}
        textLength={LETTERING_W} lengthAdjust="spacingAndGlyphs"
        fill="#c9a34a" fontWeight="bold">
        TREACHERY
      </text>
      {/* Rules either side of it, so the word sits in a device rather than
          floating on the pattern. */}
      <line x1="26" y1={CARD_H / 2 - 21} x2={CARD_W - 26} y2={CARD_H / 2 - 21}
        stroke="#c9a34a" strokeWidth="1.5" opacity="0.75" />
      <line x1="26" y1={CARD_H / 2 + 21} x2={CARD_W - 26} y2={CARD_H / 2 + 21}
        stroke="#c9a34a" strokeWidth="1.5" opacity="0.75" />
    </svg>
  )
}
