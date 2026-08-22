// Dune — server-authoritative action endpoint (Supabase Edge Function)
// ============================================================================
// Separate from apply-action rather than folded into it. That function is
// Risk's: its allowlist, its sanitiser and its reducer all know what a
// territory card is. Sharing one endpoint between two games means one
// allowlist deciding for both, which is the thing docs/platform-extraction.md
// argues against — the security model is game-specific, and only Dune knows
// that spice is hidden.
//
// What is new here, and the reason this exists at all: this is the first
// endpoint that reads and writes HIDDEN state.
//
//   Public state  -> matches.state, broadcast to every seat by the changefeed
//   Hidden state  -> match_secrets, one row per seat, RLS'd to that seat
//   Spice         -> the same row, moved only through the shared ledger
//
// The service role bypasses RLS, so this function can see every seat's secrets.
// That is exactly why eligibility is decided here and never sent anywhere: a
// client cannot be told whether someone else qualifies without being told
// something about their spice.
//
// ── Running it ──────────────────────────────────────────────────────────────
//   supabase functions deploy dune-action
//   Requires env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// ── The rules ────────────────────────────────────────────────────────────────
// They grew past a copy, and got the generate-and-verify treatment this comment
// used to promise: the auction, the deck, the ledger and the settlement are all
// bundled from src/lib/dune by npm run build:edge and imported above. What is
// left here are two constants that are small, stable and have no logic in them.
const CHARITY_TOPS_UP_TO = 2
const CHARITY_WINDOW_MS = 15_000

interface DuneSecrets { spice?: number }
interface CharityWindow { expiresAt: number; claims: string[]; turn: number }

const readSpice = (s: DuneSecrets | null | undefined): number =>
  typeof s?.spice === 'number' && Number.isFinite(s.spice) ? s.spice : 0
const charityGrant = (s: DuneSecrets | null | undefined): number => {
  const spice = readSpice(s)
  return spice <= CHARITY_TOPS_UP_TO ? CHARITY_TOPS_UP_TO - spice : 0
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const { matchId, action } = await req.json().catch(() => ({}))
  if (!matchId || !action?.type) return json({ error: 'matchId and action required' }, 400)

  // ── Who is asking ──────────────────────────────────────────────────────────
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'not signed in', code: 'unauthenticated' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // ── Which seat they hold ───────────────────────────────────────────────────
  // From the database, never from the request: a seat id in the payload is a
  // claim about identity, and this is the one place that can check it.
  const { data: seat } = await admin
    .from('match_players')
    .select('player_id')
    .eq('match_id', matchId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!seat?.player_id) return json({ error: 'no seat in that match', code: 'not-seated' }, 403)
  const playerId = seat.player_id as string

  const { data: match } = await admin
    .from('matches')
    .select('state, version')
    .eq('id', matchId)
    .maybeSingle()
  if (!match) return json({ error: 'no such match', code: 'not-found' }, 404)

  const state = (match.state ?? {}) as Record<string, unknown>
  const now = Date.now()

  switch (action.type) {
    // ── Open the charity window ──────────────────────────────────────────────
    // The DEADLINE IS STAMPED HERE, not supplied by the caller. Clients count
    // toward it; nobody runs their own clock, so the phase ends at one moment
    // rather than at six slightly different ones.
    case 'OPEN_CHARITY': {
      // Charity is once a turn, and at the charity phase. Unguarded, this
      // replaced the window with a fresh one on every call — new deadline, empty
      // claims — which let anyone reopen it and wiped the public record of who
      // had already claimed. Mirrors refuseCharityOpen in lib/dune/charity.ts.
      //
      // Which SEAT may drive a phase transition is a separate question with no
      // answer in the match state yet: there is no host or turn owner. Any
      // seated player can still open this, just not twice and not early.
      const open = state.charity as CharityWindow | undefined
      const turn = typeof state.turn === 'number' ? state.turn : 0
      if (state.phase !== 'CHOAM Charity') {
        return json({ error: 'the turn is not at charity', code: 'wrong-phase' }, 409)
      }
      if (open && open.turn === turn) {
        return json({ error: 'charity has already opened this turn', code: 'already-opened' }, 409)
      }
      const window: CharityWindow = { expiresAt: now + CHARITY_WINDOW_MS, claims: [], turn }
      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: { ...state, charity: window },
        p_secrets: {},
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
      return json({ charity: window, version: data[0].version })
    }

    // ── Claim charity ────────────────────────────────────────────────────────
    case 'CLAIM_CHARITY': {
      const window = state.charity as CharityWindow | undefined
      if (!window) return json({ error: 'charity is not open', code: 'no-window' }, 409)
      if (now >= window.expiresAt) return json({ error: 'the window has closed', code: 'window-closed' }, 409)
      if (window.claims.includes(playerId)) return json({ error: 'already claimed', code: 'already-claimed' }, 409)

      // The check a client cannot make about itself and must not make about
      // anyone else. Read with the service role, compared here, and the number
      // never leaves this function.
      const { data: row } = await admin
        .from('match_secrets')
        .select('data')
        .eq('match_id', matchId)
        .eq('player_id', playerId)
        .maybeSingle()
      const secrets = (row?.data ?? {}) as DuneSecrets
      const granted = charityGrant(secrets)
      if (granted <= 0 && readSpice(secrets) > CHARITY_TOPS_UP_TO) {
        // Deliberately vague: telling a rejected caller their own total is fine,
        // but the refusal is logged without it so nothing downstream is tempted
        // to relay a number to the table.
        return json({ error: 'not eligible for charity', code: 'not-eligible' }, 409)
      }

      // Through the ledger, not by adding a number to a field. Charity is spice
      // ENTERING the game from the bank, and saying so is what makes it
      // auditable later — a purse three higher than expected is a question
      // somebody asks, and "which rule did this" has to be answerable without
      // replaying the turn. It is also the only mover: a second way to change a
      // balance is a second answer to whether it was allowed.
      const moved = applySpiceMoves(
        { [playerId]: readSpice(secrets) },
        granted > 0
          ? [{ from: BANK, to: playerId, amount: granted, reason: 'choam-charity' }]
          : [],
      )
      if (!moved.ok) {
        return json({ error: 'charity could not be paid', code: moved.refusal }, 500)
      }

      const next: CharityWindow = { ...window, claims: [...window.claims, playerId] }
      // One transaction for the public claim and the private top-up. Split into
      // two writes, a failure between them shows a claim that granted nothing —
      // which looks exactly like a legal claim by someone already at the
      // threshold, and so would never be noticed.
      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: { ...state, charity: next },
        p_secrets: { [playerId]: { ...secrets, spice: moved.purses[playerId] } },
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)

      // `granted` goes back to the CLAIMANT only, as the response to their own
      // request. It is not written into public state, where the table would see it.
      return json({ granted, charity: next, version: data[0].version })
    }

    // ── Close the window ─────────────────────────────────────────────────────
    // Anyone may ask; the deadline decides. That keeps the phase ending on the
    // clock rather than on whoever happens to be looking.
    case 'CLOSE_CHARITY': {
      const window = state.charity as CharityWindow | undefined
      if (!window) return json({ error: 'charity is not open', code: 'no-window' }, 409)
      if (now < window.expiresAt) return json({ error: 'the window is still open', code: 'too-early' }, 409)

      const rest = { ...state }
      delete rest.charity
      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: rest,
        p_secrets: {},
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
      return json({ closed: true, claims: window.claims, version: data[0].version })
    }

    // ── DEV SCAFFOLDING — NOT how spice is handed out ────────────────────────
    // In the real game each faction begins with a specific amount as part of
    // setup, decided by who they are. This sets arbitrary numbers so the hidden
    // path can be exercised: without it every seat holds nothing, everyone is
    // eligible for charity, and "another seat's spice never reaches my client"
    // is a claim that cannot fail because there is no spice to withhold.
    //
    // Gated on an environment flag rather than a comment, deliberately. A note
    // saying "do not use in production" is advice; an endpoint that refuses
    // unless DUNE_DEV_SEEDING is on cannot quietly become the mechanism. When
    // faction setup exists it will write these rows from the faction, and this
    // case should be deleted rather than repurposed.
    // ── Start the auction ────────────────────────────────────────────────────
    // Cards are drawn HERE, before anyone bids, and parked in match_decks under
    // their own key. Drawing them at the end instead would mean the server chose
    // which cards existed after seeing who won — true of nothing it would
    // actually do, and unprovable either way, which is the problem. Drawn up
    // front, the order is fixed before a single bid is made.
    //
    // They go to match_decks rather than into the auction state because nobody
    // may see them: that table has RLS on and no read policy at all, and the
    // auction's own state is public.
    case 'OPEN_BIDDING': {
      if (state.phase !== 'Bidding') {
        return json({ error: 'the turn is not at bidding', code: 'wrong-phase' }, 409)
      }
      if (state.auction) {
        return json({ error: 'bidding has already opened this turn', code: 'already-opened' }, 409)
      }

      const order = (action.order ?? []) as string[]
      const hands = (action.hands ?? {}) as Record<string, number>
      const limits = (action.limits ?? {}) as Record<string, number>
      const count = cardsOnOffer(order, hands, limits)
      if (count === 0) {
        // Every hand full. Nothing is drawn and nothing is discarded — offering
        // cards nobody may take would take real cards out of the deck and turn
        // them face up for nobody's benefit.
        return json({ error: 'every hand is full, so no cards are auctioned', code: 'no-cards' }, 409)
      }

      const { data: deckRows } = await admin
        .from('match_decks').select('deck, cards').eq('match_id', matchId)
      const piles = Object.fromEntries((deckRows ?? []).map((r) => [r.deck, r.cards as string[]]))
      let deal
      try {
        deal = drawTreachery(
          piles.treachery ?? [], (state.treacheryDiscard ?? []) as string[], count,
          (cards) => shuffleWithSeed(Number(match.rng_seed) + match.action_seq, cards),
        )
      } catch (e) {
        return json({ error: String(e), code: 'deck-exhausted' }, 409)
      }

      const step = beginAuction({
        turn: state.turn ?? 0, order, hands, limits,
        closesAt: now + BID_SECONDS * 1000,
      })

      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        // The STEP is public — it names no card. The reshuffle may have emptied
        // the discard, so that goes back too.
        p_state: { ...state, auction: step, treacheryDiscard: deal.discard },
        p_secrets: {},
        // The drawn cards park where nobody can read them, beside the pile they
        // came out of, in the same transaction that shortened it.
        p_decks: { treachery: deal.draw, 'auction-lot': deal.drawn },
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
      return json({ auction: step, version: data[0].version })
    }

    // ── One bid or pass ──────────────────────────────────────────────────────
    case 'BID': {
      const step = state.auction
      if (!step || step.status !== 'awaiting') {
        return json({ error: 'no auction is running', code: 'no-auction' }, 409)
      }

      const { data: mine } = await admin
        .from('match_secrets').select('data')
        .eq('match_id', matchId).eq('player_id', playerId).maybeSingle()
      const purse = readSpice((mine?.data ?? {}) as DuneSecrets)

      const outcome = answerBid(step.carry, playerId, action.bid, purse, now + BID_SECONDS * 1000)

      // A REFUSAL IS PRIVATE and changes nothing. Saying "more than you hold" to
      // the table would announce roughly what the bidder has, which is most of
      // what bidding hides — so it goes back to the caller as their own response
      // and no state is written at all.
      if (outcome.kind === 'refused') {
        return json({ error: 'bid refused', code: outcome.refusal }, 409)
      }

      if (outcome.step.status === 'awaiting') {
        const { data, error } = await admin.rpc('apply_match_write', {
          p_match_id: matchId,
          p_expected_version: match.version,
          p_state: { ...state, auction: outcome.step },
          p_secrets: {},
        })
        if (error) return json({ error: error.message }, 500)
        if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
        return json({ auction: outcome.step, version: data[0].version })
      }

      // ── Settled. Cards, spice and the discard, or none of them ─────────────
      const { data: allSecrets } = await admin
        .from('match_secrets').select('player_id, data').eq('match_id', matchId)
      const hands = Object.fromEntries((allSecrets ?? []).map(
        (r) => [r.player_id, ((r.data ?? {}) as { cards?: string[] }).cards ?? []]))
      const purses = Object.fromEntries((allSecrets ?? []).map(
        (r) => [r.player_id, readSpice((r.data ?? {}) as DuneSecrets)]))
      const byId = Object.fromEntries((allSecrets ?? []).map((r) => [r.player_id, r.data ?? {}]))

      const { data: lotRows } = await admin
        .from('match_decks').select('deck, cards').eq('match_id', matchId)
      const lot = ((lotRows ?? []).find((r) => r.deck === 'auction-lot')?.cards ?? []) as string[]

      const settled = settleAuction({
        result: outcome.step.result,
        cards: lot,
        hands,
        purses,
        // Who is in the game, for the Emperor redirect. Taken from the auction's
        // own order rather than from whoever happens to have a secrets row.
        seated: step.carry.order,
      })
      // Refusing here leaves the auction settled in state and nothing dealt,
      // which is recoverable; dealing half of it would not be.
      if (!settled.ok) {
        return json({ error: settled.detail, code: settled.refusal }, 409)
      }

      // ONE transaction for all of it. A card dealt without its payment, or a
      // payment without its card, is invisible afterwards — both live in secret
      // rows — so it would surface as somebody quietly richer several turns on.
      const secretsPatch: Record<string, unknown> = {}
      for (const [seat, next] of Object.entries(settled.writes.secrets)) {
        secretsPatch[seat] = { ...(byId[seat] ?? {}), cards: next.hand, spice: next.spice }
      }
      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: {
          ...state,
          auction: null,
          // The discard is PUBLIC — a treachery discard is face up at a table.
          treacheryDiscard: discardUnsold(
            (state.treacheryDiscard ?? []) as string[], settled.writes.discard),
        },
        p_secrets: secretsPatch,
        // The lot is emptied in the same write that deals it out, so a card
        // cannot be dealt twice by a retry.
        p_decks: { 'auction-lot': [] },
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)

      // Awards are public — who won and for how much was visible at the table.
      // WHICH CARD is not, and is not in this response.
      return json({ awards: outcome.step.result.awards, version: data[0].version })
    }

    case 'SEED_SPICE': {
      if (Deno.env.get('DUNE_DEV_SEEDING') !== 'on') {
        return json({
          error: 'seeding is disabled — this is development scaffolding, not setup',
          code: 'seeding-disabled',
        }, 403)
      }
      // { p1: 0, p5: 7 } — whatever the caller wants to arrange.
      const amounts = action.spice as Record<string, number> | undefined
      if (!amounts || typeof amounts !== 'object') {
        return json({ error: 'spice map required', code: 'bad-request' }, 400)
      }

      const secrets: Record<string, unknown> = {}
      for (const [seatId, amount] of Object.entries(amounts)) {
        if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
          return json({ error: `bad amount for ${seatId}`, code: 'bad-request' }, 400)
        }
        secrets[seatId] = { spice: Math.floor(amount) }
      }

      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: state,                       // public state untouched
        p_secrets: secrets,
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
      // Seats seeded, amounts NOT echoed: this endpoint is the one place that
      // sees several seats' spice at once, and it should not be the place that
      // hands them all back in one response.
      return json({ seeded: Object.keys(secrets), version: data[0].version })
    }

    default:
      return json({ error: `unknown action ${action.type}`, code: 'unknown-action' }, 400)
  }
})
