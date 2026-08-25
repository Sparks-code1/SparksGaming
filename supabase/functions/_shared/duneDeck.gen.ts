// AUTO-GENERATED — DO NOT EDIT.
//
// Built from src/lib/dune/treacheryDeck.ts by scripts/build-edge-shared.mjs.
// Edit the source and re-run `npm run build:edge`.
//
// This is the exact treachery deck the client runs. The server MUST run the same
// bytes: a divergence here is two machines disagreeing while both believe they
// agree.

// src/lib/dune/treacheryDeck.ts
function drawTreachery(draw, discard, count, shuffle) {
  if (count < 0 || !Number.isInteger(count)) {
    throw new Error(`cannot deal ${count} treachery cards`);
  }
  const drawn = [];
  let pile = [...draw];
  let used = [...discard];
  let reshuffled = false;
  while (drawn.length < count) {
    if (pile.length === 0) {
      if (used.length === 0) {
        throw new Error(
          `the treachery deck is empty and so is the discard: ${count - drawn.length} more card(s) were asked for, and every remaining card is in a hand`
        );
      }
      pile = shuffle(used);
      used = [];
      reshuffled = true;
    }
    drawn.push(pile[0]);
    pile = pile.slice(1);
  }
  return { drawn, draw: pile, discard: used, reshuffled };
}
function discardUnsold(discard, unsold) {
  return [...unsold, ...discard];
}
function seededRng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function shuffleWithSeed(seed, cards) {
  const next = seededRng(seed);
  const out = [...cards];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
export {
  discardUnsold,
  drawTreachery,
  seededRng,
  shuffleWithSeed
};
