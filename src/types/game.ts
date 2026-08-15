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
  /** Reinforcements placed this turn, territoryId → count. The reducer's undo
   *  bound: an UNDO_PLACEMENT is refused unless a placement is on record here,
   *  so no client — however confused — can drain a territory by undoing more
   *  than was placed. Reset with the rest of the turn at END_TURN. */
  placedThisTurn: Record<string, number>
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
    placedThisTurn: {},
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

  /**
   * An online combat round holding still for spectator missiles.
   *
   * Set by OPEN_COMBAT_WINDOW after a round's dice are final, cleared by
   * CLOSE_COMBAT_WINDOW / RESOLVE_COMBAT / END_TURN. While set, the edge
   * function accepts SPECTATOR_MISSILE from match participants who are not a
   * side in the battle — the ONLY action a non-current-turn seat may take.
   * Absent in hotseat and in every match created before this existed.
   */
  combatWindow?: CombatWindowState | null

  /**
   * An event choice waiting on a player the BOARD picked, not the turn.
   *
   * Event cards resolve on the machine that dismissed them — the current
   * player's — which is right for an event that acts on the board, and wrong
   * for one that hands somebody else a decision. Join the Cause and Control
   * the People go to the largest population; Die Humans goes to whoever plays
   * the Aliens; the fortify event goes to its own pick. None of them is
   * reliably the player whose turn it is, and all of them were being answered
   * on the acting machine — one player choosing another's reward.
   *
   * Naming the chooser in match state means every machine knows a choice is
   * outstanding, and exactly one of them offers it. What happens AFTER the
   * choice (placing the troops, picking the city) stays local to that machine
   * and travels as ordinary board actions, exactly as it always did.
   */
  pendingEvent?: PendingEventChoice | null

  /**
   * Missiles spent by SPECTATORS this game, by player id — the match-side
   * ledger. Campaign missile counts live in the legacy blob, which the server
   * never writes (single-writer rule); the server records spends HERE instead,
   * clients display `legacy count − ledger`, and the ledger is folded into the
   * blob once when the game is finalised.
   */
  missileSpends?: Record<string, number>

  /**
   * The CONTENDED card piles, server-owned in an online match.
   *
   * Hands already live in `players[].cards`; these are the shared piles two
   * clients could otherwise race on. Present only in online matches (the host
   * seeds it from its deal at match creation) — absent in hotseat, where the
   * component's `cardState` remains the sole owner and the reducer's card
   * actions refuse to run. Event/mission decks and per-game card flags stay
   * client-side (`ActiveGameCards` in the legacy blob) for now.
   */
  cards?: ServerCardPiles | null

  /**
   * The battle currently being fought between two humans online — offer,
   * auto-resolve consent, and each side's raw dice. Absent in hotseat and in
   * AI battles. Cleared by RESOLVE_COMBAT / RETREAT / END_TURN.
   */
  combat?: ActiveCombat | null

  /**
   * The shared end-of-game session, seeded by END_GAME in online matches.
   * Each machine records its player's progress here so every screen renders
   * the same ceremony: who has finished their legacy rewards, and who has
   * chosen to continue to the next game or save and quit. Absent in hotseat,
   * where the single machine runs the whole flow.
   */
  endGame?: EndGameState | null

  createdAt: string
  updatedAt: string
}

/** Shared end-of-game progress — one entry per participating machine. */
export interface EndGameState {
  winnerId: string
  condition: 'mission' | 'elimination' | 'stars'
  /** playerId → true once that player's reward steps are recorded in legacy */
  rewardsDone: Record<string, boolean>
  /** playerId → their post-reward table decision */
  continues: Record<string, 'continue' | 'quit'>
}

/**
 * A battle in progress between two HUMANS in an online match — shared state,
 * so the defender's machine can participate and every other screen can watch.
 *
 * The dice here are RAW rolls, posted by the machine that owns each side.
 * Modifiers and losses are still computed by the attacker's machine (the
 * interim trust model RESOLVE_COMBAT already lives with); what this adds is
 * that the defender's dice are genuinely the defender's, the auto-resolve
 * needs BOTH players' consent, and the whole exchange rides match state —
 * which every client syncs by poll — instead of best-effort broadcasts.
 */
export interface ActiveCombat {
  /** Unique per battle; stale-keyed posts are refused. */
  key: string
  srcId: string
  tgtId: string
  attackerId: string
  defenderId: string
  /** The attacker asked to auto-resolve the whole battle. */
  autoProposed: boolean
  /** The defender's answer: null = still deciding, false forces manual dice. */
  defenderAuto: boolean | null
  /** Most defense dice the defender may roll (bonus caps included) — computed
   *  by the attacker's machine, which already knows the modifier stack. */
  defDiceMax: number
  /** 1-based round counter; dice slots clear when the round advances. */
  round: number
  /** This round's raw attacker dice, posted the moment the attacker rolls —
   *  they never wait for the defender. */
  atkDice: number[] | null
  defDice: number[] | null
  /** Who threw the defense: the defender's own machine, the attacker's after
   *  the defender idled too long, or the attacker's on behalf of an AI
   *  defender — labelled so every screen can say so honestly. */
  defDiceBy?: 'defender' | 'attacker-idle' | 'ai'
  /** Battle-side missile conversions this round (a die forced to an
   *  unmodifiable 6 during the missile phase), posted by the attacker's
   *  machine so every screen replays the same final dice. */
  missileFlips?: Array<{ side: 'atk' | 'def'; dieIndex: number }>
  /** EMP is live on this territory: every die-value modifier is zeroed and
   *  battle missiles are dead. Carried on the offer (the territory may have
   *  been EMP'd earlier this turn) and settable mid-battle, so remote replays
   *  drop their modifier stacks too. */
  emp?: boolean
}

/** The shared card piles an online match's server state owns. */
export interface ServerCardPiles {
  /** Face-down territory deck, ordered — the head refills face-up spot 1. */
  territoryDeck: string[]
  /** The four face-up territory cards (spot 1 first). */
  sideboard: string[]
  /** The coin pile. Traded-in coins return here. */
  resourceDeck: string[]
  /** Territory cards spent in trade-ins. */
  territoryDiscard: string[]
}

/** One combat round's final dice, held open for spectator missiles. */
/** The kinds of event choice that belong to a board-picked player. */
export type PendingEventKind =
  | 'join-cause'
  | 'control-people'
  | 'die-humans'
  | 'fortify-event'

export interface PendingEventChoice {
  kind: PendingEventKind
  /** Whose choice it is — named by the machine that resolved the card. */
  playerId: string
  /** The card, where the choice decides whether it is spent or returned. */
  cardId?: string
}

export interface CombatWindowState {
  /** Unique per roll — a missile naming a stale key is refused ("window closed"). */
  roundKey: string
  srcId: string
  tgtId: string
  /** Dice AFTER every scar/ability modifier — what the attacker's screen shows. */
  atkDice: number[]
  defDice: number[]
  /**
   * The winning claim on each die, derived from `claims` — this is what every
   * screen renders and what the round resolves against.
   */
  flips: Array<{ playerId: string; side: 'atk' | 'def'; dieIndex: number }>
  /**
   * Every missile claimed on this roll, in arrival order and never dropped.
   *
   * Arrival order does NOT decide a contested die: two people reaching for the
   * same die is a matter of priority, not reflexes, and the loser's missile is
   * never charged (see missilePriority). Keeping the losing claims makes that
   * visible — a screen can say whose missile went through and whose was
   * returned — and makes the outcome recomputable rather than path-dependent.
   */
  claims?: Array<{ playerId: string; side: 'atk' | 'def'; dieIndex: number }>
  /**
   * When the window closes, as epoch ms. Every screen counts down to the same
   * instant, and every accepted claim pushes it out again: a missile is news
   * the other side must be given time to answer.
   */
  expiresAt?: number
  /** Turn-order ranks (attacker 0, defender 1, then round the table) — see
   *  missilePriority. Carried so every screen resolves ties the same way. */
  priority?: Record<string, number>
}
