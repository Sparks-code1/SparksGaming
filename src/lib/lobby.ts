/**
 * The lobby: one host, however many joiners, everybody ready, then start.
 *
 * Before this, each machine ran its own setup screen and each created its own
 * match — so two people "starting the same game" produced two different games
 * that knew nothing about each other. A lobby makes the game a single object
 * that exists before anyone is playing: the host makes it, others join it, and
 * exactly one Start button turns it into a board.
 *
 * Seats live in `match_players` and are the authority on who is in. AI seats are
 * real rows from the moment the lobby is created — they need no one to arrive,
 * so they are born ready. Human seats are rows that do not exist yet, which is
 * why `matches.human_slots` records how many the host is waiting for.
 */
import { supabase } from '@/lib/supabase'
import type { GameState } from '@/types/game'
import type { AIDifficulty } from '@/types/ai'
import type { RosterMember } from '@/types/legacy'
import type { SetupDoc, SetupChoice } from '@/lib/setupFlow'
import { nextRosterId } from '@/lib/roster'

export const UNASSIGNED_FACTION = 'unassigned'

export interface LobbySeat {
  seat: number
  playerId: string
  userId: string | null
  name: string
  factionId: string
  isAI: boolean
  aiDifficulty: AIDifficulty | null
  ready: boolean
  /** This player's pending setup declaration — their roll, their pick. */
  choice: SetupChoice | null
}

export interface Lobby {
  matchId: string
  campaignId: string
  gameNumber: number
  status: 'lobby' | 'active' | 'complete' | 'abandoned'
  humanSlots: number
  createdBy: string | null
  seats: LobbySeat[]
  /** The synchronized setup document, once the host has begun setup. */
  setup: SetupDoc | null
}

export interface SeatRequest {
  playerId: string
  name: string
  factionId?: string
  difficulty?: AIDifficulty
}

/** Fewest / most seats a game can be played with. */
export const MIN_SEATS = 2
export const MAX_SEATS = 5

// ─── The pure part: is this lobby startable? ─────────────────────────────────

export interface LobbyReadiness {
  humansSeated: number
  humansExpected: number
  humansReady: number
  /** Human seats still to be filled. */
  waitingFor: number
  aiSeats: number
  totalSeats: number
  everyoneReady: boolean
  canStart: boolean
  /** Why Start is refused, or null when it is not. */
  reason: string | null
}

/**
 * Everything the Start button needs, derived rather than tracked.
 *
 * Deliberately one function so the host's button and the joiners' status line
 * cannot disagree about whether the game is ready — a joiner being told "waiting
 * for the host" while the host is told "waiting for a player" is the kind of
 * standoff that has no way out from either screen.
 */
export function lobbyReadiness(lobby: Pick<Lobby, 'humanSlots' | 'seats'>): LobbyReadiness {
  const humans = lobby.seats.filter(s => !s.isAI)
  const ai = lobby.seats.filter(s => s.isAI)
  const humansReady = humans.filter(s => s.ready).length
  const totalSeats = lobby.humanSlots + ai.length
  const waitingFor = Math.max(0, lobby.humanSlots - humans.length)
  const everyoneReady = humans.length > 0 && humansReady === humans.length

  let reason: string | null = null
  if (totalSeats < MIN_SEATS) reason = `A game needs at least ${MIN_SEATS} players`
  else if (totalSeats > MAX_SEATS) reason = `A game holds at most ${MAX_SEATS} players`
  else if (humans.length > lobby.humanSlots) reason = 'More players have joined than there are seats'
  else if (waitingFor > 0) {
    reason = `Waiting for ${waitingFor} more player${waitingFor === 1 ? '' : 's'} to join`
  } else if (!everyoneReady) {
    const notReady = humans.filter(s => !s.ready).map(s => s.name)
    reason = `Waiting for ${notReady.join(', ')} to be ready`
  }

  return {
    humansSeated: humans.length,
    humansExpected: lobby.humanSlots,
    humansReady,
    waitingFor,
    aiSeats: ai.length,
    totalSeats,
    everyoneReady,
    canStart: reason === null,
    reason,
  }
}

// ─── Turning lobby seats into permanent identities ───────────────────────────

export interface SeatResolution {
  seat: number
  /** The roster id this seat will play as. */
  playerId: string
  name: string
  isAI: boolean
  aiDifficulty: AIDifficulty | null
  userId: string | null
}

export interface Reconciliation {
  ok: boolean
  reason?: string
  /** Every seat, resolved to a real roster id, in seat order. */
  resolved: SeatResolution[]
  /** AI names that are not on the roster yet — add these, in this order. */
  aiToAdd: Array<{ name: string; difficulty: AIDifficulty | null }>
}

/**
 * Resolve every lobby seat to a campaign roster identity.
 *
 * People name THEMSELVES now — the host no longer types the table in — so the
 * lobby can hold seats the roster has never heard of. This runs on the host's
 * machine at Start, against a FRESH roster read, and decides:
 *
 *   humans — matched by account. Joiners write themselves onto the roster the
 *     moment they take a seat, so a miss here means something actually broke
 *     (a save that never landed), and the honest move is to refuse with the
 *     player's name rather than invent an identity for them.
 *
 *   AI — matched by name, case-insensitively, so typing "Hard" deliberately
 *     brings back the campaign's existing Hard with all its history. Anything
 *     unmatched is queued for creation; ids are simulated with the same
 *     `nextRosterId` the real addition uses, so what this predicts is what
 *     `addRosterMember` will hand out.
 *
 * Pure — the caller does the writing — which is what makes it testable and
 * what keeps the ordering visible: additions MUST be applied in `aiToAdd`
 * order or the simulated ids are lies.
 */
export function reconcileSeats(
  seats: Pick<LobbySeat, 'seat' | 'name' | 'userId' | 'isAI' | 'aiDifficulty'>[],
  roster: RosterMember[],
): Reconciliation {
  const resolved: SeatResolution[] = []
  const aiToAdd: Reconciliation['aiToAdd'] = []
  // Simulated future roster: grows as AI additions are planned, so two new AI
  // get two different ids and a later name-match can hit an earlier addition.
  const future: { id: string; name: string }[] = roster.map(m => ({ id: m.id, name: m.name }))

  for (const s of [...seats].sort((a, b) => a.seat - b.seat)) {
    if (!s.isAI) {
      const member = roster.find(m => m.userId && m.userId === s.userId)
      if (!member) {
        return {
          ok: false, resolved: [], aiToAdd: [],
          reason: `${s.name} is not on the campaign roster — ask them to leave and rejoin`,
        }
      }
      resolved.push({
        seat: s.seat, playerId: member.id, name: member.name,
        isAI: false, aiDifficulty: null, userId: s.userId,
      })
      continue
    }

    const wanted = s.name.trim()
    const existing = future.find(m => m.name.toLowerCase() === wanted.toLowerCase())
    if (existing) {
      resolved.push({
        seat: s.seat, playerId: existing.id, name: existing.name,
        isAI: true, aiDifficulty: s.aiDifficulty, userId: null,
      })
      continue
    }
    const id = nextRosterId(future)
    if (!id) {
      return {
        ok: false, resolved: [], aiToAdd: [],
        reason: `The campaign roster is full — rename ${wanted} to an existing player instead`,
      }
    }
    future.push({ id, name: wanted })
    aiToAdd.push({ name: wanted, difficulty: s.aiDifficulty })
    resolved.push({
      seat: s.seat, playerId: id, name: wanted,
      isAI: true, aiDifficulty: s.aiDifficulty, userId: null,
    })
  }

  // Two seats resolving to one identity would let a person play twice.
  const ids = resolved.map(r => r.playerId)
  if (new Set(ids).size !== ids.length) {
    return { ok: false, resolved: [], aiToAdd: [], reason: 'Two seats resolved to the same player' }
  }
  return { ok: true, resolved, aiToAdd }
}

/** The lowest seat number nobody is using. */
export function nextFreeSeat(seats: Pick<LobbySeat, 'seat'>[]): number {
  const taken = new Set(seats.map(s => s.seat))
  for (let i = 0; i < MAX_SEATS; i++) if (!taken.has(i)) return i
  return MAX_SEATS
}

/** Why this person cannot take this roster name in this lobby, or null. */
export function seatRefusal(
  seats: Pick<LobbySeat, 'playerId' | 'userId' | 'isAI'>[],
  playerId: string,
  userId: string,
  humanSlots: number,
): string | null {
  const mine = seats.find(s => s.userId === userId)
  if (mine && mine.playerId !== playerId) {
    return `You are already in this game as ${mine.playerId}`
  }
  const taken = seats.find(s => s.playerId === playerId && s.userId !== userId)
  if (taken) return 'Somebody has already taken that name in this game'
  const humans = seats.filter(s => !s.isAI && s.userId !== userId)
  if (!mine && humans.length >= humanSlots) return 'This game is full'
  return null
}

// ─── Talking to the database ─────────────────────────────────────────────────

function toSeat(row: Record<string, unknown>): LobbySeat {
  return {
    seat: row.seat as number,
    playerId: row.player_id as string,
    userId: (row.user_id as string | null) ?? null,
    name: row.name as string,
    factionId: (row.faction_id as string) ?? UNASSIGNED_FACTION,
    isAI: !!row.is_ai,
    aiDifficulty: (row.ai_difficulty as AIDifficulty | null) ?? null,
    ready: !!row.ready,
    choice: (row.choice as SetupChoice | null) ?? null,
  }
}

/**
 * Create the lobby and seat the host and any AI in it.
 *
 * The host's own seat is inserted here rather than left to a later "join",
 * because a lobby with nobody in it is indistinguishable from one whose host
 * has left — and the difference decides whether anyone else should wait.
 */
export async function createLobby(
  campaignId: string,
  gameNumber: number,
  host: SeatRequest,
  humanSlots: number,
  ais: SeatRequest[] = [],
): Promise<Lobby> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in to host a game — the server identifies players by account.')
  if (humanSlots < 1) throw new Error('A hosted game needs at least one human seat')
  if (humanSlots + ais.length > MAX_SEATS) throw new Error(`A game holds at most ${MAX_SEATS} players`)
  if (humanSlots + ais.length < MIN_SEATS) throw new Error(`A game needs at least ${MIN_SEATS} players`)

  const { data: match, error: mErr } = await supabase
    .from('matches')
    .insert({
      campaign_id: campaignId, game_number: gameNumber,
      status: 'lobby', created_by: user.id, human_slots: humanSlots,
    })
    .select('id, campaign_id, game_number, status, human_slots, created_by')
    .single()
  if (mErr || !match) throw new Error(`Could not open the lobby: ${mErr?.message ?? 'no row returned'}`)
  const matchId = match.id as string

  // The host is ready by definition — they are the one pressing Start.
  const rows = [
    {
      match_id: matchId, seat: 0, player_id: host.playerId, user_id: user.id,
      name: host.name, faction_id: host.factionId ?? UNASSIGNED_FACTION,
      is_ai: false, ai_difficulty: null, ready: true,
    },
    ...ais.map((a, i) => ({
      match_id: matchId, seat: humanSlots + i, player_id: a.playerId, user_id: null,
      name: a.name, faction_id: a.factionId ?? UNASSIGNED_FACTION,
      is_ai: true, ai_difficulty: a.difficulty ?? 'medium', ready: true,
    })),
  ]
  const { error: sErr } = await supabase.from('match_players').insert(rows)
  if (sErr) {
    // A lobby nobody can act in is worse than no lobby — leave nothing behind.
    await supabase.from('matches').delete().eq('id', matchId)
    throw new Error(`Could not seat the players: ${sErr.message}`)
  }

  return (await readLobby(matchId))!
}

export async function readLobby(matchId: string): Promise<Lobby | null> {
  const { data: match, error } = await supabase
    .from('matches')
    .select('id, campaign_id, game_number, status, human_slots, created_by, setup')
    .eq('id', matchId)
    .maybeSingle()
  if (error || !match) return null
  const { data: seats } = await supabase
    .from('match_players')
    .select('seat, player_id, user_id, name, faction_id, is_ai, ai_difficulty, ready, choice')
    .eq('match_id', matchId)
    .order('seat')
  return {
    matchId: match.id as string,
    campaignId: match.campaign_id as string,
    gameNumber: match.game_number as number,
    status: match.status as Lobby['status'],
    humanSlots: (match.human_slots as number) ?? 0,
    createdBy: (match.created_by as string | null) ?? null,
    seats: (seats ?? []).map(r => toSeat(r as Record<string, unknown>)),
    setup: (match.setup as SetupDoc | null) ?? null,
  }
}

// ─── Setup sync ──────────────────────────────────────────────────────────────

/**
 * Publish the setup document. Host only — RLS scopes the write to the lobby's
 * creator while it is still a lobby, which is the whole of setup: the board is
 * only handed over (and the status flipped) after setup completes.
 */
export async function publishSetup(matchId: string, setup: SetupDoc): Promise<void> {
  const { data, error } = await supabase
    .from('matches')
    .update({ setup, updated_at: new Date().toISOString() })
    .eq('id', matchId)
    .eq('status', 'lobby')
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`Could not publish setup: ${error.message}`)
  if (!data) throw new Error('Setup could not be published — the game may have started or been cancelled')
}

/** Declare my roll or my pick — written to my own seat row, host validates. */
export async function submitChoice(matchId: string, choice: SetupChoice): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in first')
  const { error } = await supabase
    .from('match_players')
    .update({ choice })
    .eq('match_id', matchId)
    .eq('user_id', user.id)
  if (error) throw new Error(`Could not submit your choice: ${error.message}`)
}

/**
 * The board a started match is holding, for a client that did not build it.
 *
 * A joiner never runs setup — they receive the finished game. `version` comes
 * back with it so their first action is dispatched against the right one rather
 * than being rejected as stale on arrival.
 */
export async function matchState(
  matchId: string,
): Promise<{ state: GameState; version: number } | null> {
  const { data } = await supabase
    .from('matches').select('state, version').eq('id', matchId).maybeSingle()
  if (!data?.state) return null
  return { state: data.state as GameState, version: (data.version as number) ?? 0 }
}

/** The lobby waiting for players in this campaign's current game, if any. */
/**
 * The open lobby in this campaign, if someone is hosting one.
 *
 * `gameNumber` is a FILTER, not a requirement — pass it only when the caller
 * genuinely means one specific game. Matching on it by default was how a
 * joiner missed the game they were invited to: the campaign's game number is
 * bumped by the WINNER's machine at the end of a game, and legacy has no live
 * sync, so every other machine still held the previous number and searched
 * for a lobby that would never exist. A campaign has at most one open lobby,
 * so "the open one" is the honest question.
 */
export async function findOpenLobby(campaignId: string, gameNumber?: number): Promise<Lobby | null> {
  let q = supabase
    .from('matches')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('status', 'lobby')
  if (typeof gameNumber === 'number') q = q.eq('game_number', gameNumber)
  const { data } = await q.order('created_at', { ascending: false }).limit(1)
  const id = (data ?? [])[0]?.id as string | undefined
  return id ? readLobby(id) : null
}

/**
 * Is this open lobby for a game the campaign has already left behind?
 *
 * The counterpart to findOpenLobby's refusal to filter by game number. That
 * refusal is right — a machine's own copy LAGS the campaign (the winner's
 * machine bumps it, and legacy has no live sync), so requiring an exact match
 * hid the lobby a joiner was invited to. But the lag only runs one way, which
 * makes the other direction safe to judge: a lobby numbered BELOW our own copy
 * is one we know has already been played.
 *
 * A lobby row left open by a game that was started some other way sat in the
 * Test8 campaign for three games, and both machines walked into it — the host
 * saw "hosting Game #1" and the joiner "waiting to start #1" on a campaign
 * about to play its fourth.
 */
export function lobbyIsBehind(
  lobby: { gameNumber?: number } | null | undefined,
  currentGameNumber: number | null | undefined,
): boolean {
  if (!lobby || typeof lobby.gameNumber !== 'number') return false
  return lobby.gameNumber < (currentGameNumber ?? 1)
}

/** Take a seat in someone else's lobby. Idempotent for the seat you hold. */
export async function takeSeat(matchId: string, request: SeatRequest): Promise<Lobby> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in to join a game — the server identifies players by account.')

  const lobby = await readLobby(matchId)
  if (!lobby) throw new Error('That game is no longer open')
  if (lobby.status !== 'lobby') throw new Error('That game has already started')

  const refusal = seatRefusal(lobby.seats, request.playerId, user.id, lobby.humanSlots)
  if (refusal) throw new Error(refusal)

  const mine = lobby.seats.find(s => s.userId === user.id)
  if (mine) {
    // Already seated: this is a rename, not a second seat.
    const { error } = await supabase.from('match_players')
      .update({ name: request.name }).eq('match_id', matchId).eq('seat', mine.seat)
    if (error) throw new Error(`Could not update your seat: ${error.message}`)
  } else {
    const { error } = await supabase.from('match_players').insert({
      match_id: matchId, seat: nextFreeSeat(lobby.seats), player_id: request.playerId,
      user_id: user.id, name: request.name,
      faction_id: request.factionId ?? UNASSIGNED_FACTION,
      is_ai: false, ai_difficulty: null, ready: false,
    })
    if (error) throw new Error(`Could not join that game: ${error.message}`)
  }
  return (await readLobby(matchId))!
}

/** Flip your own ready flag. */
export async function setReady(matchId: string, ready: boolean): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in first')
  const { error } = await supabase.from('match_players')
    .update({ ready }).eq('match_id', matchId).eq('user_id', user.id)
  if (error) throw new Error(`Could not update ready: ${error.message}`)
}

/** Give up your seat. The host leaving abandons the lobby entirely. */
export async function leaveLobby(matchId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const lobby = await readLobby(matchId)
  if (lobby?.createdBy === user.id) {
    await supabase.from('matches').update({ status: 'abandoned' }).eq('id', matchId)
    return
  }
  await supabase.from('match_players').delete().eq('match_id', matchId).eq('user_id', user.id)
}

/**
 * Start the game. Host only, and only from a lobby that is actually ready.
 *
 * Writing `state` and `status` together is what makes exactly one game come out
 * of one lobby: a second press finds the match no longer in 'lobby' status, and
 * RLS refuses it. That is the fix for two machines each starting their own.
 */
export async function startLobby(matchId: string, initialState: GameState): Promise<Lobby> {
  const lobby = await readLobby(matchId)
  if (!lobby) throw new Error('That game is no longer open')
  if (lobby.status !== 'lobby') throw new Error('That game has already started')
  const readiness = lobbyReadiness(lobby)
  if (!readiness.canStart) throw new Error(readiness.reason ?? 'The game is not ready to start')

  const { data, error } = await supabase
    .from('matches')
    .update({ state: initialState, status: 'active', updated_at: new Date().toISOString() })
    .eq('id', matchId)
    .eq('status', 'lobby')          // compare-and-swap: only one press wins
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`Could not start the game: ${error.message}`)
  if (!data) throw new Error('Somebody else already started this game')
  return (await readLobby(matchId))!
}

/** Update how many humans the host is waiting for, and reseat the AI. */
export async function setLobbyShape(
  matchId: string,
  humanSlots: number,
  ais: SeatRequest[],
): Promise<Lobby> {
  if (humanSlots + ais.length > MAX_SEATS) throw new Error(`A game holds at most ${MAX_SEATS} players`)
  const { error: mErr } = await supabase
    .from('matches').update({ human_slots: humanSlots }).eq('id', matchId).eq('status', 'lobby')
  if (mErr) throw new Error(`Could not resize the game: ${mErr.message}`)

  // AI seats are rebuilt wholesale rather than diffed — there are at most four
  // and nothing about them is worth preserving across a change.
  await supabase.from('match_players').delete().eq('match_id', matchId).eq('is_ai', true)
  if (ais.length > 0) {
    const { error } = await supabase.from('match_players').insert(ais.map((a, i) => ({
      match_id: matchId, seat: humanSlots + i, player_id: a.playerId, user_id: null,
      name: a.name, faction_id: a.factionId ?? UNASSIGNED_FACTION,
      is_ai: true, ai_difficulty: a.difficulty ?? 'medium', ready: true,
    })))
    if (error) throw new Error(`Could not seat the computer players: ${error.message}`)
  }
  return (await readLobby(matchId))!
}

/**
 * Watch a lobby: seats arriving, ready flags flipping, and the start itself.
 *
 * Returns an unsubscribe. Both tables are watched because the two halves live
 * apart — who is in it is `match_players`, whether it has begun is `matches`.
 */
export function subscribeLobby(matchId: string, onChange: (lobby: Lobby | null) => void): () => void {
  let stopped = false
  const refresh = async () => {
    const lobby = await readLobby(matchId)
    if (!stopped) onChange(lobby)
  }
  // Give the realtime socket the caller's JWT — RLS filters events per
  // subscriber, and a socket authenticated before the session finished
  // restoring receives nothing, silently. The poll below already bounded the
  // damage here (which is why lobby sync always FELT live); this makes the
  // push path actually push too.
  void supabase.auth.getSession()
    .then(({ data }) => {
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token)
    })
    .catch(() => {})
  // A channel NAME is a handle: asking for one that already exists returns the
  // existing channel, and adding handlers to an already-subscribed channel
  // throws. Two lobby screens, or one remounted — which React does routinely —
  // would take the whole component down. Unique per subscription, so it cannot.
  const channel = supabase
    .channel(`lobby:${matchId}:${Math.random().toString(36).slice(2, 10)}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'match_players', filter: `match_id=eq.${matchId}` },
      () => { void refresh() })
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
      () => { void refresh() })
    .subscribe(status => { if (status === 'SUBSCRIBED') void refresh() })

  // Realtime can drop a message; a slow poll means a lobby never sits wrong for
  // more than a few seconds, which matters when people are staring at it.
  const poll = setInterval(() => { void refresh() }, 5000)

  return () => {
    stopped = true
    clearInterval(poll)
    void supabase.removeChannel(channel)
  }
}
