/**
 * Dune game state — the beginnings of it.
 *
 * Deliberately small. The shape that matters most is not in here yet (see the
 * note on hidden state at the foot), and inventing fields before the rules that
 * read them is how a type ends up describing a game nobody is building.
 */

/**
 * A storm sector, as `DUNE_SECTORS` in @/data/dune/boardData exports it.
 *
 * A template literal rather than a bare `string` so 'sectr-1' is a compile
 * error, and rather than a bare `number` so it can be compared directly against
 * `TERRITORIES_BY_SECTOR` and every territory's `spiceSector`. The board data
 * keys everything on these ids; a second encoding here would mean converting at
 * each boundary, which is where the two would drift apart.
 */
export type SectorId = `sector-${number}`

/** A territory, as `DUNE_TERRITORIES` exports it. */
export type TerritoryId = `territory-${string}`

/**
 * The nine phases of a turn, in order.
 *
 * Matches the nine the board draws — see PHASE_SYMBOLS in
 * scripts/build-dune-board.mjs. An 'End of Turn' tenth was dropped: the Mentat
 * Pause IS the end of the turn, and a phase the board has no circle for would
 * eventually be mapped to one anyway, off by one.
 *
 * Strings rather than an enum or an index: they read in logs, survive a JSON
 * round trip, and cannot silently renumber.
 */
export type GamePhase =
  | 'Storm'
  | 'Spice Blow and Nexus'
  | 'CHOAM Charity'
  | 'Bidding'
  | 'Revival'
  | 'Shipment and Movement'
  | 'Battles'
  | 'Spice Collection'
  | 'Mentat Pause'

/** In turn order, so `PHASES[0]` starts a turn and the last one ends it. */
export const PHASES: readonly GamePhase[] = [
  'Storm',
  'Spice Blow and Nexus',
  'CHOAM Charity',
  'Bidding',
  'Revival',
  'Shipment and Movement',
  'Battles',
  'Spice Collection',
  'Mentat Pause',
] as const

export interface DuneGameState {
  /**
   * Where the storm sits now. `number`, not `18` — a bare literal in a type
   * position IS the type, so `storm: 18` would make 18 the only value the field
   * could ever hold and fail at the first assignment rather than here.
   */
  storm: SectorId
  /** 1–10. A game is ten turns. */
  turn: number
  phase: GamePhase
}

// ── Not here yet, and the reason ─────────────────────────────────────────────
//
// Everything above is public: the storm's position, the turn, the phase. That
// is why it can be one flat object.
//
// Traitors, spice holdings, committed bids and battle plans are not public, and
// they must NOT be added to this interface. Anything inside the state broadcast
// to clients reaches every seat — the realtime subscription is a Postgres
// changefeed and delivers the whole row. Risk learned this the expensive way:
// its card hands sit in the shared state and are visible to everyone who opens
// devtools. See docs/hidden-state-and-simultaneity.md.
//
// When the first secret arrives, it goes in a DuneSecrets type read from
// match_secrets, not here.
