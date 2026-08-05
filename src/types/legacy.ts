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

/**
 * One person in the campaign. Named once, in game 1, then permanent.
 *
 * `id` is the identity every player-owned campaign record keys off — red stars,
 * board signatures, continent naming rights, city claims. A person keeps it
 * even when they sit out a game, take a different seat, or switch faction, so
 * the city they founded is still theirs to start on next game.
 */
export interface RosterMember {
  id: string
  name: string
  /** Game number this member was added in — always 1 for now. */
  joinedInGame: number
  /**
   * Supabase auth user who claimed this seat, if any.
   *
   * Optional by design: accounts are optional, and an unclaimed member plays
   * exactly as before. Once claimed, everything already keyed to `id` —
   * signatures, city claims, naming rights, faction choices — is reachable from
   * the account, so a person's record follows them to another machine.
   */
  userId?: string | null
  /** Email of the claiming account, kept for display only. */
  userEmail?: string | null
}

/** The full persistent state that survives between campaign games */
export interface LegacyState {
  campaignId: string
  currentGameNumber: number   // 1–15
  worldName: string           // players name the world after game 1

  /**
   * The permanent campaign roster, fixed after game 1. Later games choose
   * their seats from this list rather than typing names, so identity is stable
   * across the campaign. Empty/absent means the roster has not been set yet
   * (game 1, or a campaign saved before rosters existed).
   */
  roster?: RosterMember[]
  /**
   * Short shareable code others type to join this campaign.
   *
   * Mirrored here for display only — the `campaigns.join_code` COLUMN is the
   * source of truth, because that is where the uniqueness constraint lives. On
   * load the column overwrites this field, so a stale value in old saved JSON
   * can never be handed out as if it were real.
   */
  joinCode?: string | null
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

  /**
   * Scars a game winner has permanently cancelled, capped at
   * `SCAR_CANCEL_LIMIT` for the whole campaign.
   *
   * Cancelling DELETES the scar from `scars`, so the board keeps no record of
   * it — this is the only trace, and the only way to know how many of the
   * campaign's cancellations are left.
   */
  cancelledScars?: Array<{
    type: ScarType
    territoryId: string
    /** The game the scar was originally applied in. */
    appliedInGame: number
    cancelledInGame: number
    cancelledByPlayerId: string
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

  /** One entry per campaign game won — permanent victory record (board signatures) */
  victoryLog: Array<{
    gameNumber: number
    winnerName: string      // signed name entered at win ceremony
    /**
     * Roster id of the winner. The authoritative link — `winnerName` is the
     * signature as written and can repeat or change, so anything counting a
     * person's wins must use this. Absent on games recorded before rosters
     * existed; fall back to matching `winnerName` for those.
     */
    winnerPlayerId?: string
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
   * Private missions (unlocked when the World Capital is placed) that each
   * faction has permanently claimed as a STAR POWER: factionId → missionId.
   * A faction may hold at most ONE, and the mission is destroyed on claim so
   * no other faction can ever take that power.
   */
  factionStarPowerMissions?: Record<string, string>

  /**
   * factionId → the last game number in which that faction claimed the extra
   * red star from its star power. Caps the power at 1 ★ per game.
   */
  starPowerClaimedGames?: Record<string, number>

  /** True once the World Capital has been placed and the private missions were
   *  shuffled into the mission deck (guards against re-adding them). */
  privateMissionsSeeded?: boolean

  /**
   * Each faction's homeland continent — the continent where they've started most often.
   * null means tied (no homeland). Recomputed from `factionStartHistory`.
   */
  factionHomelands?: Record<string, string | null>

  /**
   * One entry per faction per game: the continent their starting HQ was placed in.
   * This is the raw tally `factionHomelands` is derived from, recorded from game 1
   * (the homeland ABILITY only switches on at the double-winner milestone, but the
   * history behind it counts the whole campaign). Keyed uniquely by
   * gameNumber+factionId so re-recording is a no-op.
   */
  factionStartHistory?: Array<{ gameNumber: number; factionId: string; continentId: string }>

  /** True once the 9th minor city has been placed — triggers biohazard scars + new event cards + draft system */
  ninthCityUnlocked?: boolean

  /**
   * Milestone id → the game number it unlocked in, for the campaign history.
   * Recorded when a milestone flag first flips, so milestones already unlocked
   * in campaigns predating this field simply have no entry (and are shown
   * without a game number rather than with a wrong one).
   */
  milestoneUnlockGames?: Record<string, number>

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

  /** Roster id of the campaign champion — the player who signed the board most. */
  campaignWinnerId?: string

  /**
   * Every champion. Holds more than one id only when the 15th game ends with
   * the lead shared; `campaignWinnerId` is the first of these.
   */
  campaignChampionIds?: string[]

  /** Campaign-permanent sea lines drawn by the Island Empire mission reward —
   *  each pair becomes a two-way sea-route adjacency in every future game */
  customSeaLines?: Array<[string, string]>

  /**
   * The match row holding the authoritative board, when this game is being
   * played ONLINE. Null/absent means hotseat: no subscription, no dispatching
   * to the server, and legacy writes are unguarded because only one machine is
   * ever making them.
   */
  activeMatchId?: string | null

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
