// Turning a finished auction into writes.
//
// The claim under test is a conjunction: a card is not dealt without payment,
// and nothing is paid for without arriving. Two functions called in sequence
// could satisfy each half and fail the pair, so most of this is about what
// happens when one half cannot be done — and the answer must always be that
// neither is.
//
// It matters more than usual that this is caught here. A hand is secret and a
// purse is secret, so a card dealt without payment is invisible from every seat;
// it surfaces as somebody quietly richer several turns later, by which time no
// log says why.
import { readFileSync } from 'node:fs'
import { settleAuction, settleCard, bonusCardsDue, BONUS_FACTION } from '@/lib/dune/auctionSettlement'
import { payForAuction } from '@/lib/dune/spice'
import type { AuctionResult } from '@/lib/dune/bidding'
import type { FactionId } from '@/types/Dune/Faction'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

const SEATED: FactionId[] = ['atreides', 'harkonnen', 'emperor', 'fremen']
const CARDS = ['crysknife', 'lasgun', 'shield', 'snooper']
const HANDS = { atreides: ['baliset'], harkonnen: [], emperor: [], fremen: [] }
const PURSES = { atreides: 10, harkonnen: 5, emperor: 20, fremen: 1 }

const result = (over: Partial<AuctionResult> = {}): AuctionResult => ({
  turn: 1,
  awards: [{ index: 0, winner: 'atreides', price: 3 }],
  unsold: [1, 2, 3],
  hands: {},
  ...over,
})

/**
 * Hand limits, so the Harkonnen bonus knows where to stop.
 *
 * Supplied by default because the bonus is BASIC play: a settlement that does
 * not mention it is a settlement getting it wrong, and settleAuction refuses
 * rather than silently skipping it. Cases here that are not about the bonus
 * still have to account for it, the same way a real caller does.
 */
const LIMITS = { atreides: 4, harkonnen: 8, emperor: 4, fremen: 4 }
/** Cards for the bonus, drawn by the caller in the real thing. */
const BONUS = ['chaumas', 'chaumurky']

const settle = (over: Partial<Parameters<typeof settleAuction>[0]> = {}) =>
  settleAuction({
    result: result(), cards: CARDS, hands: HANDS, purses: PURSES, seated: SEATED,
    limits: LIMITS, bonus: BONUS, ...over,
  })

const writesOf = (r: ReturnType<typeof settleAuction>) => {
  if (!r.ok) throw new Error(`expected a settlement, and it was refused: ${r.refusal} — ${r.detail}`)
  return r.writes
}

// ── the card reaches the winner, and only the winner ──────────────────────
{
  const w = writesOf(settle())
  check('the winner gains the card they bought',
    w.secrets.atreides.hand, ['baliset', 'crysknife'])
  check('...appended to what they already held, not replacing it',
    w.secrets.atreides.hand.includes('baliset'), true)
  check('...and nobody else gains a card',
    Object.entries(w.secrets).filter(([f]) => f !== 'atreides').map(([f, s]) => [f, s.hand]),
    [['emperor', []]])
  check('the cards nobody bought go to the discard',
    w.discard, ['lasgun', 'shield', 'snooper'])
}

// ── payment happens with it, not beside it ────────────────────────────────
{
  const w = writesOf(settle())
  check('the winner paid', w.secrets.atreides.spice, 7)
  check('...and the Emperor collected, this being a basic-game rule',
    w.secrets.emperor.spice, 23)
  check('...which is the ledger\'s own answer, not a second one',
    w.moves, payForAuction(result().awards, SEATED))
  // The Emperor took no card and still needs a row, or the spice arrives
  // nowhere — the half of the invariant that is easy to miss, because the
  // obvious loop is over the awards.
  check('a seat that only collected still gets written', 'emperor' in w.secrets, true)
  check('...and a seat that did neither does not',
    ['harkonnen', 'fremen'].filter(f => f in w.secrets), [])
}

// ── THE CONJUNCTION ───────────────────────────────────────────────────────
// A winner who cannot pay must end with no card AND no payment. Not one, not
// the other, not a partial.
{
  const broke = settle({
    result: result({ awards: [{ index: 0, winner: 'fremen', price: 9 }], unsold: [1, 2, 3] }),
  })
  check('a winner who cannot pay is refused', broke.ok, false)
  check('...saying which', broke.ok ? null : broke.refusal, 'a-winner-cannot-pay')
  check('...and naming them', broke.ok ? null : /fremen/.test(broke.detail), true)
  // There are no writes at all — not an empty hand, not an unchanged purse, but
  // nothing to write. A caller cannot half-apply what it was not given.
  check('no writes are produced', 'writes' in broke, false)
}
// And the same when only ONE of several winners is short: the whole auction is
// refused, including the cards the others could have paid for.
{
  const mixed = settle({
    result: result({
      awards: [
        { index: 0, winner: 'atreides', price: 3 },
        { index: 1, winner: 'fremen', price: 9 },
      ],
      unsold: [2, 3],
    }),
  })
  check('one unpayable award refuses the whole auction', mixed.ok, false)
  check('...so the solvent winner gets nothing either',
    mixed.ok ? 'settled' : 'refused', 'refused')
}
// Paying exactly what you hold is not "cannot pay".
check('a winner spending their last spice is fine',
  writesOf(settle({
    result: result({ awards: [{ index: 0, winner: 'fremen', price: 1 }], unsold: [1, 2, 3] }),
  })).secrets.fremen.spice, 0)

// ── every card is accounted for exactly once ──────────────────────────────
// The auction indexes cards; this maps indexes back to them. An off-by-one
// loses a card out of the game, and a deck quietly one short is not noticed
// until a reshuffle deals a hand that cannot exist.
// The COUNT is right in both of these and the INDICES are wrong, which is the
// only way to reach the lost-card check: a first attempt used fewer indices
// than cards, and the count check caught it first — a fixture that could not
// exercise the rule it was written for.
{
  const lost = settle({
    result: result({ awards: [{ index: 0, winner: 'atreides', price: 3 }], unsold: [1, 2, 2] }),
  })
  check('a card neither dealt nor discarded is refused', lost.ok, false)
  check('...as a lost card', lost.ok ? null : lost.refusal, 'a-card-was-lost')
  check('...naming what was accounted for', lost.ok ? null : /0,1,2,2/.test(lost.detail), true)
}
{
  const twice = settle({
    result: result({ awards: [{ index: 0, winner: 'atreides', price: 3 }], unsold: [0, 1, 2] }),
  })
  check('a card both dealt and discarded is refused too', twice.ok, false)
  check('...for the same reason', twice.ok ? null : twice.refusal, 'a-card-was-lost')
}
{
  const short = settle({ cards: ['crysknife'] })
  check('drawing a different number than was auctioned is refused', short.ok, false)
  check('...before any index is used', short.ok ? null : short.refusal, 'wrong-number-of-cards')
}
// The positive statement: dealt plus discarded is the whole draw, every time.
{
  const w = writesOf(settle({
    result: result({
      awards: [{ index: 1, winner: 'harkonnen', price: 2 }, { index: 3, winner: 'emperor', price: 4 }],
      unsold: [0, 2],
    }),
  }))
  const dealt = Object.values(w.secrets).flatMap(s => s.hand).filter(c => CARDS.includes(c))
  check('every drawn card was dealt or discarded, none twice',
    [...dealt, ...w.discard].sort(), [...CARDS].sort())
  check('...and the indexes map to the right cards',
    // THE HARKONNEN TAKE TWO. Basic play: a second card with each one they win,
    // off the draw pile rather than the lot, capped at their limit of eight.
    [w.secrets.harkonnen.hand, w.secrets.emperor.hand],
    [['lasgun', 'chaumas'], ['snooper']])
  // The Emperor buying their own card pays the bank, so nobody collects.
  check('the Emperor paid the bank for their own card',
    w.moves.filter(m => m.from === 'emperor').map(m => m.to), ['bank'])
}

// ── an auction where nothing sold ─────────────────────────────────────────
{
  const w = writesOf(settle({ result: result({ awards: [], unsold: [0, 1, 2, 3] }) }))
  check('every card is discarded', w.discard, CARDS)
  check('...no spice moves', w.moves, [])
  check('...and no secrets row is written at all', Object.keys(w.secrets), [])
}


// ── the Harkonnen take two ────────────────────────────────────────────────
// BASIC PLAY, not advanced. Their advanced rule is captured leaders; this one
// applies from the first game, and its absence quietly made them an ordinary
// bidder for every auction played so far.
//
// CAPPED BY THE HAND LIMIT, which for them is eight: holding seven and winning
// one, they get the one they won and no more.
{
  const won = (n: number) => Array.from({ length: n }, () => ({ winner: BONUS_FACTION }))

  check('one win earns a second card', bonusCardsDue(won(1), 1, 8), 1)
  check('two wins earn two', bonusCardsDue(won(2), 2, 8), 2)
  // The room is measured AFTER the auction's own cards are counted.
  check('at the limit, nothing', bonusCardsDue(won(1), 8, 8), 0)
  check('one short of it, one', bonusCardsDue(won(1), 7, 8), 1)
  check('two wins with room for one, one', bonusCardsDue(won(2), 7, 8), 1)
  check('winning nothing earns nothing', bonusCardsDue([], 0, 8), 0)
  // NOBODY ELSE. A rule that paid every winner would read the same in a game
  // where only the Harkonnen ever won.
  check('another faction earns none',
    bonusCardsDue([{ winner: 'atreides' as FactionId }], 1, 8), 0)

  // Through the settlement, where the card actually reaches a hand.
  const dealt = (handBefore: string[], bonus: string[]) => settleAuction({
    result: { turn: 1, awards: [{ index: 0, winner: BONUS_FACTION, price: 2 }], unsold: [], hands: {} },
    cards: ['won-card'],
    hands: { harkonnen: handBefore, atreides: [] },
    purses: { harkonnen: 10, atreides: 10 },
    seated: ['harkonnen', 'atreides'] as FactionId[],
    bonus,
    limits: { harkonnen: 8, atreides: 4 },
  })

  const roomy = dealt([], ['extra'])
  check('the winner gets both cards',
    roomy.ok ? roomy.writes.secrets[BONUS_FACTION].hand : [], ['won-card', 'extra'])

  const full = dealt(['a', 'b', 'c', 'd', 'e', 'f', 'g'], ['extra'])
  check('holding seven and winning one, they hold eight',
    full.ok ? full.writes.secrets[BONUS_FACTION].hand.length : 0, 8)
  check('...and the extra is not among them',
    full.ok ? full.writes.secrets[BONUS_FACTION].hand.includes('extra') : true, false)

  // REFUSED RATHER THAN SKIPPED when the caller has not drawn what is owed.
  // Silently dealing one card is how this rule stayed missing in the first
  // place: everything looks right and a card never arrives.
  const short = dealt([], [])
  check('a settlement owing a card it was not given is refused',
    short.ok ? 'dealt anyway' : short.refusal, 'not-enough-bonus-cards')
}


// ── paid when the hammer falls ────────────────────────────────────────────
// At the table the spice moves as each card is won. Settling the whole auction
// at the end left a winner's purse reading full while they bid on the next
// card — they could not see what they had left to bid WITH, which is most of
// what a player needs to know between cards.
{
  const A = 'atreides' as FactionId
  const seated = [A, BONUS_FACTION] as FactionId[]
  const limits = { atreides: 4, harkonnen: 8 }

  const one = settleCard({
    award: { index: 0, winner: A, price: 8 }, card: 'card-one',
    hands: { atreides: [], harkonnen: [] },
    purses: { atreides: 10, harkonnen: 10 },
    seated, limits, bonus: [],
  })
  check('one card, paid for on its own', one.ok, true)
  check('...the purse drops immediately', one.ok ? one.writes.secrets[A].spice : -1, 2)
  check('...and the card is in hand', one.ok ? one.writes.secrets[A].hand : [], ['card-one'])

  // THE NEXT CARD IS BID FOR OUT OF WHAT IS LEFT, which is the whole point.
  const two = settleCard({
    award: { index: 1, winner: A, price: 2 }, card: 'card-two',
    hands: { atreides: one.ok ? one.writes.secrets[A].hand : [], harkonnen: [] },
    purses: { atreides: one.ok ? one.writes.secrets[A].spice : 0, harkonnen: 10 },
    seated, limits, bonus: [],
  })
  check('the second card comes out of the remainder',
    two.ok ? two.writes.secrets[A].spice : -1, 0)
  check('...and both cards are held',
    two.ok ? two.writes.secrets[A].hand : [], ['card-one', 'card-two'])

  // THE PAYMENT COMES FIRST. Refusing after handing over a card is the failure
  // this order exists to make impossible rather than unlikely.
  const broke = settleCard({
    award: { index: 0, winner: A, price: 9 }, card: 'card-one',
    hands: { atreides: [] }, purses: { atreides: 3 }, seated, limits, bonus: [],
  })
  check('a winner who cannot pay is refused',
    broke.ok ? 'dealt anyway' : broke.refusal, 'a-winner-cannot-pay')
  check('...and nothing is dealt', broke.ok, false)

  // AND THE WHOLE-AUCTION PATH AGREES, because it is the same code folded over
  // the awards. Two implementations of who pays whom would disagree the first
  // time either was fixed; this is what says there is only one.
  const folded = settleAuction({
    result: {
      turn: 1,
      awards: [{ index: 0, winner: A, price: 8 }, { index: 1, winner: A, price: 2 }],
      unsold: [], hands: {},
    },
    cards: ['card-one', 'card-two'],
    hands: { atreides: [], harkonnen: [] },
    purses: { atreides: 10, harkonnen: 10 },
    seated, limits, bonus: [],
  })
  check('the whole-auction path reaches the same purse',
    folded.ok ? folded.writes.secrets[A].spice : -1,
    two.ok ? two.writes.secrets[A].spice : -2)
  check('...and the same hand',
    folded.ok ? folded.writes.secrets[A].hand : [],
    two.ok ? two.writes.secrets[A].hand : ['differs'])
}

// ── the deck's truth caps the bonus ───────────────────────────────────────
// The free card is "if there are cards left": an exhausted deck DEGRADES the
// advantage — fewer cards, or none — and never refuses the sale that closed.
// Refusing wedged a live auction: the pass that closed a Harkonnen win could
// never be honoured, while every bid still could.
{
  const seated = ['atreides', BONUS_FACTION] as FactionId[]
  const limits = { atreides: 4, harkonnen: 8 }
  const sale = (bonus: string[], deckHolds?: number) => settleCard({
    award: { index: 0, winner: BONUS_FACTION, price: 2 }, card: 'card-one',
    hands: { atreides: [], harkonnen: [] },
    purses: { atreides: 10, harkonnen: 10 },
    seated, limits, bonus,
    ...(deckHolds != null ? { deckHolds } : null),
  })
  const dry = sale([], 0)
  check('an empty deck degrades the bonus to none, and the sale stands',
    dry.ok ? dry.writes.secrets[BONUS_FACTION].hand : ['refused'], ['card-one'])
  const wet = sale(['card-two'], 1)
  check('...a deck that holds one gives one',
    wet.ok ? wet.writes.secrets[BONUS_FACTION].hand : [], ['card-one', 'card-two'])
  const short = sale([])
  check('...while a caller who simply miscounts is still refused',
    short.ok ? 'dealt anyway' : short.refusal, 'not-enough-bonus-cards')
}

// ── the ally pays what the winner cannot ──────────────────────────────────
// Own purse first, the ally's only for what is left, in the same settlement.
// An Emperor allied with the buyer collecting from their own purse is a move
// that nets nothing, and is dropped rather than booked.
{
  const { allyShare } = await import('@/lib/dune/spice')
  check('the split is own-first, the ally for the remainder',
    [allyShare(4, 10), allyShare(4, 1), allyShare(4, 0), allyShare(0, 5)],
    [{ own: 4, ally: 0 }, { own: 1, ally: 3 }, { own: 0, ally: 4 },
      { own: 0, ally: 0 }])

  const both = ['atreides', 'harkonnen'] as FactionId[]
  const helped = settleCard({
    award: { index: 0, winner: 'atreides' as FactionId, price: 4 }, card: 'card-x',
    hands: { atreides: [], fremen: [] },
    purses: { atreides: 1, fremen: 5 },
    seated: both, limits: { atreides: 4 }, bonus: [],
    ally: 'fremen' as FactionId,
  })
  check('the ally covers the remainder in the same settlement',
    helped.ok
      ? [helped.writes.secrets['atreides'].spice, helped.writes.secrets['fremen'].spice,
        helped.writes.secrets['atreides'].hand]
      : null,
    [0, 2, ['card-x']])
  const rich = settleCard({
    award: { index: 0, winner: 'atreides' as FactionId, price: 4 }, card: 'card-x',
    hands: { atreides: [] },
    purses: { atreides: 9, fremen: 5 },
    seated: both, limits: { atreides: 4 }, bonus: [],
    ally: 'fremen' as FactionId,
  })
  check('...a winner who can pay alone leaves the ally untouched',
    rich.ok ? ['fremen' in rich.writes.secrets, rich.writes.secrets['atreides'].spice] : null,
    [false, 5])
  const short = settleCard({
    award: { index: 0, winner: 'atreides' as FactionId, price: 4 }, card: 'card-x',
    hands: { atreides: [] },
    purses: { atreides: 1, fremen: 2 },
    seated: both, limits: { atreides: 4 }, bonus: [],
    ally: 'fremen' as FactionId,
  })
  check('...and a pair short together is refused whole',
    short.ok ? 'paid' : short.refusal, 'a-winner-cannot-pay')
  const imperial = settleCard({
    award: { index: 0, winner: 'atreides' as FactionId, price: 4 }, card: 'card-x',
    hands: { atreides: [], emperor: [] },
    purses: { atreides: 1, emperor: 5 },
    seated: ['atreides', 'emperor'] as FactionId[], limits: { atreides: 4 }, bonus: [],
    ally: 'emperor' as FactionId,
  })
  check('an Emperor ally collecting from their own purse books nothing',
    imperial.ok
      ? [imperial.writes.secrets['atreides'].spice, imperial.writes.secrets['emperor'].spice]
      : null,
    [0, 6])
  // The dropped move is not cosmetic: booked, it would demand the Emperor
  // hold what they were owed — an Emperor too poor to pay themselves would
  // wedge a sale the rule says goes through free.
  const poorImperial = settleCard({
    award: { index: 0, winner: 'atreides' as FactionId, price: 4 }, card: 'card-x',
    hands: { atreides: [], emperor: [] },
    purses: { atreides: 1, emperor: 2 },
    seated: ['atreides', 'emperor'] as FactionId[], limits: { atreides: 4 }, bonus: [],
    ally: 'emperor' as FactionId,
  })
  check('...even when that purse could not have covered the booking',
    poorImperial.ok
      ? [poorImperial.writes.secrets['atreides'].spice,
        poorImperial.writes.secrets['emperor'].spice]
      : poorImperial.refusal,
    [0, 3])

  // ── the server slice ────────────────────────────────────────────────────
  const fn = readFileSync('supabase/functions/dune-action/index.ts', 'utf8')
  check('a bid is judged against the pair\'s spice together',
    [/const againstPurse = expired \? 0 : purse \+ bidAllyPurse/.test(fn),
      /bidAllyPurse = readSpice\(\(allyRow\?\.data \?\? \{\}\) as DuneSecrets\)/.test(fn)],
    [true, true])
  check('...and the settlement is handed the winner\'s ally',
    /\.find\(\(p\) => p\.faction === justClosed\.winner\)\?\.ally \?\? null\) as never,/.test(fn),
    true)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
