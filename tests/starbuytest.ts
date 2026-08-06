// Buying a red star: 4 distinct cards, actually in the hand, exactly once.
//
// The phantom-star incident: the quick-buy button had its own unguarded copy
// of the purchase. A duplicate firing replayed the same four card ids — the
// hand only emptied once, but the star counter went up twice, and a game
// ended a turn early on a star nobody paid for. These rules are what the one
// shared handler now enforces.
import { canSpendForStar, starPurchaseSelection, STAR_PURCHASE_COST } from '@/lib/gameLogic'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

const HAND = ['c1', 'c2', 't1', 't2', 't3']

console.log('--- what a star may be bought with ---')
check('four distinct held cards buy a star', canSpendForStar(HAND, ['c1', 'c2', 't1', 't2']), true)
check('three cards are not enough', canSpendForStar(HAND, ['c1', 'c2', 't1']), false)
check('five cards are too many', canSpendForStar(HAND, ['c1', 'c2', 't1', 't2', 't3']), false)
check('a card you do not hold is refused', canSpendForStar(HAND, ['c1', 'c2', 't1', 'zz']), false)

// The incident, distilled: the same id submitted twice inside one purchase.
check('duplicate ids inside one purchase are refused',
  canSpendForStar(HAND, ['c1', 'c1', 't1', 't2']), false)

// The incident's second act: a replay after the cards were spent.
const afterSpend = HAND.filter(id => !['c1', 'c2', 't1', 't2'].includes(id))
check('replaying the spent ids against the new hand is refused',
  canSpendForStar(afterSpend, ['c1', 'c2', 't1', 't2']), false)
check('an empty hand buys nothing', canSpendForStar([], ['a', 'b', 'c', 'd']), false)

console.log('\n--- what the quick-buy offers to spend ---')
const isCoin = (id: string) => id.startsWith('c')
check('coins are spent first, then territory cards',
  starPurchaseSelection(HAND, isCoin), ['c1', 'c2', 't1', 't2'])
check('a hand below the cost offers nothing',
  starPurchaseSelection(['c1', 'c2', 't1'], isCoin), null)
check('exactly the cost spends the whole hand',
  starPurchaseSelection(['t1', 't2', 't3', 'c1'], isCoin), ['c1', 't1', 't2', 't3'])
check('the offer always passes its own gate',
  canSpendForStar(HAND, starPurchaseSelection(HAND, isCoin)!), true)
check('the cost is four', STAR_PURCHASE_COST, 4)

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
