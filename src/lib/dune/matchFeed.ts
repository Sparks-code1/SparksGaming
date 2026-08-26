/**
 * The shared row, read once and then watched.
 *
 * matches.state is PUBLIC — the storm, the phase, who is seated, whose turn it
 * is to bid. Every session sees the identical row, which is the opposite of the
 * secrets channel, where WHICH session asks is the entire mechanism. Keeping
 * the two visibly separate is worth more than sharing one code path.
 *
 * WHY NOT lib/matchSync. That module does this job for Risk and does it well —
 * the four properties below are its — but it is typed to Risk's GameState and
 * carries an action feed Dune has no use for. Giving it a second game is a
 * change to make on purpose rather than in passing, and until Dune's row
 * settles this is the cheaper half of that trade. What is NOT acceptable is a
 * feed that quietly does less, so the four properties are implemented here
 * rather than assumed away:
 *
 *   1. VERSION GUARD. Every row carries the version apply_match_write stamped.
 *      Anything at or below what has already been applied is dropped. Realtime
 *      can deliver out of order, and the acting client also gets its state back
 *      from its own POST — without this a late echo rolls the board backwards.
 *
 *   2. RESYNC ON CONNECT. Messages sent while the socket was down are gone and
 *      never replayed, so the row is fetched outright on every subscribe —
 *      first connect and every reconnect. A client that was offline is never
 *      left quietly behind.
 *
 *   3. A VISIBLE STATUS. A board that has stopped updating looks exactly like a
 *      board where nobody is moving. Which one it is gets published.
 *
 *   4. A STANDING POLL. SUBSCRIBED proves a channel exists, not that events
 *      reach it: realtime delivery is RLS-filtered per subscriber, and a socket
 *      that authenticated before the session finished restoring is an ANONYMOUS
 *      subscriber — every event dropped, no error anywhere, and the badge still
 *      says live. The poll reads over REST, which always carries the JWT, so
 *      the worst a broken channel can do is delay a move by one interval.
 *
 * The dev harness used a simpler version of this — no version guard, no poll —
 * on the argument that it runs on one machine against one server. It now uses
 * this one, because two implementations of "what does the table look like now"
 * is how a harness comes to prove something the app does not do.
 */
import { supabase } from '@/lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PublicRow } from '@/lib/dune/publicRow'

/** How the feed is doing, for anything that wants to say so on screen. */
export type FeedStatus = 'connecting' | 'live' | 'offline'

export interface DuneMatchFeed {
  /** Stop watching and drop the channel. */
  stop(): void
  /**
   * Read the row now, rather than waiting to be told.
   *
   * READ-YOUR-OWN-WRITES. A client that has just POSTed an action knows the row
   * changed; a dropped or delayed frame otherwise leaves the screen showing the
   * state before its own move. An auction where your own pass does not appear
   * reads as a pass that never registered — you watch your own clock run down
   * while the seat that should act sees itself waiting on you.
   */
  reread(): Promise<void>
}

export interface DuneMatchFeedOptions {
  /**
   * Which session asks.
   *
   * NOT a way to see more: matches.state is public to anybody seated, and RLS
   * decides that, not this. It exists because the dev harness holds one client
   * per seat and has no app-level session to fall back on. Defaults to the
   * app's own client, which is what a player's browser uses.
   */
  client?: SupabaseClient
  onRow(row: PublicRow, version: number): void
  onStatus?(status: FeedStatus, message?: string): void
  /** How often the safety-net read runs, in ms. */
  pollMs?: number
}

/** Slow: this is the net under the channel, not the delivery mechanism. */
const POLL_MS = 6000

export function watchDuneMatch(
  matchId: string, options: DuneMatchFeedOptions,
): DuneMatchFeed {
  const db: SupabaseClient = options.client ?? supabase
  const poll = options.pollMs ?? POLL_MS
  let stopped = false
  // The highest version applied. -1 rather than 0 so a genuine version 0 —
  // a row written before anything bumped it — is not mistaken for "seen".
  let applied = -1

  const status = (s: FeedStatus, message?: string) => {
    if (!stopped) options.onStatus?.(s, message)
  }

  /**
   * Apply a row if it is newer than what is on screen.
   *
   * THE GUARD IS ON VERSION, not on arrival order, because arrival order is
   * exactly what cannot be trusted here.
   */
  const take = (row: { state?: unknown; version?: number } | null | undefined) => {
    if (stopped || !row?.state) return
    const version = typeof row.version === 'number' ? row.version : applied + 1
    if (version <= applied) return
    applied = version
    options.onRow(row.state as PublicRow, version)
  }

  const read = async () => {
    if (stopped) return
    const { data, error } = await db
      .from('matches').select('state, version').eq('id', matchId).maybeSingle()
    if (error) { status('offline', error.message); return }
    take(data)
  }

  void read()

  // A fresh channel name per feed. Two screens in one page — which is what the
  // harness is — would otherwise share one subscription and one of them would
  // silently receive nothing.
  const channel = db
    .channel(`dune-match:${matchId}:${Math.random().toString(36).slice(2, 10)}`)
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
      payload => take(payload.new as { state?: unknown; version?: number }))
    .subscribe(state => {
      if (state === 'SUBSCRIBED') {
        status('live')
        // EVERY subscribe, not just the first: a reconnect has a gap behind it.
        void read()
      } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') {
        status('offline', state)
      }
    })

  status('connecting')
  const timer = setInterval(() => { void read() }, poll)

  return {
    stop() {
      stopped = true
      clearInterval(timer)
      void db.removeChannel(channel)
    },
    reread: read,
  }
}
