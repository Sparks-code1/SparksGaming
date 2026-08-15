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
  gameReducer, createMathRng, MISSILE_WINDOW_MS,
  type Action, type Effect, type Rng,
} from '@/lib/gameReducer'
import type { GameState } from '@/types/game'

/** Result shape shared by both modes, so callers never branch on which ran. */
export interface DispatchResult {
  state: GameState
  effects: Effect[]
  /** Server version this state is at. `null` in local mode — nothing to sync. */
  version: number | null
  /** The action's match_actions sequence number. Feed it to
   *  `MatchSync.noteActionApplied` so the realtime echo of this same action is
   *  dropped instead of re-running its effects. `null` in local mode. */
  seq?: number | null
  /** Set when the action did NOT apply. The caller shows it and does not advance. */
  error?: DispatchError
}

export interface DispatchError {
  code: 'stale' | 'not-your-turn' | 'wrong-player' | 'action-not-allowed'
    | 'not-participant' | 'not-active' | 'not-started' | 'reducer-error'
    | 'unauthenticated' | 'network'
    // Spectator-missile refusals. All of them mean the missile was NOT spent.
    | 'window-closed' | 'bad-die' | 'die-taken' | 'no-missiles' | 'not-a-spectator'
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

  return {
    state: body.state, effects: body.effects ?? [], version: body.version,
    seq: typeof body.seq === 'number' ? body.seq : null,
  }
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
/**
 * Spend one spectator missile on a die of the open combat window.
 *
 * NOT routed through `dispatchAction`: the spectator is not the acting player,
 * their tracked match version routinely lags the battle they are watching, and
 * an optimistic local apply would be a client declaring a 6 — the exact thing
 * the server exists to arbitrate. So this POSTs with NO expectedVersion (the
 * server's own conditional UPDATE still makes two missiles on one die
 * impossible), applies nothing locally, and retries a couple of times when it
 * merely raced another write — a race is not a refusal.
 *
 * Every refusal means the missile was never charged.
 */
export async function sendSpectatorMissile(
  matchId: string,
  roundKey: string,
  side: 'atk' | 'def',
  dieIndex: number,
): Promise<{ ok: true } | { ok: false; code: DispatchError['code']; message: string }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { ok: false, code: 'unauthenticated', message: 'Sign in to play online.' }

  // The deadline this missile buys everyone else. The reducer is clock-free by
  // contract, so the instant travels with the action; the server clamps how far
  // one missile may push it, and never lets it move backwards.
  const action = {
    type: 'SPECTATOR_MISSILE', roundKey, side, dieIndex, playerId: '',
    expiresAt: Date.now() + MISSILE_WINDOW_MS,
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response
    try {
      res = await fetch(`${SUPABASE_URL}/functions/v1/apply-action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ matchId, action }),
      })
    } catch (e) {
      return { ok: false, code: 'network', message: `Could not reach the server: ${String(e)}` }
    }
    const body = await res.json().catch(() => ({}))
    if (res.ok) return { ok: true }
    // Only a version RACE retries — the window may still be open and the die
    // still free; every other code is a final answer.
    if (body.code === 'stale' && attempt < 2) continue
    return {
      ok: false,
      code: (body.code ?? 'network') as DispatchError['code'],
      message: body.error ?? `Server refused the missile (${res.status})`,
    }
  }
  return { ok: false, code: 'stale', message: 'The match kept moving — missile not spent.' }
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
