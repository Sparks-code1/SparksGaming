/**
 * The treachery deck: drawing, and what happens when it runs out.
 *
 * Separate from ./bidding.ts on purpose. The auction is card-blind — it decides
 * who pays what for the Nth card and never learns which card that is — so the
 * dealing lives here, where the deck is actually held. Putting them in one file
 * would put the deck one careless import away from the phase whose state is
 * public.
 *
 * WHERE THE PILES LIVE. The draw pile is in match_decks, which has RLS on and no
 * read policy at all: only the service role sees it. The DISCARD is public and
 * belongs in matches.state — a treachery discard is face up at a table, and the
 * spice blow reads the top of its own discard the same way. That split is why
 * these functions take the two piles as separate arguments instead of one
 * object: they come from different places with different visibility, and a
 * signature that bundled them would invite storing them together.
 */

/**
 * Deal `count` cards, reshuffling the discard back in if the draw pile is short.
 *
 * PURE, with the shuffle's randomness injected. Same contract as the rest of
 * lib/dune: no Math.random, no Date.now. A deal that could not be replayed from
 * a seed would make every auction unauditable, which matters more here than
 * almost anywhere else — this is the phase where players spend real spice on a
 * card nobody can see.
 *
 * "Excluding cards in hands" needs no code. A card in a hand is in neither pile,
 * so a reshuffle built from the discard cannot contain one; the phrase rules out
 * rebuilding the deck from the full 33-card list, which nothing here does.
 *
 * @param draw     the pile, top first
 * @param discard  the public discard, most recent first
 * @param count    how many to deal
 * @param shuffle  takes a list, returns it reordered. Injected, so a match can
 *                 be replayed exactly from its seed.
 */
export function drawTreachery(
  draw: readonly string[],
  discard: readonly string[],
  count: number,
  shuffle: (cards: readonly string[]) => string[],
): { drawn: string[]; draw: string[]; discard: string[]; reshuffled: boolean } {
  if (count < 0 || !Number.isInteger(count)) {
    throw new Error(`cannot deal ${count} treachery cards`)
  }

  const drawn: string[] = []
  let pile = [...draw]
  let used = [...discard]
  let reshuffled = false

  while (drawn.length < count) {
    if (pile.length === 0) {
      // Nothing left to reshuffle either: the deck is genuinely exhausted, with
      // every card sitting in somebody's hand. Refusing is right — dealing fewer
      // cards than the auction was told to expect would leave it asking for bids
      // on a card that does not exist.
      if (used.length === 0) {
        throw new Error(
          `the treachery deck is empty and so is the discard: ${count - drawn.length} more `
          + 'card(s) were asked for, and every remaining card is in a hand',
        )
      }
      // Reshuffled ONCE per deal at most, because the discard is emptied into
      // the pile in one go. A loop that reshuffled per card would shuffle a
      // one-card pile repeatedly and look like it was doing something.
      pile = shuffle(used)
      used = []
      reshuffled = true
    }
    drawn.push(pile[0])
    pile = pile.slice(1)
  }

  return { drawn, draw: pile, discard: used, reshuffled }
}

/**
 * Put cards nobody bought onto the discard.
 *
 * Face up, and that is a real consequence rather than an implementation detail:
 * a card offered and unwanted becomes public knowledge, so everyone learns what
 * was in the deck without anyone paying for it. Most recent first, matching the
 * order drawTreachery reads them back in.
 */
export function discardUnsold(discard: readonly string[], unsold: readonly string[]): string[] {
  return [...unsold, ...discard]
}

/**
 * A deterministic shuffle, from a seed.
 *
 * The reshuffle needs randomness and the rest of lib/dune is not allowed any, so
 * it comes from a number the match already stores. Same argument as the reducer's
 * seeded rng: a shuffle nobody can replay makes every auction after it
 * unauditable, and this is the phase where players spend real spice on a card
 * they cannot see.
 *
 * mulberry32 and Fisher–Yates, both written out rather than pulled in — this
 * bundle has to run on Deno with nothing polyfilled, and a dependency here would
 * be a dependency in the edge function.
 */
export function shuffleWithSeed(seed: number, cards: readonly string[]): string[] {
  let a = (seed >>> 0) || 1
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const out = [...cards]
  // Backwards, which is the version of Fisher–Yates that is uniform. The forward
  // one that looks the same is not, and the difference is invisible in a test
  // that only checks the result is a permutation.
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
