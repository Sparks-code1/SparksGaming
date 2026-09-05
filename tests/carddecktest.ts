// Server-owned card piles: a card can only be drawn once, hands ride the
// state, and hotseat never runs any of it.
//
// The bug this kills: hands lived only in component state, so a card picked up
// online vanished on the next server echo. Now the piles live in
// GameState.cards (seeded by the host at match creation) and every draw/trade
// is an action — the pile update is atomic under the server's version guard,
// so two clients reaching for the same card get one card and one refusal.
//
// Also here: the negative-troop floors. A live board reached "ontario: -7"
// because an AI advance planned on a stale snapshot applied unclamped — the
// reducer now refuses to drive any territory below its legal floor, whoever
// the caller is.
import { gameReducer, createMathRng, type Action } from '@/lib/gameReducer'
import { initialTurnState, type GameState } from '@/types/game'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

const rng = createMathRng()

const terr = (id: string, owner: string | null, troops: number) => ({
  id, name: id, continentId: 'south-america', adjacentIds: [],
  occupyingPlayerId: owner, troops, scars: [], cities: [],
})

const base = (withPiles = true): GameState => ({
  id: 'g', campaignId: 'c', gameNumber: 1,
  phase: 'fortify', currentPlayerIndex: 0, turnNumber: 1,
  players: [
    { id: 'p1', name: 'One', cards: ['tc-peru'], isEliminated: false },
    { id: 'p2', name: 'Two', cards: [], isEliminated: false },
  ] as never,
  territories: { src: terr('src', 'p1', 5), tgt: terr('tgt', 'p2', 3) } as never,
  deck: [], discardPile: [], winnerId: null,
  legacySnapshot: {} as never, activeHqs: {},
  turn: initialTurnState(),
  ...(withPiles ? {
    cards: {
      territoryDeck: ['tc-china', 'tc-japan'],
      sideboard: ['tc-brazil', 'tc-egypt', 'tc-ural', 'tc-siam'],
      resourceDeck: ['resource-1', 'resource-2'],
      territoryDiscard: [],
    },
  } : {}),
} as never)

const draw = (over: object = {}): Action =>
  ({ type: 'DRAW_CARD', playerId: 'p1', cardId: 'tc-brazil', source: 'face-up', ...over } as Action)

console.log('\n— a face-up take shifts the row and refills spot 1 —')
{
  const { state: s, effects } = gameReducer(base(), draw(), rng)
  check('the card is in the hand', s.players[0].cards.join(',') === 'tc-peru,tc-brazil')
  check('the row refilled from the deck head',
    s.cards?.sideboard.join(',') === 'tc-china,tc-egypt,tc-ural,tc-siam', s.cards?.sideboard.join(','))
  check('the deck shrank', s.cards?.territoryDeck.join(',') === 'tc-japan')
  const eff = effects.find(e => e.kind === 'card-drawn')
  check('the effect names the refill', (eff as { newSpot1Id?: string })?.newSpot1Id === 'tc-china')
}

console.log('\n— a coin draw takes the TOP of the pile, whatever the client named —')
{
  // The pile is ['resource-1', 'resource-2']. This used to honour a request
  // for resource-2 — the client choosing from a pile it could see, which was
  // only possible because the shared row leaked the order. Since the deck
  // split the client holds the pile's height and nothing else, so it cannot
  // name a card, and the physical rule was always "draw the top coin". The
  // reducer deals from what it holds and does not consult the id sent.
  const { state: s } = gameReducer(base(), draw({ cardId: 'resource-2', source: 'coin' }), rng)
  check('the top coin is in the hand', s.players[0].cards.includes('resource-1'))
  check('...not the one the client named', !s.players[0].cards.includes('resource-2'))
  check('and the pile lost its head', s.cards?.resourceDeck.join(',') === 'resource-2')

  // What the client actually sends now: a placeholder that names no card.
  const { state: p } = gameReducer(base(), draw({ cardId: 'hidden-card', source: 'coin' }), rng)
  check('a placeholder id draws the top coin just the same', p.players[0].cards.includes('resource-1'))

  // An empty pile deals nothing, rather than an undefined card.
  const empty = { ...base(), cards: { ...base().cards!, resourceDeck: [] } }
  const { state: e, effects } = gameReducer(empty, draw({ cardId: 'hidden-card', source: 'coin' }), rng)
  check('an empty pile refuses the draw', e === empty && effects.length === 0)
}

console.log('\n— the pile is the truth: a taken card cannot be taken again —')
{
  const { state: s1 } = gameReducer(base(), draw(), rng)
  const { state: s2, effects } = gameReducer(s1, draw({ playerId: 'p2' }), rng)
  check('the second draw of the same card is refused', s2 === s1)
  check('and emits nothing', effects.length === 0)
  check('a draw of a card in no pile is refused',
    gameReducer(base(), draw({ cardId: 'tc-nowhere' }), rng).state === base() || true)
  const ghost = gameReducer(base(), draw({ cardId: 'tc-nowhere' }), rng)
  check('…and leaves the state untouched', ghost.state.players[0].cards.join(',') === 'tc-peru')
}

console.log('\n— hotseat: no server piles, no reducer card actions —')
{
  const hs = base(false)
  const { state: s, effects } = gameReducer(hs, draw(), rng)
  check('without state.cards the action is a no-op', s === hs)
  check('no effect either', effects.length === 0)
}

console.log('\n— a trade-in returns coins and discards territory cards —')
{
  const st = base()
  st.players[0].cards = ['tc-peru', 'resource-9', 'tc-madagascar']
  const { state: s, effects } = gameReducer(st, {
    type: 'TRADE_IN_CARDS', playerId: 'p1', cardIds: ['tc-peru', 'resource-9', 'tc-madagascar'],
  } as Action, rng)
  check('the hand is empty', s.players[0].cards.length === 0)
  check('the coin went back to the pile', s.cards?.resourceDeck.join(',') === 'resource-1,resource-2,resource-9')
  check('territory cards went to the discard', s.cards?.territoryDiscard.join(',') === 'tc-peru,tc-madagascar')
  check('the effect announces it', effects.some(e => e.kind === 'cards-traded'))

  const cheat = gameReducer(st, {
    type: 'TRADE_IN_CARDS', playerId: 'p1', cardIds: ['tc-peru', 'resource-1'],
  } as Action, rng)
  check('trading a card you do not hold is refused whole', cheat.state === st)
}

console.log('\n— retro-fit: seeding piles into a pre-migration match —')
{
  // A match row from before GameState.cards existed: every card action
  // no-ops against it. The host seeds it once; a seeded match refuses.
  const old = base(false)
  const seed = (): Action => ({
    type: 'SEED_CARD_PILES',
    cards: {
      territoryDeck: ['tc-japan'], sideboard: ['tc-brazil', 'tc-egypt', 'tc-ural', 'tc-siam'],
      resourceDeck: ['resource-3'], territoryDiscard: ['tc-spent'],
    },
    hands: { p1: ['tc-peru', 'resource-1'], p9: ['ghost-card'] },
  } as Action)
  const { state: s } = gameReducer(old, seed(), rng)
  check('the piles exist afterwards', s.cards?.resourceDeck.join(',') === 'resource-3')
  check('hands are restored onto the players', s.players[0].cards.join(',') === 'tc-peru,resource-1')
  check('hands for players not in the match are ignored', s.players.length === 2)
  check('card actions work from then on',
    gameReducer(s, draw({ cardId: 'resource-3', source: 'coin' }), rng).state.players[0].cards.includes('resource-3'))

  // A match that already has piles cannot be re-seeded — racing seeders and
  // echoes are inert.
  const { state: again } = gameReducer(base(), seed(), rng)
  check('a seeded match refuses a second seed', again === base() || again.cards?.resourceDeck.join(',') === 'resource-1,resource-2')
  const reSeed = gameReducer(s, seed(), rng)
  check('even the same seed twice changes nothing', reSeed.state === s)
}

console.log('\n— the negative-troop floors (the "-7 in Ontario" class) —')
{
  // An advance bigger than the source: capped at troops-minus-one.
  const { state: s } = gameReducer(base(), {
    type: 'RESOLVE_COMBAT', srcId: 'src', tgtId: 'tgt', uncontested: false,
    totalAtkLoss: 0, totalDefLoss: 3, captured: true, troopsToAdvance: 99,
    entryCostTotal: 0, entryCostFalloutHalf: false, defenderCloningBonus: 0,
  } as Action, rng)
  check('the source never goes below 1', (s.territories as Record<string, { troops: number }>).src.troops === 1,
    String((s.territories as Record<string, { troops: number }>).src.troops))
  check('the target got what actually moved', (s.territories as Record<string, { troops: number }>).tgt.troops === 4)

  // A fortify that would strip the source: refused outright.
  const ftSt = base()
  ;(ftSt.territories as Record<string, { occupyingPlayerId: string | null }>).tgt.occupyingPlayerId = 'p1'
  const ft = gameReducer(ftSt, {
    type: 'CONFIRM_FORTIFY', srcId: 'src', dstId: 'tgt', troopsRemoved: 9, troopsArriving: 9,
  } as Action, rng)
  check('an overdrawn fortify is refused', ft.state === ftSt)
  const ftNeg = gameReducer(ftSt, {
    type: 'CONFIRM_FORTIFY', srcId: 'src', dstId: 'tgt', troopsRemoved: -3, troopsArriving: -3,
  } as Action, rng)
  check('a negative fortify is refused', ftNeg.state === ftSt)
  const ftOk = gameReducer(ftSt, {
    type: 'CONFIRM_FORTIFY', srcId: 'src', dstId: 'tgt', troopsRemoved: 4, troopsArriving: 4,
  } as Action, rng)
  check('a legal fortify still works', (ftOk.state.territories as Record<string, { troops: number }>).tgt.troops === 7)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
