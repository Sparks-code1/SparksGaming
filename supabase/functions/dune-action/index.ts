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
import { allyShare, applySpiceMoves, BANK } from '../_shared/duneSpice.gen.ts'
import { settleCard, bonusCardsDue, BONUS_FACTION } from '../_shared/duneAuction.gen.ts'
import {
  beginAuction, answerBid, cardsOnOffer, BID_SECONDS, BETWEEN_CARDS_SECONDS,
} from '../_shared/duneBidding.gen.ts'
import { drawTreachery, discardUnsold, shuffleWithSeed, seededRng } from '../_shared/duneDeck.gen.ts'
import {
  NEXUS_SECONDS, countWorms, nexusDue, judgeProposal, nexusAllReady,
  buildSpiceDeck, resolveSpiceBlow, beginDoubleSpiceBlow, placeFremenWorms,
  applyBlowToBoard, publicSpiceDeck, WORM_SECONDS,
} from '../_shared/duneSpiceBlow.gen.ts'
import {
  rideTerritories, judgeWormRide, WORM_RIDE_SECONDS,
} from '../_shared/duneSpiceBlow.gen.ts'
import { bgFollowsShip, POLAR_SINK, POLAR_SINK_SECTOR } from '../_shared/duneShipment.gen.ts'
import { askTruthtrance, planFromRow } from '../_shared/duneTruthtrance.gen.ts'
import {
  isSuppressed, karamaAllowed, playKarama, isKaramaCardId, suppressibleRefs,
  KARAMA_GIVE_SECONDS,
} from '../_shared/duneKarama.gen.ts'
import { prescienceFor, withReveal, PRESCIENT_FACTION } from '../_shared/dunePrescience.gen.ts'
import {
  openingPosition, answerFremenPlacement, answerPrediction, answerTraitor,
  answerAdvisorPlacement, shipAdvisor, defaultFremenPlacement, defaultTraitor,
  landPlacement,
  defaultAdvisorPlacement, defaultOrder, settle, answerable, allReady,
  starredOf, SETUP_SECONDS, judgeSeats,
} from '../_shared/duneSetup.gen.ts'
import {
  charityGrant, isEligibleForCharity, readSpice, CHARITY_TOPS_UP_TO, CHARITY_WINDOW_MS,
} from '../_shared/duneCharity.gen.ts'
import {
  playGhola,
  bankDead, reviveForces, reviveLeader, emptyTanks, returnLeaderToTanks,
} from '../_shared/duneRevival.gen.ts'
import {
  hajrMayPlay,
  judgeShipment, judgeMove, landForces, liftForces, nextSeat, SHIPMENT_SECONDS,
  coOccupied, bgAdvancedFollow, landAdvisor, judgeBgFlip, flipBgForces,
} from '../_shared/duneShipment.gen.ts'
import {
  allyInterrogator,
  pendingBattles, nextAggressor, judgePlan, resolveBattle, battleLosses,
  explosionLosses, forcesInBattle, CHEAP_HERO_ID,
  BATTLE_PICK_SECONDS, BATTLE_PLAN_SECONDS, BATTLE_TRAITOR_SECONDS,
  BATTLE_VOICE_SECONDS, BATTLE_PRESCIENCE_SECONDS, BATTLE_ALLOCATE_SECONDS,
  judgeVoiceCommand, prescienceAnswer, PRESCIENCE_ASKS,
  piecesInBattle, eliteWorth, fullWithoutSpice,
  judgeAllocation, firstAllocation, allocationLosses,
  BATTLE_CAPTURE_SECONDS, capturePool, leaderOwner, allOwnLeadersDead,
  KWISATZ_HADERACH, kwisatzHaderachAvailable,
} from '../_shared/duneBattle.gen.ts'
import {
  mayAtomics, STORM_CARD_SECONDS, WEATHER_CONTROL_MAX, SHIELD_WALL_TERRITORY,
  phaseAfter, advanceHold, phaseWindowOpen, rollStorm, stormEntry, cityIncome,
  mentatVerdict, biddingOpening, stormOrder, resetDeadlines, PHASE_SECONDS, TURN_LIMIT,
  spiceHarvest, MENTAT_READY_SECONDS,
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
    wormRide?: { turn: number; territories: string[]; closesAt: number }
    turn: number
    spiceDeck: Record<string, unknown>
    spiceOnBoard: Record<string, number>
    forces: ForceRow[]
    /** Who the worms ate, for the Tanks. The blow's toTanks list. */
    dead?: ForceRow[]
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
        ...(done.wormRide ? { wormRide: done.wormRide } : null),
        // THE DEVOURED GO TO THE TANKS, in the same write that removed them
        // from the board — split across two, a crash between cremates them.
        tanks: bankDead(
          (baseState.tanks ?? emptyTanks()) as never, (done.dead ?? []) as never),
        // ── THE NEXUS ─────────────────────────────────────────────────────
        // From turn two on, the FIRST worm shown this turn calls the table
        // together for five minutes — at most once a turn however many
        // worms follow, and a blow that pauses and commits twice calls it
        // exactly once.
        ...(nexusDue({
          turn: done.turn,
          wormsBefore: countWorms(baseState.spiceDeck as never),
          wormsAfter: countWorms(done.spiceDeck as never),
          heldTurn: (baseState.nexusTurn as number | undefined) ?? null,
        })
          ? {
            nexus: { turn: done.turn, closesAt: now + NEXUS_SECONDS * 1000, ready: [] },
            nexusTurn: done.turn,
          }
          : null),
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
      toTanks?: ForceRow[]
    }
    // THE RIDES ON OFFER: everywhere a worm fed and the Fremen still stand —
    // spared by the basic advantage — they may ride after the Nexus. Derived
    // by the shared law from every meal this blow served, deck-drawn and
    // placed alike, and stamped only when the Fremen are at the table.
    const rides = seatOfFaction['fremen']
      ? rideTerritories(
        [out.a, out.b] as never,
        (out.devouredByFremen ?? []) as never)
      : []
    return await commitBlow({
      ...(rides.length
        ? { wormRide: { turn, territories: rides, closesAt: now + WORM_RIDE_SECONDS * 1000 } }
        : null),
      turn,
      spiceDeck: publicSpiceDeck({ deck: out.deck, discardA: out.discardA, discardB: out.discardB }),
      spiceOnBoard: out.spiceOnBoard,
      dead: out.toTanks ?? [],
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
      // THE STANDING SHIELD: the Fremen's ally is spared the worm unless the
      // Fremen turned the grant off — absent means protecting, per the
      // toggle's own contract. Read only while the pair actually stands.
      const shieldedAlly = (() => {
        const ps = (baseState.players ?? []) as { faction: string; ally?: string | null }[]
        const a = ps.find((p) => p.faction === 'fremen')?.ally ?? null
        if (!a || !ps.some((p) => p.faction === a)) return null
        const g = ((baseState.allyGrants ?? {}) as {
          fremen?: { shield?: boolean }
        }).fremen ?? {}
        return g.shield === false ? null : a
      })()

      // ── the advanced game: two piles, and a stop between them ────────────
      if (baseState.mode === 'advanced') {
        let step
        try {
          step = beginDoubleSpiceBlow({
            deck, discardA: shown.discardA ?? [], discardB: shown.discardB ?? [],
            forces, spiceOnBoard, storm: baseState.storm as number,
            firstTurn: turn <= 1, fremenInPlay, rng: seededRng(seed),
            spared: shieldedAlly as never,
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
          spared: shieldedAlly as never,
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
        dead: out.toTanks,
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

      // AN EXHAUSTED DECK DEGRADES, NEVER DEADLOCKS. The row is as long as
      // the cards that exist: fewer than the seats could take means fewer
      // cards auctioned, and none at all means the phase is skipped — the
      // pointer lands with nothing to bid on, and the turn walks on to
      // Revival at the next press instead of refusing forever.
      const available = (piles.treachery ?? []).length
        + ((state.treacheryDiscard ?? []) as string[]).length
      const offered = Math.min(count, available)
      if (offered === 0) {
        const { data, error } = await admin.rpc('apply_match_write', {
          p_match_id: matchId,
          p_expected_version: match.version,
          p_state: { ...baseState, biddingSkipped: true },
          p_secrets: {},
        })
        if (error) return json({ error: error.message }, 500)
        if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
        return json({ biddingSkipped: true, reason: 'deck-exhausted', version: data[0].version })
      }

      let deal
      try {
        deal = drawTreachery(
          piles.treachery ?? [], (state.treacheryDiscard ?? []) as string[], offered,
          (cards) => shuffleWithSeed(Number(match.rng_seed) + match.action_seq, cards),
        )
      } catch (e) {
        return json({ error: String(e), code: 'deck-exhausted' }, 409)
      }

      const step = beginAuction({
        turn: baseState.turn ?? 0, order, hands, limits,
        closesAt: now + BID_SECONDS * 1000,
        // the deck's truth caps the row — see beginAuction.cardCap
        cardCap: offered,
      })

      // ── Atreides prescience ─────────────────────────────────────────────
      // The card about to be bid on, written into the Atreides seat's own row.
      // Only that seat, only that card, and only if they are at the table.
      //
      // MERGED, not replaced. p_secrets upserts the whole data blob, so writing
      // { prescience } alone would take that seat's hand and purse with it —
      // this is the smallest write in the phase and the easiest place to lose
      // everything else.
      const openIndex = step.status === 'awaiting'
        // A STOPPED ADVANTAGE OPENS NOTHING: the Atreides sight of the card
        // is suppressed for this phase, so no reveal is written at all.
        && !isSuppressed((state.suppressed ?? []) as never, 'atreides' as never,
          'abilities.bidding' as never, Number(state.turn ?? 0), 'Bidding' as never)
        ? step.carry.index : -1
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

  // ── the battle settles: ONE implementation for its two triggers ──────────
  // The beat's end settles basic battles, and advanced ones where the winner
  // has nothing to choose; BATTLE_ALLOCATE settles the rest with the winner's
  // named dead. Two spellings of the settle would disagree the first time
  // either was fixed.
  const settleBattle = async (
    b: {
      order: unknown[]; at: number; fought: unknown[]
      usedLeaders?: Record<string, string>
    } & Record<string, unknown>,
    c: {
      territoryId: string; sectors: string[]; aggressor: string; defender: string
      revealed?: { plans: Record<string, unknown> }
    } & Record<string, unknown>,
    calls: string[],
    allocation: {
      plainFull: number; plainHalf: number; eliteFull: number; eliteHalf: number
    } | null,
  ): Promise<Response> => {
    // Everything the reveal decided lands in ONE write: forces to the
    // tanks, leaders down, spice moved, cards discarded, the rotation
    // stepped. `allocation` is the ADVANCED winner's named dead — null
    // settles by the basic dial-count rule.
      const { data: secretRows } = await admin
        .from('match_secrets').select('player_id, data').eq('match_id', matchId)
      const rowOf = Object.fromEntries((secretRows ?? []).map((r) => [r.player_id, r.data ?? {}]))
      const planOf = (f: string) => c.revealed!.plans[f] as {
        dial: number; spice?: number; leader?: string; cheapHero?: boolean
        weapon?: string; defence?: string
      }

      // A HARKONNEN PROXY CALL is the ally's side calling, as far as the
      // resolution cares: the ally wins the battle. The card spent and the
      // bounty collected stay the Harkonnen's — see below.
      const hkProxy2 = allyInterrogator({
        faction: 'harkonnen' as never,
        aggressor: c.aggressor as never, defender: c.defender as never,
        players: (state.players ?? []) as never,
      })
      const hkCalled = !!hkProxy2 && calls.includes('harkonnen')
      const outcome = resolveBattle({
        aggressor: {
          faction: c.aggressor as never, plan: planOf(c.aggressor),
          calledTraitor: calls.includes(c.aggressor as never)
            || (hkCalled && hkProxy2!.ally === c.aggressor),
        },
        defender: {
          faction: c.defender as never, plan: planOf(c.defender),
          calledTraitor: calls.includes(c.defender as never)
            || (hkCalled && hkProxy2!.ally === c.defender),
        },
      })

      let forces = [...((state.forces ?? []) as {
        faction: string; territoryId: string; sector: string; count: number; starred?: number
      }[])]
      let tanks = (state.tanks ?? { forces: {}, leaders: {} }) as never
      const killed: unknown[] = []
      const discard = [...((state.treacheryDiscard ?? []) as string[])]
      const revived = (state.revivedLeaders ?? []) as string[]
      const usedLeaders = { ...(b.usedLeaders ?? {}) }
      const secretsPatch: Record<string, unknown> = {}
      const moves: { from: string; to: string; amount: number; reason: 'battle' }[] = []
      const purses: Record<string, number> = {}

      // THE EXPLOSION TAKES THE TERRITORY, not the slice: the card reads
      // "all forces, leaders, and spice in this battle's territory", and a
      // bystander standing in another sector burns with the combatants.
      if (outcome.explosion) {
        for (const lift of explosionLosses(forces as never, c.territoryId)) {
          forces = liftForces(
            forces as never, lift.faction as never,
            c.territoryId, lift.sector, lift.count, lift.starred) as never
          killed.push({
            faction: lift.faction, territoryId: c.territoryId, sector: lift.sector,
            count: lift.count, ...(lift.starred > 0 ? { starred: lift.starred } : null),
          })
        }
      }
      const handCounts: Record<string, number> = {}
      for (const side of outcome.sides) {
        const f = side.faction
        const seatId = seatOfFaction[f]
        const plan = planOf(f)
        // forces to the tanks, cell by cell — already lifted whole by the
        // explosion when there was one
        // The ADVANCED winner's dead are the pieces they NAMED; everyone
        // else — and every basic battle — falls by the dial-count rule.
        const lifts = outcome.explosion ? []
          : allocation && f === outcome.winner
            ? allocationLosses(
              forces as never, f as never, c.territoryId, c.sectors, allocation)
            : battleLosses(
              forces as never, f as never, c.territoryId, c.sectors, side)
        for (const lift of lifts) {
          forces = liftForces(
            forces as never, f as never, c.territoryId, lift.sector, lift.count, lift.starred) as never
          killed.push({
            faction: f, territoryId: c.territoryId, sector: lift.sector,
            count: lift.count, ...(lift.starred > 0 ? { starred: lift.starred } : null),
          })
        }
        // the leader: dead to the tanks — UNDER ITS OWNER'S NAME, which for
        // a captured leader is not the banner it fought beneath — or
        // standing where it fought
        if (plan.leader) {
          if (side.leaderDies) {
            tanks = returnLeaderToTanks(
              tanks, (leaderOwner(plan.leader) ?? f) as never, plan.leader,
              { wasRevived: revived.includes(plan.leader) }) as never
            delete usedLeaders[plan.leader]
          } else {
            usedLeaders[plan.leader] = c.territoryId
          }
        }
        // cards out of the hand, into the discard; a called traitor card is
        // spent with them
        const row = (rowOf[seatId] ?? {}) as {
          cards?: string[]; traitors?: string[]; battlePlan?: unknown
        }
        const outCards = new Set(side.discards)
        const hand = (row.cards ?? []).filter((id) => !outCards.has(id))
        for (const id of side.discards) discard.push(id)
        const other = outcome.sides.find((s) => s.faction !== f)!
        const theirLeader = planOf(other.faction).leader
        const traitors = calls.includes(f as never) && theirLeader
          ? (row.traitors ?? []).filter((n) => n !== theirLeader)
          : row.traitors
        // A BORROWED leader has fought its one battle: home it goes, alive
        // or dead — off the Harkonnen's list either way.
        const kept = (row as { capturedLeaders?: { name: string; from: string }[] })
          .capturedLeaders
        const fielded = !!plan.leader && !!kept?.some((x) => x.name === plan.leader)
        secretsPatch[seatId] = {
          ...row, cards: hand, ...(traitors ? { traitors } : null), battlePlan: null,
          ...(fielded
            ? { capturedLeaders: kept!.filter((x) => x.name !== plan.leader) }
            : null),
        }
        handCounts[f] = hand.length
        // The explosion is the ONE thing that kills the Kwisatz Haderach.
        if (side.kwisatzDies) {
          tanks = returnLeaderToTanks(
            tanks, f as never, KWISATZ_HADERACH,
            { wasRevived: revived.includes(KWISATZ_HADERACH) }) as never
        }
        purses[seatId] = readSpice(row as never)
        for (const s of side.spice) {
          // THE WAGE OF TREACHERY IS THE CALLER'S: the law books the traitor
          // bounty to the winning side, and when the call was the Harkonnen's
          // proxy call from outside the battle, the spice is theirs instead.
          const to = hkCalled && hkProxy2!.ally === f
            && String((s as { for?: string }).for ?? '').startsWith('the traitor')
            ? seatOfFaction['harkonnen'] : seatId
          moves.push({ from: BANK, to, amount: s.amount, reason: 'battle' })
        }
        // ── ADVANCED: the plan's spice leaves for the bank, win or lose —
        // except a traitor-calling winner, whose spends the law zeroed.
        if (side.spends > 0) {
          moves.push({ from: seatId, to: BANK, amount: side.spends, reason: 'battle-spice' })
        }
      }
      // The proxy caller's row: the traitor card is spent from THEIR list —
      // the call was theirs even though the winning side was their ally's —
      // and their purse joins the table for the bounty to land in.
      if (hkCalled) {
        const hkSeat0 = seatOfFaction['harkonnen']
        const hkRow0 = (rowOf[hkSeat0] ?? {}) as { traitors?: string[] }
        const overLeader = planOf(hkProxy2!.over).leader
        secretsPatch[hkSeat0] = {
          ...hkRow0,
          ...(overLeader
            ? { traitors: (hkRow0.traitors ?? []).filter((n) => n !== overLeader) }
            : null),
        }
        purses[hkSeat0] = readSpice(hkRow0 as never)
      }
      const paid = moves.filter((m) => m.amount > 0)
      const moved = applySpiceMoves(purses, paid as never)
      if (!moved.ok) return json({ error: 'the spice could not move', code: moved.refusal }, 500)
      for (const seatId of Object.keys(secretsPatch)) {
        if (moved.purses[seatId] !== undefined) {
          (secretsPatch[seatId] as { spice?: number }).spice = moved.purses[seatId]
        }
      }

      tanks = bankDead(tanks, killed as never) as never

      // "When all of your own leaders have been killed, you must return all
      // captured leaders immediately."
      const hkSeat = seatOfFaction['harkonnen']
      if (hkSeat && allOwnLeadersDead(
        'harkonnen' as never, (tanks.leaders['harkonnen'] ?? []) as never)) {
        const hkRow = (secretsPatch[hkSeat] ?? rowOf[hkSeat] ?? {}) as {
          capturedLeaders?: unknown[]
        }
        if ((hkRow.capturedLeaders ?? []).length > 0) {
          secretsPatch[hkSeat] = { ...hkRow, capturedLeaders: [] }
        }
      }

      // THE LOSSES COUNT — the Kwisatz Haderach wakes at seven. Everyone's
      // counter moves; only the Atreides' means anything yet.
      const lostNow: Record<string, number> = {}
      for (const k of killed) {
        lostNow[k.faction] = (lostNow[k.faction] ?? 0) + k.count
      }

      // the explosion burns the spice lying there too
      const spiceOnBoard = { ...((state.spiceOnBoard ?? {}) as Record<string, number>) }
      if (outcome.clearSpice) delete spiceOnBoard[c.territoryId]

      const fought = [...b.fought, {
        territoryId: c.territoryId, aggressor: c.aggressor, defender: c.defender,
        winner: outcome.winner,
        ...(outcome.explosion ? { explosion: true } : null),
        ...(outcome.traitors.length ? { traitors: outcome.traitors } : null),
      }]

      // the rotation walks on over the board as it now stands
      const pendingAfter = pendingBattles(forces as never, state.storm as never)
      const next = nextAggressor(b.order as never, pendingAfter, b.at)
      // The one territory the Kwisatz Haderach has ridden into this turn.
      const khRode = [c.aggressor, c.defender].some((x) => !!planOf(x).kwisatz)
      const battlesAfter = next
        ? {
          ...b, at: next.at, current: null, fought, usedLeaders,
          closesAt: now + BATTLE_PICK_SECONDS * 1000,
          ...(khRode ? { kwisatzUsed: c.territoryId } : null),
        }
        : undefined

      // ── THE HARKONNEN TAKE A PRISONER from every battle they win ────────
      // The window opens when the pool is not empty; a fought-out rotation
      // is held open by `spent` until the window answers.
      const captiveFrom = state.mode === 'advanced' && outcome.winner === 'harkonnen'
        ? [c.aggressor, c.defender].find((x) => x !== 'harkonnen')
        : undefined
      const hkKeeps = hkSeat
        ? (((secretsPatch[hkSeat] ?? rowOf[hkSeat] ?? {}) as {
          capturedLeaders?: { name: string }[]
        }).capturedLeaders ?? [])
        : []
      const pool = captiveFrom
        ? capturePool({
          loser: captiveFrom as never,
          tanks: (tanks.leaders[captiveFrom] ?? []) as never,
          usedLeaders,
          territoryId: c.territoryId,
          alreadyCaptured: hkKeeps.map((x) => x.name),
        })
        : []
      const capture = pool.length > 0
        ? {
          from: captiveFrom,
          territoryId: c.territoryId,
          closesAt: now + BATTLE_CAPTURE_SECONDS * 1000,
        }
        : undefined
      const battlesOut = capture
        ? battlesAfter
          ? { ...battlesAfter, capture }
          : {
            ...b, current: null, fought, usedLeaders,
            closesAt: now + BATTLE_CAPTURE_SECONDS * 1000,
            capture, spent: true,
            ...(khRode ? { kwisatzUsed: c.territoryId } : null),
          }
        : battlesAfter

      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: {
          ...state, forces, tanks, spiceOnBoard,
          // THE PUBLIC COUNT MOVES WITH THE HAND — a discard that shrank a
          // hand while the count stood still held a whole hand back as stale.
          players: ((state.players ?? []) as {
            faction: string; handCount?: number; battleLosses?: number
          }[])
            .map((p) => ({
              ...p,
              ...(handCounts[p.faction] != null
                ? { handCount: handCounts[p.faction] } : null),
              // the losses counter moves with every settle
              ...(lostNow[p.faction]
                ? { battleLosses: (p.battleLosses ?? 0) + lostNow[p.faction] }
                : null),
            })),
          treacheryDiscard: discard,
          ...(battlesOut ? { battles: battlesOut } : { battles: undefined }),
          awaiting: next ? next.faction : null,
          lastBattle: {
            turn: state.turn ?? 0, at: now,
            territoryId: c.territoryId, aggressor: c.aggressor, defender: c.defender,
            winner: outcome.winner,
            ...(outcome.explosion ? { explosion: true } : null),
            ...(outcome.traitors.length ? { traitors: outcome.traitors } : null),
          },
        },
        p_secrets: secretsPatch,
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
      return json({
        winner: outcome.winner, explosion: outcome.explosion, traitors: outcome.traitors,
        version: data[0].version,
      })
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

      // THE ROSTER IS JUDGED BEFORE IT IS DEALT. An undealt table can be fixed
      // in the lobby; a mis-dealt one cannot be fixed at all, because the deal
      // is one destructive write over six hands. Both refusals below cost a
      // real game before they existed — see judgeSeats for what each does to a
      // board that looks finished and is not.
      const seatFault = judgeSeats(seats)
      if (seatFault) {
        const said: Record<string, string> = {
          'seat-without-faction': 'every seat must choose a faction before the game is dealt',
          'unknown-faction': 'a seat holds a faction this game does not have',
          'duplicate-faction': 'two seats hold the same faction',
          'duplicate-seat-key': 'two seats share the same player id — they would be dealt one hand between them',
        }
        return json({ error: said[seatFault] ?? seatFault, code: seatFault }, 409)
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
            forces = landPlacement(forces as never, silent) as never[]
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
            forces: landPlacement((state.forces ?? []) as never, placed.value) as never,
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
      const mode = state.mode === 'advanced' ? 'advanced' : 'basic'
      const granted = charityGrant(secrets, myFaction, mode)
      if (!isEligibleForCharity(secrets, myFaction, mode)) {
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
      // THE ALLY'S PURSE STANDS BEHIND A BIDDER'S — allies may pay for each
      // other's treachery cards, so the cap a bid is judged against is the
      // pair's spice together. The refusal stays private either way.
      const bidAlly = ((state.players ?? []) as { faction: string; ally?: string | null }[])
        .find((p) => p.faction === myFaction)?.ally ?? null
      let bidAllyPurse = 0
      if (bidAlly && seatOfFaction[bidAlly]) {
        const { data: allyRow } = await admin
          .from('match_secrets').select('data')
          .eq('match_id', matchId).eq('player_id', seatOfFaction[bidAlly]).maybeSingle()
        bidAllyPurse = readSpice((allyRow?.data ?? {}) as DuneSecrets)
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
      const againstPurse = expired ? 0 : purse + bidAllyPurse

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
      let playersAfter = ((state.players ?? []) as { faction: string; handCount?: number }[])

      if (justClosed) {
        // The bonus faction's second card, for THIS card only. Drawn to order
        // so nothing is pulled off the pile and put back somewhere else.
        const handAfter = (hands[BONUS_FACTION]?.length ?? 0)
          + (justClosed.winner === BONUS_FACTION ? 1 : 0)
        // The SAME default the settlement uses, so two computations of
        // the due cannot disagree about a missing limit.
        bonusDue = isSuppressed((state.suppressed ?? []) as never,
          BONUS_FACTION as never, 'abilities.treachery' as never,
          Number(state.turn ?? 0), 'Bidding' as never)
          ? 0
          : bonusCardsDue(
            [justClosed], handAfter, step.carry.limits?.[BONUS_FACTION] ?? Infinity)
        // THE ADVANTAGE DEGRADES LIKE THE ROW. The free card is "if there
        // are cards left": an exhausted deck gives fewer, or none, and never
        // refuses the pass that closed the sale.
        bonusDue = Math.min(bonusDue, treacheryPile.length
          + ((state.treacheryDiscard ?? []) as string[]).length)
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
          // the deck's truth caps the bonus — the degrade above measured it
          deckHolds: bonusDue,
          // Who is in the game, for the Emperor's redirect. From the auction's
          // own order rather than whoever happens to have a secrets row — and
          // WITHOUT the Emperor while their collection is suppressed: the
          // payment falls to the bank, which is the stop doing its work.
          seated: isSuppressed((state.suppressed ?? []) as never,
            'emperor' as never, 'abilities.bidding' as never,
            Number(state.turn ?? 0), 'Bidding' as never)
            ? step.carry.order.filter((f) => f !== 'emperor')
            : step.carry.order,
          // THE KARAMA FREE CARD: a winner holding the entitlement pays
          // nobody, and the entitlement is spent below in the same write.
          freeFor: (((state.karamaFreeCard ?? []) as string[])
            .includes(justClosed.winner) ? justClosed.winner : null) as never,
          // The winner's ally, whose purse stands behind the winner's. The
          // split is settleCard's own — both purses come back through
          // writes.secrets like any other settlement.
          ally: (((state.players ?? []) as { faction: string; ally?: string | null }[])
            .find((p) => p.faction === justClosed.winner)?.ally ?? null) as never,
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
        // THE PUBLIC COUNT MOVES WITH THE HAND. handCount is the row's truth
        // by another route; a hand that grew while the count stood still is
        // how every card a seat held came to be held back as stale.
        playersAfter = playersAfter.map((p) =>
          paid.writes.secrets[p.faction]
            ? { ...p, handCount: paid.writes.secrets[p.faction].hand.length }
            : p)
      }

      const paidDecks = bonusDue > 0 ? { treachery: bonusDraw.draw } : {}

      if (outcome.step.status === 'awaiting') {
        // The reveal FOLLOWS THE ROW. A card that has closed is no longer the
        // card up for purchase, and a reveal left pointing at it is one the
        // Atreides can still read after it has been dealt to somebody else.
        const nextReveal = isSuppressed((state.suppressed ?? []) as never,
          'atreides' as never, 'abilities.bidding' as never,
          Number(state.turn ?? 0), 'Bidding' as never)
          ? null
          : prescienceFor({
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
            players: playersAfter,
            auction: outcome.step,
            // A card sold mid-auction is as public as one sold at the end.
            ...(justClosed
              ? {
                karamaFreeCard: ((state.karamaFreeCard ?? []) as string[])
                  .filter((f) => f !== justClosed.winner),
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
          players: playersAfter,
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
        const carried = state.stormCarry as {
          turn: number; roll: number; closesAt: number
          steered?: string; atomics?: string
        } | undefined
        if (carried && carried.turn === Number(state.turn)) {
          // ── SECOND BEAT: the window has run out — advanceHold gated the
          // early press — and the storm moves AS CALCULATED, against the
          // Wall as it stands NOW: a detonation in between is exactly what
          // the beat exists for.
          const { patch } = stormEntry(state as never, carried.roll)
          const moved9 = {
            ...state, ...patch, awaiting: null,
            stormReport: {
              ...(patch.stormReport as object),
              ...(carried.steered ? { steered: carried.steered } : null),
              ...(carried.atomics ? { atomics: carried.atomics } : null),
            },
            phaseClock: stamp(Number(state.turn), 'Storm'),
          } as Record<string, unknown>
          delete moved9.stormCarry
          const { data, error } = await admin.rpc('apply_match_write', {
            p_match_id: matchId,
            p_expected_version: match.version,
            p_state: moved9,
            p_secrets: {},
          })
          if (error) return json({ error: error.message }, 500)
          if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
          return json({ phase: 'Storm', turn: state.turn, stormReport: moved9.stormReport, version: data[0].version })
        }
        const roll = rollStorm(
          Number(state.turn), state.mode as never,
          seededRng(Number(match.rng_seed) + match.action_seq))
        // THE PRINTED BEAT between calculated and moved: from turn two,
        // when some seat could legally answer with Family Atomics, the roll
        // is PUBLISHED — as the dials are at the table — and the marker
        // waits its window. With nobody in reach of the Wall the storm
        // moves in the same press, as it always did.
        const anyAtomics = Number(state.turn) >= 2
          && ((state.players ?? []) as { faction: string }[]).some((p) =>
            mayAtomics((state.forces ?? []) as never, p.faction as never, state.storm as never))
        if (anyAtomics) {
          const { data, error } = await admin.rpc('apply_match_write', {
            p_match_id: matchId,
            p_expected_version: match.version,
            p_state: {
              ...state, awaiting: null,
              stormCarry: {
                turn: Number(state.turn), roll,
                closesAt: now + STORM_CARD_SECONDS * 1000,
              },
            },
            p_secrets: {},
          })
          if (error) return json({ error: error.message }, 500)
          if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
          return json({ phase: 'Storm', stormCalculated: roll, version: data[0].version })
        }
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
      // A free-card entitlement never used lapses with the auction — the
      // card was spent when it was played, as at the table.
      if (state.phase === 'Bidding') delete base.karamaFreeCard
      // An unridden worm is a ride declined: the advance past the deadline
      // clears it, the same shape as charity's window — and an outlived
      // Nexus goes with it, its private proposals inert by their turn
      // stamps without a cleanup write.
      if (state.phase === 'Spice Blow and Nexus') {
        delete base.wormRide
        delete base.nexus
      }
      // The pause's ready-up window ends with the pause: the advance that
      // moves the turn marker is what it was counting down to.
      if (state.phase === 'Mentat Pause') delete base.mentat
      // ── ALLIES SEPARATE, OR ARE SEPARATED ───────────────────────────────
      // Leaving the shipment phase with a pair still sharing ground (the
      // Polar Sink excepted), the rule's teeth close: the ally LATER in
      // storm order abandons the shared territories, those forces to the
      // tanks. The live pass refused while they shared — this is what
      // running the clock out instead costs. Advisors are not forces and
      // neither share ground nor are swept.
      if (state.phase === 'Shipment and Movement') {
        const seatedPairs = ((state.players ?? []) as {
          faction: string; ally?: string | null
        }[]).flatMap((p) =>
          p.ally && String(p.faction) < String(p.ally)
            ? [[p.faction, p.ally] as const] : [])
        if (seatedPairs.length > 0) {
          const order = stormOrder(state.storm as never, (state.players ?? []) as never)
          for (const [x, y] of seatedPairs) {
            const shared = coOccupied((base.forces ?? []) as never, x as never, y as never)
            if (shared.length === 0) continue
            const later = order.indexOf(x as never) > order.indexOf(y as never) ? x : y
            const rows = (base.forces ?? []) as {
              faction: string; territoryId: string; posture?: string
            }[]
            const leaving = rows.filter((f) => f.faction === later
              && shared.includes(f.territoryId) && f.posture !== 'advisor')
            base.forces = rows.filter((f) => !leaving.includes(f))
            base.tanks = bankDead(
              (base.tanks ?? emptyTanks()) as never, leaving as never)
          }
        }
      }

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

      /**
       * What the verdict needs from the secrets: the Bene Gesserit's
       * prediction, and every purse for the strongholds tiebreak.
       *
       * READ HERE, JUDGED IN THE BUNDLE, PUBLISHED ONLY WHEN THE GAME ENDS.
       * The verdict itself carries no amount — the pure function returns only
       * { factions, reason, turn }, and the suite holds it to that shape. The
       * purses go public exactly once, in the same write as the winner:
       * screens come down at the table, and a shared or spice-broken victory
       * is legible only against the numbers. A finish that failed to write
       * leaves them secret, because the reveal rides the winner or not at all.
       */
      const heldForVerdict = async () => {
        const { data: rows } = await admin
          .from('match_secrets').select('player_id, data').eq('match_id', matchId)
        const spice: Record<string, number> = {}
        let prediction: { faction?: string; turn?: number } | null = null
        for (const r of rows ?? []) {
          const fac = factionOfSeat[r.player_id as string]
          if (!fac) continue
          const d = (r.data ?? {}) as DuneSecrets & { prediction?: { faction?: string; turn?: number } }
          spice[fac] = readSpice(d)
          if (fac === 'bene-gesserit') prediction = d.prediction ?? null
        }
        return { spice, prediction }
      }

      /** End the game: the verdict into state, the row to 'complete', one write. */
      const finish = async (onState: Record<string, unknown>) => {
        const held = await heldForVerdict()
        const verdict = mentatVerdict(onState as never, held.prediction, held.spice)
        if (!verdict) return null
        return await plainly({ winner: verdict, spiceRevealed: held.spice }, 'complete')
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
          // THE HARVEST FIRST — the basic game's whole phase: stacks on the
          // blows' markers lift spice off the board. Then the advanced
          // cities' printed income. Both land in ONE write, and the same
          // write shrinks the piles the harvest emptied.
          const harvest = spiceHarvest(base as never)
          const paid = cityIncome(base as never)
          if (harvest.collected.length === 0 && paid.length === 0) return await plainly()
          const { data: rows } = await admin
            .from('match_secrets').select('player_id, data').eq('match_id', matchId)
          const byId = Object.fromEntries(
            (rows ?? []).map(r => [r.player_id as string, (r.data ?? {}) as DuneSecrets]))
          const purses = Object.fromEntries(
            Object.entries(byId).map(([id, d]) => [id, readSpice(d)]))
          // Through the ledger, like charity: one mover, auditable by
          // reason — the harvest as 'spice-harvest', the income as
          // 'city-income'.
          const moved = applySpiceMoves(purses, [
            ...harvest.collected.flatMap(p => {
              const seatId = seatOfFaction[p.faction]
              return seatId
                ? [{ from: BANK, to: seatId, amount: p.amount, reason: 'spice-harvest' }]
                : []
            }),
            ...paid.flatMap(p => {
              const seatId = seatOfFaction[p.faction]
              return seatId
                ? [{ from: BANK, to: seatId, amount: p.amount, reason: 'city-income' }]
                : []
            }),
          ])
          if (!moved.ok) return json({ error: 'income could not be paid', code: moved.refusal }, 500)
          const secretsPatch = Object.fromEntries(
            Object.entries(byId)
              .filter(([id]) => moved.purses[id] !== purses[id])
              .map(([id, d]) => [id, { ...d, spice: moved.purses[id] }]))
          // THE RECEIPTS ARE PUBLIC on purpose: the piles and the stacks are
          // on the board and the rates are printed, so the amounts tell
          // nobody anything their eyes could not.
          return await plainly({
            spiceOnBoard: harvest.spiceOnBoard,
            ...(harvest.collected.length
              ? { spiceCollection: { turn, collected: harvest.collected } }
              : null),
            ...(paid.length ? { cityIncome: { turn, paid } } : null),
          }, undefined, secretsPatch)
        }

        // ── the pause that counts strongholds ──────────────────────────────
        case 'Mentat Pause': {
          const ended = await finish(base)
          // NO WINNER: one minute for the table to think about its next
          // move. Everyone ready — or the clock — frees the advance that
          // moves the turn marker.
          return ended ?? await plainly({
            mentat: { turn, closesAt: now + MENTAT_READY_SECONDS * 1000, ready: [] },
          })
        }

        // ── the rotation opens with the phase ──────────────────────────────
        case 'Shipment and Movement': {
          const order = stormOrder(state.storm as never, (state.players ?? []) as never)
          const shipping = {
            turn, order, at: 0, done: {},
            closesAt: now + SHIPMENT_SECONDS * 1000,
          }
          // THE ATREIDES SEE THE TOP OF THE SPICE DECK — their movement
          // prescience, the same shape as their bidding one: written into
          // their own secrets row, reaching no other seat and no shared
          // state. Stamped with the turn so a stale glimpse reads as stale.
          let seer: Record<string, unknown> = {}
          const seerSeat = seatOfFaction['atreides']
          if (seerSeat) {
            const { data: deckRow } = await admin
              .from('match_decks').select('cards')
              .eq('match_id', matchId).eq('deck', 'spice').maybeSingle()
            const top = ((deckRow?.cards ?? []) as unknown[])[0]
            if (top) {
              const { data: theirs } = await admin
                .from('match_secrets').select('data')
                .eq('match_id', matchId).eq('player_id', seerSeat).maybeSingle()
              seer = { [seerSeat]: { ...(theirs?.data ?? {}), spiceReveal: { turn, card: top } } }
            }
          }
          // THE RING FOLLOWS THE CLOCK. awaiting is how the board marks the
          // seat the game waits on — the worm pause uses it — and a rotation
          // that never set it left the circle unlit while a timer ran.
          return await plainly({ shipping, awaiting: order[0] }, undefined, seer)
        }

        // ── Battles: the board demands them, the rotation fights them ─────
        case 'Battles': {
          const order = stormOrder(state.storm as never, (state.players ?? []) as never)
          const pending = pendingBattles((base.forces ?? []) as never, base.storm as never)
          const first = nextAggressor(order as never, pending, 0)
          // A board with nothing to fight over passes straight through.
          if (!first) return await plainly()
          const battles = {
            turn, order, at: first.at, current: null, fought: [],
            usedLeaders: {}, closesAt: now + BATTLE_PICK_SECONDS * 1000,
          }
          return await plainly({ battles, awaiting: first.faction })
        }

        // ── The rest: not built, and said ──────────────────────────────────
        // They enter, hold the look-window so the table sees where the turn
        // is, and advance. Rules land here later; the loop does not wait for
        // them.
        default:
          return await plainly({ placeholder: true })
      }
    }

    // ── Revival: the Tanks pay out ───────────────────────────────────────────
    // Forces to RESERVES, never the board; spice to the BANK, never the
    // Emperor — that redirect is treachery's alone. The rules live in the
    // shared bundle (lib/dune/revival); what is here is the part only a
    // server can do: the purse, and the per-turn ledger.
    // ── Shipment and Movement: the acting seat's two halves ─────────────────
    // The rules ride in the shared bundle (lib/dune/shipment); what is here is
    // the rotation's bookkeeping, the purse, and who is paid — the Guild's
    // shipping monopoly makes the payee a seat, sometimes, and a payment to a
    // seat is two secrets rows in one transaction.
    case 'SHIP': {
      const w = state.shipping as
        {
          turn: number; order: string[]; at: number
          done: { shipped?: boolean; moved?: boolean; karamaRate?: boolean }
          closesAt: number
        } | undefined
      if (state.phase !== 'Shipment and Movement' || !w) {
        return json({ error: 'the turn is not at shipment', code: 'wrong-phase' }, 409)
      }
      if (w.order[w.at] !== myFaction) {
        return json({ error: 'not your turn to ship', code: 'not-your-turn' }, 403)
      }
      if (w.done.shipped) return json({ error: 'you have shipped', code: 'already-shipped' }, 409)
      // SHIPMENT THEN MOVEMENT, inside one turn: a seat that has moved has
      // closed its shipping half.
      if (w.done.moved) return json({ error: 'you have already moved', code: 'already-moved' }, 409)

      const { data: row } = await admin
        .from('match_secrets').select('data')
        .eq('match_id', matchId).eq('player_id', playerId).maybeSingle()
      const secrets = (row?.data ?? {}) as DuneSecrets
      const me = ((state.players ?? []) as {
        faction: string; reserves: number; reservesStarred?: number
      }[]).find(p => p.faction === myFaction)

      // THE ALLY, twice over: their ground refuses the landing, and their
      // purse stands behind the fee. Read once, used by judge and payment.
      const shipAlly = ((state.players ?? []) as { faction: string; ally?: string | null }[])
        .find((p) => p.faction === myFaction)?.ally ?? null
      const allySeat = shipAlly ? seatOfFaction[shipAlly] : undefined
      let allyRowData: Record<string, unknown> | null = null
      let shipAllySpice = 0
      if (allySeat && allySeat !== playerId) {
        const { data: a } = await admin
          .from('match_secrets').select('data')
          .eq('match_id', matchId).eq('player_id', allySeat).maybeSingle()
        allyRowData = (a?.data ?? {}) as Record<string, unknown>
        shipAllySpice = readSpice(allyRowData as never)
      }

      const kind = (action.kind ?? 'off-planet') as 'off-planet' | 'cross' | 'to-reserves'
      const count = Number(action.count ?? 0)
      const starred = Number(action.starred ?? 0)
      // THE GUILD'S KARAMA BAN: an off-planet shipment stopped for this
      // seat, this turn — refused at the door, whatever else is legal.
      if (kind === 'off-planet' && ((state.karamaShipBan ?? []) as {
        faction: string; turn: number
      }[]).some((b) => b.faction === myFaction && b.turn === Number(state.turn))) {
        return json({ error: 'a Karama has stopped your shipment', code: 'karama-stopped' }, 409)
      }
      const karamaRated = !!w.done.karamaRate
      const judged = judgeShipment({
        faction: myFaction as never, kind, count, starred,
        to: action.to as never, from: action.from as never,
        forces: (state.forces ?? []) as never,
        reserves: me?.reserves ?? 0,
        reservesStarred: me?.reservesStarred ?? 0,
        // A KARAMA-RATED shipment is affordability-checked below at the
        // karama price, not the sheet's — the judge sees a bottomless purse.
        spice: readSpice(secrets) + (karamaRated ? 1_000_000 : 0),
        storm: state.storm as never,
        guildSeated: 'spacing-guild' in seatOfFaction,
        ally: shipAlly as never,
        allySpice: shipAllySpice,
      })
      if (!judged.ok) return json({ error: 'that shipment is not legal', code: judged.refusal }, 409)
      // ── the fee, as the cards and the stops leave it ────────────────────
      // Karama rate: half the shipper's OWN rate, paid to the bank and never
      // the Guild. A suppressed Guild collection also falls to the bank.
      let shipFee = judged.cost
      let shipFeeTo: 'bank' | 'guild' = judged.payee
      if (karamaRated && kind !== 'to-reserves' && action.to) {
        const k = shipCost({
          faction: myFaction as never, kind,
          territoryId: (action.to as { territoryId: string }).territoryId,
          count, guildSeated: false, guildAllied: true,
        })
        shipFee = k.cost
        shipFeeTo = 'bank'
        if (shipFee > readSpice(secrets) + shipAllySpice) {
          return json({ error: 'that shipment is not legal', code: 'cannot-pay' }, 409)
        }
      }
      if (isSuppressed((state.suppressed ?? []) as never,
        'spacing-guild' as never, 'abilities.shipment' as never,
        Number(state.turn ?? 0), 'Shipment and Movement' as never)) {
        shipFeeTo = 'bank'
      }

      // ── the board and the reserves ──────────────────────────────────────
      let forces = (state.forces ?? []) as never[]
      let players = (state.players ?? []) as typeof me[]
      const from = action.from as { territoryId: string; sector: string } | undefined
      if (kind === 'to-reserves' && from) {
        forces = liftForces(forces as never, myFaction as never,
          from.territoryId, from.sector, count, starred) as never[]
        players = players.map(p => p?.faction === myFaction
          ? {
            ...p, reserves: p.reserves + (count - starred),
            ...(starred > 0 ? { reservesStarred: (p.reservesStarred ?? 0) + starred } : null),
          }
          : p)
      } else if (kind === 'cross' && from && judged.sector) {
        forces = liftForces(forces as never, myFaction as never,
          from.territoryId, from.sector, count, starred) as never[]
        forces = landForces(forces as never, myFaction as never,
          (action.to as { territoryId: string }).territoryId, judged.sector, count, starred) as never[]
      } else if (judged.sector) {
        forces = landForces(forces as never, myFaction as never,
          (action.to as { territoryId: string }).territoryId, judged.sector, count, starred) as never[]
        players = players.map(p => p?.faction === myFaction
          ? {
            ...p, reserves: p.reserves - (count - starred),
            ...(starred > 0 ? { reservesStarred: (p.reservesStarred ?? 0) - starred } : null),
          }
          : p)
      }

      // ── the fee, to the bank or to the Guild ────────────────────────────
      // A PAYMENT TO A SEAT IS TWO ROWS: the payer's purse down, the Guild's
      // up, in the same transaction — the ledger holds the arithmetic.
      const guildSeat = seatOfFaction['spacing-guild']
      const paySeat = shipFeeTo === 'guild' && guildSeat && guildSeat !== playerId
      const secretsPatch: Record<string, unknown> = {}
      if (shipFee > 0) {
        const purses: Record<string, number> = { [playerId]: readSpice(secrets) }
        let guildRow: Record<string, unknown> = {}
        if (paySeat) {
          const { data: g } = await admin
            .from('match_secrets').select('data')
            .eq('match_id', matchId).eq('player_id', guildSeat).maybeSingle()
          guildRow = (g?.data ?? {}) as Record<string, unknown>
          purses[guildSeat] = readSpice(guildRow as never)
        }
        if (allySeat && allyRowData && !(allySeat in purses)) {
          purses[allySeat] = shipAllySpice
        }
        // OWN PURSE FIRST, the ally's for what is left — the same split the
        // settlement uses. An ally who IS the payee (a Guild allied with the
        // shipper) covering the remainder from their own purse nets nothing,
        // so that move is dropped rather than booked.
        const share = allyShare(shipFee, readSpice(secrets))
        const feeTo = paySeat ? guildSeat : BANK
        const moved = applySpiceMoves(purses, ([
          ...(share.own > 0
            ? [{ from: playerId, to: feeTo, amount: share.own, reason: 'shipment' }]
            : []),
          ...(share.ally > 0 && allySeat
            ? [{ from: allySeat, to: feeTo, amount: share.ally, reason: 'shipment' }]
            : []),
        ] as never[]).filter((m) => (m as { from: string; to: string }).from
          !== (m as { from: string; to: string }).to) as never)
        if (!moved.ok) return json({ error: 'the spice could not move', code: moved.refusal }, 500)
        secretsPatch[playerId] = { ...secrets, spice: moved.purses[playerId] }
        if (paySeat) secretsPatch[guildSeat] = { ...guildRow, spice: moved.purses[guildSeat] }
        if (allySeat && allyRowData && allySeat !== guildSeat
          && moved.purses[allySeat] !== shipAllySpice) {
          secretsPatch[allySeat] = { ...allyRowData, spice: moved.purses[allySeat] }
        }
      }

      // THE SEAT KEEPS ITS TURN: the move is still to make, so the ring
      // stays where it is and the rotation does not step.
      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: {
          ...state,
          // THE WATCHERS FOLLOW. Basic: one fighter into the Polar Sink,
          // automatic — the basic game leaves them no decision. ADVANCED:
          // one ADVISOR into the shipper's own territory, under the
          // Sisterhood's standing order (on unless turned off), stamped
          // with the turn — a fresh watcher may not flip while anyone else
          // stands there. Never the Fremen's walks, in either game.
          ...(() => {
            const bgMode = state.mode === 'advanced' ? 'advanced' : 'basic'
            const bgHasReserves = players.some((p) =>
              p?.faction === 'bene-gesserit' && p.reserves > 0)
            const bgSpend = () => players.map((p) => p?.faction === 'bene-gesserit'
              ? { ...p, reserves: p.reserves - 1 }
              : p)
            if (bgFollowsShip(myFaction as never, kind, bgMode) && bgHasReserves) {
              return {
                forces: landForces(
                  forces as never, 'bene-gesserit' as never,
                  POLAR_SINK, POLAR_SINK_SECTOR as never, 1, 0),
                players: bgSpend(),
              }
            }
            if (bgAdvancedFollow(myFaction as never, kind, bgMode)
              && bgHasReserves && state.bgFollowShips !== false && judged.sector) {
              return {
                forces: landAdvisor(
                  forces as never,
                  (action.to as { territoryId: string }).territoryId,
                  judged.sector, Number(state.turn ?? 0)) as never,
                players: bgSpend(),
              }
            }
            return { forces, players }
          })(),
          shipping: { ...w, done: { ...w.done, shipped: true } },
        },
        p_secrets: secretsPatch,
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
      return json({ cost: shipFee, paidTo: shipFeeTo, version: data[0].version })
    }

    case 'MOVE': {
      const w = state.shipping as
        {
          turn: number; order: string[]; at: number
          done: { shipped?: boolean; moved?: boolean; hajr?: boolean; hajrMoved?: boolean }
          closesAt: number
        } | undefined
      if (state.phase !== 'Shipment and Movement' || !w) {
        return json({ error: 'the turn is not at movement', code: 'wrong-phase' }, 409)
      }
      if (w.order[w.at] !== myFaction) {
        return json({ error: 'not your turn to move', code: 'not-your-turn' }, 403)
      }
      // HAJR HOLDS THE TURN OPEN: a played Hajr owes one more movement, so
      // the first move does not close the turn and a second is taken like
      // the first — the same group again, or another.
      if (w.done.moved && !(w.done.hajr && !w.done.hajrMoved)) {
        return json({ error: 'you have moved', code: 'already-moved' }, 409)
      }

      const gather = (Array.isArray(action.gather) ? action.gather : []) as
        { sector: string; count: number; starred?: number }[]
      const judged = judgeMove({
        faction: myFaction as never,
        from: String(action.from ?? ''),
        gather,
        to: action.to as never,
        forces: (state.forces ?? []) as never,
        storm: state.storm as never,
        ally: (((state.players ?? []) as { faction: string; ally?: string | null }[])
          .find((p) => p.faction === myFaction)?.ally ?? null) as never,
      })
      if (!judged.ok) return json({ error: 'that move is not legal', code: judged.refusal }, 409)

      let forces = (state.forces ?? []) as never[]
      let starredMoved = 0
      for (const g of gather) {
        forces = liftForces(forces as never, myFaction as never,
          String(action.from), g.sector, g.count, g.starred ?? 0) as never[]
        starredMoved += g.starred ?? 0
      }
      forces = landForces(forces as never, myFaction as never,
        (action.to as { territoryId: string }).territoryId, judged.sector,
        judged.moving, starredMoved) as never[]

      // MOVEMENT CLOSES THE SEAT'S TURN — shipment came first or not at
      // all — so the rotation steps on in the same write; off the end of the
      // order the window is deleted. UNLESS a Hajr still owes its movement:
      // then this move marks the ordinary one taken and the turn stands.
      const closes = w.done.moved || !w.done.hajr
      const done2 = w.done.moved
        ? { ...w.done, hajrMoved: true }
        : { ...w.done, moved: true }
      const stepped = closes
        ? nextSeat({ ...w, done: done2 } as never, now + SHIPMENT_SECONDS * 1000)
        : null
      const rest = closes
        ? { ...state, forces, awaiting: stepped ? stepped.order[stepped.at] : null }
        : { ...state, forces, awaiting: myFaction }
      if (closes && !stepped) delete (rest as Record<string, unknown>).shipping

      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: closes
          ? (stepped ? { ...rest, shipping: stepped } : rest)
          : { ...rest, shipping: { ...w, done: done2 } },
        p_secrets: {},
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
      return json({ moved: judged.moving, to: judged.sector, version: data[0].version })
    }

    // ── done, or the clock was ───────────────────────────────────────────────
    // BEFORE THE DEADLINE, only the acting seat ends its own turn. After it,
    // silence has spent whatever was unspent and any seat may push the
    // rotation along — the same rule every pause follows.
    case 'PASS_TURN': {
      const w = state.shipping as
        { turn: number; order: string[]; at: number; done: Record<string, boolean>; closesAt: number } | undefined
      if (state.phase !== 'Shipment and Movement' || !w) {
        return json({ error: 'the turn is not at shipment', code: 'wrong-phase' }, 409)
      }
      const expired = now >= w.closesAt
      if (!expired && w.order[w.at] !== myFaction) {
        return json({ error: 'not your turn to pass', code: 'not-your-turn' }, 403)
      }
      // ALLIES MUST SEPARATE DURING SHIPMENT. A live pass is refused only
      // when this seat is the LATER of a pair still sharing ground — the
      // earlier ally's turn is already spent, so this pass was the last
      // chance. The expired path stays anyone's push (the clock is the
      // backstop), and the phase's end has the teeth.
      if (!expired) {
        const passAlly = ((state.players ?? []) as { faction: string; ally?: string | null }[])
          .find((p) => p.faction === myFaction)?.ally ?? null
        if (passAlly) {
          const shared = coOccupied(
            (state.forces ?? []) as never, myFaction as never, passAlly as never)
          const allyIdx = w.order.indexOf(passAlly)
          if (shared.length > 0 && allyIdx !== -1 && allyIdx < w.at) {
            return json({
              error: 'allies must separate during shipment',
              code: 'separate-from-ally', territories: shared,
            }, 409)
          }
        }
      }
      const stepped = nextSeat(w as never, now + SHIPMENT_SECONDS * 1000)
      const rest = { ...state, awaiting: stepped ? stepped.order[stepped.at] : null }
      if (!stepped) delete (rest as Record<string, unknown>).shipping
      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: stepped ? { ...rest, shipping: stepped } : rest,
        p_secrets: {},
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
      return json({
        next: stepped ? stepped.order[stepped.at] : null,
        version: data[0].version,
      })
    }

    case 'REVIVE': {
      if (state.phase !== 'Revival') {
        return json({ error: 'the turn is not at revival', code: 'wrong-phase' }, 409)
      }
      const turn = typeof state.turn === 'number' ? state.turn : 0
      const tanks = (state.tanks ?? emptyTanks()) as never
      // THE TURN'S LEDGER, stamped like charity's window: last turn's
      // revivals never count against this turn's allowance.
      const ledger = state.revival as
        { turn: number; done: Record<string, { forces: number; starred: number; leader?: string }> } | undefined
      const done = ledger?.turn === turn ? { ...ledger.done } : {}
      const soFar = done[myFaction] ?? { forces: 0, starred: 0 }

      // The purse, theirs alone, read to be spent.
      const { data: row } = await admin
        .from('match_secrets').select('data')
        .eq('match_id', matchId).eq('player_id', playerId).maybeSingle()
      const secrets = (row?.data ?? {}) as DuneSecrets
      const spice = readSpice(secrets)

      // ── which revival this is ──────────────────────────────────────────
      // THE STANDING REVIVAL GRANTS, read only while the pair stands: a
      // Fremen ally's standard three are free; an Emperor ally may reach
      // for three extras at the Emperor's expense — whose purse is read
      // here to be spent, exactly like the reviver's own.
      const reviveAlly = ((state.players ?? []) as { faction: string; ally?: string | null }[])
        .find((p) => p.faction === myFaction)?.ally ?? null
      const grants = (state.allyGrants ?? {}) as {
        fremen?: { revivals?: boolean }
        emperor?: { revivals?: boolean }
      }
      const freeGrant = reviveAlly === 'fremen' && grants.fremen?.revivals === true
      const patronSeat = reviveAlly === 'emperor' && grants.emperor?.revivals === true
        ? seatOfFaction['emperor'] : undefined
      let patronRow: Record<string, unknown> | null = null
      if (patronSeat) {
        const { data: e } = await admin
          .from('match_secrets').select('data')
          .eq('match_id', matchId).eq('player_id', patronSeat).maybeSingle()
        patronRow = (e?.data ?? {}) as Record<string, unknown>
      }

      const asked = action.leader
        ? reviveLeader({
            faction: myFaction as never, tanks, leader: String(action.leader), soFar, spice,
          })
        : reviveForces({
            faction: myFaction as never, tanks,
            plain: Number(action.plain ?? 0), starred: Number(action.starred ?? 0),
            soFar, spice,
            freeGrant,
            patron: patronRow ? { spice: readSpice(patronRow as never) } : null,
          })
      if (!asked.ok) {
        return json({ error: 'that revival is not legal', code: asked.refusal }, 409)
      }
      const patronCost = 'patronCost' in asked ? asked.patronCost : 0

      // TO THE BANK. Not the Emperor: their redirect is written on the
      // treachery rules and nowhere else.
      const moved = applySpiceMoves(
        {
          [playerId]: spice,
          ...(patronSeat && patronRow ? { [patronSeat]: readSpice(patronRow as never) } : null),
        },
        [
          ...(asked.cost > 0
            ? [{ from: playerId, to: BANK, amount: asked.cost, reason: 'revival' as const }]
            : []),
          // THE EXTRAS ARE THE EMPEROR'S BILL, to the bank like every
          // revival — "paying spice (directly to the bank)", the card says.
          ...(patronCost > 0 && patronSeat
            ? [{ from: patronSeat, to: BANK, amount: patronCost, reason: 'revival' as const }]
            : []),
        ],
      )
      if (!moved.ok) return json({ error: 'the spice could not move', code: moved.refusal }, 500)

      // TO RESERVES, never the board. The board changes only by shipment.
      const players = ((state.players ?? []) as {
        faction: string; reserves: number; reservesStarred?: number
      }[]).map(p => {
        if (p.faction !== myFaction || 'leader' in asked) return p
        const back = (asked as { toReserves: { plain: number; starred: number } }).toReserves
        return {
          ...p,
          reserves: p.reserves + back.plain,
          ...(back.starred > 0
            ? { reservesStarred: (p.reservesStarred ?? 0) + back.starred }
            : null),
        }
      })

      done[myFaction] = asked.done
      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: {
          ...state, tanks: asked.tanks, players,
          revival: { turn, done },
          // REMEMBERED FOR GOOD: a once-revived leader killed again returns
          // to the tanks FACE DOWN and waits out the rotation — see
          // returnLeaderToTanks. Public, like the revival that earned it.
          ...('leader' in asked
            ? {
              revivedLeaders: [...new Set([
                ...((state.revivedLeaders ?? []) as string[]), asked.leader,
              ])],
            }
            : null),
        },
        p_secrets: {
          [playerId]: { ...secrets, spice: moved.purses[playerId] },
          // THE PATRON'S PURSE moves in the same transaction as the
          // reviver's — the Emperor's bill is not a second write.
          ...(patronSeat && patronRow && patronCost > 0
            ? { [patronSeat]: { ...patronRow, spice: moved.purses[patronSeat] } }
            : null),
        },
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
      // The cost is the caller's own business and goes back to them alone —
      // like charity's grant, it is not written where the table reads.
      return json({
        cost: asked.cost,
        ...('leader' in asked ? { leader: asked.leader } : { toReserves: asked.toReserves }),
        version: data[0].version,
      })
    }

    // ── Battles: pick, plan, the traitor beat, resolution ──────────────────
    // The rules ride in the shared bundle (lib/dune/battle); what is here is
    // what only the server can do — the hidden plans in match_secrets, the
    // simultaneous publish, and the one write that moves forces, tanks,
    // spice, hands and discards together.
    case 'BATTLE_PICK': {
      const b = state.battles
      if (state.phase !== 'Battles' || !b) {
        return json({ error: 'the turn is not at battles', code: 'wrong-phase' }, 409)
      }
      if (b.current) return json({ error: 'a battle is already open', code: 'battle-open' }, 409)
      if ((b as { capture?: unknown }).capture) {
        return json({
          error: 'the Harkonnen hold a prisoner first', code: 'capture-first',
        }, 409)
      }
      const aggressor = b.order[b.at]
      const expired = now >= b.closesAt
      if (!expired && myFaction !== aggressor) {
        return json({ error: 'the aggressor picks', code: 'not-your-turn' }, 409)
      }
      const pending = pendingBattles((state.forces ?? []) as never, state.storm as never)
      const theirs = pending.filter((x) => x.factions.includes(aggressor))
      if (theirs.length === 0) return json({ error: 'nothing to fight', code: 'no-battle' }, 409)
      // Past the deadline anyone may push, and the pick is the deterministic
      // first: the aggressor's first battle, its first rival.
      const territoryId = expired ? theirs[0].territoryId : String(action.territoryId ?? '')
      const opponent = expired
        ? theirs[0].factions.find((f) => f !== aggressor)!
        : String(action.opponent ?? '')
      const battle = theirs.find((x) => x.territoryId === territoryId
        && x.factions.includes(opponent as never) && opponent !== aggressor)
      if (!battle) return json({ error: 'no such battle', code: 'no-battle' }, 409)
      const current = {
        territoryId: battle.territoryId, sectors: battle.sectors,
        aggressor, defender: opponent, committed: [],
        closesAt: now + BATTLE_PLAN_SECONDS * 1000,
        // THE VOICE SPEAKS FIRST. When the Bene Gesserit fight here, their
        // opponent may not commit until the command is given or declined —
        // a command over a plan already made is no command at all. Their
        // ALLIANCE CARD reaches the same Voice into an ally's battle, over
        // the ally's opponent, from outside it.
        ...(() => {
          // A STOPPED VOICE never opens: the suppression is the whole phase's.
          if (isSuppressed((state.suppressed ?? []) as never,
            'bene-gesserit' as never, 'abilities.battle' as never,
            Number(state.turn ?? 0), 'Battles' as never)) return null
          const inFight = aggressor === 'bene-gesserit' || opponent === 'bene-gesserit'
          const proxy = allyInterrogator({
            faction: 'bene-gesserit' as never,
            aggressor: aggressor as never, defender: opponent as never,
            players: (state.players ?? []) as never,
          })
          if (!inFight && !proxy) return null
          return {
            voice: {
              by: 'bene-gesserit', done: false,
              over: inFight
                ? (aggressor === 'bene-gesserit' ? opponent : aggressor)
                : proxy!.over,
              closesAt: now + BATTLE_VOICE_SECONDS * 1000,
            },
          }
        })(),
      }
      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: { ...state, battles: { ...b, current }, awaiting: null },
        p_secrets: {},
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
      return json({ current, version: data[0].version })
    }

    case 'BATTLE_PLAN': {
      const b = state.battles
      const c = b?.current
      if (state.phase !== 'Battles' || !b || !c) {
        return json({ error: 'no battle is open', code: 'no-battle' }, 409)
      }
      if (c.revealed) return json({ error: 'plans are on the table', code: 'already-revealed' }, 409)
      const combatants = [c.aggressor, c.defender]
      const expired = now >= c.closesAt

      const { data: secretRows } = await admin
        .from('match_secrets').select('player_id, data').eq('match_id', matchId)
      const rowOf = Object.fromEntries((secretRows ?? []).map((r) => [r.player_id, r.data ?? {}]))
      const tanks = (state.tanks ?? { forces: {}, leaders: {} }) as {
        forces: Record<string, { plain: number; starred: number }>
        leaders: Record<string, { name: string }[]>
      }

      const plans: Record<string, unknown> = {}
      const secretsPatch: Record<string, unknown> = {}

      // THE VOICE GATES THE VOICED. Until the Bene Gesserit have spoken or
      // their window has run out, their opponent's plan waits — the command
      // must be able to bind it. The speaker's own plan commits freely.
      const voice = (c as { voice?: {
        by: string; over?: string; closesAt: number; done: boolean
        command?: { mode: string; target: string } | null
      } }).voice
      let voiceNow = voice
      // The side the Voice stands over: stamped at the door; older battles
      // without the stamp mean the speaker's own opponent.
      const voiceOver = voice
        ? (voice.over ?? combatants.find((f) => f !== voice.by))
        : null
      if (voice && !voice.done && now >= voice.closesAt) {
        // silence declines the command; the write below carries the closure
        voiceNow = { ...voice, done: true, command: null }
      }
      if (!expired) {
        if (!combatants.includes(myFaction as never)) {
          return json({ error: 'you are not in this battle', code: 'not-your-battle' }, 409)
        }
        if (c.committed.includes(myFaction as never)) {
          return json({ error: 'your plan is in', code: 'already-committed' }, 409)
        }
        if (voiceNow && !voiceNow.done && myFaction === voiceOver) {
          return json({
            error: 'the Voice has not spoken', code: 'voiced-first',
          }, 409)
        }
        // THE PLAN NAMES ITS BATTLE. A panel drawn against the last battle
        // can post into the next one — the wheel capped by the OLD stack
        // lands out of range in the new territory, and the seat reads a
        // legal-looking plan being refused for no reason it can see. The
        // form says which battle it answered; a mismatch is its own code,
        // not a lie about the plan.
        if (action.territoryId && String(action.territoryId) !== c.territoryId) {
          return json({
            error: 'the table has moved to another battle',
            code: 'battle-moved-on',
          }, 409)
        }
        const mine = rowOf[playerId] ?? {}
        const plan = {
          dial: Number(action.dial ?? 0),
          ...(action.spice != null ? { spice: Number(action.spice) } : null),
          ...(action.kwisatz ? { kwisatz: true } : null),
          ...(action.leader ? { leader: String(action.leader) } : null),
          ...(action.cheapHero ? { cheapHero: true } : null),
          ...(action.weapon ? { weapon: String(action.weapon) } : null),
          ...(action.defence ? { defence: String(action.defence) } : null),
        }
        const verdict = judgePlan({
          faction: myFaction as never,
          battle: c, forces: (state.forces ?? []) as never,
          hand: ((mine as { cards?: string[] }).cards ?? []),
          deadLeaders: (tanks.leaders[myFaction] ?? []).map((l) => l.name),
          usedLeaders: b.usedLeaders ?? {},
          plan,
          // ── ADVANCED wiring: the mode, the facing, and the purse ────────
          mode: (state.mode === 'advanced' ? 'advanced' : 'basic') as never,
          opponent: combatants.find((f) => f !== myFaction) as never,
          purse: readSpice(mine as never),
          // ...the sleeper's state, and any prisoner this seat may field
          kwisatz: {
            available: kwisatzHaderachAvailable(
              ((state.players ?? []) as { faction: string; battleLosses?: number }[])
                .find((p) => p.faction === myFaction)?.battleLosses),
            dead: (tanks.leaders[myFaction] ?? [])
              .some((l) => l.name === KWISATZ_HADERACH),
            usedTerritory: (b as { kwisatzUsed?: string }).kwisatzUsed ?? null,
          },
          borrowed: ((mine as { capturedLeaders?: { name: string }[] })
            .capturedLeaders ?? []).map((x) => x.name),
          // the Voice binds only the seat it was aimed at
          voiced: voiceNow?.done && voiceNow.command && myFaction === voiceOver
            ? voiceNow.command as never
            : null,
        })
        if (!verdict.ok) return json({ error: 'that plan is not legal', code: verdict.refusal }, 409)
        secretsPatch[playerId] = { ...mine, battlePlan: { territoryId: c.territoryId, ...plan } }
        plans[myFaction] = plan
      }

      // Everyone already committed brings the plan from their own row; past
      // the deadline the silent are committed at zero, which is the fight a
      // walked-away seat still owes — WRITTEN to their row too, so the
      // prescience that may yet fire reads every plan from one place.
      const committedNow = expired
        ? combatants
        : [...new Set([...c.committed, myFaction])]
      for (const f of combatants) {
        if (plans[f]) continue
        const seatId = seatOfFaction[f]
        const held = (rowOf[seatId] ?? {}) as { battlePlan?: { territoryId?: string } }
        if (c.committed.includes(f) && held.battlePlan?.territoryId === c.territoryId) {
          plans[f] = { ...held.battlePlan }
          delete (plans[f] as { territoryId?: string }).territoryId
        } else if (expired) {
          plans[f] = { dial: 0 }
          secretsPatch[seatId] = {
            ...(rowOf[seatId] ?? {}),
            battlePlan: { territoryId: c.territoryId, dial: 0 },
          }
        }
      }

      // THE PRESCIENCE OPENS when the plan it would read has committed and
      // the question has not yet been settled — and THE REVEAL WAITS on it:
      // the whole point of asking is planning with the answer. The Atreides
      // ALLIANCE CARD asks the same question from outside an ally's battle,
      // of the ally's opponent.
      const hasAtreides = combatants.includes('atreides' as never)
      const presProxy = allyInterrogator({
        faction: 'atreides' as never,
        aggressor: c.aggressor as never, defender: c.defender as never,
        players: (state.players ?? []) as never,
      })
      // A STOPPED QUESTION never opens — and the reveal does not wait on a
      // window that cannot exist.
      const presWanted = (hasAtreides || !!presProxy)
        && !isSuppressed((state.suppressed ?? []) as never,
          'atreides' as never, 'abilities.battle' as never,
          Number(state.turn ?? 0), 'Battles' as never)
      const presOver = hasAtreides
        ? combatants.find((f) => f !== 'atreides')
        : presProxy?.over
      const opponentIn = !!presOver && (!!plans[presOver]
        || committedNow.includes(presOver as never))
      const pres = (c as { prescience?: {
        by: string; over?: string; closesAt: number; done: boolean; asked?: string
      } }).prescience
      const presNow = presWanted && opponentIn && !pres
        ? {
          by: 'atreides', over: presOver, done: false,
          closesAt: now + BATTLE_PRESCIENCE_SECONDS * 1000,
        }
        : pres

      const allIn = combatants.every((f) => !!plans[f])
      const mayReveal = allIn && (!presWanted || (presNow?.done ?? false))
      const current = mayReveal
        ? {
          ...c, committed: combatants,
          ...(voiceNow ? { voice: voiceNow } : null),
          ...(presNow ? { prescience: presNow } : null),
          revealed: {
            plans,
            traitor: { answered: [], calls: [], closesAt: now + BATTLE_TRAITOR_SECONDS * 1000 },
          },
        }
        : {
          ...c, committed: committedNow,
          ...(voiceNow ? { voice: voiceNow } : null),
          ...(presNow ? { prescience: presNow } : null),
        }

      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: { ...state, battles: { ...b, current } },
        p_secrets: secretsPatch,
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
      return json({ committed: current.committed, revealed: mayReveal, version: data[0].version })
    }

    // ── The Voice speaks ────────────────────────────────────────────────────
    // Before the opponent may commit: a named command their plan must obey
    // where obedience is possible. Declining is a command too — the window
    // closes either way, and past the deadline anyone may close it.
    case 'BATTLE_VOICE': {
      const b = state.battles
      const c = b?.current
      if (state.phase !== 'Battles' || !b || !c) {
        return json({ error: 'no battle is open', code: 'no-battle' }, 409)
      }
      const voice = (c as { voice?: {
        by: string; closesAt: number; done: boolean
        command?: unknown
      } }).voice
      if (!voice) return json({ error: 'no Voice in this battle', code: 'no-voice' }, 409)
      if (voice.done) return json({ error: 'the Voice has spoken', code: 'already-voiced' }, 409)
      const expired = now >= voice.closesAt
      let command: unknown = null
      if (!expired) {
        if (myFaction !== voice.by) {
          return json({ error: 'the Voice is not yours', code: 'not-your-voice' }, 403)
        }
        if (action.command != null) {
          if (!judgeVoiceCommand(action.command)) {
            return json({ error: 'no such command', code: 'bad-command' }, 409)
          }
          command = action.command
        }
      }
      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: {
          ...state,
          battles: {
            ...b,
            current: { ...c, voice: { ...voice, done: true, command } },
          },
        },
        p_secrets: {},
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
      return json({ command, version: data[0].version })
    }

    // ── The Atreides ask ────────────────────────────────────────────────────
    // One element of the committed opposing plan — weapon, defence, leader,
    // or the dial — answered TRUTHFULLY off the row, into the Atreides' own
    // row and nowhere else. One question; a "none" is the answer, never a
    // do-over. The reveal follows the settling of the question in the same
    // write when both plans are in.
    case 'BATTLE_PRESCIENCE': {
      const b = state.battles
      const c = b?.current
      if (state.phase !== 'Battles' || !b || !c) {
        return json({ error: 'no battle is open', code: 'no-battle' }, 409)
      }
      if (c.revealed) return json({ error: 'plans are on the table', code: 'already-revealed' }, 409)
      const pres = (c as { prescience?: {
        by: string; closesAt: number; done: boolean; asked?: string
      } }).prescience
      if (!pres) return json({ error: 'no question is open', code: 'no-prescience' }, 409)
      if (pres.done) return json({ error: 'the question is settled', code: 'already-asked' }, 409)
      const expired = now >= pres.closesAt

      const { data: secretRows } = await admin
        .from('match_secrets').select('player_id, data').eq('match_id', matchId)
      const rowOf = Object.fromEntries((secretRows ?? []).map((r) => [r.player_id, r.data ?? {}]))
      const combatants = [c.aggressor, c.defender]
      const other = ((pres as { over?: string }).over
        ?? combatants.find((f) => f !== pres.by))!

      const secretsPatch: Record<string, unknown> = {}
      let asked: string | undefined
      if (!expired) {
        if (myFaction !== pres.by) {
          return json({ error: 'the question is not yours', code: 'not-your-question' }, 403)
        }
        if (action.ask != null) {
          const ask = String(action.ask)
          if (!PRESCIENCE_ASKS.includes(ask as never)) {
            return json({ error: 'no such question', code: 'bad-question' }, 409)
          }
          const theirSeat = seatOfFaction[other]
          const theirRow = (rowOf[theirSeat] ?? {}) as {
            battlePlan?: { territoryId?: string; dial?: number }
          }
          if (theirRow.battlePlan?.territoryId !== c.territoryId) {
            return json({ error: 'their plan is not in yet', code: 'nothing-to-see' }, 409)
          }
          const { territoryId: _t, ...theirPlan } = theirRow.battlePlan
          const answer = prescienceAnswer(theirPlan as never, ask as never)
          const mySeat = seatOfFaction[pres.by]
          secretsPatch[mySeat] = {
            ...(rowOf[mySeat] ?? {}),
            battlePrescience: { territoryId: c.territoryId, ask, answer },
          }
          asked = ask
        }
      }

      // Settling the question may complete the table: both plans in and the
      // question done means the reveal rides this same write.
      const bothIn = combatants.every((f) => {
        const row = (rowOf[seatOfFaction[f]] ?? {}) as { battlePlan?: { territoryId?: string } }
        return row.battlePlan?.territoryId === c.territoryId
      })
      const presDone = { ...pres, done: true, ...(asked ? { asked } : null) }
      const plansOut: Record<string, unknown> = {}
      if (bothIn) {
        for (const f of combatants) {
          const row = (rowOf[seatOfFaction[f]] ?? {}) as {
            battlePlan?: Record<string, unknown>
          }
          const { territoryId: _t2, ...plan } = row.battlePlan ?? {}
          plansOut[f] = plan
        }
      }
      const current = bothIn
        ? {
          ...c, committed: combatants, prescience: presDone,
          revealed: {
            plans: plansOut,
            traitor: { answered: [], calls: [], closesAt: now + BATTLE_TRAITOR_SECONDS * 1000 },
          },
        }
        : { ...c, prescience: presDone }

      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: { ...state, battles: { ...b, current } },
        p_secrets: secretsPatch,
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
      return json({ asked: asked ?? null, revealed: bothIn, version: data[0].version })
    }

    case 'BATTLE_TRAITOR':
    case 'BATTLE_CONTINUE': {
      const b = state.battles
      const c = b?.current
      if (state.phase !== 'Battles' || !b || !c?.revealed) {
        return json({ error: 'no reveal to answer', code: 'no-battle' }, 409)
      }
      if ((c.revealed as { allocate?: unknown }).allocate) {
        return json({ error: 'the winner is choosing their losses', code: 'allocation-open' }, 409)
      }
      const beat = c.revealed.traitor
      const combatants = [c.aggressor, c.defender]
      // THE HARKONNEN ALLIANCE CARD admits a third answer: allied to a
      // combatant and not fighting here themselves, their traitor cards may
      // be turned on the ally's opponent — so the beat waits on them too.
      const hkProxy = allyInterrogator({
        faction: 'harkonnen' as never,
        aggressor: c.aggressor as never, defender: c.defender as never,
        players: (state.players ?? []) as never,
      })
      const eligible = hkProxy ? [...combatants, 'harkonnen'] : combatants
      const expired = now >= beat.closesAt

      let answered = [...beat.answered]
      let calls = [...beat.calls]

      if (!expired) {
        if (!eligible.includes(myFaction as never)) {
          return json({ error: 'you are not in this battle', code: 'not-your-battle' }, 409)
        }
        if (answered.includes(myFaction as never)) {
          return json({ error: 'you have answered', code: 'already-answered' }, 409)
        }
        if (action.type === 'BATTLE_TRAITOR') {
          // The call must be TRUE: the opposing plan led with a leader this
          // seat holds the traitor card for. Refused privately — a false
          // call announced would say what the caller does not hold.
          const other = myFaction === 'harkonnen' && hkProxy
            ? hkProxy.over
            : combatants.find((f) => f !== myFaction)!
          const theirPlan = c.revealed.plans[other] as { leader?: string }
          const { data: mineRow } = await admin
            .from('match_secrets').select('data')
            .eq('match_id', matchId).eq('player_id', playerId).maybeSingle()
          const held = ((mineRow?.data ?? {}) as { traitors?: string[] }).traitors ?? []
          if ((theirPlan as { kwisatz?: boolean }).kwisatz) {
            return json({
              error: 'the Kwisatz Haderach guards that leader', code: 'kwisatz-guards',
            }, 409)
          }
          if (!theirPlan.leader || !held.includes(theirPlan.leader)) {
            return json({ error: 'that call is not yours to make', code: 'no-traitor' }, 409)
          }
          calls = [...new Set([...calls, myFaction as never])]
        }
        answered = [...new Set([...answered, myFaction as never])]
      } else {
        // Past the beat, anyone may push: the silent decline.
        answered = eligible as never
      }

      if (answered.length < eligible.length) {
        const { data, error } = await admin.rpc('apply_match_write', {
          p_match_id: matchId,
          p_expected_version: match.version,
          p_state: {
            ...state,
            battles: {
              ...b,
              current: { ...c, revealed: { ...c.revealed, traitor: { ...beat, answered, calls } } },
            },
          },
          p_secrets: {},
        })
        if (error) return json({ error: error.message }, 500)
        if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
        return json({ answered, version: data[0].version })
      }

      // ── both have spoken: the beat is settled ───────────────────────────
      const planOf = (f: string) => c.revealed!.plans[f] as {
        dial: number
        spice?: number
        leader?: string
        cheapHero?: boolean
        weapon?: string
        defence?: string
      }
      const outcome = resolveBattle({
        aggressor: {
          faction: c.aggressor as never, plan: planOf(c.aggressor),
          calledTraitor: calls.includes(c.aggressor as never),
        },
        defender: {
          faction: c.defender as never, plan: planOf(c.defender),
          calledTraitor: calls.includes(c.defender as never),
        },
      })

      // ── ADVANCED: the winner names their dead before anything settles ───
      // The window opens exactly when a choice exists: a winner with a dial
      // to pay, no explosion, and no traitor call in their favour — a
      // traitor-calling winner loses nothing, so there is nothing to choose.
      // The beat's answers ride the same write so the settle can recompute.
      const winnerDial = outcome.winner ? (planOf(outcome.winner).dial ?? 0) : 0
      if (state.mode === 'advanced' && outcome.winner && !outcome.explosion
        && !outcome.traitors.includes(outcome.winner as never) && winnerDial > 0) {
        const { data, error } = await admin.rpc('apply_match_write', {
          p_match_id: matchId,
          p_expected_version: match.version,
          p_state: {
            ...state,
            battles: {
              ...b,
              current: {
                ...c,
                revealed: {
                  ...c.revealed,
                  traitor: { ...beat, answered, calls },
                  allocate: {
                    by: outcome.winner,
                    closesAt: now + BATTLE_ALLOCATE_SECONDS * 1000,
                  },
                },
              },
            },
          },
          p_secrets: {},
        })
        if (error) return json({ error: error.message }, 500)
        if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
        return json({ allocate: outcome.winner, version: data[0].version })
      }

      return await settleBattle(b as never, c as never, calls as never, null)
    }

    // ── ADVANCED: the winner names their dead ───────────────────────────────
    // The dial and the spice CONSTRAIN the choice — the same enumeration that
    // admitted the plan lists the legal answers, and the pick must be one of
    // them. The choice is the winner's alone until the clock frees anyone to
    // push the deterministic first. It settles in the same write that applies
    // it, so it is private until it is real.
    case 'BATTLE_ALLOCATE': {
      const b = state.battles
      const c = b?.current
      const allocate = c?.revealed
        ? (c.revealed as { allocate?: { by: string; closesAt: number } }).allocate
        : undefined
      if (state.phase !== 'Battles' || !b || !c?.revealed || !allocate) {
        return json({ error: 'no losses to choose', code: 'no-allocation' }, 409)
      }
      const plan = c.revealed.plans[allocate.by] as { dial: number; spice?: number }
      const opponent = [c.aggressor, c.defender].find((f) => f !== allocate.by)!
      const constraint = {
        pieces: piecesInBattle(
          (state.forces ?? []) as never, allocate.by as never, c.territoryId, c.sectors),
        dial: plan.dial,
        spice: plan.spice ?? 0,
        worth: eliteWorth(allocate.by as never, opponent as never),
        freeFull: fullWithoutSpice(allocate.by as never),
      }
      const expired = now >= allocate.closesAt
      let choice
      if (!expired) {
        if (myFaction !== allocate.by) {
          return json({ error: 'the winner chooses', code: 'not-your-choice' }, 403)
        }
        choice = {
          plainFull: Number(action.plainFull ?? 0),
          plainHalf: Number(action.plainHalf ?? 0),
          eliteFull: Number(action.eliteFull ?? 0),
          eliteHalf: Number(action.eliteHalf ?? 0),
        }
        if (!judgeAllocation(choice, constraint)) {
          return json({
            error: 'that choice does not pay the dial', code: 'allocation-mismatch',
          }, 409)
        }
      } else {
        choice = firstAllocation(constraint)
        if (!choice) {
          // Unreachable for an admitted plan; refused rather than guessed.
          return json({ error: 'no legal choice exists', code: 'no-allocation' }, 409)
        }
      }
      return await settleBattle(
        b as never, c as never, [...c.revealed.traitor.calls] as never, choice)
    }

    // ── the Bene Gesserit flip ──────────────────────────────────────────────
    // TO FIGHTERS in the open window — phases three to five, no pause, they
    // have to find the time — never a follow-fresh advisor with company.
    // TO ADVISORS during shipment, where their fighters share ground: the
    // intrusion is the trigger, and it lasts as long as the sharing does.
    case 'BG_FLIP': {
      if (myFaction !== 'bene-gesserit') {
        return json({ error: 'the robes are not yours', code: 'not-your-power' }, 403)
      }
      if (state.mode !== 'advanced') {
        return json({ error: 'the advisors are the advanced game\'s', code: 'advanced-only' }, 409)
      }
      const direction = action.direction === 'to-advisor' ? 'to-advisor' : 'to-fighter'
      const flipAt = String(action.territoryId ?? '')
      const flipBad = judgeBgFlip({
        direction, territoryId: flipAt,
        forces: (state.forces ?? []) as never,
        phase: String(state.phase), turn: Number(state.turn ?? 0),
      })
      if (flipBad) return json({ error: 'that flip is not open', code: flipBad }, 409)
      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: {
          ...state,
          forces: flipBgForces((state.forces ?? []) as never, flipAt, direction),
        },
        p_secrets: {},
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
      return json({ flipped: flipAt, direction, version: data[0].version })
    }

    // ── the Sisterhood's standing order ─────────────────────────────────────
    case 'BG_POLICY': {
      if (myFaction !== 'bene-gesserit') {
        return json({ error: 'the order is not yours', code: 'not-your-power' }, 403)
      }
      if (state.mode !== 'advanced') {
        return json({ error: 'the advisors are the advanced game\'s', code: 'advanced-only' }, 409)
      }
      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: { ...state, bgFollowShips: action.follow === true },
        p_secrets: {},
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
      return json({ follow: action.follow === true, version: data[0].version })
    }

    // ── Karama, spent on the holder's own use ───────────────────────────────
    // Seven uses — two on the card, five faction powers — each judged by
    // the shared law and spent only when the use lands. The CARD may be a
    // worthless one: the Bene Gesserit's advanced power makes those Karamas,
    // and isKaramaCardId is the one door that knows it.
    case 'KARAMA': {
      if (!myFaction) return json({ error: 'your seat has no faction', code: 'no-faction' }, 409)
      const kCard = String(action.card ?? 'karama')
      const kUse = (action.use ?? {}) as { id?: string } & Record<string, unknown>
      const kMode = state.mode === 'advanced' ? 'advanced' : 'basic'
      if (!isKaramaCardId(myFaction as never, kMode as never, kCard)) {
        return json({ error: 'that card is no Karama in your hands', code: 'not-a-karama' }, 409)
      }
      const kBad = karamaAllowed(myFaction as never, kMode as never, kUse.id as never)
      if (kBad) return json({ error: 'that use is not yours', code: kBad }, 409)
      const { data: kRow } = await admin
        .from('match_secrets').select('data')
        .eq('match_id', matchId).eq('player_id', playerId).maybeSingle()
      const kMine = (kRow?.data ?? {}) as { cards?: string[] }
      if (!(kMine.cards ?? []).includes(kCard)) {
        return json({ error: 'you do not hold that card', code: 'card-not-held' }, 409)
      }
      const kHand = [...(kMine.cards ?? [])]
      kHand.splice(kHand.indexOf(kCard), 1)
      /** The spend every use shares: hand, count, discard — merged onto
       *  whatever else the use writes. */
      const kSpent = (extra: Record<string, unknown>, secretsExtra: Record<string, unknown> = {}) => ({
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: {
          ...state,
          ...extra,
          players: ((extra.players ?? state.players ?? []) as {
            faction: string; handCount?: number
          }[]).map((p) => p.faction === myFaction ? { ...p, handCount: kHand.length } : p),
          treacheryDiscard: [
            ...((state.treacheryDiscard ?? []) as string[]), kCard,
          ],
        },
        p_secrets: { [playerId]: { ...kMine, cards: kHand }, ...secretsExtra },
      })

      if (kUse.id === 'guild-rate-shipment') {
        const kw = state.shipping as {
          order: string[]; at: number; done: { shipped?: boolean }
        } | undefined
        if (state.phase !== 'Shipment and Movement' || !kw
          || kw.order[kw.at] !== myFaction || kw.done.shipped) {
          return json({ error: 'your shipment is not open', code: 'no-window' }, 409)
        }
        const { data, error } = await admin.rpc('apply_match_write', kSpent({
          shipping: { ...kw, done: { ...kw.done, karamaRate: true } },
        }))
        if (error) return json({ error: error.message }, 500)
        if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
        return json({ karama: kUse.id, version: data[0].version })
      }

      if (kUse.id === 'free-treachery-card') {
        if (state.phase !== 'Bidding' || (state.auction as { status?: string } | null)?.status !== 'awaiting') {
          return json({ error: 'no auction is running', code: 'no-window' }, 409)
        }
        if (((state.karamaFreeCard ?? []) as string[]).includes(myFaction)) {
          return json({ error: 'your entitlement stands already', code: 'already-played' }, 409)
        }
        const { data, error } = await admin.rpc('apply_match_write', kSpent({
          karamaFreeCard: [...((state.karamaFreeCard ?? []) as string[]), myFaction],
        }))
        if (error) return json({ error: error.message }, 500)
        if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
        return json({ karama: kUse.id, version: data[0].version })
      }

      if (kUse.id === 'atreides-see-battle-plan') {
        const c9 = (state.battles as { current?: {
          territoryId: string; aggressor: string; defender: string; revealed?: unknown
        } } | undefined)?.current
        if (state.phase !== 'Battles' || !c9 || c9.revealed) {
          return json({ error: 'no plan is there to see', code: 'no-window' }, 409)
        }
        const kTarget = String(kUse.target ?? '')
        if (![c9.aggressor, c9.defender].includes(kTarget)) {
          return json({ error: 'they are not in this battle', code: 'not-in-battle' }, 409)
        }
        const { data: tRow } = await admin
          .from('match_secrets').select('data')
          .eq('match_id', matchId).eq('player_id', seatOfFaction[kTarget]).maybeSingle()
        const theirs9 = (tRow?.data ?? {}) as {
          battlePlan?: { territoryId?: string } & Record<string, unknown>
        }
        if (theirs9.battlePlan?.territoryId !== c9.territoryId) {
          return json({ error: 'their plan is not in yet', code: 'nothing-to-see' }, 409)
        }
        const { territoryId: _t9, ...seenPlan } = theirs9.battlePlan
        const { data, error } = await admin.rpc('apply_match_write', kSpent({}, {
          [playerId]: {
            ...kMine, cards: kHand,
            karamaPlanSeen: { territoryId: c9.territoryId, target: kTarget, plan: seenPlan },
          },
        }))
        if (error) return json({ error: error.message }, 500)
        if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
        return json({ karama: kUse.id, plan: seenPlan, version: data[0].version })
      }

      if (kUse.id === 'emperor-free-revival') {
        const kAsked = playGhola({
          faction: myFaction as never,
          tanks: (state.tanks ?? emptyTanks()) as never,
          choice: kUse.leader
            ? { leader: String(kUse.leader) }
            : { plain: Number(kUse.plain ?? 0), starred: Number(kUse.starred ?? 0) },
          cap: 3,
        })
        if (!kAsked.ok) return json({ error: 'that revival is not legal', code: kAsked.refusal }, 409)
        const { data, error } = await admin.rpc('apply_match_write', kSpent({
          tanks: kAsked.tanks,
          ...(kAsked.toReserves
            ? {
              players: ((state.players ?? []) as {
                faction: string; reserves: number; reservesStarred?: number
              }[]).map((p) => p.faction === myFaction
                ? {
                  ...p,
                  reserves: p.reserves + kAsked.toReserves!.plain,
                  ...(kAsked.toReserves!.starred > 0
                    ? { reservesStarred: (p.reservesStarred ?? 0) + kAsked.toReserves!.starred }
                    : null),
                }
                : p),
            }
            : null),
          ...(kAsked.leader
            ? {
              revivedLeaders: [...new Set([
                ...((state.revivedLeaders ?? []) as string[]), kAsked.leader,
              ])],
            }
            : null),
        }))
        if (error) return json({ error: error.message }, 500)
        if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
        return json({ karama: kUse.id, version: data[0].version })
      }

      if (kUse.id === 'fremen-place-worm') {
        // the standing shield spares the ally here exactly as it does a
        // worm off the deck — a Karama worm is a normal worm
        const ps9 = (state.players ?? []) as { faction: string; ally?: string | null }[]
        const fAlly = ps9.find((p) => p.faction === 'fremen')?.ally ?? null
        const g9 = ((state.allyGrants ?? {}) as { fremen?: { shield?: boolean } }).fremen ?? {}
        const spared9 = fAlly && ps9.some((p) => p.faction === fAlly)
          && g9.shield !== false ? fAlly : null
        let wormOut
        try {
          wormOut = playKarama({
            faction: myFaction as never, mode: kMode as never,
            use: { id: 'fremen-place-worm', territoryId: String(kUse.territoryId) } as never,
            forces: (state.forces ?? []) as never,
            spiceOnBoard: (state.spiceOnBoard ?? {}) as never,
            spared: spared9 as never,
          })
        } catch (e) {
          return json({ error: String(e), code: 'bad-territory' }, 409)
        }
        const eaten = wormOut.resolved!
        const { data, error } = await admin.rpc('apply_match_write', kSpent({
          forces: ((state.forces ?? []) as unknown[])
            .filter((f) => !eaten.toTanks.includes(f as never)),
          tanks: bankDead((state.tanks ?? emptyTanks()) as never, eaten.toTanks as never),
          spiceOnBoard: eaten.spiceOnBoard,
        }))
        if (error) return json({ error: error.message }, 500)
        if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
        return json({ karama: kUse.id, devoured: eaten.devoured.territoryId, version: data[0].version })
      }

      if (kUse.id === 'guild-stop-shipment') {
        if (state.phase !== 'Shipment and Movement') {
          return json({ error: 'the turn is not at shipment', code: 'no-window' }, 409)
        }
        const kTarget = String(kUse.target ?? '')
        if (!(kTarget in seatOfFaction)) {
          return json({ error: 'no such seat', code: 'not-seated' }, 409)
        }
        const { data, error } = await admin.rpc('apply_match_write', kSpent({
          karamaShipBan: [
            ...((state.karamaShipBan ?? []) as unknown[]),
            { faction: kTarget, turn: Number(state.turn ?? 0) },
          ],
        }))
        if (error) return json({ error: error.message }, 500)
        if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
        return json({ karama: kUse.id, stopped: kTarget, version: data[0].version })
      }

      // harkonnen-take-cards
      const kTarget = String(kUse.target ?? '')
      if (!(kTarget in seatOfFaction) || kTarget === myFaction) {
        return json({ error: 'no such hand to take from', code: 'not-seated' }, 409)
      }
      const { data: vRow } = await admin
        .from('match_secrets').select('data')
        .eq('match_id', matchId).eq('player_id', seatOfFaction[kTarget]).maybeSingle()
      const victim = (vRow?.data ?? {}) as { cards?: string[] }
      const kCount = Number(kUse.count ?? 0)
      if (!Number.isInteger(kCount) || kCount < 1 || kCount > (victim.cards ?? []).length) {
        return json({ error: 'their hand does not hold that many', code: 'bad-count' }, 409)
      }
      // TAKEN WITHOUT LOOKING: the SEED chooses, the same for every retry
      // of this action_seq — random to everyone, replayable to the record.
      const orderShuffled = shuffleWithSeed(
        Number(match.rng_seed) + match.action_seq, [...(victim.cards ?? [])])
      const taken = orderShuffled.slice(0, kCount)
      const left = (victim.cards ?? []).filter((id) => !taken.includes(id))
      const takenBag = [...taken]
      const kHand2 = [...kHand, ...takenBag]
      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: {
          ...state,
          // THE RETURN IS OWED, on a clock the whole match holds for: one
          // card back for each taken, chosen AFTER seeing what came.
          karamaGiveBack: {
            from: myFaction, to: kTarget, count: kCount,
            closesAt: now + KARAMA_GIVE_SECONDS * 1000,
          },
          players: ((state.players ?? []) as { faction: string; handCount?: number }[])
            .map((p) => p.faction === myFaction ? { ...p, handCount: kHand2.length }
              : p.faction === kTarget ? { ...p, handCount: left.length } : p),
          treacheryDiscard: [
            ...((state.treacheryDiscard ?? []) as string[]), kCard,
          ],
        },
        p_secrets: {
          [playerId]: { ...kMine, cards: kHand2 },
          [seatOfFaction[kTarget]]: { ...victim, cards: left },
        },
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
      return json({ karama: kUse.id, taken, version: data[0].version })
    }

    // ── Karama, spent on stopping an advantage ──────────────────────────────
    // PUBLIC the moment it is played: whose advantage, which, by whom, for
    // this turn's this phase — and the win conditions are beyond its reach,
    // by each faction's own unsuppressable list.
    case 'KARAMA_STOP': {
      if (!myFaction) return json({ error: 'your seat has no faction', code: 'no-faction' }, 409)
      const sCard = String(action.card ?? 'karama')
      const sMode = state.mode === 'advanced' ? 'advanced' : 'basic'
      if (!isKaramaCardId(myFaction as never, sMode as never, sCard)) {
        return json({ error: 'that card is no Karama in your hands', code: 'not-a-karama' }, 409)
      }
      const sTarget = String(action.target ?? '')
      if (!(sTarget in seatOfFaction)) {
        return json({ error: 'no such seat', code: 'not-seated' }, 409)
      }
      const sRef = String(action.ref ?? '')
      if (!suppressibleRefs(sTarget as never).some((r) => r.ref === sRef)) {
        return json({ error: 'that advantage cannot be stopped', code: 'not-stoppable' }, 409)
      }
      const { data: sRow } = await admin
        .from('match_secrets').select('data')
        .eq('match_id', matchId).eq('player_id', playerId).maybeSingle()
      const sMine = (sRow?.data ?? {}) as { cards?: string[] }
      if (!(sMine.cards ?? []).includes(sCard)) {
        return json({ error: 'you do not hold that card', code: 'card-not-held' }, 409)
      }
      const sHand = [...(sMine.cards ?? [])]
      sHand.splice(sHand.indexOf(sCard), 1)
      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: {
          ...state,
          suppressed: [
            ...((state.suppressed ?? []) as unknown[]),
            {
              faction: sTarget, ref: sRef, by: myFaction,
              turn: Number(state.turn ?? 0), phase: state.phase,
            },
          ],
          players: ((state.players ?? []) as { faction: string; handCount?: number }[])
            .map((p) => p.faction === myFaction ? { ...p, handCount: sHand.length } : p),
          treacheryDiscard: [
            ...((state.treacheryDiscard ?? []) as string[]), sCard,
          ],
        },
        p_secrets: { [playerId]: { ...sMine, cards: sHand } },
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
      return json({ stopped: { faction: sTarget, ref: sRef }, version: data[0].version })
    }

    // ── the Harkonnen hand cards back ───────────────────────────────────────
    // One for each taken, CHOSEN after seeing what came — and past the
    // clock anyone may push, handing back the first of the hand: the match
    // does not wait forever on a debtor.
    case 'KARAMA_GIVE_BACK': {
      const g = state.karamaGiveBack as {
        from: string; to: string; count: number; closesAt: number
      } | undefined
      if (!g) return json({ error: 'nothing is owed', code: 'no-debt' }, 409)
      const gExpired = now >= g.closesAt
      if (!gExpired && myFaction !== g.from) {
        return json({ error: 'the debt is not yours to pay', code: 'not-your-debt' }, 403)
      }
      const fromSeat = seatOfFaction[g.from]
      const toSeat = seatOfFaction[g.to]
      const { data: gRows } = await admin
        .from('match_secrets').select('player_id, data').eq('match_id', matchId)
      const gOf = Object.fromEntries((gRows ?? []).map((r) => [r.player_id, r.data ?? {}]))
      const debtor = (gOf[fromSeat] ?? {}) as { cards?: string[] }
      const owed = (gOf[toSeat] ?? {}) as { cards?: string[] }
      const given = gExpired && !Array.isArray(action.cards)
        ? (debtor.cards ?? []).slice(0, g.count)
        : ((action.cards ?? []) as string[]).map(String)
      if (given.length !== g.count) {
        return json({ error: `${g.count} card(s) are owed`, code: 'bad-count' }, 409)
      }
      const debtorHand = [...(debtor.cards ?? [])]
      for (const id of given) {
        const at9 = debtorHand.indexOf(id)
        if (at9 < 0) return json({ error: 'a card you do not hold', code: 'card-not-held' }, 409)
        debtorHand.splice(at9, 1)
      }
      const paidHand = [...(owed.cards ?? []), ...given]
      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: {
          ...state,
          karamaGiveBack: undefined,
          players: ((state.players ?? []) as { faction: string; handCount?: number }[])
            .map((p) => p.faction === g.from ? { ...p, handCount: debtorHand.length }
              : p.faction === g.to ? { ...p, handCount: paidHand.length } : p),
        },
        p_secrets: {
          [fromSeat]: { ...debtor, cards: debtorHand },
          [toSeat]: { ...owed, cards: paidHand },
        },
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
      return json({ givenBack: given.length, version: data[0].version })
    }

    // ── Weather Control: the holder steers the storm ────────────────────────
    // Played before the marker is calculated, from turn two: the chosen
    // reach becomes the calculation, published like any roll, and the
    // atomics window still follows when someone stands in the Wall's reach.
    case 'WEATHER_CONTROL': {
      if (!myFaction) return json({ error: 'your seat has no faction', code: 'no-faction' }, 409)
      if (state.phase !== 'Storm' || state.stormMoved === state.turn || state.stormCarry) {
        return json({ error: 'the storm is not waiting to be calculated', code: 'no-window' }, 409)
      }
      if (Number(state.turn) < 2) {
        return json({ error: 'the first storm is the dials\' alone', code: 'too-early' }, 409)
      }
      const sectors = Number(action.sectors)
      if (!Number.isInteger(sectors) || sectors < 0 || sectors > WEATHER_CONTROL_MAX) {
        return json({ error: 'nought to ten sectors', code: 'bad-sectors' }, 409)
      }
      const { data: wcRow } = await admin
        .from('match_secrets').select('data')
        .eq('match_id', matchId).eq('player_id', playerId).maybeSingle()
      const wcMine = (wcRow?.data ?? {}) as { cards?: string[] }
      if (!(wcMine.cards ?? []).includes('weathercontrol')) {
        return json({ error: 'you do not hold Weather Control', code: 'card-not-held' }, 409)
      }
      const wcHand = [...(wcMine.cards ?? [])]
      wcHand.splice(wcHand.indexOf('weathercontrol'), 1)
      const atomicsCould = ((state.players ?? []) as { faction: string }[]).some((p) =>
        mayAtomics((state.forces ?? []) as never, p.faction as never, state.storm as never))
      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: {
          ...state,
          stormCarry: {
            turn: Number(state.turn), roll: sectors,
            // the atomics beat still follows a steered storm; with nobody
            // in reach the window is already spent
            closesAt: atomicsCould ? now + STORM_CARD_SECONDS * 1000 : now,
            steered: myFaction,
          },
          players: ((state.players ?? []) as { faction: string; handCount?: number }[])
            .map((p) => p.faction === myFaction ? { ...p, handCount: wcHand.length } : p),
          treacheryDiscard: [
            ...((state.treacheryDiscard ?? []) as string[]), 'weathercontrol',
          ],
        },
        p_secrets: { [playerId]: { ...wcMine, cards: wcHand } },
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
      return json({ steered: sectors, version: data[0].version })
    }

    // ── Family Atomics: the Wall comes down ─────────────────────────────────
    // Played in the beat between calculated and moved, by a seat in reach
    // of the Wall. Everything standing on the Wall dies with it, the three
    // sheltered territories are open to the storm for good, and the card
    // leaves the game — removed from play, never reshuffled.
    case 'FAMILY_ATOMICS': {
      if (!myFaction) return json({ error: 'your seat has no faction', code: 'no-faction' }, 409)
      const fc = state.stormCarry as {
        turn: number; roll: number; closesAt: number; atomics?: string
      } | undefined
      if (state.phase !== 'Storm' || !fc || state.stormMoved === state.turn) {
        return json({ error: 'the storm is not between its beats', code: 'no-window' }, 409)
      }
      if (fc.atomics) {
        return json({ error: 'the Wall is already down', code: 'already-detonated' }, 409)
      }
      if (!mayAtomics((state.forces ?? []) as never, myFaction as never, state.storm as never)) {
        return json({ error: 'you are not in reach of the Shield Wall', code: 'not-in-reach' }, 409)
      }
      const { data: faRow } = await admin
        .from('match_secrets').select('data')
        .eq('match_id', matchId).eq('player_id', playerId).maybeSingle()
      const faMine = (faRow?.data ?? {}) as { cards?: string[] }
      if (!(faMine.cards ?? []).includes('familyatomics')) {
        return json({ error: 'you do not hold Family Atomics', code: 'card-not-held' }, 409)
      }
      const faHand = [...(faMine.cards ?? [])]
      faHand.splice(faHand.indexOf('familyatomics'), 1)
      // ALL FORCES ON THE WALL ARE DESTROYED — the detonator's own included.
      const wallRows = ((state.forces ?? []) as {
        territoryId: string; count: number
      }[]).filter((f) => f.territoryId === SHIELD_WALL_TERRITORY && f.count > 0)
      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: {
          ...state,
          shieldWall: 'destroyed',
          forces: ((state.forces ?? []) as { territoryId: string; count: number }[])
            .filter((f) => !(f.territoryId === SHIELD_WALL_TERRITORY && f.count > 0)),
          tanks: bankDead((state.tanks ?? emptyTanks()) as never, wallRows as never),
          // the window is SPENT: the storm may move on the next press
          stormCarry: { ...fc, atomics: myFaction, closesAt: now },
          players: ((state.players ?? []) as { faction: string; handCount?: number }[])
            .map((p) => p.faction === myFaction ? { ...p, handCount: faHand.length } : p),
          // REMOVED FROM PLAY, not discarded: the treachery economy counts
          // this list so the card's absence reads as the rule, not a leak.
          removedFromPlay: [
            ...((state.removedFromPlay ?? []) as string[]), 'familyatomics',
          ],
        },
        p_secrets: { [playerId]: { ...faMine, cards: faHand } },
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
      return json({ detonated: true, version: data[0].version })
    }

    // ── the Tleilaxu Ghola: one free revival, at any time ───────────────────
    // The card waives the gate, the ledger and the cost — never the
    // face-down cycle — and is spent only when the revival lands.
    case 'TLEILAXU_GHOLA': {
      if (!myFaction) return json({ error: 'your seat has no faction', code: 'no-faction' }, 409)
      const { data: ghRow } = await admin
        .from('match_secrets').select('data')
        .eq('match_id', matchId).eq('player_id', playerId).maybeSingle()
      const ghMine = (ghRow?.data ?? {}) as { cards?: string[] }
      if (!(ghMine.cards ?? []).includes('tleilaxughola')) {
        return json({ error: 'you do not hold the Tleilaxu Ghola', code: 'card-not-held' }, 409)
      }
      const ghAsked = playGhola({
        faction: myFaction as never,
        tanks: (state.tanks ?? emptyTanks()) as never,
        choice: action.leader
          ? { leader: String(action.leader) }
          : { plain: Number(action.plain ?? 0), starred: Number(action.starred ?? 0) },
      })
      if (!ghAsked.ok) {
        return json({ error: 'that revival is not legal', code: ghAsked.refusal }, 409)
      }
      const ghHand = [...(ghMine.cards ?? [])]
      ghHand.splice(ghHand.indexOf('tleilaxughola'), 1)
      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: {
          ...state,
          tanks: ghAsked.tanks,
          // TO RESERVES, never the board — the same door every revival uses.
          ...(ghAsked.toReserves
            ? {
              players: ((state.players ?? []) as {
                faction: string; reserves: number; reservesStarred?: number
                handCount?: number
              }[]).map((p) => p.faction === myFaction
                ? {
                  ...p,
                  reserves: p.reserves + ghAsked.toReserves!.plain,
                  ...(ghAsked.toReserves!.starred > 0
                    ? { reservesStarred: (p.reservesStarred ?? 0) + ghAsked.toReserves!.starred }
                    : null),
                  handCount: ghHand.length,
                }
                : p),
            }
            : {
              players: ((state.players ?? []) as { faction: string; handCount?: number }[])
                .map((p) => p.faction === myFaction ? { ...p, handCount: ghHand.length } : p),
            }),
          // A GHOLA-REVIVED LEADER is as revived as any other: killed again
          // it returns face down and waits out the rotation.
          ...(ghAsked.leader
            ? {
              revivedLeaders: [...new Set([
                ...((state.revivedLeaders ?? []) as string[]), ghAsked.leader,
              ])],
            }
            : null),
          treacheryDiscard: [
            ...((state.treacheryDiscard ?? []) as string[]), 'tleilaxughola',
          ],
        },
        p_secrets: { [playerId]: { ...ghMine, cards: ghHand } },
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
      return json({
        ...(ghAsked.leader ? { leader: ghAsked.leader } : { toReserves: ghAsked.toReserves }),
        version: data[0].version,
      })
    }

    // ── Hajr: an extra movement, riding the same shipping turn ──────────────
    // Playable only while the holder's own turn is still open to a closing
    // move; the MOVE case honours the debt by not stepping the rotation.
    case 'HAJR': {
      if (!myFaction) return json({ error: 'your seat has no faction', code: 'no-faction' }, 409)
      const hw = state.shipping as {
        order: string[]; at: number
        done: { moved?: boolean; hajr?: boolean }
      } | undefined
      if (state.phase !== 'Shipment and Movement' || !hw) {
        return json({ error: 'the turn is not at shipment', code: 'wrong-phase' }, 409)
      }
      if (!hajrMayPlay(hw as never, myFaction as never)) {
        return json({ error: 'the moment for Hajr has passed', code: 'not-your-turn' }, 409)
      }
      if (hw.done.hajr) return json({ error: 'Hajr is already in play', code: 'already-played' }, 409)
      const { data: hjRow } = await admin
        .from('match_secrets').select('data')
        .eq('match_id', matchId).eq('player_id', playerId).maybeSingle()
      const hjMine = (hjRow?.data ?? {}) as { cards?: string[] }
      if (!(hjMine.cards ?? []).includes('hajr')) {
        return json({ error: 'you do not hold Hajr', code: 'card-not-held' }, 409)
      }
      const hjHand = [...(hjMine.cards ?? [])]
      hjHand.splice(hjHand.indexOf('hajr'), 1)
      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: {
          ...state,
          shipping: { ...hw, done: { ...hw.done, hajr: true } },
          players: ((state.players ?? []) as { faction: string; handCount?: number }[])
            .map((p) => p.faction === myFaction ? { ...p, handCount: hjHand.length } : p),
          treacheryDiscard: [
            ...((state.treacheryDiscard ?? []) as string[]), 'hajr',
          ],
        },
        p_secrets: { [playerId]: { ...hjMine, cards: hjHand } },
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
      return json({ hajr: true, version: data[0].version })
    }

    // ── Truthtrance: one question, answered by the table itself ─────────────
    // The card the printed game trusts a player to answer honestly is
    // answered HERE, out of the secret store, so nobody can lie. Question
    // and answer are public — the asking costs the asker that much — and
    // the card is spent only when an answer actually lands: a refused
    // question refuses the play, it does not eat the card.
    case 'TRUTHTRANCE': {
      if (!myFaction) return json({ error: 'your seat has no faction', code: 'no-faction' }, 409)
      const target = String(action.target ?? '')
      const q = action.question
      if (!q || typeof q !== 'object') {
        return json({ error: 'no question asked', code: 'bad-question' }, 409)
      }
      const { data: allRows } = await admin
        .from('match_secrets').select('player_id, data').eq('match_id', matchId)
      const rowOf = Object.fromEntries((allRows ?? []).map((r) => [r.player_id, r.data ?? {}]))
      const mine = (rowOf[playerId] ?? {}) as { cards?: string[] }
      if (!(mine.cards ?? []).includes('truthtrance')) {
        return json({ error: 'you do not hold Truthtrance', code: 'card-not-held' }, 409)
      }
      if (!(target in seatOfFaction)) {
        return json({ error: 'no such seat', code: 'not-seated' }, 409)
      }

      // THE STORE, assembled by faction — the law's own input shape. Every
      // seat's row is read so a missing one is a loud refusal inside the
      // law ('no-secret-for-seat'), never a silent "no".
      const hands: Record<string, readonly string[]> = {}
      const traitors: Record<string, readonly string[]> = {}
      const spice: Record<string, number> = {}
      let prediction: { faction: string; turn: number } | undefined
      for (const [fac, seatId] of Object.entries(seatOfFaction)) {
        const row = (rowOf[seatId] ?? {}) as {
          cards?: string[]; traitors?: string[]
          prediction?: { faction: string; turn: number }
        }
        hands[fac] = row.cards ?? []
        traitors[fac] = row.traitors ?? []
        spice[fac] = readSpice(row as never)
        if (fac === 'bene-gesserit' && row.prediction) prediction = row.prediction
      }
      const cur = (state.battles as {
        current?: {
          territoryId: string; aggressor: string; defender: string
          revealed?: unknown
        }
      } | undefined)?.current
      const battle = cur
        ? {
          combatants: [cur.aggressor, cur.defender],
          plans: Object.fromEntries([cur.aggressor, cur.defender].flatMap((f) => {
            const row = (rowOf[seatOfFaction[f]] ?? {}) as {
              battlePlan?: { territoryId?: string } & Record<string, unknown>
            }
            return row.battlePlan?.territoryId === cur.territoryId
              ? [[f, planFromRow(row.battlePlan as never)]] : []
          })),
          revealed: !!cur.revealed,
        }
        : undefined
      const askedTT = askTruthtrance({
        asker: myFaction as never, target: target as never,
        question: q as never,
        secrets: { hands, traitors, spice, prediction, battle } as never,
        turn: Number(state.turn ?? 0), phase: state.phase as never,
      })
      if (!askedTT.ok) {
        return json({ error: 'that question cannot be asked', code: askedTT.refusal }, 409)
      }

      // THE CARD IS SPENT in the same write that publishes the answer — one
      // copy, not every copy a hoarder might hold.
      const handTT = [...(mine.cards ?? [])]
      handTT.splice(handTT.indexOf('truthtrance'), 1)
      const a = askedTT.answer
      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: {
          ...state,
          truthtrances: [
            ...((state.truthtrances ?? []) as unknown[]),
            { asker: a.asker, target: a.target, asked: a.asked, answer: a.answer, asOf: a.asOf },
          ],
          treacheryDiscard: [
            ...((state.treacheryDiscard ?? []) as string[]), 'truthtrance',
          ],
          players: ((state.players ?? []) as { faction: string; handCount?: number }[])
            .map((p) => p.faction === myFaction ? { ...p, handCount: handTT.length } : p),
        },
        p_secrets: { [playerId]: { ...mine, cards: handTT } },
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
      return json({ answer: a, version: data[0].version })
    }

    // ── a standing alliance grant flips ─────────────────────────────────────
    // Set once and held until changed — never asked per event. The Fremen
    // own the worm shield and the free-revivals grant; the Emperor owns the
    // funded extras. Public, like the alliance itself; whether any of it
    // BITES is decided where it is read, by whether the pair stands.
    case 'ALLY_GRANT': {
      if (!myFaction) return json({ error: 'your seat has no faction', code: 'no-faction' }, 409)
      const grant = String(action.grant ?? '')
      const on = action.on === true
      const owns = myFaction === 'fremen'
        ? ['shield', 'revivals']
        : myFaction === 'emperor' ? ['revivals'] : []
      if (!owns.includes(grant)) {
        return json({ error: 'that grant is not yours to set', code: 'not-your-grant' }, 409)
      }
      const all = (state.allyGrants ?? {}) as Record<string, Record<string, boolean>>
      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: {
          ...state,
          allyGrants: { ...all, [myFaction]: { ...(all[myFaction] ?? {}), [grant]: on } },
        },
        p_secrets: {},
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
      return json({ grant, on, version: data[0].version })
    }

    // ── the Nexus: propose, accept, break, ready, un-ready ──────────────────
    // Proposals are PRIVATE — a row-to-row matter between two seats — and
    // an alliance or its breaking is PUBLIC the moment it happens. The last
    // seat to ready ends the window for everyone, irreversibly: the write
    // that learns it deletes the window itself.
    case 'NEXUS_PROPOSE':
    case 'NEXUS_ACCEPT':
    case 'NEXUS_BREAK':
    case 'NEXUS_READY':
    case 'NEXUS_UNREADY': {
      const nx = state.nexus as { turn: number; closesAt: number; ready: string[] } | undefined
      if (state.phase !== 'Spice Blow and Nexus' || !nx || now >= nx.closesAt) {
        return json({ error: 'no Nexus is open', code: 'no-nexus' }, 409)
      }
      if (!myFaction) return json({ error: 'your seat has no faction', code: 'no-faction' }, 409)
      const players = (state.players ?? []) as {
        faction: string; ally?: string | null
      }[]

      if (action.type === 'NEXUS_READY' || action.type === 'NEXUS_UNREADY') {
        const ready = nx.ready ?? []
        if (action.type === 'NEXUS_READY') {
          if (ready.includes(myFaction)) {
            return json({ error: 'you are ready', code: 'already-ready' }, 409)
          }
          const readyNow = [...ready, myFaction]
          const ends = nexusAllReady(readyNow, players as never)
          const { data, error } = await admin.rpc('apply_match_write', {
            p_match_id: matchId,
            p_expected_version: match.version,
            // THE LAST READY ENDS IT, in its own write — which is why it
            // cannot be taken back, and why the panel warns before it.
            p_state: ends
              ? { ...state, nexus: undefined }
              : { ...state, nexus: { ...nx, ready: readyNow } },
            p_secrets: {},
          })
          if (error) return json({ error: error.message }, 500)
          if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
          return json({ ready: readyNow, ...(ends ? { ended: true } : null), version: data[0].version })
        }
        if (!ready.includes(myFaction)) {
          return json({ error: 'you are not ready', code: 'not-ready' }, 409)
        }
        const { data, error } = await admin.rpc('apply_match_write', {
          p_match_id: matchId,
          p_expected_version: match.version,
          p_state: { ...state, nexus: { ...nx, ready: ready.filter((f) => f !== myFaction) } },
          p_secrets: {},
        })
        if (error) return json({ error: error.message }, 500)
        if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
        return json({ ready: ready.filter((f) => f !== myFaction), version: data[0].version })
      }

      if (action.type === 'NEXUS_BREAK') {
        const mine = players.find((p) => p.faction === myFaction)
        if (!mine?.ally) return json({ error: 'you have no alliance to break', code: 'not-allied' }, 409)
        const former = mine.ally
        const { data, error } = await admin.rpc('apply_match_write', {
          p_match_id: matchId,
          p_expected_version: match.version,
          // BREAKING IS PUBLIC: the ally fields are the table's own record,
          // and both seats are free to re-ally within this same Nexus.
          p_state: {
            ...state,
            players: players.map((p) =>
              p.faction === myFaction || p.faction === former
                ? { ...p, ally: null } : p),
          },
          p_secrets: {},
        })
        if (error) return json({ error: error.message }, 500)
        if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
        return json({ broke: former, version: data[0].version })
      }

      const { data: secretRows } = await admin
        .from('match_secrets').select('player_id, data').eq('match_id', matchId)
      const rowOf = Object.fromEntries((secretRows ?? []).map((r) => [r.player_id, r.data ?? {}]))
      const secretsPatch: Record<string, unknown> = {}

      if (action.type === 'NEXUS_PROPOSE') {
        const to = String(action.to ?? '')
        const bad = judgeProposal({
          proposer: myFaction as never, to: to as never, players: players as never,
        })
        if (bad) return json({ error: 'that proposal is not legal', code: bad }, 409)
        const toSeat = seatOfFaction[to]
        const mine = (rowOf[playerId] ?? {}) as { nexusProposal?: { to: string; turn: number } }
        // A NEW PROPOSAL REPLACES THE OLD: retargeting is one move, and the
        // old target's offer list loses this seat in the same write.
        const old = mine.nexusProposal
        if (old && old.turn === nx.turn && old.to !== to) {
          const oldSeat = seatOfFaction[old.to]
          if (oldSeat) {
            const theirs = (rowOf[oldSeat] ?? {}) as { nexusOffers?: { from: string; turn: number }[] }
            secretsPatch[oldSeat] = {
              ...theirs,
              nexusOffers: (theirs.nexusOffers ?? [])
                .filter((o) => !(o.from === myFaction && o.turn === nx.turn)),
            }
          }
        }
        secretsPatch[playerId] = { ...(rowOf[playerId] ?? {}), nexusProposal: { to, turn: nx.turn } }
        const target = (rowOf[toSeat] ?? {}) as { nexusOffers?: { from: string; turn: number }[] }
        secretsPatch[toSeat] = {
          ...target,
          nexusOffers: [
            ...(target.nexusOffers ?? [])
              .filter((o) => !(o.from === myFaction) && o.turn === nx.turn),
            { from: myFaction, turn: nx.turn },
          ],
        }
        const { data, error } = await admin.rpc('apply_match_write', {
          p_match_id: matchId,
          p_expected_version: match.version,
          p_state: { ...state },
          p_secrets: secretsPatch,
        })
        if (error) return json({ error: error.message }, 500)
        if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
        return json({ proposed: to, version: data[0].version })
      }

      // NEXUS_ACCEPT
      const from = String(action.from ?? '')
      const fromSeat = seatOfFaction[from]
      const theirs = (rowOf[fromSeat] ?? {}) as { nexusProposal?: { to: string; turn: number } }
      if (theirs.nexusProposal?.to !== myFaction || theirs.nexusProposal?.turn !== nx.turn) {
        return json({ error: 'no such offer stands', code: 'no-offer' }, 409)
      }
      const bad = judgeProposal({
        proposer: from as never, to: myFaction as never, players: players as never,
      })
      if (bad) return json({ error: 'that alliance is not legal', code: bad }, 409)
      // THE ALLIANCE IS PUBLIC the moment it forms — the ally fields are
      // the exchanged cards. The pair's own outgoing proposals are spent.
      const mine = (rowOf[playerId] ?? {}) as { nexusProposal?: { to: string; turn: number } }
      secretsPatch[fromSeat] = { ...(rowOf[fromSeat] ?? {}), nexusProposal: undefined }
      secretsPatch[playerId] = { ...(rowOf[playerId] ?? {}), nexusProposal: undefined }
      void mine
      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: {
          ...state,
          players: players.map((p) =>
            p.faction === myFaction ? { ...p, ally: from }
              : p.faction === from ? { ...p, ally: myFaction }
              : p),
        },
        p_secrets: secretsPatch,
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
      return json({ allied: from, version: data[0].version })
    }

    // ── the table readies for the next turn ─────────────────────────────────
    // Once per seat, once per pause. All six in — or the minute out — and
    // the hold on the turn marker clears; the ADVANCE itself stays the same
    // press it always was.
    case 'MENTAT_READY': {
      if (state.phase !== 'Mentat Pause') {
        return json({ error: 'the turn is not at the pause', code: 'wrong-phase' }, 409)
      }
      const m = state.mentat as { closesAt: number; ready?: string[] } | undefined
      if (!m) return json({ error: 'no pause is open', code: 'no-pause' }, 409)
      if (!myFaction) return json({ error: 'your seat has no faction', code: 'no-faction' }, 409)
      const ready = m.ready ?? []
      if (ready.includes(myFaction)) {
        return json({ error: 'you are ready', code: 'already-ready' }, 409)
      }
      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: { ...state, mentat: { ...m, ready: [...ready, myFaction] } },
        p_secrets: {},
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
      return json({ ready: [...ready, myFaction], version: data[0].version })
    }

    // ── ADVANCED: the Harkonnen deal with their prisoner ────────────────────
    // Kill for two spice from the bank, keep to field once, or decline. The
    // prisoner is drawn by the SEED at the moment of choosing — random, and
    // the same for every retry of this action_seq. Past the deadline anyone
    // may decline for them.
    case 'BATTLE_CAPTURE': {
      const b = state.battles
      const capture = (b as {
        capture?: { from: string; territoryId?: string; closesAt: number }
      } | undefined)?.capture
      if (state.phase !== 'Battles' || !b || !capture) {
        return json({ error: 'no prisoner to deal with', code: 'no-capture' }, 409)
      }
      const expired = now >= capture.closesAt
      let choice = String(action.choice ?? '')
      if (!expired) {
        if (myFaction !== 'harkonnen') {
          return json({
            error: 'the Harkonnen hold the prisoner', code: 'not-your-prisoner',
          }, 403)
        }
        if (!['kill', 'keep', 'decline'].includes(choice)) {
          return json({ error: 'kill, keep, or decline', code: 'bad-choice' }, 409)
        }
      } else {
        choice = 'decline'
      }

      const { data: secretRows } = await admin
        .from('match_secrets').select('player_id, data').eq('match_id', matchId)
      const rowOf = Object.fromEntries((secretRows ?? []).map((r) => [r.player_id, r.data ?? {}]))
      const hkSeat = seatOfFaction['harkonnen']
      const hkRow = (rowOf[hkSeat] ?? {}) as {
        capturedLeaders?: { name: string; from: string }[]
      }
      let tanks = (state.tanks ?? { forces: {}, leaders: {} }) as {
        forces: Record<string, unknown>
        leaders: Record<string, { name: string }[]>
      }
      const pool = capturePool({
        loser: capture.from as never,
        tanks: (tanks.leaders[capture.from] ?? []) as never,
        usedLeaders: (b as { usedLeaders?: Record<string, string> }).usedLeaders ?? {},
        territoryId: capture.territoryId ?? '',
        alreadyCaptured: (hkRow.capturedLeaders ?? []).map((x) => x.name),
      })
      const drawn = choice !== 'decline' && pool.length > 0
        ? shuffleWithSeed(Number(match.rng_seed) + match.action_seq, pool)[0]
        : null

      const secretsPatch: Record<string, unknown> = {}
      if (drawn && choice === 'kill') {
        // face down at the table; here the tanks are public and the body is
        // simply the owner's to revive
        tanks = returnLeaderToTanks(tanks as never, capture.from as never, drawn) as never
        const moved = applySpiceMoves(
          { [hkSeat]: readSpice(hkRow as never) },
          [{ from: BANK, to: hkSeat, amount: 2, reason: 'captured-leader' }],
        )
        if (!moved.ok) {
          return json({ error: 'the spice could not move', code: moved.refusal }, 500)
        }
        secretsPatch[hkSeat] = { ...hkRow, spice: moved.purses[hkSeat] }
      }
      if (drawn && choice === 'keep') {
        secretsPatch[hkSeat] = {
          ...hkRow,
          capturedLeaders: [
            ...(hkRow.capturedLeaders ?? []),
            { name: drawn, from: capture.from },
          ],
        }
      }

      // The window answered: the rotation goes on, or — if it was already
      // fought out — the battles object clears and the phase may advance.
      const battlesOut = (b as { spent?: boolean }).spent
        ? undefined
        : { ...b, capture: undefined, spent: undefined }
      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: {
          ...state,
          tanks,
          ...(battlesOut ? { battles: battlesOut } : { battles: undefined }),
        },
        p_secrets: secretsPatch,
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
      return json({
        choice,
        ...(drawn && choice === 'keep' ? { prisoner: drawn } : null),
        ...(drawn && choice === 'kill' ? { killed: drawn } : null),
        version: data[0].version,
      })
    }

    // ── The Fremen ride Shai-Hulud ──────────────────────────────────────────
    // Some or all of a struck territory's forces, to anywhere: no range and
    // no path — the worm carries them. The storm and the stronghold gate
    // still stand, judged by the shared law. One ride per territory; the
    // window rides out on its own clock.
    case 'WORM_RIDE': {
      const ride = state.wormRide as
        { turn: number; territories: string[]; closesAt: number } | undefined
      if (!ride) return json({ error: 'no worm to ride', code: 'no-ride' }, 409)
      if (myFaction !== 'fremen') {
        return json({ error: 'only the Fremen ride', code: 'not-your-decision' }, 403)
      }
      if (now >= ride.closesAt) {
        return json({ error: 'the worm has gone', code: 'window-shut' }, 409)
      }
      const from = String(action.from ?? '')
      const gather = Array.isArray(action.gather)
        ? action.gather as { sector: string; count: number; starred?: number }[]
        : []
      const to = (action.to ?? {}) as { territoryId: string; sector?: string }
      const judged = judgeWormRide({
        from, gather, to,
        forces: (state.forces ?? []) as never,
        storm: state.storm as never,
        rideTerritories: ride.territories,
      })
      if (!judged.ok) return json({ error: 'that ride is not legal', code: judged.refusal }, 409)

      let forces = [...((state.forces ?? []) as {
        faction: string; territoryId: string; sector: string; count: number; starred?: number
      }[])]
      let landedStarred = 0
      for (const g of gather) {
        const starred = Math.max(0, Math.floor(Number(g.starred ?? 0)))
        forces = liftForces(
          forces as never, 'fremen' as never, from, g.sector, g.count, starred) as never
        landedStarred += starred
      }
      const total = gather.reduce((n, g) => n + g.count, 0)
      forces = landForces(
        forces as never, 'fremen' as never,
        to.territoryId, judged.sector, total, landedStarred) as never

      const territoriesLeft = ride.territories.filter((t) => t !== from)
      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: {
          ...state, forces,
          ...(territoriesLeft.length
            ? { wormRide: { ...ride, territories: territoriesLeft } }
            : { wormRide: undefined }),
        },
        p_secrets: {},
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
      return json({ moved: judged.moving, to: to.territoryId, version: data[0].version })
    }

    // ── Dev scaffolding: re-run an expired window ───────────────────────────
    // Playtesting outlives clocks: a battle window missed over lunch used to
    // mean replaying a whole match to reach the phase again. Same switch as
    // seeding — this is scaffolding, not a rule, and a production project
    // with the flag off refuses it no matter who asks.
    case 'RESET_CLOCK': {
      if (Deno.env.get('DUNE_DEV_SEEDING') !== 'on') {
        return json({
          error: 'clock resets are disabled — this is development scaffolding',
          code: 'dev-only',
        }, 409)
      }
      const { patch: clockPatch, reset } = resetDeadlines(state as never, now, {
        setupSeconds: SETUP_SECONDS,
        charityMs: CHARITY_WINDOW_MS,
        wormSeconds: WORM_SECONDS,
        bidSeconds: BID_SECONDS,
        shipmentSeconds: SHIPMENT_SECONDS,
        battlePickSeconds: BATTLE_PICK_SECONDS,
        battlePlanSeconds: BATTLE_PLAN_SECONDS,
        battleTraitorSeconds: BATTLE_TRAITOR_SECONDS,
        battleVoiceSeconds: BATTLE_VOICE_SECONDS,
        battlePrescienceSeconds: BATTLE_PRESCIENCE_SECONDS,
        battleAllocateSeconds: BATTLE_ALLOCATE_SECONDS,
        battleCaptureSeconds: BATTLE_CAPTURE_SECONDS,
        mentatSeconds: MENTAT_READY_SECONDS,
        nexusSeconds: NEXUS_SECONDS,
        stormCardSeconds: STORM_CARD_SECONDS,
        karamaGiveSeconds: KARAMA_GIVE_SECONDS,
      })
      if (reset.length === 0) {
        return json({ error: 'nothing here holds a clock', code: 'no-clock' }, 409)
      }
      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: { ...state, ...clockPatch },
        p_secrets: {},
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
      return json({ reset, version: data[0].version })
    }

    // ── Dev scaffolding: conjure a position ─────────────────────────────────
    // Give the acting seat spice, cards, forces on the board or in reserve,
    // and put its leaders in the tanks — so a position can be SET UP to test
    // rather than played into. ADDITIVE on purpose: a grant that also took
    // things away would be two tools in one button. Same switch as seeding;
    // ids and names are the operator's to get right — the harness offers
    // only real ones, and this is scaffolding, not a rule.
    case 'DEV_GRANT': {
      if (Deno.env.get('DUNE_DEV_SEEDING') !== 'on') {
        return json({
          error: 'grants are disabled — this is development scaffolding',
          code: 'dev-only',
        }, 409)
      }
      if (!myFaction) return json({ error: 'your seat has no faction', code: 'no-faction' }, 409)
      const giveSpice = Math.max(0, Math.floor(Number(action.spice ?? 0)))
      const giveCards = Array.isArray(action.cards) ? (action.cards as unknown[]).map(String) : []
      const giveForces = Array.isArray(action.forces)
        ? action.forces as { territoryId: string; sector: string; count: number; starred?: number }[]
        : []
      const giveReserves = Math.max(0, Math.floor(Number(action.reserves ?? 0)))
      const giveStarred = Math.max(0, Math.floor(Number(action.reservesStarred ?? 0)))
      const tankLeaders = Array.isArray(action.tankLeaders)
        ? (action.tankLeaders as unknown[]).map(String) : []
      if (giveSpice + giveCards.length + giveForces.length + giveReserves
        + giveStarred + tankLeaders.length === 0) {
        return json({ error: 'nothing asked', code: 'nothing-asked' }, 409)
      }

      const { data: mineRow } = await admin
        .from('match_secrets').select('data')
        .eq('match_id', matchId).eq('player_id', playerId).maybeSingle()
      const secrets = (mineRow?.data ?? {}) as { spice?: number; cards?: string[] }

      // THE ECONOMY STAYS CLOSED even for a conjured card: each granted id is
      // withdrawn from the deck when the deck holds one, so circulation never
      // quietly exceeds the printed set — an inflated deck is how a seeded
      // match came to deadlock bidding on cards that did not exist. A card
      // the deck lacks is still granted; this is scaffolding, and the
      // operator was warned the ids are theirs to get right.
      let grantDecks: Record<string, unknown> = {}
      if (giveCards.length > 0) {
        const { data: deckRow } = await admin
          .from('match_decks').select('cards')
          .eq('match_id', matchId).eq('deck', 'treachery').maybeSingle()
        const pile = [...((deckRow?.cards ?? []) as string[])]
        for (const id of giveCards) {
          const i = pile.indexOf(id)
          if (i >= 0) pile.splice(i, 1)
        }
        grantDecks = { treachery: pile }
      }

      let forces = [...((state.forces ?? []) as {
        faction: string; territoryId: string; sector: string; count: number; starred?: number
      }[])]
      for (const f of giveForces) {
        const count = Math.max(0, Math.floor(Number(f.count)))
        const starred = Math.max(0, Math.min(count, Math.floor(Number(f.starred ?? 0))))
        if (count <= 0) continue
        forces = landForces(
          forces as never, myFaction as never,
          f.territoryId, f.sector as never, count, starred) as never
      }

      let tanks = (state.tanks ?? emptyTanks()) as never
      const revived = (state.revivedLeaders ?? []) as string[]
      for (const name of tankLeaders) {
        tanks = returnLeaderToTanks(
          tanks, myFaction as never, name,
          { wasRevived: revived.includes(name) }) as never
      }

      const players = ((state.players ?? []) as {
        faction: string; reserves: number; reservesStarred?: number; handCount: number
      }[]).map((p) => p.faction === myFaction
        ? {
          ...p,
          reserves: p.reserves + giveReserves,
          ...(giveStarred > 0
            ? { reservesStarred: (p.reservesStarred ?? 0) + giveStarred }
            : null),
          // DERIVED from the row being written, not incremented — so any
          // grant (spice alone included) HEALS a count that has drifted
          // from the hand it stands for.
          handCount: (secrets.cards ?? []).length + giveCards.length,
        }
        : p)

      const { data, error } = await admin.rpc('apply_match_write', {
        p_match_id: matchId,
        p_expected_version: match.version,
        p_state: { ...state, forces, tanks, players },
        p_secrets: {
          [playerId]: {
            ...secrets,
            spice: readSpice(secrets as never) + giveSpice,
            cards: [...(secrets.cards ?? []), ...giveCards],
          },
        },
        p_decks: grantDecks,
      })
      if (error) return json({ error: error.message }, 500)
      if (!data?.length) return json({ error: 'version conflict', code: 'stale' }, 409)
      return json({
        granted: {
          spice: giveSpice, cards: giveCards.length, forces: giveForces.length,
          reserves: giveReserves + giveStarred, tankLeaders: tankLeaders.length,
        },
        version: data[0].version,
      })
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
