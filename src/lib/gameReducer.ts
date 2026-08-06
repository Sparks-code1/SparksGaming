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
import { legalJoinWarTerritoryIds, troopsAfterEntry } from '@/lib/gameLogic'

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
  /**
   * Declare an attack and let the RESOLVER roll it. The server-authoritative
   * counterpart to `RESOLVE_COMBAT`.
   *
   * `RESOLVE_COMBAT` takes the losses and the capture flag as inputs, because
   * in hotseat the client has already rolled. That makes it useless for server
   * authority — a server running it applies whatever result the caller claims,
   * so `{ totalDefLoss: 99, captured: true }` would simply be honoured. This
   * action carries only intent, and the dice are rolled inside the reducer from
   * the injected Rng, which the server seeds and owns.
   *
   * `mods` is still supplied by the caller: the modifier stack is derived from
   * legacy/scar/faction state the server does not model yet. It is clamped
   * server-side (see `clampCombatModifiers`) and logged verbatim for audit.
   */
  | {
      type: 'DECLARE_ATTACK'
      playerId: string
      srcId: string
      tgtId: string
      /** Troops to advance on capture; clamped to what actually survives. */
      troopsToAdvance: number
      mods: CombatModifiers
      entryCostTotal: number
      entryCostFalloutHalf: boolean
      /** Applied only if the dice actually produced defender doubles. */
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
  | {
      kind: 'players-eliminated'
      playerIds: string[]
      byPlayerId: string
      /** Cards taken from the eliminated players. Reported here because the
       *  reducer has already moved them to the capturer by the time the
       *  component sees this — the Forced Occupation private mission needs to
       *  know whether any was worth 3+ resources. */
      capturedCardIds: string[]
    }
  /**
   * The resolver rolled a battle. Carries every round so a client can animate
   * the dice the SERVER rolled instead of inventing its own — without this the
   * board would jump straight to the result.
   *
   * Only `DECLARE_ATTACK` emits it; hotseat's `RESOLVE_COMBAT` does not,
   * because there the client already has the rounds it rolled itself.
   */
  | { kind: 'combat-resolved'; srcId: string; tgtId: string; outcome: CombatOutcome }

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

/**
 * Should this eliminated player's turn be passed over entirely?
 *
 * Two cases: they already used or forfeited their Join the War option, or they
 * are still undecided but there is nowhere legal to re-enter — in which case
 * the only "choice" on offer would be to forfeit, so skip them silently and
 * leave the option open for a later turn if a spot frees up.
 */
function skipEliminatedPlayer(state: GameState, idx: number): boolean {
  const p = state.players[idx]
  if (!p?.isEliminated) return false
  if (p.joinedWarThisGame !== undefined) return true
  return legalJoinWarTerritoryIds(
    state.territories,
    Object.values(state.activeHqs ?? {}),
    state.legacySnapshot?.falloutZoneTerritoryId,
  ).length === 0
}

/** The next player to act and whether a new round begins. Skips eliminated
 *  players who have no Join the War decision left to make. */
export function computeTurnAdvance(state: GameState): { nextIdx: number; isNewRound: boolean } {
  const n = state.players.length
  let nextIdx = (state.currentPlayerIndex + 1) % n
  let guard = 0
  while (
    guard++ < n &&
    nextIdx !== state.currentPlayerIndex &&
    skipEliminatedPlayer(state, nextIdx)
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
  /**
   * Mercenary comeback power: the ending player's faction holds it, so their
   * Mercenary scars pay +2 instead of +1. Applied here rather than as a draft
   * bonus so the troops land ON the scarred territory, and so it resolves
   * exactly once per turn alongside the scar it upgrades.
   */
  mercenaryComeback = false,
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
      // Mutants have the scar reversed, so the comeback power cannot rescue it.
      if (!endingIsMutant) result[id] = { ...t, troops: t.troops + (mercenaryComeback ? 2 : 1) }
      else applyLoss(id, t)
    }
  }

  if (falloutZoneId) {
    const fzT = result[falloutZoneId]
    if (fzT?.occupyingPlayerId === endingPlayerId) {
      // Mutants thrive there; everyone else bleeds a troop a turn and, at one
      // troop, is driven off entirely — the ground itself finishes the job.
      // Goes through applyLoss so it behaves exactly like a Bio-hazard scar,
      // including the guard that never takes a player's LAST territory (that
      // would eliminate them by attrition with no way to respond).
      if (endingIsMutant) result[falloutZoneId] = { ...fzT, troops: fzT.troops + 1 }
      else applyLoss(falloutZoneId, fzT)
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
export function gameReducer(state: GameState, action: Action, rng: Rng): ReducerResult {
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

    case 'DECLARE_ATTACK': {
      // The SERVER-AUTHORITATIVE attack. The client declares only its INTENT —
      // which territory, which target, how many troops advance on a capture —
      // and the dice are rolled here, through the injected Rng.
      //
      // `RESOLVE_COMBAT` below cannot do this: it takes the losses and the
      // capture flag as INPUTS, because in hotseat the client already rolled.
      // Running that action on a server grants no dice authority at all — it
      // faithfully applies whatever result the caller claims. This action is
      // the one the server accepts; RESOLVE_COMBAT stays for local hotseat.
      const src0 = state.territories[action.srcId]
      const tgt0 = state.territories[action.tgtId]
      if (!src0 || !tgt0) return only(state)
      if (!canStartAttack(state, action.srcId, action.tgtId, action.playerId)) return only(state)

      const outcome = resolveCombat(src0.troops, tgt0.troops, action.mods, rng)
      const result = applyCombatOutcome(state, {
        srcId: action.srcId,
        tgtId: action.tgtId,
        totalAtkLoss: outcome.totalAtkLoss,
        totalDefLoss: outcome.totalDefLoss,
        captured: outcome.captured,
        // Never advance more than survived. The client picks the number before
        // the dice exist, so it can legitimately exceed what is left.
        troopsToAdvance: Math.min(action.troopsToAdvance, Math.max(1, outcome.atkTroopsAfter - 1)),
        entryCostTotal: action.entryCostTotal,
        entryCostFalloutHalf: action.entryCostFalloutHalf,
        defenderCloningBonus: outcome.defDoublesRounds > 0 ? action.defenderCloningBonus : 0,
      })
      // The rounds ride along so clients animate the dice the SERVER rolled
      // rather than inventing their own.
      return {
        state: result.state,
        effects: [{ kind: 'combat-resolved', srcId: action.srcId, tgtId: action.tgtId, outcome }, ...result.effects],
      }
    }

    case 'RESOLVE_COMBAT':
      // Hotseat only. The caller already rolled; the server must never accept
      // this action (see SERVER_ACTIONS in the edge function).
      return applyCombatOutcome(state, action)

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
      // Merge the end-of-turn board FIRST: whether an eliminated player has a
      // legal re-entry (and so is offered a turn at all) must be judged on the
      // final map — an end-of-turn scar can vacate a territory and open one up.
      //
      // `endTerritories` is computed by the CALLER. On the server that caller is
      // the client, so the server recomputes it instead of trusting the payload
      // — see `endTurnTerritories` below.
      const withEnd: GameState = {
        ...state,
        territories: { ...state.territories, ...action.endTerritories },
      }
      const { nextIdx, isNewRound } = computeTurnAdvance(withEnd)
      return only({
        ...withEnd,
        phase: 'reinforce',
        currentPlayerIndex: nextIdx,
        turnNumber: isNewRound ? state.turnNumber + 1 : state.turnNumber,
      })
    }

    default:
      return only(state)
  }
}

// ─── Server-authority guards ─────────────────────────────────────────────────
//
// Three of the reducer's actions were designed for a trusted caller and carry
// values the caller computed. That is fine in hotseat — the caller IS the
// player's own machine — but on a server each one is a hole:
//
//   RESOLVE_COMBAT.totalDefLoss/captured   the whole combat result
//   END_TURN.endTerritories                an entire replacement board
//   DECLARE_ATTACK.mods                    the modifier stack
//
// The first is closed by refusing the action server-side (DECLARE_ATTACK
// replaces it). These two close the others.

/**
 * The end-of-turn board, computed HERE rather than taken from the caller.
 *
 * `END_TURN.endTerritories` is a full territory map. A client that sent one of
 * its own could hand itself the board. The server calls this and substitutes
 * the result, so the payload it received is never applied.
 */
export function endTurnTerritories(
  state: GameState,
  /** Legacy-derived inputs the server reads from the campaign row, not the client. */
  rules: { endingIsMutant: boolean; falloutZoneId: string | null | undefined; mercenaryComeback?: boolean },
): Record<string, Territory> {
  const endingPlayerId = state.players[state.currentPlayerIndex]?.id ?? ''
  return applyEndOfTurnScarEffects(
    state.territories,
    endingPlayerId,
    rules.endingIsMutant,
    rules.falloutZoneId,
    rules.mercenaryComeback ?? false,
  ).territories
}

/**
 * Clamp a caller-supplied modifier stack to values the rules can actually
 * produce.
 *
 * The server does not model legacy/scar/faction state yet, so it cannot DERIVE
 * the modifiers — it can only refuse impossible ones. That bounds the damage a
 * forged stack can do (no 9-dice defenders, no unbounded die bonuses) without
 * pretending to full authority over the modifier layer. The raw submission is
 * logged verbatim so a mismatch is auditable after the fact.
 */
export function clampCombatModifiers(m: Partial<CombatModifiers> | null | undefined): CombatModifiers {
  const clamp = (v: unknown, lo: number, hi: number, dflt = 0) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.trunc(v))) : dflt
  const override = m?.attackerMaxDiceOverride
  return {
    // Never MORE than the standard 3 attacker dice — only ever a restriction.
    attackerMaxDiceOverride: typeof override === 'number' ? clamp(override, 1, 3, 3) : undefined,
    attackerBonusAllDice: clamp(m?.attackerBonusAllDice, -5, 5),
    attackerSubtractLowest: !!m?.attackerSubtractLowest,
    tripleKillEnabled: !!m?.tripleKillEnabled,
    defenderDieBonus: m?.defenderDieBonus
      ? { highest: clamp(m.defenderDieBonus.highest, -5, 5), lowest: clamp(m.defenderDieBonus.lowest, -5, 5) }
      : undefined,
    defenderDieBonusSingle: typeof m?.defenderDieBonusSingle === 'number'
      ? clamp(m.defenderDieBonusSingle, -5, 5) : undefined,
    // 2 base + at most 2 bonus dice; anything above that is not a rule.
    defenderBonusDiceCap: clamp(m?.defenderBonusDiceCap, 0, 2),
    nuclearFallout: !!m?.nuclearFallout,
    attackerSixesWin: !!m?.attackerSixesWin,
    attackerRerollOnes: !!m?.attackerRerollOnes,
  }
}

/**
 * Bound a client-rolled combat result to what the board could actually allow.
 *
 * The interim trust model for online combat: the ACTOR's machine rolls (the
 * interactive modal — missiles, per-round retreats — cannot ride a one-shot
 * server roll yet), and the server applies the claimed result only after
 * forcing it through these bounds, derived from ITS OWN board:
 *
 *   · losses cannot exceed the troops actually present
 *   · a capture REQUIRES every defender dead — `captured: true` with
 *     survivors is the flag most worth forging, and it is simply recomputed
 *   · the advance cannot exceed the attacker's survivors minus the one troop
 *     that must stay behind, and entry costs cannot be negative
 *
 * A forged result can still shade dice luck; it can no longer conjure a
 * capture, teleport troops, or send a negative cost. Full dice authority is
 * DECLARE_ATTACK's job, when the combat UI learns to ride it.
 */
export function clampCombatResolution(
  state: Pick<GameState, 'territories'>,
  a: {
    srcId: string; tgtId: string
    totalAtkLoss: number; totalDefLoss: number
    captured: boolean; troopsToAdvance: number
    entryCostTotal?: number; defenderCloningBonus?: number
  },
): typeof a {
  const int = (v: unknown, lo: number, hi: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.trunc(v))) : lo
  const src = state.territories[a.srcId]
  const tgt = state.territories[a.tgtId]
  const srcTroops = src?.troops ?? 0
  const tgtTroops = tgt?.troops ?? 0
  // The attacker must keep one troop home, so at most troops-1 can die.
  const totalAtkLoss = int(a.totalAtkLoss, 0, Math.max(0, srcTroops - 1))
  const totalDefLoss = int(a.totalDefLoss, 0, tgtTroops)
  const captured = !!a.captured && totalDefLoss >= tgtTroops && tgtTroops > 0
  const survivors = srcTroops - totalAtkLoss
  return {
    ...a,
    totalAtkLoss,
    totalDefLoss,
    captured,
    troopsToAdvance: captured ? int(a.troopsToAdvance, 1, Math.max(1, survivors - 1)) : 0,
    entryCostTotal: int(a.entryCostTotal, 0, 12),
    defenderCloningBonus: int(a.defenderCloningBonus, 0, 12),
  }
}

/**
 * Apply a decided combat result to the board.
 *
 * Shared by both combat paths so they can never disagree about what a capture
 * does: `RESOLVE_COMBAT` (hotseat — the client rolled) and `DECLARE_ATTACK`
 * (server — the server rolled). Only where the dice came from differs.
 */
function applyCombatOutcome(
  state: GameState,
  action: {
    srcId: string
    tgtId: string
    totalAtkLoss: number
    totalDefLoss: number
    captured: boolean
    troopsToAdvance: number
    entryCostTotal: number
    entryCostFalloutHalf: boolean
    defenderCloningBonus: number
  },
): ReducerResult {
  const only = (s: GameState): ReducerResult => ({ state: s, effects: [] })
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
        // Same rule as an uncontested advance: the entry cost comes out of the
        // arriving stack in full. The old `Math.max(1, moving - cost)` refunded
        // it whenever the mover could not quite afford it — 2 troops into a
        // major city paid 1, and 1 troop paid nothing.
        const survivors = troopsAfterEntry(moving, {
          total: action.entryCostTotal,
          parts: [],
          falloutHalf: action.entryCostFalloutHalf,
        })
        // A captured territory cannot hold 0, so this floor has to exist — but
        // reaching it means the amount to advance was chosen without checking
        // affordability (AttackModal clamps it), so say so loudly instead of
        // quietly discounting the city.
        if (survivors < 1) {
          console.warn(
            `[Combat] ${moving} troops cannot pay the ${action.entryCostTotal}-troop entry at ${action.tgtId}` +
            ' — capping at 1 survivor; the entry cost was not fully paid.',
          )
        }
        tgt.troops = Math.max(1, survivors)
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
          effects.push({ kind: 'players-eliminated', playerIds: eliminatedIds, byPlayerId: attackerId, capturedCardIds: capturedCards })
        }
      }

      return { state: { ...state, territories, players }, effects }
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

/** One named defender die modifier, e.g. `{ label: 'Bear Trap', lowest: -1 }`. */
export interface DefenderDiePart { label?: string; highest?: number; lowest?: number }

/**
 * How much a single modifier source shifts a lone defender die.
 *
 * With one die there is no distinct "highest" and "lowest" — it is both. So a
 * source that names only the lowest (Bear Trap) DOES apply to it, and a source
 * naming both (Fortification, Armored Command) applies once rather than twice.
 */
export function singleDieDelta(part: DefenderDiePart): number {
  const { highest, lowest } = part
  if (highest !== undefined && highest !== 0) return highest
  return lowest ?? 0
}

/** Net single-die modifier across every named source. */
export function singleDieBonus(parts: DefenderDiePart[] | undefined): number {
  return (parts ?? []).reduce((sum, p) => sum + singleDieDelta(p), 0)
}

/** A die is only ever 1–6, however the modifiers stack. */
const clampDie = (v: number) => Math.max(1, Math.min(6, v))

/**
 * Apply the summed defender die modifiers to a descending-sorted roll.
 * The highest and lowest dice are shifted by their totals, then clamped ONCE —
 * clamping between sources would discard a bonus at the 1/6 rails and let an
 * opposing penalty through unopposed.
 */
export function applyDefenderDieBonus(
  dice: number[],
  bonus: { highest: number; lowest: number },
  single?: number,
): number[] {
  if (dice.length === 0) return dice
  const out = [...dice]
  if (out.length === 1) {
    // A lone die is both the highest and the lowest, so every source applies to
    // it — but one naming both (Fortification) applies just once.
    out[0] = clampDie(out[0] + (single ?? bonus.highest))
  } else {
    out[0] = clampDie(out[0] + bonus.highest)
    out[out.length - 1] = clampDie(out[out.length - 1] + bonus.lowest)
  }
  return out
}

/**
 * The same modifiers as `applyDefenderDieBonus`, revealed one named source at a
 * time for the attack animation — one dice snapshot per part, in order.
 *
 * Deltas accumulate unclamped and are clamped only for display, so the last
 * snapshot is exactly what `applyDefenderDieBonus` returns for the summed
 * modifiers. The manual attack path resolves combat on these dice, so a
 * mismatch here is a wrong battle result, not a cosmetic glitch.
 */
export function defenderDieSteps(rawDef: number[], parts: DefenderDiePart[]): number[][] {
  const delta = rawDef.map(() => 0)
  const snapshots: number[][] = []
  for (const part of parts) {
    if (rawDef.length === 0) break
    if (rawDef.length === 1) {
      delta[0] += singleDieDelta(part)
    } else {
      delta[0] += part.highest ?? 0
      delta[delta.length - 1] += part.lowest ?? 0
    }
    snapshots.push(rawDef.map((d, i) => clampDie(d + delta[i])))
  }
  return snapshots
}

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
  /**
   * Net modifier when the defender rolls exactly ONE die — that die is both
   * their highest and their lowest, so every source applies to it, but a source
   * naming both (Fortification, Armored Command) still applies only once.
   * Cannot be derived from `defenderDieBonus`, which is a lossy sum; build it
   * with `singleDieBonus(parts)`. Falls back to `highest` when absent.
   */
  defenderDieBonusSingle?: number
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
    let rawDef = rollN(rng, numDef).sort((a, b) => b - a)
    if (hasDoubles(rawDef)) defDoublesRounds++
    if (mods.defenderDieBonus) {
      rawDef = applyDefenderDieBonus(rawDef, mods.defenderDieBonus, mods.defenderDieBonusSingle)
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
