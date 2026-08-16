/**
 * gameReducer â€” the pure, headless rules engine for Risk Legacy.
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
 * (this step â€” the pure dice engine, extracted from AttackModal). Attack/fortify
 * reducer actions and the GameState expansion they need are being layered on
 * next, one verified stage at a time.
 */

import { initialTurnState, type ActiveCombat, type GameState, type ServerCardPiles, type PendingEventChoice } from '@/types/game'
import type { Territory } from '@/types/territory'
import { applyCustomSeaLines, applyHqReserveTroops, continentsHeldInFull, injectAlienIslandTerritory, legalJoinWarTerritoryIds, troopsAfterEntry } from '@/lib/gameLogic'

// â”€â”€â”€ Injected randomness â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** All non-determinism the reducer may need, injected so transitions stay pure
 *  and reproducible (and can later be seeded/verified server-side). */
export interface Rng {
  /** Float in [0, 1). */
  next(): number
  /** Integer in [minInclusive, maxInclusive]. */
  int(minInclusive: number, maxInclusive: number): number
  /** Fisherâ€“Yates shuffle â€” returns a NEW array, never mutates the input. */
  shuffle<T>(arr: readonly T[]): T[]
}

/** Default RNG backed by Math.random â€” preserves current client behaviour.
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
 * Deterministic seeded RNG (mulberry32). Same seed â†’ same sequence, on any
 * runtime. This is what the SERVER uses: it seeds each action's resolution
 * (e.g. `seed = hash(matchId, actionSeq)`), runs the reducer, and the outcome is
 * reproducible and auditable â€” no trust in the client's dice. Portable to Deno /
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

// â”€â”€â”€ Actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  /**
   * Finish placing reinforcements and advance to the attack phase.
   *
   * `playerId` is the player the SENDER believes is taking the turn. It is
   * optional for hotseat, and load-bearing online: it turns a phase advance
   * planned against a stale board into a no-op instead of tearing through
   * whoever's turn it actually is. See `wrongActor`.
   */
  | { type: 'END_REINFORCE_PHASE'; playerId?: string }
  /** Finish attacking and advance to the fortify phase. See `wrongActor`. */
  | { type: 'END_ATTACK_PHASE'; playerId?: string }
  /** Attacker breaks off the current attack. No GameState effect today (the
   *  in-combat selection is UI-only); kept in the vocabulary for the eventual
   *  server, which will care that the attacker stopped. */
  | { type: 'RETREAT' }
  /**
   * A combat round's dice are final â€” hold them open for spectator missiles.
   *
   * Dispatched by the ACTOR's machine after every modifier and battle-side
   * missile has been applied, before losses are computed. The dice are
   * client-rolled (interim trust model, like RESOLVE_COMBAT) and clamped by
   * the server; what the window buys is a place where a spectator's missile
   * can land under SERVER arbitration instead of anyone's say-so.
   */
  | { type: 'OPEN_COMBAT_WINDOW'; roundKey: string; srcId: string; tgtId: string; atkDice: number[]; defDice: number[]; expiresAt?: number }
  /**
   * A spectator spends one missile to turn ONE die of the open round into an
   * unmodified 6.
   *
   * Server-only in practice: the edge function refuses it unless the window is
   * open, the die is unclaimed (first click wins â€” a loser is refused, so the
   * missile is never charged), the caller is a participant who is NOT a side
   * in the battle, and the caller actually has a missile left (campaign count
   * minus this game's `missileSpends` ledger). `playerId` is overwritten with
   * the caller's own seat during sanitize â€” a client cannot spend someone
   * else's missile.
   */
  | { type: 'SPECTATOR_MISSILE'; roundKey: string; side: 'atk' | 'def'; dieIndex: number; playerId: string; expiresAt?: number }
  /** A missile spent OUTSIDE a battle window — discarded to power a missile
   *  power (EMP and the rest). Same pile as every other missile this match. */
  | { type: 'SPEND_MISSILE'; playerId: string }
  /** An event choice is waiting on a player the board picked — probably not
   *  the one whose turn it is. `pending: null` clears it once they answer. */
  | { type: 'SET_PENDING_EVENT'; pending: PendingEventChoice | null }
  /** The actor resumes the battle â€” the window closes, late missiles refuse. */
  | { type: 'CLOSE_COMBAT_WINDOW'; roundKey: string }
  /**
   * Take one card into the current player's hand from a SERVER-OWNED pile.
   *
   * `face-up`: the card must be on the sideboard; spot 1 refills from the
   * territory deck's head. `coin`: the card must be in the resource pile.
   * Runs only when `state.cards` exists (online matches) â€” in hotseat the
   * component's cardState owns the piles and this action refuses, so the two
   * owners can never both apply a draw. Which cards a player may LEGALLY pick
   * (face-up-you-control-first, Purist cap, homelands) is judged by the
   * client's `cardDrawBlockReason` against legacy state the reducer cannot
   * read â€” the reducer enforces the structural half: a card can only be drawn
   * once, because it leaves the pile atomically under the server's version
   * guard.
   */
  | { type: 'DRAW_CARD'; playerId: string; cardId: string; source: 'face-up' | 'coin' }
  /**
   * Trade cards from the current player's hand: coins return to the resource
   * pile, territory cards go to the discard. The troop bonus is NOT modelled
   * here â€” it arrives as ordinary PLACE_REINFORCEMENTs, exactly as in hotseat.
   */
  | { type: 'TRADE_IN_CARDS'; playerId: string; cardIds: string[] }
  /**
   * Board troop changes decided by an EVENT CARD (Join the Cause, Control the
   * People troops, the fortify event, Resistance, Riot, the fallout event,
   * Beam Down). The targets and amounts are event rules judged client-side
   * against card/legacy state the reducer cannot read â€” same interim trust as
   * RESOLVE_COMBAT â€” but the server clamps each delta, floors troops at zero
   * (a vacated territory loses its owner), and only lets `occupyingPlayerId`
   * be set on land that is genuinely empty. Before this action, every one of
   * these effects existed only on the machine that resolved the event.
   */
  | { type: 'APPLY_EVENT_TROOPS'; note: string; changes: Array<{ territoryId: string; delta: number; occupyingPlayerId?: string }> }
  /**
   * Mobile HQ: move the player's HQ token to an adjacent owned territory.
   * Adjacency is client-judged (sea lines live in legacy); the reducer
   * enforces the structural half â€” mover owns both ends, no second HQ there.
   */
  | { type: 'MOVE_HQ'; playerId: string; fromId: string; toId: string }
  /**
   * An eliminated player re-enters through Join the War: un-eliminated, four
   * troops on a legal empty territory. Legality comes from the same
   * `legalJoinWarTerritoryIds` the offer was built from.
   */
  | { type: 'JOIN_WAR'; playerId: string; territoryId: string }
  /** The eliminated player declines to rejoin â€” recorded so they are never
   *  offered again (an echo restoring "undecided" would re-open the modal). */
  | { type: 'FORFEIT_WAR'; playerId: string }
  /**
   * The game is over. Wins are detected on the machine that saw the condition
   * (stars and missions read legacy state), and used to be a bare local write
   * â€” the other machines never learned the game had ended. The reducer only
   * records a winner that exists and is alive.
   */
  | { type: 'END_GAME'; winnerId: string; condition: 'mission' | 'elimination' | 'stars' }
  /**
   * END-OF-GAME CEREMONY â€” progress flags every machine renders from.
   * REWARDS_DONE: this player's legacy rewards are recorded (winner steps, or
   * a runner-up's minor city + card upgrade). CONTINUE: their table decision
   * once all rewards are in. Both are once-per-player and refuse to run
   * without the endGame session END_GAME seeds.
   */
  | { type: 'ENDGAME_REWARDS_DONE'; playerId: string }
  | { type: 'ENDGAME_CONTINUE'; playerId: string; choice: 'continue' | 'quit' }
  /**
   * MAP SURGERY â€” permanent board changes that used to be bare local writes.
   * Each is structural: the reducer applies exactly the shape the campaign
   * rules allow, judged against its own board. The legacy-side record
   * (stickers, history, destroyed-city registry) stays with the resolving
   * client as before â€” these own only what lives in GameState.
   */
  /** Island Empire reward: a two-way sea adjacency between two territories. */
  | { type: 'PLACE_SEA_LINE'; a: string; b: string }
  /** Alien milestone: Alien Island appears as a real territory, connected to
   *  the two chosen endpoints. Idempotent â€” a second inject changes nothing. */
  | { type: 'INJECT_ALIEN_ISLAND'; island: { x: number; y: number; connectedTerritoryIds: [string, string] } }
  /** Die Humans ruin / the nuclear Fallout Zone: everything on the territory
   *  is gone â€” troops, owner, cities, any HQ (and its activeHqs entry).
   *  `clearScars` is the nuclear variant. */
  | { type: 'OBLITERATE_TERRITORY'; territoryId: string; clearScars?: boolean; /** Faction the blast does not touch — the Mutants in a Fallout Zone. */ sparePlayerId?: string }
  /** World Capital burying covered cities / a Riot demolishing an HQ city:
   *  the named cities are marked destroyed; `demolishHq` clears the HQ field. */
  | { type: 'DESTROY_CITIES'; territoryId: string; cityIds: string[]; demolishHq?: boolean }
  /** A scar card lands on the board. One scar per territory â€” the second is
   *  refused here exactly as the placement UI refuses it. */
  | { type: 'PLACE_SCAR'; territoryId: string; scarType: string }
  /**
   * Retro-fit the server-owned card piles into a match that predates them.
   *
   * A match row created before the card migration has no `state.cards`, so
   * every DRAW_CARD / TRADE_IN_CARDS no-ops against it and hands silently die
   * on echoes again. The host's machine dispatches this once when it adopts
   * such a match, seeding the piles and hands from its own card state.
   * Applies ONLY while `state.cards` is absent â€” on a seeded match it is a
   * no-op, so a duplicate (echo, two eager machines racing) changes nothing:
   * the first seed through the version guard wins.
   */
  | { type: 'SEED_CARD_PILES'; cards: ServerCardPiles; hands: Record<string, string[]> }
  /**
   * INTERACTIVE ONLINE COMBAT â€” a battle between two humans becomes shared
   * state so the defender participates and everyone else can watch.
   *
   * COMBAT_OFFER opens the session (attacker's machine, on the battle modal).
   * COMBAT_PROPOSE_AUTO asks to auto-resolve; COMBAT_DEFENSE_CHOICE is the
   * defender's answer â€” auto only happens when BOTH said yes, either side
   * preferring dice forces a manual battle. POST_COMBAT_DICE carries one
   * side's RAW roll for the current round (the attacker posts theirs without
   * waiting); COMBAT_NEXT_ROUND clears the slots for the next roll.
   * RESOLVE_COMBAT / RETREAT / END_TURN all close the session.
   */
  | { type: 'COMBAT_OFFER'; key: string; srcId: string; tgtId: string; attackerId: string; defenderId: string; defDiceMax: number; emp?: boolean }
  /** EMP activated mid-battle: every die modifier is dead for this territory.
   *  Remote replays drop their modifier stacks the moment this lands. */
  | { type: 'COMBAT_SET_EMP'; key: string }
  | { type: 'COMBAT_PROPOSE_AUTO'; key: string }
  | { type: 'COMBAT_DEFENSE_CHOICE'; key: string; accept: boolean }
  | { type: 'POST_COMBAT_DICE'; key: string; round: number; side: 'atk' | 'def'; dice: number[]; by?: 'defender' | 'attacker-idle' | 'ai' }
  /** Battle-side missile conversions this round â€” dice forced to unmodifiable
   *  6s during the missile phase, posted so every screen replays them. */
  | { type: 'POST_COMBAT_MISSILES'; key: string; round: number; flips: Array<{ side: 'atk' | 'def'; dieIndex: number }> }
  | { type: 'COMBAT_NEXT_ROUND'; key: string; round: number }
  | { type: 'CLEAR_COMBAT' }
  /**
   * Move troops between two owned territories during fortify. `troopsRemoved`
   * leaves the source; `troopsArriving` reaches the destination (they differ
   * only when the Fallout Zone halves the arrivals â€” the caller precomputes it).
   */
  | { type: 'CONFIRM_FORTIFY'; srcId: string; dstId: string; troopsRemoved: number; troopsArriving: number }
  /**
   * End the current player's turn: commit the end-of-turn board (scar effects
   * already folded into `endTerritories` by the caller via
   * `applyEndOfTurnScarEffects`), advance to the next non-skipped player, reset
   * to the reinforce phase, and bump the turn number on a new round.
   *
   * `hqReservePlayerIds` names the players whose chosen faction ability is
   * Khan's Strategic Reserve (+1 troop on each controlled HQ at the start of
   * their turn). The ability lives in legacy state the reducer cannot read, so
   * it arrives as an input â€” supplied by the caller in hotseat and RECOMPUTED
   * from the campaign row on the server, like `endTerritories` itself. The
   * reserve is applied HERE, to the incoming player, because this is the one
   * place the turn actually changes hands: when the client pre-folded it into
   * `endTerritories`, the server's recompute silently stripped it every
   * turn-end of every online match.
   */
  | { type: 'END_TURN'; endTerritories: Record<string, Territory>; hqReservePlayerIds?: string[]; playerId?: string }
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
      /** Most dice thrown in one roll of this battle. A capture commits at
       *  least that many troops — three dice, three troops. */
      atkDiceUsed?: number
      /** Entry cost deducted from arriving troops when capturing an unoccupied
       *  city / World Capital (0 otherwise). Reads legacy â†’ precomputed. */
      entryCostTotal: number
      /** Fallout Zone halves the arriving troops after the entry cost. */
      entryCostFalloutHalf: boolean
      /** Extra defender troops from Mutant Unstable Cloning on a repelled attack (0 if N/A). */
      defenderCloningBonus: number
      /**
       * Walking into an UNOCCUPIED territory â€” no dice, no defender, losses 0.
       * Same board mutation as a capture (occupy, advance, entry costs), but
       * deliberately NO `territory-captured` effect: expanding into empty land
       * earns no card, and this flag is what keeps that rule when the move
       * travels through the reducer instead of a local board write.
       */
      uncontested?: boolean
      /**
       * The attack crossed a sea line. The client computes this because
       * campaign-placed sea lines (Island Empire) live in legacy state the
       * reducer cannot read; it only feeds mission bookkeeping
       * (`turn.conqueredViaSeaIds`), so a forged flag buys no board change.
       */
      viaSea?: boolean
      /**
       * The dice as the actor's machine rolled them, round by round. PURELY
       * for spectators: other clients receive this action live and animate the
       * same battle the attacker saw. The reducer never reads it â€” the board
       * change comes from the totals above â€” so a forged round log can lie
       * only to the audience, never to the game. Bounded by
       * `clampCombatResolution` so the log cannot be used as a payload dump.
       */
      rounds?: CombatRoundLog[]
      /**
       * Die Mechaniker Iron Shield: the defender rolled double 6s, sealing the
       * territory against further attack this turn. Feeds
       * `turn.shieldedTerritoryIds`, which used to be a local setTurn patch
       * the next echo un-sealed.
       */
      sealDefender?: boolean
    }
  /**
   * Declare an attack and let the RESOLVER roll it. The server-authoritative
   * counterpart to `RESOLVE_COMBAT`.
   *
   * `RESOLVE_COMBAT` takes the losses and the capture flag as inputs, because
   * in hotseat the client has already rolled. That makes it useless for server
   * authority â€” a server running it applies whatever result the caller claims,
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

// â”€â”€â”€ Effects â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
// The reducer owns only GameState. Consequences that touch LegacyState
// (Supabase: history log, red stars, comeback powers, scarDeckâ€¦), card decks,
// sounds, or React modals cannot live in a pure `=> GameState` reducer. So the
// reducer EMITS effects â€” descriptors of "what happened" that it can DECIDE from
// GameState â€” and the component (which has legacy/deck/modal access) interprets
// them. In the server model the server runs the reducer, applies effects to the
// persistent stores, and broadcasts them to clients.

export type Effect =
  /** A territory changed hands. Drives the victory sound + first-capture card award. */
  | { kind: 'territory-captured'; territoryId: string; fromPlayerId: string | null; byPlayerId: string; firstCaptureThisTurn: boolean }
  /** A spectator's missile landed: one die of the open round is now a 6.
   *  Drives the die flip on every screen â€” the actor's modal included. */
  | { kind: 'spectator-missile'; roundKey: string; playerId: string; side: 'atk' | 'def'; dieIndex: number; srcId: string; tgtId: string }
  /** A card left a server-owned pile for a hand. Remote clients mirror their
   *  display cardState from the new GameState when this arrives. */
  | { kind: 'card-drawn'; playerId: string; cardId: string; source: 'face-up' | 'coin'; newSpot1Id: string | null }
  /** Cards left a hand in a trade-in (coins back to the pile, territory cards
   *  to the discard). Same mirror trigger as card-drawn. */
  | { kind: 'cards-traded'; playerId: string; cardIds: string[] }
  /** Khan's Strategic Reserve landed at the turn hand-off. Drives the notice. */
  | { kind: 'hq-reserve'; playerId: string; territoryIds: string[] }
  /** Board troops changed by an event card. Drives the notice on remote screens. */
  | { kind: 'event-troops'; note: string; changes: Array<{ territoryId: string; delta: number }> }
  /** An eliminated player re-entered through Join the War. */
  | { kind: 'joined-war'; playerId: string; territoryId: string }
  /** The game ended. Every machine shows the same winner. */
  | { kind: 'game-ended'; winnerId: string; condition: 'mission' | 'elimination' | 'stars' }
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
       *  component sees this â€” the Forced Occupation private mission needs to
       *  know whether any was worth 3+ resources. */
      capturedCardIds: string[]
    }
  /**
   * The resolver rolled a battle. Carries every round so a client can animate
   * the dice the SERVER rolled instead of inventing its own â€” without this the
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

// â”€â”€â”€ Pure validation helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    return { ok: false, reason: 'â˜¢ Only the Mutants can draft troops into the Fallout Zone' }
  }

  // Cautious weakness power: recruited troops go into at most 2 distinct territories
  if (rules.isCautiousWeakness) {
    const placedInto = new Set(rules.placementHistory)
    if (!placedInto.has(territoryId) && placedInto.size >= 2) {
      return { ok: false, reason: 'âš  Cautious â€” you can only place recruited troops into 2 territories' }
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
 *  troop. (Which destinations are reachable â€” Saharan connected/disconnected
 *  rules, Short-Sighted weakness â€” is a separate reachability check.) */
export function canStartFortify(state: GameState, srcId: string, playerId: string): boolean {
  const src = state.territories[srcId]
  if (!src) return false
  return src.occupyingPlayerId === playerId && src.troops > 1
}

/**
 * Should this eliminated player's turn be passed over entirely?
 *
 * Two cases: they already used or forfeited their Join the War option, or they
 * are still undecided but there is nowhere legal to re-enter â€” in which case
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
 * End-of-turn scar effects for the ENDING player's territories. Biological âˆ’1
 * (Mercenary +1); the Mutants have both reversed. A territory sitting at 1 troop
 * that takes a loss is vacated (troops 0, owner null) â€” but never the player's
 * LAST territory. The Fallout Zone gives Mutants +1 there, others âˆ’1. Pure:
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
      // Never vacate the player's LAST territory â€” would soft-lock them
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
      // troop, is driven off entirely â€” the ground itself finishes the job.
      // Goes through applyLoss so it behaves exactly like a Bio-hazard scar,
      // including the guard that never takes a player's LAST territory (that
      // would eliminate them by attrition with no way to respond).
      if (endingIsMutant) result[falloutZoneId] = { ...fzT, troops: fzT.troops + 1 }
      else applyLoss(falloutZoneId, fzT)
    }
  }

  return { territories: result, vacatedNames }
}

// â”€â”€â”€ Reducer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Apply an action to the game state, returning a new state. Pure and total:
 * unknown or inapplicable actions return the state unchanged.
 *
 * @param rng injected randomness (unused by draft actions; reserved so the
 *            signature is stable as later phases are added)
 */
/**
 * True when an action names an actor who is NOT the current player.
 *
 * Phase advances used to be anonymous, so whichever turn was live when one
 * arrived is the turn it advanced. That is fine until a machine's view of the
 * board lags: its AI driver plans "end the computer's reinforce phase", the
 * board moves on to a HUMAN, and the anonymous action lands on the human's
 * turn instead — reinforce, attack and fortify all torn through in a couple of
 * seconds with nothing placed. Naming the intended actor turns a stale plan
 * into a no-op here and a refusal at the edge (which already rejects an action
 * whose playerId is not the current player), instead of a skipped turn.
 *
 * Absent playerId stays permitted: hotseat and older clients send none.
 */
function wrongActor(state: GameState, playerId?: string): boolean {
  return !!playerId && state.players[state.currentPlayerIndex]?.id !== playerId
}

export function gameReducer(state: GameState, action: Action, rng: Rng): ReducerResult {
  /** Wrap a next-state that produced no effects. */
  const only = (s: GameState): ReducerResult => ({ state: s, effects: [] })
  switch (action.type) {
    case 'PLACE_REINFORCEMENT': {
      const t = state.territories[action.territoryId]
      if (!t) return only(state)
      const placed = state.turn?.placedThisTurn ?? {}
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
        // On the record: this is what bounds UNDO_PLACEMENT below.
        turn: { ...state.turn, placedThisTurn: { ...placed, [action.territoryId]: (placed[action.territoryId] ?? 0) + 1 } },
      })
    }

    case 'UNDO_PLACEMENT': {
      const t = state.territories[action.territoryId]
      if (!t) return only(state)
      // An undo must match a placement THIS turn, judged from the reducer's
      // own record — not from whatever a client believes. A confused machine
      // once fired ten undos at a territory that had received four troops,
      // draining it to zero after the turn had already ended; the per-turn
      // record (reset at END_TURN with the rest of TurnState) refuses both
      // the over-undo and the after-the-turn undo outright.
      const placed = state.turn?.placedThisTurn ?? {}
      const onRecord = placed[action.territoryId] ?? 0
      if (state.phase !== 'reinforce' || onRecord <= 0 || t.troops <= 1) return only(state)
      return only({
        ...state,
        territories: {
          ...state.territories,
          [action.territoryId]: { ...t, troops: t.troops - 1 },
        },
        turn: { ...state.turn, placedThisTurn: { ...placed, [action.territoryId]: onRecord - 1 } },
      })
    }

    case 'END_REINFORCE_PHASE': {
      if (state.phase !== 'reinforce') return only(state)
      if (wrongActor(state, action.playerId)) return only(state)
      return only({ ...state, phase: 'attack' })
    }

    case 'END_ATTACK_PHASE': {
      if (state.phase !== 'attack') return only(state)
      if (wrongActor(state, action.playerId)) return only(state)
      return only({ ...state, phase: 'fortify' })
    }

    case 'DECLARE_ATTACK': {
      // The SERVER-AUTHORITATIVE attack. The client declares only its INTENT â€”
      // which territory, which target, how many troops advance on a capture â€”
      // and the dice are rolled here, through the injected Rng.
      //
      // `RESOLVE_COMBAT` below cannot do this: it takes the losses and the
      // capture flag as INPUTS, because in hotseat the client already rolled.
      // Running that action on a server grants no dice authority at all â€” it
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
      // The attacker stops. The only shared state a retreat touches is an
      // open interactive-combat session, which closes with the battle.
      if (state.combat) return only({ ...state, combat: null })
      return only(state)

    case 'OPEN_COMBAT_WINDOW': {
      // Hold this round's dice still. Replaces any stale window outright â€” a
      // window only ever belongs to the newest roll.
      const die = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
        ? Math.max(1, Math.min(6, Math.trunc(v))) : 1
      // Who outranks whom on a contested die, settled once when the window
      // opens so every screen resolves the same way. The battle names the two
      // principals; the board names them when there is no session (hotseat).
      const atkId = state.combat?.attackerId
        ?? state.territories[action.srcId]?.occupyingPlayerId ?? ''
      const defId = state.combat?.defenderId
        ?? state.territories[action.tgtId]?.occupyingPlayerId ?? ''
      return only({
        ...state,
        combatWindow: {
          roundKey: String(action.roundKey).slice(0, 80),
          srcId: action.srcId,
          tgtId: action.tgtId,
          atkDice: (Array.isArray(action.atkDice) ? action.atkDice : []).slice(0, 3).map(die),
          defDice: (Array.isArray(action.defDice) ? action.defDice : []).slice(0, 3).map(die),
          flips: [],
          claims: [],
          expiresAt: typeof action.expiresAt === 'number' ? action.expiresAt : undefined,
          priority: missilePriority(state.players, atkId, defId),
        },
      })
    }

    case 'SPECTATOR_MISSILE': {
      // Legality is judged by `spectatorMissileRefusal` â€” the edge function
      // refuses BEFORE applying, so a refused missile is never charged and
      // never logged. The reducer still re-checks the structural parts and
      // no-ops rather than corrupt the window if something slips through.
      const w = state.combatWindow
      if (!w || w.roundKey !== action.roundKey) return only(state)
      const dice = action.side === 'atk' ? w.atkDice : w.defDice
      if (action.dieIndex < 0 || action.dieIndex >= dice.length) return only(state)
      // One missile per die per PLAYER. Somebody else already claiming it is
      // not a refusal — both claims stand, and priority decides which one is
      // charged when the window closes.
      const claims = w.claims ?? []
      if (claims.some(c => c.side === action.side && c.dieIndex === action.dieIndex
        && c.playerId === action.playerId)) return only(state)
      const nextClaims = [...claims, {
        playerId: action.playerId, side: action.side, dieIndex: action.dieIndex,
      }]
      // The die reads 6 whoever wins it, so the dice settle on the first claim
      // and never change again; only the NAME on the flip can still change.
      const flipped = dice.map((d, i) => (i === action.dieIndex ? 6 : d))
      // A missile is news the other side must be given time to answer, so
      // every accepted claim pushes the deadline out again — bounded, so a
      // client cannot hold a battle open by naming a distant hour.
      const asked = typeof action.expiresAt === 'number' ? action.expiresAt : 0
      const ceiling = (w.expiresAt ?? asked) + MISSILE_WINDOW_MS
      const expiresAt = Math.max(w.expiresAt ?? 0, Math.min(asked, ceiling))
      return {
        state: {
          ...state,
          combatWindow: {
            ...w,
            atkDice: action.side === 'atk' ? flipped : w.atkDice,
            defDice: action.side === 'def' ? flipped : w.defDice,
            claims: nextClaims,
            flips: resolveMissileClaims(nextClaims, w.priority),
            expiresAt: expiresAt || undefined,
          },
        },
        effects: [{
          kind: 'spectator-missile', roundKey: w.roundKey, playerId: action.playerId,
          side: action.side, dieIndex: action.dieIndex, srcId: w.srcId, tgtId: w.tgtId,
        }],
      }
    }

    case 'SET_PENDING_EVENT': {
      // Who is owed a choice, so their machine can offer it and every other
      // machine can stay out of the way. Cleared with null when they answer.
      const p = action.pending
      if (!p) return only({ ...state, pendingEvent: null })
      const kinds = ['join-cause', 'control-people', 'die-humans', 'fortify-event', 'comeback-power', 'missile-power', 'mutants-evolve']
      if (!kinds.includes(p.kind)) return only(state)
      if (!state.players.some(pl => pl.id === p.playerId)) return only(state)
      return only({
        ...state,
        pendingEvent: { kind: p.kind, playerId: p.playerId, ...(p.cardId ? { cardId: p.cardId } : {}) },
      })
    }

    case 'SPEND_MISSILE': {
      // Missile powers discard a missile to fire. That discard used to come
      // straight out of the campaign blob while battle missiles came out of
      // the match ledger — two piles for one stock, so the board could offer a
      // missile that another pile had already spent. One pile now; the ledger
      // folds into the campaign when the game ends, exactly as before.
      if (!state.players.some(p => p.id === action.playerId)) return only(state)
      return only({
        ...state,
        missileSpends: {
          ...(state.missileSpends ?? {}),
          [action.playerId]: ((state.missileSpends ?? {})[action.playerId] ?? 0) + 1,
        },
      })
    }

    case 'CLOSE_COMBAT_WINDOW': {
      // Key-checked so a late CLOSE from a previous round cannot slam a window
      // that a newer roll just opened.
      const w = state.combatWindow
      if (w && w.roundKey !== action.roundKey) return only(state)
      if (!w) return only({ ...state, combatWindow: null })
      // Charging happens HERE, and only for the claims that actually landed.
      // A missile that lost a contested die was never spent — no refund is
      // needed because nothing was ever taken.
      const spends = { ...(state.missileSpends ?? {}) }
      for (const f of w.flips) spends[f.playerId] = (spends[f.playerId] ?? 0) + 1
      return only({ ...state, combatWindow: null, missileSpends: spends })
    }

    case 'DRAW_CARD': {
      const piles = state.cards
      if (!piles) return only(state)          // hotseat: cardState owns the piles
      const player = state.players.find(p => p.id === action.playerId)
      if (!player) return only(state)

      if (action.source === 'face-up') {
        const at = piles.sideboard.indexOf(action.cardId)
        if (at < 0) return only(state)        // already taken â€” the pile is the truth
        const deck = [...piles.territoryDeck]
        const newSpot1Id = deck.length > 0 ? deck.shift()! : null
        // Taking a card shifts the row toward spot 4; the refill slides into
        // spot 1 â€” the same motion the physical row makes.
        const sideboard = [
          ...(newSpot1Id ? [newSpot1Id] : []),
          ...piles.sideboard.filter(id => id !== action.cardId),
        ]
        return {
          state: {
            ...state,
            cards: { ...piles, territoryDeck: deck, sideboard },
            players: state.players.map(p =>
              p.id === action.playerId ? { ...p, cards: [...p.cards, action.cardId] } : p),
          },
          effects: [{ kind: 'card-drawn', playerId: action.playerId, cardId: action.cardId, source: 'face-up', newSpot1Id }],
        }
      }

      if (!piles.resourceDeck.includes(action.cardId)) return only(state)
      return {
        state: {
          ...state,
          cards: { ...piles, resourceDeck: piles.resourceDeck.filter(id => id !== action.cardId) },
          players: state.players.map(p =>
            p.id === action.playerId ? { ...p, cards: [...p.cards, action.cardId] } : p),
        },
        effects: [{ kind: 'card-drawn', playerId: action.playerId, cardId: action.cardId, source: 'coin', newSpot1Id: null }],
      }
    }

    case 'APPLY_EVENT_TROOPS': {
      // Bounded, structural application of an event's board changes. The
      // event's RULES were judged by the resolving client; what the reducer
      // guarantees is that the changes stay small, troops never go negative,
      // a vacated territory loses its owner, and nobody "beams down" onto
      // land that is already held.
      if (!Array.isArray(action.changes) || action.changes.length === 0) return only(state)
      const territories = { ...state.territories }
      const applied: Array<{ territoryId: string; delta: number }> = []
      // 12 covers the widest legal sweep (Resistance across all nine minor
      // cities) with room to spare, while still refusing a payload dump.
      for (const c of action.changes.slice(0, 12)) {
        const t = territories[c?.territoryId]
        if (!t) continue
        const delta = typeof c.delta === 'number' && Number.isFinite(c.delta)
          ? Math.max(-6, Math.min(6, Math.trunc(c.delta))) : 0
        if (delta === 0) continue
        const troops = Math.max(0, t.troops + delta)
        const settling = typeof c.occupyingPlayerId === 'string'
          && !t.occupyingPlayerId && t.troops === 0 && delta > 0
          && state.players.some(p => p.id === c.occupyingPlayerId)
        territories[c.territoryId] = {
          ...t,
          troops,
          occupyingPlayerId: settling ? c.occupyingPlayerId!
            : troops === 0 ? null
            : t.occupyingPlayerId,
        }
        applied.push({ territoryId: c.territoryId, delta })
      }
      if (applied.length === 0) return only(state)
      return {
        state: { ...state, territories },
        effects: [{ kind: 'event-troops', note: String(action.note ?? '').slice(0, 120), changes: applied }],
      }
    }

    case 'MOVE_HQ': {
      const from = state.territories[action.fromId]
      const to = state.territories[action.toId]
      if (!from || !to) return only(state)
      if (from.activeHqPlayerId !== action.playerId) return only(state)
      if (to.activeHqPlayerId) return only(state)
      if (from.occupyingPlayerId !== action.playerId || to.occupyingPlayerId !== action.playerId) return only(state)
      return only({
        ...state,
        territories: {
          ...state.territories,
          [action.fromId]: { ...from, activeHqPlayerId: undefined },
          [action.toId]: { ...to, activeHqPlayerId: action.playerId },
        },
        activeHqs: { ...state.activeHqs, [action.playerId]: action.toId },
      })
    }

    case 'JOIN_WAR': {
      const player = state.players.find(p => p.id === action.playerId)
      if (!player || !player.isEliminated || player.joinedWarThisGame !== undefined) return only(state)
      const legal = legalJoinWarTerritoryIds(
        state.territories,
        Object.values(state.activeHqs ?? {}),
        state.legacySnapshot?.falloutZoneTerritoryId,
      )
      if (!legal.includes(action.territoryId)) return only(state)
      const t = state.territories[action.territoryId]
      return {
        state: {
          ...state,
          territories: {
            ...state.territories,
            // 3 troops on re-entry â€” the same number the component always used.
            [action.territoryId]: { ...t, occupyingPlayerId: action.playerId, troops: 3 },
          },
          players: state.players.map(p =>
            p.id === action.playerId ? { ...p, isEliminated: false, joinedWarThisGame: true } : p),
          // Rejoining IS the start of their turn.
          phase: 'reinforce',
        },
        effects: [{ kind: 'joined-war', playerId: action.playerId, territoryId: action.territoryId }],
      }
    }

    case 'FORFEIT_WAR': {
      const player = state.players.find(p => p.id === action.playerId)
      if (!player || !player.isEliminated || player.joinedWarThisGame !== undefined) return only(state)
      return only({
        ...state,
        players: state.players.map(p =>
          p.id === action.playerId ? { ...p, joinedWarThisGame: false } : p),
      })
    }

    case 'END_GAME': {
      const winner = state.players.find(p => p.id === action.winnerId)
      if (!winner || winner.isEliminated) return only(state)
      if (state.phase === 'game-over') return only(state)
      return {
        state: {
          ...state,
          phase: 'game-over',
          winnerId: action.winnerId,
          // Seed the shared ceremony: every machine renders the reward
          // progress and the continue gate from this one document.
          endGame: {
            winnerId: action.winnerId,
            condition: action.condition,
            rewardsDone: {},
            continues: {},
          },
        },
        effects: [{ kind: 'game-ended', winnerId: action.winnerId, condition: action.condition }],
      }
    }

    case 'ENDGAME_REWARDS_DONE': {
      const eg = state.endGame
      if (!eg || !state.players.some(p => p.id === action.playerId)) return only(state)
      if (eg.rewardsDone[action.playerId]) return only(state)
      return only({
        ...state,
        endGame: { ...eg, rewardsDone: { ...eg.rewardsDone, [action.playerId]: true } },
      })
    }

    case 'ENDGAME_CONTINUE': {
      const eg = state.endGame
      if (!eg || !state.players.some(p => p.id === action.playerId)) return only(state)
      // A decision is final â€” a second click (or a machine replaying its own
      // echo) must never flip a recorded choice.
      if (eg.continues[action.playerId]) return only(state)
      const choice = action.choice === 'quit' ? 'quit' : 'continue'
      return only({
        ...state,
        endGame: { ...eg, continues: { ...eg.continues, [action.playerId]: choice } },
      })
    }

    case 'PLACE_SEA_LINE': {
      if (action.a === action.b) return only(state)
      if (!state.territories[action.a] || !state.territories[action.b]) return only(state)
      return only({ ...state, territories: applyCustomSeaLines(state.territories, [[action.a, action.b]]) })
    }

    case 'INJECT_ALIEN_ISLAND': {
      const island = action.island
      if (!island || !Number.isFinite(island.x) || !Number.isFinite(island.y)) return only(state)
      const [c1, c2] = island.connectedTerritoryIds ?? []
      if (!state.territories[c1] || !state.territories[c2] || c1 === c2) return only(state)
      // The helper is idempotent â€” a second inject (echo, retry) is a no-op.
      return only({ ...state, territories: injectAlienIslandTerritory(state.territories, island) })
    }

    case 'OBLITERATE_TERRITORY': {
      const t = state.territories[action.territoryId]
      if (!t) return only(state)
      const activeHqs = Object.fromEntries(
        Object.entries(state.activeHqs ?? {}).filter(([, tId]) => tId !== action.territoryId))
      // The Mutants are not harmed by fallout — they are what fallout makes.
      // Their army stands where everything else is swept away; the city, the
      // HQ and the rest of the ground go regardless, because the crater is
      // still a crater.
      const spared = !!action.sparePlayerId && t.occupyingPlayerId === action.sparePlayerId
      return only({
        ...state,
        activeHqs,
        territories: {
          ...state.territories,
          [action.territoryId]: {
            ...t,
            occupyingPlayerId: spared ? t.occupyingPlayerId : null,
            troops: spared ? t.troops : 0,
            cities: [],
            activeHqPlayerId: undefined,
            scars: action.clearScars ? [] : t.scars,
          },
        },
      })
    }

    case 'DESTROY_CITIES': {
      const t = state.territories[action.territoryId]
      if (!t || !Array.isArray(action.cityIds)) return only(state)
      // An empty list is only meaningful when the HQ itself is being demolished.
      if (action.cityIds.length === 0 && !action.demolishHq) return only(state)
      const doomed = new Set(action.cityIds.slice(0, 4).map(String))
      const cities = (t.cities ?? []).map(c =>
        doomed.has(c.id) && !c.isDestroyed
          ? { ...c, isDestroyed: true, destroyedInGame: state.gameNumber }
          : c)
      return only({
        ...state,
        territories: {
          ...state.territories,
          [action.territoryId]: {
            ...t,
            cities,
            activeHqPlayerId: action.demolishHq ? undefined : t.activeHqPlayerId,
          },
        },
      })
    }

    case 'COMBAT_OFFER': {
      // A fresh session, judged against the board: the attacker must own the
      // source, the named defender must hold the target, and both must be
      // real players. A stale session from an abandoned battle is replaced.
      const src = state.territories[action.srcId]
      const tgt = state.territories[action.tgtId]
      if (!src || !tgt) return only(state)
      if (src.occupyingPlayerId !== action.attackerId) return only(state)
      if (tgt.occupyingPlayerId !== action.defenderId) return only(state)
      if (action.attackerId === action.defenderId) return only(state)
      const combat: ActiveCombat = {
        key: String(action.key).slice(0, 80),
        srcId: action.srcId, tgtId: action.tgtId,
        attackerId: action.attackerId, defenderId: action.defenderId,
        defDiceMax: typeof action.defDiceMax === 'number' && Number.isFinite(action.defDiceMax)
          ? Math.max(1, Math.min(3, Math.trunc(action.defDiceMax))) : 2,
        autoProposed: false, defenderAuto: null,
        round: 1, atkDice: null, defDice: null,
        emp: !!action.emp,
      }
      return only({ ...state, combat })
    }

    case 'COMBAT_PROPOSE_AUTO': {
      const c = state.combat
      if (!c || c.key !== action.key) return only(state)
      return only({ ...state, combat: { ...c, autoProposed: true } })
    }

    case 'COMBAT_SET_EMP': {
      const c = state.combat
      if (!c || c.key !== action.key || c.emp) return only(state)
      return only({ ...state, combat: { ...c, emp: true } })
    }

    case 'COMBAT_DEFENSE_CHOICE': {
      const c = state.combat
      if (!c || c.key !== action.key) return only(state)
      if (c.defenderAuto !== null) return only(state)   // one answer per battle
      return only({ ...state, combat: { ...c, defenderAuto: !!action.accept } })
    }

    case 'POST_COMBAT_DICE': {
      const c = state.combat
      if (!c || c.key !== action.key || c.round !== action.round) return only(state)
      if (!Array.isArray(action.dice) || action.dice.length === 0) return only(state)
      const dice = action.dice.slice(0, 3).map(d =>
        typeof d === 'number' && Number.isFinite(d) ? Math.max(1, Math.min(6, Math.trunc(d))) : 1)
      if (action.side === 'atk') {
        if (c.atkDice) return only(state)               // this round's roll stands
        return only({ ...state, combat: { ...c, atkDice: dice } })
      }
      if (c.defDice) return only(state)
      return only({
        ...state,
        combat: {
          ...c, defDice: dice,
          defDiceBy: action.by === 'attacker-idle' ? 'attacker-idle'
            : action.by === 'ai' ? 'ai'
            : 'defender',
        },
      })
    }

    case 'POST_COMBAT_MISSILES': {
      const c = state.combat
      if (!c || c.key !== action.key || c.round !== action.round) return only(state)
      // Missiles convert dice that exist: both rolls must be on the table,
      // and each flip must point at a real die on its side. Posted once.
      if (!c.atkDice || !c.defDice || c.missileFlips) return only(state)
      if (!Array.isArray(action.flips) || action.flips.length === 0) return only(state)
      const seen = new Set<string>()
      const flips = action.flips.slice(0, 5).filter(f => {
        if (!f || (f.side !== 'atk' && f.side !== 'def')) return false
        const len = f.side === 'atk' ? c.atkDice!.length : c.defDice!.length
        if (!Number.isInteger(f.dieIndex) || f.dieIndex < 0 || f.dieIndex >= len) return false
        const id = `${f.side}${f.dieIndex}`
        if (seen.has(id)) return false
        seen.add(id)
        return true
      }).map(f => ({ side: f.side, dieIndex: f.dieIndex }))
      if (flips.length === 0) return only(state)
      return only({ ...state, combat: { ...c, missileFlips: flips } })
    }

    case 'COMBAT_NEXT_ROUND': {
      const c = state.combat
      if (!c || c.key !== action.key || c.round !== action.round) return only(state)
      return only({
        ...state,
        combat: { ...c, round: c.round + 1, atkDice: null, defDice: null, defDiceBy: undefined, missileFlips: undefined },
      })
    }

    case 'CLEAR_COMBAT':
      if (!state.combat) return only(state)
      return only({ ...state, combat: null })

    case 'SEED_CARD_PILES': {
      // Only a match that PREDATES the card piles may be seeded â€” on any other
      // board this is a no-op, which is what makes racing seeds harmless.
      if (state.cards) return only(state)
      const c = action.cards
      if (!c || !Array.isArray(c.territoryDeck) || !Array.isArray(c.sideboard)
          || !Array.isArray(c.resourceDeck) || !Array.isArray(c.territoryDiscard)) return only(state)
      const clean = (a: unknown[]) => a.slice(0, 60).map(String)
      const hands = action.hands ?? {}
      return only({
        ...state,
        cards: {
          territoryDeck: clean(c.territoryDeck),
          sideboard: clean(c.sideboard),
          resourceDeck: clean(c.resourceDeck),
          territoryDiscard: clean(c.territoryDiscard),
        },
        players: state.players.map(p =>
          Array.isArray(hands[p.id]) ? { ...p, cards: clean(hands[p.id]) } : p),
      })
    }

    case 'PLACE_SCAR': {
      const t = state.territories[action.territoryId]
      if (!t) return only(state)
      // One scar per territory â€” same rule the placement UI enforces.
      if ((t.scars?.length ?? 0) > 0) return only(state)
      const scarType = String(action.scarType).slice(0, 40)
      return only({
        ...state,
        territories: {
          ...state.territories,
          [action.territoryId]: {
            ...t,
            scars: [...t.scars, { type: scarType, appliedInGame: state.gameNumber } as Territory['scars'][number]],
          },
        },
      })
    }

    case 'TRADE_IN_CARDS': {
      const piles = state.cards
      if (!piles) return only(state)          // hotseat: cardState owns the piles
      const player = state.players.find(p => p.id === action.playerId)
      if (!player) return only(state)
      const ids = [...new Set(action.cardIds)]
      if (ids.length === 0 || !ids.every(id => player.cards.includes(id))) return only(state)
      // Coins go back into the pile (it can empty more than once per game);
      // territory cards are spent for good. Coin ids all share the
      // 'resource-' prefix (including the Alien Island's
      // 'resource-alien-island'), which spares the reducer a card-data import.
      const coins = ids.filter(id => id.startsWith('resource-'))
      const territory = ids.filter(id => !coins.includes(id))
      return {
        state: {
          ...state,
          cards: {
            ...piles,
            resourceDeck: [...piles.resourceDeck, ...coins],
            territoryDiscard: [...piles.territoryDiscard, ...territory],
          },
          players: state.players.map(p =>
            p.id === action.playerId ? { ...p, cards: p.cards.filter(id => !ids.includes(id)) } : p),
        },
        effects: [{ kind: 'cards-traded', playerId: action.playerId, cardIds: ids }],
      }
    }

    case 'CONFIRM_FORTIFY': {
      const src = state.territories[action.srcId]
      const dst = state.territories[action.dstId]
      if (!src || !dst) return only(state)
      // A fortify that would strip the source below 1 troop (or "move"
      // negative troops) is refused outright â€” same negative-troop corruption
      // class as the unclamped advance above.
      if (action.troopsRemoved < 0 || action.troopsArriving < 0
          || src.troops - action.troopsRemoved < 1) return only(state)
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
      // final map â€” an end-of-turn scar can vacate a territory and open one up.
      //
      // `endTerritories` is computed by the CALLER. On the server that caller is
      // the client, so the server recomputes it instead of trusting the payload
      // â€” see `endTurnTerritories` below.
      // A turn is ended by the player TAKING it. A stale END_TURN naming the
      // previous player would otherwise end the next one's turn as well —
      // which is exactly what a lagging machine's AI driver used to send.
      if (wrongActor(state, action.playerId)) return only(state)
      const withEnd: GameState = {
        ...state,
        territories: { ...state.territories, ...action.endTerritories },
      }
      const { nextIdx, isNewRound } = computeTurnAdvance(withEnd)
      const nextPlayerId = withEnd.players[nextIdx]?.id ?? ''
      // Khan's Strategic Reserve for the INCOMING player: +1 troop on each HQ
      // they control, applied at the one true hand-off so it lands exactly
      // once â€” on the server too, which used to strip it with the recompute.
      const reserve = (action.hqReservePlayerIds ?? []).includes(nextPlayerId)
        ? applyHqReserveTroops(withEnd.territories, nextPlayerId, 'khan-hq-troops')
        : { territories: withEnd.territories, grantedTerritoryIds: [] }
      return {
        state: {
          ...withEnd,
          territories: reserve.territories,
          phase: 'reinforce',
          currentPlayerIndex: nextIdx,
          turnNumber: isNewRound ? state.turnNumber + 1 : state.turnNumber,
          // A fresh turn for the incoming player. Without this the SERVER's
          // copy of `turn` was never reset (or set at all) â€” it served the
          // initial board's zeroes forever, and every echo overwrote the
          // client's own tracking with them mid-turn.
          turn: {
            ...initialTurnState(),
            // Wide Border is judged at the start of a turn: snapshot the
            // incoming player's whole-continent count off the end-of-turn board.
            continentsAtTurnStart: continentsHeldInFull(
              nextPlayerId, reserve.territories,
            ).length,
          },
          // Neither a missile window nor a battle session outlives the turn.
          combatWindow: null,
          combat: null,
        },
        effects: reserve.grantedTerritoryIds.length > 0
          ? [{ kind: 'hq-reserve', playerId: nextPlayerId, territoryIds: reserve.grantedTerritoryIds }]
          : [],
      }
    }

    default:
      return only(state)
  }
}

// â”€â”€â”€ Server-authority guards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
// Three of the reducer's actions were designed for a trusted caller and carry
// values the caller computed. That is fine in hotseat â€” the caller IS the
// player's own machine â€” but on a server each one is a hole:
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
 * the modifiers â€” it can only refuse impossible ones. That bounds the damage a
 * forged stack can do (no 9-dice defenders, no unbounded die bonuses) without
 * pretending to full authority over the modifier layer. The raw submission is
 * logged verbatim so a mismatch is auditable after the fact.
 */
export function clampCombatModifiers(m: Partial<CombatModifiers> | null | undefined): CombatModifiers {
  const clamp = (v: unknown, lo: number, hi: number, dflt = 0) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.trunc(v))) : dflt
  const override = m?.attackerMaxDiceOverride
  return {
    // Never MORE than the standard 3 attacker dice â€” only ever a restriction.
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
 * interactive modal â€” missiles, per-round retreats â€” cannot ride a one-shot
 * server roll yet), and the server applies the claimed result only after
 * forcing it through these bounds, derived from ITS OWN board:
 *
 *   Â· losses cannot exceed the troops actually present
 *   Â· a capture REQUIRES every defender dead â€” `captured: true` with
 *     survivors is the flag most worth forging, and it is simply recomputed
 *   Â· the advance cannot exceed the attacker's survivors minus the one troop
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
    uncontested?: boolean; viaSea?: boolean; sealDefender?: boolean
    rounds?: CombatRoundLog[]
    /** Most dice thrown in one roll of this battle — the advance floor. */
    atkDiceUsed?: number
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
  // Two legal ways to take a territory, judged against the SERVER's board:
  //   conquest  â€” every defender present died in the claimed fighting
  //   expansion â€” the territory is genuinely empty (no troops, no owner);
  //               claiming "uncontested" against a defended territory is the
  //               same forgery as claiming a capture without the kills
  const uncontested = !!a.uncontested
  const captured = uncontested
    ? !!a.captured && !!tgt && tgtTroops === 0 && !tgt.occupyingPlayerId
    : !!a.captured && totalDefLoss >= tgtTroops && tgtTroops > 0
  // A defender who was NOT captured keeps at least one troop. "All defenders
  // dead" without a capture is an inconsistent claim — a full kill forces the
  // advance — and applying it minted ghost territories: zero troops, still
  // owned, HQ marker standing (a stale-snapshot AI attack did exactly this).
  // Repair conservatively: spare the last defender rather than invent an
  // ownership change the attacker never (validly) claimed.
  const boundedDefLoss = !uncontested && !captured
    ? Math.min(totalDefLoss, Math.max(0, tgtTroops - 1))
    : totalDefLoss
  const survivors = srcTroops - totalAtkLoss
  // The spectator round log never touches the board â€” it exists so other
  // clients can watch the battle â€” but it is still untrusted JSON headed for
  // the action log and every subscriber. Bound it hard: at most 40 rounds of
  // at most 3 dice each, every die 1â€“6, or nothing at all. Walking into empty
  // land rolled no dice, so `uncontested` carries no log.
  const rounds = !uncontested && Array.isArray(a.rounds)
    ? a.rounds.slice(0, 40).flatMap(r => {
        const dice = (v: unknown) => Array.isArray(v) ? v.slice(0, 3).map(d => int(d, 1, 6)) : []
        const atkDice = dice((r as CombatRoundLog | null)?.atkDice)
        const defDice = dice((r as CombatRoundLog | null)?.defDice)
        if (atkDice.length === 0 || defDice.length === 0) return []
        return [{ atkDice, defDice, aLoss: int((r as CombatRoundLog).aLoss, 0, 99), dLoss: int((r as CombatRoundLog).dLoss, 0, 99) }]
      })
    : undefined
  return {
    ...a,
    totalAtkLoss: uncontested ? 0 : totalAtkLoss,
    totalDefLoss: uncontested ? 0 : boundedDefLoss,
    captured,
    uncontested,
    // A capture moves at least one troop in — unless the source cannot spare
    // one, and then it moves none. Forcing the minimum to 1 in THAT case
    // emptied the source instead, leaving an owned 0-troop ghost behind; the
    // reducer reads 0 as "the ground was cleared but not taken".
    // …and at least as many as it attacked WITH: three dice thrown means
    // three troops committed to the ground they take. The computer was
    // walking into captured territory one troop at a time, which is not a
    // choice the rules offer anybody. Bounded by what survived, so a costly
    // win still moves everything it has left.
    troopsToAdvance: captured
      ? (survivors - 1 >= 1
          ? Math.min(
              survivors - 1,
              Math.max(int(a.troopsToAdvance, 1, survivors - 1), int(a.atkDiceUsed, 1, 3)),
            )
          : 0)
      : 0,
    entryCostTotal: int(a.entryCostTotal, 0, 12),
    defenderCloningBonus: int(a.defenderCloningBonus, 0, 12),
    // Mission bookkeeping only, but untrusted input still gets a type: any
    // JSON value collapses to a plain boolean here.
    viaSea: !!a.viaSea,
    sealDefender: !!a.sealDefender,
    rounds,
  }
}

/**
 * Why a SPECTATOR_MISSILE must be refused, or null when it may apply.
 *
 * One source of truth, used by the edge function BEFORE it charges a missile â€”
 * a refused spend never happened, which is what makes "first click wins, the
 * loser is refunded" true by construction. The codes reach the losing
 * spectator so their screen can say which race they lost.
 */
/** How long the missile window holds, and how far one missile pushes it out. */
export const MISSILE_WINDOW_MS = 7_000

/**
 * Who wins a die two people reached for.
 *
 * Attacker first, then the defender, then everyone else in turn order starting
 * after the attacker. Reflexes decide nothing: the same two claims resolve the
 * same way whichever arrived first, and the loser's missile is never charged
 * (only winning claims are folded into the ledger when the window closes).
 *
 * Contested dice are the only thing this decides. Two missiles on DIFFERENT
 * dice both go through — there is nothing to arbitrate.
 */
export function missilePriority(
  players: Array<{ id: string }>,
  attackerId: string,
  defenderId: string,
): Record<string, number> {
  const rank: Record<string, number> = { [attackerId]: 0, [defenderId]: 1 }
  const start = players.findIndex(p => p.id === attackerId)
  let next = 2
  for (let i = 1; i <= players.length; i++) {
    const p = players[(Math.max(0, start) + i) % players.length]
    if (!p || p.id === attackerId || p.id === defenderId) continue
    if (rank[p.id] === undefined) rank[p.id] = next++
  }
  return rank
}

/** The claim that actually lands on each die: lowest rank, arrival breaking ties. */
export function resolveMissileClaims(
  claims: Array<{ playerId: string; side: 'atk' | 'def'; dieIndex: number }>,
  priority: Record<string, number> | undefined,
): Array<{ playerId: string; side: 'atk' | 'def'; dieIndex: number }> {
  const best = new Map<string, { claim: typeof claims[number]; rank: number; at: number }>()
  claims.forEach((c, at) => {
    const key = `${c.side}${c.dieIndex}`
    // An unranked claimant sorts after everyone ranked, never ahead of them.
    const rank = priority?.[c.playerId] ?? Number.MAX_SAFE_INTEGER
    const cur = best.get(key)
    if (!cur || rank < cur.rank) best.set(key, { claim: c, rank, at })
  })
  return [...best.values()].sort((a, b) => a.at - b.at).map(x => x.claim)
}

/** Missiles this player has committed AND pledged in the open window. */
export function missilesCommittedBy(
  state: Pick<GameState, 'combatWindow' | 'missileSpends'>,
  playerId: string,
): number {
  const ledger = (state.missileSpends ?? {})[playerId] ?? 0
  const pending = (state.combatWindow?.claims ?? []).filter(c => c.playerId === playerId).length
  return ledger + pending
}

export function spectatorMissileRefusal(
  state: Pick<GameState, 'combatWindow' | 'missileSpends'>,
  action: { roundKey: string; side: 'atk' | 'def'; dieIndex: number },
  spenderId: string,
  opts: {
    /** The spender's missile count from the CAMPAIGN blob (pre-ledger). */
    legacyMissiles: number
    /**
     * Unused now. The attacker was once refused here, because the attacker's
     * missiles were spent in a separate phase on the attacker's own screen -
     * which is also how the attacker came to be spending the DEFENDER's
     * missiles for them. There is one window now and everyone fires into it.
     */
    isAttacker?: boolean
  },
): 'window-closed' | 'bad-die' | 'die-taken' | 'no-missiles' | null {
  const w = state.combatWindow
  if (!w || w.roundKey !== action.roundKey) return 'window-closed'
  const dice = action.side === 'atk' ? w.atkDice : w.defDice
  if (!Number.isInteger(action.dieIndex) || action.dieIndex < 0 || action.dieIndex >= dice.length) return 'bad-die'
  // Losing a contested die is no longer a refusal: it is settled by priority
  // when the window closes, and a losing claim is never charged. What IS
  // refused is claiming the same die twice — one missile per die per player.
  if ((w.claims ?? []).some(c => c.side === action.side && c.dieIndex === action.dieIndex
    && c.playerId === spenderId)) return 'die-taken'
  if (opts.legacyMissiles - missilesCommittedBy(state, spenderId) < 1) return 'no-missiles'
  return null
}

/**
 * Apply a decided combat result to the board.
 *
 * Shared by both combat paths so they can never disagree about what a capture
 * does: `RESOLVE_COMBAT` (hotseat â€” the client rolled) and `DECLARE_ATTACK`
 * (server â€” the server rolled). Only where the dice came from differs.
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
    uncontested?: boolean
    viaSea?: boolean
    sealDefender?: boolean
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

      // One troop always stays home, so this is what the source can send. At
      // zero the attacker cannot occupy what it just cleared: `Math.max(1, …)`
      // used to force a single troop out anyway, emptying the source while
      // leaving its owner in place — the 0-troop territories found sitting on
      // the live board (three of one player's holdings at once).
      const spare = src.troops - 1
      const occupies = action.captured && spare >= 1

      if (occupies) {
        // Never move more than the source can spare — one troop must stay.
        // This floor exists because a caller CAN get it wrong: the live "-7
        // troops in Ontario" board came from an AI advance planned against a
        // stale snapshot, applied unclamped. The server clamps its callers;
        // the reducer now refuses to go negative for ANY caller, hotseat
        // included.
        const moving = Math.min(Math.max(1, action.troopsToAdvance), spare)
        // Capturer takes the territory. Any enemy HQ token stays on it
        // (activeHqPlayerId is preserved via the {...tgt0} spread), so the
        // capturer now controls that HQ â€” matching current behaviour.
        tgt.occupyingPlayerId = src.occupyingPlayerId
        // Same rule as an uncontested advance: the entry cost comes out of the
        // arriving stack in full. The old `Math.max(1, moving - cost)` refunded
        // it whenever the mover could not quite afford it â€” 2 troops into a
        // major city paid 1, and 1 troop paid nothing.
        const survivors = troopsAfterEntry(moving, {
          total: action.entryCostTotal,
          parts: [],
          falloutHalf: action.entryCostFalloutHalf,
        })
        // A captured territory cannot hold 0, so this floor has to exist â€” but
        // reaching it means the amount to advance was chosen without checking
        // affordability (AttackModal clamps it), so say so loudly instead of
        // quietly discounting the city.
        if (survivors < 1) {
          console.warn(
            `[Combat] ${moving} troops cannot pay the ${action.entryCostTotal}-troop entry at ${action.tgtId}` +
            ' â€” capping at 1 survivor; the entry cost was not fully paid.',
          )
        }
        tgt.troops = Math.max(1, survivors)
        src.troops -= moving
      } else {
        tgt.troops -= action.totalDefLoss
        // Mutant Unstable Cloning: defender regains troops on natural doubles
        tgt.troops += action.defenderCloningBonus
        // A capture the attacker cannot occupy (nothing to spare): the ground
        // is held by a last defender rather than becoming an unowned crater or
        // an owned ghost. Same rule as the clamp's "an uncaptured defender
        // keeps a last troop", applied to the one case the clamp cannot see.
        if (action.captured && tgt.troops < 1) tgt.troops = 1
      }

      const territories = { ...state.territories, [action.srcId]: src, [action.tgtId]: tgt }
      let players = state.players
      const effects: Effect[] = []

      if (occupies) {
        // HQ log first (matches previous ordering), then victory/card award.
        if (preHqPlayerId && preHqPlayerId !== defenderId) {
          effects.push({ kind: 'hq-captured', territoryId: action.tgtId, territoryName: tgt0.name, hqPlayerId: preHqPlayerId, byPlayerId: attackerId })
        }
        // An UNCONTESTED expansion is the same board mutation but not a
        // conquest: no card is earned walking into empty land, so the effect
        // that awards one is deliberately not emitted.
        if (!action.uncontested) {
          effects.push({ kind: 'territory-captured', territoryId: action.tgtId, fromPlayerId: defenderId, byPlayerId: attackerId, firstCaptureThisTurn: !state.turn.captured })
        }

        // Elimination: any non-eliminated player who now holds 0 territories is
        // out. Mark them, wipe their hand, and transfer their cards to the
        // capturer â€” the GameState mutation that used to live in a setTimeout.
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

      // â”€â”€ Per-turn combat tracking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // This must live HERE, not in the component. The component used to patch
      // it via setTurn after dispatching â€” fine in hotseat, but online every
      // server echo replaces the whole GameState, and a server that never
      // tracked captures wiped the patches within a round-trip. The visible
      // damage: `firstCaptureThisTurn` above read an eternally-false
      // `turn.captured`, so EVERY capture awarded a card (the AI drained the
      // whole resource deck and claimed the depletion star), and Balkania's
      // 4th-capture count could never pass 1.
      const t0 = state.turn
      let turn = t0
      if (action.uncontested) {
        // `occupies`, not `captured`: an advance that could not spare a troop
        // took nothing, so it counts toward nothing.
        if (occupies) {
          turn = {
            ...t0,
            // Uncontested advances count toward Balkania's Imperial Expansion.
            captureCount: t0.captureCount + 1,
            // Resourceful comeback power: the turn's expansion landed on a city.
            expandedIntoCity: t0.expandedIntoCity
              || (tgt0.cities ?? []).some(c => !c.isDestroyed),
          }
        }
      } else {
        turn = {
          ...t0,
          // Blocks bunker/ammo-shortage scar placement on a fought-over territory.
          attackedTerritoryIds: t0.attackedTerritoryIds.includes(action.tgtId)
            ? t0.attackedTerritoryIds
            : [...t0.attackedTerritoryIds, action.tgtId],
          // Bear Trap locks onto the first territory attacked this turn.
          bearTrapTerritoryId: t0.bearTrapTerritoryId ?? action.tgtId,
          // Iron Shield: a defending double-6 seals the territory this turn.
          shieldedTerritoryIds: action.sealDefender && !t0.shieldedTerritoryIds.includes(action.tgtId)
            ? [...t0.shieldedTerritoryIds, action.tgtId]
            : t0.shieldedTerritoryIds,
          ...(occupies ? {
            captured: true,
            captureCount: t0.captureCount + 1,
            conqueredIds: [...t0.conqueredIds, action.tgtId],
            conqueredViaSeaIds: action.viaSea
              ? [...t0.conqueredViaSeaIds, action.tgtId]
              : t0.conqueredViaSeaIds,
          } : {}),
        }
      }

      // The battle has resolved â€” its session and any missile window are over.
      return { state: { ...state, territories, players, turn, combatWindow: null, combat: null }, effects }
}

// â”€â”€â”€ Combat engine (pure) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
 * With one die there is no distinct "highest" and "lowest" â€” it is both. So a
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

/** A die is only ever 1â€“6, however the modifiers stack. */
const clampDie = (v: number) => Math.max(1, Math.min(6, v))

/**
 * Apply the summed defender die modifiers to a descending-sorted roll.
 * The highest and lowest dice are shifted by their totals, then clamped ONCE â€”
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
    // it â€” but one naming both (Fortification) applies just once.
    out[0] = clampDie(out[0] + (single ?? bonus.highest))
  } else {
    out[0] = clampDie(out[0] + bonus.highest)
    out[out.length - 1] = clampDie(out[out.length - 1] + bonus.lowest)
  }
  return out
}

/**
 * The same modifiers as `applyDefenderDieBonus`, revealed one named source at a
 * time for the attack animation â€” one dice snapshot per part, in order.
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
  /** Three-of-a-kind attack + â‰¥1 kill wipes all defenders (Berserker Rage). */
  tripleKillEnabled: boolean
  /** Add to defender's highest / lowest die (Bunker, Fortification; negative = Ammo Shortage). */
  defenderDieBonus?: { highest: number; lowest: number }
  /**
   * Net modifier when the defender rolls exactly ONE die â€” that die is both
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

/** One round of a client-rolled battle, as carried on RESOLVE_COMBAT for
 *  spectators (`rounds` above). The final dice after every modifier â€” what the
 *  attacker's screen showed â€” not the raw roll. */
export interface CombatRoundLog {
  atkDice: number[]
  defDice: number[]
  aLoss: number
  dLoss: number
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

/** Roll one die 1â€“6, re-rolling 1's if required, via the injected Rng. */
function rollDie(rng: Rng, rerollOnes = false): number {
  let v = rng.int(1, 6)
  while (rerollOnes && v === 1) v = rng.int(1, 6)
  return v
}

/** Roll n dice (descending), via the injected Rng. */
function rollN(rng: Rng, n: number, rerollOnes = false): number[] {
  return Array.from({ length: n }, () => rollDie(rng, rerollOnes)).sort((a, b) => b - a)
}

/** True when 2+ dice share a value (natural doubles â€” Mutant Unstable Cloning). */
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

    // Berserker Rage: three-of-a-kind + â‰¥1 kill wipes all defenders
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
