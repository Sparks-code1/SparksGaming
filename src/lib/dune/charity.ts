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
import type { FactionId } from '@/types/Dune/Faction'

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
   * The four dealt at setup, of which one is kept.
   *
   * PRESENT ONLY WHILE THE CHOICE IS OUTSTANDING. The server clears it the
   * moment one is kept — see lib/dune/setup — so a seat that has answered and a
   * seat that never owed the choice both read the same absence, and the three
   * that went back cannot be recovered from this row afterwards.
   */
  traitorsDealt?: string[]
  /**
   * The treachery card currently up for auction, for the Atreides alone.
   *
   * Written by the server at OPEN_BIDDING and cleared when the auction settles.
   * See lib/dune/prescience.
   */
  prescience?: string
  /** The Atreides' movement glimpse: the top of the spice deck, written by
   *  the phase entry into their row alone, stamped with its turn. */
  spiceReveal?: { turn: number; card: { kind: string; name?: string } }
  /**
   * ADVANCED, Harkonnen: leaders seized from lost battles, each usable in
   * ONE battle before it goes home. The identity is this seat's secret —
   * the table sees a battle won and nothing more — until the plan that
   * fields it is revealed.
   */
  capturedLeaders?: { name: string; from: FactionId }[]
  /**
   * The Nexus's PRIVATE half. An outgoing proposal, and the offers aimed at
   * this seat — each stamped with its Nexus's turn, so a record from a past
   * Nexus is inert without any cleanup write. Nothing here reaches the
   * table until an acceptance makes the alliance public.
   */
  nexusProposal?: { to: FactionId; turn: number }
  nexusOffers?: { from: FactionId; turn: number }[]
}

/** Claiming brings a player UP TO this, it does not add it. */
export const CHARITY_TOPS_UP_TO = 2

/** How long the window stands open. */
export const CHARITY_WINDOW_MS = 15_000

export const readSpice = (s: Secrets | null | undefined): number => {
  const v = (s as DuneSecrets | null | undefined)?.spice
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/**
 * The one faction the threshold does not apply to.
 *
 * "You always receive CHOAM charity of 2 spice regardless of how many spice you
 * already have" — their advanced advantage, in advanced.charity on the faction.
 *
 * A FLAT 2, NOT A TOP-UP, and the difference is the whole rule. Everyone else
 * is brought UP TO two and a seat already holding two gets nothing; the Bene
 * Gesserit holding ten claim and hold twelve. Reading it as a top-up would give
 * them exactly what everybody else gets and quietly delete the advantage.
 */
// IN ADVANCED ONLY: the sheet files it under advanced.charity, and in basic
// they are bound by the threshold like everyone else — a basic-match Bene
// Gesserit holding five claimed a flat two before the gate existed.
const ALWAYS_ELIGIBLE: FactionId = 'bene-gesserit'

/**
 * Server-side only: never send the result of this to a client.
 *
 * Takes the FACTION as well as the purse now, because one faction's answer does
 * not depend on the purse at all. Optional, so a caller that does not know who
 * is asking gets the ordinary rule rather than a crash — but the server always
 * knows, and passes it.
 */
export function isEligibleForCharity(
  secrets: Secrets | null | undefined, faction?: FactionId | null,
  mode?: 'basic' | 'advanced',
): boolean {
  if (faction === ALWAYS_ELIGIBLE && mode === 'advanced') return true
  return readSpice(secrets) <= CHARITY_TOPS_UP_TO
}

/**
 * What a claim is worth. Zero for anyone at or above the threshold, which is
 * also how an ineligible claim is refused: the grant is the check.
 *
 * Except for the Bene Gesserit, who get the full two whatever they hold. That
 * is why the grant alone can no longer decide eligibility — a rich seat and a
 * rich Bene Gesserit both used to come out at zero, and only one of them is
 * being refused. See isEligibleForCharity, which the server now asks first.
 */
export function charityGrant(
  secrets: Secrets | null | undefined, faction?: FactionId | null,
  mode?: 'basic' | 'advanced',
): number {
  if (faction === ALWAYS_ELIGIBLE && mode === 'advanced') return CHARITY_TOPS_UP_TO
  const spice = readSpice(secrets)
  return spice <= CHARITY_TOPS_UP_TO ? CHARITY_TOPS_UP_TO - spice : 0
}

/** A seat's secrets after claiming. Untouched when the claim is worth nothing. */
export function applyCharity(
  secrets: Secrets | null | undefined, faction?: FactionId | null,
  mode?: 'basic' | 'advanced',
): DuneSecrets {
  const spice = readSpice(secrets)
  return {
    ...(secrets ?? {}),
    spice: spice + charityGrant(secrets, faction, mode),
  } as DuneSecrets
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
  faction?: FactionId | null,
  mode?: 'basic' | 'advanced',
): CharityRefusal | null {
  if (!window) return 'no-window'
  if (now >= window.expiresAt) return 'window-closed'
  if (window.claims.includes(playerId)) return 'already-claimed'
  if (!isEligibleForCharity(secrets, faction, mode)) return 'not-eligible'
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
