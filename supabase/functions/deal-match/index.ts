/**
 * The deal: a match's first state, written already split.
 *
 * WHY THIS EXISTS. onlineMatch wrote `state: initialState` straight into the
 * row from the client, raw — every seat's hand on a row the changefeed
 * delivers whole to everybody. It self-healed on the match's first action,
 * because that write goes through apply-action and applies publicView, but
 * "self-healing" means the hands were public until somebody took a turn.
 *
 * The client CANNOT do this itself, and that is deliberate rather than an
 * oversight to route around: match_secrets has no insert policy, because a
 * write policy there would let a client rewrite its own hand. So a client that
 * projected the state before writing would produce a row with no hands in it
 * and no secrets rows to put back — and the first action's hydrateState would
 * throw `no secrets for seat` rather than falling through to the inline hands
 * it currently relies on. Worse than the leak.
 *
 * So the split write happens where TypeScript runs with service-role reach,
 * which is here, through the SAME apply_match_write the action path uses. This
 * function is that path's opening move and nothing else: it does not run the
 * reducer, it does not judge a move, it takes a board and files it correctly.
 *
 * IT REFUSES A SECOND CALL. A match with a state already is a game in progress,
 * and overwriting it would hand everybody a fresh board mid-campaign. The check
 * is the CAS in apply_match_write plus an explicit status test, because those
 * fail differently and both messages are worth having.
 *
 * Deploy:  npx supabase functions deploy deal-match
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  publicView,
  secretsFromState,
  decksFromState,
} from '../_shared/stateView.gen.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  let body: { matchId?: string; state?: unknown; expectedVersion?: number }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'expected a json body', code: 'bad-request' }, 400)
  }

  const matchId = body.matchId
  const state = body.state
  if (!matchId || !state || typeof state !== 'object') {
    return json({ error: 'matchId and state are required', code: 'bad-request' }, 400)
  }

  // ── Who is asking ──────────────────────────────────────────────────────────
  // The caller's own token, never a seat id from the payload: a seat id in a
  // request is a claim about identity, and this function writes every hand in
  // the game.
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'unauthenticated', code: 'unauthenticated' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: match, error: mErr } = await admin
    .from('matches')
    .select('id, version, status, created_by, state')
    .eq('id', matchId)
    .single()
  if (mErr || !match) return json({ error: 'no such match', code: 'not-found' }, 404)

  // ── Whose match it is ──────────────────────────────────────────────────────
  // The row's creator, and only them. Everyone else in the lobby is a seat, not
  // a dealer, and a second dealer is how two boards get written for one game.
  if (match.created_by !== user.id) {
    return json({ error: 'only the host deals this match', code: 'not-the-host' }, 403)
  }

  // ── Dealt once ─────────────────────────────────────────────────────────────
  // A match with a board already is a game in progress. Overwriting it would
  // hand every seat a fresh one mid-campaign, which is the worst possible
  // failure for something that only ever runs at the start.
  if (match.state) {
    return json({ error: 'that match already has a board', code: 'already-dealt' }, 409)
  }
  if (match.status !== 'lobby') {
    return json({
      error: `a match in '${match.status}' is not waiting to be dealt`,
      code: 'not-a-lobby',
    }, 409)
  }

  // ── The split write ────────────────────────────────────────────────────────
  // The same three projections the action path uses, in the same single
  // transaction: the public row carries nobody's hand, each seat's hand goes to
  // its own RLS'd secrets row, and the decks go where only the service role
  // reads them. Done as separate statements this is three unsynchronised
  // writes, and a failure between them leaves a board whose counts disagree
  // with the hands nobody can see.
  const expected = typeof body.expectedVersion === 'number'
    ? body.expectedVersion
    : match.version
  const { data: written, error: wErr } = await admin.rpc('apply_match_write', {
    p_match_id: matchId,
    p_expected_version: expected,
    p_state: publicView(state as never),
    p_secrets: secretsFromState(state as never),
    p_decks: decksFromState(state as never),
    p_status: 'active',
  })
  if (wErr) return json({ error: wErr.message, code: 'write-failed' }, 500)

  const row = Array.isArray(written) ? written[0] : written
  if (!row) {
    // The CAS found a different version: somebody dealt this match between the
    // read above and the write. Reported as the same refusal, because from the
    // caller's side it is — the match already has a board.
    return json({ error: 'that match already has a board', code: 'already-dealt' }, 409)
  }

  return json({ ok: true, version: row.version })
})
