import type { ScarType } from './territory'

/** One scar card dealt to a player for a specific game */
export interface DealtScar {
  cardId: string
  playerId: string
  gameNumber: number
  placed: boolean
  placedOnTerritoryId?: string
}

/** A sticker placed on the board that persists across games */
export interface Sticker {
  id: string
  name: string
  description: string
  /** Where the sticker is physically placed */
  placement: 'territory' | 'continent-bonus' | 'card' | 'rulebook'
  targetId: string  // territory id, continent id, card id, etc.
  appliedInGame: number
  /** playerId of the player who placed this sticker (set for city stickers) */
  placedByPlayerId?: string
}

/** A territory name changed permanently by a player */
export interface RenamedTerritory {
  territoryId: string
  originalName: string
  newName: string
  renamedByPlayerId: string
  renamedInGame: number
}

/** A continent bonus modified by legacy events */
export interface ContinentBonusModifier {
  continentId: string
  bonusDelta: number   // added to the printed bonus
  reason: string
  appliedInGame: number
}

/** Tracks which sealed packets / rule-book sections have been opened */
export interface UnlockedContent {
  id: string
  name: string
  description: string
  unlockedInGame: number
  /** e.g. 'packet', 'rule-section', 'faction-power', 'event-deck' */
  contentType: string
}

/** The full persistent state that survives between campaign games */
export interface LegacyState {
  campaignId: string
  currentGameNumber: number   // 1–15
  worldName: string           // players name the world after game 1
  /** ISO timestamp of when this campaign instance was started; used to filter game history */
  campaignEpoch?: string

  scars: Array<{
    territoryId: string
    type: ScarType
    appliedInGame: number
    /** Number of times this fortification has been attacked (removed at 10) */
    attackCount?: number
  }>

  stickers: Sticker[]

  destroyedCities: Array<{
    cityId: string
    destroyedInGame: number
    destroyedByPlayerId: string
  }>

  destroyedHqs: Array<{
    territoryId: string
    factionId: string
    destroyedInGame: number
    destroyedByPlayerId: string
  }>

  renamedTerritories: RenamedTerritory[]

  continentBonusModifiers: ContinentBonusModifier[]

  unlockedContent: UnlockedContent[]

  /** Cards permanently removed from the game (torn up) */
  removedCardIds: string[]

  /** Permanent faction ability chosen at campaign start: factionId → abilityId */
  chosenFactionAbilities: Record<string, string>

  /** Ability IDs permanently removed (the unchosen option when a faction locked in their ability) */
  removedAbilityIds: string[]

  /** IDs of scar cards still remaining in the campaign pool (not yet dealt) */
  scarDeck: string[]

  /** Active card state for the current game — saved on phase transitions */
  activeGameCards: import('@/data/cards').ActiveGameCards | null

  /** History of scar cards dealt each game */
  dealtScars: DealtScar[]

  /** Running log of significant campaign events for the in-game history book */
  historyLog: Array<{
    gameNumber: number
    entry: string
    timestamp: string
  }>

  /** One entry per campaign game won — permanent victory record */
  victoryLog: Array<{
    gameNumber: number
    winnerName: string      // signed name entered at win ceremony
    factionId: string
    winCondition: 'mission' | 'elimination' | 'stars'
  }>

  /** Continents renamed by winners — at most one per continent, permanent */
  namedContinents: Record<string, {
    customName: string
    namedByPlayerId: string
    namedInGame: number
  }>

  /** Accumulated consolation bonus troops per player (playerId → extra starting troops) */
  consolationBonuses: Record<string, number>

  /** Missile tokens per player — 1 earned per game won; spent in combat to set one die to 6 */
  missiles: Record<string, number>

  /** Resource sticker count per territory card ID (default 1; runner-up reward adds +1, max 6) */
  cardResources: Record<string, number>

  /** Red Stars purchased mid-game by spending 4 resource cards — persists for the current game */
  purchasedStars?: Record<string, number>

  /** True once the first faction elimination has occurred — unlocks comeback power system */
  firstEliminationTriggered?: boolean

  /** Comeback power chosen per faction: factionId → power ID */
  comebackPowers?: Record<string, string>

  /** Power IDs already claimed across the campaign — removed from the pool once chosen */
  claimedComebackPowers?: string[]

  /** True once a player has signed the board twice (won 2 games) — triggers Join the Cause event cards */
  doubleWinnerMilestoneTriggered?: boolean

  /** Mission card IDs permanently destroyed after single-use completion */
  destroyedMissionIds?: string[]

  /** Per-game record of each faction's starting territory continent */
  factionStartingHistory?: Array<{ gameNumber: number; factionId: string; continentId: string }>

  /**
   * Each faction's homeland continent — the continent where they've started most often.
   * null means tied (no homeland). Recomputed after each game.
   */
  factionHomelands?: Record<string, string | null>

  /** True once the 9th minor city has been placed — triggers biohazard scars + new event cards + draft system */
  ninthCityUnlocked?: boolean

  /** True once the 9th city unlock fires — all subsequent games use draft-order setup */
  draftOrderUnlocked?: boolean

  /** Event card IDs permanently destroyed (torn up) and removed from the campaign forever */
  destroyedEventCardIds?: string[]

  /** Territory ID where the World Capital sticker has been placed — unique, permanent */
  worldCapitalTerritoryId?: string

  /** Campaign red star totals per player (playerId → count). Earned by winning games and completing missions. */
  playerRedStars?: Record<string, number>

  /** True once any player has reached 4 red stars — no further games can begin */
  campaignComplete?: boolean

  /** Player ID of the campaign winner (the first player to reach 4 red stars) */
  campaignWinnerId?: string

  /** Campaign-permanent sea lines drawn by the Island Empire mission reward —
   *  each pair becomes a two-way sea-route adjacency in every future game */
  customSeaLines?: Array<[string, string]>

  /** True while a game is actively being played. False between games or when campaign is complete. */
  gameInProgress?: boolean

  /**
   * Snapshot of the current GameState (minus legacySnapshot to avoid circular nesting).
   * Saved on every phase/turn transition so the game can be resumed after a page reload.
   * Null when no game is in progress.
   */
  activeGameState?: Record<string, unknown> | null

  // ─── Alien Invasion Milestone ───────────────────────────────────────────────

  /** Triggered when a player is about to place 30+ troops and has at least 1 missile */
  alienMilestoneTriggered?: boolean

  /** Faction ID that became the Alien Collaborator */
  alienCollaboratorFactionId?: string | null

  /** Alien Island placed on the board — SVG map coordinates + 2 connected territory IDs */
  alienIsland?: {
    x: number
    y: number
    connectedTerritoryIds: [string, string]
  } | null

  /** Territory IDs converted to Ruins by Die Humans event cards */
  ruinTerritoryIds?: string[]

  /** Weakness power chosen per faction: factionId → weakness power ID */
  alienWeaknessPowers?: Record<string, string>

  /** Aliens star power (control every city → 2 red stars) — claimable once per campaign */
  alienStarPowerClaimed?: boolean

  // ─── Nuclear Milestone (3 missiles in a single combat roll) ─────────────────

  /** Triggered when 3 missiles are placed on a single combat roll */
  nuclearMilestoneTriggered?: boolean

  /** Faction that played the 3rd missile — the Bringer of Nuclear Fire */
  nuclearBringerFactionId?: string | null

  /** Territory permanently marked as the Fallout Zone */
  falloutZoneTerritoryId?: string | null

  /** Missile powers chosen per faction (earned on in-game red stars): factionId → power IDs */
  missilePowers?: Record<string, string[]>

  /** Missile power IDs already claimed (each power is unique across factions) */
  claimedMissilePowers?: string[]

  /** Mutant Evolve powers revealed via The Mutants Evolve events */
  mutantEvolvePowers?: string[]

  /** Mutants star power (control all bio-hazard + fallout territories → red star) — once per campaign */
  mutantStarPowerClaimed?: boolean

  /** Game number in which the Bringer's +2 mutant-game bonus missiles were last granted */
  bringerBonusMissilesGame?: number

  /** Career wins per player id — missiles replenish to this count at every game start */
  playerWins?: Record<string, number>

  /** Game number in which start-of-game missile replenishment last ran */
  missilesReplenishedGame?: number
}
