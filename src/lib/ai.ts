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
import { getCoinCard, coinTradeInTroops } from '@/data/cards'
import { cardCoinValue, livingCities } from '@/lib/gameLogic'
import { isSeaLine, ISLAND_TERRITORY_IDS } from '@/data/seaLines'

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

/**
 * Where an AI should drop a bonus troop it did not draft — the Resistance
 * event's troops, for instance.
 *
 * Purely defensive, because these troops arrive outside the AI's own turn and
 * cannot be attacked with: the border territory under the most pressure, scored
 * as the enemy troops that can reach it minus the garrison already standing
 * there, plus a little weight for ground that is expensive to lose. Falls back
 * to the biggest holding when nothing borders an enemy, and to null when the
 * player holds nothing.
 *
 * Deterministic — ties break on territory id — so a replay places identically.
 */
export function aiBonusTroopTarget(
  state: GameState,
  playerId: string,
  /** Restricts the choice — Join the Cause may only reinforce cities. */
  eligible?: (t: Terr) => boolean,
): string | null {
  const owned = ownedList(state, playerId).filter(t => !eligible || eligible(t))
  if (owned.length === 0) return null
  const borders = owned.filter(t => isBorder(state, t, playerId))
  const pool = borders.length > 0 ? borders : owned

  let best: Terr | null = null
  let bestScore = -Infinity
  for (const t of pool) {
    const pressure = enemyNeighbours(state, t, playerId).reduce((s, n) => s + n.troops, 0)
    const worth = (t.activeHqPlayerId ? 3 : 0)
      + livingCities(t).reduce((n, c) => n + (c.isMajor ? 2 : 1), 0)
    const score = pressure - t.troops + worth
    if (score > bestScore || (score === bestScore && best !== null && t.id < best.id)) {
      best = t
      bestScore = score
    }
  }
  return best?.id ?? null
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

  // ── Red-star pressure ──────────────────────────────────────────────────
  // Red stars, not territory count, are the win condition. Chase the face-up
  // mission when it is within reach, and gang up on anyone one star from
  // taking the campaign.
  const focus = aiMissionFocus(state, legacy, playerId)
  const pursuing = aiShouldPursueMission(focus, difficulty)
  const matchPoint = new Set(rivalsOnMatchPoint(state, legacy, playerId))

  // Candidate (src, tgt) pairs: own territory with 2+ troops adjacent to an enemy
  interface Cand { src: Terr; tgt: Terr; score: number }
  const cands: Cand[] = []
  for (const src of owned) {
    if (src.troops < 2) continue
    for (const tgt of enemyNeighbours(state, src, playerId)) {
      // Never attack the Fallout Zone (destroyed ground) with a token stack
      let score = 0
      const favorable = attackFavorable(src.troops, tgt.troops, difficulty === 'medium' ? 2 : 1.2)
      const isMissionTarget = pursuing && !!focus?.targetIds.has(tgt.id)
      if (difficulty === 'easy') {
        score = Math.random()
      } else if (difficulty === 'medium') {
        // A mission within a conquest or two is worth relaxing the odds bar for.
        if (!favorable && !(isMissionTarget && attackFavorable(src.troops, tgt.troops, 1.2))) continue
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
      // Mission targets outrank ordinary expansion — a completed mission is a
      // red star, which is the actual win condition.
      if (isMissionTarget) score += 12
      // Deny the campaign to anyone sitting on 3 stars. Easy stays oblivious —
      // its moves are meant to be random.
      if (difficulty !== 'easy' && tgt.occupyingPlayerId && matchPoint.has(tgt.occupyingPlayerId)) {
        score += 8
        // Taking an HQ off them removes a star outright.
        if (tgt.activeHqPlayerId) score += 6
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

// ─── Card trade-ins ───────────────────────────────────────────────────────────

/**
 * Coin value of a hand, using EXACTLY the human trade-in math: resource/coin
 * cards are 1, territory cards carry their own coin value including permanent
 * runner-up upgrades. Any drift here would let the AI mis-price its hand.
 */
export function handCoinTotal(
  hand: string[],
  cardResources: Record<string, number> | undefined | null,
): number {
  return hand.reduce(
    (sum, id) => sum + (getCoinCard(id) ? 1 : cardCoinValue(cardResources, id)),
    0,
  )
}

export interface TradeInDecision {
  /** Cards to spend — the whole hand; the track rewards bigger piles. */
  cardIds: string[]
  totalCoins: number
  troops: number
  reason: string
}

/**
 * Should the AI cash its hand in this draft phase, and for how much?
 *
 * Reward track (coins → troops): 2→2, 3→4, 4→7, 5→10, 6→13, 7→17, 8→21, 9→25,
 * 10+→30. Returns null to hold.
 *
 *   Easy   — trades the moment the hand is worth anything at all (2+ coins).
 *   Medium — waits until the hand is worth 4+ coins (the 7-troop tier).
 *   Hard   — looks one turn ahead: if a single extra coin would jump to a
 *            significantly better tier it holds, otherwise it cashes in now.
 *            It stops holding once the track flattens, and cashes immediately
 *            when a rival is one star from winning (troops now beat troops later).
 */
export function aiTradeInDecision(
  hand: string[],
  cardResources: Record<string, number> | undefined | null,
  difficulty: AIDifficulty,
  opts?: { rivalOnMatchPoint?: boolean },
): TradeInDecision | null {
  if (hand.length === 0) return null
  const totalCoins = handCoinTotal(hand, cardResources)
  const troops = coinTradeInTroops(totalCoins)
  if (troops === null) return null   // below the 2-coin minimum

  const spend = (reason: string): TradeInDecision => ({ cardIds: [...hand], totalCoins, troops, reason })

  if (difficulty === 'easy') return spend('easy: cash in whenever the hand is worth something')
  if (difficulty === 'medium') {
    return totalCoins >= 4 ? spend('medium: reached the 4-coin tier') : null
  }

  // Hard — is one more coin worth the delay?
  if (opts?.rivalOnMatchPoint) return spend('hard: a rival is on 3 stars — troops now')

  const next = coinTradeInTroops(totalCoins + 1) ?? troops
  const gain = next - troops
  // "Significantly better tier": a solid absolute jump, or a big relative one
  // (which is what makes holding a tiny 2-coin hand worthwhile).
  const worthHolding = gain >= 3 || next >= troops * 1.5
  // Past 7 coins the track flattens and a fat hand is a liability — an
  // elimination would hand the whole pile to the attacker.
  if (worthHolding && totalCoins < 7) return null

  return spend(`hard: holding gains only +${gain} troops`)
}

// ─── Red stars ────────────────────────────────────────────────────────────────

/** Red stars a player holds: HQs they control plus stars earned/bought. */
export function playerRedStars(state: GameState, legacy: LegacyState, playerId: string): number {
  const hqStars = Object.values(state.territories).filter(
    t => t.occupyingPlayerId === playerId && !!t.activeHqPlayerId,
  ).length
  return hqStars + ((legacy.purchasedStars ?? {})[playerId] ?? 0)
}

/** Every rival's star count, highest first. 4 stars wins the game. */
export function rivalStarCounts(
  state: GameState, legacy: LegacyState, playerId: string,
): Array<{ playerId: string; stars: number }> {
  return state.players
    .filter(p => p.id !== playerId && !p.isEliminated)
    .map(p => ({ playerId: p.id, stars: playerRedStars(state, legacy, p.id) }))
    .sort((a, b) => b.stars - a.stars)
}

/** Rivals one star from the campaign win — worth ganging up on. */
export function rivalsOnMatchPoint(
  state: GameState, legacy: LegacyState, playerId: string,
): string[] {
  return rivalStarCounts(state, legacy, playerId).filter(r => r.stars >= 3).map(r => r.playerId)
}

// ─── Mission pursuit ──────────────────────────────────────────────────────────

export interface MissionFocus {
  missionId: string
  /** Enemy territories whose CAPTURE advances the mission. */
  targetIds: Set<string>
  /** Conquests still needed. 0 = already satisfied. */
  remaining: number
}

/** Cities standing on a territory (HQ markers and ruins don't count). */
function standingCities(t: Terr): number {
  return (t.cities ?? []).filter(c => !c.isDestroyed && !c.headquartersFactionId).length
}

/**
 * What the AI must conquer to finish the face-up mission, and how far off it is.
 *
 * IMPORTANT: mission progress counts conquests BY COMBAT only — `turn.conqueredIds`.
 * Walking into an empty territory bumps `captureCount` but never counts here, so
 * the AI must not treat undefended land as mission progress.
 *
 * Returns null when the mission has no conquest path (e.g. the trade-in-driven
 * private missions), so the caller falls back to its normal expansion plan.
 */
export function aiMissionFocus(
  state: GameState,
  legacy: LegacyState,
  playerId: string,
): MissionFocus | null {
  const missionId = legacy.activeGameCards?.currentMissionId
  if (!missionId) return null

  const all = Object.values(state.territories)
  const mine = all.filter(t => t.occupyingPlayerId === playerId)
  const enemy = all.filter(t => t.occupyingPlayerId && t.occupyingPlayerId !== playerId)
  // Combat conquests only — this is the distinction the missions actually score.
  const conquered = state.turn?.conqueredIds ?? []
  const conqueredSea = state.turn?.conqueredViaSeaIds ?? []
  const ids = (ts: Terr[]) => new Set(ts.map(t => t.id))
  const focus = (targets: Terr[], remaining: number): MissionFocus =>
    ({ missionId, targetIds: ids(targets), remaining: Math.max(0, remaining) })

  switch (missionId) {
    case 'mc-6-cities': {
      const held = mine.reduce((n, t) => n + standingCities(t), 0)
      return focus(enemy.filter(t => standingCities(t) > 0), 6 - held)
    }
    case 'mc-4-cities-turn': {
      const taken = conquered.reduce((n, id) => {
        const t = state.territories[id]
        return n + (t?.occupyingPlayerId === playerId ? standingCities(t) : 0)
      }, 0)
      return focus(enemy.filter(t => standingCities(t) > 0), 4 - taken)
    }
    case 'mc-9-territories-turn':
      return focus(enemy, 9 - conquered.length)

    case 'mc-4-sea-turn': {
      // Only enemy territories reachable across a sea line from something we hold.
      const reachable = enemy.filter(t =>
        mine.some(m => m.troops > 1 && m.adjacentIds.includes(t.id) && isSeaLine(m.id, t.id)))
      return focus(reachable, 4 - conqueredSea.length)
    }
    case 'mc-continent-turn': {
      // Whichever continent we are closest to completing.
      const owned = continentOwnership(state, playerId)
      let bestC: string | null = null, bestGap = Infinity
      for (const [cId, size] of Object.entries(CONTINENT_SIZES)) {
        const gap = size - (owned[cId] ?? 0)
        if (gap > 0 && gap < bestGap) { bestGap = gap; bestC = cId }
      }
      if (!bestC) return focus([], 0)
      return focus(enemy.filter(t => t.continentId === bestC), bestGap)
    }
    case 'mc-7-continent-bonus': {
      const owned = continentOwnership(state, playerId)
      let bonus = 0
      for (const [cId, n] of Object.entries(owned)) {
        if (n >= (CONTINENT_SIZES[cId] ?? Infinity)) {
          bonus += (CONTINENT_BONUSES[cId as keyof typeof CONTINENT_BONUSES] ?? 0)
        }
      }
      if (bonus >= 7) return focus([], 0)
      // Push on continents we can still finish, nearest-first.
      const gaps = Object.entries(CONTINENT_SIZES)
        .map(([cId, size]) => ({ cId, gap: size - (owned[cId] ?? 0) }))
        .filter(g => g.gap > 0)
        .sort((a, b) => a.gap - b.gap)
      const push = new Set(gaps.slice(0, 2).map(g => g.cId))
      return focus(enemy.filter(t => push.has(t.continentId)), gaps[0]?.gap ?? Infinity)
    }
    case 'mc-7-islands': {
      const held = mine.filter(t => ISLAND_TERRITORY_IDS.has(t.id)).length
      return focus(enemy.filter(t => ISLAND_TERRITORY_IDS.has(t.id)), 7 - held)
    }
    case 'pm-guerrilla-warfare': {
      const marked = all.filter(t => (t.scars ?? []).some(s => s.type === 'bunker' || s.type === 'mercenary'))
      if (marked.length === 0) return null
      const missing = marked.filter(t => t.occupyingPlayerId !== playerId)
      return focus(missing, missing.length)
    }
    case 'pm-urban-troop-surge': {
      const wcId = legacy.worldCapitalTerritoryId ?? null
      if (!wcId) return null
      const majors = mine.filter(t => t.id !== wcId
        && (t.cities ?? []).some(c => c.isMajor && !c.isDestroyed && !c.headquartersFactionId)).length
      const need = (state.territories[wcId]?.occupyingPlayerId === playerId ? 0 : 1) + Math.max(0, 3 - majors)
      const targets = enemy.filter(t => t.id === wcId
        || (t.cities ?? []).some(c => c.isMajor && !c.isDestroyed && !c.headquartersFactionId))
      return focus(targets, need)
    }
    case 'pm-wide-border': {
      const owned = continentOwnership(state, playerId)
      const complete = Object.entries(CONTINENT_SIZES)
        .filter(([cId, size]) => (owned[cId] ?? 0) >= size).length
      if (complete >= 2) return focus([], 0)
      const gaps = Object.entries(CONTINENT_SIZES)
        .map(([cId, size]) => ({ cId, gap: size - (owned[cId] ?? 0) }))
        .filter(g => g.gap > 0)
        .sort((a, b) => a.gap - b.gap)
      const push = new Set(gaps.slice(0, 2 - complete).map(g => g.cId))
      return focus(enemy.filter(t => push.has(t.continentId)),
        gaps.slice(0, 2 - complete).reduce((s, g) => s + g.gap, 0))
    }
    default:
      // World Capital and the trade-in / knockout private missions are not
      // advanced by conquering anything.
      return null
  }
}

/** How many conquests the AI will chase a mission from. */
const MISSION_REACH: Record<AIDifficulty, number> = { easy: 0, medium: 2, hard: 6 }

/** Is this mission close enough that this difficulty should prioritise it? */
export function aiShouldPursueMission(focus: MissionFocus | null, difficulty: AIDifficulty): boolean {
  if (!focus || focus.remaining <= 0) return false
  return focus.remaining <= MISSION_REACH[difficulty]
}

// ─── Setup ────────────────────────────────────────────────────────────────────
//
// EVERYTHING ABOVE THIS LINE PLAYS A TURN. These play the screens BEFORE the
// first turn — which the computer used to sit out entirely: the faction, the
// permanent ability and the HQ were all put to the human at the keyboard, one
// bot seat at a time, and a solo player made every one of their opponents'
// opening decisions for them. The board driver already runs the AI's whole
// turn; setup was the odd one out.
//
// THEY TAKE NO GameState, unlike every function above, because there is not one
// yet — nobody owns a territory until the last HQ is placed. What they take is
// the list of options the screen has already worked out is legal, which keeps
// the rules in one place: HQMapPicker's blockInfo says what may be started on,
// and this only says which of those to want.

/**
 * Pick one of several options this difficulty has no opinion about.
 *
 * FACTIONS AND ABILITIES ARE A COIN TOSS, and saying so is better than
 * inventing a ranking. Nothing in the data rates one faction above another or
 * one permanent ability above its alternative — they are deliberately
 * side-grades — so a "hard" AI that always took the same one would not be
 * playing better, it would be playing the same. It would also open every
 * campaign identically, which is worse than either.
 *
 * The difficulty is still taken, so this reads as a decision rather than an
 * oversight, and so the signature does not change on the day a ranking exists.
 */
export function aiSetupChoice<T>(options: readonly T[], _difficulty: AIDifficulty): T | null {
  if (options.length === 0) return null
  return options[Math.floor(Math.random() * options.length)]
}

/**
 * How many territories in a continent touch something outside it.
 *
 * THE DOOR COUNT, which is what makes a continent worth holding: a bonus you
 * have to defend on five fronts is not the same bonus as one you defend on
 * one. Australia has a single door and is the classic strong opening for
 * exactly that reason.
 *
 * Computed from the adjacency data at load rather than written down, because a
 * hand-kept table of entrances is a second copy of the map.
 */
const CONTINENT_DOORS: Record<string, number> = (() => {
  const home: Record<string, string> = {}
  for (const t of TERRITORY_DEFINITIONS) home[t.id] = t.continentId
  const doors: Record<string, number> = {}
  for (const t of TERRITORY_DEFINITIONS) {
    doors[t.continentId] ??= 0
    if (t.adjacentIds.some(id => home[id] && home[id] !== t.continentId)) {
      doors[t.continentId]++
    }
  }
  return doors
})()

/**
 * What a starting territory is worth, before a single troop is placed.
 *
 * THE CONTINENT'S BONUS PER DOOR, plus a little for a quiet corner. It is the
 * oldest heuristic in Risk and it is the right one here: the opening question
 * is which continent you are trying to own, and a bonus divided by the number
 * of fronts you would have to hold answers it. Australia scores 2 for one door;
 * Europe scores 5 over four, and is famously not the same proposition.
 *
 * The adjacency term is small and breaks ties within a continent toward the
 * territory with fewest neighbours — an HQ is a thing you would rather not have
 * to defend from three sides.
 *
 * Exported so a test can hold it to the ordering it claims.
 */
export function startingValue(territoryId: string): number {
  const def = TERRITORY_DEFINITIONS.find(t => t.id === territoryId)
  if (!def) return 0
  const bonus = CONTINENT_BONUSES[def.continentId] ?? 0
  const doors = CONTINENT_DOORS[def.continentId] || 1
  return bonus / doors - def.adjacentIds.length * 0.01
}

/**
 * Where the computer starts, chosen from the territories the map allows.
 *
 * THE LADDER THIS MODULE ALREADY DOCUMENTS: easy takes any of them, medium
 * takes one of the better half, hard takes the best it is offered. Hard is
 * deliberately deterministic — opening in the strongest continent available is
 * correct play, not a rut, and with several seats placing in turn the
 * adjacency rule fans them out anyway.
 *
 * @param open the territory ids the picker has already ruled legal. This never
 *   decides legality itself: HQMapPicker's blockInfo is the only thing that
 *   knows about cities, scars, ruins, the Fallout Zone and HQ adjacency, and a
 *   second opinion here would eventually disagree with it.
 */
export function aiStartingTerritory(
  open: readonly string[], difficulty: AIDifficulty,
): string | null {
  if (open.length === 0) return null
  // Ties break on id so a replay places identically — the same rule the
  // bonus-troop chooser above follows.
  const ranked = [...open].sort((a, b) =>
    startingValue(b) - startingValue(a) || a.localeCompare(b))
  if (difficulty === 'easy') return ranked[Math.floor(Math.random() * ranked.length)]
  if (difficulty === 'hard') return ranked[0]
  const half = Math.max(1, Math.ceil(ranked.length / 2))
  return ranked[Math.floor(Math.random() * half)]
}
