// AUTO-GENERATED — DO NOT EDIT.
//
// Built from src/lib/dune/auctionSettlement.ts by scripts/build-edge-shared.mjs.
// Edit the source and re-run `npm run build:edge`.
//
// This is the exact auction settlement the client runs. The server MUST run the same
// bytes: a divergence here is two machines disagreeing while both believe they
// agree.

// src/lib/dune/spice.ts
var BANK = "bank";
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

// src/lib/dune/auctionSettlement.ts
function settleAuction(input) {
  const { result, cards, hands, purses, seated } = input;
  const offered = result.awards.length + result.unsold.length;
  if (cards.length !== offered) {
    return {
      ok: false,
      refusal: "wrong-number-of-cards",
      detail: `the auction settled ${offered} card(s) and ${cards.length} were drawn`
    };
  }
  const claimed = [...result.awards.map((a) => a.index), ...result.unsold].sort((a, b) => a - b);
  const expected = cards.map((_, i) => i);
  if (JSON.stringify(claimed) !== JSON.stringify(expected)) {
    return {
      ok: false,
      refusal: "a-card-was-lost",
      detail: `indices accounted for were [${claimed}], expected [${expected}]`
    };
  }
  const moves = payForAuction(result.awards, seated);
  const paid = applySpiceMoves(purses, moves);
  if (!paid.ok) {
    return {
      ok: false,
      refusal: "a-winner-cannot-pay",
      detail: `${paid.move.from} owes ${paid.move.amount} and cannot pay it (${paid.refusal})`
    };
  }
  const secrets = {};
  const touch = (who) => {
    if (!secrets[who]) {
      secrets[who] = { hand: [...hands[who] ?? []], spice: paid.purses[who] ?? 0 };
    }
    return secrets[who];
  };
  for (const award of result.awards) touch(award.winner).hand.push(cards[award.index]);
  for (const move of moves) {
    if (move.from !== "bank") touch(move.from);
    if (move.to !== "bank") touch(move.to);
  }
  return {
    ok: true,
    writes: { secrets, discard: result.unsold.map((i) => cards[i]), moves }
  };
}
export {
  settleAuction
};
