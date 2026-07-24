/**
 * gameReducer — the pure, headless rules engine for Risk Legacy.
 *
 * This is Step 1 of the server-authoritative multiplayer refactor. Game logic
 * currently lives inline inside GameBoard.tsx (52 `setGameState` sites tangled
 * with UI, refs, timers and PIXI). We are extracting it, one phase at a time,
 * into this file so that the exact same transitions can eventually run on a
 * trusted server.
 *
 * Contract:
 *   - `gameReducer(state, action, rng)` is PURE: no React, no Supabase, no
 *     Date.now(), no Math.random, no side effects. Given the same inputs it
 *     always returns the same output and never mutates its arguments.
 *   - ALL randomness is injected via the `rng` parameter (draft actions do not
 *     use it yet; attack/deck actions will in later steps).
 *   - The reducer owns transitions to the shared `GameState` only. UI-session
 *     concerns that are NOT part of GameState today (troopsToPlace counter,
 *     placementHistory, sounds, animations) remain in the component for now and
 *     are applied around the dispatch. They will migrate into the reduced state
 *     in a later step.
 *
 * SCOPE: draft/reinforce-phase actions (done) + combat resolution math
 * (this step — the pure dice engine, extracted from AttackModal). Attack/fortify
 * reducer actions and the GameState expansion they need are being layered on
 * next, one verified stage at a time.
 */

import type { GameState } from '@/types/game'
import type { Territory } from '@/types/territory'

// ─── Injected randomness ────────────────────────────────────────────────────

/** All non-determinism the reducer may need, injected so transitions stay pure
 *  and reproducible (and can later be seeded/verified server-side). */
export interface Rng {
  /** Float in [0, 1). */
  next(): number
  /** Integer in [minInclusive, maxInclusive]. */
  int(minInclusive: number, maxInclusive: number): number
  /** Fisher–Yates shuffle — returns a NEW array, never mutates the input. */
  shuffle<T>(arr: readonly T[]): T[]
}

/** Default RNG backed by Math.random — preserves current client behaviour.
 *  Server code will supply a seeded implementation instead. */
export function createMathRng(): Rng {
  const next = () => Math.random()
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    shuffle: <T>(arr: readonly T[]): T[] => {
      const a = [...arr]
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[a[i], a[j]] = [a[j], a[i]]
      }
      return a
    },
  }
}

/**
 * Deterministic seeded RNG (mulberry32). Same seed → same sequence, on any
 * runtime. This is what the SERVER uses: it seeds each action's resolution
 * (e.g. `seed = hash(matchId, actionSeq)`), runs the reducer, and the outcome is
 * reproducible and auditable — no trust in the client's dice. Portable to Deno /
 * Edge Functions (no Math.random, no platform APIs).
 */
export function createSeededRng(seed: number): Rng {
  let s = seed >>> 0
  const next = () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    shuffle: <T>(arr: readonly T[]): T[] => {
      const a = [...arr]
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[a[i], a[j]] = [a[j], a[i]]
      }
      return a
    },
  }
}

// ─── Actions ────────────────────────────────────────────────────────────────

/**
 * A serializable player intent. In the multiplayer model the client sends one
 * of these and the server validates + applies it. Only draft-phase variants
 * exist so far; attack/fortify/card actions arrive in later steps.
 */
export type Action =
  /** Place one reinforcement troop on a territory during the reinforce phase.
   *  If the territory is currently unoccupied (comeback "expand" / Stealthy
   *  missile targets), the placing player claims it. */
  | { type: 'PLACE_REINFORCEMENT'; playerId: string; territoryId: string }
  /** Remove the last reinforcement troop placed on a territory (undo). */
  | { type: 'UNDO_PLACEMENT'; territoryId: string }
  /** Finish placing reinforcements and advance to the attack phase. */
  | { type: 'END_REINFORCE_PHASE' }
  /** Finish attacking and advance to the fortify phase. */
  | { type: 'END_ATTACK_PHASE' }
  /** Attacker breaks off the current attack. No GameState effect today (the
   *  in-combat selection is UI-only); kept in the vocabulary for the eventual
   *  server, which will care that the attacker stopped. */
  | { type: 'RETREAT' }
  /**
   * Move troops between two owned territories during fortify. `troopsRemoved`
   * leaves the source; `troopsArriving` reaches the destination (they differ
   * only when the Fallout Zone halves the arrivals — the caller precomputes it).
   */
  | { type: 'CONFIRM_FORTIFY'; srcId: string; dstId: string; troopsRemoved: number; troopsArriving: number }
  /**
   * End the current player's turn: commit the end-of-turn board (scar effects
   * already folded into `endTerritories` by the caller via
   * `applyEndOfTurnScarEffects`), advance to the next non-skipped player, reset
   * to the reinforce phase, and bump the turn number on a new round.
   */
  | { type: 'END_TURN'; endTerritories: Record<string, Territory> }
  /**
   * Apply a resolved combat outcome to the board: subtract attacker losses,
   * then either capture the target (transfer ownership, move troops in minus
   * entry cost / fallout halving) or subtract defender losses (plus any Mutant
   * Unstable Cloning bonus). The dice were rolled by the pure `resolveCombat`
   * upstream; the two legacy-derived values (`entryCost*`, `defenderCloningBonus`)
   * are precomputed by the caller so this stays pure.
   */
  | {
      type: 'RESOLVE_COMBAT'
      srcId: string
      tgtId: string
      totalAtkLoss: number
      totalDefLoss: number
      captured: boolean
      troopsToAdvance: number
      /** Entry cost deducted from arriving troops when capturing an unoccupied
       *  city / World Capital (0 otherwise). Reads legacy → precomputed. */
      entryCostTotal: number
      /** Fallout Zone halves the arriving troops after the entry cost. */
      entryCostFalloutHalf: boolean
      /** Extra defender troops from Mutant Unstable Cloning on a repelled attack (0 if N/A). */
      defenderCloningBonus: number
    }

// ─── Effects ──────────────────────────────────────────────────────────────────
//
// The reducer owns only GameState. Consequences that touch LegacyState
// (Supabase: history log, red stars, comeback powers, scarDeck…), card decks,
// sounds, or React modals cannot live in a pure `=> GameState` reducer. So the
// reducer EMITS effects — descriptors of "what happened" that it can DECIDE from
// GameState — and the component (which has legacy/deck/modal access) interprets
// them. In the server model the server runs the reducer, applies effects to the
// persistent stores, and broadcasts them to clients.

export type Effect =
  /** A territory changed hands. Drives the victory sound + first-capture card award. */
  | { kind: 'territory-captured'; territoryId: string; fromPlayerId: string | null; byPlayerId: string; firstCaptureThisTurn: boolean }
  /** The captured territory held an enemy HQ (token stays; capturer now controls it). Drives the history log. */
  | { kind: 'hq-captured'; territoryId: string; territoryName: string; hqPlayerId: string; byPlayerId: string }
  /** One or more players lost their last territory this combat (already marked
   *  eliminated + cards transferred in the returned state). Drives elimination
   *  sound, eliminate-scar card, comeback power + First Blood + mercenary deck. */
  | { kind: 'players-eliminated'; playerIds: string[]; byPlayerId: string }

/** What the reducer returns: the next state plus any effects to interpret. */
export interface ReducerResult {
  state: GameState
  effects: Effect[]
}

// ─── Pure validation helpers ────────────────────────────────────────────────
//
// Rules that produce a user-facing rejection (rather than a state change) can't
// be expressed as a reducer transition, so they live here as pure predicates.
// The component calls these to decide whether to dispatch (and what notice to
// show on failure); the reducer trusts that a dispatched action was validated.

/** Legacy/faction context needed to validate a reinforcement placement. */
export interface ReinforcementRules {
  /** Territory permanently marked as the Fallout Zone, if any. */
  falloutZoneTerritoryId?: string | null
  /** Faction of the placing player (Fallout Zone is Mutants-only). */
  playerFactionId: string
  /** True when the player has the "Cautious" alien weakness power. */
  isCautiousWeakness?: boolean
  /** Territories this player has already placed recruits into this draft. */
  placementHistory: string[]
}

export type PlacementResult = { ok: true } | { ok: false; reason: string }

/** Validates a normal (owned-territory) reinforcement placement. Mirrors the
 *  guards previously inlined in GameBoard's reinforce handler. */
export function checkReinforcementPlacement(
  state: GameState,
  territoryId: string,
  rules: ReinforcementRules,
): PlacementResult {
  const t = state.territories[territoryId]
  if (!t) return { ok: false, reason: 'No such territory' }

  // Fallout Zone: only the Mutants may draft troops into it
  if (territoryId === rules.falloutZoneTerritoryId && rules.playerFactionId !== 'mutants') {
    return { ok: false, reason: '☢ Only the Mutants can draft troops into the Fallout Zone' }
  }

  // Cautious weakness power: recruited troops go into at most 2 distinct territories
  if (rules.isCautiousWeakness) {
    const placedInto = new Set(rules.placementHistory)
    if (!placedInto.has(territoryId) && placedInto.size >= 2) {
      return { ok: false, reason: '⚠ Cautious — you can only place recruited troops into 2 territories' }
    }
  }

  return { ok: true }
}

/** True when `playerId` may attack from `srcId` to `tgtId`: owns the source with
 *  more than one troop, and the target is an adjacent, enemy-held territory. */
export function canStartAttack(state: GameState, srcId: string, tgtId: string, playerId: string): boolean {
  const src = state.territories[srcId]
  const tgt = state.territories[tgtId]
  if (!src || !tgt) return false
  return src.occupyingPlayerId === playerId
    && src.troops > 1
    && src.adjacentIds.includes(tgtId)
    && tgt.occupyingPlayerId !== playerId
}

/** True when `playerId` may fortify from `srcId`: owns it with more than one
 *  troop. (Which destinations are reachable — Saharan connected/disconnected
 *  rules, Short-Sighted weakness — is a separate reachability check.) */
export function canStartFortify(state: GameState, srcId: string, playerId: string): boolean {
  const src = state.territories[srcId]
  if (!src) return false
  return src.occupyingPlayerId === playerId && src.troops > 1
}

/** The next player to act and whether a new round begins. Skips players who are
 *  eliminated AND have already used or forfeited their Join the War option. */
export function computeTurnAdvance(state: GameState): { nextIdx: number; isNewRound: boolean } {
  const n = state.players.length
  let nextIdx = (state.currentPlayerIndex + 1) % n
  while (
    state.players[nextIdx].isEliminated &&
    state.players[nextIdx].joinedWarThisGame !== undefined &&
    nextIdx !== state.currentPlayerIndex
  ) {
    nextIdx = (nextIdx + 1) % n
  }
  return { nextIdx, isNewRound: nextIdx <= state.currentPlayerIndex }
}

/**
 * End-of-turn scar effects for the ENDING player's territories. Biological −1
 * (Mercenary +1); the Mutants have both reversed. A territory sitting at 1 troop
 * that takes a loss is vacated (troops 0, owner null) — but never the player's
 * LAST territory. The Fallout Zone gives Mutants +1 there, others −1. Pure:
 * returns a new territories map + the names of any vacated territories.
 */
export function applyEndOfTurnScarEffects(
  territories: Record<string, Territory>,
  endingPlayerId: string,
  endingIsMutant: boolean,
  falloutZoneId: string | null | undefined,
): { territories: Record<string, Territory>; vacatedNames: string[] } {
  const result = { ...territories }
  const vacatedNames: string[] = []
  const ownedIds = Object.entries(result)
    .filter(([, t]) => t.occupyingPlayerId === endingPlayerId)
    .map(([id]) => id)
  let ownedCount = ownedIds.length

  const applyLoss = (id: string, t: Territory) => {
    if (t.troops <= 1) {
      // Never vacate the player's LAST territory — would soft-lock them
      if (ownedCount > 1) {
        result[id] = { ...t, troops: 0, occupyingPlayerId: null }
        vacatedNames.push(t.name)
        ownedCount--
      }
    } else {
      result[id] = { ...t, troops: t.troops - 1 }
    }
  }

  for (const id of ownedIds) {
    const t = result[id]
    const hasBio = t.scars.some(s => s.type === 'biological')
    const hasMerc = t.scars.some(s => s.type === 'mercenary')
    if (hasBio) {
      if (endingIsMutant) result[id] = { ...t, troops: t.troops + 1 }
      else applyLoss(id, t)
    } else if (hasMerc) {
      if (!endingIsMutant) result[id] = { ...t, troops: t.troops + 1 }
      else applyLoss(id, t)
    }
  }

  if (falloutZoneId) {
    const fzT = result[falloutZoneId]
    if (fzT?.occupyingPlayerId === endingPlayerId) {
      if (endingIsMutant) result[falloutZoneId] = { ...fzT, troops: fzT.troops + 1 }
      else if (fzT.troops > 1) result[falloutZoneId] = { ...fzT, troops: fzT.troops - 1 }
    }
  }

  return { territories: result, vacatedNames }
}

// ─── Reducer ────────────────────────────────────────────────────────────────

/**
 * Apply an action to the game state, returning a new state. Pure and total:
 * unknown or inapplicable actions return the state unchanged.
 *
 * @param rng injected randomness (unused by draft actions; reserved so the
 *            signature is stable as later phases are added)
 */
export function gameReducer(state: GameState, action: Action, _rng: Rng): ReducerResult {
  /** Wrap a next-state that produced no effects. */
  const only = (s: GameState): ReducerResult => ({ state: s, effects: [] })
  switch (action.type) {
    case 'PLACE_REINFORCEMENT': {
      const t = state.territories[action.territoryId]
      if (!t) return only(state)
      return only({
        ...state,
        territories: {
          ...state.territories,
          [action.territoryId]: {
            ...t,
            // Claim the territory if it was unoccupied (expand / stealthy drops);
            // for an already-owned territory this is a no-op.
            occupyingPlayerId: t.occupyingPlayerId ?? action.playerId,
            troops: t.troops + 1,
          },
        },
      })
    }

    case 'UNDO_PLACEMENT': {
      const t = state.territories[action.territoryId]
      if (!t) return only(state)
      return only({
        ...state,
        territories: {
          ...state.territories,
          [action.territoryId]: { ...t, troops: t.troops - 1 },
        },
      })
    }

    case 'END_REINFORCE_PHASE': {
      if (state.phase !== 'reinforce') return only(state)
      return only({ ...state, phase: 'attack' })
    }

    case 'END_ATTACK_PHASE': {
      if (state.phase !== 'attack') return only(state)
      return only({ ...state, phase: 'fortify' })
    }

    case 'RESOLVE_COMBAT': {
      const src0 = state.territories[action.srcId]
      const tgt0 = state.territories[action.tgtId]
      if (!src0 || !tgt0) return only(state)

      const src = { ...src0 }
      const tgt = { ...tgt0 }
      const attackerId = src0.occupyingPlayerId ?? ''
      const defenderId = tgt0.occupyingPlayerId       // pre-capture owner (null if unoccupied)
      const preHqPlayerId = tgt0.activeHqPlayerId

      src.troops -= action.totalAtkLoss

      if (action.captured) {
        const moving = Math.max(1, action.troopsToAdvance)
        // Capturer takes the territory. Any enemy HQ token stays on it
        // (activeHqPlayerId is preserved via the {...tgt0} spread), so the
        // capturer now controls that HQ — matching current behaviour.
        tgt.occupyingPlayerId = src.occupyingPlayerId
        tgt.troops = Math.max(1, moving - action.entryCostTotal)
        if (action.entryCostFalloutHalf) {
          tgt.troops = Math.max(1, Math.ceil(tgt.troops / 2))
        }
        src.troops -= moving
      } else {
        tgt.troops -= action.totalDefLoss
        // Mutant Unstable Cloning: defender regains troops on natural doubles
        tgt.troops += action.defenderCloningBonus
      }

      const territories = { ...state.territories, [action.srcId]: src, [action.tgtId]: tgt }
      let players = state.players
      const effects: Effect[] = []

      if (action.captured) {
        // HQ log first (matches previous ordering), then victory/card award.
        if (preHqPlayerId && preHqPlayerId !== defenderId) {
          effects.push({ kind: 'hq-captured', territoryId: action.tgtId, territoryName: tgt0.name, hqPlayerId: preHqPlayerId, byPlayerId: attackerId })
        }
        effects.push({ kind: 'territory-captured', territoryId: action.tgtId, fromPlayerId: defenderId, byPlayerId: attackerId, firstCaptureThisTurn: !state.turn.captured })

        // Elimination: any non-eliminated player who now holds 0 territories is
        // out. Mark them, wipe their hand, and transfer their cards to the
        // capturer — the GameState mutation that used to live in a setTimeout.
        const eliminatedIds = players
          .filter(p => !p.isEliminated && !Object.values(territories).some(t => t.occupyingPlayerId === p.id))
          .map(p => p.id)
        if (eliminatedIds.length > 0) {
          const capturedCards = players.filter(p => eliminatedIds.includes(p.id)).flatMap(p => p.cards)
          players = players.map(p => {
            if (eliminatedIds.includes(p.id)) return { ...p, isEliminated: true, cards: [] }
            if (p.id === attackerId) return { ...p, cards: [...p.cards, ...capturedCards] }
            return p
          })
          effects.push({ kind: 'players-eliminated', playerIds: eliminatedIds, byPlayerId: attackerId })
        }
      }

      return { state: { ...state, territories, players }, effects }
    }

    case 'RETREAT':
      // No GameState change — the attacker simply stops. Selection/modal state
      // is component-owned UI today.
      return only(state)

    case 'CONFIRM_FORTIFY': {
      const src = state.territories[action.srcId]
      const dst = state.territories[action.dstId]
      if (!src || !dst) return only(state)
      return only({
        ...state,
        territories: {
          ...state.territories,
          [action.srcId]: { ...src, troops: src.troops - action.troopsRemoved },
          [action.dstId]: { ...dst, troops: dst.troops + action.troopsArriving },
        },
      })
    }

    case 'END_TURN': {
      const { nextIdx, isNewRound } = computeTurnAdvance(state)
      return only({
        ...state,
        territories: { ...state.territories, ...action.endTerritories },
        phase: 'reinforce',
        currentPlayerIndex: nextIdx,
        turnNumber: isNewRound ? state.turnNumber + 1 : state.turnNumber,
      })
    }

    default:
      return only(state)
  }
}

// ─── Combat engine (pure) ─────────────────────────────────────────────────────
//
// Extracted verbatim from AttackModal's `simulateAutoResolve`, with all dice
// rolled through the injected `Rng` instead of Math.random. This is the whole
// dice + modifier stack (bunker, ammo shortage, fortification, bear trap,
// aggressive, triple-kill, sixes-win, reroll-ones, nuclear fallout, dice caps).
// In the server-authoritative model this runs on the server; the client only
// animates the returned rounds. Missiles/EMP mutate the modifier inputs before
// this is called (a die forced to 6, or all modifiers zeroed), exactly as the
// UI does today, so they need no special handling here.

/** All combat modifiers for one battle. Mirrors AttackModal's opts object. */
export interface CombatModifiers {
  /** Cap attacker dice below the usual 3 (wasteland scar, ammo-shortage event). */
  attackerMaxDiceOverride?: number
  /** Add to every attacker die after rolling (Aggressive comeback vs HQ). */
  attackerBonusAllDice: number
  /** Subtract 1 from the attacker's lowest die (Enclave / Bear Trap). */
  attackerSubtractLowest: boolean
  /** Three-of-a-kind attack + ≥1 kill wipes all defenders (Berserker Rage). */
  tripleKillEnabled: boolean
  /** Add to defender's highest / lowest die (Bunker, Fortification; negative = Ammo Shortage). */
  defenderDieBonus?: { highest: number; lowest: number }
  /** Extra defender dice above the base 2 (HQ, DM abilities). */
  defenderBonusDiceCap: number
  /** Both sides lose +1 extra troop per round (Nuclear Fallout scar). */
  nuclearFallout: boolean
  /** Attacker 6's beat defender 6's (Mutant Unnatural Strength). */
  attackerSixesWin: boolean
  /** Attacker dice re-roll 1's (Mutant comeback vs the Bringer). */
  attackerRerollOnes: boolean
}

export interface CombatRound {
  atkDice: number[]
  defDice: number[]
  aLoss: number
  dLoss: number
  tripleKill: boolean
  defDoubleMax: boolean
}

export interface CombatOutcome {
  rounds: CombatRound[]
  totalAtkLoss: number
  totalDefLoss: number
  captured: boolean
  atkTroopsAfter: number
  defTroopsAfter: number
  maxAtkDiceUsed: number
  defDoublesRounds: number
}

/** Roll one die 1–6, re-rolling 1's if required, via the injected Rng. */
function rollDie(rng: Rng, rerollOnes = false): number {
  let v = rng.int(1, 6)
  while (rerollOnes && v === 1) v = rng.int(1, 6)
  return v
}

/** Roll n dice (descending), via the injected Rng. */
function rollN(rng: Rng, n: number, rerollOnes = false): number[] {
  return Array.from({ length: n }, () => rollDie(rng, rerollOnes)).sort((a, b) => b - a)
}

/** True when 2+ dice share a value (natural doubles — Mutant Unstable Cloning). */
export function hasDoubles(dice: number[]): boolean {
  return dice.length >= 2 && new Set(dice).size < dice.length
}

/** Compare sorted attacker/defender dice pairwise; tie goes to defender unless
 *  attackerSixesWin. Returns troops lost by each side this round. */
export function compareRolls(atk: number[], def: number[], atkSixesWin = false): { aLoss: number; dLoss: number } {
  const pairs = Math.min(atk.length, def.length)
  let aLoss = 0, dLoss = 0
  for (let i = 0; i < pairs; i++) {
    if (atk[i] > def[i] || (atkSixesWin && atk[i] === 6 && def[i] === 6)) dLoss++
    else aLoss++
  }
  return { aLoss, dLoss }
}

/**
 * Resolve a whole battle to completion (attacker stops at 1 troop or defender
 * hits 0), returning every round plus totals. Pure: identical inputs + Rng
 * sequence always yield the same outcome.
 */
export function resolveCombat(
  atkTroopsStart: number,
  defTroopsStart: number,
  mods: CombatModifiers,
  rng: Rng,
): CombatOutcome {
  const rounds: CombatRound[] = []
  let atkTroops = atkTroopsStart
  let defTroops = defTroopsStart
  let totalAtkLoss = 0
  let totalDefLoss = 0
  let maxAtkDiceUsed = 0
  let defDoublesRounds = 0

  while (atkTroops > 1 && defTroops > 0) {
    const numAtk = Math.min(mods.attackerMaxDiceOverride ?? 3, Math.min(3, atkTroops - 1))
    const numDef = Math.min(2 + mods.defenderBonusDiceCap, Math.max(1, defTroops))
    maxAtkDiceUsed = Math.max(maxAtkDiceUsed, numAtk)

    // Roll and apply attacker modifiers
    const rawAtk = rollN(rng, numAtk, mods.attackerRerollOnes)
    let finalAtk = mods.attackerSubtractLowest && rawAtk.length > 0
      ? (() => {
          const d = [...rawAtk].sort((a, b) => a - b)
          d[0] = Math.max(1, d[0] - 1)
          return d.sort((a, b) => b - a)
        })()
      : rawAtk
    if (mods.attackerBonusAllDice !== 0) {
      finalAtk = finalAtk.map(d => Math.max(1, Math.min(6, d + mods.attackerBonusAllDice)))
    }

    // Roll and apply defender modifiers (natural doubles counted before bonuses)
    const rawDef = rollN(rng, numDef).sort((a, b) => b - a)
    if (hasDoubles(rawDef)) defDoublesRounds++
    if (mods.defenderDieBonus && rawDef.length > 0) {
      rawDef[0] = Math.max(1, Math.min(6, rawDef[0] + mods.defenderDieBonus.highest))
      if (rawDef.length > 1) {
        rawDef[rawDef.length - 1] = Math.max(1, Math.min(6, rawDef[rawDef.length - 1] + mods.defenderDieBonus.lowest))
      }
    }

    const base = compareRolls(finalAtk, rawDef, mods.attackerSixesWin)
    const aLoss = base.aLoss + (mods.nuclearFallout ? 1 : 0)
    let dLoss = base.dLoss + (mods.nuclearFallout ? 1 : 0)

    // Berserker Rage: three-of-a-kind + ≥1 kill wipes all defenders
    const tripleKill = mods.tripleKillEnabled
      && finalAtk.length === 3
      && finalAtk[0] === finalAtk[1] && finalAtk[1] === finalAtk[2]
      && base.dLoss > 0
    if (tripleKill) dLoss = defTroops

    const defDoubleMax = rawDef.length >= 2 && rawDef.every(d => d === 6)

    rounds.push({ atkDice: finalAtk, defDice: rawDef, aLoss, dLoss, tripleKill, defDoubleMax })

    totalAtkLoss += aLoss
    totalDefLoss += dLoss
    atkTroops -= aLoss
    defTroops -= dLoss

    if (tripleKill || defTroops <= 0) break
    if (atkTroops <= 1) break
  }

  return {
    rounds,
    totalAtkLoss,
    totalDefLoss,
    captured: defTroops <= 0,
    atkTroopsAfter: Math.max(0, atkTroops),
    defTroopsAfter: Math.max(0, defTroops),
    maxAtkDiceUsed,
    defDoublesRounds,
  }
}
