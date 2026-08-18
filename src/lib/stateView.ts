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
    players: state.players.map((p): SeatPlayer => {
      const cardCount = p.cards.length
      if (p.id === seatId) return { ...p, cardCount }
      // Rebuilt without the secret keys rather than set to undefined: a key
      // present with an undefined value still serialises into the payload as
      // `"cards": null` through some paths, and the requirement is absence.
      const { cards: _cards, missionCardId: _mission, ...rest } = p
      return { ...rest, cardCount }
    }),
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
