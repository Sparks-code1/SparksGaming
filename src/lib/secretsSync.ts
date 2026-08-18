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
export function startSecretsSync(
  matchId: string,
  handlers: SecretsSyncHandlers & {
    /** Fires if a row for another seat arrives — an RLS failure, not a normal event. */
    onForeignRow?(row: SecretsRow): void
    /** This client's seat, used only to RECOGNISE a foreign row, never to filter. */
    expectPlayerId?: string
  },
): () => void {
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
  void supabase
    .from('match_secrets')
    .select('match_id, player_id, data, updated_at')
    .eq('match_id', matchId)
    .then(({ data, error }) => {
      if (cancelled || error) return
      for (const r of (data ?? []) as RawRow[]) deliver(r)
    })

  // Unique channel name per subscription: reusing a subscribed handle throws
  // when handlers are added, which a reconnect or a remount does routinely.
  channel = supabase
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
    if (channel) void supabase.removeChannel(channel)
    channel = null
  }
}
