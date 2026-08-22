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
 * `cards` are EMPTY here on purpose. This is the PUBLIC half — the shape the row
 * holds — and the hands live in match_secrets, which the server reads back and
 * merges before the reducer sees them. Putting hands here would seed the leak
 * being tested for, which is the mistake this whole check made once already.
 *
 * @param {string} campaignId
 */
export function probeState(campaignId = 'probe') {
  return {
    id: 'probe-match',
    campaignId,
    gameNumber: 1,
    phase: 'reinforce',
    currentPlayerIndex: 0,
    turnNumber: 1,
    players: [
      { id: 'p1', name: 'A', factionId: 'khan-industries', color: '#111', cards: [], isEliminated: false },
      { id: 'p2', name: 'B', factionId: 'imperial-balkania', color: '#222', cards: [], isEliminated: false },
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
    legacySnapshot: {},
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
