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
  spiceDeck?: { turn?: number }
  charity?: { expiresAt: number; turn: number }
  auction?: { status?: string; closesAt?: number } | null
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
    | 'worms-pending' | 'charity-open' | 'auction-running'
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
export function biddingOpening(input: {
  storm: SectorId
  players: readonly Pick<DunePlayerPublic, 'faction' | 'seat'>[]
  /** Treachery cards held, by faction, counted by the caller from the rows. */
  cards: Readonly<Record<string, number>>
}): { order: FactionId[]; hands: Record<string, number>; limits: Record<string, number> } {
  const seats = seatsFromPositions(Object.fromEntries(
    input.players.map(p => [p.seat, p.faction])))
  const first = firstPlayerAfterStorm(input.storm, seats)
  if (!first) throw new Error('an auction with nobody at the table')
  // The walk found the first player; the rest follow in the same direction,
  // which is what rotating the seat-ordered list to start at them yields —
  // seat order is clockwise and the storm runs counter-clockwise, so the list
  // reverses before it rotates.
  const counter = [...seats].reverse()
  const at = counter.findIndex(s => s.faction === first.faction)
  const order = [...counter.slice(at), ...counter.slice(0, at)].map(s => s.faction)
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

  const byStrongholds = seated.filter(f => strongholdsHeld(forces, f) >= WIN_STRONGHOLDS)
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

  if (byStrongholds.length > 0) return crown(byStrongholds, 'strongholds')
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

  const counts = seated.map(f => ({ f, n: strongholdsHeld(forces, f) }))
  const best = Math.max(0, ...counts.map(c => c.n))
  const tied = counts.filter(c => c.n === best).map(c => c.f)
  if (tied.length > 1 && spice) {
    // MOST SPICE AMONG THE TIED — the tied only. A faction outside the tie
    // with the fullest purse on the planet is not in this question.
    const richest = Math.max(...tied.map(f => spice[f] ?? 0))
    const byPurse = tied.filter(f => (spice[f] ?? 0) === richest)
    // Named as the spice's win ONLY when spice narrowed it: a full tie shares,
    // and calling that 'most-spice' would announce equal purses — a fact about
    // holdings the shared verdict does not otherwise reveal.
    if (byPurse.length < tied.length) return crown(byPurse, 'most-spice')
  }
  return crown(tied, 'most-strongholds')
}
