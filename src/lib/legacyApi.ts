import { supabase } from './supabase'
import type { LegacyState } from '@/types/legacy'
import type { ScarType } from '@/types/territory'
import { getInitialScarDeck } from '@/data/scarCards'
import { storeGet, storeSet, storeRemove } from './appStore'
import { generateJoinCode, normalizeJoinCode, isValidJoinCode } from './joinCode'
import { addRosterMember, claimRosterSeat, getRoster, createRoster, validateRosterNames } from './roster'

// ─── Campaign identity ────────────────────────────────────────────────────────
// Campaigns are keyed by a generated UUID, so any number of them coexist in the
// `campaigns` and `game_sessions` tables. Which one the app is currently in is
// a local pointer, not a global constant.

const ACTIVE_CAMPAIGN_KEY = 'riskLegacy:activeCampaignId'

/** A fresh campaign id. */
export function newCampaignId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  // Older webviews: a v4-shaped id from getRandomValues, else timestamp+random.
  if (c && typeof c.getRandomValues === 'function') {
    const b = c.getRandomValues(new Uint8Array(16))
    b[6] = (b[6] & 0x0f) | 0x40
    b[8] = (b[8] & 0x3f) | 0x80
    const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('')
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
  }
  return `campaign-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

/** The campaign this device was last playing, if any. */
export function getActiveCampaignId(): Promise<string | null> {
  return storeGet(ACTIVE_CAMPAIGN_KEY)
}

export function setActiveCampaignId(id: string): Promise<void> {
  return storeSet(ACTIVE_CAMPAIGN_KEY, id)
}

export function clearActiveCampaignId(): Promise<void> {
  return storeRemove(ACTIVE_CAMPAIGN_KEY)
}

// ─── Default state ────────────────────────────────────────────────────────────

/** A brand-new campaign, with its own id. */
export function defaultLegacyState(): LegacyState {
  return {
    campaignId: newCampaignId(),
    currentGameNumber: 1,
    worldName: 'New World',
    campaignEpoch: new Date().toISOString(),
    roster: [],
    scars: [],
    stickers: [],
    destroyedCities: [],
    destroyedHqs: [],
    renamedTerritories: [],
    continentBonusModifiers: [],
    unlockedContent: [],
    removedCardIds: [],
    chosenFactionAbilities: {},
    removedAbilityIds: [],
    scarDeck: getInitialScarDeck(),
    dealtScars: [],
    activeGameCards: null,
    historyLog: [],
    victoryLog: [],
    consolationBonuses: {},
    namedContinents: {},
    missiles: {},
    cardResources: {},
    purchasedStars: {},
    firstEliminationTriggered: false,
    comebackPowers: {},
    claimedComebackPowers: [],
    doubleWinnerMilestoneTriggered: false,
    destroyedMissionIds: [],
    cancelledScars: [],
    factionStartingHistory: [],
    factionHomelands: {},
    ninthCityUnlocked: false,
    draftOrderUnlocked: false,
    destroyedEventCardIds: [],
    worldCapitalTerritoryId: undefined,
    playerRedStars: {},
    customSeaLines: [],
    campaignComplete: false,
    campaignWinnerId: undefined,
    gameInProgress: false,
    activeGameState: null,
    alienMilestoneTriggered: false,
    alienCollaboratorFactionId: null,
    alienIsland: null,
    ruinTerritoryIds: [],
    alienWeaknessPowers: {},
    alienStarPowerClaimed: false,
    nuclearMilestoneTriggered: false,
    nuclearBringerFactionId: null,
    falloutZoneTerritoryId: null,
    missilePowers: {},
    claimedMissilePowers: [],
    mutantEvolvePowers: [],
    mutantStarPowerClaimed: false,
    bringerBonusMissilesGame: undefined,
    playerWins: {},
    missilesReplenishedGame: undefined,
  }
}

// ─── Red star awards ──────────────────────────────────────────────────────────

/** Pure function — awards in-GAME red star tokens. There are no career red
 *  stars: every award counts toward the current game's 4-star victory
 *  (tracked in purchasedStars, which resets between games). */
export function awardRedStars(
  state: LegacyState,
  playerId: string,
  stars: number,
  playerName: string,
  gameNumber: number,
): LegacyState {
  const prev = state.purchasedStars ?? {}
  const newCount = (prev[playerId] ?? 0) + stars
  return {
    ...state,
    purchasedStars: { ...prev, [playerId]: newCount },
    historyLog: [
      ...state.historyLog,
      {
        gameNumber,
        entry: `${playerName} earned ${stars} red star${stars !== 1 ? 's' : ''} this game (game total: ${newCount} ★)`,
        timestamp: new Date().toISOString(),
      },
    ],
  }
}

// ─── Load / Save ──────────────────────────────────────────────────────────────

// ─── join_code column availability ───────────────────────────────────────────
// The column ships in supabase/join-codes.sql, which has to be run by hand
// against an existing database. Until it is, every query naming the column
// fails outright — so the first such failure flips this flag and the code falls
// back to the copy kept inside legacy_state. Joining still works; what is lost
// is the DATABASE-level uniqueness guarantee, so the fallback also warns.

let joinCodeColumnMissing = false
let warnedAboutColumn = false

/** True when this error is Postgres/PostgREST complaining the column is absent. */
function isMissingJoinCodeColumn(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false
  const msg = (error.message ?? '').toLowerCase()
  return msg.includes('join_code') &&
    (msg.includes('does not exist') || msg.includes('schema cache') || error.code === '42703' || error.code === 'PGRST204')
}

function noteMissingColumn() {
  joinCodeColumnMissing = true
  if (!warnedAboutColumn) {
    warnedAboutColumn = true
    console.warn(
      '[JoinCode] campaigns.join_code is missing — run supabase/join-codes.sql. ' +
      'Codes still work, but uniqueness is only checked client-side until then.',
    )
  }
}

/** Whether codes are currently backed by the unique constraint. */
export function joinCodeConstraintActive(): boolean {
  return !joinCodeColumnMissing
}

interface CampaignRow { legacy_state: LegacyState; join_code?: string | null }

/**
 * Read one campaign, preferring the query that includes the code column and
 * falling back once if the migration has not been run. The select strings are
 * literals because supabase-js derives the row type from them — a computed
 * string types the result as a parser error instead.
 */
async function fetchCampaignRow(campaignId: string) {
  if (!joinCodeColumnMissing) {
    const res = await supabase
      .from('campaigns')
      .select('legacy_state, join_code')
      .eq('id', campaignId)
      .single()
    if (!isMissingJoinCodeColumn(res.error)) {
      return { data: res.data as unknown as CampaignRow | null, error: res.error }
    }
    noteMissingColumn()
  }
  const res = await supabase
    .from('campaigns')
    .select('legacy_state')
    .eq('id', campaignId)
    .single()
  return { data: res.data as unknown as CampaignRow | null, error: res.error }
}

export async function loadLegacyState(campaignId: string): Promise<LegacyState | null> {
  if (!campaignId) return null
  try {
    // Record which version we are about to amend, so the next save can refuse
    // to overwrite anyone who wrote in between. Its own query, because folding
    // it into fetchCampaignRow would need a third missing-column fallback.
    if (!legacyVersionColumnMissing) {
      const v = await supabase.from('campaigns').select('legacy_version').eq('id', campaignId).maybeSingle()
      if (isMissingVersionColumn(v.error)) noteMissingVersionColumn()
      else if (typeof v.data?.legacy_version === 'number') noteLegacyVersion(campaignId, v.data.legacy_version)
    }
    const { data, error } = await fetchCampaignRow(campaignId)
    if (error || !data) {
      // A failed LOAD is not the same as "no campaign yet" — returning null for
      // both makes a transient outage look like a fresh campaign. Surface it on
      // the connection indicator so the lobby is not silently offering a new
      // campaign over the top of one that simply could not be read.
      if (error) {
        console.error('[LegacyLoad] FAILED to read campaign:', error.message)
        setConnection({ state: 'error', message: error.message, failures: connection.failures + 1 })
      }
      return null
    }
    const row = data as { legacy_state: LegacyState; join_code?: string | null }
    const ls = row.legacy_state
    // Heal saves corrupted by an older duplicate-append bug: scar-card ids are
    // unique, so a card can never legitimately appear twice in the deck.
    if (Array.isArray(ls.scarDeck)) {
      const deduped = [...new Set(ls.scarDeck)]
      if (deduped.length !== ls.scarDeck.length) ls.scarDeck = deduped
    }
    // The COLUMN is authoritative — a code left behind in old saved JSON must
    // never be shown as if it were the real one.
    if (!joinCodeColumnMissing) ls.joinCode = row.join_code ?? null
    return ls
  } catch {
    return null
  }
}

// ─── Connection status ───────────────────────────────────────────────────────
// A legacy game keeps nothing locally: if Supabase is unreachable the whole
// session runs in memory and vanishes on reload. So the connection is surfaced
// in the UI rather than left to the console — silence is the dangerous state.

export type ConnectionState =
  | 'unknown'   // nothing attempted yet this session
  | 'saving'    // a write is in flight
  | 'ok'        // the last write succeeded
  | 'error'     // the last write or read failed

export interface ConnectionStatus {
  state: ConnectionState
  /** Failure detail from Supabase, present on 'error'. */
  message?: string
  /** ISO time of the last write that actually landed. */
  lastSavedAt?: string
  /** Consecutive failures — resets to 0 on any success. */
  failures: number
}

let connection: ConnectionStatus = { state: 'unknown', failures: 0 }
type ConnectionListener = (status: ConnectionStatus) => void
const connectionListeners = new Set<ConnectionListener>()

/** The most recent payload we tried to write, so a retry can resend it. */
let lastAttemptedState: LegacyState | null = null

/**
 * Update the shared status and tell every listener — but never on the caller's
 * stack.
 *
 * `saveLegacyState` is called from all over the app, including from inside React
 * state updaters, which React runs during the render phase. Delivering
 * synchronously meant setting state on the ConnectionStatus component in the
 * middle of another component's render — React's "Cannot update a component
 * while rendering a different component" warning. A microtask runs as soon as
 * the current stack unwinds, so the indicator is still effectively immediate.
 *
 * Each delivery carries its own snapshot, so rapid updates arrive in order and a
 * listener never sees a status newer than the one it was notified about.
 */
function setConnection(patch: Partial<ConnectionStatus>) {
  connection = { ...connection, ...patch }
  const snapshot = connection
  queueMicrotask(() => {
    for (const fn of connectionListeners) {
      try { fn(snapshot) } catch { /* a listener must never break the save path */ }
    }
  })
}

export function onLegacyConnection(fn: ConnectionListener): () => void {
  connectionListeners.add(fn)
  fn(connection)   // deliver current status immediately
  return () => { connectionListeners.delete(fn) }
}

export function getLegacyConnection(): ConnectionStatus {
  return connection
}

/** Resend the last attempted write. No-op when nothing has been attempted. */
export async function retryLastSave(): Promise<void> {
  if (!lastAttemptedState) return
  await saveLegacyState(lastAttemptedState)
}

/**
 * The version of the campaign row this client last read or wrote.
 *
 * `legacy_state` is one whole blob, so a save is a full overwrite. On one
 * machine that is fine. Across two it is not: both read, both append their own
 * consequence, both write everything back, and the second erases the first. A
 * scar, a founded city, a red star — gone, with no error anywhere.
 *
 * Tracked per campaign so a client that has two open does not confuse them.
 */
const legacyVersions = new Map<string, number>()

/**
 * True once the database has told us `legacy_version` does not exist.
 *
 * The column ships in supabase/online-play.sql, which is applied by hand. Until
 * it is, every guarded write fails outright — so the first such failure flips
 * this and saving falls back to the unguarded upsert. Single-machine play is
 * unaffected; what is lost is the protection against two machines overwriting
 * each other, so the fallback says so loudly.
 */
let legacyVersionColumnMissing = false
let warnedAboutVersionColumn = false

function isMissingVersionColumn(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false
  const msg = (error.message ?? '').toLowerCase()
  return msg.includes('legacy_version') &&
    (msg.includes('does not exist') || msg.includes('schema cache') || error.code === '42703' || error.code === 'PGRST204')
}

function noteMissingVersionColumn() {
  legacyVersionColumnMissing = true
  if (!warnedAboutVersionColumn) {
    warnedAboutVersionColumn = true
    console.warn(
      '[LegacySave] campaigns.legacy_version is missing — run supabase/online-play.sql. '
      + 'Saving still works, but two machines in one campaign can silently overwrite each other.',
    )
  }
}

/** Whether concurrent writes are actually being guarded right now. */
export function legacyWriteGuardActive(): boolean {
  return !legacyVersionColumnMissing
}

/** Record the version that came with a row we just read. */
export function noteLegacyVersion(campaignId: string, version: number | null | undefined): void {
  if (typeof version === 'number') legacyVersions.set(campaignId, version)
}

export function knownLegacyVersion(campaignId: string): number | null {
  return legacyVersions.get(campaignId) ?? null
}

/** Thrown when a save was built on a copy someone else has already replaced. */
export class StaleCampaignError extends Error {
  constructor(public campaignId: string, public expected: number, public actual: number | null) {
    super(
      `Another player has changed this campaign since you loaded it `
      + `(you have v${expected}, the server is at v${actual ?? '?'}). `
      + 'Your change was not saved — reload the campaign and try again.',
    )
    this.name = 'StaleCampaignError'
  }
}

export async function saveLegacyState(state: LegacyState): Promise<void> {
  // supabase-js RESOLVES on failure with an `error` field rather than throwing.
  // Ignoring it — as this did — makes a rejected write indistinguishable from a
  // successful one, so play continues on state that was never persisted.
  // The row is keyed by the state's OWN campaign id, so every caller writes to
  // the campaign it is holding — no ambient "current campaign" to get wrong.
  if (!state.campaignId) {
    throw new Error('Campaign save failed: state has no campaignId')
  }
  lastAttemptedState = state
  setConnection({ state: 'saving' })
  let message: string | null = null
  const expected = legacyVersions.get(state.campaignId) ?? null

  try {
    // ── Compare-and-swap when we know which version we are amending ────────
    // `.eq('legacy_version', expected)` makes the write conditional: if anyone
    // else has written since we read, zero rows match and nothing is
    // overwritten. A trigger bumps the version, so no client can skip it.
    //
    // `expected` is null only before this client has ever read the row — the
    // very first save of a brand-new campaign — where there is nothing to
    // clobber and an unguarded upsert is correct.
    if (expected !== null && !legacyVersionColumnMissing) {
      const { data, error } = await supabase
        .from('campaigns')
        .update({
          world_name: state.worldName,
          legacy_state: state,
          updated_at: new Date().toISOString(),
        })
        .eq('id', state.campaignId)
        .eq('legacy_version', expected)
        .select('legacy_version')
        .maybeSingle()

      if (isMissingVersionColumn(error)) {
        // Fall through to the unguarded path below on this and every later save.
        noteMissingVersionColumn()
        const { error: e2 } = await supabase.from('campaigns').upsert({
          id: state.campaignId, world_name: state.worldName,
          legacy_state: state, updated_at: new Date().toISOString(),
        })
        if (e2) message = e2.message || 'Unknown database error'
      } else if (error) {
        message = error.message || 'Unknown database error'
      } else if (!data) {
        // Nothing matched: someone else wrote first. Do NOT retry blindly —
        // this state was computed from what we read, and re-sending it is
        // exactly the overwrite the guard exists to prevent.
        const { data: now } = await supabase
          .from('campaigns').select('legacy_version').eq('id', state.campaignId).maybeSingle()
        const actual = (now?.legacy_version as number | undefined) ?? null
        setConnection({
          state: 'error',
          message: 'Another player changed this campaign — your change was not saved',
          failures: connection.failures + 1,
        })
        throw new StaleCampaignError(state.campaignId, expected, actual)
      } else {
        legacyVersions.set(state.campaignId, data.legacy_version as number)
      }
    } else {
      const { data, error } = await supabase.from('campaigns').upsert({
        id: state.campaignId,
        world_name: state.worldName,
        legacy_state: state,
        updated_at: new Date().toISOString(),
      }).select('legacy_version').maybeSingle()
      if (isMissingVersionColumn(error)) {
        noteMissingVersionColumn()
        const { error: e2 } = await supabase.from('campaigns').upsert({
          id: state.campaignId, world_name: state.worldName,
          legacy_state: state, updated_at: new Date().toISOString(),
        })
        if (e2) message = e2.message || 'Unknown database error'
      } else if (error) message = error.message || 'Unknown database error'
      else if (data) legacyVersions.set(state.campaignId, data.legacy_version as number)
    }
  } catch (e) {
    if (e instanceof StaleCampaignError) throw e
    message = e instanceof Error ? e.message : String(e)
  }
  if (message) {
    console.error('[LegacySave] FAILED — campaign progress was NOT saved:', message)
    setConnection({ state: 'error', message, failures: connection.failures + 1 })
    throw new Error(`Campaign save failed: ${message}`)
  }
  setConnection({
    state: 'ok',
    message: undefined,
    failures: 0,
    lastSavedAt: new Date().toISOString(),
  })
}

// ─── Join codes: create, backfill, look up, join ─────────────────────────────

/** How many fresh codes to try before giving up on a collision. */
const CODE_ATTEMPTS = 6

/** Codes already handed out — only consulted on the degraded (no column) path. */
async function takenCodes(): Promise<Set<string>> {
  const { data } = await supabase.from('campaigns').select('legacy_state')
  const out = new Set<string>()
  for (const row of data ?? []) {
    const code = ((row.legacy_state ?? {}) as Partial<LegacyState>).joinCode
    if (code) out.add(code.toUpperCase())
  }
  return out
}

/** Write a code onto a campaign row. Resolves false on a uniqueness collision. */
async function tryWriteCode(campaignId: string, code: string): Promise<boolean> {
  const { error } = await supabase
    .from('campaigns')
    .update({ join_code: code })
    .eq('id', campaignId)
  if (!error) return true
  if (isMissingJoinCodeColumn(error)) { noteMissingColumn(); return false }
  // 23505 = unique_violation: someone else took this exact code first.
  if (error.code === '23505') return false
  throw new Error(`Could not set the join code: ${error.message}`)
}

/**
 * Give a campaign a join code, retrying on collision.
 *
 * Idempotent: a campaign that already has one keeps it, so calling this on
 * every open is safe and quietly backfills campaigns made before codes existed.
 */
export async function ensureJoinCode(state: LegacyState): Promise<string> {
  if (state.joinCode && isValidJoinCode(state.joinCode)) return state.joinCode

  if (joinCodeColumnMissing) {
    // Degraded path: no constraint to lean on, so check what exists first.
    // Two people creating a campaign in the same second could still collide —
    // which is exactly why the real answer is running the migration.
    const taken = await takenCodes()
    let code = generateJoinCode()
    for (let i = 0; i < CODE_ATTEMPTS && taken.has(code); i++) code = generateJoinCode()
    await saveLegacyState({ ...state, joinCode: code })
    return code
  }

  for (let i = 0; i < CODE_ATTEMPTS; i++) {
    const code = generateJoinCode()
    if (await tryWriteCode(state.campaignId, code)) {
      // Mirror into the JSON so the degraded path has something to read later.
      await saveLegacyState({ ...state, joinCode: code }).catch(() => {})
      return code
    }
    if (joinCodeColumnMissing) return ensureJoinCode(state)   // column vanished mid-flight
  }
  throw new Error('Could not generate a unique join code — please try again')
}

/**
 * Create a campaign, its roster and its join code in one step.
 *
 * The roster is settled HERE rather than by the first game. It is the
 * campaign's list of people, and three things that happen before a board exists
 * all need it: a joiner has to have a name to claim, an account has to have a
 * seat to link to, and online play has to know whose turn it is. Deriving it
 * from game one meant none of that could happen until game one was under way —
 * and the roster is permanent regardless of which game creates it, so the later
 * point was never the more honest one.
 *
 * `host` links the creator's own account to one of those names immediately, so
 * the person setting the campaign up is not left as the one unclaimed seat
 * blocking their own game from going online.
 *
 * The row is written BEFORE the code is assigned, because the code is set with
 * an update keyed on the row's id — a campaign with no row cannot hold a code.
 */
export async function createCampaign(
  worldName: string,
  rosterNames: string[],
  host?: { playerId: string; userId: string; userEmail?: string | null },
): Promise<LegacyState> {
  const check = validateRosterNames(rosterNames)
  if (!check.ok) throw new Error(check.reason)

  let roster = createRoster(rosterNames, 1)
  if (host) {
    const claimed = claimRosterSeat(roster, host.playerId, host.userId, host.userEmail)
    // Refuse rather than create the campaign with the link silently dropped —
    // an unlinked host is exactly the state this argument exists to prevent.
    if (!claimed.ok) throw new Error(claimed.reason ?? 'Could not link your account to that name')
    roster = claimed.roster
  }

  const fresh: LegacyState = { ...defaultLegacyState(), worldName, roster }
  await saveLegacyState(fresh)
  try {
    const code = await ensureJoinCode(fresh)
    return { ...fresh, joinCode: code }
  } catch (e) {
    // A campaign without a code is still perfectly playable on this machine —
    // it just cannot be shared yet, and opening it will retry the backfill.
    console.error('[JoinCode] could not assign a code to the new campaign:', e)
    return fresh
  }
}

/** What a code resolves to, before anyone commits to joining. */
export interface JoinLookup {
  campaignId: string
  worldName: string
  legacy: LegacyState
}

/**
 * Find the campaign a code belongs to.
 *
 * Returns null for "no such campaign" and throws for "could not ask", so the
 * UI can tell a wrong code apart from a dead connection.
 */
export async function findCampaignByJoinCode(rawCode: string): Promise<JoinLookup | null> {
  const code = normalizeJoinCode(rawCode)
  if (!isValidJoinCode(code)) return null

  if (!joinCodeColumnMissing) {
    // ilike with no wildcards is a case-insensitive equality test.
    const { data, error } = await supabase
      .from('campaigns')
      .select('id, world_name, legacy_state, join_code')
      .ilike('join_code', code)
      .limit(1)
    if (isMissingJoinCodeColumn(error)) {
      noteMissingColumn()
    } else if (error) {
      throw new Error(`Could not look up that code: ${error.message}`)
    } else {
      const row = (data ?? [])[0]
      if (!row) return null
      const ls = row.legacy_state as LegacyState
      ls.joinCode = (row.join_code as string) ?? code
      return { campaignId: row.id as string, worldName: ls.worldName || (row.world_name as string), legacy: ls }
    }
  }

  // Degraded path — match on the copy inside legacy_state.
  const { data, error } = await supabase.from('campaigns').select('id, world_name, legacy_state')
  if (error) throw new Error(`Could not look up that code: ${error.message}`)
  for (const row of data ?? []) {
    const ls = (row.legacy_state ?? {}) as LegacyState
    if ((ls.joinCode ?? '').toUpperCase() === code) {
      return { campaignId: row.id as string, worldName: ls.worldName || (row.world_name as string), legacy: ls }
    }
  }
  return null
}

/** Who is joining: an account, or a guest taking an unclaimed name. */
export type JoinAs =
  /** Add a new roster member. Links to the account when one is supplied. */
  | { kind: 'new'; name: string; userId?: string; userEmail?: string | null }
  /** Take an existing roster seat. A signed-in player also links to it. */
  | { kind: 'existing'; playerId: string; userId?: string; userEmail?: string | null }

export interface JoinResult {
  legacy: LegacyState
  /** Roster id the joiner now plays as. */
  playerId: string
}

/**
 * Add a player to a campaign's roster.
 *
 * Re-reads the campaign immediately before writing rather than trusting the
 * copy the lookup returned: between typing a code and pressing Join, someone
 * else may have taken the last seat or claimed the name being picked.
 */
export async function joinCampaign(campaignId: string, joinAs: JoinAs): Promise<JoinResult> {
  const current = await loadLegacyState(campaignId)
  if (!current) throw new Error('That campaign could not be loaded — check your connection and try again')

  let roster = getRoster(current)
  let playerId: string

  if (joinAs.kind === 'new') {
    const added = addRosterMember(
      roster,
      joinAs.name,
      current.currentGameNumber,
      joinAs.userId ? { userId: joinAs.userId, userEmail: joinAs.userEmail } : undefined,
    )
    if (!added.ok || !added.member) throw new Error(added.reason ?? 'Could not join that campaign')
    roster = added.roster
    playerId = added.member.id
  } else {
    const seat = roster.find(m => m.id === joinAs.playerId)
    if (!seat) throw new Error('That player is no longer on the campaign roster')
    if (joinAs.userId) {
      const claimed = claimRosterSeat(roster, joinAs.playerId, joinAs.userId, joinAs.userEmail)
      if (!claimed.ok) throw new Error(claimed.reason ?? 'Could not link that player')
      roster = claimed.roster
    } else if (seat.userId) {
      // A guest cannot take a name someone has already tied to their account.
      throw new Error(`${seat.name} is claimed by an account — pick an unclaimed name`)
    }
    playerId = joinAs.playerId
  }

  const updated: LegacyState = { ...current, roster }
  await saveLegacyState(updated)
  return { legacy: updated, playerId }
}

// ─── Local identity ──────────────────────────────────────────────────────────
// Which roster member THIS device is playing as. Only meaningful for guests —
// a signed-in player is identified by the userId on their roster entry, which
// travels with the account. Guests have nowhere else to put it.

const localSeatKey = (campaignId: string) => `riskLegacy:seat:${campaignId}`

export function getLocalSeat(campaignId: string): Promise<string | null> {
  return storeGet(localSeatKey(campaignId))
}

export function setLocalSeat(campaignId: string, playerId: string): Promise<void> {
  return storeSet(localSeatKey(campaignId), playerId)
}

// ─── Game sessions ────────────────────────────────────────────────────────────

export interface GameSessionRow {
  id: string
  campaign_id: string
  game_number: number
  winner_player_name: string | null
  winner_faction_id: string | null
  legacy_events: LegacyEvent[]
  created_at: string
}

export interface LegacyEvent {
  type: 'scar-placed' | 'city-placed' | 'city-destroyed' | 'hq-placed' | 'content-unlocked' | 'bonus-changed' | 'territory-renamed' | 'world-named'
  description: string
  territoryId?: string
  data?: Record<string, unknown>
}

export async function loadGameHistory(
  campaignId: string,
  campaignEpoch?: string,
): Promise<GameSessionRow[]> {
  if (!campaignId) return []
  try {
    let query = supabase
      .from('game_sessions')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('game_number', { ascending: true })
    // Campaigns now have their own ids, so the epoch filter is only needed for
    // rows written before that — when every campaign shared one id and could
    // only be told apart by when it started.
    if (campaignEpoch) {
      query = query.gte('created_at', campaignEpoch)
    }
    const { data } = await query
    return (data ?? []) as GameSessionRow[]
  } catch {
    return []
  }
}

export async function saveGameSession(
  campaignId: string,
  gameNumber: number,
  winnerPlayerName: string | null,
  winnerFactionId: string | null,
  events: LegacyEvent[],
): Promise<void> {
  await supabase.from('game_sessions').insert({
    campaign_id: campaignId,
    game_number: gameNumber,
    winner_player_name: winnerPlayerName,
    winner_faction_id: winnerFactionId,
    legacy_events: events,
  })
}

// ─── Campaign list ────────────────────────────────────────────────────────────

/** One row in the campaign picker. */
export interface CampaignSummary {
  id: string
  worldName: string
  currentGameNumber: number
  gamesWon: number
  updatedAt: string
  gameInProgress: boolean
  campaignComplete: boolean
  /** Roster names, for telling similar campaigns apart at a glance. */
  players: string[]
  /** Shareable code, or null for a campaign that has not been given one yet. */
  joinCode: string | null
}

interface CampaignListRow {
  id: string
  world_name: string
  legacy_state: Partial<LegacyState>
  updated_at: string
  join_code?: string | null
}

/** As fetchCampaignRow, for the whole list. Literal selects for the same reason. */
async function fetchCampaignRows() {
  if (!joinCodeColumnMissing) {
    const res = await supabase
      .from('campaigns')
      .select('id, world_name, legacy_state, updated_at, join_code')
      .order('updated_at', { ascending: false })
    if (!isMissingJoinCodeColumn(res.error)) {
      return { data: res.data as unknown as CampaignListRow[] | null, error: res.error }
    }
    noteMissingColumn()
  }
  const res = await supabase
    .from('campaigns')
    .select('id, world_name, legacy_state, updated_at')
    .order('updated_at', { ascending: false })
  return { data: res.data as unknown as CampaignListRow[] | null, error: res.error }
}

/** Every campaign on this database, most recently played first. */
export async function listCampaigns(): Promise<CampaignSummary[]> {
  try {
    const { data, error } = await fetchCampaignRows()
    if (error) {
      console.error('[Campaigns] FAILED to list campaigns:', error.message)
      setConnection({ state: 'error', message: error.message, failures: connection.failures + 1 })
      return []
    }
    return (data ?? []).map(row => {
      const ls = (row.legacy_state ?? {}) as Partial<LegacyState>
      return {
        id: row.id,
        worldName: ls.worldName || row.world_name || 'Unnamed world',
        currentGameNumber: ls.currentGameNumber ?? 1,
        gamesWon: (ls.victoryLog ?? []).length,
        updatedAt: row.updated_at,
        gameInProgress: !!ls.gameInProgress,
        campaignComplete: !!ls.campaignComplete,
        players: (ls.roster ?? []).map(m => m.name),
        joinCode: row.join_code ?? ls.joinCode ?? null,
      }
    })
  } catch (e) {
    console.error('[Campaigns] FAILED to list campaigns:', e)
    return []
  }
}

/** Remove a campaign and its game history. */
export async function deleteCampaign(campaignId: string): Promise<void> {
  if (!campaignId) return
  await supabase.from('game_sessions').delete().eq('campaign_id', campaignId)
  const { error } = await supabase.from('campaigns').delete().eq('id', campaignId)
  if (error) throw new Error(`Could not delete campaign: ${error.message}`)
}

// ─── Scar metadata ────────────────────────────────────────────────────────────

export interface ScarMeta {
  type: ScarType
  label: string
  icon: string
  color: string
  effect: string
}

export const SCAR_META: ScarMeta[] = [
  {
    type: 'fortified',
    label: 'Bunker',
    icon: '🏰',
    color: '#3498DB',
    effect: 'Adds +1 to the defender\'s highest die.',
  },
  {
    type: 'fortification',
    label: 'Fortification',
    icon: '◎',
    color: '#1a4a7a',
    effect: '+1 to the defender\'s highest and lowest die.',
  },
  {
    type: 'wasteland',
    label: 'Ammo Shortage',
    icon: '💀',
    color: '#E74C3C',
    effect: 'Defender\'s highest die is reduced by 1 when this territory is attacked.',
  },
  {
    type: 'mercenary',
    label: 'Mercenary',
    icon: '🧍',
    color: '#2c2c2c',
    effect: 'The occupying player gains +1 troop here at the end of each of their turns.',
  },
  // Legacy types — only for display on territories that already have them; never dealt
  {
    type: 'nuclear-fallout',
    label: 'Nuclear Fallout',
    icon: '☢️',
    color: '#F1C40F',
    effect: 'Attacker and defender each lose an extra troop per battle here.',
  },
  {
    type: 'biological',
    label: 'Biological',
    icon: '☣️',
    color: '#27AE60',
    effect: 'The occupying player loses 1 troop here at the end of each of their turns.',
  },
]

// ─── Apply legacy state to territories ───────────────────────────────────────

/** Merges persisted legacy scars + cities back onto territory objects. */
export function applyLegacyToTerritories(
  territories: Record<string, import('@/types/territory').Territory>,
  legacy: LegacyState,
): Record<string, import('@/types/territory').Territory> {
  const result = { ...territories }

  // Re-apply scars
  for (const id of Object.keys(result)) {
    result[id] = { ...result[id], scars: [], cities: [] }
  }
  for (const s of legacy.scars) {
    if (result[s.territoryId]) {
      result[s.territoryId] = {
        ...result[s.territoryId],
        scars: [...result[s.territoryId].scars, { type: s.type, appliedInGame: s.appliedInGame, attackCount: s.attackCount }],
      }
    }
  }

  // Re-apply stickers (cities & HQs) — ONLY city/HQ stickers become city
  // entries; fortification and other territory stickers are not cities
  for (const sticker of legacy.stickers) {
    if (sticker.placement !== 'territory') continue
    const t = result[sticker.targetId]
    if (!t) continue
    const destroyed = legacy.destroyedCities.find(d => d.cityId === sticker.id)
    const isCitySticker = sticker.description.startsWith('city:')
    const isHqSticker   = sticker.description.startsWith('HQ:')
    if (!isCitySticker && !isHqSticker) continue
    result[sticker.targetId] = {
      ...t,
      cities: [
        ...t.cities,
        {
          id: sticker.id,
          name: sticker.name,
          territoryId: sticker.targetId,
          isDestroyed: !!destroyed,
          destroyedInGame: destroyed?.destroyedInGame,
          headquartersFactionId: isHqSticker ? sticker.description.slice(3) : undefined,
          isMajor: isCitySticker ? sticker.description === 'city:major' : undefined,
        },
      ],
    }
  }

  // Apply renamed territories
  for (const r of legacy.renamedTerritories) {
    if (result[r.territoryId]) {
      result[r.territoryId] = { ...result[r.territoryId], name: r.newName }
    }
  }

  // Apply destroyed HQ permanent marks
  for (const hq of (legacy.destroyedHqs ?? [])) {
    if (result[hq.territoryId]) {
      result[hq.territoryId] = { ...result[hq.territoryId], destroyedHqMarked: true }
    }
  }

  return result
}

// ─── Unlock events ────────────────────────────────────────────────────────────

export interface UnlockOption {
  id: string
  name: string
  description: string
  contentType: 'faction-power' | 'rule-section' | 'continent-bonus' | 'event-deck'
  continentId?: string
  bonusDelta?: number
}

export const UNLOCK_POOL: UnlockOption[] = [
  { id: 'un-bear-iron', name: 'Iron Pact', contentType: 'faction-power', description: 'Enclave of the Bear: may place 2 extra troops on one territory during Draft.' },
  { id: 'un-balk-shield', name: 'Imperial Shield', contentType: 'faction-power', description: 'Imperial Balkania: all territories in Europe count as fortified for defense.' },
  { id: 'un-khan-blitz', name: 'Blitzkrieg', contentType: 'faction-power', description: 'Khan Industries: may attack with 4 dice instead of 3 once per turn.' },
  { id: 'un-sah-oasis', name: 'Desert Oasis', contentType: 'faction-power', description: 'Saharan Republic: African territories immune to Biological scar effects.' },
  { id: 'un-mech-armor', name: 'Armored Core', contentType: 'faction-power', description: 'Die Mechaniker: fortified territories also block Nuclear Fallout.' },
  { id: 'un-vig-medic', name: 'Field Medics', contentType: 'faction-power', description: 'Noble Vigil: recover 1 troop lost to Biological scars at end of turn.' },
  { id: 'un-na-bonus', name: 'North American Surge', contentType: 'continent-bonus', continentId: 'north-america', bonusDelta: 1, description: 'North America bonus permanently increased by +1.' },
  { id: 'un-eu-bonus', name: 'European Resurgence', contentType: 'continent-bonus', continentId: 'europe', bonusDelta: 1, description: 'Europe bonus permanently increased by +1.' },
  { id: 'un-asia-bonus', name: 'Asian Dominance', contentType: 'continent-bonus', continentId: 'asia', bonusDelta: 2, description: 'Asia bonus permanently increased by +2.' },
  { id: 'un-secret-event', name: 'Secret Orders', contentType: 'event-deck', description: 'Unlock the Secret Orders event deck — shuffle into Risk cards.' },
  { id: 'un-rulebook-p2', name: 'Advanced Combat', contentType: 'rule-section', description: 'Unlock Advanced Combat rules: attacker may choose to roll fewer dice after seeing defender\'s count.' },
  { id: 'un-rulebook-p3', name: 'Fortification Network', contentType: 'rule-section', description: 'Unlock Fortification Network: Fortify through any number of connected owned territories.' },
]

export function pickUnlocks(gameNumber: number, count = 2): UnlockOption[] {
  // Seed selection based on game number so it's deterministic per campaign game
  const seeded = [...UNLOCK_POOL].sort((a, b) => {
    const ha = hashStr(a.id + gameNumber)
    const hb = hashStr(b.id + gameNumber)
    return ha - hb
  })
  return seeded.slice(0, count)
}

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0
  return h
}


/** Extra draft troops from cities: +1 per minor city, +2 per major city on owned territories. */
export function cityBonus(playerId: string, territories: Record<string, import('@/types/territory').Territory>): number {
  let bonus = 0
  for (const t of Object.values(territories)) {
    if (t.occupyingPlayerId !== playerId) continue
    for (const city of t.cities) {
      if (city.isDestroyed || city.headquartersFactionId) continue
      bonus += city.isMajor ? 2 : 1
    }
  }
  return bonus
}
