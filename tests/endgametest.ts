// The shared end-of-game ceremony: END_GAME seeds a session every machine
// renders from; each player's machine records "my rewards are in" and
// "continue or quit" as once-only flags. Before this, a finished game showed
// a 3.5-second toast on the machines that didn't detect the win and then a
// frozen board that looked like a game still in progress.
import { gameReducer, createMathRng, type Action } from '@/lib/gameReducer'
import { initialTurnState, type GameState } from '@/types/game'
import { endGameRecap } from '@/lib/gameLogic'

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

const base = (): GameState => ({
  id: 'g', campaignId: 'c', gameNumber: 3,
  phase: 'attack', currentPlayerIndex: 0, turnNumber: 9,
  players: [
    { id: 'p1', name: 'Winner', factionId: 'khan', cards: [], isEliminated: false },
    { id: 'p2', name: 'Second', factionId: 'balkania', cards: [], isEliminated: false },
    { id: 'p3', name: 'Out', factionId: 'saharan', cards: [], isEliminated: true },
  ] as never,
  territories: { a: terr('a', 'p1', 5), b: terr('b', 'p2', 3) } as never,
  deck: [], discardPile: [], winnerId: null,
  legacySnapshot: {} as never, activeHqs: {},
  turn: initialTurnState(),
} as never)

console.log('\n— END_GAME seeds the shared ceremony —')
{
  const { state: s } = gameReducer(base(), {
    type: 'END_GAME', winnerId: 'p1', condition: 'stars',
  } as Action, rng)
  check('phase freezes', s.phase === 'game-over')
  check('session exists', !!s.endGame)
  check('session names the winner', s.endGame?.winnerId === 'p1' && s.endGame?.condition === 'stars')
  check('nobody has rewards yet', Object.keys(s.endGame?.rewardsDone ?? { x: 1 }).length === 0)
  check('nobody has decided yet', Object.keys(s.endGame?.continues ?? { x: 1 }).length === 0)
}

console.log('\n— REWARDS_DONE: session-gated, per-player, once —')
{
  const noSession = gameReducer(base(), {
    type: 'ENDGAME_REWARDS_DONE', playerId: 'p1',
  } as Action, rng).state
  check('refused before the game ends', !noSession.endGame)

  let s = gameReducer(base(), { type: 'END_GAME', winnerId: 'p1', condition: 'mission' } as Action, rng).state
  s = gameReducer(s, { type: 'ENDGAME_REWARDS_DONE', playerId: 'p1' } as Action, rng).state
  check('the winner records done', s.endGame?.rewardsDone['p1'] === true)

  s = gameReducer(s, { type: 'ENDGAME_REWARDS_DONE', playerId: 'p2' } as Action, rng).state
  check('a runner-up records done independently', s.endGame?.rewardsDone['p2'] === true && s.endGame?.rewardsDone['p1'] === true)

  const again = gameReducer(s, { type: 'ENDGAME_REWARDS_DONE', playerId: 'p1' } as Action, rng).state
  check('a repeat is a no-op', again === s || again.endGame?.rewardsDone['p1'] === true)

  const ghost = gameReducer(s, { type: 'ENDGAME_REWARDS_DONE', playerId: 'nobody' } as Action, rng).state
  check('an unknown player is refused', ghost.endGame?.rewardsDone['nobody'] === undefined)
}

console.log('\n— CONTINUE: recorded once, never flipped —')
{
  let s = gameReducer(base(), { type: 'END_GAME', winnerId: 'p1', condition: 'elimination' } as Action, rng).state
  s = gameReducer(s, { type: 'ENDGAME_CONTINUE', playerId: 'p1', choice: 'continue' } as Action, rng).state
  check('continue lands', s.endGame?.continues['p1'] === 'continue')

  s = gameReducer(s, { type: 'ENDGAME_CONTINUE', playerId: 'p2', choice: 'quit' } as Action, rng).state
  check('quit lands beside it', s.endGame?.continues['p2'] === 'quit')

  const flip = gameReducer(s, { type: 'ENDGAME_CONTINUE', playerId: 'p2', choice: 'continue' } as Action, rng).state
  check('a decision cannot be flipped', flip.endGame?.continues['p2'] === 'quit')

  const junk = gameReducer(s, { type: 'ENDGAME_CONTINUE', playerId: 'p3', choice: 'maybe' } as never, rng).state
  check('a junk choice coerces to continue', junk.endGame?.continues['p3'] === 'continue')

  const noSession = gameReducer(base(), {
    type: 'ENDGAME_CONTINUE', playerId: 'p1', choice: 'continue',
  } as Action, rng).state
  check('refused before the game ends', !noSession.endGame)
}


// ─── The recap: what the ceremony actually recorded ─────────────────────────
// Game 4 of the Test8 campaign ran its whole ceremony on both screens — the
// winner signed, the runner-up chose on their own machine — and NOTHING
// reached the campaign: no victory entry, no cities, no fortification, while
// the game number still advanced. Nobody found out for a game and a half.
//
// The recap is read back out of the campaign rather than tracked as the
// choices are made, so it shows what was RECORDED. An empty recap is the
// failure, visible at the table, before anyone commits to another game.
{
  const territoryName = (id: string) => ({ peru: 'Peru', brazil: 'Brazil' } as Record<string, string>)[id] ?? id
  const legacy = {
    victoryLog: [{ gameNumber: 4, winnerName: 'ryan', winnerPlayerId: 'p1', factionId: 'bear', winCondition: 'stars' }],
    stickers: [
      { targetId: 'peru', name: 'Peru City', description: 'city:major', appliedInGame: 4, placedByPlayerId: 'p1' },
      { targetId: 'brazil', name: 'Brazil City', description: 'city:minor', appliedInGame: 4, placedByPlayerId: 'p2' },
      { targetId: 'peru', name: 'Fortification', description: 'fortification:10', appliedInGame: 4, placedByPlayerId: 'p1' },
      // An earlier game's city must not appear in this game's recap.
      { targetId: 'egypt', name: 'Old City', description: 'city:major', appliedInGame: 3, placedByPlayerId: 'p2' },
    ],
    scars: [{ territoryId: 'brazil', cancelledInGame: 4, cancelledByPlayerId: 'p2' }],
  }
  const recap = endGameRecap(legacy as never, 4, territoryName)
  const forP1 = recap.find(r => r.playerId === 'p1')?.lines ?? []
  const forP2 = recap.find(r => r.playerId === 'p2')?.lines ?? []
  check('the winner\'s signature is recorded', forP1.some(l => l.includes('Signed the board')))
  check('their major city, by name and place',
    forP1.some(l => l.includes('MAJOR') && l.includes('Peru City') && l.includes('Peru')))
  check('their fortification', forP1.some(l => l.includes('Fortified Peru')))
  check('the runner-up\'s minor city', forP2.some(l => l.includes('Brazil City')))
  check('and their cancelled scar', forP2.some(l => l.includes('Cancelled the scar')))
  check('an earlier game\'s city stays in that game',
    !forP1.concat(forP2).some(l => l.includes('Old City')))
  check('a ceremony that saved NOTHING recaps as nothing — the alarm',
    endGameRecap({ victoryLog: [], stickers: [], scars: [] } as never, 4, territoryName).length === 0)
}


console.log(`
endgametest: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
