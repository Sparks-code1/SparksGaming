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
import {
  viewForSeat, publicView, secretsFromState, mergeOwnSecrets, hydrateState,
  leaksOtherSeatsSecrets,
} from '@/lib/stateView'
import type { SeatState } from '@/lib/stateView'
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

// A HAND LIVES IN TWO PLACES, and for a long time this fixture had only one of
// them. legacySnapshot.activeGameCards.playerHands is a second complete copy,
// keyed by seat, in the same row — so every "no hand in the projected state"
// assertion below was true of a state that never carried the second copy, and
// publicView stripping only players[].cards passed all of them while leaving
// every hand on the wire.
//
// That is the whole lesson: the fixture did not contain the leak, so the tests
// could not see it. It contains it now.
const state = {
  players: [
    player('p1', ['tc-ural', 'tc-peru'], 'mc-6-cities'),
    player('p2', ['tc-siam', 'tc-egypt', 'tc-brazil', 'tc-japan'], 'mc-hq-raid'),
    player('p3', [], null),
  ],
  legacySnapshot: {
    activeGameCards: {
      gameNumber: 1,
      playerHands: {
        p1: ['tc-ural', 'tc-peru'],
        p2: ['tc-siam', 'tc-egypt', 'tc-brazil', 'tc-japan'],
        p3: [],
      },
      playerMissions: { p1: 'mc-6-cities', p2: 'mc-hq-raid' },
      // The DECK ORDERS, which are also in this object and are also public.
      // They are not a per-seat secret — nobody may see them — so they cannot go
      // in match_secrets and are not fixed here. See the check at the foot.
      territoryDeck: ['tc-next-1', 'tc-next-2'],
      territoryDiscard: ['tc-seen'],
      eventDeck: ['ev-next'],
      eventDiscard: [],
      missionDeck: ['mc-next'],
      resourceDeck: ['res-next'],
      sideboard: ['tc-face-1'],
    },
  },
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

// ── the shared row: nobody's hand, everybody's count ───────────────────────
// The projection the leak actually turns on. matches.state is ONE record
// delivered whole to every subscriber, so the only safe content is content with
// no seat's secrets in it at all — including the seat that happens to be first
// in the list, which is where an off-by-one in a per-seat projection would hide.
{
  const shared = publicView(state)
  check('the shared row carries no hand at all',
    shared.players.map(p => p.cards), [undefined, undefined, undefined])
  check('...and no secret mission either',
    shared.players.map(p => p.missionCardId), [undefined, undefined, undefined])
  check('...while every count survives',
    shared.players.map(p => p.cardCount), [2, 4, 0])
  // Said from the other end, with the function the client asserts with. If this
  // ever disagrees with the three above, one of them is wrong about what a
  // secret is.
  check('and no seat can find a foreign secret in it',
    ['p1', 'p2', 'p3'].map(id => leaksOtherSeatsSecrets(shared, id)), [false, false, false])
  check('the source state is not mutated by projecting it',
    state.players.map(p => p.cards.length), [2, 4, 0])

  // THE SECOND COPY. Everything above is about players[]; this is the same hands
  // again, one level down, and stripping one without the other strips nothing.
  const legacy = (v: SeatState) =>
    (v as unknown as { legacySnapshot: { activeGameCards: { playerHands: Record<string, string[]> } } })
      .legacySnapshot.activeGameCards.playerHands
  check('the legacy snapshot carries no hand either', legacy(shared), {})
  // Named explicitly, because "the object is empty" would also be true of a
  // publicView that deleted the whole block and broke every reader of it.
  check('...while the block itself survives',
    Object.keys((shared as unknown as { legacySnapshot: { activeGameCards: object } })
      .legacySnapshot.activeGameCards).includes('territoryDeck'), true)
  check('...and the fixture really did carry hands there to begin with',
    Object.keys(legacy(state as unknown as SeatState)).sort(), ['p1', 'p2', 'p3'])
}

// ── strip and rehydrate is the identity ────────────────────────────────────
// The server writes publicView to the row and secretsFromState to the store,
// then rebuilds the reducer's input from both. If that round trip is not exact,
// the split silently rewrites the game — a lost card looks like a legal move.
{
  // Key ORDER changes across the round trip (the secrets are re-attached last),
  // and key order is not meaning. Compared canonically so a reordering does not
  // read as a difference, and a real difference still does.
  const canonical = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(canonical)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.keys(v as object).sort()
          .map(k => [k, canonical((v as Record<string, unknown>)[k])]))
        : v

  const rebuilt = hydrateState(publicView(state), secretsFromState(state))
  check('publicView + secretsFromState + hydrateState returns the original state',
    canonical(rebuilt), canonical(state))
  // And the check above is only worth anything if the two sides differ before
  // rehydration, or it would pass on a publicView that stripped nothing.
  check('...and the stripped row really was different',
    JSON.stringify(canonical(publicView(state))) === JSON.stringify(canonical(state)), false)
}

// ── a missing secrets row is an error, never an empty hand ─────────────────
// The failure this refuses: "holds no cards" and "cards were not loaded" are
// the same value and completely different facts, and the second one destroys a
// hand on the next write.
{
  const shared = publicView(state)
  const partial = secretsFromState(state)
  delete (partial as Record<string, unknown>).p2
  let threw = ''
  try { hydrateState(shared, partial) } catch (e) { threw = String(e) }
  check('hydrating without a seat throws rather than emptying its hand',
    /p2/.test(threw), true)
  check('...and says why', /unloaded|refusing/i.test(threw), true)
}

// ── a match written before the split still works ──────────────────────────
// Deploying this must not break a game in progress. Those rows still carry the
// hands inline; they are used as they stand, and the match writes the new shape
// on its next action.
{
  const legacy = hydrateState(state as unknown as SeatState, {})
  check('a pre-split row hydrates from its inline hands',
    legacy.players.map(p => p.cards.length), [2, 4, 0])
}

// ── the client puts back its own, and only its own ────────────────────────
{
  const shared = publicView(state)
  const mine = {
    cards: ['tc-ural', 'tc-peru'],
    missionCardId: 'mc-6-cities',
    legacyHand: ['tc-ural', 'tc-peru'],
    legacyMission: 'mc-6-cities',
  }
  const merged = mergeOwnSecrets(shared, 'p1', mine)
  check('the seat gets its own hand back', merged.players[0].cards, ['tc-ural', 'tc-peru'])
  check('...and its own mission', merged.players[0].missionCardId, 'mc-6-cities')
  check('...while the others stay absent',
    merged.players.slice(1).map(p => p.cards), [undefined, undefined])
  check('...so the merged state still leaks nothing',
    leaksOtherSeatsSecrets(merged, 'p1'), false)
  // The seat's own second copy comes back too, or the legacy readers see an
  // empty hand for the player holding cards.
  check('the seat gets its legacy hand back as well',
    (merged as unknown as { legacySnapshot: { activeGameCards: { playerHands: Record<string, string[]> } } })
      .legacySnapshot.activeGameCards.playerHands, { p1: ['tc-ural', 'tc-peru'] })
  // Before the secrets arrive there is simply nothing to merge, and the board
  // has to render anyway rather than wait.
  check('no secrets yet is the public state unchanged',
    JSON.stringify(mergeOwnSecrets(shared, 'p1', null)), JSON.stringify(shared))
}

// ── the assertion looks in both places ────────────────────────────────────
// leaksOtherSeatsSecrets is what the client runs on every frame. It checked
// players[] only, so it returned false — "nothing leaked" — on state carrying
// every hand in the legacy snapshot. An assertion that looks in one of the two
// places a secret lives is an assertion that passes while the secret travels.
{
  const halfStripped = {
    ...publicView(state),
    legacySnapshot: (state as unknown as { legacySnapshot: object }).legacySnapshot,
  } as unknown as SeatState
  check('a foreign hand in the legacy snapshot is caught',
    leaksOtherSeatsSecrets(halfStripped, 'p1'), true)
  check('...and the seat\'s own is not mistaken for one',
    leaksOtherSeatsSecrets(
      mergeOwnSecrets(publicView(state), 'p1',
        { cards: [], missionCardId: null, legacyHand: ['tc-ural'], legacyMission: null }),
      'p1'),
    false)
}

// ── what is STILL public, said out loud ───────────────────────────────────
// The deck orders sit in the same object as the hands and are not stripped.
// They are not a per-seat secret — no player may see the order of the draw pile
// — so they cannot go in match_secrets, which is read-your-own. They belong in
// match_decks, which nobody may read, and moving them there is step 3.
//
// Listed rather than asserted away, because the list IS the finding: when one
// moves, this fails and reports the shorter list.
{
  const shared = publicView(state) as unknown as
    { legacySnapshot: { activeGameCards: Record<string, unknown> } }
  const cards = shared.legacySnapshot.activeGameCards
  const stillPublic = ['territoryDeck', 'eventDeck', 'missionDeck', 'resourceDeck']
    .filter(k => Array.isArray(cards[k]) && (cards[k] as unknown[]).length > 0)
  check('deck orders are still in the shared row — step 3 moves them to match_decks',
    stillPublic, ['territoryDeck', 'eventDeck', 'missionDeck', 'resourceDeck'])
  // The discards genuinely are public — face up on the table — so they stay.
  check('...while the discards are public by rule and stay',
    Array.isArray(cards.territoryDiscard), true)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
