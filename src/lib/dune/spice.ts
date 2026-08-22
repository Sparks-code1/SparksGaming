/**
 * The spice ledger.
 *
 * Spice is per-seat and hidden — it lives in match_secrets beside the hands, for
 * the same reason: everything in matches.state reaches every client, and a purse
 * everyone can read removes most of what bidding is for.
 *
 * SPICE NEVER LEAVES A PURSE WITHOUT ARRIVING SOMEWHERE. That is the whole point
 * of this module and it is enforced by the shape rather than by care: a movement
 * is a triple — from, to, amount — and applying one subtracts and adds in the
 * same step. There is no "spend" and no "grant"; both are a move with the bank
 * on one end. A function that only decremented could not be written here without
 * inventing a second concept, which is the point.
 *
 * THE BANK IS A HOLDER, not an absence. `from: 'bank'` is spice entering the
 * game and `to: 'bank'` is spice leaving it, and naming it makes those two
 * events auditable instead of being the times a balance changed for no recorded
 * reason. It holds no balance of its own — the Spice Bank in Dune is not a
 * finite pot — so it is deliberately absent from `purses`.
 *
 * A BATCH IS ALL OR NOTHING. One action can move spice several ways at once, and
 * a batch that half-applied would leave the game with spice that came from
 * nowhere. Refusing the whole batch is the only safe failure, and it is why the
 * result is a discriminated union rather than a thrown error: the caller has to
 * decide what to tell whom, and an overdraft is private to the payer.
 */
import type { FactionId } from '@/types/Dune/Faction'

/** The Spice Bank. Not a faction, not a balance — an end of a movement. */
export const BANK = 'bank'
export type SpiceHolder = FactionId | typeof BANK

/** What every seat holds. The bank is not in here, and cannot be. */
export type Purses = Readonly<Record<string, number>>

/**
 * Why spice moved.
 *
 * Recorded on the move rather than inferred from context, because the ledger
 * outlives the action that caused it: a purse that is short by three at the end
 * of a turn is a question somebody will ask, and "which rule did this" has to be
 * answerable without replaying the turn.
 */
export type SpiceReason =
  | 'treachery-bid'
  | 'choam-charity'
  | 'shipment'
  | 'revival'
  | 'spice-collection'
  | 'setup'

export interface SpiceMove {
  from: SpiceHolder
  to: SpiceHolder
  amount: number
  reason: SpiceReason
}

export type SpiceRefusal =
  | 'not-a-whole-number'
  | 'not-positive'
  | 'same-holder'
  | 'insufficient-spice'

export type SpiceResult =
  | { ok: true; purses: Record<string, number>; applied: readonly SpiceMove[] }
  | { ok: false; refusal: SpiceRefusal; move: SpiceMove }

/** What a seat holds. Absent is zero — a seat with no row has no spice, which
 *  is a real state at setup rather than a missing one. */
export const heldBy = (purses: Purses, who: SpiceHolder): number =>
  who === BANK ? Number.POSITIVE_INFINITY : (purses[who] ?? 0)

/**
 * Apply a batch, or refuse it whole.
 *
 * Moves are applied IN ORDER against a running balance, so a seat that pays five
 * and is paid three in the same batch must have had the five when it paid. The
 * alternative — netting the batch first — would let a purse go negative in the
 * middle and come back, which is a loan nobody agreed to.
 */
export function applySpiceMoves(purses: Purses, moves: readonly SpiceMove[]): SpiceResult {
  const next: Record<string, number> = { ...purses }

  for (const move of moves) {
    if (!Number.isInteger(move.amount)) return { ok: false, refusal: 'not-a-whole-number', move }
    if (move.amount <= 0) return { ok: false, refusal: 'not-positive', move }
    if (move.from === move.to) return { ok: false, refusal: 'same-holder', move }
    if (move.from !== BANK && (next[move.from] ?? 0) < move.amount) {
      return { ok: false, refusal: 'insufficient-spice', move }
    }
    // Both halves, always, in one step. This is the invariant the module exists
    // for and it is why there is no function that does only one of them.
    if (move.from !== BANK) next[move.from] = (next[move.from] ?? 0) - move.amount
    if (move.to !== BANK) next[move.to] = (next[move.to] ?? 0) + move.amount
  }

  return { ok: true, purses: next, applied: moves }
}

/**
 * How much the table's spice changes by, given a batch.
 *
 * Everything between seats nets to zero; only the bank's ends move the total.
 * For asserting conservation, which cannot be checked by summing purses alone —
 * a batch that paid the bank SHOULD reduce the total, and a check that demanded
 * the sum never change would be wrong about the game rather than about the code.
 */
export function netFromBank(moves: readonly SpiceMove[]): number {
  return moves.reduce((n, m) =>
    n + (m.from === BANK ? m.amount : 0) - (m.to === BANK ? m.amount : 0), 0)
}

/**
 * Who is paid for a treachery card.
 *
 * THE EMPEROR COLLECTS. Whenever any other faction pays for a treachery card,
 * the spice goes to them instead of the bank. A BASIC-game rule — it sits in
 * `abilities.bidding`, not in `advanced` — so it applies from the first game
 * anybody plays, and forgetting it is not a missing advanced option but a
 * mis-scored one.
 *
 * AT FULL PRICE. The amount is the winning bid, untouched. The Emperor's own
 * text says they may not discount the price, and the way to be sure of that is
 * that there is nowhere here for a discount to be applied: the price comes in
 * and goes out.
 *
 * Two cases where it does not apply, and both are the same case really — there
 * has to be somebody else to pay. The Emperor buying a card pays the bank, not
 * themselves; and with no Emperor at the table everyone pays the bank.
 */
export function payForTreachery(input: {
  winner: FactionId
  price: number
  /** Who is in the game. The Emperor only collects if they are playing. */
  seated: readonly FactionId[]
}): SpiceMove[] {
  const { winner, price, seated } = input
  if (price <= 0) return []
  const emperorPlaying = seated.includes('emperor')
  const to: SpiceHolder = emperorPlaying && winner !== 'emperor' ? 'emperor' : BANK
  return [{ from: winner, to, amount: price, reason: 'treachery-bid' }]
}

/**
 * Every payment an auction owes, in the order the cards were won.
 *
 * Takes the awards rather than the auction, so this module never has to know
 * what a Step is — and so the auction, which is card-blind and money-blind,
 * stays that way.
 */
export function payForAuction(
  awards: readonly { winner: FactionId; price: number }[],
  seated: readonly FactionId[],
): SpiceMove[] {
  return awards.flatMap(a => payForTreachery({ winner: a.winner, price: a.price, seated }))
}
