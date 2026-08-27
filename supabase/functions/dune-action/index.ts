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
import { settleCard, bonusCardsDue, BONUS_FACTION } from '../_shared/duneAuction.gen.ts'
import {
  beginAuction, answerBid, cardsOnOffer, BID_SECONDS, BETWEEN_CARDS_SECONDS,
} from '../_shared/duneBidding.gen.ts'
import { drawTreachery, discardUnsold, shuffleWithSeed, seededRng } from '../_shared/duneDeck.gen.ts'
import {
  buildSpiceDeck, resolveSpiceBlow, beginDoubleSpiceBlow, placeFremenWorms,
  applyBlowToBoard, publicSpiceDeck, WORM_SECONDS,
} from '../_shared/duneSpiceBlow.gen.ts'
import { prescienceFor, withReveal, PRESCIENT_FACTION } from '../_shared/dunePrescience.gen.ts'
import {
  openingPosition, answerFremenPlacement, answerPrediction, answerTraitor,
  answerAdvisorPlacement, shipAdvisor, defaultFremenPlacement, defaultTraitor,
  defaultAdvisorPlacement, defaultOrder, settle, answerable, allReady,
  starredOf, SETUP_SECONDS,
} from '../_shared/duneSetup.gen.ts'
import {
  charityGrant, isEligibleForCharity, readSpice, CHARITY_TOPS_UP_TO, CHARITY_WINDOW_MS,
} from '../_shared/duneCharity.gen.ts'
import {
  phaseAfter, advanceHold, phaseWindowOpen, rollStorm, stormEntry, cityIncome,
  mentatVerdict, biddingOpening, PHASE_SECONDS, TURN_LIMIT,
} from '../_shared/dunePhase.gen.ts'

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
interface DuneSecrets { spice?: number }
// Deliberately minimal, like DuneSecrets above. The real shapes live in
// types/Dune/Game, which Deno cannot import — that is the whole reason the
// logic arrives as a generated bundle. These name only the fields this file
// touches; everything else rides through untyped, and the bundle that reads
// them is the same one the client runs.
interface SpiceCardRow { kind: string; [field: string]: unknown }
interface ForceRow { [field: string]: unknown }
/**
 * The pause, as the table sees it.
 *
 * The ask and nothing else. The continuation that goes with it holds the
 * remaining deck, so it lives in match_decks — see publishBlowStep.
 */
interface SpiceBlowPauseRow {
  turn: number
  pile?: 'A' | 'B'
  worms?: number
  from?: string[]
  /** When the window shuts. Public, like the charity window's — it is a time,
   *  not a card, and clients have to count toward it. */
  closesAt?: number
}
/** What is parked beside the deck while the phase waits. */
interface BlowCarryRow {
  carry: Record<string, unknown>
  seed: number
  /** How many answers have been given. Offsets the rng so each resumption gets
   *  its own stream and every one of them is reproducible. */
  resumes: number
}
interface SpiceDeckPublicRow {
  remaining?: number
  discardA?: SpiceCardRow[]
  discardB?: SpiceCardRow[]
  /** Which turn the blow was last turned for. See the SPICE_BLOW case. */
  turn?: number
}
interface CharityWindow { expiresAt: number; claims: string[]; turn: number }


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
    .from('match_players').select('player_id, faction_id, seat, user_id').eq('match_id', matchId)
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
    .select('state, version, rng_seed, action_seq, game_type, status, created_by, game_mode')
    .eq('id', matchId)
    .maybeSingle()
  if (!match) return json({ error: 'no such match', code: 'not-found' }, 404)
  // THE MIRROR OF THE GUARD IN apply-action, and it matters in this direction
  // too: a Risk match handed to a Dune phase would have its board overwritten
  // with a spice deck and an auction. The seat check above has already passed
  // by here — being seated in a match says nothing about which game it is.
  if (match.game_type !== 'dune') {
    return json({ error: `that is a ${match.game_type ?? 'risk'} match`, code: 'wrong-game' }, 409)
  }

  const state = (match.state ?? {}) as Record<string, unknown>
  const now = Date.now()

  // WHAT THE NEXT WRITE BUILDS ON. Every helper below spreads this rather than
  // `state`, and for every case but one the two are the same object. The one:
  // ADVANCE_PHASE moves the phase pointer and then runs the entered phase's
  // own work — the blow, the auction — and that work's write has to carry the
  // moved pointer IN THE SAME TRANSACTION. Two writes would version-race, and
  // a pointer landing without its phase's work is a phase that half-happened.
  let baseState = state

  // ── Committing a spice blow, paused or finished ────────────────────────────
  // Both halves of the phase end here, so there is one answer to what the table
  // is told and one answer to where the deck lives.

  /**
   * Write a finished blow: the projection to public state, the order to
   * match_decks, in one transaction.
   *
   * A blow committed without the spice it placed is a card turned for nothing;
   * spice placed without the shortened deck deals the same card twice.
   */
  const commitBlow = async (done: {
    turn: number
    spiceDeck: Record<string, unknown>
    spiceOnBoard: Record<string, number>
    forces: ForceRow[]
    deck: SpiceCardRow[]
    said: Record<string, unknown>
  }): Promise<Response> => {
    const rest = { ...baseState }
    // The pause is over, so it stops being said. Left behind, the table would
    // read a phase still waiting on a seat that has already answered.
    delete rest.spiceBlow
    const { data, error } = await admin.rpc('apply_match_write', {
      p_match_id: matchId,
      p_expected_version: match.version,
      p_state: {
        ...rest,
        spiceDeck: { ...done.spiceDeck, turn: done.turn },
        spiceOnBoard: done.spiceOnBoard,
        forces: done.forces,
        awaiting: null,
      },
      p_secrets: {},
      // The ORDER parks where nobody can read it, and the carry is cleared in
      // the same write — a stale carry beside a finished blow is a second,
      // older answer to what the deck is.
      p_decks: { spice: done.deck, 'spice-blow': [] },
    })
    if (error) return json({ error: error.message }, 500)
    if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
    return json({ ...done.said, spiceDeck: { ...done.spiceDeck, turn: done.turn }, version: data[0].version })
  }

  /**
   * Publish a step — a pause to wait on, or the finished phase.
   *
   * THE SPLIT IS THE WHOLE POINT. A Step is one object, and it cannot be
   * written to one place:
   *
   *   the ASK is public — which pile stopped, how many worms are offered, and
   *   who owes the answer. That is what the table is entitled to see, and it
   *   says what is needed rather than what anyone chose.
   *
   *   the CARRY IS NOT. It holds the remaining deck, in order. Writing the step
   *   whole into matches.state would publish the spice deck to every client —
   *   the exact thing match_decks exists to prevent, arriving by the back door
   *   of a phase that happens to pause.
   *
   * So the ask goes to public state and the carry goes beside the deck it
   * contains, in one transaction, and neither is ever in the other's place.
   */
  const publishBlowStep = async (
    step: {
      status: string; from?: string[]; closesAt?: number
      ask?: Record<string, unknown>; carry?: unknown; result?: Record<string, unknown>
    },
    turn: number, seed: number, resumes: number,
  ): Promise<Response> => {
    if (step.status === 'awaiting') {
      const ask = (step.ask ?? {}) as { pile?: string; worms?: number }
      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: {
          ...baseState,
          spiceBlow: {
            turn, pile: ask.pile, worms: ask.worms, from: step.from ?? ['fremen'],
            // THE DEADLINE COMES FROM THE STEP, which got it from this request.
            // Nothing recomputes it later: one moment, stamped once.
            closesAt: step.closesAt,
          },
          // The seat the game is waiting on, which is public on purpose: six
          // people round a table can all see who is thinking.
          awaiting: 'fremen',
        },
        p_secrets: {},
        p_decks: { 'spice-blow': { carry: step.carry, seed, resumes } },
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
      // The ask, and nothing from the carry.
      return json({
        awaiting: 'fremen', pile: ask.pile, worms: ask.worms,
        closesAt: step.closesAt, version: data[0].version,
      })
    }

    const out = (step.result ?? {}) as {
      deck: SpiceCardRow[]; discardA: SpiceCardRow[]; discardB: SpiceCardRow[]
      forces: ForceRow[]; spiceOnBoard: Record<string, number>
      a?: unknown; b?: unknown; nexus?: boolean
      blockedByStorm?: unknown; devouredByFremen?: unknown
    }
    return await commitBlow({
      turn,
      spiceDeck: publicSpiceDeck({ deck: out.deck, discardA: out.discardA, discardB: out.discardB }),
      spiceOnBoard: out.spiceOnBoard,
      // THE SURVIVORS, returned by the phase rather than filtered here. The
      // carry has been to the database and back, so nothing in toTanks is
      // identical to anything in state.forces and a filter on it would remove
      // nothing at all — every devoured stack back on its feet.
      forces: out.forces,
      deck: out.deck,
      said: {
        nexus: out.nexus,
        blockedByStorm: out.blockedByStorm,
        devouredByFremen: out.devouredByFremen,
      },
    })
  }

  /**
   * Turn this turn's spice blow — the whole phase, pauses included.
   *
   * A FUNCTION rather than only a case because two things start it: the
   * SPICE_BLOW action (the dev harness, or any seat pushing a phase the
   * advance entered without turning), and ADVANCE_PHASE entering the phase,
   * which sets baseState to carry the moved pointer and calls this so the
   * pointer and the cards land in one write.
   */
  const turnTheBlow = async (): Promise<Response> => {
      if (baseState.phase !== 'Spice Blow and Nexus') {
        return json({ error: 'the turn is not at the spice blow', code: 'wrong-phase' }, 409)
      }
      const turn = typeof baseState.turn === 'number' ? baseState.turn : 0
      const shown = (baseState.spiceDeck ?? {}) as SpiceDeckPublicRow
      // Once a turn. The count alone cannot say whether the blow has happened,
      // so the turn it was last turned for is stamped beside it — without that,
      // a second call turns a second card and the deck simply runs down faster
      // than the game does.
      if (shown.turn === turn) {
        return json({ error: 'the blow has already been turned this turn', code: 'already-blown' }, 409)
      }
      // AND NOT WHILE ONE IS HALF-DONE. A blow begun again mid-pause would draw
      // from the pre-pause deck and strand the carry holding the real one.
      if (baseState.spiceBlow) {
        return json({ error: 'the blow is waiting on the Fremen', code: 'blow-in-progress' }, 409)
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

      const forces = (baseState.forces ?? []) as ForceRow[]
      const spiceOnBoard = (baseState.spiceOnBoard ?? {}) as Record<string, number>
      const fremenInPlay = Object.prototype.hasOwnProperty.call(seatOfFaction, 'fremen')

      // ── the advanced game: two piles, and a stop between them ────────────
      if (baseState.mode === 'advanced') {
        let step
        try {
          step = beginDoubleSpiceBlow({
            deck, discardA: shown.discardA ?? [], discardB: shown.discardB ?? [],
            forces, spiceOnBoard, storm: baseState.storm as number,
            firstTurn: turn <= 1, fremenInPlay, rng: seededRng(seed),
            closesAt: now + WORM_SECONDS * 1000,
          })
        } catch (e) {
          return json({ error: String(e), code: 'blow-failed' }, 409)
        }
        return await publishBlowStep(step, turn, seed, 0)
      }

      // ── the basic game: one pile, and it cannot stop ─────────────────────
      // Placing worms is a Fremen ADVANCED advantage — resolveSpiceBlow only
      // counts them when mode is 'advanced' — so a basic blow runs to the end
      // by construction rather than by hoping.
      let out
      try {
        out = resolveSpiceBlow({
          deck, discard: shown.discardA ?? [], forces,
          mode: 'basic', fremenInPlay, spiceOnBoard,
          storm: baseState.storm as number, firstTurn: turn <= 1, rng: seededRng(seed),
        })
      } catch (e) {
        return json({ error: String(e), code: 'blow-failed' }, 409)
      }
      // Identity is sound HERE and only here: toTanks holds the very objects
      // this same request parsed out of baseState.forces. The advanced path cannot
      // do this, because its carry has been to the database and back — see the
      // note on DoubleBlowOutcome.forces.
      const eaten = new Set(out.toTanks)
      return await commitBlow({
        turn,
        spiceDeck: publicSpiceDeck({ deck: out.deck, discardA: out.discard, discardB: [] }),
        // SET, not add, and the devoured lose theirs first. One call, because
        // doing it by hand is where the add-versus-set bug lived.
        spiceOnBoard: applyBlowToBoard(spiceOnBoard, out),
        forces: forces.filter(f => !eaten.has(f)),
        deck: out.deck,
        said: { placed: out.placed, blockedByStorm: out.blockedByStorm, devoured: out.devoured },
      })
  }

  /**
   * Draw the lot and open the auction.
   *
   * A FUNCTION rather than only a case, for the reason turnTheBlow is: the
   * OPEN_BIDDING action still takes the harness's client-computed inputs, and
   * ADVANCE_PHASE entering Bidding calls this with inputs computed from the
   * match itself — biddingOpening — under a baseState carrying the moved
   * pointer, so the pointer and the lot land in one write.
   */
  const openTheAuction = async (
    order: string[], hands: Record<string, number>, limits: Record<string, number>,
  ): Promise<Response> => {
      if (baseState.phase !== 'Bidding') {
        return json({ error: 'the turn is not at bidding', code: 'wrong-phase' }, 409)
      }
      if (baseState.auction) {
        return json({ error: 'bidding has already opened this turn', code: 'already-opened' }, 409)
      }

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
        turn: baseState.turn ?? 0, order, hands, limits,
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
        p_state: { ...baseState, auction: step, treacheryDiscard: deal.discard },
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

    // ── Deal the opening position ────────────────────────────────────────────
    // ONCE, AND SERVICE-SIDE. Three of the four things this writes are things
    // no client may write: match_secrets has no client write policy at all,
    // match_decks has no client policy of any kind, and the public row is the
    // server's to own. A setup dealt in a browser would be a setup its dealer
    // could read.
    case 'START_DUNE': {
      // ALREADY DEALT IS NOT AN ERROR TO RETRY. A second deal would reshuffle
      // every deck and re-deal every traitor under six people already holding
      // theirs — so this refuses rather than being idempotent, which would be
      // a lie about what a repeat call did.
      const dealt = state.setup || (Array.isArray(state.players) && state.players.length > 0)
      if (dealt) {
        // ALREADY DEALT, BUT STILL LISTED AS OPEN. The deal and the status flip
        // are two writes and the second can fail on its own — leaving a match
        // with a board on it sitting in the lobby list, which nobody can play
        // and nobody can clear. Finishing the flip is not a second deal: it is
        // the first one, completed. Anything else is refused.
        if (match.status === 'lobby') {
          await admin.from('matches').update({ status: 'active' }).eq('id', matchId)
          return json({ setup: state.setup ?? null, repaired: true })
        }
        return json({ error: 'this match has already been dealt', code: 'already-started' }, 409)
      }

      // THE HOST DEALS, AND ONLY THE HOST. Six people all able to press Start
      // is the same standoff as none of them able to: the first press wins and
      // the other five find out the game began without the mode they were
      // still arguing about. The row already says who opened the table, and
      // the RLS policy on matches trusts the same field for the same reason.
      if (match.created_by && match.created_by !== user.id) {
        return json({ error: 'only the host can start this game', code: 'not-the-host' }, 403)
      }

      const seats = (roster ?? [])
        .filter((r: { faction_id?: string }) => !!r.faction_id)
        // IN SEAT ORDER, because the printed circle a player sits at decides
        // turn order and the storm reads it. Sorting by the roster's own seat
        // column rather than by whatever order the rows came back in.
        .sort((a: { seat: number }, b: { seat: number }) => (a.seat ?? 0) - (b.seat ?? 0))
        .map((r: { player_id: string; faction_id: string; seat: number }) => ({
          faction: r.faction_id,
          playerId: r.player_id,
          seat: `player-position-${(r.seat ?? 0) + 1}`,
        }))
      if (seats.length < 2) {
        return json({ error: 'a match needs at least two seats', code: 'too-few-seats' }, 409)
      }

      // SEEDED FROM THE ROW, like the treachery reshuffle: a deal that used
      // Math.random could not be replayed, and a deal that used a constant
      // would be the same deal in every match ever played.
      const rng = seededRng(Number(match.rng_seed) + match.action_seq)
      // WHICH SEAT THE HOST IS SITTING IN. The row names an account; the
      // state names factions, so it is translated here rather than leaving the
      // board to look accounts up. A host who took no seat leaves the game
      // hostless, which is a table nobody can drive rather than one driven by
      // somebody who is not playing.
      const hostSeat = (roster ?? []).find(
        (r: { user_id?: string; player_id: string }) => r.user_id === match.created_by)
      const opening = openingPosition({
        seats,
        host: hostSeat?.player_id,
        // OFF THE ROW FIRST. The table agreed a game in the lobby and the row
        // is where that agreement lives; the payload is a fallback for a caller
        // that has one in mind, and 'advanced' behind both. Trusting the
        // payload alone would let whoever presses Start deal a different game
        // from the one everybody was looking at.
        mode: match.game_mode === 'basic' ? 'basic'
          : match.game_mode === 'advanced' ? 'advanced'
          : action.mode === 'basic' ? 'basic' : 'advanced',
        rng,
        closesAt: now + SETUP_SECONDS * 1000,
      })

      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: opening.state,
        p_secrets: opening.secrets,
        p_decks: opening.decks,
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)

      // AND IT STOPS BEING A LOBBY. Separate from the write above because
      // apply_match_write owns state, secrets and decks and not the row's
      // status — and this way round, an interruption leaves a dealt match
      // listed as open, which the guard at the top of this case repairs. The
      // other order would leave an active match with no board on it.
      await admin.from('matches').update({ status: 'active' }).eq('id', matchId)

      // WHAT COMES BACK IS PUBLIC ONLY. The caller dealt the game; that does
      // not make the deal theirs to read. Their own row reaches them by the
      // secrets channel, like everybody else's reaches them.
      return json({ setup: opening.state.setup, version: data[0].version })
    }

    // ── Answer a setup decision ──────────────────────────────────────────────
    // Four kinds, answered independently and in any order — the Fremen's ten,
    // the Bene Gesserit's prediction and advisor, and every other seat keeping
    // one of the four traitors dealt — plus 'ready', which is not a decision
    // but a declaration: when every seat has said it, the window closes and
    // whatever is left takes its default. See lib/dune/setup for why each
    // decision pauses setup rather than happening after it.
    case 'SETUP_ANSWER': {
      const setup = state.setup as {
        closesAt?: number
        outstanding: { kind: string; faction: string }[]
        ready?: string[]
      } | undefined
      if (!setup) return json({ error: 'setup is not open', code: 'no-setup' }, 409)
      const mode = state.mode === 'basic' ? 'basic' as const : 'advanced' as const

      let outstanding = setup.outstanding
      let ready = setup.ready ?? []
      let nextState: Record<string, unknown> = { ...state }
      const nextSecrets: Record<string, unknown> = {}

      // ── READY: a declaration, not a decision ───────────────────────────────
      // Any seated player may say they are done, decisions outstanding or not.
      // It is recorded before the expiry check on purpose: the last Ready and
      // the clock running out are the same event — everything left takes its
      // default — and handling them as one path is what keeps them agreeing.
      // Ready does not lock the seat out; answers still land until the window
      // actually closes.
      if (action.answer === 'ready') {
        if (!ready.includes(myFaction)) ready = [...ready, myFaction]
      }
      const seated = ((state.players ?? []) as { faction: string }[]).map(p => p.faction)
      const everyoneReady = allReady(ready, seated)

      // The rows this may write back, read with the service role. Two of the
      // three answers change a seat's own row — the traitor kept, and the Bene
      // Gesserit's prediction — and both have to be merged onto what is already
      // there rather than written over it, since the deal put spice in the same
      // row a moment ago.
      const { data: setupSecrets } = await admin
        .from('match_secrets').select('player_id, data').eq('match_id', matchId)
      const rows: Record<string, Record<string, unknown>> = Object.fromEntries(
        (setupSecrets ?? []).map((r) => [r.player_id as string, (r.data ?? {}) as Record<string, unknown>]))

      // ── CLOSING: THE LAST READY AND THE CLOCK ARE ONE EVENT ────────────────
      // Either way the window shuts and everything outstanding takes its
      // default — see lib/dune/setup for what each of those is and why. On
      // expiry, whoever asked and whatever they asked for pushes it along,
      // because a player who has walked away leaves nobody else able to.
      const expired = typeof setup.closesAt === 'number' && now >= setup.closesAt
      if (expired || everyoneReady) {
        let forces = [...((state.forces ?? []) as unknown[])]
        let players = [...((state.players ?? []) as { faction: string; reserves: number }[])]
        // IN DEPENDENCY ORDER, which is what defaultOrder is for. The advisor's
        // own default reads the board the Fremen's writes: placed first, it
        // would be alone in a territory the Fremen were about to walk into, and
        // would take the field as a fighter on the strength of a board that was
        // still being laid out.
        for (const decision of defaultOrder(outstanding)) {
          if (decision.kind === 'fremen-placement') {
            forces = [...forces, ...defaultFremenPlacement(decision.faction, mode)]
          } else if (decision.kind === 'advisor-placement') {
            // THE SAME TOKEN, WHOEVER PUT IT THERE. A default that skipped the
            // reserve would make running out of time worth a spare force.
            const silent = defaultAdvisorPlacement(decision.faction, forces)
            forces = [...forces, ...silent]
            players = shipAdvisor(players, decision.faction, silent)
          } else if (decision.kind === 'traitor') {
            const seatId = seatOfFaction[decision.faction]
            const row = (rows[seatId] ?? {}) as { traitorsDealt?: string[] }
            const kept = defaultTraitor(row.traitorsDealt ?? [])
            const { traitorsDealt: _dealt, ...rest } = row
            nextSecrets[seatId] = { ...rest, traitors: kept }
          }
          // A prediction nobody made is no prediction, which costs them one
          // route to victory and nothing else. There is nothing to write.
        }
        nextState = { ...state, forces, players }
        outstanding = []
      } else if (action.answer === 'ready') {
        // Recorded above; nothing else changes until the last seat says it.
      } else {
        // ANSWERABLE, not merely owed. The advisor placement is owed from the
        // moment the game is dealt and cannot be answered until the Fremen have
        // placed — the Bene Gesserit are entitled to see where those ten went
        // before choosing, because it decides whether their own force is an
        // advisor or a fighter.
        if (!answerable(outstanding, action.answer, myFaction)) {
          const owed = outstanding.some((d: { kind: string; faction: string }) =>
            d.kind === action.answer && d.faction === myFaction)
          return owed
            ? json({ error: 'the Fremen have not placed yet', code: 'blocked' }, 409)
            : json({ error: 'nothing of that kind is outstanding for you', code: 'not-outstanding' }, 409)
        }

        if (action.answer === 'fremen-placement') {
          const placed = answerFremenPlacement(myFaction, action.at ?? [], mode)
          if (!placed.ok) return json({ error: 'that placement is not legal', code: placed.refusal }, 409)
          // AN UNPLACED FEDAYKIN WALKS BACK INTO RESERVE. The reserve total
          // does not change — the elite takes the place of a plain token, the
          // same swap a player makes with the physical pieces — so the split
          // moves and the sum stays ten.
          const placedStars = placed.value.reduce(
            (n: number, f: { starred?: number }) => n + (f.starred ?? 0), 0)
          const held = mode === 'advanced' ? starredOf(myFaction) - placedStars : 0
          const players = held > 0
            ? ((state.players ?? []) as { faction: string; reserves: number }[]).map(p =>
                p.faction === myFaction
                  ? { ...p, reserves: p.reserves - held, reservesStarred: held }
                  : p)
            : state.players
          nextState = {
            ...state, players,
            forces: [...((state.forces ?? []) as unknown[]), ...placed.value],
          }
        } else if (action.answer === 'advisor-placement') {
          // AGAINST THE BOARD AS IT STANDS, which by now has the Fremen on it.
          // Whether this force is an advisor or a fighter is not a choice —
          // it is read off who else is standing in the territory chosen.
          const placed = answerAdvisorPlacement(
            myFaction,
            { territoryId: String(action.territoryId), sector: action.sector },
            (state.forces ?? []) as unknown[],
          )
          if (!placed.ok) return json({ error: 'that placement is not legal', code: placed.refusal }, 409)
          // OUT OF THEIR RESERVES. The advisor is one of the faction's twenty
          // tokens standing on the board rather than waiting off it — see
          // shipAdvisor. Adding it to the map without taking it off the pile
          // is how a faction ends up playing a token up on the table.
          nextState = {
            ...state,
            forces: [...((state.forces ?? []) as unknown[]), ...placed.value],
            players: shipAdvisor(
              (state.players ?? []) as { faction: string; reserves: number }[],
              myFaction, placed.value),
          }
        } else if (action.answer === 'prediction') {
          const seated = (roster ?? [])
            .map((r: { faction_id?: string }) => r.faction_id)
            .filter(Boolean)
          const made = answerPrediction(seated, action.faction, Number(action.turn))
          if (!made.ok) return json({ error: 'that prediction is not legal', code: made.refusal }, 409)
          // INTO THEIR OWN ROW AND NOWHERE ELSE. A prediction in public state
          // would be a secret published in the one place everybody reads, and
          // the power is worthless the moment anybody else knows it.
          nextSecrets[playerId] = { ...(rows[playerId] ?? {}), prediction: made.value }
        } else if (action.answer === 'traitor') {
          const row = (rows[playerId] ?? {}) as { traitorsDealt?: string[] }
          // CHECKED AGAINST WHAT THIS SEAT WAS DEALT, which only the server
          // knows: the four are in that seat's own row and the public ask never
          // names them, so a client sending any other leader is naming a card
          // it was not given.
          const kept = answerTraitor(row.traitorsDealt ?? [], String(action.keep))
          if (!kept.ok) return json({ error: 'that is not one of yours', code: kept.refusal }, 409)
          const { traitorsDealt: _dealt, ...rest } = row
          nextSecrets[playerId] = { ...rest, traitors: kept.value }
        } else {
          return json({ error: 'no such setup answer', code: 'unknown-answer' }, 400)
        }

        outstanding = settle(outstanding, action.answer, myFaction)
      }

      // SETUP IS OVER WHEN THE LAST ANSWER IS IN OR THE LAST SEAT IS READY,
      // and then the key goes rather than staying as an empty list — an empty
      // window still reads as a window to anything checking whether setup is
      // running.
      if (outstanding.length === 0 || everyoneReady) {
        delete nextState.setup
        nextState.awaiting = null
      } else {
        nextState.setup = { ...setup, outstanding, ready }
        nextState.awaiting = outstanding[0].faction
      }

      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: nextState,
        p_secrets: nextSecrets,
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
      return json({ outstanding, ready, version: data[0].version })
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
      // THE FACTION MATTERS, because one of them ignores the threshold
      // entirely. myFaction comes from match_players keyed on the caller's user
      // id — never from the payload, which would let a seat claim to be the one
      // faction that always qualifies.
      const granted = charityGrant(secrets, myFaction)
      if (!isEligibleForCharity(secrets, myFaction)) {
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
    //
    // THE PHASE CAN STOP. In the advanced game, worms after the first in a pile
    // are the Fremen's to place, so pile A resolves, they place what it handed
    // back, and only then is pile B revealed — per pile, because a discard pile
    // is one blow. That pause is data: see publishBlowStep below.
    case 'SPICE_BLOW': {
      return await turnTheBlow()
    }

    // ── The Fremen put their worms down ──────────────────────────────────────
    // The answer half of the pause. Worms after the first in a pile are theirs,
    // and the rule says they CAN be placed — so declining is legal and an empty
    // list is how it is said. Nothing else may answer for them, and nothing here
    // decides on their behalf.
    case 'PLACE_WORMS': {
      const pause = state.spiceBlow as SpiceBlowPauseRow | undefined
      if (!pause) return json({ error: 'no worms are waiting to be placed', code: 'no-pause' }, 409)

      // THE DEADLINE DECIDES WHO ANSWERS. Before it, the worms are the Fremen's
      // and nobody else may speak for them. After it, silence has already said
      // "declined" and any seat may push the phase along — the same rule
      // CLOSE_CHARITY follows, so a match does not hang on whoever happens to
      // be looking at the right screen.
      //
      // Declining costs them nothing that was theirs: the rule says the worms
      // CAN be placed. A deadline would not be safe on a phase where doing
      // nothing is not a legal move.
      const expired = pause.closesAt != null && now >= pause.closesAt

      // WHOSE DECISION IT IS, from the token. myFaction comes out of
      // match_players keyed on the caller's user id, so this cannot be claimed
      // by a payload — the same reason the acting seat is never in the body.
      if (!expired && myFaction !== 'fremen') {
        return json({ error: 'only the Fremen place these worms', code: 'not-your-decision' }, 403)
      }

      const { data: deckRows } = await admin
        .from('match_decks').select('deck, cards').eq('match_id', matchId)
      const piles = Object.fromEntries((deckRows ?? []).map(r => [r.deck, r.cards]))
      const held = piles['spice-blow'] as BlowCarryRow | undefined
      if (!held?.carry) {
        // The public pause says one thing and the parked continuation says
        // another. Refuse rather than starting a new blow over the top of it:
        // the deck order is in there, and inventing a replacement would deal
        // cards this match has already turned.
        return json({ error: 'the paused blow could not be found', code: 'carry-missing' }, 500)
      }

      // AND WHAT THE ANSWER IS. Past the deadline the answer is the default,
      // whoever asked and whatever they sent — including the Fremen themselves,
      // whose time is up. Honouring a late placement would make the deadline
      // advisory, and a window that only sometimes shuts is not a window.
      const at = expired ? [] : (Array.isArray(action.at) ? action.at as string[] : [])
      let step
      try {
        // A DISTINCT STREAM PER RESUMPTION, and a reproducible one. The rng is
        // not in the carry — it cannot be, being a function — so the caller
        // supplies it, and supplying `seededRng(seed)` again would replay pile
        // A's numbers for pile B. Offsetting by the number of answers so far
        // keeps every resumption reproducible from (seed, resumes) alone, which
        // is what replaying this turn later needs.
        step = placeFremenWorms(
          held.carry, at, seededRng(held.seed + held.resumes + 1),
          // The NEXT pause gets a fresh window. Carrying one deadline across
          // both piles would give the Fremen less time for the second decision
          // than the first, for no reason anyone could explain.
          now + WORM_SECONDS * 1000,
        )
      } catch (e) {
        // placeFremenWorms throws on more worms than were offered and on a
        // territory that does not exist. Both are the caller's error and
        // neither writes anything.
        return json({ error: String(e), code: 'bad-placement' }, 409)
      }
      return await publishBlowStep(step, pause.turn, held.seed, held.resumes + 1)
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
      return await openTheAuction(
        (action.order ?? []) as string[],
        (action.hands ?? {}) as Record<string, number>,
        (action.limits ?? {}) as Record<string, number>,
      )
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

      // ── THE DEADLINE ANSWERS FOR A SEAT THAT DID NOT ────────────────────
      // awaitingBy says what a timed-out stop means, and names this phase as
      // the case: the phase cannot go on until an answer exists, and if none
      // arrives by closesAt the caller supplies the one the rule says silence
      // means. For bidding that is a PASS.
      //
      // Nothing supplied it. answerBid takes closesAt only to stamp the NEXT
      // stop and never reads the current one, and this case did not check
      // either — so a window that expired stayed open for ever, waiting on a
      // seat whose time was already up. The auction simply could not end.
      //
      // ANY SEAT MAY PUSH IT ALONG once the clock has run out, the same rule
      // CLOSE_CHARITY and PLACE_WORMS follow, so a match does not hang on
      // whoever happens to be looking at the right screen. Before the deadline
      // it is still the acting seat's decision and nobody else's.
      // ── THE BREATH BETWEEN CARDS ─────────────────────────────────────────
      // A card that has just closed leaves a moment before the next may be bid
      // on, so the seat that won it can look at what it bought and the table
      // can see what it went for. The module owns no clock, so the check is
      // here — it stamps pauseUntil, this decides whether that moment has come.
      const pausedUntil = step.carry?.pauseUntil
      if (typeof pausedUntil === 'number' && now < pausedUntil) {
        return json({
          error: 'the next card is not open yet',
          code: 'between-cards',
          opensAt: pausedUntil,
        }, 409)
      }

      const expired = typeof step.closesAt === 'number' && now >= step.closesAt
      const actingFaction = expired ? step.carry.toAct : myFaction
      // A PASS, whoever asked and whatever they sent. Honouring a late bid
      // would make the deadline advisory, and a window that only sometimes
      // shuts is not a window.
      const answer = expired ? { kind: 'pass' } : action.bid
      // The purse is read for the CALLER, and on the timeout path the caller is
      // not the seat being answered for. A pass spends nothing and answerBid
      // never looks at it, so the timed-out path passes zero rather than one
      // seat's balance standing in for another's.
      const againstPurse = expired ? 0 : purse

      // The two stamps for the NEXT card, if this answer closes one: when it
      // opens, and when its own window then shuts. Both from this clock, so the
      // pause does not eat into the next bidder's fifteen seconds.
      const opensAt = now + BETWEEN_CARDS_SECONDS * 1000
      const outcome = answerBid(
        step.carry, actingFaction, answer, againstPurse, now + BID_SECONDS * 1000,
        { until: opensAt, thenClosesAt: opensAt + BID_SECONDS * 1000 })

      // A REFUSAL IS PRIVATE and changes nothing. Saying "more than you hold" to
      // the table would announce roughly what the bidder has, which is most of
      // what bidding hides — so it goes back to the caller as their own response
      // and no state is written at all.
      if (outcome.kind === 'refused') {
        return json({ error: 'bid refused', code: outcome.refusal }, 409)
      }

      // ── PAID WHEN THE HAMMER FALLS ──────────────────────────────────────
      // At the table the spice moves as each card is won. Settling the whole
      // auction at the end left a winner's purse reading full while they bid
      // on the next card — they could not see what they had left to bid WITH,
      // which is most of what a player needs to know between cards.
      //
      // So the card that just closed is settled now, on this write, whether the
      // auction goes on or has finished. Everything else about the settlement —
      // the payment order, the Emperor's redirect, the Harkonnen's second card
      // — is settleCard's, so this decides WHEN and not WHAT.
      const { data: allSecrets } = await admin
        .from('match_secrets').select('player_id, data').eq('match_id', matchId)
      // Keyed by FACTION on the way in, because that is what the auction's
      // awards name. Rows whose seat has no faction are skipped rather than
      // keyed by seat id, which would put two namespaces in one object.
      const withFaction = (allSecrets ?? []).filter((r) => factionOfSeat[r.player_id as string])
      const hands = Object.fromEntries(withFaction.map(
        (r) => [factionOfSeat[r.player_id as string], ((r.data ?? {}) as { cards?: string[] }).cards ?? []]))
      const purses = Object.fromEntries(withFaction.map(
        (r) => [factionOfSeat[r.player_id as string], readSpice((r.data ?? {}) as DuneSecrets)]))
      const byId = Object.fromEntries((allSecrets ?? []).map((r) => [r.player_id, r.data ?? {}]))

      // WHICH CARD JUST CLOSED, if any. The awards list only ever grows, so one
      // more than before means this answer ended a card — and the last entry is
      // that card. Comparing lengths rather than trusting the status: a card
      // can close on the answer that also ends the whole auction.
      const awardsNow = outcome.step.status === 'awaiting'
        ? outcome.step.carry.awards
        : outcome.step.result.awards
      const justClosed = awardsNow.length > step.carry.awards.length
        ? awardsNow[awardsNow.length - 1]
        : null

      const treacheryPile = ((deckNow ?? []).find((r) => r.deck === 'treachery')?.cards ?? []) as string[]
      let bonusDraw = {
        drawn: [] as string[], draw: treacheryPile,
        discard: (state.treacheryDiscard ?? []) as string[],
      }
      let paidSecrets: Record<string, unknown> = {}
      let bonusDue = 0

      if (justClosed) {
        // The bonus faction's second card, for THIS card only. Drawn to order
        // so nothing is pulled off the pile and put back somewhere else.
        const handAfter = (hands[BONUS_FACTION]?.length ?? 0)
          + (justClosed.winner === BONUS_FACTION ? 1 : 0)
        bonusDue = bonusCardsDue(
          [justClosed], handAfter, step.carry.limits?.[BONUS_FACTION] ?? 0)
        if (bonusDue > 0) {
          try {
            bonusDraw = drawTreachery(
              treacheryPile, (state.treacheryDiscard ?? []) as string[], bonusDue,
              (cards) => shuffleWithSeed(Number(match.rng_seed) + match.action_seq, cards))
          } catch (e) {
            return json({ error: String(e), code: 'deck-exhausted' }, 409)
          }
        }

        const paid = settleCard({
          award: justClosed,
          card: lot[justClosed.index],
          hands,
          purses,
          bonus: bonusDraw.drawn,
          limits: step.carry.limits,
          // Who is in the game, for the Emperor's redirect. From the auction's
          // own order rather than whoever happens to have a secrets row.
          seated: step.carry.order,
        })
        // Refusing here leaves the auction as it was and nothing dealt, which
        // is recoverable; dealing half of it would not be.
        if (!paid.ok) return json({ error: paid.detail, code: paid.refusal }, 409)

        // ...and back to SEAT on the way out, because match_secrets is keyed by
        // seat. A faction with no seat cannot be written to and is a bug
        // upstream rather than something to swallow here.
        for (const [faction, next] of Object.entries(paid.writes.secrets)) {
          const seatId = seatOfFaction[faction]
          if (!seatId) {
            return json({ error: `no seat holds ${faction}`, code: 'unseated-winner' }, 409)
          }
          paidSecrets[seatId] = { ...(byId[seatId] ?? {}), cards: next.hand, spice: next.spice }
        }
      }

      const paidDecks = bonusDue > 0 ? { treachery: bonusDraw.draw } : {}

      if (outcome.step.status === 'awaiting') {
        // The reveal FOLLOWS THE ROW. A card that has closed is no longer the
        // card up for purchase, and a reveal left pointing at it is one the
        // Atreides can still read after it has been dealt to somebody else.
        const nextReveal = prescienceFor({
          seated: step.carry.order, lot, index: outcome.step.carry.index,
        })
        const seatId = seatOfFaction[PRESCIENT_FACTION]
        if (seatId) {
          // MERGED ONTO THE PAYMENT, not written beside it. If this seat also
          // just won or was paid, its row is already in paidSecrets and writing
          // the reveal alone would drop the hand and purse just settled.
          paidSecrets[seatId] = withReveal(
            (paidSecrets[seatId] ?? byId[seatId] ?? {}) as Record<string, unknown>, nextReveal)
        }
        const { data, error } = await admin.rpc('apply_match_write', {
          p_match_id: matchId,
          p_expected_version: match.version,
          p_state: {
            ...state,
            auction: outcome.step,
            // A card sold mid-auction is as public as one sold at the end.
            ...(justClosed
              ? {
                lastAuction: {
                  turn: state.turn ?? 0,
                  at: now,
                  awards: [{ winner: justClosed.winner, price: justClosed.price }],
                },
              }
              : null),
            // A reshuffle for the bonus moves the discard.
            ...(bonusDue > 0 ? { treacheryDiscard: bonusDraw.discard } : null),
          },
          p_secrets: paidSecrets,
          p_decks: paidDecks,
        })
        if (error) return json({ error: error.message }, 500)
        if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
        return json({ auction: outcome.step, version: data[0].version })
      }

      // ── Settled. What is left is the unsold and the closing up ─────────────
      // The cards and the spice went out one at a time as they were won, so
      // nothing is dealt here: the auction ends by clearing itself, discarding
      // what nobody bought, and emptying the lot.
      const result = outcome.step.result
      const secretsPatch: Record<string, unknown> = { ...paidSecrets }
      // THE REVEAL IS CLEARED when the auction ends. Nothing is up for purchase
      // any more, and a reveal left behind names a card now sitting in a hand —
      // possibly somebody else's.
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
          // WHO WON AND WHAT THEY PAID ARE PUBLIC, and every client derives the
          // same line from this rather than from its own response. Winner and
          // price only: not the card, which the auction is blind to and which
          // now sits in a hand nobody else may read.
          //
          // The timestamp says WHICH settlement, because the row is
          // re-delivered on every later change and two cards in one turn can go
          // to the same seat for the same price.
          lastAuction: {
            turn: state.turn ?? 0,
            at: now,
            awards: justClosed
              ? [{ winner: justClosed.winner, price: justClosed.price }]
              : [],
          },
          // The discard is PUBLIC — a treachery discard is face up at a table.
          // The bonus draw may have reshuffled it back into the pile, so the
          // unsold join what that left rather than what was there before.
          treacheryDiscard: discardUnsold(
            bonusDraw.discard, result.unsold.map((i: number) => lot[i])),
        },
        p_secrets: secretsPatch,
        // The lot is emptied in the same write that ends the auction, so a card
        // cannot be dealt twice by a retry. The treachery pile shortens here
        // too when a bonus card came off it.
        p_decks: bonusDue > 0
          ? { 'auction-lot': [], treachery: bonusDraw.draw }
          : { 'auction-lot': [] },
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

    // ── Move the turn along ──────────────────────────────────────────────────
    // One press, one phase. Entering a phase performs that phase's own work in
    // the same write — see lib/dune/phaseAdvance for the whole design, and for
    // why the holds below stop the host too while the look-window stops only
    // everybody else.
    case 'ADVANCE_PHASE': {
      // WHO MAY PRESS. The host's faction, from the state the deal wrote; a
      // match dealt before hosts existed falls back to the row's creator, and
      // a row with neither is anybody's — an old table with no host is a table
      // with no host, not a locked one.
      const hostFaction = state.host as string | undefined
      const isHost = hostFaction ? myFaction === hostFaction
        : match.created_by ? match.created_by === user.id : true

      // THE HOLDS STOP EVERYBODY, the host included: each is a pause the rules
      // gave to a player, and each has its own after-deadline push any seat
      // may fire. Advancing over one would play their decision ahead of the
      // clock that protects it.
      const hold = advanceHold(state as never, now)
      if (hold) {
        const said: Record<string, string> = {
          'setup-not-finished': 'setup has not finished',
          'game-over': 'the game is over',
          'blow-not-turned': 'the spice blow has not been turned',
          'worms-pending': 'the blow is waiting on the Fremen',
          'charity-open': 'the charity window is still open',
          'auction-running': 'the auction is still running',
        }
        return json({
          error: said[hold.code] ?? hold.code, code: hold.code,
          ...(hold.until ? { until: hold.until } : null),
        }, 409)
      }

      // THE LOOK-WINDOW stops only the table: the host is the one seat trusted
      // to decide the table has seen enough of a phase with nothing left in it.
      if (!isHost && phaseWindowOpen(state as never, now)) {
        const clock = state.phaseClock as { closesAt: number }
        return json({
          error: 'only the host moves on this early', code: 'phase-window-open',
          until: clock.closesAt,
        }, 403)
      }

      const stamp = (turn: number, phase: string) =>
        ({ turn, phase, closesAt: now + PHASE_SECONDS * 1000 })

      // ── THE OWED STORM. A match is DEALT into Storm, so nothing ever
      // entered the phase and nothing rolled. The first press pays that debt
      // and stays put — the table sees the weather before the turn moves on —
      // and the stamp below makes the second press subject to the same look-
      // window as any other phase.
      if (state.phase === 'Storm' && state.stormMoved !== state.turn) {
        const roll = rollStorm(
          Number(state.turn), state.mode as never,
          seededRng(Number(match.rng_seed) + match.action_seq))
        const { patch } = stormEntry(state as never, roll)
        const { data, error } = await admin.rpc('apply_match_write', {
          p_match_id: matchId,
          p_expected_version: match.version,
          p_state: {
            ...state, ...patch, awaiting: null,
            phaseClock: stamp(Number(state.turn), 'Storm'),
          },
          p_secrets: {},
        })
        if (error) return json({ error: error.message }, 500)
        if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
        return json({ phase: 'Storm', turn: state.turn, stormReport: patch.stormReport, version: data[0].version })
      }

      const target = phaseAfter(state.phase as never)
      const turn = target.newTurn ? Number(state.turn) + 1 : Number(state.turn)

      // A MATCH FROM BEFORE THE LOOP can sit at Mentat Pause of turn ten with
      // no winner written — the check below never ran for it. Ending the game
      // now is the rule it missed, not an eleventh turn.
      const overrun = target.newTurn && Number(state.turn) >= TURN_LIMIT

      const base: Record<string, unknown> = {
        ...state, phase: target.phase, turn, awaiting: null,
        phaseClock: stamp(turn, target.phase),
      }
      // An expired charity window is closed by the advance that leaves it, the
      // way CLOSE_CHARITY would have. The claims stand; the window is over.
      if (state.phase === 'CHOAM Charity') delete base.charity

      /** The plain write most entries need: the pointer, and nothing else. */
      const plainly = async (
        extra: Record<string, unknown> = {}, status?: string,
        secrets: Record<string, unknown> = {},
      ) => {
        const { data, error } = await admin.rpc('apply_match_write', {
          p_match_id: matchId,
          p_expected_version: match.version,
          p_state: { ...base, ...extra },
          p_secrets: secrets,
          p_decks: {},
          ...(status ? { p_status: status } : null),
        })
        if (error) return json({ error: error.message }, 500)
        if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
        return json({ phase: target.phase, turn, ...extra, version: data[0].version })
      }

      /** Read the Bene Gesserit's prediction, theirs alone, for the verdict. */
      const predictionOf = async (): Promise<{ faction?: string; turn?: number } | null> => {
        const bgSeat = seatOfFaction['bene-gesserit']
        if (!bgSeat) return null
        const { data: row } = await admin
          .from('match_secrets').select('data')
          .eq('match_id', matchId).eq('player_id', bgSeat).maybeSingle()
        return ((row?.data ?? {}) as { prediction?: { faction?: string; turn?: number } })
          .prediction ?? null
      }

      /** End the game: the verdict into state, the row to 'complete', one write. */
      const finish = async (onState: Record<string, unknown>) => {
        const verdict = mentatVerdict(onState as never, await predictionOf())
        if (!verdict) return null
        return await plainly({ winner: verdict }, 'complete')
      }

      if (overrun) {
        // The verdict reads the board as it stands, at the turn it stands at.
        const ended = await finish({ ...state })
        if (ended) return ended
      }

      switch (target.phase) {
        // ── a new turn's weather, rolled as it is entered ──────────────────
        case 'Storm': {
          const roll = rollStorm(
            turn, state.mode as never,
            seededRng(Number(match.rng_seed) + match.action_seq))
          const { patch } = stormEntry({ ...base, turn } as never, roll)
          return await plainly({ ...patch })
        }

        // ── the cards are turned in the same write as the pointer ──────────
        case 'Spice Blow and Nexus': {
          baseState = base
          return await turnTheBlow()
        }

        // ── the claim window opens with the phase ──────────────────────────
        case 'CHOAM Charity': {
          return await plainly({
            charity: { expiresAt: now + CHARITY_WINDOW_MS, claims: [], turn },
          })
        }

        // ── the lot is drawn with inputs computed from the match ───────────
        case 'Bidding': {
          const { data: handRows } = await admin
            .from('match_secrets').select('player_id, data').eq('match_id', matchId)
          const cards: Record<string, number> = {}
          for (const r of handRows ?? []) {
            const f = factionOfSeat[r.player_id as string]
            if (f) cards[f] = (((r.data ?? {}) as { cards?: unknown[] }).cards ?? []).length
          }
          const opening = biddingOpening({
            storm: state.storm as never,
            players: (state.players ?? []) as never,
            cards,
          })
          // EVERY HAND FULL is not a refusal here, the way it is for the
          // harness's OPEN_BIDDING: the phase still happens, there is simply
          // nothing to sell, and the turn must not wedge on that.
          if (cardsOnOffer(opening.order, opening.hands, opening.limits) === 0) {
            return await plainly({ biddingSkipped: true })
          }
          baseState = base
          return await openTheAuction(opening.order, opening.hands, opening.limits)
        }

        // ── the documented half of collection pays out ─────────────────────
        case 'Spice Collection': {
          const paid = cityIncome(base as never)
          if (paid.length === 0) return await plainly()
          const { data: rows } = await admin
            .from('match_secrets').select('player_id, data').eq('match_id', matchId)
          const byId = Object.fromEntries(
            (rows ?? []).map(r => [r.player_id as string, (r.data ?? {}) as DuneSecrets]))
          const purses = Object.fromEntries(
            Object.entries(byId).map(([id, d]) => [id, readSpice(d)]))
          // Through the ledger, like charity: spice ENTERING the game from the
          // bank, one mover, auditable by reason.
          const moved = applySpiceMoves(purses, paid.flatMap(p => {
            const seatId = seatOfFaction[p.faction]
            return seatId
              ? [{ from: BANK, to: seatId, amount: p.amount, reason: 'city-income' }]
              : []
          }))
          if (!moved.ok) return json({ error: 'income could not be paid', code: moved.refusal }, 500)
          const secretsPatch = Object.fromEntries(
            Object.entries(byId)
              .filter(([id]) => moved.purses[id] !== purses[id])
              .map(([id, d]) => [id, { ...d, spice: moved.purses[id] }]))
          // THE RECEIPT IS PUBLIC on purpose: who occupies a city is on the
          // board and the payout is printed on it, so the amounts tell nobody
          // anything their eyes could not.
          return await plainly({ cityIncome: { turn, paid } }, undefined, secretsPatch)
        }

        // ── the pause that counts strongholds ──────────────────────────────
        case 'Mentat Pause': {
          const ended = await finish(base)
          return ended ?? await plainly()
        }

        // ── Revival, Shipment and Movement, Battles: not built, and said ───
        // They enter, hold the look-window so the table sees where the turn
        // is, and advance. Rules land here later; the loop does not wait for
        // them.
        default:
          return await plainly({ placeholder: true })
      }
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
