/**
 * Posting a Dune action, as whichever seat is doing it.
 *
 * Dune has no local mode. Every action here goes to the server, because the
 * server is the only party that can see hidden state — a client cannot decide
 * whether someone qualifies for charity without being told something about
 * their spice, which is the whole reason dune-action exists. So this is thinner
 * than lib/actionDispatch: there is no hotseat branch to keep separate.
 *
 * THE CLIENT IS A PARAMETER, and that is the load-bearing part.
 *
 * The multi-seat harness holds one authenticated client per seat, each signed in
 * as that seat's own account. Until now it could only READ that way — secretsSync
 * already takes a client, so each seat's own secrets arrived on its own session,
 * but every action still went out on the app's session, which is one particular
 * seat or none at all. Driving a turn from the harness meant watching six seats
 * and being able to act as one.
 *
 * Passing the client through fixes that WITHOUT widening anything, because of
 * what decides the acting seat. The server reads it from the JWT — it looks the
 * caller up in match_players by user_id and takes the seat it finds. So "act as
 * this seat" means "present that seat's token", which is what a seat's own
 * client already does. There is no seat id in the body and there must never be
 * one: that would be a second source of truth beside the token, it would be a
 * claim about identity made by the party whose identity is in question, and
 * unlike the harness it would ship. tests/multiseattest asserts its absence at
 * both ends.
 */
import { supabase, SUPABASE_URL } from '@/lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * What the caller may ask for.
 *
 * A string type rather than a union of full payloads: the server owns the
 * allowlist and rejects anything else by name, and a second allowlist here
 * would be a second thing to keep in step. What this DOES pin down is that an
 * action carries a type and its own fields, and never a seat — see below.
 */
export interface DuneAction {
  type: string
  [field: string]: unknown
}

export interface DuneDispatchError {
  /** The server's own code, so callers can branch on the refusal rather than
   *  on prose. Unknown codes pass through rather than being flattened. */
  code: string
  message: string
}

export interface DuneDispatchResult<T = Record<string, unknown>> {
  ok: boolean
  /** The action's own response. Charity returns `granted` here, to the
   *  claimant alone — it is deliberately not in public state. */
  data?: T
  error?: DuneDispatchError
}

export interface DuneDispatchOptions {
  /**
   * Whose session to act on. Defaults to the app's.
   *
   * The same shape secretsSync takes, and for the same reason: the seat is a
   * property of the session, so anything that wants to act as a particular seat
   * hands over that seat's client rather than naming the seat.
   */
  client?: SupabaseClient
  /** Test seam. Defaults to the real one. */
  fetchImpl?: typeof fetch
}

/**
 * A field naming a seat is refused before it reaches the wire.
 *
 * The server ignores these already — it derives the seat from the token and
 * never reads them — so this changes no outcome. It exists because a caller
 * that sets one has misunderstood something, and finding out at the point of
 * the mistake is worth more than a payload field being quietly discarded three
 * hundred miles away. `seat` itself is not listed: OPEN_BIDDING legitimately
 * carries a bidding ORDER of seats, which is about the auction and not about
 * who is asking.
 */
const IMPERSONATION_FIELDS = ['actAs', 'asSeat', 'impersonate', 'onBehalfOf', 'playerId', 'userId']

/**
 * Send one action.
 *
 * Never throws on a refusal — a refusal is an outcome, and the caller has to
 * show it. It throws only for a caller-side mistake, which is a bug rather than
 * a thing that happens.
 */
export async function dispatchDuneAction<T = Record<string, unknown>>(
  matchId: string,
  action: DuneAction,
  options: DuneDispatchOptions = {},
): Promise<DuneDispatchResult<T>> {
  const client = options.client ?? supabase
  const doFetch = options.fetchImpl ?? fetch

  const smuggled = IMPERSONATION_FIELDS.filter(f => f in action)
  if (smuggled.length > 0) {
    throw new Error(
      `${action.type} carries ${smuggled.join(', ')} — the acting seat comes from the session, `
      + 'not from the payload. Pass that seat\'s client instead.',
    )
  }

  const { data: { session } } = await client.auth.getSession()
  if (!session) {
    return { ok: false, error: { code: 'unauthenticated', message: 'Sign in to play.' } }
  }

  let res: Response
  try {
    res = await doFetch(`${SUPABASE_URL}/functions/v1/dune-action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // THE ACTING SEAT, in the only place it is stated.
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ matchId, action }),
    })
  } catch (e) {
    // Nothing advances on a network failure. The action may or may not have
    // been applied, and a client that guesses either way desyncs the match —
    // the same rule actionDispatch follows, for the same reason.
    return { ok: false, error: { code: 'network', message: `Could not reach the server: ${String(e)}` } }
  }

  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    return {
      ok: false,
      error: {
        code: typeof body.code === 'string' ? body.code : 'network',
        message: typeof body.error === 'string' ? body.error : `Server refused the action (${res.status})`,
      },
    }
  }
  return { ok: true, data: body as T }
}
