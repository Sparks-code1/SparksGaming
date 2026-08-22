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

/** The legacy card block, if this state has one. Optional all the way down: it
 *  is absent on a fresh match and null between games. */
const activeCards = (state: { legacySnapshot?: unknown }) =>
  (state.legacySnapshot as { activeGameCards?: Record<string, unknown> } | undefined)?.activeGameCards ?? null

const legacyHands = (state: { legacySnapshot?: unknown }): Record<string, string[]> =>
  (activeCards(state)?.playerHands as Record<string, string[]> | undefined) ?? {}

const legacyMissions = (state: { legacySnapshot?: unknown }): Record<string, string> =>
  (activeCards(state)?.playerMissions as Record<string, string> | undefined) ?? {}

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
  return {
    ...state,
    players: state.players.map(withoutSecrets),
    // Emptied, not deleted: the legacy block has a shape the rest of the app
    // reads, and removing the key would make every consumer handle an absence
    // that only happens on the wire. Each seat's own entry is put back on
    // arrival, the same way players[].cards is.
    //
    // NOTE the deck orders in this same object — territoryDeck, eventDeck,
    // missionDeck, resourceDeck — are NOT touched here and are still public.
    // They belong in match_decks, which nobody may read, and that is step 3.
    // See the check in handprivacytest that names them.
    ...(cards ? {
      legacySnapshot: {
        ...(state.legacySnapshot as object),
        activeGameCards: { ...cards, playerHands: {}, playerMissions: {} },
      },
    } : {}),
  } as SeatState
}

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
  view: SeatState, secrets: Record<string, SeatSecrets>,
): GameState {
  const cards = activeCards(view)
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
        activeGameCards: { ...cards, playerHands: restoredHands, playerMissions: restoredMissions },
      },
    } : {}),
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

  return {
    ...state,
    players: state.players.map((p): SeatPlayer =>
      p.id === seatId ? { ...p, cardCount: p.cards.length } : withoutSecrets(p)),
  }
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
