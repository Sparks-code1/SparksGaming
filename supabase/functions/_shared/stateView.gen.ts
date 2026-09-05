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
var serverPiles = (state) => state.cards ?? null;
var PILE_PREFIX = "cards:";
var ordersFrom = (piles) => Object.fromEntries(SECRET_DECK_KEYS.filter((k) => Array.isArray(piles[k])).map((k) => [k, piles[k]]));
var withoutOrders = (piles) => ({
  ...piles,
  ...Object.fromEntries(SECRET_DECK_KEYS.filter((k) => Array.isArray(piles[k])).map((k) => [k, []]))
});
var withoutCounts = (piles) => {
  const { territoryDeckCount: _t, resourceDeckCount: _r, ...rest } = piles;
  return rest;
};
var withoutSecrets = (p) => {
  const { cards: _cards, missionCardId: _mission, ...rest } = p;
  return { ...rest, cardCount: p.cards.length };
};
function publicView(state) {
  const cards = activeCards(state);
  const piles = serverPiles(state);
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
    } : {},
    // AND THE SERVER PILES, which travelled untouched until now. Same rule,
    // same key list, different store — the projection has to name both, because
    // there is nothing in the shape of a GameState that makes one findable from
    // the other.
    //
    // The client's OPTIMISTIC apply now draws from an empty territoryDeck, so a
    // face-up card taken locally refills with nothing for the beat before the
    // server's row arrives and corrects it. That is the same trade the legacy
    // decks have always made, and it is the right way round: the alternative is
    // publishing the draw order so the optimistic copy can be prettier. The
    // authoritative refill is computed in apply-action from the hydrated piles,
    // and no client-computed pile is ever written back.
    // THE HEIGHT OF EACH PILE GOES WITH IT. Emptying the arrays hid the order,
    // which was the point — and also hid how many cards were left, which was
    // not: the draw modal read `resourceDeck.length > 0` and showed the coins
    // as gone, and the client could no longer name a card to draw. A pile's
    // height is public in the physical game; the client rebuilds a pile of
    // this length to show and to draw from, and the server deals from the
    // real one.
    ...piles ? {
      cards: {
        ...withoutOrders(piles),
        territoryDeckCount: Array.isArray(piles.territoryDeck) ? piles.territoryDeck.length : 0,
        resourceDeckCount: Array.isArray(piles.resourceDeck) ? piles.resourceDeck.length : 0
      }
    } : {}
  };
}
var HIDDEN_CARD_ID = "hidden-card";
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
  const piles = serverPiles(state);
  return {
    ...cards ? ordersFrom(cards) : {},
    // Namespaced — see PILE_PREFIX. Both stores call their draw pile
    // `territoryDeck`, and match_decks is keyed by name.
    ...piles ? Object.fromEntries(
      Object.entries(ordersFrom(piles)).map(([k, v]) => [PILE_PREFIX + k, v])
    ) : {}
  };
}
function deckOrdersIn(state) {
  const secret = new Set(SECRET_DECK_KEYS);
  const found = [];
  const seen = /* @__PURE__ */ new Set();
  const walk = (node, path) => {
    if (node === null || typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${path}[${i}]`));
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      const at = path ? `${path}.${k}` : k;
      if (secret.has(k) && Array.isArray(v) && v.length > 0) found.push(at);
      else walk(v, at);
    }
  };
  walk(state, "");
  return found;
}
function leaksDeckOrder(state) {
  return deckOrdersIn(state).length > 0;
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
  const piles = serverPiles(view);
  const fromStore = (wanted) => Object.fromEntries(
    Object.entries(decks).filter(([k, v]) => Array.isArray(v) && k.startsWith(PILE_PREFIX) === (wanted === "pile")).map(([k, v]) => [wanted === "pile" ? k.slice(PILE_PREFIX.length) : k, v])
  );
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
          ...fromStore("legacy")
        }
      }
    } : {},
    // The server piles, restored on the same terms: only what came back, and a
    // deck the store did not return is left exactly as the row had it. The
    // counts publicView put beside them are a WIRE artefact — the client
    // rebuilds a pile of that height to show and draw from — and stay off the
    // state the reducer runs on, where the real piles are the truth and a
    // count would only ever be stale.
    ...piles ? { cards: withoutCounts({ ...piles, ...fromStore("pile") }) } : {},
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
  HIDDEN_CARD_ID,
  SECRET_DECK_KEYS,
  SECRET_PLAYER_KEYS,
  deckOrdersIn,
  decksFromState,
  hydrateState,
  leaksDeckOrder,
  leaksOtherSeatsSecrets,
  mergeOwnSecrets,
  publicView,
  secretsFromState,
  viewForSeat
};
