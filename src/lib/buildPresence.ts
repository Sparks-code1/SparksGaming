/**
 * Which build every seat at the table is running, live.
 *
 * WHY. Two players on different builds is invisible until it produces a
 * symptom, and then it produces a confusing one: the last online bug spent an
 * evening being placed because nobody could say whether the two screens were
 * running the same code. This makes the table's builds a thing you can SEE —
 * beside the green Live marker, with a mismatch called out by name — rather
 * than something reconstructed from what went wrong.
 *
 * PRESENCE, NOT A COLUMN. A build is a fact about a CONNECTION, not a seat: it
 * changes the moment someone reloads onto a new deploy and should vanish when
 * they close the tab. Realtime presence is exactly that — each client tracks
 * `{ seat, name, build }` on a channel for the match, every client sees the
 * live set, and a reconnect on a new build replaces the old entry by itself.
 * No migration, no RLS, nothing to go stale in a row.
 *
 * The channel is its own, separate from the match and secrets subscriptions,
 * for the same reason those two are separate from each other: different
 * lifetimes, different failure modes, and a reconnect on one must not mask a
 * reconnect on another.
 */
import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { BUILD_ID } from '@/lib/buildId'

/** One connected client's build, as it announced it. */
export interface SeatBuild {
  seat: string
  name: string
  build: string
}

/**
 * The presence map as one flat list.
 *
 * Presence state is keyed by presence key (the seat) with an ARRAY of metas per
 * key — a seat open in two tabs is two entries — so the list is every meta that
 * carries a seat and a build, and a mismatch check counts a two-tab seat twice,
 * which is the truthful count of clients.
 */
export function flattenPresence(state: Record<string, unknown[]>): SeatBuild[] {
  const out: SeatBuild[] = []
  for (const metas of Object.values(state)) {
    for (const m of metas) {
      const r = m as Partial<SeatBuild> | null
      if (r && typeof r.seat === 'string' && typeof r.build === 'string') {
        out.push({ seat: r.seat, name: typeof r.name === 'string' ? r.name : r.seat, build: r.build })
      }
    }
  }
  return out
}

/** Every client at the table on a build other than `mine`. */
export function buildMismatches(mine: string, peers: readonly SeatBuild[]): SeatBuild[] {
  return peers.filter(p => p.build !== mine)
}

/**
 * Announce this client's build for a match and hear everyone else's.
 *
 * Calls `onPeers` with the whole live set — this client included, once its
 * own track lands — every time it changes. Returns the stop function.
 */
export function startBuildPresence(
  matchId: string,
  opts: {
    seat: string
    name: string
    build: string
    onPeers: (peers: SeatBuild[]) => void
    client?: SupabaseClient
  },
): () => void {
  const db: SupabaseClient = opts.client ?? supabase
  // Keyed by seat, so a reconnect on a new build REPLACES the entry rather
  // than sitting beside the stale one.
  const channel = db.channel(`build:${matchId}`, { config: { presence: { key: opts.seat } } })
  channel
    .on('presence', { event: 'sync' }, () => {
      opts.onPeers(flattenPresence(channel.presenceState() as Record<string, unknown[]>))
    })
    .subscribe(status => {
      if (status === 'SUBSCRIBED') {
        void channel.track({ seat: opts.seat, name: opts.name, build: opts.build })
      }
    })
  return () => {
    void channel.untrack().finally(() => { void db.removeChannel(channel) })
  }
}

/**
 * The live set of builds at the table, for a component to show.
 *
 * Empty in hotseat and until the seat is known — the seat is resolved
 * asynchronously after the match id, and the effect re-runs when it lands.
 */
export function useBuildPresence(
  matchId: string | null,
  seat: string | null,
  name: string | null,
): SeatBuild[] {
  const [peers, setPeers] = useState<SeatBuild[]>([])
  useEffect(() => {
    if (!matchId || !seat) { setPeers([]); return }
    return startBuildPresence(matchId, { seat, name: name ?? seat, build: BUILD_ID, onPeers: setPeers })
  }, [matchId, seat, name])
  return peers
}
