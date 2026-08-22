// Card hands are secret. Everything in matches.state is broadcast to every
// connected client by the realtime changefeed, so a hand is private only if it
// is ABSENT from the projected state — hiding it in the UI hides nothing from
// anyone who opens devtools.
//
// This suite WAS written to fail, when viewForSeat was a stub returning the
// state unchanged. It is not a stub any more and this is green — but the leak
// is still live, because nothing CALLS viewForSeat. A correct projection with
// no caller changes nothing about what crosses the wire, and a unit test cannot
// see the difference. transportwiringtest is the one that can, and it is red.
//
// Live equivalent, on the JOINER's machine with a match open. Read the WIRE,
// not the app — inspecting React state only tells you what the client was sent
// to render, and the question is what crossed the network:
//
//   devtools -> Network -> WS -> the realtime socket -> Messages
//   search a frame for "cards"
//
// Today every frame carries every seat's hand. After step 3, a frame must show
// `cards` only for the seat receiving it, and `cardCount` for the rest.
import { viewForSeat } from '@/lib/stateView'
import type { GameState } from '@/types/game'
import type { Player } from '@/types/player'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

const player = (id: string, cards: string[], missionCardId: string | null): Player => ({
  id, name: id.toUpperCase(), factionId: 'khan' as Player['factionId'], userId: `user-${id}`,
  troops: 3, cards, missionCardId, isEliminated: false, holdsHq: true, wins: 0, winHistory: [],
})

const state = {
  players: [
    player('p1', ['tc-ural', 'tc-peru'], 'mc-6-cities'),
    player('p2', ['tc-siam', 'tc-egypt', 'tc-brazil', 'tc-japan'], 'mc-hq-raid'),
    player('p3', [], null),
  ],
} as unknown as GameState

const online = { online: true }
const seat = (id: string) => viewForSeat(state, id, online).players
const find = (id: string, viewer: string) => seat(viewer).find(p => p.id === id) as Player & { cardCount?: number }

// ── the leak itself ──────────────────────────────────────────────────────────
check('p1 keeps its own hand', find('p1', 'p1').cards, ['tc-ural', 'tc-peru'])
check("p2's hand is ABSENT from p1's view, not merely empty",
  find('p2', 'p1').cards, undefined)
check("p3's empty hand is absent too — an empty array still says 'holds nothing'",
  find('p3', 'p1').cards, undefined)
check('and the same the other way round', find('p1', 'p2').cards, undefined)

// ── what replaces it ─────────────────────────────────────────────────────────
// Everyone needs to know a rival holds four cards; nobody may know which four.
check('p1 can see HOW MANY p2 holds', find('p2', 'p1').cardCount, 4)
check('a count of zero is still published', find('p3', 'p1').cardCount, 0)
check('your own count is published too, so the shape is uniform',
  find('p1', 'p1').cardCount, 2)

// ── the adjacent secret in the same struct ───────────────────────────────────
// Player.missionCardId is commented "secret mission card for this campaign
// game" and lives beside cards. It leaks identically and is in scope for the
// same fix.
check("an opponent's secret mission is absent", find('p2', 'p1').missionCardId, undefined)
check('your own secret mission survives', find('p1', 'p1').missionCardId, 'mc-6-cities')

// ── hotseat must be untouched ────────────────────────────────────────────────
// One screen, one set of eyes: shared state is correct there, and projecting it
// would break the game rather than protect anything.
const hot = viewForSeat(state, 'p1', { online: false }).players
check('hotseat keeps every hand', hot.map(p => p.cards),
  [['tc-ural', 'tc-peru'], ['tc-siam', 'tc-egypt', 'tc-brazil', 'tc-japan'], []])
check('hotseat keeps every mission', hot.map(p => p.missionCardId),
  ['mc-6-cities', 'mc-hq-raid', null])

// ── the projection must not mutate the source ────────────────────────────────
// The server holds the real state; a view is a copy. If projecting edited it in
// place, the seat projected first would strip the hands for everyone after.
check('the source state still holds every hand after projecting',
  state.players.map(p => p.cards.length), [2, 4, 0])

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
