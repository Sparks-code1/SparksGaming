import type { GameState } from '@/types/game'
import { initialTurnState } from '@/types/game'
import type { Player } from '@/types/player'
import { TERRITORY_DEFINITIONS, buildTerritory } from './territoryData'

export const MOCK_PLAYERS: Player[] = [
  { id: 'p1', name: 'Ryan',    factionId: 'enclave-of-the-bear', userId: null, troops: 5, cards: [], missionCardId: null, isEliminated: false, holdsHq: false, wins: 0, winHistory: [] },
  { id: 'p2', name: 'Alice',   factionId: 'imperial-balkania',   userId: null, troops: 3, cards: [], missionCardId: null, isEliminated: false, holdsHq: false, wins: 0, winHistory: [] },
  { id: 'p3', name: 'Bob',     factionId: 'khan-industries',     userId: null, troops: 4, cards: [], missionCardId: null, isEliminated: false, holdsHq: false, wins: 0, winHistory: [] },
  { id: 'p4', name: 'Carol',   factionId: 'saharan-republic',    userId: null, troops: 2, cards: [], missionCardId: null, isEliminated: false, holdsHq: false, wins: 0, winHistory: [] },
  { id: 'p5', name: 'Eve',     factionId: 'die-mechaniker',      userId: null, troops: 3, cards: [], missionCardId: null, isEliminated: false, holdsHq: false, wins: 0, winHistory: [] },
]

/**
 * Point the shared seat table at the campaign roster's names.
 *
 * Seat ids (`p1`…`p5`) are the roster ids, so this only refreshes the labels
 * every screen renders. Identity itself comes from the roster — a seat is never
 * reassigned to a different person by this call.
 */
export function applyRosterNames(roster: Array<{ id: string; name: string }>): void {
  for (const m of roster) {
    const p = MOCK_PLAYERS.find(mp => mp.id === m.id)
    if (p) p.name = m.name
  }
}

/** Faction → hex color for map rendering */
export const FACTION_COLORS: Record<string, number> = {
  'enclave-of-the-bear': 0xf1c40f,  // yellow
  'imperial-balkania':   0x2980b9,  // blue
  'khan-industries':     0x27ae60,  // green
  'saharan-republic':    0x1a1a1a,  // black
  'die-mechaniker':      0x8e44ad,  // purple
  'aliens':              0x00c8a0,  // alien teal
  'mutants':             0x8b0000,  // mutant dark red
}

export const NEUTRAL_COLOR = 0x8e9eab

// Rough distribution: p1 gets NA, p2 gets Europe, p3 gets Asia, p4 gets Africa+Aus, neutral the rest
const OWNERSHIP: Record<string, { playerId: string; troops: number }> = {
  // North America → p1
  'alaska':             { playerId: 'p1', troops: 3 },
  'northwest-territory':{ playerId: 'p1', troops: 2 },
  'greenland':          { playerId: 'p1', troops: 4 },
  'alberta':            { playerId: 'p1', troops: 2 },
  'ontario':            { playerId: 'p1', troops: 5 },
  'quebec':             { playerId: 'p1', troops: 2 },
  'western-us':         { playerId: 'p1', troops: 3 },
  'eastern-us':         { playerId: 'p1', troops: 4 },
  'central-america':    { playerId: 'p1', troops: 2 },

  // Europe → p2
  'iceland':            { playerId: 'p2', troops: 2 },
  'great-britain':      { playerId: 'p2', troops: 3 },
  'scandinavia':        { playerId: 'p2', troops: 4 },
  'northern-europe':    { playerId: 'p2', troops: 3 },
  'western-europe':     { playerId: 'p2', troops: 2 },
  'southern-europe':    { playerId: 'p2', troops: 5 },
  'ukraine':            { playerId: 'p2', troops: 3 },

  // Asia → p3
  'ural':               { playerId: 'p3', troops: 2 },
  'siberia':            { playerId: 'p3', troops: 3 },
  'yakutsk':            { playerId: 'p3', troops: 2 },
  'kamchatka':          { playerId: 'p3', troops: 4 },
  'irkutsk':            { playerId: 'p3', troops: 2 },
  'mongolia':           { playerId: 'p3', troops: 3 },
  'japan':              { playerId: 'p3', troops: 2 },
  'afghanistan':        { playerId: 'p3', troops: 3 },
  'china':              { playerId: 'p3', troops: 5 },
  'middle-east':        { playerId: 'p3', troops: 3 },
  'india':              { playerId: 'p3', troops: 4 },
  'southeast-asia':     { playerId: 'p3', troops: 2 },

  // Africa + Australia → p4
  'north-africa':       { playerId: 'p4', troops: 3 },
  'egypt':              { playerId: 'p4', troops: 2 },
  'east-africa':        { playerId: 'p4', troops: 3 },
  'congo':              { playerId: 'p4', troops: 2 },
  'south-africa':       { playerId: 'p4', troops: 2 },
  'madagascar':         { playerId: 'p4', troops: 1 },
  'indonesia':          { playerId: 'p4', troops: 2 },
  'new-guinea':         { playerId: 'p4', troops: 2 },
  'western-australia':  { playerId: 'p4', troops: 3 },
  'eastern-australia':  { playerId: 'p4', troops: 4 },

  // South America → contested / neutral
  'venezuela':          { playerId: 'p1', troops: 2 },
  'peru':               { playerId: 'p4', troops: 3 },
  'brazil':             { playerId: 'p2', troops: 4 },
  'argentina':          { playerId: 'p3', troops: 2 },
}

export function buildMockGameState(): GameState {
  const territories = Object.fromEntries(
    TERRITORY_DEFINITIONS.map(def => {
      const o = OWNERSHIP[def.id]
      return [
        def.id,
        buildTerritory(def, o ? { occupyingPlayerId: o.playerId, troops: o.troops } : { troops: 1 }),
      ]
    })
  )

  return {
    id: 'mock-game-1',
    campaignId: 'mock-campaign',
    gameNumber: 1,
    phase: 'reinforce',
    currentPlayerIndex: 0,
    turnNumber: 1,
    players: MOCK_PLAYERS,
    territories,
    deck: [],
    discardPile: [],
    activeHqs: {},
    winnerId: null,
    legacySnapshot: {
      campaignId: 'mock-campaign',
      currentGameNumber: 1,
      worldName: 'New World',
      scars: [],
      stickers: [],
      destroyedCities: [],
      destroyedHqs: [],
      renamedTerritories: [],
      continentBonusModifiers: [],
      unlockedContent: [],
      removedCardIds: [],
      chosenFactionAbilities: {},
      removedAbilityIds: [],
      scarDeck: [],
      dealtScars: [],
      activeGameCards: null,
      historyLog: [],
      victoryLog: [],
      consolationBonuses: {},
      namedContinents: {},
      missiles: {},
      cardResources: {},
      purchasedStars: {},
      firstEliminationTriggered: false,
      comebackPowers: {},
      claimedComebackPowers: [],
    },
    lastDiceRoll: null,
    cardTradeInIndex: 0,
    turn: initialTurnState(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}
