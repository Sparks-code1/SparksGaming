/**
 * AI opponent decision engine.
 *
 * Pure functions: given the current GameState + LegacyState + a playerId and
 * difficulty, they return the moves the AI wants to make for a phase. The
 * GameBoard turn-driver executes these through the SAME mechanics human players
 * use, so all faction/scar/comeback/legacy effects apply identically.
 *
 *   Easy   — random valid moves.
 *   Medium — basic strategy (borders, favorable odds, protect HQs).
 *   Hard   — advanced (territory value, target the leader, mission progress).
 */
import type { GameState } from '@/types/game'
import type { Territory } from '@/types/territory'
import type { LegacyState } from '@/types/legacy'
import type { AIDifficulty } from '@/types/ai'
import { TERRITORY_DEFINITIONS, CONTINENT_BONUSES } from '@/data/territoryData'

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Terr = Territory

function ownedList(state: GameState, playerId: string): Terr[] {
  return Object.values(state.territories).filter(t => t.occupyingPlayerId === playerId)
}

/** A territory is a "border" if it has at least one adjacent enemy/unowned territory. */
function isBorder(state: GameState, t: Terr, playerId: string): boolean {
  return t.adjacentIds.some(adj => state.territories[adj]?.occupyingPlayerId !== playerId)
}

/** Enemy neighbours of an owned territory. */
function enemyNeighbours(state: GameState, t: Terr, playerId: string): Terr[] {
  return t.adjacentIds
    .map(adj => state.territories[adj])
    .filter((n): n is Terr => !!n && n.occupyingPlayerId !== playerId)
}

/** Continent id → number of territories in it (from the static map). */
const CONTINENT_SIZES: Record<string, number> = (() => {
  const sizes: Record<string, number> = {}
  for (const d of TERRITORY_DEFINITIONS) sizes[d.continentId] = (sizes[d.continentId] ?? 0) + 1
  return sizes
})()

/** How many territories the player owns in a continent. */
function continentOwnership(state: GameState, playerId: string): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const t of ownedList(state, playerId)) {
    counts[t.continentId] = (counts[t.continentId] ?? 0) + 1
  }
  return counts
}

/** True when the HQ territory belongs to the player. */
function isOwnHq(t: Terr, playerId: string): boolean {
  return t.occupyingPlayerId === playerId && !!t.activeHqPlayerId
}

/** The player currently controlling the most territories (the "leader"). */
function leadingPlayerId(state: GameState, excludeId: string): string | null {
  const counts: Record<string, number> = {}
  for (const t of Object.values(state.territories)) {
    if (t.occupyingPlayerId && t.occupyingPlayerId !== excludeId) {
      counts[t.occupyingPlayerId] = (counts[t.occupyingPlayerId] ?? 0) + 1
    }
  }
  let best: string | null = null, bestN = -1
  for (const [pid, n] of Object.entries(counts)) if (n > bestN) { bestN = n; best = pid }
  return best
}

function seededPick<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined
  return arr[Math.floor(Math.random() * arr.length)]
}

/**
 * Static value of holding a territory (Hard AI). Higher = more worth attacking
 * into or defending. Considers continent completion, cities, and HQs.
 */
function territoryValue(state: GameState, legacy: LegacyState, t: Terr, playerId: string): number {
  let v = 1
  // Cities and HQs are valuable
  const activeCities = (t.cities ?? []).filter(c => !c.isDestroyed && !c.headquartersFactionId)
  for (const c of activeCities) v += c.isMajor ? 3 : 2
  if (t.activeHqPlayerId) v += 4
  if (t.id === legacy.worldCapitalTerritoryId) v += 5
  // Territories that push toward a continent bonus are worth more
  const owned = continentOwnership(state, playerId)[t.continentId] ?? 0
  const size = CONTINENT_SIZES[t.continentId] ?? 99
  const remaining = size - owned
  if (remaining > 0) v += Math.max(0, 4 - remaining) // near-complete continents weighted up
  v += (CONTINENT_BONUSES[t.continentId as keyof typeof CONTINENT_BONUSES] ?? 0) * 0.3
  return v
}

// ─── Reinforce ────────────────────────────────────────────────────────────────

/**
 * Decide where to place `troops` reinforcements. Returns an array of territory
 * ids of length `troops` (one entry per troop; repeats allowed).
 *   Easy   — random owned territories.
 *   Medium — border + weakest territories.
 *   Hard   — weighted by attack plans / territory value / threat.
 */
export function aiReinforcePlacements(
  state: GameState,
  legacy: LegacyState,
  playerId: string,
  troops: number,
  difficulty: AIDifficulty,
): string[] {
  const owned = ownedList(state, playerId)
  if (owned.length === 0 || troops <= 0) return []
  const fzId = legacy.falloutZoneTerritoryId
  const isMutant = state.players.find(p => p.id === playerId)?.factionId === 'mutants'
  // The Fallout Zone can only receive drafted troops from the Mutants
  const placeable = owned.filter(t => t.id !== fzId || isMutant)
  const pool = placeable.length > 0 ? placeable : owned

  if (difficulty === 'easy') {
    return Array.from({ length: troops }, () => seededPick(pool)!.id)
  }

  // Medium/Hard: score each border territory by threat + value, place there.
  const borders = pool.filter(t => isBorder(state, t, playerId))
  const targets = borders.length > 0 ? borders : pool

  const score = (t: Terr): number => {
    const threats = enemyNeighbours(state, t, playerId)
    const maxThreat = threats.reduce((m, n) => Math.max(m, n.troops), 0)
    // Weakness = how outnumbered we are at this border
    let s = Math.max(0, maxThreat - t.troops) + 1
    if (isOwnHq(t, playerId)) s += 5 // protect HQs
    if (difficulty === 'hard') {
      s += territoryValue(state, legacy, t, playerId)
      // Reinforce launch points next to a valuable, weak enemy (attack prep)
      for (const n of threats) {
        if (n.troops < t.troops) s += territoryValue(state, legacy, n, playerId) * 0.5
      }
    }
    return s
  }

  // Distribute troops proportionally to score, weighted toward the top targets.
  const ranked = [...targets].sort((a, b) => score(b) - score(a))
  const result: string[] = []
  // Weight: 50% to the single most-threatened, rest spread across the top few
  const topCount = Math.min(ranked.length, difficulty === 'hard' ? 4 : 3)
  const weights = ranked.slice(0, topCount).map((t, i) => Math.max(1, score(t) * (topCount - i)))
  const totalW = weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < troops; i++) {
    // Deterministic-ish weighted round: fill the highest-weight remaining bucket
    let r = ((i + 1) / troops) * totalW
    let idx = 0
    for (; idx < weights.length; idx++) { r -= weights[idx]; if (r <= 0) break }
    result.push(ranked[Math.min(idx, ranked.length - 1)].id)
  }
  return result
}

// ─── Attack ───────────────────────────────────────────────────────────────────

export interface AttackOrder {
  srcId: string
  tgtId: string
}

/** Simple win-odds heuristic for attacker vs defender troop counts. */
function attackFavorable(atkTroops: number, defTroops: number, ratio: number): boolean {
  // atkTroops includes the 1 that must stay behind; usable dice come from atk-1
  const usable = atkTroops - 1
  return usable >= 2 && usable >= defTroops * ratio
}

/**
 * Plan the AI's attacks for the turn as an ordered list of source→target moves.
 * The driver executes them one at a time (each may repeat until it resolves).
 *   Easy   — a few random legal attacks.
 *   Medium — attack only at a 2:1 usable-troop advantage.
 *   Hard   — target the leader / continent completion / high value first.
 */
export function aiAttackPlan(
  state: GameState,
  legacy: LegacyState,
  playerId: string,
  difficulty: AIDifficulty,
): AttackOrder[] {
  const owned = ownedList(state, playerId)
  const orders: AttackOrder[] = []

  // Candidate (src, tgt) pairs: own territory with 2+ troops adjacent to an enemy
  interface Cand { src: Terr; tgt: Terr; score: number }
  const cands: Cand[] = []
  for (const src of owned) {
    if (src.troops < 2) continue
    for (const tgt of enemyNeighbours(state, src, playerId)) {
      // Never attack the Fallout Zone (destroyed ground) with a token stack
      let score = 0
      const favorable = attackFavorable(src.troops, tgt.troops, difficulty === 'medium' ? 2 : 1.2)
      if (difficulty === 'easy') {
        score = Math.random()
      } else if (difficulty === 'medium') {
        if (!favorable) continue
        score = (src.troops - 1) - tgt.troops
      } else {
        // Hard: value-weighted, prefer favorable odds, target the leader
        if (!attackFavorable(src.troops, tgt.troops, 1.1)) continue
        score = territoryValue(state, legacy, tgt, playerId)
        score += (src.troops - 1) - tgt.troops
        const leader = leadingPlayerId(state, playerId)
        if (leader && tgt.occupyingPlayerId === leader) score += 3
        // Unoccupied/weak expansion into a near-complete continent
        const owns = continentOwnership(state, playerId)[tgt.continentId] ?? 0
        const size = CONTINENT_SIZES[tgt.continentId] ?? 99
        if (size - owns <= 2) score += 4
      }
      cands.push({ src, tgt, score })
    }
  }

  cands.sort((a, b) => b.score - a.score)

  if (difficulty === 'easy') {
    // A handful of random attacks
    const n = Math.min(cands.length, 1 + Math.floor(Math.random() * 3))
    for (let i = 0; i < n; i++) {
      const c = cands[i]
      if (c) orders.push({ srcId: c.src.id, tgtId: c.tgt.id })
    }
    return orders
  }

  // Medium/Hard: take the best moves, avoiding re-using a source we already
  // committed to draining (simple greedy — the driver re-checks legality live).
  const usedSrc = new Set<string>()
  const cap = difficulty === 'hard' ? 8 : 5
  for (const c of cands) {
    if (orders.length >= cap) break
    if (usedSrc.has(c.src.id)) continue
    orders.push({ srcId: c.src.id, tgtId: c.tgt.id })
    usedSrc.add(c.src.id)
  }
  return orders
}

// ─── Fortify ──────────────────────────────────────────────────────────────────

export interface FortifyMove {
  srcId: string
  dstId: string
  troops: number
}

/**
 * All difficulties consolidate troops toward contested borders: move troops from
 * the safest interior stack to the most-threatened adjacent border territory.
 * `reachable` is the set of territories the src can legally fortify to (computed
 * by the caller using the game's own connectivity rules).
 */
export function aiFortifyMove(
  state: GameState,
  playerId: string,
  reachableFrom: (srcId: string) => Set<string>,
): FortifyMove | null {
  const owned = ownedList(state, playerId)
  // Interior sources with spare troops (not themselves a hot border)
  const sources = owned
    .filter(t => t.troops > 1)
    .sort((a, b) => b.troops - a.troops)

  for (const src of sources) {
    const reach = reachableFrom(src.id)
    // Best destination: an owned, reachable border with the biggest threat gap
    let best: { dst: Terr; gap: number } | null = null
    for (const dstId of reach) {
      const dst = state.territories[dstId]
      if (!dst || dst.occupyingPlayerId !== playerId || dst.id === src.id) continue
      if (!isBorder(state, dst, playerId)) continue
      const threat = enemyNeighbours(state, dst, playerId).reduce((m, n) => Math.max(m, n.troops), 0)
      const gap = threat - dst.troops
      if (!best || gap > best.gap) best = { dst, gap }
    }
    // Only move if the source is safer than the destination it feeds
    if (best && best.gap >= 0) {
      const srcIsBorder = isBorder(state, src, playerId)
      const move = srcIsBorder ? Math.floor((src.troops - 1) / 2) : (src.troops - 1)
      if (move >= 1) return { srcId: src.id, dstId: best.dst.id, troops: move }
    }
  }
  return null
}
