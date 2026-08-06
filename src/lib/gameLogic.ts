import type { Territory } from '@/types/territory'
import { CONTINENT_BONUSES, TERRITORY_DEFINITIONS } from '@/data/territoryData'

// Total territory count per continent (derived from definitions)
const CONTINENT_SIZES: Record<string, number> = TERRITORY_DEFINITIONS.reduce(
  (acc, d) => ({ ...acc, [d.continentId]: (acc[d.continentId] ?? 0) + 1 }),
  {} as Record<string, number>,
)

/** The shape `mergeLegacyEdits` needs to know about; everything else is opaque. */
interface MergeableLegacy {
  historyLog?: Array<{ timestamp?: string; entry?: string }>
}

/**
 * Fold a screen's edited copy of the campaign state back onto the LATEST one.
 *
 * A long-lived screen (the win screen) snapshots campaign state when it opens
 * and hands back its own edited copy when it closes. Writing that copy back
 * wholesale silently reverts anything else that happened meanwhile — a sea line
 * placed from a modal ON TOP of the win screen was recorded and then wiped when
 * the win screen wrote its older copy back, taking its history entry with it.
 *
 * Only the fields the screen actually changed are applied, judged against the
 * baseline it started from. `historyLog` is append-only, so both sets of new
 * entries are kept rather than one replacing the other.
 */
export function mergeLegacyEdits<T extends MergeableLegacy>(
  latest: T,
  baseline: T,
  edited: T,
): T {
  const out: T = { ...latest }
  for (const key of Object.keys(edited) as Array<keyof T>) {
    if (key === 'historyLog') continue
    // Reference equality is the right test: untouched fields come straight off
    // the baseline, and every edit here is built by spreading into a new object.
    if (!Object.is(edited[key], baseline[key])) out[key] = edited[key]
  }
  // A key the screen deleted outright.
  for (const key of Object.keys(baseline) as Array<keyof T>) {
    if (key !== 'historyLog' && !(key in (edited as object))) delete out[key]
  }

  // Both sides appended to the log; keep both, in the order they happened.
  const base = baseline.historyLog ?? []
  const seen = new Set(base.map(e => `${e.timestamp}|${e.entry}`))
  const addedByEdit = (edited.historyLog ?? []).filter(e => !seen.has(`${e.timestamp}|${e.entry}`))
  const latestLog = latest.historyLog ?? []
  const latestKeys = new Set(latestLog.map(e => `${e.timestamp}|${e.entry}`))
  ;(out as MergeableLegacy).historyLog = [
    ...latestLog,
    ...addedByEdit.filter(e => !latestKeys.has(`${e.timestamp}|${e.entry}`)),
  ]
  return out
}

// ─── Riot ────────────────────────────────────────────────────────────────────

/** The modified roll a major city must reach to come through a Riot unharmed. */
export const RIOT_SAFE_ROLL = 6

/** What a Riot did to one major city. */
export interface RiotCityResult {
  territoryId: string
  territoryName: string
  /** Who held it when the die was rolled. */
  playerId: string
  /** The die as rolled — this is the number of troops lost, NOT the modified one. */
  roll: number
  troops: number
  hqCount: number
  /** roll + troops + HQs. */
  modified: number
  suffers: boolean
  troopsLost: number
  /** Faction ids of HQs demolished here. */
  hqFactionIds: string[]
  /** No troops survived, so nobody holds it any more. */
  becomesUncontrolled: boolean
}

/**
 * Territories that roll in a Riot: the ones carrying a living MAJOR city.
 *
 * The World Capital is deliberately not one of them. It replaced the major city
 * on its territory rather than sitting alongside it, so it has no `city:major`
 * of its own — and it is exempt by rule, not by accident.
 */
export function riotCityTerritoryIds(territories: Record<string, Territory>): string[] {
  return Object.values(territories)
    .filter(t => !!t.occupyingPlayerId && livingCities(t).some(c => c.isMajor))
    .map(t => t.id)
    .sort()
}

/**
 * Resolve a Riot across the whole board.
 *
 * One die PER MAJOR CITY, not per player — a player holding three of them rolls
 * three times and can lose one while the others hold. Each roll is modified by
 * that city's own garrison: +1 per troop and +1 per HQ standing on it, so a
 * well-defended city is genuinely safer.
 *
 * Under `RIOT_SAFE_ROLL` the city suffers, and it loses troops equal to the
 * NATURAL die — the modifier decides whether you are hit, never how hard. A big
 * garrison protects you; it does not soften the blow if it fails.
 *
 * Pure: the die comes from the caller, so the server can own it.
 */
export function resolveRiot(
  territories: Record<string, Territory>,
  rollD6: () => number,
): RiotCityResult[] {
  return riotCityTerritoryIds(territories).map(id => {
    const t = territories[id]!
    const roll = rollD6()
    const troops = t.troops ?? 0
    const hqs = (t.cities ?? []).filter(c => c.headquartersFactionId && !c.isDestroyed)
    const hqCount = hqs.length
    const modified = roll + troops + hqCount
    const suffers = modified < RIOT_SAFE_ROLL
    const troopsLost = suffers ? Math.min(roll, troops) : 0
    return {
      territoryId: id,
      territoryName: t.name,
      playerId: t.occupyingPlayerId!,
      roll, troops, hqCount, modified, suffers, troopsLost,
      hqFactionIds: suffers ? hqs.map(c => c.headquartersFactionId!) : [],
      becomesUncontrolled: suffers && troops - troopsLost <= 0,
    }
  })
}

// ─── Resistance ──────────────────────────────────────────────────────────────

/** What a Resistance did to one minor city. */
export interface ResistanceCityResult {
  territoryId: string
  territoryName: string
  playerId: string
  troopsBefore: number
  becomesUncontrolled: boolean
}

/**
 * Every minor city holding 1 or 2 troops loses one.
 *
 * No dice and no choices — the thinly-held minor cities simply slip. A city
 * down to its last troop loses that too and the territory goes uncontrolled,
 * which is the only thing on this card that can hand a territory back to nobody.
 *
 * A city at 3+ is untouched: this pressures thin garrisons, not real ones.
 */
export function resolveResistance(
  territories: Record<string, Territory>,
): ResistanceCityResult[] {
  return Object.values(territories)
    .filter(t => !!t.occupyingPlayerId
      && livingCities(t).some(c => !c.isMajor)
      && (t.troops ?? 0) >= 1 && (t.troops ?? 0) <= 2)
    .map(t => ({
      territoryId: t.id,
      territoryName: t.name,
      playerId: t.occupyingPlayerId!,
      troopsBefore: t.troops ?? 0,
      becomesUncontrolled: (t.troops ?? 0) - 1 <= 0,
    }))
    .sort((a, b) => a.territoryId.localeCompare(b.territoryId))
}

// ─── Fortify event ───────────────────────────────────────────────────────────

/** Troops the Fortify event puts into EACH chosen city. */
export const FORTIFY_EVENT_TROOPS = 2
/** How many DIFFERENT cities the troops must be split across. */
export const FORTIFY_EVENT_CITIES = 2

/**
 * Whether a fortification can still be placed this campaign.
 *
 * The supply is the same five the winner's reward draws from — the Fortify
 * event does not get its own pool. Once they are gone the fortification option
 * is off the table for good, which is what makes taking one a real decision.
 */
export function canPlaceFortification(
  legacy: { stickers?: Array<{ description: string }> } | null | undefined,
): boolean {
  return fortificationsPlaced(legacy?.stickers) < FORTIFICATION_SUPPLY
}

/**
 * How many scars a campaign may ever cancel.
 *
 * Cancelling is a winner's reward, and it is the only thing that removes a scar
 * from the board — everything else the campaign does is additive. Uncapped, a
 * long campaign erases its own history as fast as it writes it. Four total,
 * across every game and every winner; once they are spent the step is gone.
 */
export const SCAR_CANCEL_LIMIT = 4

/** Scars cancelled so far this campaign. */
export function scarsCancelled(
  legacy: { cancelledScars?: unknown[] } | null | undefined,
): number {
  return (legacy?.cancelledScars ?? []).length
}

/** Cancellations still available — never negative, even on odd saved data. */
export function scarCancelsLeft(
  legacy: { cancelledScars?: unknown[] } | null | undefined,
): number {
  return Math.max(0, SCAR_CANCEL_LIMIT - scarsCancelled(legacy))
}

/** Whether a winner may still cancel a scar at all. */
export function canCancelScar(
  legacy: { cancelledScars?: unknown[] } | null | undefined,
): boolean {
  return scarCancelsLeft(legacy) > 0
}

/**
 * Cities that actually stand on a territory.
 *
 * `territory.cities` also holds HQ stickers and razed cities, so a bare
 * `t.cities.length` counts things that are not cities — that is how the City
 * Blitz mission came to count captured enemy HQs.
 */
export function livingCities(territory: Territory | undefined | null): Territory['cities'] {
  return (territory?.cities ?? []).filter(c => !c.isDestroyed && !c.headquartersFactionId)
}

/**
 * How many cities a territory counts as, for missions that count cities.
 *
 * The World Capital IS the city on its territory: exactly one, and its own
 * stickers are never counted on top — the same no-double-dip rule population
 * and entry cost already use.
 */
export function countCitiesOn(
  territory: Territory | undefined | null,
  worldCapitalTerritoryId?: string | null,
): number {
  if (!territory) return 0
  if (worldCapitalTerritoryId && territory.id === worldCapitalTerritoryId) return 1
  return livingCities(territory).length
}

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
      for (const city of livingCities(t)) {
        cityTerritoryBonus += city.isMajor ? 2 : 1
      }
    }
  }

  const effectiveCount = owned.length + cityTerritoryBonus
  const base = Math.max(3, roundUp ? Math.ceil(effectiveCount / 3) : Math.floor(effectiveCount / 3))

  return base + totalContinentBonus(playerId, territories, { namedContinents, continentBonusModifiers })
}

/** Campaign context that changes what a continent is worth. */
export interface ContinentBonusContext {
  namedContinents?: Record<string, { namedByPlayerId: string }>
  continentBonusModifiers?: Array<{ continentId: string; bonusDelta: number }>
}

/** Continents held in full by this player. */
export function continentsHeldInFull(
  playerId: string,
  territories: Record<string, Territory>,
): string[] {
  const counts: Record<string, number> = {}
  for (const t of Object.values(territories)) {
    if (t.occupyingPlayerId !== playerId) continue
    counts[t.continentId] = (counts[t.continentId] ?? 0) + 1
  }
  return Object.entries(counts)
    .filter(([cId, n]) => n >= (CONTINENT_SIZES[cId] ?? Infinity))
    .map(([cId]) => cId)
}

/**
 * What one continent is worth TO THIS PLAYER: the printed bonus, plus the
 * campaign's winner-reward and unlock modifiers, plus 1 more if they are the
 * player who named it. Never below zero — but the naming bonus is added after
 * the clamp, so a continent modified into the ground still pays its namer 1.
 */
export function continentBonusFor(
  continentId: string,
  playerId: string,
  ctx: ContinentBonusContext = {},
): number {
  const modDelta = (ctx.continentBonusModifiers ?? [])
    .filter(m => m.continentId === continentId)
    .reduce((s, m) => s + m.bonusDelta, 0)
  let value = Math.max(0, (CONTINENT_BONUSES[continentId as keyof typeof CONTINENT_BONUSES] ?? 0) + modDelta)
  if ((ctx.namedContinents ?? {})[continentId]?.namedByPlayerId === playerId) value += 1
  return value
}

/**
 * Total continent bonus this player collects — the number actually added to
 * their reinforcements, and therefore the number the "total continent bonus of
 * 7 or more" mission has to be judged against.
 *
 * Both used to compute this separately, and the mission's copy read only the
 * PRINTED bonuses: a board showing Australia at +3 (2 printed, +1 winner reward)
 * counted as 2 toward the mission, and a continent you named counted 1 short.
 * A player collecting 7 could be told they had not reached 7.
 */
export function totalContinentBonus(
  playerId: string,
  territories: Record<string, Territory>,
  ctx: ContinentBonusContext = {},
): number {
  return continentsHeldInFull(playerId, territories)
    .reduce((sum, cId) => sum + continentBonusFor(cId, playerId, ctx), 0)
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

// ─── Draft troops ─────────────────────────────────────────────────────────────

/** The slice of LegacyState the draft calculation reads. */
export interface DraftLegacyInfo {
  namedContinents?: Record<string, { namedByPlayerId: string }>
  worldCapitalTerritoryId?: string | null
  continentBonusModifiers?: Array<{ continentId: string; bonusDelta: number }>
  alienWeaknessPowers?: Record<string, string>
  comebackPowers?: Record<string, string>
  ruinTerritoryIds?: string[]
}

/**
 * Troops a player receives at the start of their reinforce phase, including
 * every faction/legacy bonus.
 *
 * The SINGLE source of truth — used by both the mount-time initializer and the
 * end-of-turn recompute in GameBoard. Those two sites used to compute this
 * separately and drifted apart, silently costing players bonuses (first the
 * continent/population bonus, then the Mercenary comeback power, which the
 * initializer never applied at all). Add any new draft-POOL bonus HERE, never
 * at a call site. Bonuses placed directly on the map (Khan's Strategic
 * Reserve) belong in `applyHqReserveTroops` instead.
 */
export function calcDraftTroops(args: {
  playerId: string
  factionId: string
  territories: Record<string, Territory>
  legacy: DraftLegacyInfo | null
  /** The player's chosen faction ability id, e.g. 'khan-hq-troops'. */
  ability: string | null
  /** Bonus from an active global event (0 today — events no longer auto-draw). */
  eventBonus?: number
}): number {
  const { playerId, factionId, territories, legacy, ability, eventBonus = 0 } = args

  const roundUp = ability === 'balk-round-up'
  const primitive = (legacy?.alienWeaknessPowers ?? {})[factionId] === 'wp-primitive'

  // NOTE: Khan Industries — Strategic Reserve is NOT a draft-pool bonus. Its
  // troops are placed directly onto the HQ territories at the start of the
  // turn; see `hqReserveTroops` below.

  // NOTE: the Mercenary comeback power is NOT a draft-pool bonus either. It
  // upgrades the player's Mercenary SCARS from +1 to +2, paid onto those
  // territories at end of turn; see `applyEndOfTurnScarEffects`.

  // Aliens: +2 for Alien Island, +1 per Ruin controlled.
  const alienBonus = factionId === 'aliens'
    ? (territories[ALIEN_ISLAND_TERRITORY_ID]?.occupyingPlayerId === playerId ? 2 : 0)
      + (legacy?.ruinTerritoryIds ?? []).filter(
          tid => territories[tid]?.occupyingPlayerId === playerId,
        ).length
    : 0

  return calcReinforcements(
      playerId, territories, roundUp,
      legacy?.namedContinents ?? {},
      legacy?.worldCapitalTerritoryId ?? null,
      primitive,
      legacy?.continentBonusModifiers ?? [],
    )
    + eventBonus
    + alienBonus
}

/** HQ territories a player currently controls — their own plus any captured. */
export function controlledHqTerritoryIds(
  playerId: string,
  territories: Record<string, Territory>,
): string[] {
  return Object.values(territories)
    .filter(t => t.occupyingPlayerId === playerId && !!t.activeHqPlayerId)
    .map(t => t.id)
}

/**
 * Khan Industries — Strategic Reserve: at the start of the player's turn, one
 * troop is placed directly ONTO each HQ territory they control (their own HQ
 * plus any they have captured). These are auto-placed, NOT added to the draft
 * pool, so they are not part of `calcDraftTroops`.
 *
 * Returns new territories plus the ids that gained a troop (for the notice).
 * A no-op — returning the SAME object — when the ability is not in play or the
 * player controls no HQ.
 *
 * NOTE ON IDEMPOTENCY: unlike a draft-pool bonus, this mutates persisted
 * territory troop counts, so it must run exactly once per turn. Call it only
 * where a turn actually begins (fresh-game setup and the END_TURN hand-off) —
 * never anywhere that re-runs on reload, or troops would compound every time
 * the page loads.
 */
export function applyHqReserveTroops(
  territories: Record<string, Territory>,
  playerId: string,
  ability: string | null,
): { territories: Record<string, Territory>; grantedTerritoryIds: string[] } {
  if (ability !== 'khan-hq-troops') return { territories, grantedTerritoryIds: [] }
  const ids = controlledHqTerritoryIds(playerId, territories)
  if (ids.length === 0) return { territories, grantedTerritoryIds: [] }

  const next = { ...territories }
  for (const id of ids) next[id] = { ...next[id], troops: next[id].troops + 1 }
  return { territories: next, grantedTerritoryIds: ids }
}

// ─── Expand comeback power ────────────────────────────────────────────────────

/** What a map click should do while the Expand comeback power is available. */
export type ExpandClick = 'select' | 'place' | 'ignore'

/**
 * Decide what clicking a territory means for the Expand comeback power:
 * designate ONE unoccupied, unmarked territory, then drop recruits into it.
 *
 * Extracted as a pure function because the ordering here is genuinely subtle.
 * The original inline version re-ran its "select" test on every click, so
 * clicking the territory you had just picked toggled the selection back off
 * and the "place" branch was unreachable — the power could never place a troop.
 * `isCurrentTarget` is what separates the two cases.
 */
export function expandClickAction(args: {
  /** Player holds the Expand comeback power. */
  hasPower: boolean
  troopsLeft: number
  /** A troop has already landed on the target this turn — the choice is locked. */
  alreadyPlaced: boolean
  isOwn: boolean
  isUnoccupied: boolean
  /** No scars and no cities. */
  isUnmarked: boolean
  /** This territory is the currently designated target. */
  isCurrentTarget: boolean
}): ExpandClick {
  const { hasPower, troopsLeft, alreadyPlaced, isOwn, isUnoccupied, isUnmarked, isCurrentTarget } = args
  if (troopsLeft <= 0) return 'ignore'
  // Clicking the designated target always places — checked BEFORE selection so
  // the second click on it cannot be swallowed by the select branch.
  if (isCurrentTarget) return 'place'
  if (hasPower && !alreadyPlaced && !isOwn && isUnoccupied && isUnmarked) return 'select'
  return 'ignore'
}

// ─── Join the War ─────────────────────────────────────────────────────────────

/**
 * Territories an eliminated player may re-enter the game on: unowned, no
 * standing city, not an HQ or adjacent to one, and not the Fallout Zone.
 *
 * The single source of truth for this rule — the choice modal, the AI picker
 * and the turn-advance skip all read it. If they disagreed, a player could be
 * offered a re-entry the board won't accept (or skipped when a spot existed).
 *
 * Uses each territory's own `adjacentIds` so it stays free of map-data imports.
 */
export function legalJoinWarTerritoryIds(
  territories: Record<string, Territory>,
  hqTerritoryIds: string[],
  falloutZoneTerritoryId?: string | null,
): string[] {
  const blocked = new Set<string>(hqTerritoryIds)
  for (const hqId of hqTerritoryIds) {
    for (const adj of territories[hqId]?.adjacentIds ?? []) blocked.add(adj)
  }
  return Object.values(territories)
    .filter(t =>
      !t.occupyingPlayerId &&
      !(t.cities ?? []).some(c => !c.isDestroyed) &&
      !blocked.has(t.id) &&
      !(falloutZoneTerritoryId && t.id === falloutZoneTerritoryId),
    )
    .map(t => t.id)
}

// ─── Card coin values ─────────────────────────────────────────────────────────

/**
 * A card's coin/resource value.
 *
 * Territory cards ARE the resource cards in this game — the coin value lives on
 * the card. Values start at 1 (twelve cards start at 2) and are raised
 * permanently by the runner-up upgrade at the end of a game, so reading the
 * live `cardResources` map is what makes an upgraded card count at its new
 * value. A card with no entry has not been initialised yet and is worth its
 * base 1.
 */
/** Who holds the most territories right now. */
export interface TerritoryLead {
  /** The sole leader, or null when two or more are tied at the top. */
  leaderId: string | null
  /** The top territory count — 0 when nobody occupies anything. */
  count: number
  /** Every player on the top count; one entry when there is a clear leader. */
  leaderIds: string[]
}

/**
 * Rank players by territories held.
 *
 * Used when the resource deck runs out, which awards a red star to the leader.
 * A tie has to be reported rather than silently resolved: picking the first
 * player found would hand the star — and possibly the game — to whoever owned
 * the territory that happened to come first in the map data.
 */
export function territoryLead(
  territories: Record<string, { occupyingPlayerId?: string | null }>,
): TerritoryLead {
  const counts = new Map<string, number>()
  for (const t of Object.values(territories)) {
    const id = t.occupyingPlayerId
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  let count = 0
  for (const c of counts.values()) if (c > count) count = c
  const leaderIds = count > 0
    ? [...counts.entries()].filter(([, c]) => c === count).map(([id]) => id)
    : []
  return { leaderId: leaderIds.length === 1 ? leaderIds[0] : null, count, leaderIds }
}

/**
 * Outcome of a coin draw that may have emptied the resource pile.
 *
 * `depleted` says the pile emptied for the first time this game — the caller
 * records that so a later emptying resolves to nothing. It is separate from the
 * star itself, which a tie leaves unclaimed.
 */
export type ResourceDepletion = { depleted: boolean } & (
  | { kind: 'none' }
  | { kind: 'award'; playerId: string; count: number }
  | { kind: 'tie'; playerIds: string[]; count: number }
)

/**
 * Resolve the Red Star owed when the resource pile empties.
 *
 * Coins turned in go back into the pile, so it can empty more than once in a
 * game. The star is claimed on the FIRST emptying only — `alreadyResolved`
 * carries that across draws — otherwise a player could refill the pile by
 * trading in and farm a star every time it ran dry.
 *
 * A tie still counts as resolved: nobody takes the star, and it does not stay
 * on the table for a later emptying to award.
 */
export function resolveResourceDepletion(
  isCoinDraw: boolean,
  resourceDeckAfter: readonly string[],
  alreadyResolved: boolean,
  territories: Record<string, { occupyingPlayerId?: string | null }>,
): ResourceDepletion {
  if (!isCoinDraw || resourceDeckAfter.length > 0 || alreadyResolved) {
    return { depleted: false, kind: 'none' }
  }
  const lead = territoryLead(territories)
  if (lead.leaderId) return { depleted: true, kind: 'award', playerId: lead.leaderId, count: lead.count }
  if (lead.leaderIds.length > 1) return { depleted: true, kind: 'tie', playerIds: lead.leaderIds, count: lead.count }
  return { depleted: true, kind: 'none' }
}

// ─── Entry cost (cities, fortifications, Fallout Zone) ───────────────────────

/** What entering a territory costs the arriving stack. */
export interface EntryCost {
  total: number
  parts: string[]
  falloutHalf?: boolean
}

/**
 * Fewest troops that may legally move in.
 *
 * You have to pay the cost AND still leave someone standing, so a major city
 * (−2) cannot be taken with fewer than 3 troops. Clamping the survivors up to 1
 * instead — which every call site used to do — quietly refunded the cost: 2
 * troops into a major city lost 1, and 1 troop lost nothing at all.
 */
export function minTroopsToEnter(cost: EntryCost | null | undefined): number {
  return (cost?.total ?? 0) + 1
}

/** Whether a stack of `srcTroops` can pay the entry at all (1 must stay home). */
export function canAffordEntry(srcTroops: number, cost: EntryCost | null | undefined): boolean {
  return srcTroops - 1 >= minTroopsToEnter(cost)
}

/**
 * Troops that survive entering, given how many moved in.
 *
 * Returns 0 when the cost cannot be paid — that is an illegal move the caller
 * must refuse, NOT something to round up to 1.
 */
export function troopsAfterEntry(moving: number, cost: EntryCost | null | undefined): number {
  const survivors = moving - (cost?.total ?? 0)
  if (survivors < 1) return 0
  // Halving a positive count always leaves at least 1, so no floor is needed.
  return cost?.falloutHalf ? Math.ceil(survivors / 2) : survivors
}

export function cardCoinValue(
  cardResources: Record<string, number> | undefined | null,
  cardId: string,
): number {
  return cardResources?.[cardId] ?? 1
}

// ─── Lead faction (World Capital unlock) ──────────────────────────────────────

/**
 * The faction with the most campaign wins, or null when 2+ factions tie.
 *
 * Tracked by FACTION, not by player — players change factions between games,
 * the faction card is what carries the record. A tie means there is no lead
 * faction at all, so none of the lead-faction rules apply that game.
 */
export function leadFactionId(
  victoryLog: Array<{ factionId: string }> | undefined | null,
): string | null {
  const wins = factionWinCounts(victoryLog)
  const entries = Object.entries(wins)
  if (entries.length === 0) return null
  const max = Math.max(...entries.map(([, n]) => n))
  const leaders = entries.filter(([, n]) => n === max)
  return leaders.length === 1 ? leaders[0][0] : null
}

/** Wins per faction across the campaign. */
export function factionWinCounts(
  victoryLog: Array<{ factionId: string }> | undefined | null,
): Record<string, number> {
  const wins: Record<string, number> = {}
  for (const v of victoryLog ?? []) {
    if (!v?.factionId) continue
    wins[v.factionId] = (wins[v.factionId] ?? 0) + 1
  }
  return wins
}

/**
 * Starting troops the lead faction places on the World Capital, on top of their
 * normal starting troops. Not redistributable — they sit on the Capital.
 */
export const LEAD_FACTION_WORLD_CAPITAL_TROOPS = 3

/**
 * Fortification stickers in the campaign box. A fixed supply, like the city
 * stickers — once all five have been placed there are no more for the rest of
 * the campaign, and one worn out by combat does NOT come back.
 */
export const FORTIFICATION_SUPPLY = 5

/**
 * How many of the five fortifications have been used.
 *
 * Counts every fortification sticker ever placed, spent ones included: a
 * fortification destroyed at 10 charges keeps its sticker at `fortification:0`
 * precisely so it still counts here. Everything that asks "is this fortified?"
 * checks the remaining charges, so a spent one protects nothing.
 */
export function fortificationsPlaced(
  stickers: ReadonlyArray<{ description: string }> | undefined | null,
): number {
  return (stickers ?? []).filter(s => s.description.startsWith('fortification:')).length
}

/** The subset of a legacy Sticker this module needs. */
interface StickerLike {
  id: string
  name: string
  description: string
  placement: string
  targetId: string
}

export interface WorldCapitalReplacement {
  /** Entries to append to `destroyedCities` — the covered stickers. */
  replaced: Array<{ cityId: string; destroyedInGame: number; destroyedByPlayerId: string }>
  /** Names of the covered cities, for the announcement and history log. */
  replacedNames: string[]
}

/**
 * Cities the World Capital sticker covers when it is placed on `territoryId`.
 *
 * The Capital sticker physically goes on top of whatever city is already there,
 * so that city stops existing: it is recorded in `destroyedCities`, which is what
 * every city reader (`territory.cities[].isDestroyed`) already consults. The
 * sticker itself STAYS in `stickers` — it has been spent, so it must keep
 * counting against the 5-major / 9-minor limits.
 *
 * An HQ is not a city and is never covered. Cities already destroyed are skipped
 * so a re-run cannot double-record them.
 */
export function worldCapitalReplacedCities(
  stickers: readonly StickerLike[] | undefined | null,
  destroyedCities: ReadonlyArray<{ cityId: string }> | undefined | null,
  territoryId: string,
  placedByPlayerId: string,
  gameNumber: number,
): WorldCapitalReplacement {
  return citiesLostOn(stickers, destroyedCities, territoryId, placedByPlayerId, gameNumber)
}

/**
 * Cities on `territoryId` that stop existing — as `destroyedCities` entries.
 *
 * City stickers are a fixed supply (5 major, 9 minor for the whole campaign), so
 * a city that is covered, ruined or razed must stay in `stickers` and only be
 * recorded here. Deleting the sticker hands its slot back and lets an extra city
 * be founded later in the campaign — which is what a ruined minor city used to do.
 *
 * Cities already destroyed are skipped, so a re-run cannot double-record them.
 */
export function citiesLostOn(
  stickers: readonly StickerLike[] | undefined | null,
  destroyedCities: ReadonlyArray<{ cityId: string }> | undefined | null,
  territoryId: string,
  destroyedByPlayerId: string,
  gameNumber: number,
  /** Restrict to minor cities — the Ruin only ever takes one of those. */
  opts?: { minorOnly?: boolean },
): WorldCapitalReplacement {
  const alreadyGone = new Set((destroyedCities ?? []).map(d => d.cityId))
  const wanted = opts?.minorOnly ? 'city:minor' : 'city:'
  const covered = (stickers ?? []).filter(s =>
    s.placement === 'territory'
    && s.targetId === territoryId
    && (opts?.minorOnly ? s.description === wanted : s.description.startsWith(wanted))
    && !alreadyGone.has(s.id))
  return {
    replaced: covered.map(s => ({
      cityId: s.id,
      destroyedInGame: gameNumber,
      destroyedByPlayerId,
    })),
    replacedNames: covered.map(s => s.name),
  }
}

// ─── Buying a red star ────────────────────────────────────────────────────────

/** Cards a red star costs. */
export const STAR_PURCHASE_COST = 4

/**
 * May these exact cards be spent on a star right now?
 *
 * The rule that earns its keep: all four ids must be DISTINCT and every one
 * must still be in the hand. A duplicate firing of a buy — a double-click, a
 * replayed handler — re-submits ids that were just spent, and this is the
 * check that makes the second submission bounce instead of minting a star the
 * player never paid for. That exact phantom star once ended a game a turn
 * early.
 */
export function canSpendForStar(hand: string[], cardIds: string[]): boolean {
  if (cardIds.length !== STAR_PURCHASE_COST) return false
  if (new Set(cardIds).size !== cardIds.length) return false
  const held = new Set(hand)
  return cardIds.every(id => held.has(id))
}

/**
 * The four cards the quick-buy button offers to spend: coins first — they are
 * the cheapest to part with — then territory cards. Null when the hand cannot
 * afford a star, which is also what hides the button.
 */
export function starPurchaseSelection(
  hand: string[],
  isCoin: (cardId: string) => boolean,
): string[] | null {
  if (hand.length < STAR_PURCHASE_COST) return null
  const coins = hand.filter(isCoin)
  const rest = hand.filter(id => !isCoin(id))
  return [...coins, ...rest].slice(0, STAR_PURCHASE_COST)
}
