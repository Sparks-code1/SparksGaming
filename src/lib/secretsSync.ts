/**
 * A seat's own hidden state, live.
 *
 * Public state arrives on the match row, which the realtime changefeed delivers
 * whole to every subscriber — so nothing secret can travel that way. Secrets
 * come from `match_secrets` instead, one row per seat, and RLS is what keeps one
 * seat's row off another's socket.
 *
 * Deliberately separate from startMatchSync. The match row and a seat's secrets
 * have different lifetimes, different failure modes, and different consequences
 * when they go wrong: a stale board is visible and annoying, a stale secret is
 * invisible and wrong. Keeping them apart means neither reconnect can mask the
 * other.
 *
 * Nothing reads this yet. It lands before its first caller so the channel can be
 * proved on its own — see docs/hidden-state-and-simultaneity.md.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

/** Whatever a game keeps per seat. Dune's first is `{ spice: number }`. */
export type Secrets = Record<string, unknown>

export interface SecretsRow {
  matchId: string
  playerId: string
  data: Secrets
  updatedAt: string
}

export type SecretsStatus = 'subscribed' | 'closed' | 'error'

export interface SecretsSyncHandlers {
  /** Called with this seat's secrets on first read and on every change. */
  onSecrets(row: SecretsRow): void
  onStatus?(status: SecretsStatus, detail?: string): void
}

interface RawRow {
  match_id?: string
  player_id?: string
  data?: Secrets
  updated_at?: string
}

const toRow = (r: RawRow): SecretsRow | null =>
  r?.match_id && r?.player_id
    ? { matchId: r.match_id, playerId: r.player_id, data: r.data ?? {}, updatedAt: r.updated_at ?? '' }
    : null

/**
 * Watch this seat's secrets for a match.
 *
 * The subscription filters on match_id ONLY. It deliberately does not filter on
 * player_id: a client-supplied seat filter would be a request, not a guarantee,
 * and the guarantee has to come from RLS — which returns only rows whose seat
 * maps to auth.uid(). Filtering here as well would hide a broken policy behind a
 * client-side narrowing that looks like it is doing the work.
 *
 * So if this ever delivers somebody else's row, the policy is wrong and the
 * caller should hear about it rather than have it quietly filtered away. That is
 * what `onForeignRow` is for.
 */
/**
 * This seat's own secrets row, read now.
 *
 * READ-YOUR-OWN-WRITES, and the reason it exists beside a changefeed: a client
 * that has just POSTed an action knows its row changed and should not wait on a
 * frame to find out what. A dropped or delayed UPDATE otherwise shows up as
 * spice that never leaves the winner's purse — right in the database, wrong on
 * the screen, which is the most misleading way for this to fail.
 *
 * THROUGH THE CALLER'S OWN SESSION, so it reads under the same RLS as the
 * changefeed and can only ever return that session's row. `playerId` narrows
 * the query for cost, never for safety: the policy is what makes another seat's
 * row unreachable, and a client-side filter that looked like it was doing the
 * work would be the more dangerous thing to have written.
 *
 * Null when there is nothing there or the read fails — a caller re-reading
 * after its own write should keep what it already had rather than blank the
 * tray on a hiccup.
 */
export async function readOwnSecrets(
  matchId: string, playerId: string, client?: SupabaseClient,
): Promise<Secrets | null> {
  const db: SupabaseClient = client ?? supabase
  const { data, error } = await db
    .from('match_secrets')
    .select('player_id, data')
    .eq('match_id', matchId)
    .eq('player_id', playerId)
    .maybeSingle()
  if (error || !data) return null
  return (data.data ?? {}) as Secrets
}

export function startSecretsSync(
  matchId: string,
  handlers: SecretsSyncHandlers & {
    /** Fires if a row for another seat arrives — an RLS failure, not a normal event. */
    onForeignRow?(row: SecretsRow): void
    /** This client's seat, used only to RECOGNISE a foreign row, never to filter. */
    expectPlayerId?: string
    /**
     * Which authenticated session to listen on. Defaults to the app's.
     *
     * NOT a way to see more. A client is a SESSION, and match_secrets is
     * read-your-own for whoever that session is signed in as — so passing one
     * here changes whose row arrives only by changing whose credentials are
     * being used. The dev harness holds one client per seat for exactly that
     * reason: it is several browser windows in one process, not one window with
     * more privilege. See src/dev/multiSeat.
     */
    client?: SupabaseClient
  },
): () => void {
  const db: SupabaseClient = handlers.client ?? supabase
  let channel: ReturnType<typeof supabase.channel> | null = null
  let cancelled = false

  const deliver = (raw: RawRow | null | undefined) => {
    const row = toRow(raw ?? {})
    if (!row) return
    if (handlers.expectPlayerId && row.playerId !== handlers.expectPlayerId) {
      handlers.onForeignRow?.(row)
      return
    }
    handlers.onSecrets(row)
  }

  // Read once before subscribing. A changefeed only reports CHANGES, so a seat
  // joining mid-match would otherwise see nothing until its secrets happened to
  // be written — which for spice might be several turns.
  void db
    .from('match_secrets')
    .select('match_id, player_id, data, updated_at')
    .eq('match_id', matchId)
    .then(({ data, error }) => {
      if (cancelled || error) return
      for (const r of (data ?? []) as RawRow[]) deliver(r)
    })

  // Unique channel name per subscription: reusing a subscribed handle throws
  // when handlers are added, which a reconnect or a remount does routinely.
  channel = db
    .channel(`secrets:${matchId}:${Math.random().toString(36).slice(2, 10)}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'match_secrets', filter: `match_id=eq.${matchId}` },
      payload => deliver(payload.new as RawRow),
    )
    .subscribe((s, err) => {
      if (s === 'SUBSCRIBED') handlers.onStatus?.('subscribed')
      else if (s === 'CHANNEL_ERROR') handlers.onStatus?.('error', err?.message ?? 'Channel error')
      else if (s === 'TIMED_OUT') handlers.onStatus?.('error', 'Connection timed out')
      else if (s === 'CLOSED') handlers.onStatus?.('closed')
    })

  return () => {
    cancelled = true
    if (channel) void db.removeChannel(channel)
    channel = null
  }
}
