/**
 * Live sync for an online match.
 *
 * The server owns the state; this keeps every other client looking at it. A
 * client never computes what another player's move did — it receives the whole
 * resulting board and renders that.
 *
 * Four things make it trustworthy rather than merely fast:
 *
 *   1. VERSION GUARD. Every payload carries the row's version. Anything at or
 *      below what the client has already applied is dropped. Realtime can
 *      deliver out of order, and the acting client also gets its state back
 *      from the POST — without this, a late echo of an older state would roll
 *      the board backwards.
 *
 *   2. RESYNC ON CONNECT. Messages sent while the socket was down are gone;
 *      they are not replayed. So every time the channel comes up — first
 *      connect and every reconnect — the current row is fetched outright. A
 *      client that was offline is never left quietly behind.
 *
 *   3. A VISIBLE STATUS. A board that has stopped updating looks exactly like a
 *      board where nobody is moving. The status is published so the player is
 *      told which one they are looking at.
 *
 *   4. A STANDING POLL. `SUBSCRIBED` proves a channel exists, not that events
 *      reach it: realtime delivery is RLS-filtered per subscriber, and a socket
 *      that authenticated before the session finished restoring is an ANONYMOUS
 *      subscriber — every event silently dropped, no error anywhere, badge says
 *      "live". The poll reads the row over REST (which always carries the JWT),
 *      so the worst a broken channel can do is delay a move by one interval.
 *      This is the same net that made lobby setup feel live all along.
 *
 * Hotseat never touches this file: `startMatchSync` is only called with a
 * match id, and there is no match id in a local game.
 */
import { supabase } from '@/lib/supabase'
import type { GameState } from '@/types/game'
import type { Action, Effect } from '@/lib/gameReducer'

export type LiveState =
  /** No online match — hotseat, or nothing open. */
  | 'idle'
  /** First connection attempt in flight. */
  | 'connecting'
  /** Subscribed and receiving. */
  | 'live'
  /** Dropped; retrying with backoff. */
  | 'reconnecting'
  /** Retries exhausted, or the browser reports no network. */
  | 'offline'

export interface LiveStatus {
  state: LiveState
  /** Highest version this client has applied. */
  version: number
  /** Consecutive failed connection attempts; resets on a successful subscribe. */
  attempts: number
  /** Epoch ms of the last payload or successful fetch. */
  lastSyncAt: number | null
  message?: string
}

export interface MatchRow {
  state: GameState
  version: number
}

/**
 * Everything this module needs from the outside world.
 *
 * Injected so the sync rules — version ordering, backoff, resync-on-connect —
 * can be tested without a database or a socket. The Supabase implementation is
 * the default and lives at the bottom of this file.
 */
export interface SyncTransport {
  /** Open a channel. Calls `onStatus` with the channel's lifecycle. */
  open(
    matchId: string,
    onRow: (row: MatchRow) => void,
    onAction: (action: Action, effects: Effect[], seq: number) => void,
    onStatus: (status: 'subscribed' | 'error' | 'closed', message?: string) => void,
  ): () => void
  /** Read the row as it stands right now. */
  fetch(matchId: string): Promise<MatchRow | null>
  /** Wall clock, injectable so tests do not sleep. */
  setTimer(fn: () => void, ms: number): unknown
  clearTimer(handle: unknown): void
  /** Whether the browser currently believes it has a network. */
  isOnline(): boolean
}

export interface SyncHandlers {
  /** A NEWER state arrived. Render this; do not recompute it. */
  onState: (state: GameState, version: number) => void
  /**
   * An action was applied. Only fires for messages received live — actions
   * that happened while this client was disconnected are NOT replayed, because
   * the resync brings the board forward without them. Use it for the things a
   * state diff cannot express (a die roll, an elimination, a sound), and treat
   * it as best-effort rather than a complete log.
   */
  onAction?: (action: Action, effects: Effect[], seq: number) => void
  onStatus?: (status: LiveStatus) => void
}

/** Backoff between reconnection attempts, in ms. The last value repeats. */
export const RECONNECT_DELAYS = [1_000, 2_000, 5_000, 10_000, 30_000]

/** How often the row is read outright regardless of channel health — the
 *  bound on how stale a board can get when realtime is silently delivering
 *  nothing. Matches the lobby's poll. */
export const LIVE_POLL_MS = 5_000

export function reconnectDelay(attempt: number): number {
  return RECONNECT_DELAYS[Math.min(Math.max(0, attempt), RECONNECT_DELAYS.length - 1)]
}

/**
 * A running sync. `stop()` tears down the channel and cancels any pending
 * retry; `resync()` forces a fetch (used after a version conflict).
 */
export interface MatchSync {
  stop: () => void
  resync: () => Promise<void>
  status: () => LiveStatus
  /**
   * Record a version this client applied from somewhere else — the response to
   * its own action. Without this the realtime echo of that same change would
   * be treated as new and re-rendered for no reason.
   */
  noteApplied: (version: number) => void
  /**
   * Record an action seq this client applied from its own POST response.
   * `onAction` drops anything at or below it. Without this the realtime INSERT
   * of the client's OWN action fired `onAction` a second time — and effects
   * are not idempotent: the double-fired territory-captured effect queued two
   * card draws per capture, which is how one AI ended a game holding the
   * entire resource deck.
   */
  noteActionApplied: (seq: number) => void
}

export function startMatchSync(
  matchId: string,
  handlers: SyncHandlers,
  transport: SyncTransport = supabaseTransport,
): MatchSync {
  let applied = -1
  /** Highest match_actions seq whose effects have run here — from the client's
   *  own POST responses (noteActionApplied) or from live delivery. Actions are
   *  applied AT MOST ONCE, in order; a duplicate or out-of-order echo is
   *  dropped exactly like a stale state row. */
  let actionApplied = -1
  let attempts = 0
  let stopped = false
  let closeChannel: (() => void) | null = null
  let retryHandle: unknown = null
  let pollHandle: unknown = null
  let status: LiveStatus = { state: 'connecting', version: -1, attempts: 0, lastSyncAt: null }

  const publish = (next: Partial<LiveStatus>) => {
    status = { ...status, ...next, version: applied, attempts }
    handlers.onStatus?.(status)
  }

  /** Apply a row only if it is strictly newer than what we already have. */
  const applyRow = (row: MatchRow | null, source: 'live' | 'fetch') => {
    // Teardown is not instant: a payload already in flight can land after the
    // channel is closed, and rendering it would push state into a component
    // that has unmounted.
    if (stopped) return
    if (!row) return
    if (row.version <= applied) return      // stale or duplicate — drop it
    applied = row.version
    publish({ lastSyncAt: Date.now(), state: source === 'live' ? 'live' : status.state })
    handlers.onState(row.state, row.version)
  }

  const scheduleRetry = () => {
    if (stopped) return
    const delay = reconnectDelay(attempts)
    attempts++
    publish({
      state: transport.isOnline() ? 'reconnecting' : 'offline',
      message: transport.isOnline()
        ? `Reconnecting in ${Math.round(delay / 1000)}s…`
        : 'No network connection',
    })
    retryHandle = transport.setTimer(() => { retryHandle = null; connect() }, delay)
  }

  const connect = () => {
    if (stopped) return
    closeChannel?.()
    closeChannel = transport.open(
      matchId,
      row => applyRow(row, 'live'),
      (action, effects, seq) => {
        if (stopped) return
        if (seq <= actionApplied) return    // own echo or duplicate — drop it
        actionApplied = seq
        handlers.onAction?.(action, effects, seq)
      },
      (s, message) => {
        if (stopped) return
        if (s === 'subscribed') {
          attempts = 0
          publish({ state: 'live', message: undefined })
          // The socket was down for some interval — anything sent during it is
          // lost, so take the row outright rather than hoping nothing changed.
          void resync()
          return
        }
        // 'error' or 'closed' — the channel is not delivering any more.
        publish({ state: 'reconnecting', message })
        scheduleRetry()
      },
    )
  }

  async function resync(): Promise<void> {
    if (stopped) return
    try {
      const row = await transport.fetch(matchId)
      applyRow(row, 'fetch')
      publish({ lastSyncAt: Date.now() })
    } catch (e) {
      publish({ state: 'reconnecting', message: `Could not read the match: ${String(e)}` })
    }
  }

  /** The standing poll: one loop, started once, survives channel churn. */
  const schedulePoll = () => {
    if (stopped) return
    pollHandle = transport.setTimer(() => {
      pollHandle = null
      void resync().then(schedulePoll)
    }, LIVE_POLL_MS)
  }

  connect()
  schedulePoll()

  return {
    stop() {
      stopped = true
      if (retryHandle !== null) transport.clearTimer(retryHandle)
      if (pollHandle !== null) transport.clearTimer(pollHandle)
      closeChannel?.()
      closeChannel = null
      publish({ state: 'idle', message: undefined })
    },
    resync,
    status: () => status,
    noteApplied(version: number) {
      if (version > applied) {
        applied = version
        publish({ lastSyncAt: Date.now() })
      }
    },
    noteActionApplied(seq: number) {
      if (seq > actionApplied) actionApplied = seq
    },
  }
}

// ─── Supabase implementation ─────────────────────────────────────────────────

export const supabaseTransport: SyncTransport = {
  open(matchId, onRow, onAction, onStatus) {
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false

    const subscribeNow = () => {
      if (cancelled) return
      // Unique per subscription. A channel name is a handle — reusing one that
      // is already subscribed throws when handlers are added, which a reconnect
      // or a remount does routinely. Same crash the lobby channel had.
      channel = supabase
        .channel(`match:${matchId}:${Math.random().toString(36).slice(2, 10)}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
          payload => {
            const row = payload.new as { state?: GameState; version?: number }
            if (row?.state && typeof row.version === 'number') {
              onRow({ state: row.state, version: row.version })
            }
          },
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'match_actions', filter: `match_id=eq.${matchId}` },
          payload => {
            const row = payload.new as { action?: Action; effects?: Effect[]; seq?: number }
            if (row?.action) onAction(row.action, row.effects ?? [], row.seq ?? 0)
          },
        )
        .subscribe((s, err) => {
          if (s === 'SUBSCRIBED') onStatus('subscribed')
          else if (s === 'CHANNEL_ERROR') onStatus('error', err?.message ?? 'Channel error')
          else if (s === 'TIMED_OUT') onStatus('error', 'Connection timed out')
          else if (s === 'CLOSED') onStatus('closed', 'Connection closed')
        })
    }

    // The socket must carry the CALLER's JWT before the channel subscribes.
    // Realtime filters every event through RLS per subscriber, and a socket
    // that authenticated before the session finished restoring — an async IPC
    // round trip on desktop — is an ANONYMOUS subscriber: `is_match_participant`
    // is false, every event is dropped, and no error is ever raised. That is a
    // frozen board wearing a "live" badge.
    void supabase.auth.getSession()
      .then(({ data }) => {
        if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token)
      })
      .catch(() => {})     // no session readable — subscribe anyway; the poll covers us
      .then(subscribeNow)

    return () => {
      cancelled = true
      if (channel) void supabase.removeChannel(channel)
    }
  },

  async fetch(matchId) {
    const { data, error } = await supabase
      .from('matches').select('state, version').eq('id', matchId).single()
    if (error) throw new Error(error.message)
    if (!data?.state) return null
    return { state: data.state as GameState, version: data.version as number }
  },

  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
  isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
}
