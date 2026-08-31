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
import { allyShare, applySpiceMoves, payForAuction } from './spice'
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
 * One card, paid for and dealt, the moment it is won.
 *
 * AT THE TABLE THE SPICE MOVES WHEN THE HAMMER FALLS. Settling the whole
 * auction at the end meant a winner's purse still read full while they bid on
 * the next card — they could not see what they had left to bid WITH, which is
 * most of what a player needs to know between cards.
 *
 * This is the primitive; settleAuction folds it over every award, so there is
 * one implementation of who pays whom and only one place for it to be wrong.
 *
 * @param award   the card just won, with its price
 * @param card    the card at that index
 * @param hands   every seat's hand as it stands NOW — after any earlier card
 * @param purses  every seat's spice as it stands NOW, likewise
 * @param bonus   cards for the bonus faction, as many as bonusCardsDue says
 */
export function settleCard(input: {
  award: { index: number; winner: FactionId; price: number }
  card: string
  hands: Readonly<Record<string, readonly string[]>>
  purses: Purses
  seated: readonly FactionId[]
  bonus?: readonly string[]
  limits?: Readonly<Record<string, number>>
  /**
   * How many cards the deck could actually give for the bonus. The free card
   * is "if there are cards left": an exhausted deck DEGRADES the advantage —
   * fewer cards, or none — and never refuses the sale that closed. Refusing
   * wedged a live auction: the pass that closed a Harkonnen win could not be
   * honoured while every bid still could. Omitted, the deck is presumed deep.
   */
  deckHolds?: number
  /** The winner's ally, whose purse stands behind the winner's — or null. */
  ally?: FactionId | null
  /** A seat holding the Karama free-card entitlement: when THEY are the
   *  winner, nothing is paid to anyone — the card is simply taken. */
  freeFor?: FactionId | null
}): SettlementResult {
  const { award, card, hands, purses, seated } = input
  const bonus = input.bonus ?? []

  // THE PAYMENT FIRST. If the winner cannot pay, nothing is dealt — refusing
  // after handing over a card is the exact failure this guards against, and
  // doing it in this order makes that impossible rather than unlikely.
  // THE ALLY'S PURSE STANDS BEHIND THE WINNER'S: own spice first, the
  // ally's only for what is left, in the same settlement. A move from a seat
  // to itself — the Emperor collecting from an allied buyer out of the
  // Emperor's own purse — nets nothing and is dropped rather than booked.
  // A KARAMA-FREE WINNER pays nobody at all: no move is booked, and the
  // card is simply taken.
  const moves = (award.winner === input.freeFor
    ? [] : payForAuction([award], seated)).flatMap(m => {
    if (m.from !== award.winner || !input.ally) return [m]
    const share = allyShare(m.amount, purses[award.winner] ?? 0)
    if (share.ally <= 0) return [m]
    return [
      ...(share.own > 0 ? [{ ...m, amount: share.own }] : []),
      { ...m, from: input.ally, amount: share.ally },
    ]
  }).filter(m => m.from !== m.to)
  const paid = applySpiceMoves(purses, moves)
  if (!paid.ok) {
    return {
      ok: false,
      refusal: 'a-winner-cannot-pay',
      detail: `${paid.move.from} owes ${paid.move.amount} and cannot pay it (${paid.refusal})`,
    }
  }

  const secrets: Record<string, { hand: string[]; spice: number }> = {}
  const touch = (who: string) => {
    if (!secrets[who]) {
      secrets[who] = { hand: [...(hands[who] ?? [])], spice: paid.purses[who] ?? 0 }
    }
    return secrets[who]
  }

  touch(award.winner).hand.push(card)
  // A seat whose only part was being paid — the Emperor collecting — still
  // needs its purse written, or the spice arrives nowhere.
  for (const move of moves) {
    if (move.from !== 'bank') touch(move.from)
    if (move.to !== 'bank') touch(move.to)
  }

  // The bonus faction's second card, counted off the hand they now hold.
  const limit = input.limits?.[BONUS_FACTION] ?? Infinity
  const handAfter = (secrets[BONUS_FACTION]?.hand ?? hands[BONUS_FACTION] ?? []).length
  const due = Math.min(
    bonusCardsDue([award], handAfter, limit),
    input.deckHolds ?? Infinity)
  if (due > bonus.length) {
    return {
      ok: false,
      refusal: 'not-enough-bonus-cards',
      detail: `${BONUS_FACTION} is due ${due} extra card(s) and ${bonus.length} were supplied`,
    }
  }
  for (let i = 0; i < due; i++) touch(BONUS_FACTION).hand.push(bonus[i])

  return { ok: true, writes: { secrets, discard: [], moves } }
}

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

  // ── card by card, in the order they were won ─────────────────────────────
  // FOLDED OVER settleCard rather than repeating it. The server settles each
  // card the moment it closes, so a winner's purse is right before they bid on
  // the next one; this path exists for callers holding a whole finished
  // auction — a test, a replay — and it must reach the same answer, which it
  // can only be relied on to do by running the same code.
  //
  // The running hands and purses are threaded through, so a second card a seat
  // wins is paid for out of what the first one left them.
  let runningHands: Record<string, readonly string[]> = { ...hands }
  let runningPurses: Purses = { ...purses }
  const secrets: Record<string, { hand: string[]; spice: number }> = {}
  const moves: SpiceMove[] = []
  let bonusTaken = 0

  for (const award of result.awards) {
    const before = (runningHands[BONUS_FACTION] ?? []).length
    const one = settleCard({
      award,
      card: cards[award.index],
      hands: runningHands,
      purses: runningPurses,
      seated,
      // The bonus cards not yet used, so a second award takes the ones after
      // the first's rather than dealing the same card twice.
      bonus: bonus.slice(bonusTaken),
      limits: input.limits,
    })
    if (!one.ok) return one

    const bonusHand = one.writes.secrets[BONUS_FACTION]?.hand
    if (bonusHand) {
      const ownCard = award.winner === BONUS_FACTION ? 1 : 0
      bonusTaken += Math.max(0, bonusHand.length - before - ownCard)
    }

    for (const [who, write] of Object.entries(one.writes.secrets)) {
      secrets[who] = write
      runningHands = { ...runningHands, [who]: write.hand }
      runningPurses = { ...runningPurses, [who]: write.spice }
    }
    moves.push(...one.writes.moves)
  }

  return {
    ok: true,
    writes: { secrets, discard: result.unsold.map(i => cards[i]), moves },
  }
}
