import type { FactionId } from './Faction'

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
 * Which game is being played.
 *
 * NOT a set of extras bolted onto the basic game. The advanced game changes core
 * rules — spice flow, combat, the storm's own range — so a phase cannot resolve
 * correctly without knowing which it is in. That is why mode is a parameter to
 * the phase functions rather than a filter applied to their output: by the time
 * you have an outcome, the wrong rules have already run.
 */
export type GameMode = 'basic' | 'advanced'

/**
 * A stack of forces: whose they are, where they stand, how many.
 *
 * The count is not decoration. Fremen lose HALF their forces to a storm, rounded
 * up, and half of an anonymous list is not a thing you can take — the rule needs
 * a number to halve. Forces were previously `{ territoryId, sector }` with one
 * entry per unit and no owner, which made that rule, worm immunity and worm
 * placement all unsayable rather than merely unimplemented.
 */
export interface Force {
  faction: FactionId
  territoryId: TerritoryId
  /** The sector of that territory — the actual unit of occupancy. */
  sector: SectorId
  count: number
}

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

/**
 * The Shield Wall, which either stands or does not.
 *
 * Public: a treachery card destroys it in front of everybody, and it stays
 * destroyed for the rest of the game. Not a property of the board — the board is
 * generated once and is the same in every match, and this changes mid-game.
 */
export type ShieldWall = 'intact' | 'destroyed'

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
  /**
   * Whether the Shield Wall still stands.
   *
   * Storm exposure reads this, not the board: while it stands it shelters the
   * Imperial Basin, Arrakeen and Carthag, and once Family Atomics brings it down
   * all three burn — including the two that are strongholds. See
   * SHIELD_WALL_PROTECTS in lib/dune/storm.ts.
   */
  shieldWall: ShieldWall
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
