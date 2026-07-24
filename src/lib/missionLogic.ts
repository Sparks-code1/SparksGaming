import type { Territory } from '@/types/territory'
import type { GameState } from '@/types/game'
import { CONTINENT_BONUSES, TERRITORY_DEFINITIONS } from '@/data/territoryData'
import { ISLAND_TERRITORY_IDS } from '@/data/seaLines'

const CONTINENT_SIZES: Record<string, number> = TERRITORY_DEFINITIONS.reduce(
  (acc, d) => ({ ...acc, [d.continentId]: (acc[d.continentId] ?? 0) + 1 }),
  {} as Record<string, number>,
)

export interface TurnConquestState {
  /** Territory IDs taken by combat this turn (not empty-territory advances) */
  conqueredIds: string[]
  /** Territory IDs taken by combat this turn that were attacked across a sea line */
  conqueredViaSeaIds: string[]
}

/**
 * Check whether the player has completed their active mission.
 * Called after every combat capture and at the end of attack phase.
 */
export function checkMission(
  missionId: string,
  playerId: string,
  territories: Record<string, Territory>,
  _gameState: GameState,
  conquest: TurnConquestState,
  /** cardState.resourceDeck.length — used for world-capital check */
  resourceDeckCount: number,
): boolean {
  const owned = Object.values(territories).filter(t => t.occupyingPlayerId === playerId)

  switch (missionId) {
    // ── Standard missions ────────────────────────────────────────────────────

    case 'mc-6-cities': {
      let cityCount = 0
      for (const t of owned) {
        for (const c of t.cities) {
          if (!c.isDestroyed && !c.headquartersFactionId) cityCount++
        }
      }
      return cityCount >= 6
    }

    case 'mc-4-cities-turn': {
      // Count cities on territories conquered this turn
      let citiesConquered = 0
      for (const id of conquest.conqueredIds) {
        const t = territories[id]
        if (t?.occupyingPlayerId === playerId) {
          citiesConquered += t.cities.filter(c => !c.isDestroyed).length
        }
      }
      return citiesConquered >= 4
    }

    case 'mc-9-territories-turn':
      return conquest.conqueredIds.length >= 9

    case 'mc-4-sea-turn':
      return conquest.conqueredViaSeaIds.length >= 4

    case 'mc-continent-turn': {
      // Must have conquered at least 1 territory this turn, AND now control all of some continent
      if (conquest.conqueredIds.length === 0) return false
      const continentCount: Record<string, number> = {}
      for (const t of owned) {
        continentCount[t.continentId] = (continentCount[t.continentId] ?? 0) + 1
      }
      const conqueredContinents = new Set(
        conquest.conqueredIds
          .map(id => territories[id]?.continentId)
          .filter(c => c !== undefined),
      )
      return Object.entries(continentCount).some(
        ([cId, count]) =>
          count >= (CONTINENT_SIZES[cId] ?? Infinity) && (conqueredContinents as Set<string>).has(cId),
      )
    }

    case 'mc-7-continent-bonus': {
      const continentCount: Record<string, number> = {}
      for (const t of owned) {
        continentCount[t.continentId] = (continentCount[t.continentId] ?? 0) + 1
      }
      let total = 0
      for (const [cId, count] of Object.entries(continentCount)) {
        if (count >= (CONTINENT_SIZES[cId] ?? Infinity)) {
          total += (CONTINENT_BONUSES as Record<string, number>)[cId] ?? 0
        }
      }
      return total >= 7
    }

    // ── Special missions ─────────────────────────────────────────────────────

    case 'mc-world-capital': {
      // Eligible for 4+ coin resource card means resourceDeck has a card whose
      // value is ≥ 4. In this implementation the resource cards are generic so we
      // check that there are ≥ 4 resource cards remaining in the deck (proxy: deck length ≥ 4).
      // The actual "eligible to draw" condition matches the existing card draw rule.
      return resourceDeckCount >= 4 && owned.length > 0
    }

    case 'mc-7-islands': {
      const islandCount = owned.filter(t => ISLAND_TERRITORY_IDS.has(t.id)).length
      return islandCount >= 7
    }

    // ── Legacy missions (backward compatibility) ─────────────────────────────

    case 'mc-asia':
      return owned.filter(t => t.continentId === 'asia').length >= 12
    case 'mc-americas':
      return (
        owned.filter(t => t.continentId === 'north-america').length >= 9 &&
        owned.filter(t => t.continentId === 'south-america').length >= 4
      )
    case 'mc-europe':
      return owned.filter(t => t.continentId === 'europe').length >= 7
    case 'mc-4-continents': {
      const cc: Record<string, number> = {}
      for (const t of owned) cc[t.continentId] = (cc[t.continentId] ?? 0) + 1
      return Object.entries(cc).filter(([c, n]) => n >= (CONTINENT_SIZES[c] ?? Infinity)).length >= 4
    }
    case 'mc-24-territories':
      return owned.length >= 24
    case 'mc-2-hqs': {
      const hqCount = owned.reduce((n, t) => {
        return n + t.cities.filter(
          c => c.headquartersFactionId && c.headquartersFactionId !== playerId && !c.isDestroyed,
        ).length
      }, 0)
      return hqCount >= 2
    }

    default:
      return false
  }
}

/**
 * Compute each faction's homeland: the continent they started in most often.
 * Returns null for a faction if there's a tie for most-started continent.
 */
export function computeHomelands(
  history: Array<{ gameNumber: number; factionId: string; continentId: string }>,
): Record<string, string | null> {
  const result: Record<string, string | null> = {}

  // Group by faction
  const byFaction: Record<string, Record<string, number>> = {}
  for (const entry of history) {
    if (!byFaction[entry.factionId]) byFaction[entry.factionId] = {}
    byFaction[entry.factionId][entry.continentId] =
      (byFaction[entry.factionId][entry.continentId] ?? 0) + 1
  }

  for (const [factionId, counts] of Object.entries(byFaction)) {
    const maxCount = Math.max(...Object.values(counts))
    const winners = Object.entries(counts).filter(([, n]) => n === maxCount)
    result[factionId] = winners.length === 1 ? winners[0][0] : null
  }

  return result
}

/** Does this player's faction have a homeland, and does this territory belong to it? */
export function isHomelandTerritory(
  factionId: string,
  territoryId: string,
  factionHomelands: Record<string, string | null>,
  territories: Record<string, Territory>,
): boolean {
  const homeland = factionHomelands[factionId]
  if (!homeland) return false
  return territories[territoryId]?.continentId === homeland
}
