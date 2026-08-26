/**
 * Turning a finished auction into writes.
 *
 * The auction is card-blind and money-blind: it decides who owes what for the
 * Nth card and nothing else. This is where that meets the cards and the purses.
 *
 * A CARD CANNOT BE DEALT WITHOUT PAYMENT, AND NOTHING IS PAID FOR WITHOUT
 * ARRIVING. Both halves are computed here, together, and refused together. That
 * is the entire reason this is one function rather than two called in sequence:
 * two functions can succeed and fail independently, and the caller then has a
 * card in a hand with no spice moved, or spice moved for a card that never
 * arrived. Neither is visible from the outside afterwards — a hand is secret and
 * a purse is secret, so the mistake would surface as somebody quietly richer
 * several turns later.
 *
 * The caller writes what comes back in ONE apply_match_write. This function is
 * pure and does not know what a database is; what it guarantees is that the
 * writes it hands over are consistent with each other, so the transaction has
 * something worth being atomic about.
 *
 * EVERY DRAWN CARD IS ACCOUNTED FOR EXACTLY ONCE — dealt to a winner, or
 * discarded. That is checked here rather than assumed, because the auction
 * indexes cards and this maps indexes back to them: an off-by-one loses a card
 * out of the game, and a deck that is quietly one short is not a thing anybody
 * notices until the reshuffle.
 */
import { applySpiceMoves, payForAuction } from './spice'
import type { Purses, SpiceMove } from './spice'
import type { AuctionResult } from './bidding'
import type { FactionId } from '@/types/Dune/Faction'

export interface AuctionWrites {
  /** Per seat, the whole new hand and the whole new purse. Absolute, not a
   *  delta: the caller upserts a secrets row, and a delta would need the caller
   *  to re-read and re-apply, which is a second place to get it wrong. */
  secrets: Record<string, { hand: string[]; spice: number }>
  /** Cards nobody bought, for the PUBLIC discard. Face up is the rule. */
  discard: string[]
  /** What moved and why, for the log. */
  moves: readonly SpiceMove[]
}

export type SettlementRefusal =
  | 'wrong-number-of-cards'
  | 'a-card-was-lost'
  | 'a-winner-cannot-pay'
  | 'not-enough-bonus-cards'

/**
 * The faction that takes a second card with each one it wins.
 *
 * BASIC PLAY, not advanced. Their advanced rule is captured leaders; this one
 * applies from the first game, and leaving it out quietly made them an ordinary
 * bidder for every auction played so far.
 *
 * CAPPED BY THE HAND LIMIT, which for them is eight. Holding seven and winning
 * one, they get the one they won and no more — the second card would be a ninth
 * they are not allowed to hold.
 */
export const BONUS_FACTION: FactionId = 'harkonnen'

/** How many extra cards the bonus faction may take from this auction. */
export function bonusCardsDue(
  awards: readonly { winner: FactionId }[],
  handAfter: number,
  limit: number,
): number {
  const won = awards.filter(a => a.winner === BONUS_FACTION).length
  // Room is measured AFTER the auction's own cards are counted: winning two and
  // holding six leaves the limit reached, and no bonus at all.
  return Math.max(0, Math.min(won, limit - handAfter))
}

export type SettlementResult =
  | { ok: true; writes: AuctionWrites }
  | { ok: false; refusal: SettlementRefusal; detail: string }

/**
 * @param result   what the auction decided
 * @param cards    the cards drawn for it, index-aligned with the auction's own
 *                 indices — cards[3] is the card auctioned as index 3
 * @param hands    every seat's hand before
 * @param purses   every seat's spice before
 * @param seated   who is in the game, so the Emperor's redirect knows
 * @param bonus    cards drawn for the bonus faction, exactly as many as
 *                 bonusCardsDue says — the caller draws them, because only it
 *                 can take them off the pile
 * @param limits   hand limits, so the bonus stops at one
 */
export function settleAuction(input: {
  result: AuctionResult
  cards: readonly string[]
  hands: Readonly<Record<string, readonly string[]>>
  purses: Purses
  seated: readonly FactionId[]
  bonus?: readonly string[]
  limits?: Readonly<Record<string, number>>
}): SettlementResult {
  const { result, cards, hands, purses, seated } = input
  const bonus = input.bonus ?? []

  // The auction was told how many cards were on offer; this must be that many.
  // A mismatch means the caller drew a different number from the one bid on,
  // and every index below would be pointing at the wrong card.
  const offered = result.awards.length + result.unsold.length
  if (cards.length !== offered) {
    return {
      ok: false,
      refusal: 'wrong-number-of-cards',
      detail: `the auction settled ${offered} card(s) and ${cards.length} were drawn`,
    }
  }

  // Every index exactly once, dealt or discarded. Built as a set rather than
  // trusted, because the two lists come from different paths through the
  // auction and nothing else compares them.
  const claimed = [...result.awards.map(a => a.index), ...result.unsold].sort((a, b) => a - b)
  const expected = cards.map((_, i) => i)
  if (JSON.stringify(claimed) !== JSON.stringify(expected)) {
    return {
      ok: false,
      refusal: 'a-card-was-lost',
      detail: `indices accounted for were [${claimed}], expected [${expected}]`,
    }
  }

  // THE PAYMENTS FIRST. If anyone cannot pay, nothing is dealt — refusing after
  // handing out cards would be the exact failure this function exists to
  // prevent, and the order is what makes that impossible rather than unlikely.
  const moves = payForAuction(result.awards, seated)
  const paid = applySpiceMoves(purses, moves)
  if (!paid.ok) {
    return {
      ok: false,
      refusal: 'a-winner-cannot-pay',
      detail: `${paid.move.from} owes ${paid.move.amount} and cannot pay it (${paid.refusal})`,
    }
  }

  // Only now the cards. Every seat that gained one or paid one gets a row; a
  // seat that did neither is left out, so the caller upserts nothing for them.
  const secrets: Record<string, { hand: string[]; spice: number }> = {}
  const touch = (who: string) => {
    if (!secrets[who]) {
      secrets[who] = { hand: [...(hands[who] ?? [])], spice: paid.purses[who] ?? 0 }
    }
    return secrets[who]
  }
  for (const award of result.awards) touch(award.winner).hand.push(cards[award.index])

  // ── the second card ────────────────────────────────────────────────────
  // The bonus faction takes another with each one they win, up to their limit.
  // Counted off the hand they end the auction with, so winning two while
  // holding six earns nothing: the limit is reached by the cards they bid for.
  {
    const limit = input.limits?.[BONUS_FACTION] ?? Infinity
    const handAfter = (secrets[BONUS_FACTION]?.hand ?? hands[BONUS_FACTION] ?? []).length
    const due = bonusCardsDue(result.awards, handAfter, limit)
    if (due > bonus.length) {
      return {
        ok: false,
        refusal: 'not-enough-bonus-cards',
        detail: `${BONUS_FACTION} is due ${due} extra card(s) and ${bonus.length} were supplied`,
      }
    }
    for (let i = 0; i < due; i++) touch(BONUS_FACTION).hand.push(bonus[i])
  }
  // A seat whose only part in this was being paid — the Emperor collecting —
  // still needs its purse written, or the spice arrives nowhere.
  for (const move of moves) {
    if (move.from !== 'bank') touch(move.from)
    if (move.to !== 'bank') touch(move.to)
  }

  return {
    ok: true,
    writes: { secrets, discard: result.unsold.map(i => cards[i]), moves },
  }
}
