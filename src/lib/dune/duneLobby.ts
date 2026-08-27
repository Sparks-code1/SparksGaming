/**
 * A Dune lobby: one host makes it, five others may join, everybody picks a
 * faction, and then it is dealt.
 *
 * MOSTLY lib/lobby, WHICH IS GAME-AGNOSTIC. Taking a seat, flipping ready,
 * leaving, reading the room and watching it change are all the same operations
 * for both games — they are rows in match_players, and a seat is a seat. Those
 * are imported rather than reimplemented, because two lobbies would drift the
 * first time either was fixed and the failure would be somebody joining a game
 * that does not think they are in it.
 *
 * WHAT IS ACTUALLY DIFFERENT is three things:
 *
 *   THE TABLE IS SIX, not five. nextFreeSeat and takeSeat take the cap now.
 *
 *   THERE IS NO CAMPAIGN. Risk here is a legacy campaign and a match is game N
 *   of it; Dune is one game, complete in itself, so campaign_id is null and
 *   game_type is what finds these lobbies instead.
 *
 *   EVERY SEAT PICKS A FACTION, and two seats cannot pick the same one. Risk
 *   seats a roster name and assigns factions at setup; in Dune the faction IS
 *   the seat — the whole game is which six powers are at the table — so it is
 *   chosen in the lobby and checked before anything is dealt.
 *
 * AND THE DEAL IS NOT A CLIENT WRITE. Risk's startLobby writes the opening
 * state from the browser. Dune cannot: the deal writes match_secrets and
 * match_decks, which no client may write at all. So starting a Dune game is
 * a START_DUNE action, and the server deals it — see lib/dune/setup.
 */
import { supabase } from '@/lib/supabase'
import { readLobby, takeSeat, setReady, leaveLobby, subscribeLobby, UNASSIGNED_FACTION } from '@/lib/lobby'
import type { Lobby, LobbySeat } from '@/lib/lobby'
import { dispatchDuneAction } from '@/lib/dune/duneDispatch'
import { FACTION_IDS } from '@/data/dune/factions'
import type { FactionId } from '@/types/Dune/Faction'
import type { GameMode } from '@/types/Dune/Game'

/** Dune is played by two to six. Six is the whole game; two is a duel. */
export const DUNE_MIN_SEATS = 2
export const DUNE_MAX_SEATS = 6

export type { Lobby as DuneLobby, LobbySeat as DuneLobbySeat }

/**
 * Whether this faction may be taken, or why not.
 *
 * THE FACTION IS THE SEAT. Two Atreides is not a variant, it is a game with two
 * of the same rules card, two prescience powers and one set of leaders between
 * them — so this is checked in the lobby rather than at the deal, where the
 * refusal would come after everybody had committed.
 */
export function factionRefusal(
  seats: readonly Pick<LobbySeat, 'userId' | 'factionId'>[],
  faction: string,
  userId: string,
): string | null {
  if (!FACTION_IDS.includes(faction as FactionId)) return 'There is no such faction'
  const taken = seats.find(s => s.factionId === faction && s.userId !== userId)
  return taken ? 'Somebody has already taken that faction' : null
}

/** The factions nobody at this table has taken. */
export function freeFactions(
  seats: readonly Pick<LobbySeat, 'userId' | 'factionId'>[], userId?: string | null,
): FactionId[] {
  const taken = new Set(seats
    .filter(s => !userId || s.userId !== userId)
    .map(s => s.factionId))
  return FACTION_IDS.filter(f => !taken.has(f))
}

export interface DuneReadiness {
  seated: number
  ready: number
  /** Seats that have not chosen a faction yet. */
  unchosen: string[]
  canStart: boolean
  /** Why Start is refused, or null when it is not. */
  reason: string | null
}

/**
 * Everything the Start button needs, derived rather than tracked.
 *
 * ONE FUNCTION, so the host's button and everybody else's status line cannot
 * disagree — a joiner told "waiting for the host" while the host is told
 * "waiting for a player" is a standoff with no way out from either screen.
 */
export function duneReadiness(lobby: Pick<Lobby, 'seats'>): DuneReadiness {
  const seats = lobby.seats.filter(s => !s.isAI)
  const ready = seats.filter(s => s.ready).length
  const unchosen = seats
    .filter(s => !FACTION_IDS.includes(s.factionId as FactionId))
    .map(s => s.name)

  const reason =
    seats.length < DUNE_MIN_SEATS
      ? `Waiting for ${DUNE_MIN_SEATS - seats.length} more player${DUNE_MIN_SEATS - seats.length === 1 ? '' : 's'}`
      : unchosen.length > 0
        ? `Waiting for ${unchosen.join(', ')} to pick a faction`
        : ready < seats.length
          ? `Waiting for ${seats.length - ready} player${seats.length - ready === 1 ? '' : 's'} to be ready`
          : null

  return { seated: seats.length, ready, unchosen, canStart: reason === null, reason }
}

/** Open Dune lobbies, newest first. */
export async function openDuneLobbies(): Promise<Lobby[]> {
  // BY GAME TYPE, which is what makes a Dune lobby findable without a campaign
  // to look it up under. The read policy on matches already limits this to
  // rows with status 'lobby' for a signed-in caller.
  const { data, error } = await supabase
    .from('matches')
    .select('id')
    .eq('game_type', 'dune')
    .eq('status', 'lobby')
    .order('created_at', { ascending: false })
    .limit(20)
  if (error || !data) return []
  const lobbies = await Promise.all(data.map(r => readLobby(r.id as string)))
  return lobbies.filter((l): l is Lobby => l !== null)
}

/**
 * Open a table, and sit down at it.
 *
 * The host's own seat is created here rather than left to a later join,
 * because a lobby with nobody in it is indistinguishable from one whose host
 * has left — and the difference decides whether anybody else should wait.
 */
export async function createDuneLobby(input: {
  name: string
  playerId: string
  faction: FactionId
  /** How many humans the host is waiting for, including themselves. */
  seats: number
}): Promise<Lobby> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in to host a game — the server identifies players by account.')
  if (input.seats < DUNE_MIN_SEATS || input.seats > DUNE_MAX_SEATS) {
    throw new Error(`A Dune game seats ${DUNE_MIN_SEATS} to ${DUNE_MAX_SEATS}`)
  }
  if (!FACTION_IDS.includes(input.faction)) throw new Error('There is no such faction')

  const { data: match, error } = await supabase
    .from('matches')
    .insert({
      // NO CAMPAIGN. Dune is one game rather than game N of a legacy campaign —
      // see the migration that made this column nullable.
      campaign_id: null,
      game_number: 1,
      status: 'lobby',
      created_by: user.id,
      human_slots: input.seats,
      game_type: 'dune',
    })
    .select('id')
    .single()
  if (error || !match) throw new Error(`Could not open the table: ${error?.message ?? 'no row returned'}`)

  const { error: sErr } = await supabase.from('match_players').insert({
    match_id: match.id, seat: 0, player_id: input.playerId, user_id: user.id,
    name: input.name, faction_id: input.faction,
    is_ai: false, ai_difficulty: null, ready: false,
  })
  if (sErr) {
    // A lobby nobody can act in is worse than no lobby — leave nothing behind.
    await supabase.from('matches').delete().eq('id', match.id)
    throw new Error(`Could not seat you: ${sErr.message}`)
  }
  return (await readLobby(match.id as string))!
}

/**
 * Sit down at somebody else's table.
 *
 * The seat itself is lib/lobby's — same rows, same rules about who may take
 * one. What is added is the faction, checked before the seat is made so a
 * player is never seated as a duplicate and then told to move.
 */
export async function joinDuneLobby(
  matchId: string, request: { name: string; playerId: string; faction: FactionId },
): Promise<Lobby> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in to join a game — the server identifies players by account.')
  const lobby = await readLobby(matchId)
  if (!lobby) throw new Error('That game is no longer open')

  const clash = factionRefusal(lobby.seats, request.faction, user.id)
  if (clash) throw new Error(clash)

  return takeSeat(
    matchId,
    { playerId: request.playerId, name: request.name, factionId: request.faction },
    DUNE_MAX_SEATS,
  )
}

/** Change which faction you are playing, while the game is still a lobby. */
export async function chooseFaction(matchId: string, faction: FactionId): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in first')
  const lobby = await readLobby(matchId)
  if (!lobby) throw new Error('That game is no longer open')
  if (lobby.status !== 'lobby') throw new Error('That game has already started')

  const clash = factionRefusal(lobby.seats, faction, user.id)
  if (clash) throw new Error(clash)

  // Your own row and nobody else's — the policy says so, and so does this.
  const { error } = await supabase.from('match_players')
    .update({ faction_id: faction })
    .eq('match_id', matchId)
    .eq('user_id', user.id)
  if (error) throw new Error(`Could not take that faction: ${error.message}`)
}

/**
 * Deal the game.
 *
 * NOT A CLIENT WRITE, unlike Risk's startLobby. The opening position writes
 * match_secrets and match_decks, and no client may write either — so this asks
 * the server to deal, and the server is what flips the match out of the lobby.
 *
 * Anybody seated may press it. There is no host privilege in the match state
 * and inventing one here would be a rule the server does not enforce.
 */
export async function startDuneMatch(
  matchId: string, mode: GameMode = 'advanced',
): Promise<void> {
  const res = await dispatchDuneAction(matchId, { type: 'START_DUNE', mode })
  if (!res.ok) {
    throw new Error(res.error?.message ?? 'The server would not deal this game')
  }
}

// Re-exported so a screen needs one import for the lobby it is drawing, and so
// the reuse is visible at the point of use rather than buried in this file.
export { readLobby as readDuneLobby, setReady as setDuneReady }
export { leaveLobby as leaveDuneLobby, subscribeLobby as subscribeDuneLobby }
export { UNASSIGNED_FACTION }
