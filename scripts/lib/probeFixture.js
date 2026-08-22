/**
 * The smallest match that can take one real turn.
 *
 * check-seat-privacy.mjs seeds state directly, which exercises the transport but
 * never the server: publicView only runs inside apply-action, so a check that
 * never calls apply-action cannot prove it runs. This fixture is what lets one
 * genuine call be made cheaply, instead of playing a game to get to one.
 *
 * END_REINFORCE_PHASE IS THE PROBE for three reasons. It is on the server's
 * allow-list; its whole implementation is "if the phase is reinforce and you are
 * the current player, set the phase to attack", so it needs no territories, no
 * troop counts and no deck; and it changes something observable, so a version
 * that did not move means the write did not happen rather than that nothing
 * needed writing.
 *
 * The state is deliberately minimal, and the minimum is checked rather than
 * guessed: probewritepathtest runs this fixture through the REAL reducer and
 * fails if it stops being accepted. A fixture that the server would reject is
 * worse than none, because the call comes back 4xx and looks like a privacy
 * result.
 */

/** The seat that acts. Must be players[currentPlayerIndex] or the server refuses. */
export const PROBE_ACTOR = 'p1'

/** The action. On SERVER_ACTIONS, and about as small as an action gets. */
export const PROBE_ACTION = { type: 'END_REINFORCE_PHASE', playerId: PROBE_ACTOR }

/** What the reducer should do to the fixture — asserted locally before use. */
export const PROBE_EXPECTED_PHASE = 'attack'

/**
 * A state in the reinforce phase with p1 to act.
 *
 * THIS IS THE WHOLE BOARD, hands and decks included — not the public half.
 * probeSeed derives the public half FROM it, and a projection needs something to
 * strip: with empty hands here, "the row carries no hand" was true because
 * nothing ever had one, which is the vacuity that let the legacy snapshot leak
 * through in the first place.
 *
 * What the script seeds into match_secrets is its own tagged pair, not these.
 * These exist so the derivation can be tested.
 *
 * @param {string} campaignId
 * @param {string} mark  woven into the deck ids, so a caller can search for its own
 */
export function probeState(campaignId = 'probe', mark = 'probe') {
  return {
    id: 'probe-match',
    campaignId,
    gameNumber: 1,
    phase: 'reinforce',
    currentPlayerIndex: 0,
    turnNumber: 1,
    players: [
      { id: 'p1', name: 'A', factionId: 'khan-industries', color: '#111', cards: [mark + '-hand-1'], missionCardId: mark + '-mission-1', isEliminated: false },
      { id: 'p2', name: 'B', factionId: 'imperial-balkania', color: '#222', cards: [mark + '-hand-2'], missionCardId: mark + '-mission-2', isEliminated: false },
    ],
    // One each, so the board is coherent without being a real game. Nothing in
    // END_REINFORCE_PHASE reads them; they are here so anything that walks the
    // board incidentally does not trip over an empty map.
    territories: {
      a: { id: 'a', name: 'a', continentId: 'south-america', adjacentIds: ['b'], occupyingPlayerId: 'p1', troops: 3, scars: [], cities: [] },
      b: { id: 'b', name: 'b', continentId: 'south-america', adjacentIds: ['a'], occupyingPlayerId: 'p2', troops: 2, scars: [], cities: [] },
    },
    deck: [],
    discardPile: [],
    winnerId: null,
    // A REAL legacy block, with real draw orders. The probe exists to watch the
    // server move these OUT of the row, and a fixture with empty piles would
    // make "no deck in the row" true before the server ran — the same mistake
    // the legacy hands made, asserting an absence against something that was
    // never there.
    //
    // The hands stay empty here: this is the PUBLIC half, and they come from
    // match_secrets.
    legacySnapshot: {
      activeGameCards: {
        gameNumber: 1,
        // The SECOND copy of the same hands, which is where they hid last time.
        playerHands: { p1: [mark + '-hand-1'], p2: [mark + '-hand-2'] },
        playerMissions: { p1: mark + '-mission-1' },
        territoryDeck: [mark + '-tc-1', mark + '-tc-2'],
        eventDeck: [mark + '-ev-1'],
        missionDeck: [mark + '-mc-1'],
        resourceDeck: [mark + '-res-1'],
        // Face up, and must SURVIVE the projection. Stripping these would be
        // the opposite bug, and nothing else here would notice it.
        territoryDiscard: ['tc-face-up'],
        eventDiscard: [],
        sideboard: ['tc-sideboard'],
      },
    },
    activeHqs: {},
    turn: {
      captured: false, captureCount: 0, conqueredIds: [], conqueredViaSeaIds: [],
      bearTrapTerritoryId: null, attackedTerritoryIds: [], shieldedTerritoryIds: [],
      placedThisTurn: {},
      expandedIntoCity: false,
      richCardsTradedIn: 0, resourcesTradedIn: 0, knockedOutRichPlayer: false,
      continentsAtTurnStart: 0, eligibleForRichCard: false, richCardTerritoryIds: [],
    },
  }
}

/**
 * The two halves of the seed, derived from one board.
 *
 * The script used to build these inline, and building them by hand went wrong
 * twice in one edit: it reached into an activeGameCards the fixture did not have
 * (a crash), and it declared territoryDeck twice in the same literal — emptied
 * first, real order second — so the later one won and the seed would have
 * written the draw order straight into the row it was about to assert was clean.
 *
 * Neither mistake was catchable by reading the script's text, because both halves
 * are DERIVED: the guard sees `territoryDeck: boardCards.territoryDeck` and finds
 * no secret in it. So the derivation lives here and is tested by running it —
 * the same reason the checker and the realtime diagnosis were extracted.
 *
 * @param {string} campaignId
 * @param {string} mark  woven into the deck ids so a caller can search for its own
 */
export function probeSeed(campaignId, mark) {
  const board = probeState(campaignId, mark)
  const cards = board.legacySnapshot.activeGameCards

  /** The piles that must leave the row. Named once, used for both halves. */
  const deckKeys = ['territoryDeck', 'eventDeck', 'missionDeck', 'resourceDeck']

  /** What goes to match_decks: the real order, one row per pile. */
  const decks = Object.fromEntries(deckKeys.map(k => [k, cards[k]]))

  /** What goes in matches.state: publicView's shape. */
  const publicHalf = {
    ...board,
    players: board.players.map(p => {
      const { cards: _c, missionCardId: _m, ...rest } = p
      return { ...rest, cardCount: 1 }
    }),
    legacySnapshot: {
      ...board.legacySnapshot,
      activeGameCards: {
        ...cards,
        playerHands: {},
        playerMissions: {},
        // Emptied from the SAME list the store is filled from, so the two
        // cannot disagree about which piles are secret.
        ...Object.fromEntries(deckKeys.map(k => [k, []])),
      },
    },
  }

  return { board, publicHalf, decks }
}
