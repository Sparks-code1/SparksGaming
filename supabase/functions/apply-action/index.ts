// Risk Legacy Digital — server-authoritative action endpoint (Supabase Edge Function)
// ============================================================================
// The SERVER half of online play. A client POSTs one Action; this function
//
//   1. identifies the caller from their JWT
//   2. checks they hold a seat in the match AND own the current turn
//   3. refuses any action whose payload would let a client decide an outcome
//   4. runs the SAME pure `gameReducer` the client runs, with a SEEDED,
//      server-owned RNG — so the dice are the server's
//   5. writes the new state back guarded on `version` (optimistic concurrency)
//   6. appends to the append-only action log
//
// Clients never write game state. RLS grants them SELECT only; this function
// holds the service-role key and is the sole writer. That is what makes the
// model authoritative rather than merely cooperative.
//
// ── Running it ──────────────────────────────────────────────────────────────
//   npm run build:edge                       # regenerate _shared/gameReducer.gen.ts
//   supabase functions deploy apply-action
//   Requires env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//   (the first two are injected by the platform; the service key must be set).
//
// ── What this does NOT yet own ──────────────────────────────────────────────
// The reducer models the BOARD. Cards, missions, events, scars, HQ placement
// and every other legacy consequence still live in GameBoard.tsx and are not
// reachable from here. Online play is therefore authoritative over movement and
// combat, and cooperative over everything else. `mods` on DECLARE_ATTACK is the
// visible seam: it is clamped, and logged verbatim, but not derived.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  gameReducer,
  createSeededRng,
  clampCombatModifiers,
  clampCombatResolution,
  endTurnTerritories,
  spectatorMissileRefusal,
  type Action,
} from '../_shared/gameReducer.gen.ts'

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
    headers: { 'Content-Type': 'application/json', ...CORS },
  })

/**
 * Actions the server will run.
 *
 * An allowlist, not a blocklist: a reducer action added later is refused until
 * someone has decided it is safe for an untrusted caller to send.
 */
const SERVER_ACTIONS = new Set([
  'PLACE_REINFORCEMENT',
  'UNDO_PLACEMENT',
  'END_REINFORCE_PHASE',
  'END_ATTACK_PHASE',
  'DECLARE_ATTACK',
  // INTERIM, and said out loud: the combat UI still rolls on the actor's
  // machine (interactive missiles and per-round retreats cannot ride a
  // one-shot server roll), so the server accepts the claimed result — after
  // clampCombatResolution rebounds it against the server's OWN board. A
  // forged result can shade dice luck; it cannot conjure a capture with
  // defenders still standing, kill troops that are not there, or advance
  // more than survived. Before this, combat never reached the server AT ALL:
  // captures lived only on the actor's screen until END_TURN's recompute
  // erased them. Full dice authority stays DECLARE_ATTACK's job.
  'RESOLVE_COMBAT',
  'RETREAT',
  'CONFIRM_FORTIFY',
  'END_TURN',
  // Spectator missiles. OPEN/CLOSE come from the actor like any turn action;
  // SPECTATOR_MISSILE is the one action a NON-current-turn seat may send, and
  // it carries its own authorization branch below (participant, human, not a
  // side in the battle, missile actually available).
  'OPEN_COMBAT_WINDOW',
  'SPECTATOR_MISSILE',
  'CLOSE_COMBAT_WINDOW',
  // Card piles are server state in online matches: a draw removes the card
  // from the pile atomically under the version guard, so two clients can
  // never hold the same card. WHICH pick is legal (face-up-first, Purist,
  // homelands) is still judged client-side against legacy state — the trust
  // seam is the same one RESOLVE_COMBAT lives with, and the payload is logged
  // as received either way.
  'DRAW_CARD',
  'TRADE_IN_CARDS',
  // Event-card board effects + the last bare-write stragglers. Each is either
  // self-clamping in the reducer (APPLY_EVENT_TROOPS bounds deltas, MOVE_HQ /
  // JOIN_WAR / END_GAME are structural checks against the server's own board)
  // or carries nothing worth forging. Before these, every event's troops,
  // every HQ move, every re-entry and every WIN existed only on the machine
  // that resolved it.
  'APPLY_EVENT_TROOPS',
  'MOVE_HQ',
  'JOIN_WAR',
  'FORFEIT_WAR',
  'END_GAME',
  // Map surgery — campaign-permanent board changes, each structural and
  // self-limiting in the reducer (idempotent island inject, one scar per
  // territory, at most four cities named, obliterate only what exists).
  'PLACE_SEA_LINE',
  'INJECT_ALIEN_ISLAND',
  'OBLITERATE_TERRITORY',
  'DESTROY_CITIES',
  'PLACE_SCAR',
  // Retro-fit for matches created before the card piles existed. The reducer
  // refuses it outright once `state.cards` is present, so it can only ever
  // fire once per match.
  'SEED_CARD_PILES',
  // Interactive combat between two humans: the session (offer, auto-consent,
  // per-round raw dice) is match state so the DEFENDER participates from
  // their own machine and everyone else watches state, not broadcasts. The
  // defender-side actions carry their own authorization branch below.
  'COMBAT_OFFER',
  'COMBAT_PROPOSE_AUTO',
  'COMBAT_SET_EMP',
  'COMBAT_DEFENSE_CHOICE',
  'POST_COMBAT_DICE',
  'POST_COMBAT_MISSILES',
  'COMBAT_NEXT_ROUND',
  'CLEAR_COMBAT',
])

/** Deterministic per-action seed: fold the match's base seed with the action
 *  sequence number, so every roll is reproducible from (rng_seed, seq) and the
 *  whole match can be replayed and audited from the action log. */
function actionSeed(baseSeed: number, seq: number): number {
  let h = (baseSeed ^ 0x9e3779b9) >>> 0
  h = Math.imul(h ^ seq, 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

/**
 * Strip and replace every field a client must not be trusted to compute.
 *
 * The reducer was written for a trusted caller — the player's own machine in
 * hotseat — so several actions carry values the caller worked out. Each is a
 * hole once the caller is a stranger, and each is closed here rather than in
 * the reducer, because hotseat still legitimately supplies them.
 */
function sanitize(
  action: Action,
  state: Record<string, unknown>,
  legacy: { falloutZoneTerritoryId?: string | null; chosenFactionAbilities?: Record<string, string> } | null,
  factionOf: (playerId: string) => string | undefined,
): Action {
  switch (action.type) {
    case 'DECLARE_ATTACK':
      // Bound the modifier stack. The server cannot DERIVE it — the modifiers
      // come from legacy/scar/faction state the reducer does not model — but it
      // can refuse impossible ones, so a forged stack cannot conjure 9-dice
      // defenders or a +99 die bonus.
      return { ...action, mods: clampCombatModifiers(action.mods) }

    case 'RESOLVE_COMBAT': {
      // The client rolled; the server rebinds the claimed result to what ITS
      // board allows — losses within troops present, capture only when every
      // defender died, advance within survivors. See SERVER_ACTIONS above for
      // why this is accepted at all.
      const st = state as Parameters<typeof clampCombatResolution>[0]
      return { ...action, ...clampCombatResolution(st, action as Parameters<typeof clampCombatResolution>[1]) }
    }

    case 'END_TURN': {
      // `endTerritories` is an ENTIRE replacement board. Recompute it; whatever
      // the client sent is discarded unread. `hqReservePlayerIds` (Khan's
      // Strategic Reserve at the hand-off) is likewise re-derived from the
      // campaign's chosen abilities — the reducer applies the reserve itself
      // now, so the recompute no longer strips it.
      const st = state as Parameters<typeof endTurnTerritories>[0]
      const endingId = st.players?.[st.currentPlayerIndex]?.id ?? ''
      const abilities = legacy?.chosenFactionAbilities ?? {}
      const players = (st.players ?? []) as Array<{ id: string; factionId?: string }>
      return {
        ...action,
        endTerritories: endTurnTerritories(st, {
          endingIsMutant: factionOf(endingId) === 'mutants',
          falloutZoneId: legacy?.falloutZoneTerritoryId ?? null,
        }),
        hqReservePlayerIds: players
          .filter((p) => p.factionId && abilities[p.factionId] === 'khan-hq-troops')
          .map((p) => p.id),
      }
    }

    default:
      return action
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'missing auth' }, 401)

  // Identify the caller from their JWT — never from anything in the body.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'unauthenticated' }, 401)

  let body: { matchId?: string; action?: Action; expectedVersion?: number }
  try { body = await req.json() } catch { return json({ error: 'bad json' }, 400) }
  const { matchId, action, expectedVersion } = body
  if (!matchId || !action?.type) return json({ error: 'matchId and action required' }, 400)

  if (!SERVER_ACTIONS.has(action.type)) {
    return json({ error: `action '${action.type}' is not accepted by the server`, code: 'action-not-allowed' }, 403)
  }

  // Service-role client: bypasses RLS, and is the ONLY writer of game state.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: match, error: mErr } = await admin.from('matches').select('*').eq('id', matchId).single()
  if (mErr || !match) return json({ error: 'match not found' }, 404)
  if (match.status !== 'active') return json({ error: `match not active (${match.status})`, code: 'not-active' }, 409)
  if (!match.state) return json({ error: 'match has no state yet', code: 'not-started' }, 409)

  const { data: roster } = await admin.from('match_players').select('*').eq('match_id', matchId)
  const seats = roster ?? []
  const mySlot = seats.find((r) => r.user_id === user.id)
  if (!mySlot) return json({ error: 'not a participant', code: 'not-participant' }, 403)

  const state = match.state
  const currentPlayerId: string | undefined = state?.players?.[state.currentPlayerIndex]?.id

  // ── Authorization ─────────────────────────────────────────────────────────
  // Whose turn is it, and may THIS caller take it? Two ways to be allowed:
  //
  //   · it is your own seat's turn, or
  //   · it is an AI seat's turn and you CREATED the match. AI seats have no
  //     account — `user_id` is null — so somebody's machine must run them, and
  //     the host's is the one that offered the game. Restricting it to the
  //     creator (not any participant) means two machines never fight over one
  //     AI turn, and a joiner can never puppet the computer players.
  //
  // The payload check stands separately: an action carrying a `playerId` must
  // name the seat whose turn is being taken, whichever rule allowed the caller.
  const currentSeat = seats.find((r) => r.player_id === currentPlayerId)
  if (action.type === 'SPECTATOR_MISSILE') {
    // The one action that does NOT belong to the current turn: any HUMAN
    // participant may send it — provided they are a spectator to the open
    // battle, hold a missile, and the die is still unclaimed. All of that is
    // judged here against the SERVER's window and the campaign's missile
    // counts; a refusal happens before anything is charged, which is what
    // "first click wins, the loser is refunded" means in practice.
    if (mySlot.is_ai) return json({ error: 'AI seats do not spend spectator missiles', code: 'not-a-spectator' }, 403)
    const w = state?.combatWindow
    const battleSideIds = new Set([
      w ? state?.territories?.[w.srcId]?.occupyingPlayerId : null,
      w ? state?.territories?.[w.tgtId]?.occupyingPlayerId : null,
    ].filter(Boolean))
    const { data: campaignRow } = await admin
      .from('campaigns').select('legacy_state').eq('id', match.campaign_id).single()
    const legacyMissiles = Number(campaignRow?.legacy_state?.missiles?.[mySlot.player_id] ?? 0)
    const refusal = spectatorMissileRefusal(
      state,
      action as { roundKey: string; side: 'atk' | 'def'; dieIndex: number },
      mySlot.player_id,
      { legacyMissiles, isBattleSide: battleSideIds.has(mySlot.player_id) },
    )
    if (refusal) {
      const words: Record<string, string> = {
        'window-closed': 'the missile window has closed',
        'bad-die': 'no such die in this round',
        'die-taken': 'another missile already claimed that die — yours is refunded',
        'no-missiles': 'no missiles left to spend',
        'not-a-spectator': 'players in the battle use their own missile phase',
      }
      return json({ error: words[refusal] ?? refusal, code: refusal }, 409)
    }
  } else if (
    action.type === 'COMBAT_DEFENSE_CHOICE'
    || (action.type === 'POST_COMBAT_DICE' && (action as { side?: string }).side === 'def')
  ) {
    // The DEFENDER's half of an interactive battle — legitimately sent while
    // it is the ATTACKER's turn. The caller must hold the defending seat,
    // except for the idle fallback: after the defender has sat on a roll too
    // long, the attacker's machine may roll for them, marked as such.
    const combat = state?.combat
    if (!combat) return json({ error: 'no battle in progress', code: 'action-not-allowed' }, 409)
    const by = (action as { by?: string }).by
    // Two legitimate ways the ATTACKER's machine throws the defense: the
    // defender idled out, or the defender is an AI seat (checked against the
    // roster — a human defender's dice can never be rolled out from under
    // them by relabelling).
    const idleRoll = action.type === 'POST_COMBAT_DICE'
      && by === 'attacker-idle'
      && mySlot.player_id === combat.attackerId
    const aiDefense = action.type === 'POST_COMBAT_DICE'
      && by === 'ai'
      && mySlot.player_id === combat.attackerId
      && !!seats.find((s) => s.player_id === combat.defenderId)?.is_ai
    if (!idleRoll && !aiDefense && mySlot.player_id !== combat.defenderId) {
      return json({ error: 'only the defender answers for the defense', code: 'wrong-player' }, 403)
    }
  } else if (action.type === 'APPLY_EVENT_TROOPS' || action.type === 'SEED_CARD_PILES') {
    // APPLY_EVENT_TROOPS: event rewards belong to a player the BOARD picked
    // (largest population, fewest territories, lowest roll) — usually NOT
    // whoever's turn it is, and possibly seated at another machine. Any
    // participant may resolve one; the reducer bounds every delta and refuses
    // ownership tricks.
    // SEED_CARD_PILES: the retro-fit fires whenever the host's machine notices
    // the match predates the piles, regardless of whose turn is running; the
    // reducer refuses it the moment piles exist.
  } else {
    const actingForAi = !!currentSeat?.is_ai && match.created_by === user.id
    const actingForSelf = mySlot.player_id === currentPlayerId
    if (!actingForSelf && !actingForAi) {
      return json({ error: 'not your turn', code: 'not-your-turn', currentPlayerId }, 403)
    }
    const actionPlayerId = (action as { playerId?: string }).playerId
    // JOIN_WAR / FORFEIT_WAR are exempt: the current actor's machine drives
    // the Join the War offer at the turn hand-off (hotseat convention carried
    // online), so the action legitimately names the ELIMINATED player, not
    // the current one. The reducer refuses either unless that player is
    // genuinely eliminated and undecided (and, for JOIN_WAR, the territory
    // is legal).
    if (action.type !== 'JOIN_WAR' && action.type !== 'FORFEIT_WAR'
        && actionPlayerId && actionPlayerId !== currentPlayerId) {
      return json({ error: 'action belongs to another player', code: 'wrong-player' }, 403)
    }
  }

  // ── Optimistic concurrency (pre-check) ────────────────────────────────────
  // A courtesy 409 for a client that already knows it is behind. The real guard
  // is the conditional UPDATE below — this one only saves a round trip and
  // cannot be relied on, because the row can move between here and there.
  if (typeof expectedVersion === 'number' && expectedVersion !== match.version) {
    return json({ error: 'version conflict', code: 'stale', currentVersion: match.version, state: match.state }, 409)
  }

  // ── Run the reducer, server-seeded ────────────────────────────────────────
  const { data: campaign } = await admin
    .from('campaigns').select('legacy_state').eq('id', match.campaign_id).single()
  const legacy = campaign?.legacy_state ?? null
  const factionOf = (pid: string) => seats.find((s) => s.player_id === pid)?.faction_id

  // A spectator missile is stamped with the CALLER's seat — whatever playerId
  // the client wrote is discarded, so nobody spends a missile they don't own.
  const safeAction = action.type === 'SPECTATOR_MISSILE'
    ? { ...action, playerId: mySlot.player_id }
    : sanitize(action, state, legacy, factionOf)
  const seed = actionSeed(Number(match.rng_seed), match.action_seq)

  let nextState, effects
  try {
    ({ state: nextState, effects } = gameReducer(state, safeAction, createSeededRng(seed)))
  } catch (e) {
    // A reducer throw is a bug or a malformed action — never a 500 that leaves
    // the client guessing whether its move landed.
    return json({ error: 'reducer rejected the action', code: 'reducer-error', detail: String(e) }, 422)
  }

  // ── Persist, guarded on version ───────────────────────────────────────────
  // `.eq('version', match.version)` is the lost-update guard: if another action
  // was applied between the SELECT above and this UPDATE, zero rows match and
  // this one is rejected rather than silently overwriting it.
  const { data: updated, error: uErr } = await admin
    .from('matches')
    .update({
      state: nextState,
      version: match.version + 1,
      action_seq: match.action_seq + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', matchId)
    .eq('version', match.version)
    .select()
    .maybeSingle()

  if (uErr || !updated) {
    const { data: now } = await admin.from('matches').select('version, state').eq('id', matchId).single()
    return json({ error: 'version conflict (raced)', code: 'stale', currentVersion: now?.version, state: now?.state }, 409)
  }

  // Append to the authoritative log. Records the action AS RECEIVED, not the
  // sanitized one, so a client sending values the server had to replace leaves
  // evidence — that is the only way to notice a client probing the seams.
  // `actor_player_id` is the SEAT that acted — the AI's when the host drove an
  // AI turn — while `actor_user_id` stays the human who sent it, so the log
  // still shows which machine every AI move came from.
  await admin.from('match_actions').insert({
    match_id: matchId,
    seq: match.action_seq,
    actor_user_id: user.id,
    actor_player_id: currentPlayerId ?? mySlot.player_id,
    action,
    effects,
  })

  // Clients also receive this via Realtime; returning it lets the caller apply
  // the result immediately instead of waiting for the round trip. `seq` is the
  // log row's sequence number: the caller hands it to MatchSync so the realtime
  // echo of this same action is recognised as already-applied and dropped —
  // effects are not idempotent, and a double-fired capture queues two card
  // draws.
  return json({ state: nextState, effects, version: updated.version, seq: match.action_seq })
})
