/**
 * Bidding — the treachery auction.
 *
 * One card per player, auctioned one at a time, face down. Bidding runs
 * counter-clockwise from an opener that rotates a seat per card, raising or
 * passing, until everyone but one has passed.
 *
 * THE AUCTION NEVER SEES A CARD. Not once, anywhere in this file. It decides who
 * pays what for the Nth card of the auction; the caller deals the actual card
 * out of match_decks into the winner's match_secrets row afterwards. That is not
 * fastidiousness — the deck lives in a table with no read policy at all, and a
 * phase that handled card ids would have to carry them through `carry`, which is
 * written to a jsonb column every client can read. Card-blind, the phase cannot
 * leak what it does not have.
 *
 * The same goes for spice. A bid has to be checked against what the bidder
 * actually holds, and spice is per-seat secret, so it is passed IN to the one
 * function that needs it and never stored in the carry.
 *
 * WHAT THE PUBLIC STATE MAY SAY: whose turn it is, the standing bid and who made
 * it, who has passed, and every hand's SIZE. All of that is public at a real
 * table. What it may not say is what the card is, what anyone holds, or what
 * anyone can afford.
 *
 * The pauses use the Step pattern in ./phase.ts — a required stop with a
 * deadline, because a silent bidder passes rather than stalling the game.
 */
import { awaitingBy, settled } from './phase'
import type { Step } from './phase'
import type { FactionId } from '@/types/Dune/Faction'

/** The least anyone may open at. A pass is the alternative, not a bid of zero. */
export const MINIMUM_OPENING_BID = 1

/** How long a bidder has before silence passes for them. */
export const BID_SECONDS = 15

/**
 * The breath between one card closing and the next opening, in seconds.
 *
 * LONG ENOUGH TO READ A CARD, which five seconds was not. The winner has
 * something new in hand and a decision to make about the next card — whether
 * they still want it, and what they have left to want it with — and that is a
 * card to read rather than a result to glance at.
 *
 * It costs nobody bidding time: the next bidder's own window starts when this
 * ends, not when the last card closed.
 */
export const BETWEEN_CARDS_SECONDS = 15

/** What one player is being asked. PUBLIC — it names no card and no purse. */
export interface BidAsk {
  kind: 'treachery-bid'
  /** Which card of this auction, 0-based, and how many there are. */
  index: number
  cardCount: number
  /** The standing bid. Null before anyone has opened. */
  high: { faction: FactionId; spice: number } | null
  /** The least this player may bid. One more than the standing bid, or 1. */
  minimum: number
  /** Hand sizes, which are public at a table. Never contents. */
  hands: Readonly<Record<string, number>>
  /** When bidding on this card may begin. See AuctionCarry.pauseUntil. */
  pauseUntil?: number
}

export type BidAnswer =
  | { kind: 'pass' }
  | { kind: 'bid'; spice: number }

/** Who won what, and for how much. Card ids are the caller's to attach. */
export interface Award {
  index: number
  winner: FactionId
  price: number
}

export interface AuctionResult {
  turn: number
  awards: Award[]
  /** Indices never sold: the card everyone passed on, everything after it —
   *  an unbought card ends the phase, so the rest of the row is never offered
   *  — and any card that could not be offered at all. The caller discards
   *  them. */
  unsold: number[]
  /** Hand sizes after the auction. */
  hands: Record<string, number>
}

/**
 * Everything needed to resume. Serialisable, and public.
 *
 * No card, no spice, no deck. See the note at the top — this object is written
 * to matches.state and read by everyone.
 */
export interface AuctionCarry {
  turn: number
  /** Counter-clockwise seat order, rotated so [0] is the storm-relative first. */
  order: readonly FactionId[]
  hands: Record<string, number>
  limits: Readonly<Record<string, number>>
  cardCount: number
  /** Which card is up, 0-based. */
  index: number
  high: { faction: FactionId; spice: number } | null
  passed: FactionId[]
  /** Whose turn it is. */
  toAct: FactionId
  awards: Award[]
  unsold: number[]
  /**
   * When the next card may be bid on, if a card has just closed.
   *
   * A BREATH BETWEEN CARDS. Without it the next auction opens in the same
   * frame the last one settled: the seat that just won has a card it has not
   * looked at and is already being asked for a bid on another, and everyone
   * else sees the result flash past.
   *
   * A MOMENT, STAMPED BY THE CALLER, like every other deadline here — never a
   * duration counted here, or six clients would start counting at six slightly
   * different times. Absent when no card has just closed.
   */
  pauseUntil?: number
}

export type BidStep = Step<BidAsk, AuctionCarry, AuctionResult>

export type BidRefusal =
  | 'not-your-turn'
  | 'already-passed'
  | 'at-your-hand-limit'
  | 'below-the-minimum'
  | 'more-than-you-hold'

/**
 * The outcome of one answer.
 *
 * A refusal is a THIRD case rather than an error, because of who may see it. A
 * bid larger than the bidder's purse is refused privately — telling the table
 * would announce roughly how much they hold, which is the one thing bidding is
 * built to keep quiet. So the step comes back unchanged, the refusal comes back
 * beside it, and the caller sends the refusal to exactly one seat.
 *
 * The clock does NOT restart. A player can be refused twice and still be timed
 * out by the deadline they were already under, which is what stops a bad bid
 * being used to buy thinking time.
 */
export type BidOutcome =
  | { kind: 'ok'; step: BidStep }
  | { kind: 'refused'; refusal: BidRefusal; faction: FactionId; step: BidStep }

/**
 * How many cards this auction offers: one per player ALLOWED TO BID.
 *
 * Not one per player in the game. A player at their hand limit does not get a
 * card auctioned on their behalf, so the row shrinks — six players with two of
 * them full auctions four cards, and a table where everybody is full auctions
 * none at all rather than offering cards nobody may take.
 *
 * COUNTED ONCE, AT THE START, and then fixed. Hands grow during the auction as
 * cards are won, so a player under the limit when it begins can reach it partway
 * through; they simply stop bidding on what is left. Recounting per card would
 * make the size of the auction depend on its own outcome — buy a card, shrink
 * the row, and the card you just bought may have been the last one offered.
 *
 * Exported because the caller needs it BEFORE the auction exists: it has to draw
 * this many cards out of match_decks to put on offer. Deriving it here and
 * having the caller derive it again would be two spellings of one rule.
 */
export function cardsOnOffer(
  order: readonly FactionId[],
  hands: Readonly<Record<string, number>>,
  limits: Readonly<Record<string, number>>,
): number {
  return order.filter(f => (hands[f] ?? 0) < (limits[f] ?? 0)).length
}

/** A faction may bid only while it is under its hand limit. */
const underLimit = (c: Pick<AuctionCarry, 'hands' | 'limits'>, f: FactionId) =>
  (c.hands[f] ?? 0) < (c.limits[f] ?? 0)

/**
 * Everyone still able to take this card: under their limit and not yet passed.
 *
 * "At their limit must pass" is enforced here rather than by asking them and
 * rejecting the answer. A player who cannot bid is never asked, so the auction
 * does not stop on them and their silence costs nobody fifteen seconds.
 */
const contenders = (c: AuctionCarry): FactionId[] =>
  c.order.filter(f => underLimit(c, f) && !c.passed.includes(f))

/**
 * The next seat counter-clockwise from `from` that is still in the running.
 *
 * The high bidder is skipped: they do not raise themselves. When nobody else is
 * left, the caller reads that as the card being won rather than as a turn.
 */
function nextBidder(c: AuctionCarry, from: FactionId): FactionId | null {
  const live = contenders(c).filter(f => f !== c.high?.faction)
  if (live.length === 0) return null
  const n = c.order.length
  const at = c.order.indexOf(from)
  for (let i = 1; i <= n; i++) {
    const f = c.order[(at + i) % n]
    if (live.includes(f)) return f
  }
  return null
}

/**
 * Who opens card `index`.
 *
 * The opener rotates one seat per card, and the rotation is computed from the
 * index rather than carried forward — a counter that advanced on each card would
 * drift the moment one was skipped, and this cannot. The reset each turn is
 * free: `order` is rebuilt from the storm every turn, so index 0 is always the
 * storm-relative first player.
 *
 * Then it walks to the next seat under its limit, which is the "or the next
 * counter-clockwise player under their limit" half of the rule. Null when
 * nobody in the game can take a card.
 */
function openerFor(c: Pick<AuctionCarry, 'order' | 'hands' | 'limits'>, index: number): FactionId | null {
  const n = c.order.length
  if (n === 0) return null
  for (let i = 0; i < n; i++) {
    const f = c.order[(index + i) % n]
    if (underLimit(c, f)) return f
  }
  return null
}

const askFor = (c: AuctionCarry): BidAsk => ({
  kind: 'treachery-bid',
  index: c.index,
  cardCount: c.cardCount,
  high: c.high,
  minimum: c.high ? c.high.spice + 1 : MINIMUM_OPENING_BID,
  hands: c.hands,
  pauseUntil: c.pauseUntil,
})

/**
 * Open the next card, or finish.
 *
 * Called at the start and after every card closes. A card with no possible
 * bidder is not offered at all — it goes straight to unsold, which is what
 * happens when every hand in the game is full.
 */
function openCard(c: AuctionCarry, closesAt: number): BidStep {
  let next = c
  for (;;) {
    if (next.index >= next.cardCount) {
      return settled({
        turn: next.turn,
        awards: next.awards,
        unsold: next.unsold,
        hands: next.hands,
      })
    }
    const opener = openerFor(next, next.index)
    if (opener) {
      // pauseUntil rides on the carry closeCard built, so it survives into the
      // card being opened and is cleared by the next close that has no pause.
      const fresh: AuctionCarry = { ...next, high: null, passed: [], toAct: opener }
      return awaitingBy([opener], askFor(fresh), fresh, closesAt)
    }
    // Nobody may bid. Discard it and try the next — the loop rather than
    // recursion because a six-card auction with every hand full would otherwise
    // be six frames deep for no reason.
    next = { ...next, unsold: [...next.unsold, next.index], index: next.index + 1 }
  }
}

/**
 * Award the current card and move on.
 *
 * `pause` is the caller's two stamps for the NEXT card: when it may be bid on,
 * and when its own window then shuts. Both come in rather than being computed,
 * so the pause does not quietly eat the next bidder's time — their fifteen
 * seconds start when the pause ends, not when the last card closed.
 */
function closeCard(
  c: AuctionCarry, won: Award | null, closesAt: number,
  pause?: { until: number; thenClosesAt: number },
): BidStep {
  // A CARD NOBODY BUYS ENDS THE PHASE, not just the card. Every faction
  // passing is the table saying it is done shopping, and the rest of the row
  // is never offered — it goes unsold with the card nobody wanted. This used
  // to discard the one card and open the next, which asked six people to sit
  // through auctions the rules had already called off.
  const after: AuctionCarry = won
    ? {
      ...c,
      awards: [...c.awards, won],
      hands: { ...c.hands, [won.winner]: (c.hands[won.winner] ?? 0) + 1 },
      index: c.index + 1,
      pauseUntil: pause?.until,
    }
    : {
      ...c,
      unsold: [
        ...c.unsold,
        ...Array.from({ length: c.cardCount - c.index }, (_, k) => c.index + k),
      ],
      index: c.cardCount,
      pauseUntil: undefined,
    }
  return openCard(after, pause ? pause.thenClosesAt : closesAt)
}

/**
 * Start the auction.
 *
 * `order` must already be counter-clockwise from the storm-relative first
 * player — see firstPlayerAfterStorm in ./storm.ts. Rotating it is the caller's
 * job because the storm is the caller's to read, and an auction that re-derived
 * it would need the board.
 *
 * How many cards are on offer is DERIVED, not passed in — see cardsOnOffer. It
 * was an argument at first, which put the rule in whoever called this rather
 * than in the auction, and the first thing that happened was that it was wrong.
 */
export function beginAuction(input: {
  turn: number
  order: readonly FactionId[]
  hands: Readonly<Record<string, number>>
  limits: Readonly<Record<string, number>>
  closesAt: number
}): BidStep {
  const carry: AuctionCarry = {
    turn: input.turn,
    order: [...input.order],
    hands: { ...input.hands },
    limits: { ...input.limits },
    cardCount: cardsOnOffer(input.order, input.hands, input.limits),
    index: 0,
    high: null,
    passed: [],
    toAct: input.order[0] ?? ('' as FactionId),
    awards: [],
    unsold: [],
  }
  return openCard(carry, input.closesAt)
}

/**
 * One player bids or passes.
 *
 * `spiceHeld` is what the bidder actually has, supplied by the caller from the
 * secret store. It is a number rather than a table of everyone's, so a bug here
 * cannot leak a rival's purse into a comparison — the function is given exactly
 * one seat's worth of the thing it is checking.
 */
export function answerBid(
  carry: AuctionCarry,
  from: FactionId,
  answer: BidAnswer,
  spiceHeld: number,
  closesAt: number,
  /**
   * The two stamps for the next card, when this answer closes one.
   *
   * Omitted, cards follow one another with no gap — which is what a test or a
   * replay wants, and what this did before the pause existed.
   */
  pause?: { until: number; thenClosesAt: number },
): BidOutcome {
  const refuse = (refusal: BidRefusal): BidOutcome =>
    ({ kind: 'refused', refusal, faction: from, step: awaitingBy([carry.toAct], askFor(carry), carry, closesAt) })

  // NOT YET. A card that has just closed leaves a moment for the table to see
  // what it went for, and the seat that won it to look at what it bought. The
  // CALLER decides the moment has passed — this module owns no clock — and
  // supplies a carry whose pauseUntil it has already checked.
  if (from !== carry.toAct) return refuse('not-your-turn')
  if (carry.passed.includes(from)) return refuse('already-passed')
  if (!underLimit(carry, from)) return refuse('at-your-hand-limit')

  if (answer.kind === 'bid') {
    const minimum = carry.high ? carry.high.spice + 1 : MINIMUM_OPENING_BID
    if (!Number.isInteger(answer.spice) || answer.spice < minimum) return refuse('below-the-minimum')
    // AGAINST WHAT THE CALLER SAYS IS HELD, which is now the truth between
    // cards as well as between auctions.
    //
    // This used to subtract what the seat had already promised in this auction,
    // because nothing was paid until the whole auction settled and the stored
    // purse still showed spice already spoken for. Payment happens as each card
    // closes now — see settleCard — so the purse handed in has already lost it,
    // and subtracting again would charge the same spice twice and refuse bids
    // the seat can plainly afford.
    //
    // PRIVATE. Refusing this out loud would tell the table the bidder holds
    // less than they just asked for, which is most of what they were hiding.
    if (answer.spice > spiceHeld) return refuse('more-than-you-hold')

    const raised: AuctionCarry = { ...carry, high: { faction: from, spice: answer.spice } }
    const next = nextBidder(raised, from)
    // Nobody left to answer the raise, so it stands.
    if (!next) {
      return { kind: 'ok', step: closeCard(raised, { index: raised.index, winner: from, price: answer.spice }, closesAt, pause) }
    }
    return { kind: 'ok', step: awaitingBy([next], askFor({ ...raised, toAct: next }), { ...raised, toAct: next }, closesAt) }
  }

  const passedNow: AuctionCarry = { ...carry, passed: [...carry.passed, from] }
  const next = nextBidder(passedNow, from)
  if (!next) {
    // Either the standing bid has outlasted everyone, or nobody ever bid.
    return {
      kind: 'ok',
      step: passedNow.high
        ? closeCard(passedNow, { index: passedNow.index, winner: passedNow.high.faction, price: passedNow.high.spice }, closesAt, pause)
        : closeCard(passedNow, null, closesAt, pause),
    }
  }
  return { kind: 'ok', step: awaitingBy([next], askFor({ ...passedNow, toAct: next }), { ...passedNow, toAct: next }, closesAt) }
}

/**
 * The answer a silent bidder gives.
 *
 * Named rather than left to each caller to remember, because "silence passes" is
 * a rule and a caller that defaulted to something else — or to nothing — would
 * stall the phase on a player who has walked away from their machine.
 */
export const silenceAnswers: BidAnswer = { kind: 'pass' }
