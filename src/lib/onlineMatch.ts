/**
 * Creating and finding the `matches` row that makes a game online.
 *
 * A campaign is not permanently online or offline — each GAME is. Starting a
 * game online creates a match row holding the authoritative board; starting it
 * hotseat creates nothing and touches no network. `LegacyState.activeMatchId`
 * is how every client afterwards knows which of the two it is looking at.
 *
 * The match row is created by the CLIENT, not the edge function: RLS allows an
 * authenticated user to insert a lobby they own (`auth.uid() = created_by`) and
 * to seat players in it while it is still a lobby. From the moment it goes
 * `active`, the edge function's service-role key is the only thing that writes
 * `state`.
 */
import { supabase } from '@/lib/supabase'
import type { GameState } from '@/types/game'
import type { LegacyState } from '@/types/legacy'

export interface SeatSpec {
  /** Turn order, 0-based. */
  seat: number
  /** Roster id — 'p1'..'p5', matching GameState.players[].id. */
  playerId: string
  name: string
  factionId: string
  /** Null for an AI seat. */
  userId?: string | null
  isAI?: boolean
  aiDifficulty?: 'easy' | 'medium' | 'hard' | null
}

export interface CreatedMatch {
  matchId: string
  version: number
}

/**
 * Create the match for a game and start it.
 *
 * Written in one direction on purpose: seats first, then `state` and `active`
 * last. A client that subscribes mid-creation sees a lobby with no board rather
 * than a board with no players — the reverse order would let the edge function
 * accept an action for a match whose roster was still being written, and the
 * "are you a participant" check would refuse the very player whose turn it is.
 */
export async function createOnlineMatch(
  campaignId: string,
  gameNumber: number,
  seats: SeatSpec[],
  initialState: GameState,
): Promise<CreatedMatch> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in to start an online game — the server needs to know whose turn it is.')
  if (seats.length === 0) throw new Error('An online match needs at least one seat')

  const { data: match, error: mErr } = await supabase
    .from('matches')
    .insert({ campaign_id: campaignId, game_number: gameNumber, status: 'lobby', created_by: user.id })
    .select('id, version')
    .single()
  if (mErr || !match) throw new Error(`Could not create the match: ${mErr?.message ?? 'no row returned'}`)

  const matchId = match.id as string

  const { error: sErr } = await supabase.from('match_players').insert(
    seats.map(s => ({
      match_id: matchId,
      seat: s.seat,
      player_id: s.playerId,
      user_id: s.userId ?? null,
      name: s.name,
      faction_id: s.factionId,
      is_ai: !!s.isAI,
      ai_difficulty: s.aiDifficulty ?? null,
    })),
  )
  if (sErr) {
    // A match nobody can act in is worse than no match — leave nothing behind.
    await supabase.from('matches').delete().eq('id', matchId)
    throw new Error(`Could not seat the players: ${sErr.message}`)
  }

  const { data: started, error: aErr } = await supabase
    .from('matches')
    .update({ state: initialState, status: 'active', updated_at: new Date().toISOString() })
    .eq('id', matchId)
    .select('version')
    .single()
  if (aErr || !started) {
    await supabase.from('match_players').delete().eq('match_id', matchId)
    await supabase.from('matches').delete().eq('id', matchId)
    throw new Error(`Could not start the match: ${aErr?.message ?? 'no row returned'}`)
  }

  return { matchId, version: started.version as number }
}

/**
 * The active match for a campaign's current game, if there is one.
 *
 * Used when re-opening a campaign: `activeMatchId` on the saved legacy state is
 * the fast path, and this is the check that it still exists and is still live —
 * a match abandoned on another machine should drop the client back to hotseat
 * rather than leaving it dispatching into nothing.
 */
export async function findActiveMatch(
  campaignId: string,
  gameNumber: number,
): Promise<CreatedMatch | null> {
  const { data, error } = await supabase
    .from('matches')
    .select('id, version, status')
    .eq('campaign_id', campaignId)
    .eq('game_number', gameNumber)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
  if (error || !data || data.length === 0) return null
  return { matchId: data[0].id as string, version: data[0].version as number }
}

/**
 * The match with THIS id, if it is still being played.
 *
 * The campaign names its live match by id, and an id is unique — so this is
 * the honest lookup for "am I meant to be in a game right now". Asking by
 * (campaign, game number) instead is how a machine sat out a game it was
 * seated in: the campaign's game number is bumped by the winner's machine, so
 * a client whose copy is behind searched for the OLD game's number, found the
 * previous match still sitting there un-closed, saw it was not the one legacy
 * named, and reported NOT CONNECTED while the real game ran without it.
 */
export async function findMatchById(matchId: string): Promise<CreatedMatch | null> {
  const { data, error } = await supabase
    .from('matches')
    .select('id, version, status')
    .eq('id', matchId)
    .maybeSingle()
  if (error || !data || data.status !== 'active') return null
  return { matchId: data.id as string, version: data.version as number }
}

/** Which roster seat this signed-in user plays in a match, if any. */
export async function mySeatIn(matchId: string): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('match_players').select('player_id').eq('match_id', matchId).eq('user_id', user.id).maybeSingle()
  return (data?.player_id as string | undefined) ?? null
}

/** Close a match — the game ended, or the table went back to one machine. */
export async function endOnlineMatch(matchId: string, status: 'complete' | 'abandoned'): Promise<void> {
  await supabase.from('matches').update({ status }).eq('id', matchId)
}

/** Seats built from the roster + the seating this game actually uses. */
export function seatsFromGameState(state: GameState, legacy: LegacyState): SeatSpec[] {
  const roster = legacy.roster ?? []
  return state.players.map((p, i) => ({
    seat: i,
    playerId: p.id,
    name: p.name,
    factionId: p.factionId,
    // A roster member linked to an account is the person who may act for that
    // seat; everyone else is an AI or an unclaimed local seat.
    userId: roster.find(m => m.id === p.id)?.userId ?? null,
    isAI: !!p.isAI,
    aiDifficulty: (p.aiDifficulty as SeatSpec['aiDifficulty']) ?? null,
  }))
}
