/**
 * The two ways to read a hand, and the only two.
 *
 * Online, `players[].cards` exists for the hands THIS MACHINE HOLDS — its own
 * seat's, and on the host the computer seats it plays — and for nobody else;
 * every other seat arrives with a `cardCount` and no array at all. Absent means
 * "not yours to see"; an empty array would be the false claim that they hold
 * nothing. Hotseat has the array for everybody.
 *
 * These lived inside GameBoard, which consolidated its own readers through them
 * — and a component in another file then read `player.cards` bare, compiled
 * clean, and took the board down on the fifth site of the same shape
 * (CardHand, 2026-09-06). So they are a module now, `Player.cards` is optional
 * in the type, and the compiler finds the next site instead of a table.
 */

/** How many cards a player holds. ANY READER THAT ONLY WANTS THE SIZE COMES THROUGH HERE. */
export function handSize(p: { cards?: string[]; cardCount?: number }): number {
  return Array.isArray(p.cards) ? p.cards.length : (p.cardCount ?? 0)
}

/**
 * The cards themselves, if this machine holds them — null if it does not.
 *
 * THE READER FOR ANYTHING THAT NEEDS THE IDS rather than the count: a trade-in,
 * a card to play, a hand to show. Null means NOT HELD, never empty: an empty
 * array is a real hand with nothing in it. A reader that wants ids and finds
 * null skips what it was going to do; it does not throw.
 */
export function heldHand(p: { cards?: string[]; cardCount?: number }): string[] | null {
  return Array.isArray(p.cards) ? p.cards : null
}
