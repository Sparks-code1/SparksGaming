// Risk Legacy Digital — server-authoritative action endpoint (Supabase Edge Function)
// ============================================================================
// This is the SERVER half of the multiplayer model. A client POSTs one Action;
// the server validates it's that user's turn, runs the SAME pure `gameReducer`
// the client uses — but with a SEEDED, server-owned RNG — persists the new
// state, and appends to the action log. Clients receive the update via Realtime.
//
// ── Deno / deployment notes (this file is NOT runnable from the Vite repo) ──
//  • Runs on Deno (Supabase Edge Functions), not Node/Vite.
//  • Code sharing: `gameReducer` must be importable here. Options:
//      (a) copy src/lib/gameReducer.ts + the two `import type` targets
//          (src/types/game.ts, src/types/territory.ts) into
//          supabase/functions/_shared/ and rewrite the `@/` type imports to
//          relative paths, or
//      (b) publish the reducer as a tiny shared package and import it, or
//      (c) an import map aliasing `@/` for Deno.
//     The reducer has NO runtime dependencies (it imports only `import type`,
//     which Deno erases), so it ports cleanly once the type imports resolve.
//  • Deploy:  supabase functions deploy apply-action
//  • Requires env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
//  • I can't deploy or run this from here — treat it as a reviewed starting
//    point, not tested code.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { gameReducer, createSeededRng, type Action } from '../_shared/gameReducer.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Deterministic per-action seed: fold the match's base seed with the action
 *  sequence number so every resolution is reproducible and auditable. */
function actionSeed(baseSeed: number, seq: number): number {
  let h = (baseSeed ^ 0x9e3779b9) >>> 0
  h = Math.imul(h ^ seq, 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'missing auth' }, 401)

  // Identify the caller from their JWT.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'unauthenticated' }, 401)

  let body: { matchId?: string; action?: Action; expectedVersion?: number }
  try { body = await req.json() } catch { return json({ error: 'bad json' }, 400) }
  const { matchId, action, expectedVersion } = body
  if (!matchId || !action) return json({ error: 'matchId and action required' }, 400)

  // Service-role client is the ONLY writer of game state (bypasses RLS).
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: match, error: mErr } = await admin.from('matches').select('*').eq('id', matchId).single()
  if (mErr || !match) return json({ error: 'match not found' }, 404)
  if (match.status !== 'active') return json({ error: `match not active (${match.status})` }, 409)

  const { data: roster } = await admin.from('match_players').select('*').eq('match_id', matchId)
  const mySlot = (roster ?? []).find((r) => r.user_id === user.id)
  if (!mySlot) return json({ error: 'not a participant' }, 403)

  const state = match.state
  const currentPlayerId: string | undefined = state?.players?.[state.currentPlayerIndex]?.id

  // ── Authorization: is this user allowed to submit this action right now? ──
  // Baseline rule: you may only act on the CURRENT player's turn, and any action
  // carrying a `playerId` must be your own slot. Per-action exceptions
  // (Join-the-War for an eliminated player, comeback-power picks, missile picks
  // by the defender) are TODOs — enforce them here before going live.
  const actionPlayerId = (action as { playerId?: string }).playerId
  if (actionPlayerId && actionPlayerId !== mySlot.player_id) {
    return json({ error: 'action belongs to another player' }, 403)
  }
  if (mySlot.player_id !== currentPlayerId) {
    return json({ error: 'not your turn' }, 403)
  }

  // ── Optimistic concurrency: reject stale clients ──
  if (typeof expectedVersion === 'number' && expectedVersion !== match.version) {
    return json({ error: 'version conflict', currentVersion: match.version }, 409)
  }

  // ── Run the SAME pure reducer, server-seeded ──
  const seed = actionSeed(Number(match.rng_seed), match.action_seq)
  const { state: nextState, effects } = gameReducer(state, action, createSeededRng(seed))

  // Persist state (guarded on version) + append to the authoritative action log.
  const { data: updated, error: uErr } = await admin
    .from('matches')
    .update({ state: nextState, version: match.version + 1, action_seq: match.action_seq + 1, updated_at: new Date().toISOString() })
    .eq('id', matchId)
    .eq('version', match.version) // lost-update guard: someone else applied first
    .select()
    .single()
  if (uErr || !updated) return json({ error: 'version conflict (raced)', currentVersion: match.version }, 409)

  await admin.from('match_actions').insert({
    match_id: matchId,
    seq: match.action_seq,
    actor_user_id: user.id,
    actor_player_id: mySlot.player_id,
    action,
    effects,
  })

  // Clients also receive this via Realtime; the response lets the caller apply
  // it immediately (optimistic acknowledgement).
  return json({ state: nextState, effects, version: updated.version })
})
