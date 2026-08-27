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
 *   of it; Dune is one game, complete in itself, so campaign_id is null — and
 *   a SHARE CODE takes the campaign code's place as the thing that gets you in.
 *
 *   That code is a real gate rather than a filter. Dune lobbies are invisible
 *   unless you are already at them, and joining goes through join_dune_lobby,
 *   which is SECURITY DEFINER and treats the code as the credential — see the
 *   migration. Anything the browser filters, the browser could have not
 *   filtered, and this screen listed every open table on the deployment to
 *   every signed-in account until it did not.
 *
 *   EVERY SEAT PICKS A FACTION, and two seats cannot pick the same one. Risk
 *   seats a roster name and assigns factions at setup; in Dune the faction IS
 *   the seat — the whole game is which six powers are at the table — so it is
 *   chosen in the lobby and checked before anything is dealt.
 *
 *   AFTER SITTING DOWN, NOT BEFORE. Choosing first meant choosing blind: a
 *   Dune lobby is invisible until you are seated, so a joiner could not see
 *   that somebody already held the Atreides and was simply refused, with no
 *   way to find out what was left. You take a seat holding nothing and choose
 *   at the table, where what is taken is in front of you.
 *
 *   THE TABLE AGREES ITS OWN GAME. Basic and advanced are different games —
 *   a different storm die, the Kwisatz Haderach, Sardaukar, Fedaykin, the
 *   Bene Gesserit's advisor — and it used to be settled by whoever pressed
 *   Start, out of a default nobody was shown. It is on the row now, so
 *   everybody is looking at the same answer before it is dealt.
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

/**
 * How long a share code is.
 *
 * Six characters from an alphabet with no O/0 or I/1 in it: this is read down
 * a phone and typed by somebody who did not write it, and the two pairs people
 * confuse are worth more than the handful of combinations they cost. 32^6 is
 * about a billion, against however many tables are open at once.
 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 6

export function newJoinCode(random: () => number = Math.random): string {
  let out = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]
  }
  return out
}

/** Codes are typed by hand, so they are compared the way they are read. */
export const normaliseCode = (code: string): string =>
  code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')

export type { Lobby as DuneLobby, LobbySeat as DuneLobbySeat }

/**
 * A lobby, plus the code that gets somebody into it.
 *
 * SEPARATE FROM Lobby, deliberately. readLobby is Risk's too, and adding
 * join_code to its select would mean a database without the column returning an
 * error for every lobby read in BOTH games — the whole screen gone, for a
 * decoration. Kept beside it, a missing column costs the code and nothing else.
 */
export type DuneTable = Lobby & { joinCode: string | null }

/**
 * The share code for one table, or null.
 *
 * Null covers three different things on purpose — no code, no such match, and a
 * server that has not run the migration — because the screen does the same
 * thing with all three: it does not show a code it does not have.
 */
export async function duneJoinCode(matchId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('matches').select('join_code').eq('id', matchId).maybeSingle()
  if (error || !data) return null
  return (data.join_code as string | null) ?? null
}

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

/**
 * A faction nobody at this table has taken, or null when they all are.
 *
 * FOR THE PLAYER WHO DOES NOT MIND. Six factions play very differently and
 * picking one is most of the decision a new player has no basis for making;
 * this is the honest way out of it.
 *
 * IT CANNOT COLLIDE, because it only ever draws from what is free — the same
 * list the chips grey out. Two people pressing it in the same second can still
 * land on the same faction, which is what the server check is for; this makes
 * that rare rather than impossible, and rare is all a convenience owes.
 */
export function randomFreeFaction(
  seats: readonly Pick<LobbySeat, 'userId' | 'factionId'>[],
  userId: string,
  random: () => number = Math.random,
): FactionId | null {
  const free = freeFactions(seats, userId)
  if (free.length === 0) return null
  return free[Math.floor(random() * free.length)]
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

/**
 * The Dune tables this account can get back to.
 *
 * NOT A LIST OF WHAT IS OPEN. It used to be exactly that, and it was wrong: the
 * select policy shows an open lobby to every signed-in account, so the screen
 * offered strangers' tables to strangers. The policy is narrowed now — a Dune
 * lobby is visible only to whoever opened it and whoever is sitting at it — so
 * the same query returns YOUR tables and nothing else.
 *
 * Which is still worth having. Somebody who closed the tab needs a way back in
 * that is not "ask a friend to read you your own code".
 */
export async function myDuneLobbies(): Promise<DuneTable[]> {
  // TABLES AND GAMES BOTH. A lobby is one you have not started; an ACTIVE match
  // is one you walked away from, and leaving a game you cannot get back into is
  // worse than having no way to leave at all. The select policy shows a lobby
  // only to people at it and an active match only to its players, so this is
  // exactly the list of Dune this account is part of.
  const { data, error } = await supabase
    .from('matches')
    .select('id, status')
    .eq('game_type', 'dune')
    .in('status', ['lobby', 'active'])
    .order('created_at', { ascending: false })
    .limit(20)
  if (error || !data) return []
  const ids = data.map(r => r.id as string)

  // THE CODES IN THEIR OWN QUERY, tolerated separately. A server without the
  // column still lists the tables; it just cannot label them.
  const codes = new Map<string, string | null>()
  const withCodes = await supabase.from('matches').select('id, join_code').in('id', ids)
  for (const r of withCodes.data ?? []) codes.set(r.id as string, (r.join_code as string | null) ?? null)

  const lobbies = await Promise.all(ids.map(id => readLobby(id)))
  return lobbies
    .map((l, i) => (l ? { ...l, joinCode: codes.get(ids[i]) ?? null } : null))
    .filter((l): l is DuneTable => l !== null)
}

/**
 * Sit down at a table you have been given the code for.
 *
 * THROUGH THE SERVER, because the row is not readable until you are in it. The
 * function checks the code, the room, the seat count and the faction, and seats
 * you — everything this module would otherwise have had to read first.
 *
 * IT DOES NOT SAY WHICH REFUSAL IT IS. A wrong code, a full table and a taken
 * faction all come back the same, because telling somebody guessing codes that
 * they have found a real table is most of what a code is meant to prevent. The
 * one exception is the faction, which the screen checks first for the ordinary
 * case where you can see the table because you are already at it.
 */
export async function joinDuneByCode(
  code: string, request: { name: string },
): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in to join a game — the server identifies players by account.')
  const tidy = normaliseCode(code)
  if (tidy.length !== CODE_LENGTH) throw new Error(`A code is ${CODE_LENGTH} characters`)

  // NO FACTION. You sit down holding nothing and choose at the table, where
  // you can finally see what is taken — see the note at the top of this file.
  const { data, error } = await supabase.rpc('join_dune_lobby', {
    p_code: tidy,
    p_name: request.name,
    p_faction: null,
  })
  if (error) {
    // A DATABASE WITHOUT THE MIGRATION says so plainly rather than as a wrong
    // code — the same courtesy campaigns.join_code already gets.
    if (/join_dune_lobby|function .* does not exist/i.test(error.message)) {
      throw new Error('This server has not been migrated for share codes yet')
    }
    throw new Error(`Could not join that table: ${error.message}`)
  }
  if (!data) throw new Error('No open table has that code, or it is full')
  return data as string
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
  /** How many humans the host is waiting for, including themselves. */
  seats: number
  /** Which game the table is playing. Everybody sees it before it is dealt. */
  mode?: GameMode
}): Promise<Lobby> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in to host a game — the server identifies players by account.')
  if (input.seats < DUNE_MIN_SEATS || input.seats > DUNE_MAX_SEATS) {
    throw new Error(`A Dune game seats ${DUNE_MIN_SEATS} to ${DUNE_MAX_SEATS}`)
  }
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
      // AGREED BEFORE IT IS DEALT, and changeable while the table is open.
      // START_DUNE reads it off the row, so the deal is the game everybody was
      // looking at rather than the one whoever pressed Start had in mind.
      game_mode: input.mode ?? 'advanced',
      // THE THING THAT GETS SOMEBODY ELSE IN. Minted here rather than by the
      // database so it can be shown the moment the table exists, and so a
      // server without the column fails loudly at creation rather than quietly
      // making a table nobody can reach.
      join_code: newJoinCode(),
    })
    .select('id, join_code')
    .single()
  if (error || !match) throw new Error(`Could not open the table: ${error?.message ?? 'no row returned'}`)

  const { error: sErr } = await supabase.from('match_players').insert({
    match_id: match.id, seat: 0, player_id: input.playerId, user_id: user.id,
    // THE HOST CHOOSES AT THE TABLE TOO. Opening one is not a reason to pick
    // blind, and it keeps one rule about when a faction is chosen rather than
    // two that will disagree.
    name: input.name, faction_id: UNASSIGNED_FACTION,
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
/**
 * Sit down at a table you can already see.
 *
 * Which now means one you opened or are already at — see myDuneLobbies. Coming
 * in from a code goes through joinDuneByCode instead, because until the server
 * has seated you the row does not exist as far as this client is concerned.
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

/**
 * Which game this table is playing, and setting it.
 *
 * Null when the column is not there, which is a server that has not been
 * migrated rather than a table with no opinion — the screen shows nothing
 * rather than guessing, and START_DUNE falls back to advanced either way.
 */
export async function duneMode(matchId: string): Promise<GameMode | null> {
  const { data, error } = await supabase
    .from('matches').select('game_mode').eq('id', matchId).maybeSingle()
  if (error || !data) return null
  const mode = data.game_mode as string | null
  return mode === 'basic' || mode === 'advanced' ? mode : null
}

/**
 * Agree a different game.
 *
 * THE HOST'S, AND THE DATABASE ALREADY SAID SO. The "host manages own lobby"
 * policy has gated updates to a match row on `created_by = auth.uid()` since
 * Risk's lobby was written — so this has always been the host's alone. What was
 * missing was anybody being TOLD: RLS on an update matches no rows rather than
 * raising, so a non-host pressing Basic changed nothing, said nothing, and left
 * a button that plainly did not work.
 *
 * So the write is asked what it changed. Nothing changed and no error means the
 * policy refused it, which is a sentence somebody can act on.
 */
export async function setDuneMode(matchId: string, mode: GameMode): Promise<void> {
  const { data, error } = await supabase
    .from('matches').update({ game_mode: mode })
    .eq('id', matchId).eq('status', 'lobby')
    .select('id')
  if (error) throw new Error(`Could not change the game: ${error.message}`)
  if (!data || data.length === 0) {
    throw new Error('Only the player who opened this table can change the game')
  }
}

/** Whether this account opened the table. */
export function isHost(lobby: Pick<Lobby, 'createdBy'>, userId: string | null | undefined): boolean {
  return !!userId && lobby.createdBy === userId
}

/** The seat the host is sitting in, or null if they have not taken one. */
export function hostSeat(lobby: Pick<Lobby, 'createdBy' | 'seats'>): LobbySeat | null {
  return lobby.seats.find(s => s.userId && s.userId === lobby.createdBy) ?? null
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
 * THE HOST'S. It used to be anybody's, on the grounds that there was no host in
 * the match state to appeal to — there is now, and the endpoint refuses anybody
 * else with 'not-the-host'. Six people all able to press Start is the same
 * standoff as none of them able to: the first press wins and the other five
 * find out the game began without the mode they were still arguing about.
 */
export async function startDuneMatch(matchId: string, mode?: GameMode): Promise<void> {
  // OFF THE ROW unless the caller insists, so the deal is the game the table
  // agreed rather than a default in whichever browser pressed the button.
  const agreed = mode ?? (await duneMode(matchId)) ?? 'advanced'
  const res = await dispatchDuneAction(matchId, { type: 'START_DUNE', mode: agreed })
  if (!res.ok) {
    throw new Error(res.error?.message ?? 'The server would not deal this game')
  }
}

// Re-exported so a screen needs one import for the lobby it is drawing, and so
// the reuse is visible at the point of use rather than buried in this file.
export { readLobby as readDuneLobby, setReady as setDuneReady }
export { leaveLobby as leaveDuneLobby, subscribeLobby as subscribeDuneLobby }
export { UNASSIGNED_FACTION }
