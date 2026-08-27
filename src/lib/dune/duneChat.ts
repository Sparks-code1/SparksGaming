/**
 * Table talk.
 *
 * The chat panel has been drawing messages since it was written and had no way
 * to send one anywhere: every line on screen was composed by the client that
 * put it there. That is fine for "you bid 4" and wrong for a game whose Nexus
 * is a negotiation — alliances are proposed, argued over and agreed out loud,
 * between turns, and a table where nobody can speak cannot have one.
 *
 * PUBLIC LINES ONLY, and that is a rule rather than a limitation.
 *
 * ChatMessage carries `to`, for lines addressed to a single seat — "not
 * eligible for charity" is the case that forced it, being a sentence about how
 * much spice somebody holds. Those are composed by the client that received the
 * refusal, out of a response only that client got, and they must never travel:
 * marking a message private does not make its transport private, and a
 * recipient field on a shared row is a label on an envelope everybody has
 * already opened.
 *
 * So they do not come through here, and match_chat has no column for a
 * recipient. A field that cannot be set cannot be misused, and the absence is
 * the thing that keeps it true rather than the discipline of whoever writes the
 * next caller.
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

interface ChatRow {
  id: number | string
  player_id: string
  faction_id: string | null
  body: string
  said_at: string
}

/**
 * One stored line, as the panel wants it.
 *
 * `to` IS NEVER SET HERE, and cannot be: nothing in the row says who a line was
 * for, because nothing public ever should. A line off this transport is a line
 * the whole table may read, which is the only kind that travels.
 */
export function toMessage(row: ChatRow): ChatMessage {
  return {
    id: `chat-${row.id}`,
    faction: (row.faction_id && row.faction_id !== 'unassigned'
      ? row.faction_id as FactionId : null),
    from: row.player_id,
    text: row.body,
    at: new Date(row.said_at).getTime(),
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
      .select('id, player_id, faction_id, body, said_at')
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
 * Say something to the table.
 *
 * THE SEAT IS THE SERVER'S BUSINESS. `user_id` defaults to auth.uid() in the
 * column and the insert policy checks it, so a client cannot post as anybody
 * else however it fills this in. What is passed is who they are AT THE TABLE,
 * which is public and is only there so a line survives its author leaving.
 */
export async function sayToTable(
  matchId: string,
  who: { playerId: string; faction: FactionId | null },
  text: string,
  client?: SupabaseClient,
): Promise<void> {
  const db: SupabaseClient = client ?? supabase
  const body = text.trim()
  if (!sayable(body)) return
  const { error } = await db.from('match_chat').insert({
    match_id: matchId,
    player_id: who.playerId,
    faction_id: who.faction,
    body,
  })
  if (error) throw new Error(`Could not say that: ${error.message}`)
}
