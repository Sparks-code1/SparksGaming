/**
 * The loop: nine phases, ten turns, and who may push the match along.
 *
 * WHY THIS EXISTS. The deal writes `phase: 'Storm'` and until now nothing ever
 * moved it. Four phases have server actions — the blow, charity, bidding, and
 * the setup that precedes them all — and each opens when something calls it,
 * which in a real match nothing did: the match screen's own header admitted
 * "nothing here opens a phase". So a dealt game sat at Storm forever, playing
 * whatever window the dev harness had seeded into it.
 *
 * THE SHAPE. One server action, ADVANCE_PHASE, moves the match one phase at a
 * time. Entering a phase performs that phase's own work in the same write:
 *
 *   Storm            — resolves itself: a seeded roll, the sweep, the dead.
 *   Spice Blow       — turns the cards; pauses for the Fremen the way it
 *                      already does, deadline and all.
 *   CHOAM Charity    — opens the claim window, which shuts on its own clock.
 *   Bidding          — draws the lot and opens the auction, which runs on the
 *                      bid clock until it settles.
 *   Revival          — the Tanks pay out: see lib/dune/revival and the
 *                      REVIVE action. The phase itself holds nothing — reviving
 *                      is optional — so the look-window is its clock.
 *   Shipment and Movement, Battles — NOT BUILT YET, and honest about it: they
 *                      enter, hold a short window so the table sees where the
 *                      turn is, and advance. Placeholders, not rules.
 *   Spice Collection — pays the documented city income (advanced game); the
 *                      board-spice half of the phase is not built and is
 *                      SAID to be not built rather than guessed at.
 *   Mentat Pause     — checks victory, and ends the game on turn ten.
 *
 * WHO PRESSES. The host, ahead of the clock; anyone, once the phase's window
 * has shut. That is the charity rule — "anyone may ask; the deadline decides" —
 * with one asymmetry on top: a host can move the table along early, because
 * somebody has to be able to, and six people all able to is the standoff the
 * host exists to break. What the host can NOT do is cut short a pause a rule
 * gives to a player: a blow waiting on the Fremen inside its window, an
 * auction mid-bid, an open charity window. Those hold everybody, host included,
 * and each already has its own after-the-deadline push that any seat may fire.
 */
import type {
  GamePhase, GameMode, Force, DunePlayerPublic, SectorId, ShieldWall,
} from '@/types/Dune/Game'
import type { FactionId } from '@/types/Dune/Faction'
import { DUNE_PHASES } from '@/types/Dune/Game'
import {
  resolveStorm, stormRollRange, FIRST_STORM_ROLL, firstPlayerAfterStorm, seatsFromPositions,
} from './storm'
import type { StormOutcome } from './storm'
import { strongholdsHeld } from './hud'
import { bankDead } from './revival'
import type { Tanks } from './revival'
import { factionById } from '@/data/dune/factions'
import { DUNE_TERRITORIES } from '@/data/dune/boardData'

/** A game is ten turns, and the tenth's Mentat Pause is the end of it. */
export const TURN_LIMIT = 10

/** Strongholds that win the game, checked at every Mentat Pause. */
export const WIN_STRONGHOLDS = 3
/** An ALLIANCE needs four between the two of them, each counted once. */
export const ALLIANCE_WIN_STRONGHOLDS = 4
/** The ready-up minute a winnerless pause gives the table. */
export const MENTAT_READY_SECONDS = 60

/**
 * How long a phase with nothing else to wait for stays put.
 *
 * Long enough for the table to see where the turn is and say something about
 * it, short enough that nine of them do not make a turn a chore. Before it
 * shuts only the host may advance; after it, anyone — so a host who walks away
 * delays the table by seconds, not forever.
 */
export const PHASE_SECONDS = 30

/** Stamped on every phase entry. Which (turn, phase) it belongs to is in it
 *  because a clock outliving its phase must read as expired, not as fresh. */
export interface PhaseClock { turn: number; phase: GamePhase; closesAt: number }

/**
 * The slice of DuneGameState the loop reads. A structural type rather than the
 * full DuneGameState because the endpoint hands this module a jsonb blob it
 * has only partly parsed.
 */
export interface AdvanceState {
  phase: GamePhase
  turn: number
  tanks?: Tanks
  mode: GameMode
  storm: SectorId
  shieldWall: ShieldWall
  forces: Force[]
  players: DunePlayerPublic[]
  spiceOnBoard?: Record<string, number>
  setup?: { closesAt?: number }
  winner?: unknown
  stormMoved?: number
  spiceBlow?: { closesAt?: number }
  shipping?: { closesAt: number }
  spiceDeck?: { turn?: number }
  charity?: { expiresAt: number; turn: number }
  auction?: { status?: string; closesAt?: number } | null
  battles?: {
    closesAt: number
    current?: {
      closesAt: number
      revealed?: {
        traitor: { closesAt: number }
        allocate?: { closesAt: number }
      }
      voice?: { closesAt: number; done: boolean }
      prescience?: { closesAt: number; done: boolean }
    } | null
    capture?: { closesAt: number }
  }
  wormRide?: { closesAt: number }
  /** The pause's ready-up window: everyone ready, or the minute runs out. */
  mentat?: { closesAt: number; ready?: string[] }
  /** The Nexus's window: cleared by the last ready, outlived by the clock. */
  nexus?: { closesAt: number; ready?: string[] }
  phaseClock?: PhaseClock
}

/** The phase after this one — and whether stepping there ends the turn. */
export function phaseAfter(phase: GamePhase): { phase: GamePhase; newTurn: boolean } {
  const i = DUNE_PHASES.indexOf(phase)
  if (i < 0) throw new Error(`no such phase: ${String(phase)}`)
  const last = i === DUNE_PHASES.length - 1
  return { phase: DUNE_PHASES[last ? 0 : i + 1], newTurn: last }
}

/**
 * What stops the match leaving its current phase, or null when nothing does.
 *
 * These hold EVERYBODY, the host included: each is a pause the rules gave to a
 * player, with its own deadline and its own after-the-deadline push (SPICE_BLOW
 * by anyone, PLACE_WORMS declining for the silent, CLOSE-by-advance for
 * charity, BID passing for the expired). Advancing over one would play a
 * player's decision for them ahead of the clock that protects it.
 *
 * `until` is when the hold clears on its own, where a clock exists. A hold
 * without one clears only by its answer arriving.
 */
export interface AdvanceHold {
  code: 'setup-not-finished' | 'game-over' | 'blow-not-turned'
    | 'worms-pending' | 'charity-open' | 'auction-running' | 'shipping-underway'
    | 'battles-underway' | 'worm-ride' | 'mentat-pause' | 'nexus-open'
  until?: number
}

export function advanceHold(state: AdvanceState, now: number): AdvanceHold | null {
  // Setup is not a phase, but it parks the match at Storm until it closes.
  // WITH ITS DEADLINE, because past it the hold is answerable: the server
  // closes an expired window on any setup answer at all, so `until` is when
  // "push the game along" becomes a button somebody can be offered.
  if (state.setup) return { code: 'setup-not-finished', until: state.setup.closesAt }
  if (state.winner) return { code: 'game-over' }

  if (state.phase === 'Spice Blow and Nexus') {
    // Half-done first: a pause outranks "not started", because while the carry
    // is parked the deck must not be dealt from.
    if (state.spiceBlow) return { code: 'worms-pending', until: state.spiceBlow.closesAt }
    // The blow is stamped with the turn it was last turned for; anything else
    // means this turn's cards have not been dealt with.
    if (state.spiceDeck?.turn !== state.turn) return { code: 'blow-not-turned' }
    // THE RIDE HOLDS LIKE CHARITY: inside its window it is the Fremen's
    // moment; past it, the advance clears what was not ridden.
    if (state.wormRide && now < state.wormRide.closesAt) {
      return { code: 'worm-ride', until: state.wormRide.closesAt }
    }
    // THE NEXUS HOLDS the phase for its five minutes. The write that adds
    // the LAST ready deletes the field, so its very presence means the
    // table is still talking; past the clock the advance clears the rest.
    if (state.nexus && now < state.nexus.closesAt) {
      return { code: 'nexus-open', until: state.nexus.closesAt }
    }
    return null
  }

  if (state.phase === 'CHOAM Charity') {
    const w = state.charity
    // An expired window is NOT a hold — the advance that leaves clears it, the
    // way CLOSE_CHARITY would have.
    if (w && w.turn === state.turn && now < w.expiresAt) {
      return { code: 'charity-open', until: w.expiresAt }
    }
    return null
  }

  if (state.phase === 'Shipment and Movement') {
    // The rotation holds until the last seat has shipped and moved — or
    // passed, or run out its clock. Each seat's expiry has its own push
    // (PASS_TURN by anyone), the same rule as every other pause.
    if (state.shipping) return { code: 'shipping-underway', until: state.shipping.closesAt }
    return null
  }

  if (state.phase === 'Battles') {
    // The battles object clears itself when the last battle resolves, so its
    // presence IS the hold. `until` is whichever window is live: the traitor
    // beat, the plan deadline, or the aggressor's pick — each has its own
    // after-the-deadline push through the battle actions.
    if (state.battles) {
      const c = state.battles.current
      return {
        code: 'battles-underway',
        until: c?.revealed?.allocate?.closesAt
          ?? c?.revealed?.traitor.closesAt
          ?? (c?.prescience && !c.prescience.done ? c.prescience.closesAt : undefined)
          ?? (c?.voice && !c.voice.done ? c.voice.closesAt : undefined)
          ?? c?.closesAt ?? state.battles.capture?.closesAt
          ?? state.battles.closesAt,
      }
    }
    return null
  }

  if (state.phase === 'Bidding') {
    // The auction clears itself at settlement (auction: null), so its very
    // presence is the hold. Its deadline moves card by card, and the expired
    // path is BID's: any seat passes for the silent. This hold only says the
    // phase is not over; it never expires on its own here, because a fresh
    // deadline may already be running on the next card.
    if (state.auction && state.auction.status === 'awaiting') {
      return { code: 'auction-running', until: state.auction.closesAt }
    }
    return null
  }

  if (state.phase === 'Mentat Pause' && state.mentat) {
    // A WINNERLESS PAUSE gives the table its minute to think. Everyone
    // ready — or the clock — clears it, and the advance past it is the
    // turn marker moving.
    const everyone = (state.players ?? []).map(p => p.faction)
    const ready = state.mentat.ready ?? []
    if (now < state.mentat.closesAt && !everyone.every(f => ready.includes(f))) {
      return { code: 'mentat-pause', until: state.mentat.closesAt }
    }
    return null
  }

  return null
}

/**
 * Whether the phase's own look-at-it window is still open.
 *
 * The one gate the HOST passes and nobody else does. Distinct from advanceHold
 * on purpose: a hold is a player's pause and stops the host too; this is only
 * the table's chance to see the phase before it moves, and the host is the one
 * seat trusted to decide the table has seen enough.
 */
export function phaseWindowOpen(state: AdvanceState, now: number): boolean {
  const c = state.phaseClock
  return !!c && c.phase === state.phase && c.turn === state.turn && now < c.closesAt
}

// ── Storm ─────────────────────────────────────────────────────────────────────

/**
 * This turn's storm roll.
 *
 * Turn one is the two-dial opening roll — 0 to 20, enough to lap the board —
 * and every later turn is the small roll, whose floor the advanced game drops
 * to 1. The rng comes in from the caller, seeded from the match row, so a turn
 * replays to the same weather.
 */
export function rollStorm(turn: number, mode: GameMode, rng: () => number): number {
  const range = turn <= 1 ? FIRST_STORM_ROLL : stormRollRange(mode)
  return range.min + Math.floor(rng() * (range.max - range.min + 1))
}

/** What the table is told about a storm that has just blown through. All of it
 *  public: the dials are rolled in the open at a table. */
export interface StormReport {
  turn: number
  roll: number
  from: SectorId
  to: SectorId
  swept: SectorId[]
  /** Who lost what, by faction and cell. Empty most turns. */
  killed: Force[]
  spiceCleared: { territoryId: string; amount: number }[]
}

/**
 * Resolve this turn's storm against the board as it stands.
 *
 * NO FAMILY ATOMICS WINDOW, and said out loud: beginStorm exists to offer the
 * card its moment between the roll and the move, but no action can play any
 * treachery card yet, so opening a window nobody can act in would only stall
 * the table. When card play lands, this is the seam it goes into.
 */
export function stormEntry(state: AdvanceState, roll: number): {
  patch: Pick<AdvanceState, 'storm' | 'forces' | 'stormMoved'> & {
    spiceOnBoard: Record<string, number>; stormReport: StormReport; tanks: Tanks
  }
  outcome: StormOutcome
} {
  const outcome = resolveStorm(
    state.storm, roll, state.forces ?? [], state.mode, state.shieldWall,
    state.spiceOnBoard ?? {},
  )
  return {
    outcome,
    patch: {
      storm: outcome.to,
      forces: outcome.forcesAfter,
      spiceOnBoard: outcome.spiceOnBoard,
      // INTO THE TANKS, not into thin air. Revival reads this; a storm that
      // reports its dead without banking them is a storm that cremates.
      tanks: bankDead(state.tanks, outcome.killed),
      stormMoved: state.turn,
      stormReport: {
        turn: state.turn, roll, from: outcome.from, to: outcome.to,
        swept: outcome.swept, killed: outcome.killed, spiceCleared: outcome.spiceCleared,
      },
    },
  }
}

// ── Bidding ───────────────────────────────────────────────────────────────────

/**
 * Everything OPEN_BIDDING needs, computed from the match instead of trusted
 * from a payload.
 *
 * The dev harness computes these in the browser and sends them, which is fine
 * for a harness holding every seat. A real match cannot let one client declare
 * the order and everyone's hand sizes, so the advance computes them here:
 * order is the storm's — the walk from the storm marker, first player first —
 * and the limits come off the faction cards.
 */
/**
 * Every seated faction in acting order: counter-clockwise from the
 * storm-relative first player. Bidding bids in it; shipment ships in it.
 */
export function stormOrder(
  storm: SectorId,
  players: readonly Pick<DunePlayerPublic, 'faction' | 'seat'>[],
): FactionId[] {
  const seats = seatsFromPositions(Object.fromEntries(
    players.map(p => [p.seat, p.faction])))
  const first = firstPlayerAfterStorm(storm, seats)
  if (!first) throw new Error('a turn order with nobody at the table')
  // The walk found the first player; the rest follow in the same direction,
  // which is what rotating the seat-ordered list to start at them yields —
  // seat order is clockwise and the storm runs counter-clockwise, so the list
  // reverses before it rotates.
  const counter = [...seats].reverse()
  const at = counter.findIndex(s => s.faction === first.faction)
  return [...counter.slice(at), ...counter.slice(0, at)].map(s => s.faction)
}

export function biddingOpening(input: {
  storm: SectorId
  players: readonly Pick<DunePlayerPublic, 'faction' | 'seat'>[]
  /** Treachery cards held, by faction, counted by the caller from the rows. */
  cards: Readonly<Record<string, number>>
}): { order: FactionId[]; hands: Record<string, number>; limits: Record<string, number> } {
  const order = stormOrder(input.storm, input.players)
  const hands: Record<string, number> = {}
  const limits: Record<string, number> = {}
  for (const f of order) {
    hands[f] = input.cards[f] ?? 0
    limits[f] = factionById(f)?.handLimit ?? 4
  }
  return { order, hands, limits }
}

// ── Spice Collection ──────────────────────────────────────────────────────────

/**
 * The HARVEST — the basic game's whole half of Spice Collection: forces
 * standing on a blow's marker collect from it.
 *
 * THE RATES ARE THE RULEBOOK'S: 3 spice per force for a faction occupying
 * Arrakeen or Carthag at the time of collection, 2 per force otherwise.
 * COLLECTION IS BY SECTOR — the spice sits on the blow's marker, and every
 * territory's marker has one fixed sector (spiceSector), so only a stack
 * standing IN that sector reaches it; a stack elsewhere in the same
 * territory walks past. A stack can only take what is actually there, and
 * what is not taken STAYS on the board for future turns.
 *
 * ADVISORS COLLECT NOTHING AND GRANT NOTHING: they do not occupy — the same
 * posture rule cityIncome and strongholdsHeld apply — so an advisor on the
 * marker leaves the pile alone, and an advisor in Arrakeen buys nobody the
 * city rate.
 *
 * Should two factions ever share the marker's sector, they collect in STORM
 * ORDER — the game's own precedence — each draining what the last left.
 */
export function spiceHarvest(
  state: Pick<AdvanceState, 'forces' | 'players' | 'storm' | 'spiceOnBoard'>,
): {
  collected: { faction: FactionId; territoryId: string; amount: number }[]
  spiceOnBoard: Record<string, number>
} {
  const board = { ...(state.spiceOnBoard ?? {}) }
  const collected: { faction: FactionId; territoryId: string; amount: number }[] = []
  const occupies = (faction: FactionId, territoryId: string) =>
    (state.forces ?? []).some(f => f.faction === faction
      && f.territoryId === territoryId && f.count > 0 && f.posture !== 'advisor')
  // Arrakeen and Carthag: holding either raises the rate to three.
  const CITY_RATE_HOLDS = ['territory-13', 'territory-26']
  const order = stormOrder(state.storm, state.players)
  for (const t of DUNE_TERRITORIES) {
    let pile = board[t.id] ?? 0
    if (pile <= 0 || !t.spiceSector) continue
    for (const faction of order) {
      if (pile <= 0) break
      const standing = (state.forces ?? [])
        .filter(f => f.faction === faction && f.territoryId === t.id
          && f.sector === t.spiceSector && f.posture !== 'advisor')
        .reduce((n, f) => n + f.count, 0)
      if (standing <= 0) continue
      const rate = CITY_RATE_HOLDS.some(c => occupies(faction, c)) ? 3 : 2
      const take = Math.min(pile, rate * standing)
      pile -= take
      collected.push({ faction, territoryId: t.id, amount: take })
    }
    if (pile > 0) board[t.id] = pile
    else delete board[t.id]
  }
  return { collected, spiceOnBoard: board }
}

/**
 * The city income: Arrakeen 2, Carthag 2, Tuek's Sietch 1, to each occupant.
 *
 * THE DOCUMENTED HALF OF THE PHASE, and only that. docs/dune-advance-rules.md
 * gives the city payouts, the board data carries them per territory
 * (spiceIncome), and "each occupant ... collects" is the wording — so at a
 * territory two factions are still disputing, both collect. Advanced game
 * only: the payout is listed among the advanced changes.
 *
 * Collecting the spice LYING ON THE BOARD — the blow's piles, at so much per
 * force — is NOT here, because the rate is not written anywhere in this repo
 * and a misremembered number would short every purse in the game silently.
 * The phase says so in its report rather than pretending it happened.
 */
export function cityIncome(
  state: Pick<AdvanceState, 'mode' | 'forces'>,
): { faction: FactionId; territoryId: string; amount: number }[] {
  if (state.mode !== 'advanced') return []
  const paid: { faction: FactionId; territoryId: string; amount: number }[] = []
  for (const t of DUNE_TERRITORIES) {
    if (!t.spiceIncome) continue
    const occupants = new Set<FactionId>()
    for (const f of state.forces ?? []) {
      // An advisor does not occupy — the same rule strongholdsHeld applies.
      if (f.territoryId === t.id && f.count > 0 && f.posture !== 'advisor') {
        occupants.add(f.faction)
      }
    }
    for (const faction of occupants) {
      paid.push({ faction, territoryId: t.id, amount: t.spiceIncome })
    }
  }
  return paid
}

// ── Mentat Pause ──────────────────────────────────────────────────────────────

// The three named territories the end-of-game rules read. Ids rather than name
// lookups so a missing territory is a compile-time absence, not a silent null —
// and the test suite checks each id still carries the name this list assumes.
export const SIETCH_TABR = 'territory-40'
export const HABBANYA_SIETCH = 'territory-38'
export const TUEKS_SIETCH = 'territory-33'

export interface Winner {
  factions: FactionId[]
  reason: 'strongholds' | 'prediction' | 'fremen-default' | 'guild-default'
    | 'most-strongholds' | 'most-spice'
  turn: number
}

const occupies = (forces: readonly Force[], faction: FactionId, territoryId: string) =>
  forces.some(f =>
    f.faction === faction && f.territoryId === territoryId && f.count > 0 && f.posture !== 'advisor')

/**
 * Who has won, checked at the Mentat Pause and nowhere else — that is when the
 * rules count strongholds.
 *
 * Three strongholds wins. If the winner is the faction the Bene Gesserit
 * predicted, on the turn they predicted, the win is theirs alone — the
 * prediction is read out of their secrets row by the caller and handed in,
 * never published.
 *
 * On turn ten with nobody at three, the game still ends, and the ordering is
 * the cards': the FREMEN CONDITION IS CHECKED FIRST — Sietch Tabr and
 * Habbanya Sietch each held by the Fremen OR BY NOBODY, and none of the
 * Harkonnen, the Atreides or the Emperor in Tuek's Sietch. "You (or no one)"
 * is the card's own phrase: empty sietches count for the desert. If any part
 * fails, the Spacing Guild's default takes it — their card's "no faction has
 * been able to win" INCLUDES the Fremen's condition failing, which is why the
 * order matters and is fixed. Both texts are in factions.ts under
 * specialVictory, and the suite pins this code to their wording.
 *
 * With no Guild seated, the ruling's chain runs: most strongholds; a tie is
 * broken by MOST SPICE AMONG THE TIED; still tied is a shared victory.
 *
 * THE SPICE TIEBREAK READS A SECRET. Purses live in match_secrets and reach
 * exactly one browser each, so the judging happens here, server-side, from a
 * map the caller reads with the service role — and what leaves is the VERDICT
 * and nothing else. The returned object carries who won and why; no amount,
 * no ordering beyond what the result itself implies. That is the whole
 * contract: a table can learn that the Atreides purse beat the Harkonnen one,
 * because the win says so, and cannot learn either number.
 */
export function mentatVerdict(
  state: Pick<AdvanceState, 'turn' | 'forces' | 'players'>,
  prediction: { faction?: string; turn?: number } | null,
  /** Purses by faction, for the tie among the most-strongholds. Server-read;
   *  never published. Absent, a tie simply shares — a caller without the
   *  secrets (a test, a replay of public state) still gets a lawful verdict. */
  spice?: Readonly<Record<string, number>> | null,
): Winner | null {
  const forces = state.forces ?? []
  const seated = (state.players ?? []).map(p => p.faction)

  // ── THE ALLIANCE THRESHOLD ──────────────────────────────────────────────
  // "The required number of strongholds for that alliance is 4, that the
  // two players in an Alliance can SEPARATELY occupy": an allied player is
  // not judged alone at three — the pair is judged together at four, and a
  // stronghold both allies stand in counts ONCE.
  const allyOf = (f: FactionId) =>
    (state.players ?? []).find(p => p.faction === f)?.ally ?? null
  const solo = seated.filter(f => {
    const a = allyOf(f)
    return !a || !seated.includes(a as FactionId)
  })
  const byStrongholds = solo.filter(f => strongholdsHeld(forces, f) >= WIN_STRONGHOLDS)
  const strongholdIds = DUNE_TERRITORIES.filter(t => t.stronghold).map(t => t.id)
  const pairs = seated.flatMap(f => {
    const a = allyOf(f)
    return a && seated.includes(a as FactionId) && String(f) < String(a)
      ? [[f, a as FactionId] as const] : []
  })
  const byAlliance = pairs.filter(([x, y]) =>
    strongholdIds.filter(t => occupies(forces, x, t) || occupies(forces, y, t))
      .length >= ALLIANCE_WIN_STRONGHOLDS)
  const crown = (factions: FactionId[], reason: Winner['reason']): Winner => {
    // THE PREDICTION OUTRANKS THE BOARD. It applies to however the predicted
    // faction comes to win — a stronghold count or a default — because the
    // card says "wins the game", not "wins by strongholds".
    if (
      prediction?.faction && prediction.turn === state.turn
      && factions.includes(prediction.faction as FactionId)
      && seated.includes('bene-gesserit')
    ) {
      return { factions: ['bene-gesserit'], reason: 'prediction', turn: state.turn }
    }
    return { factions, reason, turn: state.turn }
  }

  if (byStrongholds.length > 0 || byAlliance.length > 0) {
    return crown([...byStrongholds, ...byAlliance.flat()], 'strongholds')
  }
  if (state.turn < TURN_LIMIT) return null

  // ── turn ten, and nobody took three ─────────────────────────────────────
  // "YOU (OR NO ONE)": a sietch counts for the Fremen when they hold it and
  // when nobody does — only a rival's fighters break it. Advisors break
  // nothing; an advisor does not occupy.
  const fremenOrEmpty = (territoryId: string) =>
    !forces.some(f =>
      f.faction !== 'fremen' && f.territoryId === territoryId
      && f.count > 0 && f.posture !== 'advisor')
  if (
    seated.includes('fremen')
    && fremenOrEmpty(SIETCH_TABR)
    && fremenOrEmpty(HABBANYA_SIETCH)
    // THE CARD NAMES THREE, and only three: the Guild in their own home at
    // Tuek's does not break the desert's claim.
    && !(['harkonnen', 'atreides', 'emperor'] as FactionId[])
      .some(rival => occupies(forces, rival, TUEKS_SIETCH))
  ) {
    return crown(['fremen'], 'fremen-default')
  }
  if (seated.includes('spacing-guild')) return crown(['spacing-guild'], 'guild-default')

  // ── THE UNITS OF THE TIE: solo players, and alliances AS PAIRS ──────────
  // Allies who would win together at four tie together at ten: a pair's
  // tally is its SEPARATELY-occupied strongholds, each counted once, and
  // its purse is the two purses combined.
  const units = [
    ...solo.map(f => ({ factions: [f], n: strongholdsHeld(forces, f) })),
    ...pairs.map(([x, y]) => ({
      factions: [x, y],
      n: strongholdIds
        .filter(t => occupies(forces, x, t) || occupies(forces, y, t)).length,
    })),
  ]
  const best = Math.max(0, ...units.map(u => u.n))
  const tied = units.filter(u => u.n === best)
  if (tied.length > 1 && spice) {
    // MOST SPICE AMONG THE TIED — the tied only, a pair counting both
    // purses together. A faction outside the tie with the fullest purse on
    // the planet is not in this question.
    const purseOf = (u: { factions: FactionId[] }) =>
      u.factions.reduce((n, f) => n + (spice[f] ?? 0), 0)
    const richest = Math.max(...tied.map(purseOf))
    const byPurse = tied.filter(u => purseOf(u) === richest)
    // Named as the spice's win ONLY when spice narrowed it: a full tie shares,
    // and calling that 'most-spice' would announce equal purses — a fact about
    // holdings the shared verdict does not otherwise reveal.
    if (byPurse.length < tied.length) {
      return crown(byPurse.flatMap(u => u.factions), 'most-spice')
    }
  }
  return crown(tied.flatMap(u => u.factions), 'most-strongholds')
}

// ── dev scaffolding: re-run an expired window ─────────────────────────────

/**
 * Re-stamp every live deadline in the current state to a fresh, full window.
 *
 * DEV SCAFFOLDING, in the library so it is one shape per window and
 * behaviourally testable: playtesting keeps outliving clocks — a five-minute
 * battle window missed over lunch used to mean replaying a whole match to
 * reach the phase again. The SERVER gates who may call it (the same switch
 * as seeding); this only says what a reset means. Windows get their own full
 * lengths, never a shared guess, so a reset window is indistinguishable from
 * a fresh one.
 *
 * Returns only the keys it touched, and their names — a state with no clock
 * anywhere resets nothing, which the caller reports rather than writing.
 */
export function resetDeadlines(
  state: AdvanceState & {
    setup?: { closesAt?: number }
    charity?: { expiresAt: number; turn: number }
    spiceBlow?: { closesAt?: number }
    auction?: { status?: string; closesAt?: number } | null
    shipping?: { closesAt: number }
    battles?: {
      closesAt: number
      current?: {
        closesAt: number
        revealed?: {
          traitor: { closesAt: number }
          allocate?: { closesAt: number }
        }
      } | null
      capture?: { closesAt: number }
    }
  },
  now: number,
  lengths: {
    setupSeconds: number
    charityMs: number
    wormSeconds: number
    bidSeconds: number
    shipmentSeconds: number
    battlePickSeconds: number
    battlePlanSeconds: number
    battleTraitorSeconds: number
    battleVoiceSeconds: number
    battlePrescienceSeconds: number
    battleAllocateSeconds: number
    battleCaptureSeconds: number
    mentatSeconds: number
    nexusSeconds: number
  },
): { patch: Record<string, unknown>; reset: string[] } {
  const patch: Record<string, unknown> = {}
  const reset: string[] = []

  if (state.setup) {
    patch.setup = { ...state.setup, closesAt: now + lengths.setupSeconds * 1000 }
    reset.push('setup')
  }
  if (state.charity) {
    patch.charity = { ...state.charity, expiresAt: now + lengths.charityMs }
    reset.push('charity')
  }
  if (state.mentat) {
    patch.mentat = { ...state.mentat, closesAt: now + lengths.mentatSeconds * 1000 }
    reset.push('mentat')
  }
  if (state.nexus) {
    patch.nexus = { ...state.nexus, closesAt: now + lengths.nexusSeconds * 1000 }
    reset.push('nexus')
  }
  if (state.spiceBlow) {
    patch.spiceBlow = { ...state.spiceBlow, closesAt: now + lengths.wormSeconds * 1000 }
    reset.push('worm-pause')
  }
  if (state.auction && state.auction.status === 'awaiting') {
    patch.auction = { ...state.auction, closesAt: now + lengths.bidSeconds * 1000 }
    reset.push('bid')
  }
  if (state.shipping) {
    patch.shipping = { ...state.shipping, closesAt: now + lengths.shipmentSeconds * 1000 }
    reset.push('shipping')
  }
  if (state.battles) {
    const b = state.battles
    // Whichever window is LIVE gets the fresh stamp: the winner's choice,
    // the traitor beat, the plan, or the aggressor's pick — one at a time,
    // the way they run.
    if (b.current?.revealed?.allocate) {
      patch.battles = {
        ...b,
        current: {
          ...b.current,
          revealed: {
            ...b.current.revealed,
            allocate: {
              ...b.current.revealed.allocate,
              closesAt: now + lengths.battleAllocateSeconds * 1000,
            },
          },
        },
      }
      reset.push('allocate')
    } else if (b.current?.revealed) {
      patch.battles = {
        ...b,
        current: {
          ...b.current,
          revealed: {
            ...b.current.revealed,
            traitor: {
              ...b.current.revealed.traitor,
              closesAt: now + lengths.battleTraitorSeconds * 1000,
            },
          },
        },
      }
      reset.push('traitor-beat')
    } else if (b.current?.prescience && !b.current.prescience.done) {
      patch.battles = {
        ...b,
        current: {
          ...b.current,
          prescience: {
            ...b.current.prescience,
            closesAt: now + lengths.battlePrescienceSeconds * 1000,
          },
        },
      }
      reset.push('prescience')
    } else if (b.current?.voice && !b.current.voice.done) {
      patch.battles = {
        ...b,
        current: {
          ...b.current,
          voice: { ...b.current.voice, closesAt: now + lengths.battleVoiceSeconds * 1000 },
          closesAt: now + lengths.battlePlanSeconds * 1000,
        },
      }
      reset.push('voice')
    } else if (b.current) {
      patch.battles = {
        ...b,
        current: { ...b.current, closesAt: now + lengths.battlePlanSeconds * 1000 },
      }
      reset.push('battle-plan')
    } else if (b.capture) {
      patch.battles = {
        ...b,
        capture: { ...b.capture, closesAt: now + lengths.battleCaptureSeconds * 1000 },
      }
      reset.push('capture')
    } else {
      patch.battles = { ...b, closesAt: now + lengths.battlePickSeconds * 1000 }
      reset.push('battle-pick')
    }
  }
  if (state.phaseClock) {
    patch.phaseClock = { ...state.phaseClock, closesAt: now + PHASE_SECONDS * 1000 }
    reset.push('phase-clock')
  }

  return { patch, reset }
}
