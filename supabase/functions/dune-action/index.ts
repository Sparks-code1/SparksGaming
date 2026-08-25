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
import { applySpiceMoves, BANK } from '../_shared/duneSpice.gen.ts'
import { settleAuction } from '../_shared/duneAuction.gen.ts'
import { beginAuction, answerBid, cardsOnOffer, BID_SECONDS } from '../_shared/duneBidding.gen.ts'
import { drawTreachery, discardUnsold, shuffleWithSeed, seededRng } from '../_shared/duneDeck.gen.ts'
import {
  buildSpiceDeck, resolveSpiceBlow, resolveDoubleSpiceBlow, applyBlowToBoard, publicSpiceDeck,
} from '../_shared/duneSpiceBlow.gen.ts'
import { prescienceFor, withReveal, PRESCIENT_FACTION } from '../_shared/dunePrescience.gen.ts'

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
// Deliberately minimal, like DuneSecrets above. The real shapes live in
// types/Dune/Game, which Deno cannot import — that is the whole reason the
// logic arrives as a generated bundle. These name only the fields this file
// touches; everything else rides through untyped, and the bundle that reads
// them is the same one the client runs.
interface SpiceCardRow { kind: string; [field: string]: unknown }
interface ForceRow { [field: string]: unknown }
interface SpiceDeckPublicRow {
  remaining?: number
  discardA?: SpiceCardRow[]
  discardB?: SpiceCardRow[]
  /** Which turn the blow was last turned for. See the SPICE_BLOW case. */
  turn?: number
}
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
    .select('player_id, faction_id')
    .eq('match_id', matchId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!seat?.player_id) return json({ error: 'no seat in that match', code: 'not-seated' }, 403)
  const playerId = seat.player_id as string

  // A SEAT IS NOT A FACTION, and the auction speaks faction. Seats are 'p1'..
  // 'p6' and hand limits, the Emperor's redirect and the bidding order are all
  // keyed by 'atreides' and the rest. Passing a seat id into answerBid compared
  // 'p1' against 'atreides' and refused every bid as not-your-turn — forever,
  // since nothing could ever match.
  //
  // The whole roster, because settling needs to map every winner back to the
  // row their card and their spice are written to.
  const { data: roster } = await admin
    .from('match_players').select('player_id, faction_id').eq('match_id', matchId)
  const seatOfFaction: Record<string, string> = {}
  const factionOfSeat: Record<string, string> = {}
  for (const r of roster ?? []) {
    if (!r.faction_id) continue
    seatOfFaction[r.faction_id as string] = r.player_id as string
    factionOfSeat[r.player_id as string] = r.faction_id as string
  }
  const myFaction = factionOfSeat[playerId]

  const { data: match } = await admin
    .from('matches')
    // rng_seed and action_seq are here for the treachery reshuffle. Without
    // them the shuffle seed was Number(undefined) + undefined — NaN, which
    // mulberry32 floors to 1, so every match on the planet reshuffled into the
    // same order. Deterministic, replayable, and identical everywhere: the one
    // failure a seeded shuffle is supposed to prevent.
    .select('state, version, rng_seed, action_seq')
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
    // ── Turn the spice blow ──────────────────────────────────────────────────
    // WHY THIS EXISTS: the deck area on the board showed a permanent "21 LEFT"
    // because nothing ever wrote state.spiceDeck. The count has to be PUBLISHED
    // rather than derived — match_decks has RLS on and no policy at all, so no
    // client can count what it cannot read — and this is the one place that
    // knows the deck's order and what the table is allowed to hear about it.
    //
    // THE RULES ARE NOT HERE. resolveSpiceBlow is the same bundle the client
    // runs (npm run build:edge), so a worm devours the same stacks on both
    // machines. What is here is the part only a server can do: hold the order,
    // and decide what is said about it.
    case 'SPICE_BLOW': {
      if (state.phase !== 'Spice Blow and Nexus') {
        return json({ error: 'the turn is not at the spice blow', code: 'wrong-phase' }, 409)
      }
      const turn = typeof state.turn === 'number' ? state.turn : 0
      const shown = (state.spiceDeck ?? {}) as SpiceDeckPublicRow
      // Once a turn. The count alone cannot say whether the blow has happened,
      // so the turn it was last turned for is stamped beside it — without that,
      // a second call turns a second card and the deck simply runs down faster
      // than the game does.
      if (shown.turn === turn) {
        return json({ error: 'the blow has already been turned this turn', code: 'already-blown' }, 409)
      }

      const { data: deckRows } = await admin
        .from('match_decks').select('deck, cards').eq('match_id', matchId)
      const piles = Object.fromEntries((deckRows ?? []).map(r => [r.deck, r.cards]))

      // BUILT AND SHUFFLED ON FIRST USE, from the match's own seed — the same
      // seed the treachery reshuffle uses, so the whole match replays from one
      // number. `?? []` on a missing pile would deal from an empty deck and
      // report a deck of nothing as a legal state.
      const stored = piles.spice as SpiceCardRow[] | undefined
      const seed = Number(match.rng_seed) + match.action_seq
      const deck: SpiceCardRow[] = stored?.length
        ? stored
        : shuffleWithSeed(seed, buildSpiceDeck())

      const forces = (state.forces ?? []) as ForceRow[]
      const spiceOnBoard = (state.spiceOnBoard ?? {}) as Record<string, number>
      const advanced = state.mode === 'advanced'
      const fremenInPlay = Object.prototype.hasOwnProperty.call(seatOfFaction, 'fremen')
      const rng = seededRng(seed + 1)

      let nextDeck: SpiceCardRow[]
      let discardA: SpiceCardRow[]
      let discardB: SpiceCardRow[]
      let owedToFremen: number
      let toTanks: ForceRow[]
      let placed: unknown
      let blockedByStorm: unknown
      let devoured: unknown[]
      let spiceAfter: Record<string, number>

      try {
        if (advanced) {
          // TWO PILES ARE THE ADVANCED GAME'S STRUCTURE, not a detail. Resolving
          // one of them would leave discardB permanently empty, which is the
          // same class of bug as the count that never moved.
          const out = resolveDoubleSpiceBlow({
            deck, discardA: shown.discardA ?? [], discardB: shown.discardB ?? [],
            forces, spiceOnBoard, storm: state.storm as number,
            firstTurn: turn <= 1, fremenInPlay, rng,
          })
          nextDeck = out.deck
          discardA = out.discardA
          discardB = out.discardB
          owedToFremen = out.wormsForFremenToPlace
          toTanks = out.toTanks
          placed = [out.a.placed, out.b.placed].filter(Boolean)
          blockedByStorm = out.blockedByStorm
          devoured = [...out.a.devoured, ...out.b.devoured, ...out.devouredByFremen]
          // The double blow works the board out itself, across both piles and
          // any Fremen worms, because doing it by hand means applying two
          // placements and any number of devours in the right order.
          spiceAfter = out.spiceOnBoard
        } else {
          const out = resolveSpiceBlow({
            deck, discard: shown.discardA ?? [], forces,
            mode: 'basic', fremenInPlay, spiceOnBoard,
            storm: state.storm as number, firstTurn: turn <= 1, rng,
          })
          nextDeck = out.deck
          discardA = out.discard
          discardB = []
          owedToFremen = out.wormsForFremenToPlace
          toTanks = out.toTanks
          placed = out.placed
          blockedByStorm = out.blockedByStorm
          devoured = out.devoured
          // SET, not add, and the devoured lose theirs first. One call, because
          // doing it by hand is where the add-versus-set bug lived.
          spiceAfter = applyBlowToBoard(spiceOnBoard, out)
        }
      } catch (e) {
        return json({ error: String(e), code: 'blow-failed' }, 409)
      }

      // NOT WIRED, AND SAID SO RATHER THAN DECIDED. Worms after the first in a
      // pile are the Fremen's to place, and the rule is that they CAN be placed
      // — declining is legal. So a server that resolves straight through is not
      // making a safe default, it is playing a seat's turn for them and calling
      // the result the rules. resolveDoubleSpiceBlow says as much in its own
      // docstring: it is the shortcut for callers with nobody to ask.
      //
      // Refused BEFORE the write, so the deck is untouched and the same blow
      // can be turned again once the pause protocol exists — the auction
      // already has the shape it needs (awaiting/answer).
      if (owedToFremen > 0 && fremenInPlay) {
        return json({
          error: `${owedToFremen} worm(s) are the Fremen's to place, and this endpoint cannot ask them yet`,
          code: 'fremen-worms-unwired',
        }, 409)
      }

      // THE PROJECTION, not a hand-written count. The deck goes in and a number
      // comes out; that asymmetry is the boundary this endpoint exists to hold.
      const spiceDeck = {
        ...publicSpiceDeck({ deck: nextDeck, discardA, discardB }),
        turn,
      }

      const eaten = new Set(toTanks)
      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        // ONE WRITE for the board and the deck. A blow committed without the
        // spice it placed is a card turned for nothing; spice placed without
        // the shortened deck deals the same card twice.
        p_state: {
          ...state,
          spiceDeck,
          forces: forces.filter(f => !eaten.has(f)),
          spiceOnBoard: spiceAfter,
        },
        p_secrets: {},
        // The ORDER parks where nobody can read it. Everything the table learns
        // about this deck is the projection above.
        p_decks: { spice: nextDeck },
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)

      // What HAPPENED, which is public — these are cards turned face up and
      // forces removed from a board everyone is looking at. What is left in the
      // deck is in the projection; its order is in neither.
      return json({ placed, blockedByStorm, devoured, spiceDeck, version: data[0].version })
    }

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

      // ── Atreides prescience ─────────────────────────────────────────────
      // The card about to be bid on, written into the Atreides seat's own row.
      // Only that seat, only that card, and only if they are at the table.
      //
      // MERGED, not replaced. p_secrets upserts the whole data blob, so writing
      // { prescience } alone would take that seat's hand and purse with it —
      // this is the smallest write in the phase and the easiest place to lose
      // everything else.
      const openIndex = step.status === 'awaiting' ? step.carry.index : -1
      const openReveal = prescienceFor({ seated: order, lot: deal.drawn, index: openIndex })
      const prescientSeat = seatOfFaction[PRESCIENT_FACTION]
      let openSecrets: Record<string, unknown> = {}
      if (openReveal && prescientSeat) {
        const { data: theirs } = await admin
          .from('match_secrets').select('data')
          .eq('match_id', matchId).eq('player_id', prescientSeat).maybeSingle()
        openSecrets = {
          [prescientSeat]: withReveal((theirs?.data ?? {}) as Record<string, unknown>, openReveal),
        }
      }

      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        // The STEP is public — it names no card. The reshuffle may have emptied
        // the discard, so that goes back too.
        p_state: { ...state, auction: step, treacheryDiscard: deal.discard },
        // The reveal rides in the SAME transaction as the lot it names. Written
        // separately, a crash between them leaves the Atreides reading a card
        // from an auction that never opened.
        p_secrets: openSecrets,
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

      if (!myFaction) {
        return json({ error: 'your seat has no faction', code: 'no-faction' }, 409)
      }
      // Needed whichever way this goes: to move the reveal on when the row
      // advances, and to deal the cards when it ends.
      const { data: deckNow } = await admin
        .from('match_decks').select('deck, cards').eq('match_id', matchId)
      const lot = ((deckNow ?? []).find((r) => r.deck === 'auction-lot')?.cards ?? []) as string[]

      const outcome = answerBid(step.carry, myFaction, action.bid, purse, now + BID_SECONDS * 1000)

      // A REFUSAL IS PRIVATE and changes nothing. Saying "more than you hold" to
      // the table would announce roughly what the bidder has, which is most of
      // what bidding hides — so it goes back to the caller as their own response
      // and no state is written at all.
      if (outcome.kind === 'refused') {
        return json({ error: 'bid refused', code: outcome.refusal }, 409)
      }

      if (outcome.step.status === 'awaiting') {
        // The reveal FOLLOWS THE ROW. A card that has closed is no longer the
        // card up for purchase, and a reveal left pointing at it is one the
        // Atreides can still read after it has been dealt to somebody else.
        // Written every time rather than only when the index moves: an upsert
        // of the same value costs nothing, and "only when it changed" is a
        // second thing to get right.
        const nextReveal = prescienceFor({
          seated: step.carry.order, lot, index: outcome.step.carry.index,
        })
        const seatId = seatOfFaction[PRESCIENT_FACTION]
        let bidSecrets: Record<string, unknown> = {}
        if (seatId) {
          const { data: theirs } = await admin
            .from('match_secrets').select('data')
            .eq('match_id', matchId).eq('player_id', seatId).maybeSingle()
          bidSecrets = {
            [seatId]: withReveal((theirs?.data ?? {}) as Record<string, unknown>, nextReveal),
          }
        }
        const { data, error } = await admin.rpc('apply_match_write', {
          p_match_id: matchId,
          p_expected_version: match.version,
          p_state: { ...state, auction: outcome.step },
          p_secrets: bidSecrets,
        })
        if (error) return json({ error: error.message }, 500)
        if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
        return json({ auction: outcome.step, version: data[0].version })
      }

      // ── Settled. Cards, spice and the discard, or none of them ─────────────
      const { data: allSecrets } = await admin
        .from('match_secrets').select('player_id, data').eq('match_id', matchId)
      // Keyed by FACTION on the way in, because that is what the auction's
      // awards name. Rows whose seat has no faction are skipped rather than
      // keyed by seat id, which would put two namespaces in one object and make
      // the mismatch above possible all over again.
      const withFaction = (allSecrets ?? []).filter((r) => factionOfSeat[r.player_id as string])
      const hands = Object.fromEntries(withFaction.map(
        (r) => [factionOfSeat[r.player_id as string], ((r.data ?? {}) as { cards?: string[] }).cards ?? []]))
      const purses = Object.fromEntries(withFaction.map(
        (r) => [factionOfSeat[r.player_id as string], readSpice((r.data ?? {}) as DuneSecrets)]))
      const byId = Object.fromEntries((allSecrets ?? []).map((r) => [r.player_id, r.data ?? {}]))

      // `lot` was read at the top of this case — prescience needs it on the
      // awaiting path too. Reading it twice declared it twice in one block,
      // which is a SyntaxError the moment the function loads, and tsc does not
      // read this directory.

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
      // ...and back to SEAT on the way out, because match_secrets is keyed by
      // seat. A faction with no seat cannot be written to and is a bug upstream
      // rather than something to swallow here.
      const secretsPatch: Record<string, unknown> = {}
      for (const [faction, next] of Object.entries(settled.writes.secrets)) {
        const seatId = seatOfFaction[faction]
        if (!seatId) {
          return json({ error: `no seat holds ${faction}`, code: 'unseated-winner' }, 409)
        }
        secretsPatch[seatId] = { ...(byId[seatId] ?? {}), cards: next.hand, spice: next.spice }
      }
      // THE REVEAL IS CLEARED when the auction ends. Nothing is up for purchase
      // any more, and a reveal left behind names a card now sitting in a hand —
      // possibly somebody else's. The Atreides seat may not be in the patch at
      // all (they may have won nothing and paid nobody), so it is added rather
      // than assumed present.
      const prescientOut = seatOfFaction[PRESCIENT_FACTION]
      if (prescientOut) {
        secretsPatch[prescientOut] = withReveal(
          (secretsPatch[prescientOut] ?? byId[prescientOut] ?? {}) as Record<string, unknown>, null)
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

      // ── The write says what it did ─────────────────────────────────────────
      // Read back and confirm the two effects that are not visible in the
      // response: the auction closed out of the public row, and the lot emptied.
      //
      // Both were reported missing after a real run while being plainly present
      // in this call, which is a report nothing here could act on — a write that
      // returns success and did not do what it says leaves no way to tell a
      // stale deploy from a bug. So it is checked rather than assumed, and the
      // failure names WHICH half did not land.
      //
      // The cards and the spice are not re-read: those the caller can see for
      // itself in its own secrets row, and this is about the parts nobody would
      // notice were missing until the phase failed to end.
      {
        const { data: back } = await admin
          .from('matches').select('state').eq('id', matchId).maybeSingle()
        const { data: lotBack } = await admin
          .from('match_decks').select('cards').eq('match_id', matchId).eq('deck', 'auction-lot').maybeSingle()
        const stillOpen = !!(back?.state as Record<string, unknown> | null)?.auction
        const stillDealt = ((lotBack?.cards ?? []) as string[]).length > 0
        if (stillOpen || stillDealt) {
          return json({
            error: 'the settlement wrote, and part of it did not land',
            code: 'settlement-incomplete',
            auctionStillOpen: stillOpen,
            lotStillHoldingCards: stillDealt,
          }, 500)
        }
      }

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
