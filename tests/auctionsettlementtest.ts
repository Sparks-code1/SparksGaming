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
import { settleAuction, bonusCardsDue, BONUS_FACTION } from '@/lib/dune/auctionSettlement'
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

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
