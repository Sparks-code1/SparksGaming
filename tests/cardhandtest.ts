import { readFileSync } from 'node:fs'
import { gameReducer, createSeededRng, type Action } from '@/lib/gameReducer'
import { initialTurnState, type GameState } from '@/types/game'
import { handSize, heldHand } from '@/lib/hand'
// The fifth site of the split-hand shape, and why there will not be a sixth.
//
// FIELD REPORT, 2026-09-06: clicking Cards gave a blank screen — `Cannot read
// properties of undefined (reading 'map')` in CardHand — and every screen's
// Cards button showed the ACTING player's count: 0 for everyone during Ryan's
// turn, 3 for everyone during Linda's (Ryan held 1). One cause: the button and
// the panel were keyed to currentPlayer, right at one keyboard and wrong on a
// network, where the actor's hand is hidden on every machine but one.
//
// handSize and reviseHandLocally had consolidated GameBoard's readers and
// writers — and held: with `Player.cards` made optional the compiler flags
// nothing in GameBoard. What they never had was a type behind them. CardHand
// is another file, read `player.cards` bare, compiled clean, and died at
// runtime; and no reader helper can guard WHOSE hand a panel is about. So:
//   1. `Player.cards` is optional — the compiler now finds the next site;
//   2. the two readers live in src/lib/hand.ts, for any file;
//   3. the panel and button are keyed to this machine's own seat online;
//   4. CardHand says "not visible on this machine" rather than mapping;
//   5. the reducer refuses a card action for a hand it does not hold.
let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`}`)
}
/** Comments out, so a pin can never be satisfied by its own explanation. */
const bare = (src: string) => src.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}/g, '')

console.log('\n— the readers, for any file —')
{
  check('a held hand reads its length', handSize({ cards: ['a', 'b'] }), 2)
  check('a hidden hand reads its count', handSize({ cardCount: 3 }), 3)
  check('nothing known reads zero', handSize({}), 0)
  check('a held hand is handed over', heldHand({ cards: ['a'] }), ['a'])
  check('a hidden hand is null — not an empty array', heldHand({ cardCount: 3 }), null)
  check('an empty held hand is a real, empty hand', heldHand({ cards: [] }), [])
}

console.log('\n— the type says the truth —')
{
  const player = bare(readFileSync('src/types/player.ts', 'utf8'))
  check('Player.cards is optional', /\bcards\?: string\[\]/.test(player), true)
}

console.log('\n— the reducer refuses a hand it does not hold —')
{
  const rng = createSeededRng(1)
  const hidden = { id: 'p2', name: 'Them', factionId: 'aliens', cardCount: 2, isEliminated: false }
  const state = {
    phase: 'attack', currentPlayerIndex: 0, turnNumber: 1, gameNumber: 1,
    players: [
      { id: 'p1', name: 'Me', factionId: 'mutants', cards: ['tc-peru'], isEliminated: false },
      hidden,
    ],
    territories: {}, deck: [], discardPile: [], winnerId: null,
    legacySnapshot: {} as never, activeHqs: {}, turn: initialTurnState(),
    cards: { territoryDeck: ['tc-china'], sideboard: ['tc-brazil'], resourceDeck: ['resource-1'], territoryDiscard: [] },
  } as unknown as GameState
  const run = (a: Action) => gameReducer(state, a, rng)
  const draw = run({ type: 'DRAW_CARD', playerId: 'p2', cardId: 'tc-brazil', source: 'face-up' } as Action)
  check('a face-up draw for a hidden hand leaves the state untouched', draw.state === state && draw.effects.length === 0, true)
  const coin = run({ type: 'DRAW_CARD', playerId: 'p2', cardId: 'hidden-card', source: 'coin' } as Action)
  check('a coin draw for a hidden hand too', coin.state === state && coin.effects.length === 0, true)
  const trade = run({ type: 'TRADE_IN_CARDS', playerId: 'p2', cardIds: ['tc-x', 'tc-y'] } as Action)
  check('a trade-in for a hidden hand too', trade.state === state && trade.effects.length === 0, true)
  const own = run({ type: 'DRAW_CARD', playerId: 'p1', cardId: 'tc-brazil', source: 'face-up' } as Action)
  check('...while a held hand is dealt to as before', own.state.players[0].cards, ['tc-peru', 'tc-brazil'])
  check('...and the hidden seat is still exactly as it arrived', own.state.players[1], hidden)
}

console.log('\n— the board keys the panel to its own seat online —')
{
  const board = bare(readFileSync('src/components/GameBoard.tsx', 'utf8'))
  check('handOwner is this seat online and the current player at one keyboard',
    /const handOwner = onlineMatch\s*\?\s*\(localSeatId \? gameState\.players\.find\(p => p\.id === localSeatId\) \?\? null : null\)\s*:\s*currentPlayer/.test(board), true)
  check('the Cards button counts the owner', /🃏 Cards \(\{handSize\(handOwner\)\}\)/.test(board), true)
  check('...never the current player', /handSize\(currentPlayer\)/.test(board), false)
  check('the panel opens the owner', /<CardHand\s+player=\{handOwner\}/.test(board), true)
  check('...and trades only on the owner\'s own turn',
    /canTradeIn=\{gameState\.phase === 'reinforce' && handOwner\.id === currentPlayer\?\.id\}/.test(board), true)
  check('the readers come from the module, not a local copy',
    /import \{ handSize, heldHand \} from '@\/lib\/hand'/.test(board) && !/^function handSize\(/m.test(board), true)
}

console.log('\n— CardHand says what it cannot show —')
{
  const hand = bare(readFileSync('src/components/CardHand.tsx', 'utf8'))
  check('the hand is read through heldHand', /const held = heldHand\(player\)/.test(hand), true)
  check('...and never bare', /player\.cards\b/.test(hand), false)
  check('a hidden hand is named, with its count, instead of mapped',
    /if \(!held\) \{[\s\S]{0,900}?not visible on this machine/.test(hand), true)
}

console.log('\n— the reducer guards read as intended —')
{
  const reducer = bare(readFileSync('src/lib/gameReducer.ts', 'utf8'))
  check('the mutant steal refuses when either hand is not held',
    /const mutantHand = mutant\.cards, victimHand = victim\.cards\s*if \(!mutantHand \|\| !victimHand\) return only\(state\)/.test(reducer), true)
  const view = bare(readFileSync('src/lib/stateView.ts', 'utf8'))
  check('secretsFromState refuses to split a state that carries no hand',
    /secretsFromState: seat \$\{p\.id\} carries no hand/.test(view), true)
  check('the public count comes through the one reader', /cardCount: handSize\(p\)/.test(view), true)
}

console.log(pass ? '\nall card-hand pins hold' : '\nFAILED')
process.exit(pass ? 0 : 1)
