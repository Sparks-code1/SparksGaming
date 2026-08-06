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
 * Actions that must never be POSTed, throwing rather than failing quietly at
 * the network boundary.
 *
 * Currently empty — and that emptiness has a history. `RESOLVE_COMBAT` sat
 * here because it carries a result the CLIENT rolled, which the design said
 * online callers must replace with `DECLARE_ATTACK`. But the combat UI was
 * never rewired, so every online battle dispatched RESOLVE_COMBAT anyway, this
 * throw killed it silently mid-flight, and combat simply never reached the
 * server: captures lived on the actor's screen until END_TURN's server-side
 * recompute erased them. The server now ACCEPTS RESOLVE_COMBAT, re-bounded
 * against its own board (`clampCombatResolution`) — the trust-the-table
 * interim until the combat UI can ride the server's dice.
 */
const CLIENT_ONLY_ACTIONS = new Set<string>([])

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
 * Live updates live in `matchSync.ts`, not here.
 *
 * An earlier version of this file had its own `subscribeToMatch`, which had no
 * version guard and no reconnect — so a late echo could roll the board
 * backwards and a dropped socket left the client silently stale. Use
 * `startMatchSync` / `useMatchSync` instead.
 *
 * Feed the `version` this function returns to `MatchSync.noteApplied`, or the
 * realtime echo of your own move is treated as news and re-rendered.
 */
/** Load a match's authoritative state — on join, and to resync after a conflict. */
export async function loadMatchState(
  matchId: string,
): Promise<{ state: GameState; version: number } | null> {
  const { data, error } = await supabase
    .from('matches').select('state, version').eq('id', matchId).single()
  if (error || !data?.state) return null
  return { state: data.state as GameState, version: data.version as number }
}
