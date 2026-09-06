import { readFileSync } from 'node:fs'
import { controlledHqTerritoryIds } from '@/lib/gameLogic'
import type { Territory } from '@/types/territory'
// A red star is every HQ you control — your own included.
//
// This rule has gone both ways. 348f9ca (2026-08-15) took the own HQ out of
// every count after a game ended two captures early, on the reading that a
// red star is an HQ you TOOK. The table plays the rulebook line instead — an
// HQ is worth a red star to whoever controls it — so a faction sits on one
// star from its first turn and needs three more, and the HUD shows it
// (2026-09-06: "each faction should have a red star for their HQ but the HUD
// isn't showing anything unless a faction took over someone else's HQ").
//
// The AI had counted it this way all along, through controlledHqTerritoryIds
// (aitest: "captured HQ still counts", with the own one in every fixture).
// The board's eight copies of the other rule now count through the same
// function, so the two can no longer disagree and no copy can drift alone.
let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`}`)
}
/** Comments out, so a pin can never be satisfied by its own explanation. */
const bare = (src: string) => src.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}/g, '')

const terr = (id: string, owner: string | null, hq?: string): Territory =>
  ({ id, name: id, occupyingPlayerId: owner, troops: 3, activeHqPlayerId: hq, cities: [], scars: [], adjacentIds: [] } as unknown as Territory)

console.log('\n— what counts as a red star on the board —')
{
  // Mid-game: p1 kept its HQ and took p2's; p2 lost its own and took p3's;
  // p3 holds ground but no HQ at all.
  const board = {
    home:  terr('home', 'p1', 'p1'),     // p1's own HQ, held
    taken: terr('taken', 'p1', 'p2'),    // p2's HQ, captured by p1
    lost:  terr('lost', 'p2', 'p3'),     // p3's HQ, held by p2
    plain: terr('plain', 'p1'),          // ground, no HQ on it
    field: terr('field', 'p3'),          // p3's remaining ground
  }
  const stars = (pid: string) => controlledHqTerritoryIds(pid, board).length
  check('your own HQ, held, is a star', controlledHqTerritoryIds('p1', board).includes('home'), true)
  check('an HQ you took is a star', controlledHqTerritoryIds('p1', board).includes('taken'), true)
  check('ground with no HQ on it is not', controlledHqTerritoryIds('p1', board).includes('plain'), false)
  check('p1 holds two stars on the board', stars('p1'), 2)
  check('p2 lost its own HQ — that star is p1\'s now — and holds one taken from p3', stars('p2'), 1)
  check('p3 lost its HQ and took none: no star', stars('p3'), 0)

  // The first turn: everyone sits on their own HQ and nothing else.
  const opening = {
    a: terr('a', 'p1', 'p1'), b: terr('b', 'p2', 'p2'), c: terr('c', 'p3', 'p3'),
  }
  check('a faction sits on one star from its first turn',
    ['p1', 'p2', 'p3'].map(pid => controlledHqTerritoryIds(pid, opening).length), [1, 1, 1])
}

console.log('\n— the board counts through the one function —')
{
  const board = bare(readFileSync('src/components/GameBoard.tsx', 'utf8'))
  check('no copy of the own-HQ exclusion survives on the board',
    /activeHqPlayerId !== (playerId|p\.id|player\.id|depletion\.playerId)/.test(board), false)
  check('every star count on the board goes through controlledHqTerritoryIds — HUD, win check, coin-deck award, star powers, join-war re-entry, readout',
    (board.match(/controlledHqTerritoryIds\([^)]*\)\.length/g) ?? []).length >= 8, true)
  const reducer = bare(readFileSync('src/lib/gameReducer.ts', 'utf8'))
  check('the Mobile HQ check still asks for your OWN HQ, which is a different question',
    /from\.activeHqPlayerId !== action\.playerId/.test(reducer), true)
}

console.log(pass ? '\nall red-star pins hold' : '\nFAILED')
process.exit(pass ? 0 : 1)
