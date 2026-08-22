// AUTO-GENERATED — DO NOT EDIT.
//
// Built from src/lib/dune/spice.ts by scripts/build-edge-shared.mjs.
// Edit the source and re-run `npm run build:edge`.
//
// This is the exact spice ledger the client runs. The server MUST run the same
// bytes: a divergence here is two machines disagreeing while both believe they
// agree.

// src/lib/dune/spice.ts
var BANK = "bank";
var heldBy = (purses, who) => who === BANK ? Number.POSITIVE_INFINITY : purses[who] ?? 0;
function applySpiceMoves(purses, moves) {
  const next = { ...purses };
  for (const move of moves) {
    if (!Number.isInteger(move.amount)) return { ok: false, refusal: "not-a-whole-number", move };
    if (move.amount <= 0) return { ok: false, refusal: "not-positive", move };
    if (move.from === move.to) return { ok: false, refusal: "same-holder", move };
    if (move.from !== BANK && (next[move.from] ?? 0) < move.amount) {
      return { ok: false, refusal: "insufficient-spice", move };
    }
    if (move.from !== BANK) next[move.from] = (next[move.from] ?? 0) - move.amount;
    if (move.to !== BANK) next[move.to] = (next[move.to] ?? 0) + move.amount;
  }
  return { ok: true, purses: next, applied: moves };
}
function netFromBank(moves) {
  return moves.reduce((n, m) => n + (m.from === BANK ? m.amount : 0) - (m.to === BANK ? m.amount : 0), 0);
}
function payForTreachery(input) {
  const { winner, price, seated } = input;
  if (price <= 0) return [];
  const emperorPlaying = seated.includes("emperor");
  const to = emperorPlaying && winner !== "emperor" ? "emperor" : BANK;
  return [{ from: winner, to, amount: price, reason: "treachery-bid" }];
}
function payForAuction(awards, seated) {
  return awards.flatMap((a) => payForTreachery({ winner: a.winner, price: a.price, seated }));
}
export {
  BANK,
  applySpiceMoves,
  heldBy,
  netFromBank,
  payForAuction,
  payForTreachery
};
