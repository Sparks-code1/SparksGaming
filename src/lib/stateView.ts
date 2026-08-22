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
  return { ...state, players: state.players.map(withoutSecrets) }
}

/**
 * What each seat's match_secrets row must hold, keyed by seat id.
 *
 * Derived from the state rather than tracked alongside it, so the hand in the
 * secrets store and the count in the public row are always two views of one
 * fact and cannot drift.
 */
export function secretsFromState(state: GameState): Record<string, SeatSecrets> {
  return Object.fromEntries(state.players.map(p =>
    [p.id, { cards: p.cards, missionCardId: p.missionCardId }]))
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
  return {
    ...view,
    players: view.players.map(p => p.id === seatId
      ? { ...p, cards: secrets.cards, missionCardId: secrets.missionCardId }
      : p),
  }
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
  return {
    ...view,
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
  }
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
  return state.players.some(p =>
    p.id !== seatId && SECRET_PLAYER_KEYS.some(k => k in p))
}
