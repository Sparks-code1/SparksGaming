import type { Territory } from '@/types/territory'
import { CONTINENT_BONUSES, TERRITORY_DEFINITIONS } from '@/data/territoryData'

// Total territory count per continent (derived from definitions)
const CONTINENT_SIZES: Record<string, number> = TERRITORY_DEFINITIONS.reduce(
  (acc, d) => ({ ...acc, [d.continentId]: (acc[d.continentId] ?? 0) + 1 }),
  {} as Record<string, number>,
)

/** Troops a player receives at the start of their reinforce phase. */
export function calcReinforcements(
  playerId: string,
  territories: Record<string, Territory>,
  roundUp = false,
  namedContinents: Record<string, { namedByPlayerId: string }> = {},
  worldCapitalTerritoryId: string | null = null,
  skipCityPopulation = false,
  continentBonusModifiers: Array<{ continentId: string; bonusDelta: number }> = [],
): number {
  const owned = Object.values(territories).filter(t => t.occupyingPlayerId === playerId)

  // Cities count as extra population: minor = +1, major = +2, world capital = 5.
  // The World Capital IS the city on its territory — it counts as exactly 5 and
  // its own city stickers are not also counted (no double dip).
  // Primitive weakness power: city population does not count — territories only
  let cityTerritoryBonus = 0
  if (!skipCityPopulation) {
    for (const t of owned) {
      if (worldCapitalTerritoryId && t.id === worldCapitalTerritoryId) {
        cityTerritoryBonus += 5
        continue
      }
      for (const city of t.cities) {
        if (city.isDestroyed || city.headquartersFactionId) continue
        cityTerritoryBonus += city.isMajor ? 2 : 1
      }
    }
  }

  const effectiveCount = owned.length + cityTerritoryBonus
  const base = Math.max(3, roundUp ? Math.ceil(effectiveCount / 3) : Math.floor(effectiveCount / 3))

  const continentCounts: Record<string, number> = {}
  for (const t of owned) {
    continentCounts[t.continentId] = (continentCounts[t.continentId] ?? 0) + 1
  }

  let bonus = 0
  for (const [cId, count] of Object.entries(continentCounts)) {
    const size = CONTINENT_SIZES[cId] ?? Infinity
    if (count >= size) {
      // Base bonus adjusted by campaign modifiers (winner rewards, unlocks) — never below 0
      const modDelta = continentBonusModifiers
        .filter(m => m.continentId === cId)
        .reduce((s, m) => s + m.bonusDelta, 0)
      bonus += Math.max(0, (CONTINENT_BONUSES[cId as keyof typeof CONTINENT_BONUSES] ?? 0) + modDelta)
      // +1 extra if this player named the continent
      if (namedContinents[cId]?.namedByPlayerId === playerId) bonus += 1
    }
  }

  return base + bonus
}

// ─── Custom sea lines (Island Empire mission reward) ─────────────────────────

/** Injects campaign-placed sea lines as two-way adjacencies. Idempotent. */
export function applyCustomSeaLines(
  territories: Record<string, Territory>,
  pairs: Array<[string, string]> | undefined | null,
): Record<string, Territory> {
  let result = territories
  for (const [a, b] of pairs ?? []) {
    const ta = result[a]
    const tb = result[b]
    if (!ta || !tb) continue
    if (!ta.adjacentIds.includes(b)) {
      result = { ...result, [a]: { ...ta, adjacentIds: [...ta.adjacentIds, b] } }
    }
    if (!result[b].adjacentIds.includes(a)) {
      result = { ...result, [b]: { ...result[b], adjacentIds: [...result[b].adjacentIds, a] } }
    }
  }
  return result
}

// ─── Alien Island territory ───────────────────────────────────────────────────

export const ALIEN_ISLAND_TERRITORY_ID = 'alien-island'

/**
 * Adds Alien Island as a real, occupiable territory. Its only adjacencies are
 * the two sea-line endpoints chosen at the milestone; those territories gain
 * the island in their adjacency lists too. No-op if the island already exists.
 */
export function injectAlienIslandTerritory(
  territories: Record<string, Territory>,
  island: { x: number; y: number; connectedTerritoryIds: [string, string] } | null | undefined,
): Record<string, Territory> {
  if (!island) return territories
  const result = { ...territories }
  if (!result[ALIEN_ISLAND_TERRITORY_ID]) {
    // Octagonal hit polygon around the island position
    const r = 22
    const poly: number[][] = Array.from({ length: 8 }, (_, i) => {
      const a = (Math.PI / 4) * i + Math.PI / 8
      return [Math.round(island.x + r * Math.cos(a)), Math.round(island.y + r * Math.sin(a))]
    })
    result[ALIEN_ISLAND_TERRITORY_ID] = {
      id: ALIEN_ISLAND_TERRITORY_ID,
      name: 'Alien Island',
      continentId: 'alien-island',
      shape: JSON.stringify(poly),
      labelX: island.x,
      labelY: island.y,
      adjacentIds: [...island.connectedTerritoryIds],
      occupyingPlayerId: null,
      troops: 0,
      scars: [],
      cities: [],
    }
  }
  for (const cid of island.connectedTerritoryIds) {
    const t = result[cid]
    if (t && !t.adjacentIds.includes(ALIEN_ISLAND_TERRITORY_ID)) {
      result[cid] = { ...t, adjacentIds: [...t.adjacentIds, ALIEN_ISLAND_TERRITORY_ID] }
    }
  }
  return result
}

/** Find all territories owned by playerId reachable from startId through owned territory chains.
 *  Territories in `noTraverseIds` (e.g. the Fallout Zone) can be reached as a
 *  destination but never passed through. */
export function connectedOwnedIds(
  startId: string,
  playerId: string,
  territories: Record<string, Territory>,
  noTraverseIds?: Set<string>,
): Set<string> {
  const visited = new Set<string>()
  const queue = [startId]
  while (queue.length) {
    const id = queue.pop()!
    if (visited.has(id)) continue
    visited.add(id)
    // Blocked territories are terminal — reachable but not traversable
    if (noTraverseIds?.has(id) && id !== startId) continue
    const t = territories[id]
    if (!t) continue
    for (const adj of t.adjacentIds) {
      if (!visited.has(adj) && territories[adj]?.occupyingPlayerId === playerId) {
        queue.push(adj)
      }
    }
  }
  visited.delete(startId) // exclude the source itself
  return visited
}
