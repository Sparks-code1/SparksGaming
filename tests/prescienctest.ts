// Atreides prescience.
//
// Two rules and both are about scope: only that faction, and only the card
// currently up. The second is the one with teeth — a reveal that named the lot
// would hand them the rest of the auction, and a reveal left behind after a
// card closes is one they can still read once it is in somebody's hand.
import { prescienceFor, withReveal, PRESCIENT_FACTION, REVEAL_KEY } from '@/lib/dune/prescience'
import { FACTIONS } from '@/data/dune/factions'
import type { FactionId } from '@/types/Dune/Faction'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

const SEATED: FactionId[] = ['atreides', 'harkonnen', 'emperor']
const LOT = ['crysknife', 'lasgun', 'shield']
const at = (index: number, seated = SEATED, lot = LOT) => prescienceFor({ seated, lot, index })

// ── only the Atreides ─────────────────────────────────────────────────────
check('the power belongs to the Atreides', PRESCIENT_FACTION, 'atreides')
// Read from the faction data rather than restated, so moving that sentence
// out of their abilities fails this rather than silently changing the game.
check('...and their own rules say so',
  /look at each Treachery Card/i.test(FACTIONS.atreides?.abilities.bidding ?? ''), true)
check('the reveal names them', at(0)?.faction, 'atreides')
check('with no Atreides at the table, nobody sees anything',
  at(0, ['harkonnen', 'emperor']), null)

// ── only the card currently up ────────────────────────────────────────────
check('the card up is the one revealed', at(0)?.card, 'crysknife')
check('...and it moves with the row', [at(1)?.card, at(2)?.card], ['lasgun', 'shield'])
// THE ONE WITH TEETH. A reveal is one card, not the lot: naming the row would
// hand the Atreides every card in the auction before the first bid.
check('one card, never the lot',
  [at(0), at(1), at(2)].filter(r => r !== null).length, 3)
check('...and no two of them are the same card',
  new Set([at(0), at(1), at(2)].map(r => r?.card)).size, 3)
check('...and each is a single id, not a list',
  typeof at(0)?.card, 'string')

// ── nothing is up, nothing is revealed ────────────────────────────────────
// The settled auction's index is one past the end, which is exactly this case
// and is how the reveal ends up cleared rather than pointing at a dealt card.
check('an index past the end reveals nothing', at(LOT.length), null)
check('a negative index reveals nothing', at(-1), null)
check('a fractional index reveals nothing', at(1.5), null)
check('an empty lot reveals nothing', at(0, SEATED, []), null)

// ── writing it into a secrets row ─────────────────────────────────────────
// MERGED, never replaced. match_secrets is upserted whole, so a write of the
// reveal alone would take that seat's hand and purse with it — the smallest
// write in the phase and the easiest place to lose everything else.
{
  const row = { cards: ['baliset'], spice: 12, missionCardId: null }
  const withIt = withReveal(row, at(0))
  check('the reveal is added', withIt[REVEAL_KEY], 'crysknife')
  check('...and the hand survives', withIt.cards, ['baliset'])
  check('...and the purse', withIt.spice, 12)
  check('...and anything else that was there', 'missionCardId' in withIt, true)
  check('the source row is not mutated', REVEAL_KEY in row, false)
}
{
  const row = { cards: ['baliset'], spice: 12, prescience: 'crysknife' }
  const cleared = withReveal(row, null)
  // REMOVED, not set to null: a present-but-empty reveal and an absent one mean
  // the same thing to the panel, and nobody reading the row should have to know
  // which one they are looking at.
  check('clearing removes the key rather than nulling it', REVEAL_KEY in cleared, false)
  check('...and leaves the rest alone', [cleared.cards, cleared.spice], [['baliset'], 12])
}
// Moving the row is a write of the next card over the last one.
check('advancing the row replaces the reveal rather than accumulating',
  withReveal(withReveal({}, at(0)), at(1))[REVEAL_KEY], 'lasgun')

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
