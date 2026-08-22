// AUTO-GENERATED — DO NOT EDIT.
//
// Built from src/lib/stateView.ts by scripts/build-edge-shared.mjs.
// Edit the source and re-run `npm run build:edge`.
//
// This is the exact state projections the client runs. The server MUST run the same
// bytes: a divergence here is two machines disagreeing while both believe they
// agree.

// src/lib/stateView.ts
var SECRET_DECK_KEYS = [
  "territoryDeck",
  "eventDeck",
  "missionDeck",
  "resourceDeck",
  "coinDeck"
];
var activeCards = (state) => state.legacySnapshot?.activeGameCards ?? null;
var legacyHands = (state) => activeCards(state)?.playerHands ?? {};
var legacyMissions = (state) => activeCards(state)?.playerMissions ?? {};
var withoutSecrets = (p) => {
  const { cards: _cards, missionCardId: _mission, ...rest } = p;
  return { ...rest, cardCount: p.cards.length };
};
function publicView(state) {
  const cards = activeCards(state);
  return {
    ...state,
    players: state.players.map(withoutSecrets),
    // Emptied, not deleted: the legacy block has a shape the rest of the app
    // reads, and removing the key would make every consumer handle an absence
    // that only happens on the wire. Each seat's own entry is put back on
    // arrival, the same way players[].cards is.
    //
    ...cards ? {
      legacySnapshot: {
        ...state.legacySnapshot,
        activeGameCards: {
          ...cards,
          playerHands: {},
          playerMissions: {},
          // Emptied rather than removed, for the same reason the hands are: the
          // keys have a shape the app reads, and an absent key is a different
          // thing for every consumer to handle. A length of zero is also
          // honest — the client genuinely does not know how many are left,
          // and pretending it does would be a smaller lie of the same kind.
          ...Object.fromEntries(SECRET_DECK_KEYS.filter((k) => k in cards).map((k) => [k, []]))
        }
      }
    } : {}
  };
}
function secretsFromState(state) {
  const hands = legacyHands(state);
  const missions = legacyMissions(state);
  return Object.fromEntries(state.players.map((p) => [p.id, {
    cards: p.cards,
    missionCardId: p.missionCardId,
    legacyHand: hands[p.id] ?? [],
    legacyMission: missions[p.id] ?? null
  }]));
}
function decksFromState(state) {
  const cards = activeCards(state);
  if (!cards) return {};
  return Object.fromEntries(SECRET_DECK_KEYS.filter((k) => Array.isArray(cards[k])).map((k) => [k, cards[k]]));
}
function leaksDeckOrder(state) {
  const cards = activeCards(state);
  if (!cards) return false;
  return SECRET_DECK_KEYS.some((k) => Array.isArray(cards[k]) && cards[k].length > 0);
}
function mergeOwnSecrets(view, seatId, secrets) {
  if (!secrets) return view;
  const cards = activeCards(view);
  return {
    ...view,
    players: view.players.map((p) => p.id === seatId ? { ...p, cards: secrets.cards, missionCardId: secrets.missionCardId } : p),
    ...cards ? {
      legacySnapshot: {
        ...view.legacySnapshot,
        activeGameCards: {
          ...cards,
          playerHands: { ...cards.playerHands, [seatId]: secrets.legacyHand ?? [] },
          playerMissions: secrets.legacyMission ? { ...cards.playerMissions, [seatId]: secrets.legacyMission } : cards.playerMissions
        }
      }
    } : {}
  };
}
function hydrateState(view, secrets, decks) {
  const cards = activeCards(view);
  const restoredHands = { ...legacyHands(view) };
  const restoredMissions = { ...legacyMissions(view) };
  for (const [seat, held] of Object.entries(secrets)) {
    if (held.legacyHand) restoredHands[seat] = held.legacyHand;
    if (held.legacyMission) restoredMissions[seat] = held.legacyMission;
  }
  return {
    ...view,
    ...cards ? {
      legacySnapshot: {
        ...view.legacySnapshot,
        activeGameCards: {
          ...cards,
          playerHands: restoredHands,
          playerMissions: restoredMissions,
          // Only what the store actually returned. A deck missing from it is
          // left as it stands in the row — which for a match written before
          // this split is the real order, and for one written after is the
          // empty array publicView left. Overwriting with [] either way would
          // shuffle a live game's draw pile into nothing on its next action.
          ...Object.fromEntries(Object.entries(decks).filter(([, v]) => Array.isArray(v)))
        }
      }
    } : {},
    players: view.players.map((p) => {
      const { cardCount: _n, ...rest } = p;
      const held = secrets[p.id];
      if (held) return { ...rest, cards: held.cards, missionCardId: held.missionCardId };
      if (p.cards) return { ...rest, cards: p.cards, missionCardId: p.missionCardId ?? null };
      throw new Error(
        `no secrets for seat ${p.id}: refusing to treat an unloaded hand as an empty one`
      );
    })
    // Cast at the boundary: spreading legacySnapshot widens it to a partial, and
    // the pieces put back are exactly the ones taken out.
  };
}
function viewForSeat(state, seatId, opts) {
  if (!opts.online) return state;
  return mergeOwnSecrets(publicView(state), seatId, secretsFromState(state)[seatId] ?? null);
}
var SECRET_PLAYER_KEYS = ["cards", "missionCardId"];
function leaksOtherSeatsSecrets(state, seatId) {
  if (state.players.some((p) => p.id !== seatId && SECRET_PLAYER_KEYS.some((k) => k in p))) return true;
  const hands = legacyHands(state);
  return Object.keys(hands).some((id) => id !== seatId && (hands[id]?.length ?? 0) > 0);
}
export {
  SECRET_DECK_KEYS,
  SECRET_PLAYER_KEYS,
  decksFromState,
  hydrateState,
  leaksDeckOrder,
  leaksOtherSeatsSecrets,
  mergeOwnSecrets,
  publicView,
  secretsFromState,
  viewForSeat
};
