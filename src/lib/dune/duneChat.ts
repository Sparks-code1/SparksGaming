/**
 * Table talk.
 *
 * The chat panel has been drawing messages since it was written and had no way
 * to send one anywhere: every line on screen was composed by the client that
 * put it there. That is fine for "you bid 4" and wrong for a game whose Nexus
 * is a negotiation — alliances are proposed, argued over and agreed out loud,
 * between turns, and a table where nobody can speak cannot have one.
 *
 * THREE SCOPES, AND THE DATABASE DECIDES WHO GETS WHAT.
 *
 *   'table'    everybody at the table
 *   'alliance' you and whoever you are allied with
 *   'player'   you and one named seat
 *
 * Scheming is most of Dune: an alliance is negotiated in private and betrayed
 * in public, and a game where every word is overheard has no negotiation in it.
 *
 * THE SCOPING IS NOT THIS MODULE'S. A client filtering its own inbox is a
 * client that could choose not to — the rows would already be on the machine,
 * one devtools tab away. The select policy on match_chat decides what a session
 * receives, so what a seat may not read never reaches it. Everything here is
 * about SAYING; the reading is the database's.
 *
 * WHAT STILL NEVER TRAVELS is the game's own private notices. "Not eligible for
 * charity" is a sentence about how much spice somebody holds, derived from a
 * response only that client received — it is composed locally and stays there.
 * That is a different thing from a player choosing to whisper, and the two are
 * kept apart deliberately: one is a fact the server told you alone, the other
 * is something you decided to say.
 *
 * WHAT IS SAID IS KEPT. There is no update or delete policy on the table, so a
 * line said at the table stays said — somebody agreeing to an alliance and then
 * unsaying it is exactly the argument this exists to settle.
 */
import { supabase } from '@/lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChatMessage } from '@/components/dune/ChatPanel'
import type { FactionId } from '@/types/Dune/Faction'

/** As long a line as the table takes; the column refuses more. */
export const MAX_CHAT = 500

/** How many lines are read back when a screen opens. */
const BACKLOG = 60

/** Who a line is for. */
export type ChatScope =
  | { kind: 'table' }
  | { kind: 'alliance' }
  | { kind: 'player'; playerId: string }

interface ChatRow {
  id: number | string
  player_id: string
  faction_id: string | null
  body: string
  said_at: string
  scope?: string | null
  to_player_id?: string | null
}

/**
 * One stored line, as the panel wants it.
 *
 * THE SCOPE IS CARRIED SO THE PANEL CAN LABEL IT, never so it can filter by it.
 * A line that arrived is a line this session was allowed to have; the marking
 * tells the reader whether the rest of the table heard it, which changes what
 * you say next.
 *
 * An older row with no scope is a table line — that is what every row written
 * before the scopes existed was.
 */
export function toMessage(row: ChatRow): ChatMessage {
  const scope = row.scope === 'alliance' || row.scope === 'player' ? row.scope : 'table'
  return {
    id: `chat-${row.id}`,
    faction: (row.faction_id && row.faction_id !== 'unassigned'
      ? row.faction_id as FactionId : null),
    from: row.player_id,
    text: row.body,
    at: new Date(row.said_at).getTime(),
    scope,
    ...(row.to_player_id ? { toPlayer: row.to_player_id } : null),
  }
}

/**
 * Newest last, and de-duplicated by id.
 *
 * The changefeed and the backlog read overlap — a line can arrive both ways,
 * and the acting client also has its own insert echoed back. Sorting by the
 * moment it was SAID rather than by arrival keeps six screens showing the same
 * conversation in the same order, which is the whole point of a shared log.
 */
export function mergeChat(
  existing: readonly ChatMessage[], incoming: readonly ChatMessage[],
): ChatMessage[] {
  const byId = new Map(existing.map(m => [m.id, m]))
  for (const m of incoming) byId.set(m.id, m)
  return [...byId.values()].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
}

export interface ChatFeed {
  stop(): void
  /** Read the log now, rather than waiting to be told. */
  reread(): Promise<void>
}

/**
 * Watch the table's talk.
 *
 * Same four properties the match feed has, for the same reasons — see
 * lib/dune/matchFeed. The one that matters most here is the RESYNC: a message
 * sent while the socket was down is never replayed, and a conversation with a
 * hole in it is worse than one that is late, because nobody can tell.
 */
export function watchDuneChat(
  matchId: string,
  options: { client?: SupabaseClient; onMessages(lines: ChatMessage[]): void; pollMs?: number },
): ChatFeed {
  const db: SupabaseClient = options.client ?? supabase
  let stopped = false

  const read = async () => {
    if (stopped) return
    const { data, error } = await db
      .from('match_chat')
      .select('id, player_id, faction_id, body, said_at, scope, to_player_id')
      .eq('match_id', matchId)
      .order('said_at', { ascending: false })
      .limit(BACKLOG)
    if (error || !data || stopped) return
    // Read newest-first so the LIMIT keeps the most recent lines rather than
    // the oldest, then handed over oldest-first the way a log reads.
    options.onMessages((data as ChatRow[]).map(toMessage).reverse())
  }

  void read()

  const channel = db
    .channel(`dune-chat:${matchId}:${Math.random().toString(36).slice(2, 10)}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'match_chat', filter: `match_id=eq.${matchId}` },
      payload => {
        if (stopped) return
        options.onMessages([toMessage(payload.new as ChatRow)])
      })
    .subscribe(state => { if (state === 'SUBSCRIBED') void read() })

  // The net under the channel, as everywhere else: SUBSCRIBED proves a channel
  // exists, not that events reach it.
  const timer = setInterval(() => { void read() }, options.pollMs ?? 8000)

  return {
    stop() { stopped = true; clearInterval(timer); void db.removeChannel(channel) },
    reread: read,
  }
}

/** Whether this is something that can be said at all. */
export function sayable(text: string): boolean {
  const tidy = text.trim()
  return tidy.length > 0 && tidy.length <= MAX_CHAT
}

/**
 * Say something, to whoever the scope says.
 *
 * THE SEAT IS THE SERVER'S BUSINESS. `user_id` defaults to auth.uid() in the
 * column and the insert policy checks it, so a client cannot post as anybody
 * else however it fills this in. What is passed is who they are AT THE TABLE,
 * which is public and is only there so a line survives its author leaving.
 *
 * THE SCOPE IS WRITTEN, NOT ENFORCED, here. What it buys the sender is that the
 * row says who it was meant for; what stops anybody else reading it is the
 * select policy. This function being wrong would send a line to the wrong
 * audience — it could not let anybody read one they were not sent.
 */
export async function sayTo(
  matchId: string,
  who: { playerId: string; faction: FactionId | null },
  text: string,
  scope: ChatScope = { kind: 'table' },
  client?: SupabaseClient,
): Promise<void> {
  const db: SupabaseClient = client ?? supabase
  const body = text.trim()
  if (!sayable(body)) return
  // A RECIPIENT EXACTLY WHEN THERE IS ONE. The column has a check constraint
  // saying the same thing, because a 'table' line carrying a recipient reads as
  // private and is not — the most dangerous shape this row could take.
  const { error } = await db.from('match_chat').insert({
    match_id: matchId,
    player_id: who.playerId,
    faction_id: who.faction,
    body,
    scope: scope.kind,
    to_player_id: scope.kind === 'player' ? scope.playerId : null,
  })
  if (error) throw new Error(`Could not say that: ${error.message}`)
}

/** Kept for callers that only ever speak to the room. */
export const sayToTable = (
  matchId: string,
  who: { playerId: string; faction: FactionId | null },
  text: string,
  client?: SupabaseClient,
) => sayTo(matchId, who, text, { kind: 'table' }, client)
