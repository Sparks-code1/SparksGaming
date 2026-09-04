// The card-derived turn fields, through the reducer instead of past it.
//
// THE INVARIANT, the same one Mindshackle broke: anything that belongs to the
// game rather than to a screen goes through dispatch, because a local write is
// invisible online — it happens on the acting machine, on nobody else's, and
// the next echo from the server replaces the whole GameState with one that
// never saw it.
//
// Four fields were still written with a local `setTurn`: the trade-in totals
// two private missions are scored from, the World Capital's own eligibility
// condition, the Forced Occupation flag, and a turn reset. All four are
// card-layer bookkeeping that decides MISSIONS, which are worth red stars and
// so worth the whole campaign — and every one of them was silently reset to the
// server's untouched value within a round-trip of being earned.
//
// AND THEY ARE RECOMPUTED, NOT ACCEPTED. Unlike Mindshackle's card pick, none
// of these is random, so there is no reason for a payload to carry a value the
// reducer could work out itself. RICH_CARD_ELIGIBLE carries a player id and
// nothing else; the trade-in totals are priced from the campaign's own resource
// table off cards the reducer has just confirmed are in the hand.
import { gameReducer, createMathRng, type Action } from '@/lib/gameReducer'
import { initialTurnState, type GameState } from '@/types/game'

let pass = 0, fail = 0
// IT COMPARES, rather than taking a boolean somebody built at the call site.
// A first version of this file borrowed mindshackletest's (name, cond) helper
// and then wrote (label, actual, expected) assertions into it, so every array
// comparison handed a truthy array in as `cond` and could not fail. Two
// sabotage runs went green against a reducer with its verification deleted,
// which is the only reason it was found — a green suite proves nothing about a
// suite that cannot go red.
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) { pass++; console.log(`  ok   ${label}`) }
  else {
    fail++
    console.log(`  FAIL ${label}\n         got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
  }
}
const rng = createMathRng()

/** Resource values are a CAMPAIGN fact, so they live in the legacy snapshot. */
const RESOURCES: Record<string, number> = {
  'tc-brazil': 4,        // a rich territory card
  'tc-peru': 1,
  'tc-egypt': 5,         // rich, and in nobody's reach below
  'resource-1': 2,
  'resource-2': 3,
}

const board = (over: Record<string, unknown> = {}): GameState => ({
  id: 'g', campaignId: 'c', gameNumber: 1,
  phase: 'attack', currentPlayerIndex: 0, turnNumber: 4,
  players: [
    { id: 'p1', name: 'One', factionId: 'khan', cards: ['tc-brazil', 'tc-peru', 'resource-1', 'resource-2'], isEliminated: false },
    { id: 'p2', name: 'Two', factionId: 'balkania', cards: [], isEliminated: false },
  ] as never,
  territories: {
    brazil: { id: 'brazil', name: 'Brazil', continentId: 'south-america', occupyingPlayerId: 'p1', troops: 3, adjacentIds: [] },
    egypt: { id: 'egypt', name: 'Egypt', continentId: 'africa', occupyingPlayerId: 'p2', troops: 3, adjacentIds: [] },
  } as never,
  deck: [], discardPile: [], winnerId: null,
  activeHqs: {},
  legacySnapshot: {
    cardResources: RESOURCES,
    activeGameCards: { currentMissionId: 'mc-world-capital', sideboard: ['tc-brazil', 'tc-egypt'] },
  } as never,
  turn: initialTurnState(),
  ...over,
} as never)

const run = (state: GameState, action: Action) => gameReducer(state, action, rng).state

// ── The trade-in totals ─────────────────────────────────────────────────────
console.log('\n— the trade-in totals are counted where the trade happens —')
{
  const after = run(board(), {
    type: 'TRADE_IN_CARDS', playerId: 'p1', cardIds: ['tc-brazil', 'tc-peru', 'resource-2'],
  } as Action)

  // Advanced Tactics wants TWO 4+ territory cards in one turn. Only tc-brazil
  // qualifies here: tc-peru is worth 1, and resource-2 is worth 3 AND is a coin
  // rather than a territory card.
  check('only the 4+ TERRITORY cards raise the rich count', after.turn.richCardsTradedIn, 1)
  // Advanced Training wants a resource TOTAL, coins included: 4 + 1 + 3.
  check('the resource total counts every card traded', after.turn.resourcesTradedIn, 8)

  // A SECOND TRADE ADDS, it does not replace — two trade-ins in one turn is
  // exactly how Advanced Tactics is earned.
  const twice = run(after, {
    type: 'TRADE_IN_CARDS', playerId: 'p1', cardIds: ['resource-1'],
  } as Action)
  check('a second trade in the same turn accumulates',
    [twice.turn.richCardsTradedIn, twice.turn.resourcesTradedIn], [1, 10])
}

console.log('\n— and refused when the cards are not in the hand —')
{
  // THE MINDSHACKLE RULE. A payload naming cards this player does not hold buys
  // nothing and must count for nothing: Advanced Tactics is two rich cards, and
  // a client that could name any two would claim the mission without spending
  // them.
  const after = run(board(), {
    type: 'TRADE_IN_CARDS', playerId: 'p1', cardIds: ['tc-egypt'],
  } as Action)
  check('a card the player does not hold scores nothing',
    [after.turn.richCardsTradedIn, after.turn.resourcesTradedIn], [0, 0])

  const mixed = run(board(), {
    type: 'TRADE_IN_CARDS', playerId: 'p1', cardIds: ['tc-brazil', 'tc-egypt'],
  } as Action)
  check('...and one bad card refuses the whole trade, rather than scoring the good half',
    [mixed.turn.richCardsTradedIn, mixed.turn.resourcesTradedIn], [0, 0])
}

console.log('\n— hotseat keeps the counters even though it owns its own piles —')
{
  // state.cards absent is the hotseat marker, and this case used to bail on it
  // before doing anything at all. The counters have to survive that exit, or
  // the fix would have traded an online bug for a hotseat one.
  const hotseat = board()
  check('the fixture is a hotseat board', hotseat.cards, undefined)
  const after = run(hotseat, {
    type: 'TRADE_IN_CARDS', playerId: 'p1', cardIds: ['tc-brazil'],
  } as Action)
  check('the counters are kept with no server piles present',
    [after.turn.richCardsTradedIn, after.turn.resourcesTradedIn], [1, 4])
  // ...and it did NOT try to move piles that are not there.
  check('...and no pile was invented', after.cards, undefined)
}

// ── The World Capital's condition ───────────────────────────────────────────
console.log('\n— rich-card eligibility is worked out, not asserted —')
{
  const after = run(board(), { type: 'RICH_CARD_ELIGIBLE', playerId: 'p1' } as Action)
  // tc-brazil is face up, worth 4, and p1 occupies Brazil. tc-egypt is face up
  // and worth 5 but belongs to p2's territory, so p1 cannot claim it — the same
  // rule the draw modal applies, from the same function.
  check('the qualifying territory is found', after.turn.richCardTerritoryIds, ['brazil'])
  check('...and a card the player could not have taken is not', after.turn.eligibleForRichCard, true)
}

console.log('\n— and refused in every case it cannot verify —')
{
  const notTheirTurn = run(board(), { type: 'RICH_CARD_ELIGIBLE', playerId: 'p2' } as Action)
  check('a player who does not hold the turn is refused',
    notTheirTurn.turn.eligibleForRichCard, false)

  const otherMission = board()
  ;(otherMission.legacySnapshot as never as Record<string, Record<string, unknown>>)
    .activeGameCards.currentMissionId = 'mc-6-cities'
  check('...and so is a table where the World Capital is not the face-up mission',
    run(otherMission, { type: 'RICH_CARD_ELIGIBLE', playerId: 'p1' } as Action)
      .turn.eligibleForRichCard, false)

  // NOTHING RICH ON THE ROW. The condition is eligibility for a 4+ card, so a
  // face-up row of cheap cards is simply not eligible — and the flag must stay
  // false rather than being set with an empty territory list, which would leave
  // the mission claimable with nowhere to put the Capital.
  const poor = board()
  ;(poor.legacySnapshot as never as Record<string, Record<string, unknown>>)
    .activeGameCards.sideboard = ['tc-peru']
  const after = run(poor, { type: 'RICH_CARD_ELIGIBLE', playerId: 'p1' } as Action)
  check('...and a face-up row with nothing worth 4 sets nothing',
    [after.turn.eligibleForRichCard, after.turn.richCardTerritoryIds], [false, []])
}

// ── Forced Occupation ───────────────────────────────────────────────────────
console.log('\n— the knocked-out-rich flag is judged where the hands are taken —')
{
  // p2 holds one card and one territory, so capturing it eliminates them and
  // their hand transfers. The flag asks whether any transferred card was worth
  // 3+; it used to be answered in the component from the emitted effect, which
  // is the same fact arrived at the same way — and then written with a setTurn
  // the next echo threw away.
  const knockout = (victimCards: string[]): GameState => {
    const b = board()
    ;(b.players as never as Array<Record<string, unknown>>)[1].cards = victimCards
    ;(b.territories as never as Record<string, Record<string, unknown>>)
      .egypt.occupyingPlayerId = 'p2'
    return b
  }
  const resolve = (state: GameState) => run(state, {
    type: 'RESOLVE_COMBAT',
    srcId: 'brazil', tgtId: 'egypt',
    totalAtkLoss: 0, totalDefLoss: 3, captured: true, troopsToAdvance: 2,
    entryCostTotal: 0, entryCostFalloutHalf: false, defenderCloningBonus: 0,
  } as Action)

  const rich = resolve(knockout(['resource-2']))       // worth 3
  check('a knocked-out hand holding a 3+ card sets the flag',
    rich.turn.knockedOutRichPlayer, true)
  check('...and the player really was eliminated',
    rich.players.find(p => p.id === 'p2')?.isEliminated, true)

  const poor = resolve(knockout(['tc-peru']))          // worth 1
  check('a knocked-out hand with nothing worth 3 does not',
    poor.turn.knockedOutRichPlayer, false)

  // STICKY FOR THE TURN. Once earned it must survive a later harmless capture,
  // or a second attack in the same turn would take the mission back.
  const again = resolve({ ...rich, turn: rich.turn } as GameState)
  check('...and once set it is not cleared by a later capture',
    again.turn.knockedOutRichPlayer, true)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
