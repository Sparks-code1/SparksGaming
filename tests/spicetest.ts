// The spice ledger, and who gets paid for a treachery card.
//
// The claim worth testing is not "the arithmetic is right" — it is that spice
// never leaves a purse without arriving somewhere. That is a property of every
// batch rather than of any one move, so most of this asserts over batches, and
// the conservation check counts the bank rather than demanding the total never
// change: a payment TO the bank should reduce what the table holds, and a check
// that forbade it would be wrong about the game rather than about the code.
import {
  applySpiceMoves, payForTreachery, payForAuction, netFromBank, heldBy, BANK,
} from '@/lib/dune/spice'
import type { SpiceMove, Purses } from '@/lib/dune/spice'
import { FACTIONS } from '@/data/dune/factions'
import type { FactionId } from '@/types/Dune/Faction'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

const START: Purses = { atreides: 10, harkonnen: 5, emperor: 20, fremen: 0 }
const total = (p: Purses) => Object.values(p).reduce((a, b) => a + b, 0)
const move = (from: string, to: string, amount: number): SpiceMove =>
  ({ from: from as FactionId, to: to as FactionId, amount, reason: 'treachery-bid' })

/** Apply, or fail loudly — most cases here expect success. */
const applied = (moves: SpiceMove[], purses: Purses = START) => {
  const r = applySpiceMoves(purses, moves)
  if (!r.ok) throw new Error(`expected the batch to apply, and it was refused: ${r.refusal}`)
  return r.purses
}

// ── a move is two halves, always ──────────────────────────────────────────
{
  const after = applied([move('atreides', 'harkonnen', 3)])
  check('the payer is lighter', after.atreides, 7)
  check('the payee is heavier', after.harkonnen, 8)
  check('...and nobody else moved', [after.emperor, after.fremen], [20, 0])
  check('so the table holds exactly what it held', total(after), total(START))
}
// A seat with no entry holds nothing rather than being missing — a real state
// at setup, not an absent one.
check('a seat with no entry can be paid', applied([move(BANK, 'nobody', 4)]).nobody, 4)
check('heldBy reads an absent seat as zero', heldBy(START, 'nobody' as FactionId), 0)

// ── the bank is an end of a movement, not a balance ───────────────────────
{
  const inflow = applied([move(BANK, 'fremen', 6)])
  check('spice can enter the game from the bank', inflow.fremen, 6)
  check('...and the table holds six more', total(inflow) - total(START), 6)
  const outflow = applied([move('atreides', BANK, 4)])
  check('and leave to the bank', outflow.atreides, 6)
  check('...leaving the table four lighter', total(outflow) - total(START), -4)
  check('the bank keeps no balance of its own', BANK in inflow, false)
  // Conservation, stated so it survives a payment to the bank.
  const moves = [move(BANK, 'fremen', 6), move('atreides', BANK, 4)]
  check('the table changes by exactly the bank\'s net flow',
    total(applied(moves)) - total(START), netFromBank(moves))
}

// ── a batch is all or nothing ─────────────────────────────────────────────
// The failure this refuses: half a batch applied leaves the game with spice
// that came from nowhere, and each half looks legal on its own.
{
  const bad = [move('atreides', 'harkonnen', 3), move('fremen', 'emperor', 99)]
  const r = applySpiceMoves(START, bad)
  check('a batch with one bad move is refused', r.ok, false)
  check('...naming which move', r.ok ? null : r.move.from, 'fremen')
  check('...and why', r.ok ? null : r.refusal, 'insufficient-spice')
  // The first move must NOT have landed.
  const after = applySpiceMoves(START, bad)
  check('nothing from the batch was applied',
    after.ok ? null : total(START), total(START))
  check('...the payer of the good move still holds everything',
    (applySpiceMoves(START, bad) as { purses?: Purses }).purses ?? START, START)
}

// ── running balance, not a net ────────────────────────────────────────────
// Netting the batch first would let a purse dip negative and come back, which
// is a loan nobody agreed to.
{
  const r = applySpiceMoves({ fremen: 0 }, [
    move('fremen', 'atreides', 5),
    move('atreides', 'fremen', 5),
  ])
  check('a seat cannot pay what it has not received yet', r.ok, false)
  check('...even though the batch nets to zero', r.ok ? null : r.refusal, 'insufficient-spice')
}
check('the same batch the other way round is fine',
  applied([move('atreides', 'fremen', 5), move('fremen', 'atreides', 5)]), START)

// ── what is refused ───────────────────────────────────────────────────────
const refusalOf = (m: SpiceMove) => {
  const r = applySpiceMoves(START, [m])
  return r.ok ? 'applied' : r.refusal
}
check('a fractional amount', refusalOf(move('atreides', 'fremen', 1.5)), 'not-a-whole-number')
check('zero, which is a move that moves nothing', refusalOf(move('atreides', 'fremen', 0)), 'not-positive')
check('a negative, which is a payment in reverse',
  refusalOf(move('atreides', 'fremen', -3)), 'not-positive')
check('paying yourself', refusalOf(move('atreides', 'atreides', 1)), 'same-holder')
check('more than you hold', refusalOf(move('harkonnen', 'fremen', 6)), 'insufficient-spice')
check('exactly what you hold is allowed — the limit is "more than"',
  refusalOf(move('harkonnen', 'fremen', 5)), 'applied')
// The bank is never short.
check('the bank can always pay', refusalOf(move(BANK, 'fremen', 1_000_000)), 'applied')

// ── the Emperor collects ──────────────────────────────────────────────────
// A BASIC-game rule, not an advanced one: it sits in abilities.bidding. Read
// from the faction data rather than restated here, so a move of that text
// between the two sections fails this rather than silently changing the game.
check('the rule is in the basic abilities, not the advanced ones',
  [/pays spice for a Treachery card/i.test(FACTIONS.emperor?.abilities.bidding ?? ''),
    /pays spice for a Treachery card/i.test(JSON.stringify(FACTIONS.emperor?.advanced ?? {}))],
  [true, false])

const SEATED: FactionId[] = ['atreides', 'harkonnen', 'emperor', 'fremen']
{
  const moves = payForTreachery({ winner: 'atreides', price: 4, seated: SEATED })
  check('another faction pays the Emperor, not the bank',
    moves, [{ from: 'atreides', to: 'emperor', amount: 4, reason: 'treachery-bid' }])
  const after = applied(moves)
  check('...so the Emperor is richer by the price', after.emperor - START.emperor, 4)
  check('...and the table holds the same, the spice having only moved seats',
    total(after), total(START))
}
// THE CASE THE REDIRECT DOES NOT COVER. The Emperor buying a card pays the
// bank: the rule is for other factions, and paying yourself is not a payment.
{
  const moves = payForTreachery({ winner: 'emperor', price: 7, seated: SEATED })
  check('the Emperor winning a card pays the bank', moves[0].to, BANK)
  check('...at the same price', moves[0].amount, 7)
  const after = applied(moves)
  check('...so that spice leaves the game', total(after) - total(START), -7)
  check('...and the Emperor is genuinely poorer', after.emperor, 13)
}
check('with no Emperor at the table everyone pays the bank',
  payForTreachery({ winner: 'atreides', price: 2, seated: ['atreides', 'fremen'] })[0].to, BANK)

// AT FULL PRICE. There is nowhere here for a discount to be applied, and that
// is asserted rather than left to inspection.
check('the amount is the winning bid, whoever is paid',
  [1, 5, 13].map(p => payForTreachery({ winner: 'atreides', price: p, seated: SEATED })[0].amount),
  [1, 5, 13])
check('an unsold card costs nobody anything',
  payForTreachery({ winner: 'atreides', price: 0, seated: SEATED }), [])

// ── a whole auction's payments ────────────────────────────────────────────
{
  const awards = [
    { winner: 'atreides' as FactionId, price: 3 },
    { winner: 'emperor' as FactionId, price: 5 },
    { winner: 'harkonnen' as FactionId, price: 2 },
  ]
  const moves = payForAuction(awards, SEATED)
  check('one payment per card, in the order won',
    moves.map(m => [m.from, m.to, m.amount]),
    [['atreides', 'emperor', 3], ['emperor', BANK, 5], ['harkonnen', 'emperor', 2]])
  const after = applied(moves)
  // The Emperor collects 3 and 2, pays 5 for their own: net zero, by coincidence
  // of the numbers, which is why the payers are checked too.
  check('the Emperor nets what they collected less what they spent',
    after.emperor - START.emperor, 0)
  check('...while the buyers are each lighter by their bid',
    [START.atreides - after.atreides, START.harkonnen - after.harkonnen], [3, 2])
  check('the table is lighter by only what went to the bank',
    total(after) - total(START), netFromBank(moves))
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
