// Bidding: the treachery auction.
//
// Two things are being checked and they are not the same thing. The RULES —
// who opens, who may raise, when a card closes — and the PRIVACY, which is that
// nothing this phase writes down names a card, a purse or a deck. The second is
// the one no amount of playing the game would reveal, because a leak in the
// carry looks exactly like a correct auction from every seat.
import {
  beginAuction, answerBid, silenceAnswers, cardsOnOffer, MINIMUM_OPENING_BID,
  BID_SECONDS, BETWEEN_CARDS_SECONDS,
} from '@/lib/dune/bidding'
import type { AuctionCarry, BidStep, BidOutcome, BidAnswer } from '@/lib/dune/bidding'
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
    turn: 1, order: ORDER, hands: EMPTY, limits: LIMITS, closesAt: DEADLINE, ...over,
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

/**
 * The awards and unsold list, whether the auction is still running or finished.
 *
 * A one-card auction settles the moment that card closes, so reading the carry
 * throws. Shortening the row made three tests do exactly that — which is the
 * rule working, not the tests being wrong, but it does mean "what has been won
 * so far" has to be a question you can ask either way.
 */
const soFar = (s: BidStep) => isAwaiting(s)
  ? { awards: s.carry.awards, unsold: s.carry.unsold }
  : { awards: s.result.awards, unsold: s.result.unsold }

/** Bid or pass without repeating the purse and the deadline every time. */
const act = (s: BidStep, from: FactionId, answer: Parameters<typeof answerBid>[2], purse = 20) =>
  answerBid(carryOf(s), from, answer, purse, DEADLINE)
const bid = (s: BidStep, from: FactionId, spice: number, purse = 20) =>
  act(s, from, { kind: 'bid', spice }, purse)
const passes = (s: BidStep, from: FactionId) => act(s, from, { kind: 'pass' })

// ── how many cards are auctioned ──────────────────────────────────────────
// ONE PER PLAYER ALLOWED TO BID, not one per player in the game. A player at
// their hand limit does not get a card auctioned on their behalf, so the row
// shrinks. It was one-per-player at first, which is a different game: a full
// table would have seen six cards offered to nobody and discarded.
//
// Derived rather than passed in. As an argument the rule lived in whoever
// called the auction, and the first thing that happened was that it was wrong.
{
  const six: FactionId[] = ['atreides', 'emperor', 'spacing-guild', 'fremen', 'harkonnen', 'bene-gesserit']
  const sixLimits = Object.fromEntries(six.map(f => [f, f === 'harkonnen' ? 8 : 4]))
  const none = Object.fromEntries(six.map(f => [f, 0]))

  check('six players, nobody full: six cards', cardsOnOffer(six, none, sixLimits), 6)
  check('six players, two of them full: four cards',
    cardsOnOffer(six, { ...none, atreides: 4, fremen: 4 }, sixLimits), 4)
  check('everybody full: no cards at all, not cards offered to nobody',
    cardsOnOffer(six, { ...none, atreides: 4, emperor: 4, 'spacing-guild': 4, fremen: 4, harkonnen: 8, 'bene-gesserit': 4 }, sixLimits), 0)
  // The Harkonnen's eight is what makes them countable where anyone else is not.
  check('a Harkonnen at five still counts, where a four-limit faction would not',
    [cardsOnOffer(['harkonnen'], { harkonnen: 5 }, sixLimits),
      cardsOnOffer(['atreides'], { atreides: 4 }, sixLimits)], [1, 0])
  check('the auction offers what the rule counts',
    carryOf(start()).cardCount, cardsOnOffer(ORDER, EMPTY, LIMITS))
}

// COUNTED ONCE, at the start. Hands grow as cards are won, and recounting per
// card would make the size of the auction depend on its own outcome — buy a
// card, shrink the row, and the card just bought may have been the last offered.
{
  let s = start({ hands: { ...EMPTY, atreides: 3 } })
  check('four players, all under their limits: four cards', carryOf(s).cardCount, 4)
  s = stepOf(bid(s, 'atreides', 1))
  s = stepOf(passes(s, 'harkonnen'))
  s = stepOf(passes(s, 'fremen'))
  s = stepOf(passes(s, 'emperor'))
  check('a player reaching their limit mid-auction is now full',
    carryOf(s).hands.atreides, 4)
  check('...but the row does not shrink under them', carryOf(s).cardCount, 4)
  check('...they simply stop being asked', carryOf(s).toAct === 'atreides', false)
}
// The same rule again, asserted on what the auction DOES rather than on the
// number it stored. A sabotage that recomputed the count each card left the
// stored cardCount at four and ended the auction after two, so reading the
// field agreed with itself while the row silently halved.
//
// Everybody one card short of full, everybody buys: four cards must actually
// come up, even though each purchase fills the buyer.
{
  let s = start({ hands: { atreides: 3, harkonnen: 7, fremen: 3, emperor: 3 } })
  check('four eligible players, so four cards', carryOf(s).cardCount, 4)
  for (let i = 0; i < 40 && isAwaiting(s); i++) {
    const c = carryOf(s)
    s = stepOf(c.high ? passes(s, c.toAct) : bid(s, c.toAct, 1))
  }
  check('...and four are auctioned, however full the buyers get on the way',
    soFar(s).awards.length, 4)
  check('...one to each of them',
    soFar(s).awards.map(a => a.winner), ['atreides', 'harkonnen', 'fremen', 'emperor'])
}

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
    soFar(s).awards, [{ index: 0, winner: 'harkonnen', price: 1 }])
  check('...which was the only card, so the auction is over', s.status, 'settled')
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
  // NOTHING is unsold, because nothing was offered. Under the old count this
  // reported four discarded cards, which would have taken four real cards out
  // of the deck and put them face up for nobody's benefit.
  check('...with no cards offered rather than cards discarded',
    !isAwaiting(s) ? [s.result.unsold, s.result.awards] : null, [[], []])
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
  check('one eligible player means one card', carryOf(s).cardCount, 1)
  check('the only eligible player opens', carryOf(s).toAct, 'atreides')
  const won = stepOf(bid(s, 'atreides', 1))
  check('...and their opening bid wins immediately, nobody being left to raise',
    soFar(won).awards, [{ index: 0, winner: 'atreides', price: 1 }])
  const none = stepOf(passes(s, 'atreides'))
  check('...while passing leaves the card unsold', soFar(none).unsold, [0])
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


// ── a bid is measured against the purse it is handed ──────────────────────
// The module checks a bid against `spiceHeld`, which the caller reads out of
// the secret store. What makes that the right number is WHEN the store is
// written: each card is paid for as it closes — see settleCard — so by the
// time the next card opens, the winner's row has already lost the spice.
//
// It was not always so. Settlement ran once at the end of the whole auction,
// so the stored purse still showed spice already promised, and a seat could
// bid its maximum on every card in a row and win them all. The module carried
// the correction then, subtracting what the carry said was owed. Paying per
// card moved the fix upstream, and the subtraction had to go with it: applied
// to a purse that has already been debited, it charges the same spice twice.
{
  const A = 'atreides' as FactionId, H = 'harkonnen' as FactionId
  const at = (s: BidStep) => (s.status === 'awaiting' ? s.carry : null)
  const go = (s: BidStep, who: FactionId, a: BidAnswer, held: number) => {
    const o = answerBid(at(s)!, who, a, held, 9e12)
    return { step: o.kind === 'ok' ? o.step : s, outcome: o }
  }

  let step: BidStep = beginAuction({
    turn: 1, order: [A, H], hands: { atreides: 0, harkonnen: 0 },
    limits: { atreides: 4, harkonnen: 8 }, closesAt: 9e12,
  })
  // Card 1 goes to the Atreides for 8 out of 10; card 2 opens on the Harkonnen,
  // who pass, so it is the Atreides' turn again.
  step = go(step, A, { kind: 'bid', spice: 8 }, 10).step
  step = go(step, H, { kind: 'pass' }, 10).step
  step = go(step, H, { kind: 'pass' }, 10).step
  check('the seat that won is asked again', at(step)?.toAct, A)
  check('...and its win is on the carry', at(step)?.awards.map(a => a.price), [8])

  // THE CALLER NOW HANDS IN 2, the card having been paid for as it closed.
  check('what is left is biddable', go(step, A, { kind: 'bid', spice: 2 }, 2).outcome.kind, 'ok')
  const over = go(step, A, { kind: 'bid', spice: 3 }, 2).outcome
  check('...and a spice more is refused',
    over.kind === 'refused' ? over.refusal : 'allowed', 'more-than-you-hold')

  // AND NOTHING IS SUBTRACTED TWICE. Handed the full 10 — which is what a
  // caller that had not yet debited would pass — the whole 10 is biddable. The
  // module trusts the number it is given rather than second-guessing it, and a
  // leftover correction here would refuse this.
  check('the purse handed in is taken at face value',
    go(step, A, { kind: 'bid', spice: 10 }, 10).outcome.kind, 'ok')

  // A seat that has won nothing is unaffected either way.
  check('a seat that has won nothing may bid its whole purse',
    go(step, A, { kind: 'pass' }, 2).outcome.kind, 'ok')
}


// ── a breath between cards ────────────────────────────────────────────────
// Without it the next card opens in the same frame the last one settled: the
// seat that just won has a card it has not looked at and is already being asked
// to bid on another.
{
  const A = 'atreides' as FactionId, H = 'harkonnen' as FactionId
  const NOW = 1_000_000
  const closesAt = NOW + BID_SECONDS * 1000
  const opensAt = NOW + BETWEEN_CARDS_SECONDS * 1000
  const pause = { until: opensAt, thenClosesAt: opensAt + BID_SECONDS * 1000 }
  const at = (s: BidStep) => (s.status === 'awaiting' ? s.carry : null)

  let step: BidStep = beginAuction({
    turn: 1, order: [A, H], hands: { atreides: 0, harkonnen: 0 },
    limits: { atreides: 4, harkonnen: 8 }, closesAt,
  })
  let o = answerBid(at(step)!, A, { kind: 'bid', spice: 2 }, 20, closesAt, pause)
  step = o.kind === 'ok' ? o.step : step
  o = answerBid(at(step)!, H, { kind: 'pass' }, 20, closesAt, pause)
  step = o.kind === 'ok' ? o.step : step

  // A LENGTH, checked against a number rather than against itself. Every
  // other assertion here builds its fixture out of BETWEEN_CARDS_SECONDS, so
  // changing the constant changes both sides and none of them can fail — the
  // pause could go to zero with the suite green. Five seconds was not long
  // enough to read a card, which is what the gap is for.
  check('the pause is long enough to read a card', BETWEEN_CARDS_SECONDS >= 10, true)
  check('...and not so long it stalls the phase', BETWEEN_CARDS_SECONDS <= 30, true)

  check('a closed card leaves a pause before the next', at(step)?.pauseUntil, opensAt)
  check('...which the ask carries, so clients can show it',
    step.status === 'awaiting' ? step.ask.pauseUntil : null, opensAt)

  // THE PAUSE DOES NOT EAT THE NEXT BIDDER'S TIME. Their window starts when it
  // ends, so a gap between cards costs nobody a second of thinking.
  check('...and the next window is a full one, starting after it',
    (step.status === 'awaiting' ? step.closesAt! : 0) - opensAt, BID_SECONDS * 1000)

  // AND IT IS OPTIONAL. A caller with nobody to wait for — a test, a replay —
  // supplies none and the cards follow one another as they always did.
  let plain: BidStep = beginAuction({
    turn: 1, order: [A, H], hands: { atreides: 0, harkonnen: 0 },
    limits: { atreides: 4, harkonnen: 8 }, closesAt,
  })
  let p = answerBid(at(plain)!, A, { kind: 'bid', spice: 2 }, 20, closesAt)
  plain = p.kind === 'ok' ? p.step : plain
  p = answerBid(at(plain)!, H, { kind: 'pass' }, 20, closesAt)
  plain = p.kind === 'ok' ? p.step : plain
  check('no pause supplied, no pause imposed', at(plain)?.pauseUntil, undefined)
}

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
