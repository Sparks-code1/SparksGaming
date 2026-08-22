// AUTO-GENERATED — DO NOT EDIT.
//
// Built from src/lib/stateView.ts by scripts/build-edge-shared.mjs.
// Edit the source and re-run `npm run build:edge`.
//
// This is the exact state projections the client runs. The server MUST run the same
// bytes: a divergence here is two machines disagreeing while both believe they
// agree.

// src/lib/stateView.ts
var withoutSecrets = (p) => {
  const { cards: _cards, missionCardId: _mission, ...rest } = p;
  return { ...rest, cardCount: p.cards.length };
};
function publicView(state) {
  return { ...state, players: state.players.map(withoutSecrets) };
}
function secretsFromState(state) {
  return Object.fromEntries(state.players.map((p) => [p.id, { cards: p.cards, missionCardId: p.missionCardId }]));
}
function mergeOwnSecrets(view, seatId, secrets) {
  if (!secrets) return view;
  return {
    ...view,
    players: view.players.map((p) => p.id === seatId ? { ...p, cards: secrets.cards, missionCardId: secrets.missionCardId } : p)
  };
}
function hydrateState(view, secrets) {
  return {
    ...view,
    players: view.players.map((p) => {
      const { cardCount: _n, ...rest } = p;
      const held = secrets[p.id];
      if (held) return { ...rest, cards: held.cards, missionCardId: held.missionCardId };
      if (p.cards) return { ...rest, cards: p.cards, missionCardId: p.missionCardId ?? null };
      throw new Error(
        `no secrets for seat ${p.id}: refusing to treat an unloaded hand as an empty one`
      );
    })
  };
}
function viewForSeat(state, seatId, opts) {
  if (!opts.online) return state;
  return {
    ...state,
    players: state.players.map((p) => p.id === seatId ? { ...p, cardCount: p.cards.length } : withoutSecrets(p))
  };
}
var SECRET_PLAYER_KEYS = ["cards", "missionCardId"];
function leaksOtherSeatsSecrets(state, seatId) {
  return state.players.some((p) => p.id !== seatId && SECRET_PLAYER_KEYS.some((k) => k in p));
}
export {
  SECRET_PLAYER_KEYS,
  hydrateState,
  leaksOtherSeatsSecrets,
  mergeOwnSecrets,
  publicView,
  secretsFromState,
  viewForSeat
};
