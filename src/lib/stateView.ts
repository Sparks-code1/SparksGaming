/**
 * What a given seat is allowed to see.
 *
 * Everything in `matches.state` reaches every connected client: the realtime
 * subscription is a Postgres changefeed, which delivers the whole row, and RLS
 * gates whether you receive a row rather than which parts of it. So a secret is
 * only secret if it is not in that row — hiding it in the UI hides nothing from
 * anyone willing to open devtools.
 *
 * This module is the one place that decides the answer. See
 * docs/hidden-state-and-simultaneity.md.
 */
import type { GameState } from '@/types/game'
import type { Player } from '@/types/player'

/**
 * A player as a seat sees them.
 *
 * `cards` and `missionCardId` become optional because for everyone but you they
 * are genuinely ABSENT, not empty — an empty array still tells the table you are
 * holding nothing, which is information the physical game does not give away.
 * The optionality is the point: code that reads them has to say which case it is
 * in, and the compiler names every site that does not.
 */
export type SeatPlayer = Omit<Player, 'cards' | 'missionCardId'> & {
  cards?: string[]
  missionCardId?: string | null
  /** How many cards they hold. Public — everyone may know the size of a hand. */
  cardCount?: number
}

export type SeatState = Omit<GameState, 'players'> & { players: SeatPlayer[] }

export interface ViewOptions {
  /**
   * Hotseat shares one screen, so shared state is correct there and no
   * projection should happen. Only an online match has opponents on machines of
   * their own.
   */
  online: boolean
}

/** What a seat keeps in its own match_secrets row. */
export interface SeatSecrets {
  cards: string[]
  missionCardId: string | null
  /**
   * THE SAME HAND AGAIN, from inside the legacy snapshot.
   *
   * `legacySnapshot.activeGameCards.playerHands` is a second, complete copy of
   * every player's hand, keyed by seat, living in the same row. Stripping
   * players[].cards and leaving it behind changes nothing: the hand is still
   * there, one level down, in a field nobody was looking at.
   *
   * It is carried per seat rather than restored from `cards`, because they are
   * two stores that are ALLOWED to disagree mid-turn — the legacy snapshot is
   * written at campaign checkpoints and the live hand moves during play — and
   * rebuilding one from the other would quietly fix up a difference that means
   * something.
   */
  legacyHand: string[]
  /** Dead field (missions became shared), still per-seat, still travelling. */
  legacyMission: string | null
}

/**
 * The deck orders, which are nobody's secret and therefore everybody's problem.
 *
 * A hand belongs to a seat, and that seat may see it — which is what
 * match_secrets is for. A DECK belongs to nobody. There is no player entitled
 * to know the next territory card, so there is no seat to scope a policy to and
 * match_secrets cannot hold them: a row there is readable by its owner, and
 * every deck would need an owner.
 *
 * They go to match_decks instead, which has RLS on and no policy at all, so only
 * the service role can reach it. The client never gets these back — unlike a
 * hand, there is no half of a deck a seat is allowed to see.
 *
 * NOT IN HERE, on purpose:
 *   territoryDiscard, eventDiscard   face up on the table; public by rule
 *   sideboard                        the four face-up territory cards
 *   currentMissionId                 the shared face-up mission
 *
 * coinDeck is the pre-rename alias of resourceDeck. Included because an old save
 * can still carry it, and an alias holding the same order is the same leak.
 */
export const SECRET_DECK_KEYS = [
  'territoryDeck', 'eventDeck', 'missionDeck', 'resourceDeck', 'coinDeck',
] as const

/** The legacy card block, if this state has one. Optional all the way down: it
 *  is absent on a fresh match and null between games. */
const activeCards = (state: { legacySnapshot?: unknown }) =>
  (state.legacySnapshot as { activeGameCards?: Record<string, unknown> } | undefined)?.activeGameCards ?? null

const legacyHands = (state: { legacySnapshot?: unknown }): Record<string, string[]> =>
  (activeCards(state)?.playerHands as Record<string, string[]> | undefined) ?? {}

const legacyMissions = (state: { legacySnapshot?: unknown }): Record<string, string> =>
  (activeCards(state)?.playerMissions as Record<string, string> | undefined) ?? {}

/**
 * THE SECOND DECK STORE, and the reason this file had a leak in it for months.
 *
 * There are two pile stores, not one. `legacySnapshot.activeGameCards` is the
 * campaign blob's, and `GameState.cards` — ServerCardPiles — is the online
 * match's contended piles, added when the piles moved server-side. Everything
 * in this module went through `activeCards()`, which reads the first and has
 * never heard of the second, so `state.cards.territoryDeck` travelled on the
 * shared row in full view of every subscriber: the next territory card, and the
 * whole order behind it, public for the life of every online match.
 *
 * `sideboard` and `territoryDiscard` stay where they are. They are face up on
 * the table by rule, and SECRET_DECK_KEYS already excludes them.
 */
const serverPiles = (state: { cards?: unknown }): Record<string, unknown> | null =>
  (state.cards as Record<string, unknown> | null | undefined) ?? null

/**
 * Rows from the server piles are namespaced, because both stores use the SAME
 * deck names and match_decks is keyed by (match_id, deck). Unprefixed, the
 * campaign's territoryDeck and the match's territoryDeck are one row, and
 * whichever is written second silently destroys the other. The `deck` column is
 * unconstrained text, so this needs no migration.
 */
const PILE_PREFIX = 'cards:'

/** Every secret draw pile in one pile object, by name. */
const ordersFrom = (piles: Record<string, unknown>): Record<string, string[]> =>
  Object.fromEntries(SECRET_DECK_KEYS
    .filter(k => Array.isArray(piles[k]))
    .map(k => [k, piles[k] as string[]]))

/**
 * The same pile object with every secret order emptied.
 *
 * Emptied rather than deleted, for both stores and for the same reason: the
 * keys have a shape the app reads, and a length of zero is honest — the client
 * genuinely does not know what is left.
 */
const withoutOrders = <T extends Record<string, unknown>>(piles: T): T => ({
  ...piles,
  ...Object.fromEntries(SECRET_DECK_KEYS
    .filter(k => Array.isArray(piles[k]))
    .map(k => [k, []])),
})

/**
 * The pile object with publicView's height fields removed — the inverse of the
 * counts it adds on the way out, applied on the way back in. A hydrated state
 * carries the real piles; a count beside them is only ever stale.
 */
const withoutCounts = <T extends Record<string, unknown>>(piles: T): T => {
  const { territoryDeckCount: _t, resourceDeckCount: _r, ...rest } = piles
  return rest as T
}

/**
 * A player with their secrets removed and a count left in their place.
 *
 * Rebuilt without the secret keys rather than set to undefined: a key present
 * with an undefined value still serialises into the payload as `"cards": null`
 * through some paths, and the requirement is ABSENCE.
 */
const withoutSecrets = (p: Player): SeatPlayer => {
  const { cards: _cards, missionCardId: _mission, ...rest } = p
  return { ...rest, cardCount: p.cards.length }
}

/**
 * The state the SHARED ROW may carry: nobody's hand, everybody's count.
 *
 * This is the one that closes the leak, and it is not viewForSeat with a
 * different argument. `matches.state` is a single row delivered whole to every
 * subscriber by the changefeed — there is no per-seat version of it — so the
 * only state that can safely live there is state with NO seat's secrets in it.
 * A projection that kept one seat's cards would be correct for exactly one
 * reader and wrong for all the others receiving the same bytes.
 *
 * Each seat gets its own hand back from match_secrets, which is RLS'd to that
 * seat, and merges it on arrival.
 */
export function publicView(state: GameState): SeatState {
  const cards = activeCards(state)
  const piles = serverPiles(state)
  return {
    ...state,
    players: state.players.map(withoutSecrets),
    // Emptied, not deleted: the legacy block has a shape the rest of the app
    // reads, and removing the key would make every consumer handle an absence
    // that only happens on the wire. Each seat's own entry is put back on
    // arrival, the same way players[].cards is.
    //
    ...(cards ? {
      legacySnapshot: {
        ...(state.legacySnapshot as object),
        activeGameCards: {
          ...cards,
          playerHands: {},
          playerMissions: {},
          // Emptied rather than removed, for the same reason the hands are: the
          // keys have a shape the app reads, and an absent key is a different
          // thing for every consumer to handle. A length of zero is also
          // honest — the client genuinely does not know how many are left,
          // and pretending it does would be a smaller lie of the same kind.
          ...Object.fromEntries(SECRET_DECK_KEYS
            .filter(k => k in cards)
            .map(k => [k, []])),
        },
      },
    } : {}),
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
    ...(piles ? {
      cards: {
        ...withoutOrders(piles),
        territoryDeckCount: Array.isArray(piles.territoryDeck) ? (piles.territoryDeck as unknown[]).length : 0,
        resourceDeckCount: Array.isArray(piles.resourceDeck) ? (piles.resourceDeck as unknown[]).length : 0,
      },
    } : {}),
  } as SeatState
}

/**
 * What stands in for a face-down card on the client.
 *
 * The shared row carries the piles' heights and not their order, so the client
 * rebuilds each pile as this many copies of one id that names no card. It is
 * what a coin draw sends as `cardId` (the reducer deals the real top from its
 * own pile and never reads it), what the client's optimistic run puts in the
 * hand for the beat before the seat's secrets row replaces it, and what
 * CardHand declines to render because it is neither a territory card nor a
 * coin. cardCoinValue falls back to 1 for an unknown id, which for a coin is
 * the right value.
 */
export const HIDDEN_CARD_ID = 'hidden-card'

/**
 * What each seat's match_secrets row must hold, keyed by seat id.
 *
 * Derived from the state rather than tracked alongside it, so the hand in the
 * secrets store and the count in the public row are always two views of one
 * fact and cannot drift.
 */
export function secretsFromState(state: GameState): Record<string, SeatSecrets> {
  const hands = legacyHands(state)
  const missions = legacyMissions(state)
  return Object.fromEntries(state.players.map(p => [p.id, {
    cards: p.cards,
    missionCardId: p.missionCardId,
    legacyHand: hands[p.id] ?? [],
    legacyMission: missions[p.id] ?? null,
  }]))
}

/**
 * What match_decks must hold for this match, keyed by deck name.
 *
 * One row per deck, which is what the table's (match_id, deck) key is shaped
 * for. Only the keys this state actually has: a game that never had a coinDeck
 * should not gain an empty one on its first write.
 */
export function decksFromState(state: GameState): Record<string, string[]> {
  const cards = activeCards(state)
  const piles = serverPiles(state)
  return {
    ...(cards ? ordersFrom(cards) : {}),
    // Namespaced — see PILE_PREFIX. Both stores call their draw pile
    // `territoryDeck`, and match_decks is keyed by name.
    ...(piles ? Object.fromEntries(
      Object.entries(ordersFrom(piles)).map(([k, v]) => [PILE_PREFIX + k, v])) : {}),
  }
}

/**
 * Every place this state carries a secret deck order, as a path.
 *
 * Separate from leaksOtherSeatsSecrets because it is a different claim. That one
 * asks "is somebody ELSE's secret here", which is answered per seat. A deck is
 * nobody's, so there is no seat to ask about — its presence is a leak for every
 * reader at once, including the one holding the state.
 *
 * IT WALKS THE WHOLE STATE, and that is the entire point of this shape.
 *
 * The version before it asked `activeCards(state)` — the same helper, and so
 * the same single location, that the projection uses. A guard built out of the
 * projection's idea of where secrets live cannot catch the projection missing a
 * place, because it is missing the same place: `GameState.cards` carried the
 * draw order on the shared row of every online match, and this function
 * cheerfully returned false the whole time. That is not a bug that gets caught
 * by adding the second location to both — it is a bug that comes back the third
 * time somebody puts cards somewhere new.
 *
 * So the only thing shared with publicView now is the list of what is SECRET, a
 * name at a time, which is the one thing that should have a single definition.
 * Where to look is not a list any more; it is everywhere.
 *
 * Returns PATHS rather than a boolean so a failure names the field. "A deck
 * order is on the wire" sent people to the legacy block for months.
 */
export function deckOrdersIn(state: unknown): string[] {
  const secret = new Set<string>(SECRET_DECK_KEYS)
  const found: string[] = []
  const seen = new Set<object>()
  const walk = (node: unknown, path: string) => {
    if (node === null || typeof node !== 'object') return
    if (seen.has(node)) return          // a cycle, or the same object twice
    seen.add(node)
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${path}[${i}]`))
      return
    }
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const at = path ? `${path}.${k}` : k
      if (secret.has(k) && Array.isArray(v) && v.length > 0) found.push(at)
      else walk(v, at)
    }
  }
  walk(state, '')
  return found
}

export function leaksDeckOrder(state: SeatState): boolean {
  return deckOrdersIn(state).length > 0
}

/**
 * Put a seat's own hand back into the public state it just received.
 *
 * The client half of the split. Only ever this seat's — the others are not
 * withheld here, they were never sent.
 */
export function mergeOwnSecrets(
  view: SeatState, seatId: string, secrets: SeatSecrets | null,
): SeatState {
  if (!secrets) return view
  const cards = activeCards(view)
  return {
    ...view,
    players: view.players.map(p => p.id === seatId
      ? { ...p, cards: secrets.cards, missionCardId: secrets.missionCardId }
      : p),
    ...(cards ? {
      legacySnapshot: {
        ...(view.legacySnapshot as object),
        activeGameCards: {
          ...cards,
          playerHands: { ...(cards.playerHands as object), [seatId]: secrets.legacyHand ?? [] },
          playerMissions: secrets.legacyMission
            ? { ...(cards.playerMissions as object), [seatId]: secrets.legacyMission }
            : (cards.playerMissions as object),
        },
      },
    } : {}),
  } as SeatState
}

/**
 * Rebuild whole state from the public row plus every seat's secrets.
 *
 * The SERVER half. The reducer needs real hands to run, and the row no longer
 * carries them, so they are read back out of match_secrets and put in.
 *
 * A missing secrets row is an ERROR, never an empty hand. "This player holds no
 * cards" and "this player's cards were not loaded" are the same value and
 * completely different facts, and the second one silently destroys a hand on
 * the next write.
 *
 * The one exception is a row written BEFORE this split existed, which still has
 * the hands inline. Those are accepted and used, so deploying this does not
 * break a game already in progress: the first action in such a match reads the
 * legacy shape, writes the new one, and the match is clean from then on. No
 * backfill, no downtime — but the legacy branch is also the leak, so a match
 * only stops leaking once somebody takes a turn in it.
 */
export function hydrateState(
  view: SeatState,
  secrets: Record<string, SeatSecrets>,
  // REQUIRED, with no default. A default made forgetting it silent: the edge
  // function kept reading the deck rows and quietly stopped passing them, the
  // decks came back empty, and every check still passed. An argument you must
  // supply is the cheapest possible guard against forgetting to.
  decks: Record<string, string[]>,
): GameState {
  const cards = activeCards(view)
  const piles = serverPiles(view)
  // Back to the store each row came from. They travel in one map because
  // apply_match_write takes one, and the prefix is what tells them apart on the
  // way home — unrouted, the campaign's draw pile would land in the match's
  // piles and the reducer would deal a game out of the wrong deck.
  const fromStore = (wanted: 'legacy' | 'pile') => Object.fromEntries(
    Object.entries(decks)
      .filter(([k, v]) => Array.isArray(v) && k.startsWith(PILE_PREFIX) === (wanted === 'pile'))
      .map(([k, v]) => [wanted === 'pile' ? k.slice(PILE_PREFIX.length) : k, v]))
  // Rebuilt from the same secrets the players are, so the two copies of a hand
  // cannot come back disagreeing when they went out agreeing.
  const restoredHands: Record<string, string[]> = { ...legacyHands(view) }
  const restoredMissions: Record<string, string> = { ...legacyMissions(view) }
  for (const [seat, held] of Object.entries(secrets)) {
    if (held.legacyHand) restoredHands[seat] = held.legacyHand
    if (held.legacyMission) restoredMissions[seat] = held.legacyMission
  }
  return {
    ...view,
    ...(cards ? {
      legacySnapshot: {
        ...(view.legacySnapshot as object),
        activeGameCards: {
          ...cards,
          playerHands: restoredHands,
          playerMissions: restoredMissions,
          // Only what the store actually returned. A deck missing from it is
          // left as it stands in the row — which for a match written before
          // this split is the real order, and for one written after is the
          // empty array publicView left. Overwriting with [] either way would
          // shuffle a live game's draw pile into nothing on its next action.
          ...fromStore('legacy'),
        },
      },
    } : {}),
    // The server piles, restored on the same terms: only what came back, and a
    // deck the store did not return is left exactly as the row had it. The
    // counts publicView put beside them are a WIRE artefact — the client
    // rebuilds a pile of that height to show and draw from — and stay off the
    // state the reducer runs on, where the real piles are the truth and a
    // count would only ever be stale.
    ...(piles ? { cards: withoutCounts({ ...piles, ...fromStore('pile') }) } : {}),
    players: view.players.map(p => {
      const { cardCount: _n, ...rest } = p
      const held = secrets[p.id]
      if (held) return { ...rest, cards: held.cards, missionCardId: held.missionCardId } as Player
      // Legacy row: the hand is still inline. `cards` present is the marker,
      // and it is checked rather than inferred from the absence of a secrets
      // row, because those two can both be true at once.
      if (p.cards) return { ...rest, cards: p.cards, missionCardId: p.missionCardId ?? null } as Player
      throw new Error(
        `no secrets for seat ${p.id}: refusing to treat an unloaded hand as an empty one`)
    }),
    // Cast at the boundary: spreading legacySnapshot widens it to a partial, and
    // the pieces put back are exactly the ones taken out.
  } as GameState
}

/**
 * Project `state` down to what `seatId` may see.
 *
 * Hotseat is returned by identity — the same object, not a copy. One screen
 * means shared state is right, and preserving the reference keeps a decade of
 * React memoisation in GameBoard behaving exactly as it did.
 *
 * Online, every other seat loses its hand and its secret mission and gains a
 * count in their place. The source state is never mutated: the server holds the
 * real thing and a view is a copy, or the seat projected first would strip the
 * hands out from under everyone projected after.
 */
export function viewForSeat(state: GameState, seatId: string, opts: ViewOptions): SeatState {
  if (!opts.online) return state

  // COMPOSED, not hand-rolled. This is exactly "the public row, plus your own
  // secrets" — which is also what the client ends up holding after it merges,
  // so the reply and the subscription now agree by construction rather than by
  // two implementations happening to match.
  //
  // It used to walk players[] itself, and that is why it leaked twice. It never
  // learned about the second copy of the hands in the legacy snapshot, and it
  // never learned about the deck orders: both were added to publicView and
  // neither reached here, because there was nothing forcing them to.
  //
  // The decks are simply absent. mergeOwnSecrets restores a seat's own hand and
  // nothing else, and there is no seat's-own half of a draw pile — nobody may
  // see one, including the player who just acted.
  return mergeOwnSecrets(publicView(state), seatId, secretsFromState(state)[seatId] ?? null)
}

/**
 * Everything a seat is not allowed to see, for assertions and for the devtools
 * check. Kept beside the projection so the two cannot drift: if a secret is
 * added to Player, it belongs in this list and in `viewForSeat` together.
 */
export const SECRET_PLAYER_KEYS = ['cards', 'missionCardId'] as const

/**
 * True when `state` still carries a secret belonging to somebody other than
 * `seatId`. Intended for tests and for a runtime assertion at the point state
 * arrives from the wire — the check that distinguishes absent from hidden.
 */
export function leaksOtherSeatsSecrets(state: SeatState, seatId: string): boolean {
  if (state.players.some(p => p.id !== seatId && SECRET_PLAYER_KEYS.some(k => k in p))) return true
  // The second copy. Checking only players[] was why this returned false on
  // state that carried every hand in legacySnapshot.activeGameCards.playerHands
  // — an assertion looking in one of the two places a hand lives.
  const hands = legacyHands(state)
  return Object.keys(hands).some(id => id !== seatId && (hands[id]?.length ?? 0) > 0)
}
