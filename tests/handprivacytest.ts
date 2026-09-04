import { readFileSync } from 'node:fs'
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
  leaksOtherSeatsSecrets, leaksDeckOrder, decksFromState, SECRET_DECK_KEYS,
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

  // The SEAT half of the round trip: hands back, decks deliberately not passed.
  // This used to be the whole of it and used to return the original exactly.
  // It no longer can, and that is the point — the decks are not in the row and
  // not in the secrets, so nothing here can produce them. An incomplete
  // rehydration that still matched would mean they never left.
  const seatsOnly = hydrateState(publicView(state), secretsFromState(state), {})
  check('the hands come back from the secrets alone',
    (seatsOnly as unknown as { players: { cards: string[] }[] }).players.map(p => p.cards.length),
    [2, 4, 0])
  check('...but the decks do not, because they are not the seats\' to hold',
    JSON.stringify(canonical(seatsOnly)) === JSON.stringify(canonical(state)), false)
  // And the stripped row really was different, or a publicView that stripped
  // nothing would satisfy everything above.
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
  try { hydrateState(shared, partial, {}) } catch (e) { threw = String(e) }
  check('hydrating without a seat throws rather than emptying its hand',
    /p2/.test(threw), true)
  check('...and says why', /unloaded|refusing/i.test(threw), true)
}

// ── a match written before the split still works ──────────────────────────
// Deploying this must not break a game in progress. Those rows still carry the
// hands inline; they are used as they stand, and the match writes the new shape
// on its next action.
{
  const legacy = hydrateState(state as unknown as SeatState, {}, {})
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

// ── the deck orders ───────────────────────────────────────────────────────
// Nobody's secret, and therefore nobody may read them: there is no player
// entitled to know the next territory card. So they cannot go in match_secrets,
// which is read-your-own and would need an owner for each; they go to
// match_decks, which has no read policy at all.
//
// THE CONTROL COMES FIRST, and it is not a formality. The legacy hands got
// through because this fixture had no legacySnapshot at all, so every claim
// that a hand was absent was true of a state that never carried one. An
// "is it gone" check on a fixture that never had it is not a weak check, it is
// a check of nothing.
{
  const cards = (v: unknown) =>
    (v as { legacySnapshot?: { activeGameCards?: Record<string, unknown> } })
      .legacySnapshot?.activeGameCards ?? {}

  const seeded = SECRET_DECK_KEYS
    .filter(k => Array.isArray(cards(state)[k]) && (cards(state)[k] as unknown[]).length > 0)
  check('THE FIXTURE HOLDS DECKS to begin with',
    seeded, ['territoryDeck', 'eventDeck', 'missionDeck', 'resourceDeck'])

  const shared = publicView(state)
  const left = SECRET_DECK_KEYS
    .filter(k => Array.isArray(cards(shared)[k]) && (cards(shared)[k] as unknown[]).length > 0)
  check('...and the shared row carries none of them', left, [])
  // Emptied, not deleted. Removing the keys would make every reader of the
  // legacy block handle an absence that happens only on the wire.
  check('...the keys survive, holding nothing',
    SECRET_DECK_KEYS.filter(k => k in cards(state)).every(k => Array.isArray(cards(shared)[k])), true)

  // The discards are face up on the table. Stripping them would be a bug of the
  // opposite kind, and one nothing else here would notice.
  check('the discards stay public, because they are face up',
    [(cards(shared).territoryDiscard as string[]).length > 0,
      Array.isArray(cards(shared).sideboard)], [true, true])

  // What goes to the store, and that it is the real order rather than a count.
  check('every seeded deck is handed to the deck store',
    Object.keys(decksFromState(state)).sort(),
    ['eventDeck', 'missionDeck', 'resourceDeck', 'territoryDeck'])
  check('...with the order intact',
    decksFromState(state).territoryDeck, ['tc-next-1', 'tc-next-2'])
  check('a state with no legacy block hands over no decks',
    decksFromState({ players: [] } as unknown as GameState), {})

  // The runtime assertion for decks is its own function, because it asks a
  // different question. leaksOtherSeatsSecrets is per seat — "is somebody
  // ELSE's secret here" — and a deck is nobody's, so its presence is a leak for
  // every reader at once, including the one holding the state.
  check('a deck order in the state is caught', leaksDeckOrder(state as unknown as SeatState), true)
  check('...and the projected row is clean', leaksDeckOrder(shared), false)
  check('...while the per-seat assertion never noticed it either way',
    leaksOtherSeatsSecrets(state as unknown as SeatState, 'p1')
      === leaksOtherSeatsSecrets(shared, 'p1'), false)
}

// ── the whole round trip, decks included ──────────────────────────────────
// Strip to the row, hand the pieces to their two stores, put it all back. If
// this is not exact the split silently rewrites the game, and a reshuffled draw
// pile is the kind of wrong that looks like luck.
{
  const canonical = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(canonical)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.keys(v as object).sort()
          .map(k => [k, canonical((v as Record<string, unknown>)[k])]))
        : v

  const rebuilt = hydrateState(publicView(state), secretsFromState(state), decksFromState(state))
  check('public row + secrets + decks rebuilds the original exactly',
    canonical(rebuilt), canonical(state))

  // A match written before the decks moved still has them inline, and no rows
  // in the store. Hydrating must leave them where they are rather than
  // overwrite a live draw pile with nothing.
  const legacyRow = hydrateState(state as unknown as SeatState, {}, {})
  check('a pre-split row keeps its decks when the store has none',
    (legacyRow as unknown as { legacySnapshot: { activeGameCards: { territoryDeck: string[] } } })
      .legacySnapshot.activeGameCards.territoryDeck, ['tc-next-1', 'tc-next-2'])
}

// ── the reply channel ─────────────────────────────────────────────────────
// viewForSeat projects the state that goes back in the ACTION RESPONSE — one
// copy of the whole game, over HTTP, to the seat that just acted. A private
// channel is still a channel.
//
// IT LEAKED TWICE, and both times for the same reason: it walked players[]
// itself. It never learned about the second copy of the hands in the legacy
// snapshot, and it never learned about the deck orders. Each was added to
// publicView, and nothing forced either to reach here — the tests below did not
// exist, so the suite was green through both.
//
// It is composed now: the public row plus this seat's own secrets, which is also
// what the client holds after merging. The two agree by construction instead of
// by two implementations happening to match.
{
  const mine = viewForSeat(state, 'p1', online)
  const cards = (v: unknown) =>
    (v as { legacySnapshot: { activeGameCards: Record<string, unknown> } })
      .legacySnapshot.activeGameCards

  // The seat's own, in BOTH the places a hand lives.
  check('the acting seat gets its own hand', mine.players[0].cards, ['tc-ural', 'tc-peru'])
  check('...and its own legacy copy of it',
    cards(mine).playerHands, { p1: ['tc-ural', 'tc-peru'] })
  check('...and its own mission', mine.players[0].missionCardId, 'mc-6-cities')

  // Nobody else's, in both places.
  check('no other seat\'s hand', mine.players.slice(1).map(p => p.cards), [undefined, undefined])
  check('...and no other seat in the legacy copy either',
    Object.keys(cards(mine).playerHands as object), ['p1'])
  check('...which is what the assertion says too',
    leaksOtherSeatsSecrets(mine, 'p1'), false)

  // AND NO DECK AT ALL. Not even the acting seat's — there is no seat's-own half
  // of a draw pile. This is where the composition earns itself: mergeOwnSecrets
  // restores a hand and nothing else, so a deck cannot come back by accident.
  check('no draw order reaches the seat that acted',
    SECRET_DECK_KEYS.filter(k => Array.isArray(cards(mine)[k]) && (cards(mine)[k] as unknown[]).length > 0),
    [])
  check('...which the deck assertion agrees with', leaksDeckOrder(mine), false)
  // The control: the state it was projected from really did carry them.
  check('...and the source state really did hold one',
    leaksDeckOrder(state as unknown as SeatState), true)

  // The face-up piles survive, or the reply is missing what the board draws.
  check('the discards still reach the seat', cards(mine).territoryDiscard, ['tc-seen'])
  check('...and the sideboard', cards(mine).sideboard, ['tc-face-1'])

  // Every seat, not just the first: an off-by-one here would be invisible above.
  check('the same holds for every seat',
    ['p1', 'p2', 'p3'].map(id => {
      const v = viewForSeat(state, id, online)
      return leaksOtherSeatsSecrets(v, id) || leaksDeckOrder(v)
    }), [false, false, false])
}

// ── The client has to survive the shape the projection produces ───────────
//
// A PROJECTION WITH NO READER IS THE SAME BUG ONE STEP LATER. viewForSeat and
// publicView are correct and called, and then GameBoard crashed on what they
// produce: 'p.cards is not iterable', because the display mirror spread
// players[].cards for EVERY seat and after the split only the reading seat has
// one. Both browsers went down at HQ placement — the first action in the match,
// which is the write that applies publicView and heals a pre-split deal.
console.log('--- the display mirror reads a projected board ---')
{
  const board = readFileSync('src/components/GameBoard.tsx', 'utf8')
  const at = board.indexOf('mirrorServerCardsRef.current = ')
  const fn = at < 0 ? '' : board.slice(at, at + 2200)

  check('the mirror carries only the seats it can see',
    /\.filter\(p => Array\.isArray\(p\.cards\)\)/.test(fn), true)
  check('...and no longer spreads every seat\'s hand',
    /s\.players\.map\(p => \[p\.id, \[\.\.\.p\.cards\]\]\)/.test(fn), false)

  // ABSENT, NOT EMPTY. An empty array asserts a player holds nothing, which is
  // false; absence says this client cannot see them, and cardCount is the
  // honest number. Every reader already takes `?? []`.
  check('...and does not pretend an unseen hand is an empty one',
    /\[p\.id, \[\]\]/.test(fn), false)
}

// THE ONE READER THAT NEEDED THE COUNT INSTEAD. Mindshackle offers a trade
// against a player whose ground you took, and asked the display mirror whether
// they hold anything — which online is a question this client cannot answer.
// Off cardCount it can: the number is public, and only the reducer needs the
// cards themselves, on the server, with the real thing.
{
  const board = readFileSync('src/components/GameBoard.tsx', 'utf8')
  const at = board.indexOf('const holds = (vid: string)')
  const fn = at < 0 ? '' : board.slice(at, at + 700)
  check('the Mindshackle victim check reads the count',
    /p\.cardCount \?\? 0/.test(fn), true)
  check('...rather than a hand it cannot see',
    /newCardState\.playerHands\[vid\]/.test(board), false)
}

// AND THE HOTSEAT CARD PATHS ARE UNAFFECTED, checked rather than assumed: all
// four sites that mutate players[].cards sit inside `if (!onlineMatchRef...)`,
// and hotseat is returned by viewForSeat unprojected, so every player has a
// hand there. The concern was an AI seat driven by the host — real in shape,
// but those paths never run online.
{
  const board = readFileSync('src/components/GameBoard.tsx', 'utf8')
  const spreads = [...board.matchAll(/\{ \.\.\.p, cards: (?:\[\.\.\.p\.cards|p\.cards\.filter)/g)]
  check('every direct hand mutation is hotseat-only',
    spreads.every(m => {
      const before = board.slice(Math.max(0, m.index - 400), m.index)
      return /if \(!onlineMatchRef\.current\) \{/.test(before)
    }), true)
  check('...and there are still four of them', spreads.length, 4)
}


console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
