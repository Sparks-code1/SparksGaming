/**
 * Where a game action gets decided: this machine, or the server.
 *
 * There are two modes and they must not blur into each other.
 *
 *   LOCAL (hotseat)  — everyone is at one keyboard, the client IS the authority,
 *                      and nothing here changes what already works. Actions run
 *                      through the local `gameReducer` exactly as before.
 *   ONLINE           — players are on different machines and cannot see each
 *                      other's dice. Actions are POSTed to the `apply-action`
 *                      edge function, which owns the RNG and the state.
 *
 * The mode is a property of the MATCH, not a global setting, so a campaign that
 * is played online one night and hotseat the next does the right thing both
 * times without a flag to remember.
 */
import { supabase, SUPABASE_URL } from '@/lib/supabase'
import {
  gameReducer, createMathRng,
  type Action, type Effect, type Rng,
} from '@/lib/gameReducer'
import type { GameState } from '@/types/game'

/** Result shape shared by both modes, so callers never branch on which ran. */
export interface DispatchResult {
  state: GameState
  effects: Effect[]
  /** Server version this state is at. `null` in local mode — nothing to sync. */
  version: number | null
  /** Set when the action did NOT apply. The caller shows it and does not advance. */
  error?: DispatchError
}

export interface DispatchError {
  code: 'stale' | 'not-your-turn' | 'wrong-player' | 'action-not-allowed'
    | 'not-participant' | 'not-active' | 'not-started' | 'reducer-error'
    | 'unauthenticated' | 'network'
  message: string
  /** On a `stale` conflict the server returns where it actually is, so the
   *  client can resync instead of guessing or reloading the whole app. */
  serverState?: GameState
  serverVersion?: number
}

/** Identifies an online match. Absent ⇒ local hotseat. */
export interface OnlineMatch {
  matchId: string
  /** The version the client believes it is at; sent for optimistic concurrency. */
  version: number
}

/**
 * Actions the server decides, and their local equivalents.
 *
 * `RESOLVE_COMBAT` carries a result the CLIENT rolled. That is correct in
 * hotseat and unacceptable online, so online callers must send `DECLARE_ATTACK`
 * — intent only — and let the server roll. Sending the wrong one is a
 * programming error, not a user error, so it throws rather than failing quietly
 * at the network boundary.
 */
const CLIENT_ONLY_ACTIONS = new Set(['RESOLVE_COMBAT'])

/**
 * Apply one action.
 *
 * @param state  the current board (used only in local mode; the server holds
 *               its own copy and never trusts one sent to it)
 * @param match  present ⇒ online. Omit for hotseat.
 * @param rng    local-mode randomness. Injected so tests can seed it; ignored
 *               online, where the server owns every roll.
 */
export async function dispatchAction(
  state: GameState,
  action: Action,
  match?: OnlineMatch | null,
  rng: Rng = createMathRng(),
): Promise<DispatchResult> {
  // ── LOCAL (hotseat) — unchanged behaviour, no network, no auth ───────────
  if (!match) {
    const { state: next, effects } = gameReducer(state, action, rng)
    return { state: next, effects, version: null }
  }

  // ── ONLINE ───────────────────────────────────────────────────────────────
  if (CLIENT_ONLY_ACTIONS.has(action.type)) {
    throw new Error(
      `${action.type} cannot be sent to the server — it carries a result the client computed. ` +
      'Send DECLARE_ATTACK and let the server roll.',
    )
  }

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return {
      state, effects: [], version: match.version,
      error: { code: 'unauthenticated', message: 'Sign in to play online.' },
    }
  }

  let res: Response
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/apply-action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ matchId: match.matchId, action, expectedVersion: match.version }),
    })
  } catch (e) {
    // The board must NOT advance on a network failure — the action may or may
    // not have been applied, and guessing either way desyncs the match.
    return {
      state, effects: [], version: match.version,
      error: { code: 'network', message: `Could not reach the server: ${String(e)}` },
    }
  }

  const body = await res.json().catch(() => ({}))

  if (!res.ok) {
    return {
      state, effects: [], version: match.version,
      error: {
        code: (body.code ?? 'network') as DispatchError['code'],
        message: body.error ?? `Server refused the action (${res.status})`,
        serverState: body.state,
        serverVersion: body.currentVersion,
      },
    }
  }

  return { state: body.state, effects: body.effects ?? [], version: body.version }
}

/**
 * Subscribe to a match's authoritative updates.
 *
 * Every client — including the one that acted — learns about applied actions
 * here. The acting client also gets the state back from `dispatchAction`, so
 * this is what keeps the OTHER players in step.
 *
 * Returns an unsubscribe function.
 */
export function subscribeToMatch(
  matchId: string,
  onUpdate: (state: GameState, version: number) => void,
  onAction?: (action: Action, effects: Effect[], seq: number) => void,
): () => void {
  const channel = supabase
    .channel(`match:${matchId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
      (payload) => {
        const row = payload.new as { state: GameState; version: number }
        if (row?.state) onUpdate(row.state, row.version)
      },
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'match_actions', filter: `match_id=eq.${matchId}` },
      (payload) => {
        const row = payload.new as { action: Action; effects: Effect[]; seq: number }
        // Effects are how the rest of the game (sounds, modals, legacy writes)
        // learns what happened — the state diff alone cannot say "a player was
        // eliminated" or "these dice were rolled".
        if (row?.action) onAction?.(row.action, row.effects ?? [], row.seq)
      },
    )
    .subscribe()

  return () => { void supabase.removeChannel(channel) }
}

/** Load a match's authoritative state — on join, and to resync after a conflict. */
export async function loadMatchState(
  matchId: string,
): Promise<{ state: GameState; version: number } | null> {
  const { data, error } = await supabase
    .from('matches').select('state, version').eq('id', matchId).single()
  if (error || !data?.state) return null
  return { state: data.state as GameState, version: data.version as number }
}
