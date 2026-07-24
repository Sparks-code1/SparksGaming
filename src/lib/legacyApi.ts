import { supabase } from './supabase'
import type { LegacyState } from '@/types/legacy'
import type { ScarType } from '@/types/territory'
import { TERRITORY_DEFINITIONS } from '@/data/territoryData'
import { getInitialScarDeck } from '@/data/scarCards'

export const CAMPAIGN_ID = 'default-campaign'

// ─── Default state ────────────────────────────────────────────────────────────

export function defaultLegacyState(): LegacyState {
  return {
    campaignId: CAMPAIGN_ID,
    currentGameNumber: 1,
    worldName: 'New World',
    campaignEpoch: new Date().toISOString(),
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
    scarDeck: getInitialScarDeck(),
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
    doubleWinnerMilestoneTriggered: false,
    destroyedMissionIds: [],
    factionStartingHistory: [],
    factionHomelands: {},
    ninthCityUnlocked: false,
    draftOrderUnlocked: false,
    destroyedEventCardIds: [],
    worldCapitalTerritoryId: undefined,
    playerRedStars: {},
    customSeaLines: [],
    campaignComplete: false,
    campaignWinnerId: undefined,
    gameInProgress: false,
    activeGameState: null,
    alienMilestoneTriggered: false,
    alienCollaboratorFactionId: null,
    alienIsland: null,
    ruinTerritoryIds: [],
    alienWeaknessPowers: {},
    alienStarPowerClaimed: false,
    nuclearMilestoneTriggered: false,
    nuclearBringerFactionId: null,
    falloutZoneTerritoryId: null,
    missilePowers: {},
    claimedMissilePowers: [],
    mutantEvolvePowers: [],
    mutantStarPowerClaimed: false,
    bringerBonusMissilesGame: undefined,
    playerWins: {},
    missilesReplenishedGame: undefined,
  }
}

// ─── Red star awards ──────────────────────────────────────────────────────────

/** Pure function — awards in-GAME red star tokens. There are no career red
 *  stars: every award counts toward the current game's 4-star victory
 *  (tracked in purchasedStars, which resets between games). */
export function awardRedStars(
  state: LegacyState,
  playerId: string,
  stars: number,
  playerName: string,
  gameNumber: number,
): LegacyState {
  const prev = state.purchasedStars ?? {}
  const newCount = (prev[playerId] ?? 0) + stars
  return {
    ...state,
    purchasedStars: { ...prev, [playerId]: newCount },
    historyLog: [
      ...state.historyLog,
      {
        gameNumber,
        entry: `${playerName} earned ${stars} red star${stars !== 1 ? 's' : ''} this game (game total: ${newCount} ★)`,
        timestamp: new Date().toISOString(),
      },
    ],
  }
}

// ─── Load / Save ──────────────────────────────────────────────────────────────

export async function loadLegacyState(): Promise<LegacyState | null> {
  try {
    const { data, error } = await supabase
      .from('campaigns')
      .select('legacy_state')
      .eq('id', CAMPAIGN_ID)
      .single()
    if (error || !data) return null
    const ls = data.legacy_state as LegacyState
    // Heal saves corrupted by an older duplicate-append bug: scar-card ids are
    // unique, so a card can never legitimately appear twice in the deck.
    if (Array.isArray(ls.scarDeck)) {
      const deduped = [...new Set(ls.scarDeck)]
      if (deduped.length !== ls.scarDeck.length) ls.scarDeck = deduped
    }
    return ls
  } catch {
    return null
  }
}

export async function saveLegacyState(state: LegacyState): Promise<void> {
  await supabase.from('campaigns').upsert({
    id: CAMPAIGN_ID,
    world_name: state.worldName,
    legacy_state: state,
    updated_at: new Date().toISOString(),
  })
}

// ─── Game sessions ────────────────────────────────────────────────────────────

export interface GameSessionRow {
  id: string
  campaign_id: string
  game_number: number
  winner_player_name: string | null
  winner_faction_id: string | null
  legacy_events: LegacyEvent[]
  created_at: string
}

export interface LegacyEvent {
  type: 'scar-placed' | 'city-placed' | 'city-destroyed' | 'hq-placed' | 'content-unlocked' | 'bonus-changed' | 'territory-renamed' | 'world-named'
  description: string
  territoryId?: string
  data?: Record<string, unknown>
}

export async function loadGameHistory(campaignEpoch?: string): Promise<GameSessionRow[]> {
  try {
    let query = supabase
      .from('game_sessions')
      .select('*')
      .eq('campaign_id', CAMPAIGN_ID)
      .order('game_number', { ascending: true })
    if (campaignEpoch) {
      query = query.gte('created_at', campaignEpoch)
    }
    const { data } = await query
    return (data ?? []) as GameSessionRow[]
  } catch {
    return []
  }
}

export async function saveGameSession(
  gameNumber: number,
  winnerPlayerName: string | null,
  winnerFactionId: string | null,
  events: LegacyEvent[],
): Promise<void> {
  await supabase.from('game_sessions').insert({
    campaign_id: CAMPAIGN_ID,
    game_number: gameNumber,
    winner_player_name: winnerPlayerName,
    winner_faction_id: winnerFactionId,
    legacy_events: events,
  })
}

// ─── Scar metadata ────────────────────────────────────────────────────────────

export interface ScarMeta {
  type: ScarType
  label: string
  icon: string
  color: string
  effect: string
}

export const SCAR_META: ScarMeta[] = [
  {
    type: 'fortified',
    label: 'Bunker',
    icon: '🏰',
    color: '#3498DB',
    effect: 'Adds +1 to the defender\'s highest die.',
  },
  {
    type: 'fortification',
    label: 'Fortification',
    icon: '◎',
    color: '#1a4a7a',
    effect: '+1 to the defender\'s highest and lowest die.',
  },
  {
    type: 'wasteland',
    label: 'Ammo Shortage',
    icon: '💀',
    color: '#E74C3C',
    effect: 'Defender\'s highest die is reduced by 1 when this territory is attacked.',
  },
  {
    type: 'mercenary',
    label: 'Mercenary',
    icon: '🧍',
    color: '#2c2c2c',
    effect: 'The occupying player gains +1 troop here at the end of each of their turns.',
  },
  // Legacy types — only for display on territories that already have them; never dealt
  {
    type: 'nuclear-fallout',
    label: 'Nuclear Fallout',
    icon: '☢️',
    color: '#F1C40F',
    effect: 'Attacker and defender each lose an extra troop per battle here.',
  },
  {
    type: 'biological',
    label: 'Biological',
    icon: '☣️',
    color: '#27AE60',
    effect: 'The occupying player loses 1 troop here at the end of each of their turns.',
  },
]

// ─── Apply legacy state to territories ───────────────────────────────────────

/** Merges persisted legacy scars + cities back onto territory objects. */
export function applyLegacyToTerritories(
  territories: Record<string, import('@/types/territory').Territory>,
  legacy: LegacyState,
): Record<string, import('@/types/territory').Territory> {
  const result = { ...territories }

  // Re-apply scars
  for (const id of Object.keys(result)) {
    result[id] = { ...result[id], scars: [], cities: [] }
  }
  for (const s of legacy.scars) {
    if (result[s.territoryId]) {
      result[s.territoryId] = {
        ...result[s.territoryId],
        scars: [...result[s.territoryId].scars, { type: s.type, appliedInGame: s.appliedInGame, attackCount: s.attackCount }],
      }
    }
  }

  // Re-apply stickers (cities & HQs) — ONLY city/HQ stickers become city
  // entries; fortification and other territory stickers are not cities
  for (const sticker of legacy.stickers) {
    if (sticker.placement !== 'territory') continue
    const t = result[sticker.targetId]
    if (!t) continue
    const destroyed = legacy.destroyedCities.find(d => d.cityId === sticker.id)
    const isCitySticker = sticker.description.startsWith('city:')
    const isHqSticker   = sticker.description.startsWith('HQ:')
    if (!isCitySticker && !isHqSticker) continue
    result[sticker.targetId] = {
      ...t,
      cities: [
        ...t.cities,
        {
          id: sticker.id,
          name: sticker.name,
          territoryId: sticker.targetId,
          isDestroyed: !!destroyed,
          destroyedInGame: destroyed?.destroyedInGame,
          headquartersFactionId: isHqSticker ? sticker.description.slice(3) : undefined,
          isMajor: isCitySticker ? sticker.description === 'city:major' : undefined,
        },
      ],
    }
  }

  // Apply renamed territories
  for (const r of legacy.renamedTerritories) {
    if (result[r.territoryId]) {
      result[r.territoryId] = { ...result[r.territoryId], name: r.newName }
    }
  }

  // Apply destroyed HQ permanent marks
  for (const hq of (legacy.destroyedHqs ?? [])) {
    if (result[hq.territoryId]) {
      result[hq.territoryId] = { ...result[hq.territoryId], destroyedHqMarked: true }
    }
  }

  return result
}

// ─── Unlock events ────────────────────────────────────────────────────────────

export interface UnlockOption {
  id: string
  name: string
  description: string
  contentType: 'faction-power' | 'rule-section' | 'continent-bonus' | 'event-deck'
  continentId?: string
  bonusDelta?: number
}

export const UNLOCK_POOL: UnlockOption[] = [
  { id: 'un-bear-iron', name: 'Iron Pact', contentType: 'faction-power', description: 'Enclave of the Bear: may place 2 extra troops on one territory during Draft.' },
  { id: 'un-balk-shield', name: 'Imperial Shield', contentType: 'faction-power', description: 'Imperial Balkania: all territories in Europe count as fortified for defense.' },
  { id: 'un-khan-blitz', name: 'Blitzkrieg', contentType: 'faction-power', description: 'Khan Industries: may attack with 4 dice instead of 3 once per turn.' },
  { id: 'un-sah-oasis', name: 'Desert Oasis', contentType: 'faction-power', description: 'Saharan Republic: African territories immune to Biological scar effects.' },
  { id: 'un-mech-armor', name: 'Armored Core', contentType: 'faction-power', description: 'Die Mechaniker: fortified territories also block Nuclear Fallout.' },
  { id: 'un-vig-medic', name: 'Field Medics', contentType: 'faction-power', description: 'Noble Vigil: recover 1 troop lost to Biological scars at end of turn.' },
  { id: 'un-na-bonus', name: 'North American Surge', contentType: 'continent-bonus', continentId: 'north-america', bonusDelta: 1, description: 'North America bonus permanently increased by +1.' },
  { id: 'un-eu-bonus', name: 'European Resurgence', contentType: 'continent-bonus', continentId: 'europe', bonusDelta: 1, description: 'Europe bonus permanently increased by +1.' },
  { id: 'un-asia-bonus', name: 'Asian Dominance', contentType: 'continent-bonus', continentId: 'asia', bonusDelta: 2, description: 'Asia bonus permanently increased by +2.' },
  { id: 'un-secret-event', name: 'Secret Orders', contentType: 'event-deck', description: 'Unlock the Secret Orders event deck — shuffle into Risk cards.' },
  { id: 'un-rulebook-p2', name: 'Advanced Combat', contentType: 'rule-section', description: 'Unlock Advanced Combat rules: attacker may choose to roll fewer dice after seeing defender\'s count.' },
  { id: 'un-rulebook-p3', name: 'Fortification Network', contentType: 'rule-section', description: 'Unlock Fortification Network: Fortify through any number of connected owned territories.' },
]

export function pickUnlocks(gameNumber: number, count = 2): UnlockOption[] {
  // Seed selection based on game number so it's deterministic per campaign game
  const seeded = [...UNLOCK_POOL].sort((a, b) => {
    const ha = hashStr(a.id + gameNumber)
    const hb = hashStr(b.id + gameNumber)
    return ha - hb
  })
  return seeded.slice(0, count)
}

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0
  return h
}

// ─── Rich-land scar bonus ─────────────────────────────────────────────────────

/** Extra troops from rich-land scars for a player. */
export function richLandBonus(playerId: string, territories: Record<string, import('@/types/territory').Territory>): number {
  return Object.values(territories).filter(
    t => t.occupyingPlayerId === playerId && t.scars.some(s => s.type === 'rich-land'),
  ).length
}

/** Extra draft troops from cities: +1 per minor city, +2 per major city on owned territories. */
export function cityBonus(playerId: string, territories: Record<string, import('@/types/territory').Territory>): number {
  let bonus = 0
  for (const t of Object.values(territories)) {
    if (t.occupyingPlayerId !== playerId) continue
    for (const city of t.cities) {
      if (city.isDestroyed || city.headquartersFactionId) continue
      bonus += city.isMajor ? 2 : 1
    }
  }
  return bonus
}
