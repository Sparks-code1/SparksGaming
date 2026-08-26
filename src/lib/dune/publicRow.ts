/**
 * The shared row, as a Dune client reads it.
 *
 * matches.state carries more than DuneGameState names: the phases that hold a
 * window open write their own key into it — charity's window, the spice blow's
 * pause, the live auction step, the last settlement. Every one of those is
 * PUBLIC by rule, which is why they are in this row at all: who has claimed
 * charity, whose turn it is to bid, what a card sold for. Nothing here is
 * anybody's secret, and nothing here should ever become one — a seat's spice,
 * hand and traitors live in match_secrets and reach exactly one browser.
 *
 * WHY THE READERS ARE HERE RATHER THAN IN A COMPONENT. Two screens read this
 * row: the real one a player uses and the dev harness that drives six seats at
 * once. They differ in who is acting, not in what the row means — and a second
 * opinion about what "the auction is open" means is how the harness ends up
 * proving something the app does not do. The handlers stay in the components,
 * because those genuinely differ; everything derived from the row is here.
 */
import type { DuneGameState } from '@/types/Dune/Game'
import type { FactionId } from '@/types/Dune/Faction'
import type { CharityWindow } from '@/lib/dune/charity'
import type { BidAsk, AuctionCarry } from '@/lib/dune/bidding'

/**
 * The pause the spice blow opens for the Fremen.
 *
 * THE ASK ALONE, and never the deck. A Step is one object and it cannot be
 * written to one place: the ask is public, the carry holds the remaining spice
 * deck in order. Writing the step whole into matches.state would publish that
 * deck to every client through the back door of a phase that happens to pause,
 * defeating match_decks without touching it. This type is what stops the
 * client even being able to name it — see dunedispatchtest, which reads these
 * fields and fails if a deck appears among them.
 *
 * It lived in WormPlacementPanel, which is one of the two things that read it.
 * It describes the ROW, so it belongs with the row, and the panel imports it
 * from here.
 */
export interface SpiceBlowPause {
  turn: number
  pile?: 'A' | 'B'
  worms?: number
  from?: string[]
  /** When the Fremen's window shuts, stamped by the server. */
  closesAt?: number
}

/**
 * The settlement, as the whole table receives it.
 *
 * WINNER AND PRICE ONLY. Not the card — the auction is card-blind and the card
 * is now in a hand nobody else may read — and not the lot index, which is a
 * position in a pile no client can see.
 */
export interface LastAuction {
  turn: number
  /** Server timestamp, and the key that says which settlement this is. */
  at: number
  awards: { winner: FactionId; price: number }[]
}

/** The auction as public state carries it: a Step, ask and carry and all. */
export interface AuctionStep {
  status: string
  ask?: BidAsk
  carry?: AuctionCarry
  closesAt?: number
}

export type PublicRow = DuneGameState & {
  charity?: CharityWindow
  spiceBlow?: SpiceBlowPause
  auction?: AuctionStep
  lastAuction?: LastAuction
}

/**
 * The auction, when there is one waiting on somebody.
 *
 * EVERYTHING PUBLIC COMES OFF THE STEP: the ask, the order, whose turn it is,
 * who has passed, and when the turn to bid shuts. None of it names a card —
 * the auction is card-blind by construction, and a panel could not show one if
 * it tried.
 *
 * The one card that IS shown reaches the screen by another road entirely:
 * Atreides prescience is written into that seat's own secrets row, and
 * DuneGameScreen reads it there with revealedFor(own). It is never in this row,
 * so a seat not entitled to it has nothing to be careless with.
 */
export function openAuction(row: PublicRow | null): { ask: BidAsk; carry: AuctionCarry; closesAt: number } | null {
  const step = row?.auction
  if (!step || step.status !== 'awaiting' || !step.ask || !step.carry) return null
  return { ask: step.ask, carry: step.carry, closesAt: step.closesAt ?? 0 }
}

/**
 * Whether the auction is waiting past its own deadline.
 *
 * READ OFF THE ROW, never timed locally: the server stamped the moment and
 * each client subtracts its own clock from it. A client that counted down a
 * duration would drift the instant its tab was backgrounded, and six clients
 * would drift differently.
 */
export function auctionExpired(row: PublicRow | null, now: number): boolean {
  const step = row?.auction
  if (!step || step.status !== 'awaiting' || typeof step.closesAt !== 'number') return false
  return now >= step.closesAt
}

/**
 * The charity window this seat still has to answer, or null.
 *
 * Null when there is no window and null when this seat has already answered
 * it. The modal covers the board, so a seat with nothing left to decide must
 * not be left looking at a dialog it cannot dismiss.
 *
 * `answeredTurn` is the turn this seat last answered for, held by the caller.
 * PASSING SENDS NOTHING — a claim declined and a claim never made are the same
 * thing to the rules — so there is nothing on the server to read back, and the
 * caller's own record is the only one there is.
 */
export function openCharity(
  row: PublicRow | null, answeredTurn: number | null | undefined,
): CharityWindow | null {
  const window_ = row?.charity
  if (!window_) return null
  if (answeredTurn != null && answeredTurn === window_.turn) return null
  return window_
}

/** Whether a faction holds a seat in this match, by the public roster. */
export function seatedIn(row: PublicRow | null, faction: FactionId | null): boolean {
  if (!row || !faction) return false
  return row.players.some(p => p.faction === faction)
}

/**
 * What to say out loud when an auction settles.
 *
 * COMPOSED FROM THE PUBLIC ROW, by every client, which is the whole point.
 * This was once built by whichever client made the closing bid, out of the
 * response only that client received — so on six machines the winner alone saw
 * it, and the one seat that already knew was the only one told.
 *
 * THE WINNER AND THE PRICE, never the card. A line naming the card would hand
 * the table something no seat is entitled to, in the one place everybody reads.
 *
 * `nameOf` is passed in because the pretty name of a faction is a matter for
 * the screen — this module has no business importing a component to get it.
 */
export function winLines(
  last: LastAuction | null | undefined, nameOf: (f: FactionId) => string,
): string[] {
  if (!last) return []
  return last.awards.map(a => `${nameOf(a.winner)} wins a card for ${a.price} spice.`)
}
