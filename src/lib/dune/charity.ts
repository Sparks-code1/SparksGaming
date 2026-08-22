/**
 * CHOAM Charity: phase 3.
 *
 * A player holding 2 or fewer spice may claim charity, which brings them up to
 * 2. The window is open for a fixed time and closes on the clock.
 *
 * WHAT IS SECRET AND WHAT IS NOT. Spice is hidden, so eligibility is decided
 * here — on the server, against a seat's secrets — and never travels to clients.
 * The claim itself is public: everyone sees who claimed. That means a claim
 * publishes a fact about the claimant, namely that they held 2 or fewer. That is
 * the rule working as intended, not a leak, but anything reasoning about what
 * players can infer should treat a claim as published information.
 *
 * Nothing here reads a clock. The deadline is stamped by the caller that opens
 * the window, for the same reason dice are rolled by the server: a phase whose
 * length each client decided for itself would end at a different moment on every
 * screen.
 */
import type { Secrets } from '../secretsSync'
import type { GamePhase } from '@/types/Dune/Game'

/** What a Dune seat keeps hidden. One number, for now. */
export interface DuneSecrets extends Secrets {
  spice: number
  /**
   * Treachery card ids. The HAND, not the count.
   *
   * The count is public and lives in the shared row on DunePlayerPublic; this
   * is what the cards actually are, and it reaches one seat and no other.
   */
  cards?: string[]
  /**
   * Leaders this seat may call as traitors, by name.
   *
   * The single most valuable secret in the game — a known traitor is a battle
   * that cannot be lost — so it is the one thing that must never be derived,
   * inferred or defaulted anywhere a client can reach.
   */
  traitors?: string[]
  /**
   * The treachery card currently up for auction, for the Atreides alone.
   *
   * Written by the server at OPEN_BIDDING and cleared when the auction settles.
   * See lib/dune/prescience.
   */
  prescience?: string
}

/** Claiming brings a player UP TO this, it does not add it. */
export const CHARITY_TOPS_UP_TO = 2

/** How long the window stands open. */
export const CHARITY_WINDOW_MS = 15_000

export const readSpice = (s: Secrets | null | undefined): number => {
  const v = (s as DuneSecrets | null | undefined)?.spice
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** Server-side only: never send the result of this to a client. */
export function isEligibleForCharity(secrets: Secrets | null | undefined): boolean {
  return readSpice(secrets) <= CHARITY_TOPS_UP_TO
}

/**
 * What a claim is worth. Zero for anyone at or above the threshold, which is
 * also how an ineligible claim is refused: the grant is the check.
 */
export function charityGrant(secrets: Secrets | null | undefined): number {
  const spice = readSpice(secrets)
  return spice <= CHARITY_TOPS_UP_TO ? CHARITY_TOPS_UP_TO - spice : 0
}

/** A seat's secrets after claiming. Untouched when the claim is worth nothing. */
export function applyCharity(secrets: Secrets | null | undefined): DuneSecrets {
  const spice = readSpice(secrets)
  return { ...(secrets ?? {}), spice: spice + charityGrant(secrets) } as DuneSecrets
}

/**
 * The public half of the phase. No spice appears here — only who claimed, and
 * when the window shuts.
 */
export interface CharityWindow {
  /** Stamped by the server when the window opens. Clients count toward it. */
  expiresAt: number
  /** Seats that have claimed, in the order they did. Public by rule. */
  claims: string[]
  /**
   * The turn this window belongs to.
   *
   * Charity is once a turn, and without this there is nothing to compare a
   * second OPEN against — the window carried no way to tell "we are still in
   * this turn's window" from "a new turn has begun".
   */
  turn: number
}

export function openCharityWindow(now: number, turn: number): CharityWindow {
  return { expiresAt: now + CHARITY_WINDOW_MS, claims: [], turn }
}

export type CharityOpenRefusal =
  | 'wrong-phase'     // the turn has not reached charity
  | 'already-opened'  // this turn has had its window

/**
 * Whether the window may be opened.
 *
 * Opening was unguarded: any seat could call it, any number of times, and each
 * call replaced the window with a fresh one — empty claims, new deadline. The
 * spice cost of that is nil, because a repeat claim by someone already topped up
 * to 2 grants 0. What it actually cost was the rule and the record: a player who
 * had spent in between could claim a second time, and the public list of who
 * claimed was wiped each time.
 *
 * Two conditions, and they are what the state can honestly answer. The game must
 * be AT the charity phase, and this turn must not already have had its window.
 *
 * A third — which SEAT is entitled to drive a phase transition — is not
 * expressible yet: there is no host, turn-owner or phase-driver anywhere in the
 * match state. Every seated player can still trigger this; they simply cannot
 * trigger it twice, or early. That gap belongs with turn structure, not here.
 */
export function refuseCharityOpen(
  window: CharityWindow | null | undefined,
  phase: GamePhase,
  turn: number,
): CharityOpenRefusal | null {
  if (phase !== 'CHOAM Charity') return 'wrong-phase'
  if (window && window.turn === turn) return 'already-opened'
  return null
}

export const charityWindowIsOpen = (w: CharityWindow | null | undefined, now: number): boolean =>
  !!w && now < w.expiresAt

export type CharityRefusal =
  | 'no-window'          // the phase is not open
  | 'window-closed'      // the deadline has passed
  | 'already-claimed'    // one claim each
  | 'not-eligible'       // holds more than the threshold

/**
 * Whether a claim stands, decided entirely on the server.
 *
 * Eligibility is checked HERE rather than trusted from the client. A client
 * knows its own spice and can grey out its own button, but that is a courtesy;
 * a seat holding ten could still post a claim, and only this sees the number
 * that refuses it.
 */
export function refuseCharityClaim(
  window: CharityWindow | null | undefined,
  secrets: Secrets | null | undefined,
  playerId: string,
  now: number,
): CharityRefusal | null {
  if (!window) return 'no-window'
  if (now >= window.expiresAt) return 'window-closed'
  if (window.claims.includes(playerId)) return 'already-claimed'
  if (!isEligibleForCharity(secrets)) return 'not-eligible'
  return null
}

export interface CharityClaimResult {
  window: CharityWindow
  /** The claimant's new secrets, to be written in the same transaction. */
  secrets: DuneSecrets
  granted: number
}

/**
 * Apply a claim that has already been found acceptable.
 *
 * Split from the refusal so a caller cannot accidentally apply an unchecked
 * claim: this takes the grant on trust, and `refuseCharityClaim` is what earns
 * that trust.
 */
export function applyCharityClaim(
  window: CharityWindow,
  secrets: Secrets | null | undefined,
  playerId: string,
): CharityClaimResult {
  return {
    window: { ...window, claims: [...window.claims, playerId] },
    secrets: applyCharity(secrets),
    granted: charityGrant(secrets),
  }
}
