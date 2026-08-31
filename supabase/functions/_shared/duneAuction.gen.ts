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
function allyShare(cost, ownPurse) {
  const own = Math.min(cost, Math.max(0, ownPurse));
  return { own, ally: cost - own };
}
function payForAuction(awards, seated) {
  return awards.flatMap((a) => payForTreachery({ winner: a.winner, price: a.price, seated }));
}

// src/lib/dune/auctionSettlement.ts
var BONUS_FACTION = "harkonnen";
function bonusCardsDue(awards, handAfter, limit) {
  const won = awards.filter((a) => a.winner === BONUS_FACTION).length;
  return Math.max(0, Math.min(won, limit - handAfter));
}
function settleCard(input) {
  const { award, card, hands, purses, seated } = input;
  const bonus = input.bonus ?? [];
  const moves = (award.winner === input.freeFor ? [] : payForAuction([award], seated)).flatMap((m) => {
    if (m.from !== award.winner || !input.ally) return [m];
    const share = allyShare(m.amount, purses[award.winner] ?? 0);
    if (share.ally <= 0) return [m];
    return [
      ...share.own > 0 ? [{ ...m, amount: share.own }] : [],
      { ...m, from: input.ally, amount: share.ally }
    ];
  }).filter((m) => m.from !== m.to);
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
  touch(award.winner).hand.push(card);
  for (const move of moves) {
    if (move.from !== "bank") touch(move.from);
    if (move.to !== "bank") touch(move.to);
  }
  const limit = input.limits?.[BONUS_FACTION] ?? Infinity;
  const handAfter = (secrets[BONUS_FACTION]?.hand ?? hands[BONUS_FACTION] ?? []).length;
  const due = Math.min(
    bonusCardsDue([award], handAfter, limit),
    input.deckHolds ?? Infinity
  );
  if (due > bonus.length) {
    return {
      ok: false,
      refusal: "not-enough-bonus-cards",
      detail: `${BONUS_FACTION} is due ${due} extra card(s) and ${bonus.length} were supplied`
    };
  }
  for (let i = 0; i < due; i++) touch(BONUS_FACTION).hand.push(bonus[i]);
  return { ok: true, writes: { secrets, discard: [], moves } };
}
function settleAuction(input) {
  const { result, cards, hands, purses, seated } = input;
  const bonus = input.bonus ?? [];
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
  let runningHands = { ...hands };
  let runningPurses = { ...purses };
  const secrets = {};
  const moves = [];
  let bonusTaken = 0;
  for (const award of result.awards) {
    const before = (runningHands[BONUS_FACTION] ?? []).length;
    const one = settleCard({
      award,
      card: cards[award.index],
      hands: runningHands,
      purses: runningPurses,
      seated,
      // The bonus cards not yet used, so a second award takes the ones after
      // the first's rather than dealing the same card twice.
      bonus: bonus.slice(bonusTaken),
      limits: input.limits
    });
    if (!one.ok) return one;
    const bonusHand = one.writes.secrets[BONUS_FACTION]?.hand;
    if (bonusHand) {
      const ownCard = award.winner === BONUS_FACTION ? 1 : 0;
      bonusTaken += Math.max(0, bonusHand.length - before - ownCard);
    }
    for (const [who, write] of Object.entries(one.writes.secrets)) {
      secrets[who] = write;
      runningHands = { ...runningHands, [who]: write.hand };
      runningPurses = { ...runningPurses, [who]: write.spice };
    }
    moves.push(...one.writes.moves);
  }
  return {
    ok: true,
    writes: { secrets, discard: result.unsold.map((i) => cards[i]), moves }
  };
}
export {
  BONUS_FACTION,
  bonusCardsDue,
  settleAuction,
  settleCard
};
