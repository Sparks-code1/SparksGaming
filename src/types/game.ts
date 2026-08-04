import type { Player } from './player'
import type { Territory } from './territory'
import type { Card } from './card'
import type { LegacyState } from './legacy'

export type GamePhase =
  | 'lobby'
  | 'draft'        // initial territory claim / troop placement
  | 'reinforce'    // current player places troops
  | 'attack'       // current player attacks
  | 'fortify'      // current player moves troops
  | 'end-turn'
  | 'game-over'

export interface DiceRoll {
  attackerDice: number[]
  defenderDice: number[]
  attackerLosses: number
  defenderLosses: number
}

/**
 * Per-turn transient state — reset at the end of every turn. Previously held as
 * loose React useState/refs in GameBoard; moved into GameState (multiplayer
 * refactor) so the reducer can own the turn lifecycle. All fields are JSON-safe
 * so they persist/restore with the rest of GameState.
 */
export interface TurnState {
  /** First capture this turn has happened — a territory card was awarded. */
  captured: boolean
  /** Captures + uncontested expansions this turn (Imperial Balkania trigger). */
  captureCount: number
  /** Territories conquered by combat this turn (mission progress checks). */
  conqueredIds: string[]
  /** Subset of conqueredIds reached across a sea line (Island Empire mission). */
  conqueredViaSeaIds: string[]
  /** First territory attacked this turn — Bear Trap's −1 sticks to it until conquered. */
  bearTrapTerritoryId: string | null
  /** Territories that have had ≥1 combat roll this turn — bunker/ammo-shortage
   *  scars cannot be placed on these. (Formerly a Set; array for JSON persistence.) */
  attackedTerritoryIds: string[]
  /** Territories shielded from further attack this turn (DM Iron Shield double-6). */
  shieldedTerritoryIds: string[]
  /** An uncontested expansion into an unoccupied territory holding a standing
   *  city happened this turn. Such a move is NOT a conquest, so it normally
   *  earns no card — the Resourceful comeback power grants one for it. */
  expandedIntoCity: boolean

  // ── Private-mission bookkeeping ──────────────────────────────────────────
  // Three private missions trigger on an ACTION rather than on board state, so
  // the action has to be remembered until the mission is claimed at turn end.
  /** Territory cards worth 4+ resources each turned in this turn (Advanced Tactics needs 2). */
  richCardsTradedIn: number
  /** Total resources across everything turned in this turn (Advanced Training needs 10). */
  resourcesTradedIn: number
  /** Knocked out a player holding a 3+ resource card this turn (Forced Occupation). */
  knockedOutRichPlayer: boolean
  /** Whole continents controlled at the START of this turn (Wide Border needs 2). */
  continentsAtTurnStart: number
  /**
   * The current player earned a card draw this turn AND was eligible to take one
   * worth 4+ coins — the World Capital mission's condition.
   *
   * They do NOT take that card: completing the mission costs them the draw, and
   * they get the red stars and the World Capital instead. Upgraded cards count,
   * because eligibility is evaluated against the live coin values.
   */
  eligibleForRichCard: boolean
  /**
   * Territories of the 4+ coin cards that made them eligible, captured at the
   * moment eligibility was checked.
   *
   * The World Capital is placed on the territory matching the card that earned
   * it, so the qualifying card has to be remembered — by the time the mission is
   * claimed the face-up row may already have moved on. Normally one entry; more
   * than one only when several claimable face-up cards are worth 4+, and then the
   * player picks between them.
   */
  richCardTerritoryIds: string[]
}

/** A fresh per-turn state, used at game start and reset at end of turn. */
export function initialTurnState(): TurnState {
  return {
    captured: false, captureCount: 0, conqueredIds: [], conqueredViaSeaIds: [],
    bearTrapTerritoryId: null, attackedTerritoryIds: [], shieldedTerritoryIds: [],
    expandedIntoCity: false,
    richCardsTradedIn: 0, resourcesTradedIn: 0, knockedOutRichPlayer: false,
    continentsAtTurnStart: 0, eligibleForRichCard: false, richCardTerritoryIds: [],
  }
}

export interface GameState {
  id: string
  campaignId: string
  gameNumber: number  // which game in the campaign (1–15)

  phase: GamePhase
  currentPlayerIndex: number
  turnNumber: number

  players: Player[]
  territories: Record<string, Territory>   // keyed by territory id
  deck: Card[]
  discardPile: Card[]

  /** The winner of this game, set when phase === 'game-over' */
  winnerId: string | null

  /** Snapshot of the legacy state at the start of this game */
  legacySnapshot: LegacyState

  /** Current-game HQ placements: playerId → territoryId */
  activeHqs: Record<string, string>

  /** Last dice roll, shown in the UI during attack resolution */
  lastDiceRoll: DiceRoll | null

  /** Index into CARD_TRADE_IN_VALUES tracking how many trade-ins have happened this campaign */
  cardTradeInIndex: number

  /** Per-turn transient state, reset every turn. */
  turn: TurnState

  createdAt: string
  updatedAt: string
}
