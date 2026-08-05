import type { LegacyState, RosterMember } from '@/types/legacy'

/**
 * Seat ids, in order. These are the ids every player-keyed campaign record has
 * always used (red stars, missiles, consolation bonuses, city claims), so the
 * roster reuses them: a campaign that predates the roster keeps all its history
 * as long as players are listed in their usual order when the roster is created.
 */
export const ROSTER_IDS = ['p1', 'p2', 'p3', 'p4', 'p5'] as const

export const MAX_ROSTER = ROSTER_IDS.length

/**
 * Fewest people a campaign can hold.
 *
 * A one-name roster is a dead end rather than a small campaign: every name is
 * claimed, so the join code hands a newcomer nothing to take, and no game can
 * be seated from it. Campaign setup refuses to create one, and [addRosterMember]
 * is the way out for any that already exist.
 */
export const MIN_ROSTER = 2

/** True once the campaign roster is locked — every later game picks from it. */
export function hasRoster(legacy: LegacyState | null | undefined): boolean {
  return (legacy?.roster?.length ?? 0) > 0
}

export function getRoster(legacy: LegacyState | null | undefined): RosterMember[] {
  return legacy?.roster ?? []
}

export function rosterMember(
  legacy: LegacyState | null | undefined,
  playerId: string,
): RosterMember | undefined {
  return getRoster(legacy).find(m => m.id === playerId)
}

/**
 * Display name for a player id. Falls back to the id itself so a seat is never
 * rendered blank if a record points at someone no longer on the roster.
 */
export function rosterName(
  legacy: LegacyState | null | undefined,
  playerId: string,
  fallback?: string,
): string {
  return rosterMember(legacy, playerId)?.name ?? fallback ?? playerId
}

/** Longest a roster name may be — matches the cap [addRosterMember] enforces. */
export const MAX_ROSTER_NAME = 24

/**
 * Are these names a legal campaign roster?
 *
 * One validator for both places a roster can be born — campaign setup, and the
 * older first-game naming path — because the roster is the campaign's identity
 * list and the two must not disagree about what a legal one looks like. The
 * uniqueness rule is the point: two people called "Chris" would make every
 * signature, city claim and naming right ambiguous to anyone reading the board
 * years later, and by then it is unfixable.
 */
export function validateRosterNames(names: string[]): { ok: boolean; reason?: string } {
  const trimmed = names.map(n => (n ?? '').trim())
  if (trimmed.length < MIN_ROSTER) {
    return { ok: false, reason: `A campaign needs at least ${MIN_ROSTER} players` }
  }
  if (trimmed.length > MAX_ROSTER) return { ok: false, reason: `A campaign holds at most ${MAX_ROSTER} players` }
  if (trimmed.some(n => n.length === 0)) return { ok: false, reason: 'Every player needs a name' }
  const tooLong = trimmed.find(n => n.length > MAX_ROSTER_NAME)
  if (tooLong) return { ok: false, reason: `"${tooLong}" is too long (${MAX_ROSTER_NAME} characters max)` }
  if (new Set(trimmed.map(n => n.toLowerCase())).size !== trimmed.length) {
    return { ok: false, reason: 'Each player needs a different name' }
  }
  return { ok: true }
}

/**
 * Build the permanent roster from the names typed at first setup. Seat order
 * fixes the ids, so the first person named gets `p1`, and so on.
 */
export function createRoster(names: string[], gameNumber: number): RosterMember[] {
  return names
    .map(n => n.trim())
    .filter(n => n.length > 0)
    .slice(0, MAX_ROSTER)
    .map((name, i) => ({ id: ROSTER_IDS[i], name, joinedInGame: gameNumber }))
}

/**
 * Which roster member won a given game.
 *
 * Prefers the recorded id. Entries written before rosters existed only have the
 * signed name, so those fall back to a name match — ambiguous if two members
 * share a name, which is why new entries always carry the id.
 */
export function victoryWinnerId(
  legacy: LegacyState | null | undefined,
  entry: { winnerPlayerId?: string; winnerName?: string },
): string | null {
  if (entry.winnerPlayerId) return entry.winnerPlayerId
  const byName = getRoster(legacy).find(m => m.name === entry.winnerName)
  return byName?.id ?? null
}

/** How many games a roster member has signed the board for. */
export function playerSignatureCount(
  legacy: LegacyState | null | undefined,
  playerId: string,
): number {
  return (legacy?.victoryLog ?? [])
    .filter(v => victoryWinnerId(legacy, v) === playerId)
    .length
}

/** Roster ids that have signed the board at least twice. */
export function doubleSigners(legacy: LegacyState | null | undefined): string[] {
  return getRoster(legacy)
    .map(m => m.id)
    .filter(id => playerSignatureCount(legacy, id) >= 2)
}

/** The roster member a signed-in account has claimed, if any. */
export function rosterMemberForUser(
  legacy: LegacyState | null | undefined,
  userId: string | null | undefined,
): RosterMember | undefined {
  if (!userId) return undefined
  return getRoster(legacy).find(m => m.userId === userId)
}

/**
 * Claim a roster seat for an account.
 *
 * Returns the unchanged roster when the claim is not allowed, so a caller can
 * compare by identity to detect a no-op. Rules:
 *  - an account may hold at most ONE seat in a campaign
 *  - a seat already claimed by another account cannot be taken
 * Re-claiming a seat you already hold is a no-op rather than an error.
 */
export function claimRosterSeat(
  roster: RosterMember[],
  playerId: string,
  userId: string,
  userEmail?: string | null,
): { roster: RosterMember[]; ok: boolean; reason?: string } {
  const target = roster.find(m => m.id === playerId)
  if (!target) return { roster, ok: false, reason: 'That player is not on the campaign roster' }
  if (target.userId && target.userId !== userId) {
    return { roster, ok: false, reason: `${target.name} is already linked to another account` }
  }
  const existing = roster.find(m => m.userId === userId && m.id !== playerId)
  if (existing) {
    return { roster, ok: false, reason: `This account is already linked to ${existing.name}` }
  }
  if (target.userId === userId) return { roster, ok: true }   // already claimed
  return {
    roster: roster.map(m => (m.id === playerId ? { ...m, userId, userEmail: userEmail ?? null } : m)),
    ok: true,
  }
}

/** Roster members nobody has claimed with an account — what a guest picks from. */
export function unclaimedMembers(legacy: LegacyState | null | undefined): RosterMember[] {
  return getRoster(legacy).filter(m => !m.userId)
}

/** The first unused seat id, or null when the roster is full. */
export function nextRosterId(roster: RosterMember[]): string | null {
  const taken = new Set(roster.map(m => m.id))
  return ROSTER_IDS.find(id => !taken.has(id)) ?? null
}

/**
 * Add someone to a campaign roster — the join-by-code path.
 *
 * Deliberately strict about names: the roster is the campaign's identity list,
 * and two people called "Chris" would make every signature, city claim and
 * naming right ambiguous to anyone reading the board later.
 *
 * `userId` is optional so a host can add a guest by name; when present the new
 * member is linked to that account, subject to the one-seat-per-account rule
 * that [claimRosterSeat] also enforces.
 */
export function addRosterMember(
  roster: RosterMember[],
  name: string,
  gameNumber: number,
  account?: { userId: string; userEmail?: string | null },
): { roster: RosterMember[]; member?: RosterMember; ok: boolean; reason?: string } {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return { roster, ok: false, reason: 'Enter a name to join with' }
  if (trimmed.length > 24) return { roster, ok: false, reason: 'That name is too long (24 characters max)' }
  if (roster.some(m => m.name.toLowerCase() === trimmed.toLowerCase())) {
    return { roster, ok: false, reason: `${trimmed} is already on this roster — pick that name instead of adding a new one` }
  }
  if (account) {
    const existing = roster.find(m => m.userId === account.userId)
    if (existing) return { roster, ok: false, reason: `This account already plays as ${existing.name}` }
  }
  const id = nextRosterId(roster)
  if (!id) return { roster, ok: false, reason: `This campaign is full (${MAX_ROSTER} players)` }

  const member: RosterMember = {
    id,
    name: trimmed,
    joinedInGame: gameNumber,
    ...(account ? { userId: account.userId, userEmail: account.userEmail ?? null } : {}),
  }
  return { roster: [...roster, member], member, ok: true }
}

/** Release the seat held by an account, if it holds one. */
export function releaseRosterSeat(roster: RosterMember[], userId: string): RosterMember[] {
  return roster.map(m => (m.userId === userId ? { ...m, userId: null, userEmail: null } : m))
}

/**
 * Seat assignment for a game: roster ids in seating order. Validates the rule
 * that every seat must be a distinct roster member.
 */
export function validateSeats(
  legacy: LegacyState | null | undefined,
  seatIds: Array<string | null>,
): { ok: boolean; reason?: string } {
  const filled = seatIds.filter((id): id is string => !!id)
  if (filled.length !== seatIds.length) return { ok: false, reason: 'Every seat must be assigned a player' }
  if (new Set(filled).size !== filled.length) return { ok: false, reason: 'Each player can only take one seat' }
  const ids = new Set(getRoster(legacy).map(m => m.id))
  if (!filled.every(id => ids.has(id))) return { ok: false, reason: 'Seats must be filled from the campaign roster' }
  return { ok: true }
}
