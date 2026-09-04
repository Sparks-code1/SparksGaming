// The Mutants' Mindshackle, through the reducer instead of past it.
//
// THE INVARIANT IT BROKE: every board mutation goes through dispatch, because a
// bare setGameState for a game move is invisible online — it happens on the
// acting machine, on nobody else's, and the next echo from the server puts the
// state back. This swap was written that way: the Mutant's screen showed the
// trade, the victim's did not, and both hands returned on the next poll.
//
// The pick is still made by the caller and travels with the action, the same
// shape as RESOLVE_COMBAT's dice: it is random, and a reducer that rolled its
// own would land a different card on each machine.
import { gameReducer, createMathRng, type Action } from '@/lib/gameReducer'
import { initialTurnState, type GameState } from '@/types/game'

let pass = 0, fail = 0
const check = (name: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}
const rng = createMathRng()

const board = (mutantCards: string[], victimCards: string[]): GameState => ({
  id: 'g', campaignId: 'c', gameNumber: 1,
  phase: 'reinforce', currentPlayerIndex: 0, turnNumber: 4,
  players: [
    { id: 'mut', name: 'Mut', factionId: 'mutants', cards: mutantCards, isEliminated: false },
    { id: 'vic', name: 'Vic', factionId: 'khan', cards: victimCards, isEliminated: false },
  ] as never,
  territories: {} as never,
  deck: [], discardPile: [], winnerId: null,
  legacySnapshot: {} as never, activeHqs: {},
  turn: initialTurnState(),
} as never)

const trade = (state: GameState, over: Record<string, unknown> = {}) =>
  gameReducer(state, {
    type: 'MINDSHACKLE_TRADE',
    playerId: 'mut', victimId: 'vic',
    coinCardId: 'resource-1', stolenCardId: 'terr-9',
    ...over,
  } as Action, rng).state

const hand = (s: GameState, id: string) =>
  [...(s.players.find(p => p.id === id)?.cards ?? [])].sort()

console.log('\n— two cards change hands —')
{
  const before = board(['resource-1', 'keep-me'], ['terr-9', 'their-own'])
  const after = trade(before)
  check('the Mutants give up the card they collected',
    !hand(after, 'mut').includes('resource-1'))
  check('...and hold the one they took',
    hand(after, 'mut').includes('terr-9'))
  check('the victim loses the card that was taken',
    !hand(after, 'vic').includes('terr-9'))
  check('...and holds the one they were given',
    hand(after, 'vic').includes('resource-1'))

  // NOTHING IS MINTED OR LOST. Two hands, two cards, and the same four ids
  // afterwards — a swap that dropped one would be a card gone from the game.
  const idsBefore = [...hand(before, 'mut'), ...hand(before, 'vic')].sort().join()
  const idsAfter = [...hand(after, 'mut'), ...hand(after, 'vic')].sort().join()
  check('no card is created or destroyed', idsBefore === idsAfter, idsAfter)

  // AND NOBODY ELSE IS TOUCHED.
  check('the cards each side kept are still theirs',
    hand(after, 'mut').includes('keep-me') && hand(after, 'vic').includes('their-own'))
}

console.log('\n— a card that is not where the action says —')
{
  // THE PICK WAS MADE ON ONE MACHINE AND APPLIED ON ALL OF THEM, so by the
  // time this lands a hand may have moved. Refusing is right: swapping a card
  // somebody no longer holds would mint one out of nothing.
  const noCoin = board(['something-else'], ['terr-9'])
  check('a coin the Mutants do not hold is refused',
    hand(trade(noCoin), 'mut').join() === hand(noCoin, 'mut').join())

  const noSteal = board(['resource-1'], ['something-else'])
  check('a card the victim does not hold is refused',
    hand(trade(noSteal), 'vic').join() === hand(noSteal, 'vic').join())

  const missing = board(['resource-1'], ['terr-9'])
  check('an unknown victim is refused',
    hand(trade(missing, { victimId: 'nobody' }), 'mut').join()
      === hand(missing, 'mut').join())

  // TRADING WITH YOURSELF is not a move, and would double a card if the two
  // branches of the swap both ran on one player.
  const self = board(['resource-1', 'terr-9'], ['x'])
  const selfed = trade(self, { victimId: 'mut' })
  check('a swap with yourself is refused',
    hand(selfed, 'mut').join() === hand(self, 'mut').join())
}

console.log('\n— and it goes through the reducer at all —')
{
  const { readFileSync } = await import('node:fs')
  const src = readFileSync('src/components/GameBoard.tsx', 'utf8')
  const at = src.indexOf('function handleMindshackleTrade(')
  const fn = at < 0 ? '' : src.slice(at, at + 2200)

  // THE POINT OF THE WHOLE CHANGE. A bare setGameState here is the bug coming
  // back, and it would look correct on the machine that ran it.
  check('the swap dispatches rather than setting state',
    /dispatch\(\{\s*[\r\n]+\s*type: 'MINDSHACKLE_TRADE'/.test(fn))
  check('...and no bare setGameState is left beside it',
    !/setGameState\(prev => \(\{[\s\S]{0,400}p\.id === victimId/.test(fn))

  // THE SERVER HAS TO ACCEPT IT, or every swap 403s and the reducer never runs
  // on anybody's machine but the actor's — which is where this started.
  const edge = readFileSync('supabase/functions/apply-action/index.ts', 'utf8')
  check('the server accepts the action', /'MINDSHACKLE_TRADE',/.test(edge))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
