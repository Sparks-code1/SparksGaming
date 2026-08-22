// Bidding: the treachery auction.
//
// Two things are being checked and they are not the same thing. The RULES —
// who opens, who may raise, when a card closes — and the PRIVACY, which is that
// nothing this phase writes down names a card, a purse or a deck. The second is
// the one no amount of playing the game would reveal, because a leak in the
// carry looks exactly like a correct auction from every seat.
import {
  beginAuction, answerBid, silenceAnswers, MINIMUM_OPENING_BID,
} from '@/lib/dune/bidding'
import type { AuctionCarry, BidStep, BidOutcome } from '@/lib/dune/bidding'
import { drawTreachery, discardUnsold } from '@/lib/dune/treacheryDeck'
import { isAwaiting, deadlinePassed } from '@/lib/dune/phase'
import { FACTIONS, FACTION_IDS } from '@/data/dune/factions'
import type { FactionId } from '@/types/Dune/Faction'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

const ORDER: FactionId[] = ['atreides', 'harkonnen', 'fremen', 'emperor']
const LIMITS = { atreides: 4, harkonnen: 8, fremen: 4, emperor: 4 }
const EMPTY = { atreides: 0, harkonnen: 0, fremen: 0, emperor: 0 }
const DEADLINE = 15_000

const start = (over: Partial<Parameters<typeof beginAuction>[0]> = {}) =>
  beginAuction({
    turn: 1, order: ORDER, hands: EMPTY, limits: LIMITS, cardCount: 4,
    closesAt: DEADLINE, ...over,
  })

/** The carry of a step that is waiting, or a loud failure. */
const carryOf = (s: BidStep): AuctionCarry => {
  if (!isAwaiting(s)) throw new Error('expected the auction to be waiting, and it has settled')
  return s.carry
}
const askOf = (s: BidStep) => {
  if (!isAwaiting(s)) throw new Error('expected the auction to be waiting, and it has settled')
  return s.ask
}
const stepOf = (o: BidOutcome) => o.step

/** Bid or pass without repeating the purse and the deadline every time. */
const act = (s: BidStep, from: FactionId, answer: Parameters<typeof answerBid>[2], purse = 20) =>
  answerBid(carryOf(s), from, answer, purse, DEADLINE)
const bid = (s: BidStep, from: FactionId, spice: number, purse = 20) =>
  act(s, from, { kind: 'bid', spice }, purse)
const passes = (s: BidStep, from: FactionId) => act(s, from, { kind: 'pass' })

// ── who opens, and which way it goes round ─────────────────────────────────
check('the first card opens with the storm-relative first player',
  carryOf(start()).toAct, 'atreides')
check('...and the ask names the card and how many there are',
  [askOf(start()).index, askOf(start()).cardCount], [0, 4])
check('the opening minimum is one, not zero — a pass is the alternative',
  askOf(start()).minimum, MINIMUM_OPENING_BID)

// Bidding goes counter-clockwise, which is the order as given.
{
  let s = start()
  s = stepOf(passes(s, 'atreides'))
  check('a pass moves to the next seat counter-clockwise', carryOf(s).toAct, 'harkonnen')
  s = stepOf(passes(s, 'harkonnen'))
  check('...and on round', carryOf(s).toAct, 'fremen')
}

// ── a card is won when everyone else has passed ───────────────────────────
{
  let s = start()
  s = stepOf(bid(s, 'atreides', 3))
  check('a bid does not end the card while others may raise', carryOf(s).toAct, 'harkonnen')
  check('...and the standing bid is public', askOf(s).high, { faction: 'atreides', spice: 3 })
  check('...so the next raise must beat it', askOf(s).minimum, 4)
  s = stepOf(passes(s, 'harkonnen'))
  s = stepOf(passes(s, 'fremen'))
  check('the high bidder is not asked to raise themselves', carryOf(s).toAct, 'emperor')
  s = stepOf(passes(s, 'emperor'))
  check('the card closes and the next one opens', carryOf(s).index, 1)
  check('...awarded to the last bidder standing',
    carryOf(s).awards, [{ index: 0, winner: 'atreides', price: 3 }])
  check('...and their hand grew by one', carryOf(s).hands.atreides, 1)
}

// A winner who is NOT first in the order. Every other case here is won by
// order[0], and a sabotage that awarded the card to order[0] instead of to the
// high bidder passed all of them — the right answer for the wrong reason.
{
  let s = start()
  s = stepOf(passes(s, 'atreides'))
  s = stepOf(bid(s, 'harkonnen', 2))
  s = stepOf(passes(s, 'fremen'))
  s = stepOf(passes(s, 'emperor'))
  check('the card goes to the bidder, not to the head of the order',
    carryOf(s).awards, [{ index: 0, winner: 'harkonnen', price: 2 }])
  check('...and it is their hand that grew',
    [carryOf(s).hands.harkonnen, carryOf(s).hands.atreides], [1, 0])
}
// The same for the other way a card closes: a raise nobody is left to answer.
{
  let s = start({ hands: { atreides: 4, harkonnen: 0, fremen: 4, emperor: 4 } })
  check('the only eligible player is not the head of the order', carryOf(s).toAct, 'harkonnen')
  s = stepOf(bid(s, 'harkonnen', 1))
  check('...and wins on the unanswerable-raise path',
    carryOf(s).awards, [{ index: 0, winner: 'harkonnen', price: 1 }])
}

// ── the opener rotates one seat per card, and resets each turn ────────────
{
  let s = start()
  const openers: string[] = []
  for (let card = 0; card < 4; card++) {
    openers.push(carryOf(s).toAct)
    for (const f of ORDER) {
      if (!isAwaiting(s)) break
      s = stepOf(passes(s, carryOf(s).toAct))
      void f
    }
  }
  check('each card opens one seat further round', openers,
    ['atreides', 'harkonnen', 'fremen', 'emperor'])
  check('...and nobody bid, so every card is unsold',
    !isAwaiting(s) ? s.result.unsold : 'still awaiting', [0, 1, 2, 3])
}
// The reset is the caller rebuilding `order` from the storm each turn, so a
// fresh auction always opens at index 0 of whatever order it was handed.
check('a new turn opens at the head of its own order',
  carryOf(start({ turn: 2, order: ['fremen', 'emperor', 'atreides', 'harkonnen'] })).toAct,
  'fremen')

// ── passing on one card does not exclude you from the next ────────────────
{
  let s = start()
  s = stepOf(passes(s, 'atreides'))
  s = stepOf(bid(s, 'harkonnen', 1))
  s = stepOf(passes(s, 'fremen'))
  s = stepOf(passes(s, 'emperor'))
  check('the second card is open to the player who passed on the first',
    carryOf(s).passed.includes('atreides'), false)
  check('...and they may bid on it',
    stepOf(bid(s, carryOf(s).toAct, 2)).status, 'awaiting')
}

// ── the hand limit ────────────────────────────────────────────────────────
// At the limit a player must pass, and the way that is implemented matters:
// they are never ASKED, so the auction does not stop on them for fifteen
// seconds before they are made to pass.
{
  const s = start({ hands: { ...EMPTY, atreides: 4 } })
  check('a player at their limit does not open', carryOf(s).toAct, 'harkonnen')
  check('...and is not among those waited on', isAwaiting(s) ? s.from : [], ['harkonnen'])
  check('a bid from them is refused',
    (answerBid(carryOf(s), 'atreides', { kind: 'bid', spice: 5 }, 20, DEADLINE) as
      { refusal?: string }).refusal, 'not-your-turn')
}
// Eight for the Harkonnen, and it comes from the faction data rather than a
// number written here — the whole reason handLimit is a field.
// Stated as the RULE rather than as a list in faction order. The first attempt
// was a positional array and failed because FACTION_IDS is not in the order I
// assumed — which would have been a real failure reported as a data error, and
// the position is not the thing being claimed anyway.
check('the Harkonnen hold eight', FACTIONS.harkonnen?.handLimit, 8)
check('...and everyone else four',
  FACTION_IDS.filter(id => id !== 'harkonnen').map(id => FACTIONS[id]?.handLimit),
  [4, 4, 4, 4, 4])
check('...with no faction lacking one',
  FACTION_IDS.filter(id => typeof FACTIONS[id]?.handLimit !== 'number'), [])
{
  const s = start({ hands: { ...EMPTY, harkonnen: 5 }, limits: LIMITS })
  check('the Harkonnen still bid at five cards, where anyone else could not',
    carryOf(stepOf(passes(s, 'atreides'))).toAct, 'harkonnen')
}
// Every hand full: no card can be sold, and the auction must not hang asking
// somebody who is forbidden to answer.
{
  const s = start({ hands: { atreides: 4, harkonnen: 8, fremen: 4, emperor: 4 } })
  check('with every hand full the auction settles at once', s.status, 'settled')
  check('...and every card is unsold',
    !isAwaiting(s) ? s.result.unsold : null, [0, 1, 2, 3])
}

// ── a bid beyond your spice is refused, and refused PRIVATELY ─────────────
{
  const s = start()
  const out = bid(s, 'atreides', 9, 5)
  check('a bid larger than the purse is refused', out.kind, 'refused')
  check('...naming the reason',
    out.kind === 'refused' ? out.refusal : null, 'more-than-you-hold')
  check('...and only the bidder', out.kind === 'refused' ? out.faction : null, 'atreides')
  // The step is UNCHANGED: same player, same card, same standing bid. A refusal
  // that advanced the turn would be a pass by another name.
  check('the auction has not moved on', carryOf(out.step).toAct, 'atreides')
  check('...and nothing in the public step mentions the refusal',
    JSON.stringify(out.step).includes('more-than-you-hold'), false)
  // The clock is not restarted, which is what stops a bad bid buying time.
  check('the deadline is the one they were already under',
    isAwaiting(out.step) ? out.step.closesAt : null, DEADLINE)
}
check('a bid below the minimum is refused too',
  (bid(start(), 'atreides', 0) as { refusal?: string }).refusal, 'below-the-minimum')
{
  const s = stepOf(bid(start(), 'atreides', 3))
  check('...as is one that does not beat the standing bid',
    (bid(s, 'harkonnen', 3) as { refusal?: string }).refusal, 'below-the-minimum')
}
check('exactly the purse is allowed — the limit is "more than", not "as much as"',
  bid(start(), 'atreides', 5, 5).kind, 'ok')

// ── silence passes ────────────────────────────────────────────────────────
{
  const s = start()
  check('a bid is a required stop, so the phase is blocked on it',
    isAwaiting(s) ? s.need : null, 'required')
  check('...but a deadlined one', isAwaiting(s) ? s.closesAt : null, DEADLINE)
  check('...which has passed once the clock says so',
    isAwaiting(s) ? deadlinePassed(s, DEADLINE) : null, true)
  check('silence is a pass', silenceAnswers, { kind: 'pass' })
  check('...and answering with it moves the turn on',
    carryOf(stepOf(act(s, 'atreides', silenceAnswers))).toAct, 'harkonnen')
}

// ── one bidder left ───────────────────────────────────────────────────────
// Everyone else at their limit: the last player still has to bid. Getting a
// card free because nobody could compete is not a rule anybody wrote.
{
  const s = start({ hands: { atreides: 0, harkonnen: 8, fremen: 4, emperor: 4 } })
  check('the only eligible player opens', carryOf(s).toAct, 'atreides')
  const won = stepOf(bid(s, 'atreides', 1))
  check('...and their opening bid wins immediately, nobody being left to raise',
    carryOf(won).awards, [{ index: 0, winner: 'atreides', price: 1 }])
  const none = stepOf(passes(s, 'atreides'))
  check('...while passing leaves the card unsold', carryOf(none).unsold, [0])
}

// ── THE PRIVACY INVARIANT ─────────────────────────────────────────────────
// The carry is written to matches.state, which the changefeed delivers whole to
// every client. So the question is not whether the UI shows a card — it is
// whether one is in the bytes at all.
//
// Asserted over a full auction rather than one step: a leak that only appeared
// once a card had been won would pass a check on the opening position.
{
  const seen: string[] = []
  let s = start()
  for (let i = 0; i < 40 && isAwaiting(s); i++) {
    seen.push(JSON.stringify(s))
    const who = carryOf(s).toAct
    s = stepOf(i % 3 === 0 ? bid(s, who, (carryOf(s).high?.spice ?? 0) + 1) : passes(s, who))
  }
  const wire = seen.join('')
  check('the auction ran to the end', s.status, 'settled')
  check('...and no step named a treachery card',
    /baliset|crysknife|lasgun|karama|shield|snooper|chaumas/i.test(wire), false)
  // The words that would appear if a purse or a pile ever got in.
  check('...nor a spice holding',
    /spiceHeld|purse|"spice":\s*20/.test(wire), false)
  check('...nor a deck', /deck|draw|discardPile/i.test(wire), false)
  // The positive control. A projection that emptied everything would satisfy all
  // three above, so the things that SHOULD be public have to be there.
  check('...while the standing bid and the hands are public',
    [/"high"/.test(wire), /"hands"/.test(wire), /"toAct"/.test(wire)], [true, true, true])
}
// And the carry survives the round trip it actually makes, which is the rule
// the Step pattern exists for.
{
  const c = carryOf(start())
  check('the carry is plain data',
    JSON.stringify(JSON.parse(JSON.stringify(c))), JSON.stringify(c))
}

// ── the deck, which the auction never touches ─────────────────────────────
// Kept in its own module for that reason. These are about dealing, not bidding.
{
  const noShuffle = (cards: readonly string[]) => [...cards]
  const d = drawTreachery(['a', 'b', 'c'], [], 2, noShuffle)
  check('dealing takes from the top', d.drawn, ['a', 'b'])
  check('...and leaves the rest', d.draw, ['c'])
  check('...without reshuffling', d.reshuffled, false)
}
{
  const reverse = (cards: readonly string[]) => [...cards].reverse()
  const d = drawTreachery(['a'], ['x', 'y'], 3, reverse)
  check('an empty pile reshuffles the discard back in', d.drawn, ['a', 'y', 'x'])
  check('...and says it did', d.reshuffled, true)
  check('...leaving the discard empty', d.discard, [])
  // Once per deal, not once per card: the discard goes back in one go.
  let shuffles = 0
  drawTreachery([], ['x', 'y', 'z'], 3, cards => { shuffles++; return [...cards] })
  check('...reshuffling once, however many cards are drawn', shuffles, 1)
}
check('cards in hands are excluded by construction — they are in neither pile',
  drawTreachery(['a'], ['b'], 2, c => [...c]).drawn.includes('in-a-hand'), false)
{
  let threw = ''
  try { drawTreachery([], [], 1, c => [...c]) } catch (e) { threw = String(e) }
  check('a genuinely exhausted deck refuses rather than dealing short',
    /empty|exhaust/i.test(threw), true)
}
check('unsold cards go to the discard, most recent first',
  discardUnsold(['old'], ['fresh']), ['fresh', 'old'])

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
