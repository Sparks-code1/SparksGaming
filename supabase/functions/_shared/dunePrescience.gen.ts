// AUTO-GENERATED — DO NOT EDIT.
//
// Built from src/lib/dune/prescience.ts by scripts/build-edge-shared.mjs.
// Edit the source and re-run `npm run build:edge`.
//
// This is the exact Atreides prescience the client runs. The server MUST run the same
// bytes: a divergence here is two machines disagreeing while both believe they
// agree.

// src/lib/dune/prescience.ts
var PRESCIENT_FACTION = "atreides";
var REVEAL_KEY = "prescience";
function prescienceFor(input) {
  const { seated, lot, index } = input;
  if (!seated.includes(PRESCIENT_FACTION)) return null;
  if (!Number.isInteger(index) || index < 0 || index >= lot.length) return null;
  return { faction: PRESCIENT_FACTION, card: lot[index] };
}
function withReveal(secrets, reveal) {
  const next = { ...secrets };
  if (reveal) next[REVEAL_KEY] = reveal.card;
  else delete next[REVEAL_KEY];
  return next;
}
export {
  PRESCIENT_FACTION,
  REVEAL_KEY,
  prescienceFor,
  withReveal
};
