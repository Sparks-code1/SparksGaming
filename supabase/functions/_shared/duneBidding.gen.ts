// AUTO-GENERATED — DO NOT EDIT.
//
// Built from src/lib/dune/bidding.ts by scripts/build-edge-shared.mjs.
// Edit the source and re-run `npm run build:edge`.
//
// This is the exact treachery auction the client runs. The server MUST run the same
// bytes: a divergence here is two machines disagreeing while both believe they
// agree.

// src/lib/dune/phase.ts
var awaitingBy = (from, ask, carry, closesAt) => ({ status: "awaiting", need: "required", from, ask, carry, closesAt });
var settled = (result) => ({ status: "settled", result });

// src/lib/dune/bidding.ts
var MINIMUM_OPENING_BID = 1;
var BID_SECONDS = 15;
var BETWEEN_CARDS_SECONDS = 15;
function cardsOnOffer(order, hands, limits) {
  return order.filter((f) => (hands[f] ?? 0) < (limits[f] ?? 0)).length;
}
var underLimit = (c, f) => (c.hands[f] ?? 0) < (c.limits[f] ?? 0);
var contenders = (c) => c.order.filter((f) => underLimit(c, f) && !c.passed.includes(f));
function nextBidder(c, from) {
  const live = contenders(c).filter((f) => f !== c.high?.faction);
  if (live.length === 0) return null;
  const n = c.order.length;
  const at = c.order.indexOf(from);
  for (let i = 1; i <= n; i++) {
    const f = c.order[(at + i) % n];
    if (live.includes(f)) return f;
  }
  return null;
}
function openerFor(c, index) {
  const n = c.order.length;
  if (n === 0) return null;
  for (let i = 0; i < n; i++) {
    const f = c.order[(index + i) % n];
    if (underLimit(c, f)) return f;
  }
  return null;
}
var askFor = (c) => ({
  kind: "treachery-bid",
  index: c.index,
  cardCount: c.cardCount,
  high: c.high,
  minimum: c.high ? c.high.spice + 1 : MINIMUM_OPENING_BID,
  hands: c.hands,
  pauseUntil: c.pauseUntil
});
function openCard(c, closesAt) {
  let next = c;
  for (; ; ) {
    if (next.index >= next.cardCount) {
      return settled({
        turn: next.turn,
        awards: next.awards,
        unsold: next.unsold,
        hands: next.hands
      });
    }
    const opener = openerFor(next, next.index);
    if (opener) {
      const fresh = { ...next, high: null, passed: [], toAct: opener };
      return awaitingBy([opener], askFor(fresh), fresh, closesAt);
    }
    next = { ...next, unsold: [...next.unsold, next.index], index: next.index + 1 };
  }
}
function closeCard(c, won, closesAt, pause) {
  const after = won ? {
    ...c,
    awards: [...c.awards, won],
    hands: { ...c.hands, [won.winner]: (c.hands[won.winner] ?? 0) + 1 },
    index: c.index + 1,
    pauseUntil: pause?.until
  } : {
    ...c,
    unsold: [
      ...c.unsold,
      ...Array.from({ length: c.cardCount - c.index }, (_, k) => c.index + k)
    ],
    index: c.cardCount,
    pauseUntil: void 0
  };
  return openCard(after, pause ? pause.thenClosesAt : closesAt);
}
function beginAuction(input) {
  const carry = {
    turn: input.turn,
    order: [...input.order],
    hands: { ...input.hands },
    limits: { ...input.limits },
    cardCount: Math.min(
      cardsOnOffer(input.order, input.hands, input.limits),
      input.cardCap ?? Number.POSITIVE_INFINITY
    ),
    index: 0,
    high: null,
    passed: [],
    toAct: input.order[0] ?? "",
    awards: [],
    unsold: []
  };
  return openCard(carry, input.closesAt);
}
function answerBid(carry, from, answer, spiceHeld, closesAt, pause) {
  const refuse = (refusal) => ({ kind: "refused", refusal, faction: from, step: awaitingBy([carry.toAct], askFor(carry), carry, closesAt) });
  if (from !== carry.toAct) return refuse("not-your-turn");
  if (carry.passed.includes(from)) return refuse("already-passed");
  if (!underLimit(carry, from)) return refuse("at-your-hand-limit");
  if (answer.kind === "bid") {
    const minimum = carry.high ? carry.high.spice + 1 : MINIMUM_OPENING_BID;
    if (!Number.isInteger(answer.spice) || answer.spice < minimum) return refuse("below-the-minimum");
    if (answer.spice > spiceHeld) return refuse("more-than-you-hold");
    const raised = { ...carry, high: { faction: from, spice: answer.spice } };
    const next2 = nextBidder(raised, from);
    if (!next2) {
      return { kind: "ok", step: closeCard(raised, { index: raised.index, winner: from, price: answer.spice }, closesAt, pause) };
    }
    return { kind: "ok", step: awaitingBy([next2], askFor({ ...raised, toAct: next2 }), { ...raised, toAct: next2 }, closesAt) };
  }
  const passedNow = { ...carry, passed: [...carry.passed, from] };
  const next = nextBidder(passedNow, from);
  if (!next) {
    return {
      kind: "ok",
      step: passedNow.high ? closeCard(passedNow, { index: passedNow.index, winner: passedNow.high.faction, price: passedNow.high.spice }, closesAt, pause) : closeCard(passedNow, null, closesAt, pause)
    };
  }
  return { kind: "ok", step: awaitingBy([next], askFor({ ...passedNow, toAct: next }), { ...passedNow, toAct: next }, closesAt) };
}
var silenceAnswers = { kind: "pass" };
export {
  BETWEEN_CARDS_SECONDS,
  BID_SECONDS,
  MINIMUM_OPENING_BID,
  answerBid,
  beginAuction,
  cardsOnOffer,
  silenceAnswers
};
