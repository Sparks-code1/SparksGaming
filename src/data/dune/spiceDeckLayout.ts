/**
 * Where the spice deck and its discard piles sit in the box on the board.
 *
 * DATA, not a computation, and kept here rather than in the component that
 * draws it for two reasons. It sits beside DUNE_SPICE_DECK_AREA, which is the
 * box these have to stay inside. And /spice-deck-editor.html imports it live —
 * a plain page in public/ gets no React refresh preamble, so it cannot import a
 * .tsx at all, and a tuning tool should not be pulling in a component tree to
 * read four numbers.
 */

/**
 * Room a caption needs under a card, in board units.
 *
 * The caption is drawn 3 below the card at up to 9.5 tall, so a card seated
 * flush with the bottom of the box has its words outside it. Exported because
 * the layout check and the tuning tool both have to reserve the same band, and
 * two constants agreeing by coincidence is how the last placement bug lived as
 * long as it did.
 */
export const SPICE_CAPTION_ROOM = 12

/**
 * Where each card sits, in board coordinates. SET BY HAND, not computed.
 *
 * Every automatic arrangement of this got something wrong, and each fix broke
 * the case the last one had been chosen for: three across left the deck unable
 * to use the box's height; standing the deck up halved the piles; equalising
 * them shrank the deck again; and the version that satisfied every constraint
 * on paper still had cards flush against the printed edge, because "inside the
 * box" and "looks placed in the box" are not the same property and only one of
 * them is arithmetic.
 *
 * So these are eyeballed and then frozen — the same bargain LABEL_OVERRIDES
 * makes in the generator, for the same reason: some placement is a judgement
 * about a picture, and the honest way to hold a judgement is as a number
 * somebody chose.
 *
 * Tune them with /spice-deck-editor.html on the dev server: drag each card,
 * resize it, and paste the block it exports back over this one.
 *
 * The box they must stay inside is THE PRINTED WEDGE, and spicedecktest checks
 * every corner of every card against the path the board actually draws — so a
 * value that wanders out of the box fails rather than merely looking wrong.
 *
 * NOT DUNE_SPICE_DECK_AREA, which is the largest rectangle that fits inside
 * that wedge. Staying within it is sufficient, not necessary: the wedge is
 * wider than its inscribed rectangle at nearly every height, and cards placed
 * outside the rectangle can sit comfortably inside the box on the board. The
 * rectangle is what the generator uses to place things automatically; these
 * numbers are placed by eye, so they answer to the shape itself.
 */
export interface SpiceCardBox { x: number; y: number; w: number; h: number }

export const SPICE_DECK_LAYOUT: Record<'deck' | 'discardA' | 'discardB', SpiceCardBox> = {
  deck: { x: 821.5, y: 956.1, w: 62.9, h: 85 },
  discardA: { x: 899.4, y: 899.7, w: 61.1, h: 85 },
  discardB: { x: 900.1, y: 995.4, w: 60.7, h: 85 },
}
