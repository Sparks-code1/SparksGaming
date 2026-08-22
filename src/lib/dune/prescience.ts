/**
 * Atreides prescience: seeing the card before bidding on it.
 *
 * The first faction power that hands ONE SEAT information nobody else has.
 * Every other one so far moves pieces or spice, which everybody watches happen.
 *
 * NOT IN bidding.ts, and that is deliberate. That module is card-blind — it
 * decides who pays what for the Nth card and never learns which card that is,
 * which is what lets its state be public. A function there that took card ids
 * would put them one careless spread away from the auction's own carry, and the
 * carry is written to matches.state.
 *
 * ONLY THE CARD CURRENTLY UP. Not the lot, not the next one, not what has
 * already been won. The Atreides may look at each card as it comes up for
 * purchase; a reveal that named the whole row would hand them the rest of the
 * auction as well, which is a different and much larger power.
 *
 * That makes the reveal a thing that MOVES. It changes as the row advances and
 * is cleared when the auction ends — a stale reveal left in a secrets row is a
 * card the Atreides can still read after it has been dealt to somebody else.
 */
import type { FactionId } from '@/types/Dune/Faction'

/** Whose power this is. Named once so nothing has to spell it twice. */
export const PRESCIENT_FACTION: FactionId = 'atreides'

/** The key the reveal is written under, inside that seat's secrets row. */
export const REVEAL_KEY = 'prescience'

export interface Reveal {
  /** Always the prescient faction — carried so the caller cannot misfile it. */
  faction: FactionId
  /** The card id, as it will be dealt. */
  card: string
}

/**
 * What the prescient seat may see right now, or nothing.
 *
 * @param seated  who is in the game. No Atreides at the table, no reveal.
 * @param lot     the cards drawn for this auction, in the order they come up
 * @param index   which card is up. Out of range — including the settled
 *                auction's index, one past the end — means nothing is up, and
 *                nothing is revealed.
 */
export function prescienceFor(input: {
  seated: readonly FactionId[]
  lot: readonly string[]
  index: number
}): Reveal | null {
  const { seated, lot, index } = input
  if (!seated.includes(PRESCIENT_FACTION)) return null
  if (!Number.isInteger(index) || index < 0 || index >= lot.length) return null
  return { faction: PRESCIENT_FACTION, card: lot[index] }
}

/**
 * A seat's secrets with the reveal set, or cleared.
 *
 * MERGED, never replaced. match_secrets is written by upserting the whole data
 * blob, so a write of \`{ prescience: x }\` alone would take that seat's hand and
 * purse with it. Writing the reveal is the smallest change in this phase and
 * would be the easiest place to lose everything else.
 *
 * A null reveal REMOVES the key rather than setting it to null, because the
 * panel treats a present-but-empty reveal and an absent one the same and
 * somebody reading the row should not have to know that.
 */
export function withReveal(
  secrets: Readonly<Record<string, unknown>>, reveal: Reveal | null,
): Record<string, unknown> {
  const next = { ...secrets }
  if (reveal) next[REVEAL_KEY] = reveal.card
  else delete next[REVEAL_KEY]
  return next
}
