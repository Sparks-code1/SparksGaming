/**
 * The game screen driven by several real sessions at once, at ?dune-seats.
 *
 * One authenticated client per seat, each reading its own match_secrets row —
 * see src/dev/multiSeat for why that is the safe shape and what the unsafe ones
 * would have been. Switching seats swaps which session's secrets feed the
 * screen; the public state is the same shared row either way, because it is
 * public.
 *
 * DEV ONLY, and it says so rather than half-working: without VITE_DEV_SEATS and
 * a match id there is nothing to sign in as, and a harness that silently shows
 * an empty board is worse than one that explains itself.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FactionId } from '@/types/Dune/Faction'
import type { DuneGameState } from '@/types/Dune/Game'
import type { DuneSecrets } from '@/lib/dune/charity'
import { startMultiSeat, seatLoginsFromEnv } from '@/dev/multiSeat'
import type { SeatSession, MultiSeat } from '@/dev/multiSeat'
import { DuneGameScreen } from './DuneGameScreen'
import { DevSeatSwitcher } from './DevSeatSwitcher'
import { WormPlacementPanel } from './WormPlacementPanel'
import { dispatchDuneAction } from '@/lib/dune/duneDispatch'
import type { PlacedForce } from './SetupWindow'
import { factionById } from '@/data/dune/factions'
import { TREACHERY_CARDS } from '@/data/dune/treachery'
import { DUNE_TERRITORIES } from '@/data/dune/boardData'
import { FACTION_LOOK } from './SeatLayer'
import { ShipmentPanel } from './ShipmentPanel'
import type { BidRefusal } from '@/lib/dune/bidding'
import { watchDuneMatch } from '@/lib/dune/matchFeed'
import { openAuction, openCharity, auctionExpired, seatedIn, winLines } from '@/lib/dune/publicRow'
import type { PublicRow } from '@/lib/dune/publicRow'
import type { ChatMessage, ChatSendScope } from './ChatPanel'
import { watchDuneChat, sayTo, mergeChat } from '@/lib/dune/duneChat'
import type { ChatFeed } from '@/lib/dune/duneChat'

const PALE = '#f0e2bb'
const SERIF = "Georgia, 'Times New Roman', serif"

/**
 * What to draw before the row arrives.
 *
 * A FALLBACK now, not the story. This was the whole public side of the harness,
 * on the argument that the shared row is identical for everyone and so was not
 * what needed proving. That held right up until the harness could ACT: a seat
 * that posts an action and watches a fixture cannot tell a working round trip
 * from a broken one, and `remaining: 21` here was the literal permanent
 * "21 LEFT" the deck area kept showing.
 */
const PUBLIC_FIXTURE: DuneGameState = {
  storm: 'sector-4', turn: 1, phase: 'Bidding', shieldWall: 'intact', mode: 'advanced',
  spiceDeck: { remaining: 21, discardA: [], discardB: [] },
  players: [], forces: [], spiceOnBoard: {}, awaiting: null,
}

// The row's shape and everything derived from it live in lib/dune/publicRow,
// shared with the real screen. The harness having its own opinion about what
// "the auction is open" means is how it comes to prove something the app does
// not do.

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#0d1220', color: PALE, padding: 28,
      font: `14px ${SERIF}`, lineHeight: 1.5,
    }}>{children}</div>
  )
}

export default function DuneMultiSeatView() {
  const q = new URLSearchParams(window.location.search)
  const matchId = q.get('match') ?? ''
  const logins = useMemo(() => seatLoginsFromEnv(), [])
  const [sessions, setSessions] = useState<SeatSession[]>([])
  const [active, setActive] = useState<FactionId | null>(logins[0]?.faction ?? null)
  const [now, setNow] = useState(() => Date.now())
  const [publicRow, setPublicRow] = useState<PublicRow | null>(null)
  const [chat, setChat] = useState<ChatMessage[]>([])
  const [busy, setBusy] = useState(false)
  /** What the last expired-bid push actually did — said, never swallowed. */
  const [resolveNote, setResolveNote] = useState<string | null>(null)
  /** The grant panel's fields — dev scaffolding, acting on the SELECTED seat. */
  const [grantSpice, setGrantSpice] = useState(5)
  const [grantCard, setGrantCard] = useState('')
  const [grantTerritory, setGrantTerritory] = useState('')
  const [grantSector, setGrantSector] = useState('')
  const [grantCount, setGrantCount] = useState(3)
  const [grantStarred, setGrantStarred] = useState(false)
  const [grantLeader, setGrantLeader] = useState('')
  const [refused, setRefused] = useState<string | null>(null)
  /**
   * Seats that have answered charity this turn, so the modal comes down.
   *
   * LOCAL, and per seat. Passing sends nothing to the server — a claim
   * declined and a claim never made are the same thing to the rules — so
   * there is nothing to read back, and this is the only record that a seat is
   * finished with the window. Keyed by faction because the harness switches
   * between several in one page; a single boolean would dismiss the modal for
   * everybody the moment one of them passed.
   */
  const [answered, setAnswered] = useState<Record<string, number>>({})
  /**
   * The acting seat's OWN last bid refusal.
   *
   * PRIVATE TO THEM, which is why it is held here and not in public state: a
   * rejection announces roughly what a bidder holds, and that is most of what
   * bidding hides. The server says so too — a refused bid writes nothing at
   * all and comes back only in that caller's response.
   *
   * Keyed by faction because the harness holds six seats in one page and a
   * single value would show one seat's refusal to the next one switched to.
   */
  const [bidRefusal, setBidRefusal] = useState<Record<string, BidRefusal | null>>({})

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  /**
   * The live harness, kept so a seat's own row can be re-read on demand.
   *
   * In a ref rather than state: nothing renders off it, and putting it in
   * state would re-run this effect on the very change it produces.
   */
  const seats = useRef<MultiSeat | null>(null)
  /** The sessions as the feed callback sees them — a ref, so the row watcher
   *  need not re-subscribe every time a seat's status changes. */
  const sessionsRef = useRef<SeatSession[]>([])
  useEffect(() => { sessionsRef.current = sessions }, [sessions])
  useEffect(() => {
    if (!matchId || logins.length === 0) return
    const live = startMultiSeat(matchId, logins, setSessions)
    seats.current = live
    return () => { live.stop(); seats.current = null }
  }, [matchId, logins])

  /**
   * The settlement already announced, so it is said once.
   *
   * The row is re-delivered on every subsequent change, and a client that
   * announced on every delivery would repeat the same sale until the next
   * phase. Keyed on the server's timestamp rather than on the awards, because
   * two cards in one turn can go to the same seat for the same price.
   */
  const announced = useRef<number | null>(null)

  /**
   * A finished auction, told to the whole table.
   *
   * FROM THE PUBLIC ROW, which is the point. This used to be composed by
   * whichever client made the closing bid, out of the response only that client
   * received — so on six separate machines the winner alone would see it, and
   * the one seat that already knew was the only one told. Every client receives
   * this row, so every client derives the same line from it.
   */
  useEffect(() => {
    const last = publicRow?.lastAuction
    if (!last || last.at === announced.current) return
    // Set BEFORE announcing: announce() calls setChat, which re-renders, and a
    // guard written afterwards would let the second pass through.
    announced.current = last.at
    for (const line of winLines(last, nameOf)) announce(line)
    // announce and nameOf are stable for the life of the view; the row is what
    // this watches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicRow?.lastAuction?.at])

  /**
   * The shared row, read and then watched.
   *
   * ON ANY SEAT'S CLIENT, deliberately: matches.state is public, so every
   * session sees the identical row and it does not matter which one asks. That
   * is the opposite of the secrets channel, where WHICH session asks is the
   * entire mechanism — and keeping the two visibly different here is worth more
   * than sharing one code path between them.
   *
   * Deliberately simpler than lib/matchSync: no backoff, no poll, no action
   * feed. That module is typed to Risk's GameState and giving it a second game
   * is a change to make on purpose rather than in passing, and this is a dev
   * harness on a local machine.
   */
  const readyClient = sessions.find(s => s.userId)?.client

  /**
   * Read the shared row now, rather than waiting to be told.
   *
   * READ-YOUR-OWN-WRITES, FOR THE PUBLIC HALF. The changefeed is the normal
   * path and this does not replace it — but a client that has just POSTed an
   * action knows the row changed, and a dropped or delayed frame otherwise
   * leaves the screen showing the state before its own move.
   *
   * That is not a cosmetic staleness. An auction where a pass does not appear
   * reads as a pass that did not register: the seat that passed still sees its
   * own clock running, and the seat that should now be acting still sees itself
   * waiting on somebody who has already answered. Nobody can move, and nothing
   * says why.
   *
   * In a ref so the callbacks below can reach it without re-running the effect
   * that installs it.
   */
  const rereadRow = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    if (!matchId || !readyClient) return
    // ON ANY SEAT'S CLIENT, deliberately: matches.state is public, so every
    // session sees the identical row and it does not matter which one asks.
    const feed = watchDuneMatch(matchId, {
      client: readyClient,
      onRow: row => {
        setPublicRow(row)
        // THE SAME HEAL THE REAL SCREEN HAS: a secrets event missed by any
        // seat's channel is re-read on the next public delivery, through that
        // seat's own session and RLS. Every seat, because the harness IS every
        // seat.
        for (const s of sessionsRef.current) {
          void seats.current?.refresh(s.login.faction)
        }
      },
    })
    rereadRow.current = feed.reread
    return () => { rereadRow.current = null; feed.stop() }
  }, [matchId, readyClient])

  if (logins.length === 0) {
    return (
      <Notice>
        <h1 style={{ fontSize: 18, margin: '0 0 10px' }}>Multi-seat harness</h1>
        <p style={{ margin: '0 0 10px' }}>
          No seats configured. Set <code>VITE_DEV_SEATS</code> in <code>.env</code> to a
          semicolon-separated list of <code>faction,seat,email,password</code>:
        </p>
        <pre style={{ background: '#131c2e', padding: 12, borderRadius: 6, overflowX: 'auto' }}>
{`VITE_DEV_SEATS=atreides,player-position-1,a@example.com,pw;harkonnen,player-position-2,b@example.com,pw`}
        </pre>
        <p style={{ margin: '10px 0 0', opacity: 0.75 }}>
          Each is signed in separately and reads only its own secrets row — the harness holds
          several sessions, not one session with more privilege.
        </p>
      </Notice>
    )
  }
  if (!matchId) {
    return (
      <Notice>
        <h1 style={{ fontSize: 18, margin: '0 0 10px' }}>Multi-seat harness</h1>
        <p>Add <code>?dune-seats&amp;match=&lt;match id&gt;</code> to pick the match to join.</p>
      </Notice>
    )
  }

  const mine = sessions.find(s => s.login.faction === active) ?? null

  /**
   * Whether the seat being acted as is actually in the match.
   *
   * A MISMATCH IS SILENT OTHERWISE, and looks like a rendering fault. The tray
   * is gated on finding this faction in state.players — no row, no faction
   * card, no leader discs, no spice — so a VITE_DEV_SEATS naming a faction the
   * match does not seat produces a screen with the middle of it missing and
   * nothing saying why.
   *
   * Easy to arrive at: the seed assigns factions by POSITION in
   * DUNE_SEED_ACCOUNTS and prints a matching VITE_DEV_SEATS, so reordering the
   * emails, editing the line by hand, or pointing at a match seeded earlier all
   * do it.
   */
  /** A faction's printed name, so the chat reads as the table talking. */
  const nameOf = (faction: FactionId) => FACTION_LOOK[faction]?.name ?? faction

  /**
   * End a bid window that has run out, as the seat it is waiting on.
   *
   * AS THAT SEAT, not as whoever is being viewed. This sent the pass from the
   * ACTIVE session, which happened to work whenever the seat on screen was also
   * the seat to act — and failed the rest of the time as not-your-turn, so it
   * looked seat-specific: fine for the Atreides, stuck on the Harkonnen.
   *
   * The server's timeout path answers for whoever is to act regardless of who
   * asked, and stays: on six separate machines nobody can act as another seat,
   * and that is what ends the window there. But it depends on the server
   * agreeing the deadline has passed, and this client's clock ticks once a
   * second — so a button that is visible is not proof the server thinks so too.
   *
   * Here, the harness holds every seat's session. Passing as the seat whose
   * turn it actually is is a plain, legal pass that needs no clocks to agree.
   * Falling back to the viewed seat leaves the server's timeout path to handle
   * a seat this harness was not given a login for.
   */
  const resolveExpiredBid = async () => {
    const waitingOn = publicRow?.auction?.carry?.toAct
    // ANY signed-in session can carry the push: once the deadline has passed
    // the server answers for whoever is to act, whoever asks — proven live
    // on the stuck turn-two match. Preferring the awaited seat keeps the
    // pass a plain legal one even when clocks disagree; falling back keeps
    // one dead session from wedging the table.
    //
    // AND THE OUTCOME IS SAID. The old path could fail three ways in
    // silence — a session without a client no-opped, a busy flag returned
    // early, and an error was filed under the acting seat's refusal slot,
    // which renders only inside that seat's own panel. A button that fails
    // without a word is how the second deadlock read as a rules bug when
    // the rules were fine.
    const actor = [sessions.find(x => x.login.faction === waitingOn), mine, ...sessions]
      .find(x => x?.client)
    if (!actor?.client) { setResolveNote('no signed-in session to push with'); return }
    setResolveNote('pushing…')
    const res = await dispatchDuneAction(matchId, { type: 'BID', bid: { kind: 'pass' } },
      { client: actor.client })
    if (!res.ok) {
      setResolveNote(`refused: ${res.error?.code ?? 'unknown'} — ${res.error?.message ?? ''}`)
      return
    }
    setResolveNote(`window closed — passed for ${waitingOn ?? 'the acting seat'}`)
    await seats.current?.refresh(actor.login.faction)
    await rereadRow.current?.()
  }

  /**
   * Whether the auction is waiting past its own deadline.
   *
   * Read off the row rather than timed here, like every other window in this
   * codebase: the server stamped the moment, and each client subtracts its own
   * clock from it.
   */
  const biddingExpired = auctionExpired(publicRow, now)

  const seatedFactions = (publicRow?.players ?? []).map(p => p.faction)
  const notSeated = !!publicRow && !!active && !seatedIn(publicRow, active)

  /**
   * A line for the acting seat alone.
   *
   * PRIVATE BY DEFAULT HERE, because of what these lines are. "Not eligible for
   * charity" is a sentence about how much spice somebody holds, and the chat is
   * the one place such a sentence would sit in front of the whole table. That a
   * seat CLAIMED is public — the claim is — but what it was worth, and why it
   * was refused, is not.
   *
   * WRITTEN LOCALLY AND NEVER SENT. It is composed from the response this seat
   * received, which only this seat received. Marking a message private does not
   * make its transport private, so a line like this must never travel through
   * matches.state — that row reaches every client, and the field would be a
   * label on an envelope everyone has already opened.
   */
  /**
   * The charity decision for one seat, or null when it has none to make.
   *
   * Null when there is no window, when this seat has already answered it, or
   * when there is no signed-in client to act as — the modal covers the board,
   * so leaving it up for a seat with nothing to decide would hide the game
   * behind a dialog nobody can dismiss.
   */
  const charityFor = (session: SeatSession | null) => {
    if (!session?.client) return null
    const window_ = openCharity(publicRow, answered[session.login.faction])
    if (!window_) return null
    return {
      onClaim: () => void send(session, 'CLAIM_CHARITY'),
      onPass: () => {
        setAnswered(a => ({ ...a, [session.login.faction]: window_.turn }))
        say('passed on charity.')
      },
      busy,
      refused,
    }
  }

  /**
   * The auction for one seat, or null when there is nothing to bid on.
   *
   * EVERYTHING PUBLIC COMES OFF THE STEP, which the server writes into
   * matches.state: the ask, the order, whose turn it is, who has passed, and
   * when the turn to bid shuts. None of it names a card — the auction is
   * card-blind by construction, and the panel could not show one if it tried.
   *
   * THE ONE CARD THAT IS SHOWN comes from somewhere else entirely. Atreides
   * prescience arrives on that seat's own secrets row and DuneGameScreen reads
   * it there with revealedFor(own) — so it is never passed through here, and a
   * seat that is not entitled to it has nothing to be careless with.
   */
  const biddingFor = (session: SeatSession | null) => {
    const open = openAuction(publicRow)
    if (!open || !session?.client) return null
    const carry = open.carry
    return {
      ask: open.ask,
      order: carry.order,
      toAct: carry.toAct,
      passed: carry.passed,
      closesAt: open.closesAt,
      refusal: bidRefusal[session.login.faction] ?? null,
      onBid: (spice: number) => void bid(session, { kind: 'bid' as const, spice }),
      onPass: () => void bid(session, { kind: 'pass' as const }),
    }
  }

  /**
   * The setup answers for one seat, or null when it has no client to act as.
   *
   * NOT FILTERED HERE. Which of the four this seat owes is decided inside the
   * panel off public state, and the panel draws nothing at all for a seat that
   * owes none — so this hands over the four handlers and lets it decide, the
   * same shape DuneMatchScreen uses.
   *
   * THIS IS THE ONE PLACE ALL FOUR CAN BE EXERCISED. Setup deals every seat at
   * once and the answers are independent: the harness holds six real sessions,
   * so switching seats above and answering as each is the only way to play a
   * whole setup through without six browsers.
   */
  const setupFor = (session: SeatSession | null) => {
    if (!session?.client) return null
    return {
      // WHAT IS REPORTED NAMES NO CARD AND NO PREDICTION. These lines are
      // addressed to the acting seat, but the harness puts six seats in one
      // window and the next one switched to reads the same chat — so the two
      // answers that are secrets say only that they were made.
      onFremenPlacement: (at: readonly PlacedForce[]) =>
        void send(session, 'SETUP_ANSWER', { answer: 'fremen-placement', at },
          `placed ${at.reduce((n, a) => n + a.count, 0)} forces.`),
      onPrediction: (faction: FactionId, turn: number) =>
        void send(session, 'SETUP_ANSWER', { answer: 'prediction', faction, turn },
          'sealed your prediction.'),
      onTraitor: (keep: string) =>
        void send(session, 'SETUP_ANSWER', { answer: 'traitor', keep },
          'kept one of your four traitors.'),
      onAdvisorPlacement: (territoryId: string, sector?: string) =>
        void send(session, 'SETUP_ANSWER', {
          answer: 'advisor-placement', territoryId, ...(sector ? { sector } : null),
        }, 'placed your advisor.'),
      onReady: () =>
        void send(session, 'SETUP_ANSWER', { answer: 'ready' },
          'ready — the game starts when every seat is.'),
      busy,
      refused,
    }
  }

  /**
   * One bid or pass, as this seat.
   *
   * A REFUSAL IS NOT AN ERROR HERE. "More than you hold" and "not your turn"
   * are things the server is supposed to say, they change no state, and they
   * are shown to the bidder alone beside a countdown that goes on counting —
   * a refused bid must not be a way to buy thinking time.
   */
  const bid = async (session: SeatSession, answer: { kind: 'bid'; spice: number } | { kind: 'pass' }) => {
    if (busy) return
    setBusy(true)
    setBidRefusal(r => ({ ...r, [session.login.faction]: null }))
    const res = await dispatchDuneAction(matchId, { type: 'BID', bid: answer },
      { client: session.client })
    setBusy(false)
    if (!res.ok) {
      setBidRefusal(r => ({ ...r, [session.login.faction]: (res.error?.code ?? null) as BidRefusal | null }))
      return
    }
    // WINNING AN AUCTION SPENDS SPICE, and the row that changed is this seat's
    // own. Waiting on the changefeed to say so is how a purse stays visibly
    // full after paying — right in the database, wrong on the screen.
    await seats.current?.refresh(session.login.faction)
    // AND THE AUCTION ITSELF MOVED, which is public. Without this a pass looks
    // like a pass that never registered.
    await rereadRow.current?.()
    say(answer.kind === 'pass' ? 'passed on the card.' : `bid ${answer.spice}.`)

    // The settlement is NOT announced here. It is announced off the public
    // row, by every client, so six machines say the same thing — see the
    // effect below.
  }

  /**
   * Open the auction.
   *
   * A DEV CONTROL, like opening charity: which seat may drive a phase
   * transition has no answer in the match state yet. The order, hands and
   * limits come from public state and the faction data — hand SIZES are public
   * at a table, hand contents are not, and only the sizes are sent.
   */
  const openBidding = () => {
    if (!mine?.client || !publicRow) return
    const order = publicRow.players.map(p => p.faction)
    const hands = Object.fromEntries(publicRow.players.map(p => [p.faction, p.handCount]))
    const limits = Object.fromEntries(
      publicRow.players.map(p => [p.faction, factionById(p.faction)?.handLimit ?? 4]))
    void send(mine, 'OPEN_BIDDING', { order, hands, limits })
  }

  /**
   * One action, as this seat, with the refusal shown rather than thrown.
   *
   * `said` is what to report on success, to the acting seat alone. Optional
   * because most of what goes through here is visible on the board a moment
   * later anyway — but a setup answer is not: the panel simply stops offering
   * it, which looks identical to a click that did nothing.
   */
  const send = async (
    session: SeatSession, type: string, fields: Record<string, unknown> = {}, said?: string,
  ) => {
    if (busy) return
    setBusy(true)
    setRefused(null)
    const res = await dispatchDuneAction(matchId, { type, ...fields }, { client: session.client })
    setBusy(false)
    if (!res.ok) {
      setRefused(res.error?.code ?? 'refused')
      // THE CODE RIDES ALONG. The message alone is what made a refused
      // battle plan unactionable: the code always named the illegal part.
      say(`${type} refused: ${res.error?.message ?? 'unknown'} (${res.error?.code ?? '?'})`)
      return
    }
    // Opening a window, closing one, opening an auction: all of them change the
    // public row and nothing else.
    await rereadRow.current?.()
    // Claiming charity pays into this seat's purse, so re-read it for the same
    // reason a bid does — and the claim itself is public, so re-read that too.
    await seats.current?.refresh(session.login.faction)
    await rereadRow.current?.()
    // CHARITY'S BOOKKEEPING IS CHARITY'S. This tail used to run for every
    // action `send` carried — so opening an auction reported itself as a
    // charity claim, and marked the acting seat as having answered a window it
    // had not touched, taking the modal down for it. Harmless while charity was
    // most of what went through here; not once the four setup answers did.
    if (type === 'CLAIM_CHARITY') {
      // Answered, so the modal comes down. The board comes back on the
      // changefeed; nothing is advanced here.
      const turn = publicRow?.charity?.turn
      if (turn != null) setAnswered(a => ({ ...a, [session.login.faction]: turn }))
      say(`claimed charity (+${(res.data as { granted?: number })?.granted ?? 0}).`)
      return
    }
    say(said ?? `${type} accepted.`)
  }

  /**
   * A line the whole table may read.
   *
   * SEPARATE FROM say(), which addresses the acting seat alone. Most of what
   * this harness reports is private — a charity refusal says roughly what a
   * seat holds — but an auction result is not: who won and what they paid are
   * public at a table, and announcing them to one seat would be the wrong way
   * round.
   *
   * WHAT IT NAMES IS THE WINNER AND THE PRICE, never the card. The auction is
   * card-blind by construction and the winner's hand is theirs alone; a line
   * naming the card would hand the table something no seat is entitled to and
   * would do it in the one place everybody reads.
   */
  const announce = (line: string) => {
    setChat(c => [...c.slice(-40), {
      id: `${Date.now()}-${c.length}`, faction: null, from: 'Game',
      text: line, at: Date.now(),
    }])
  }

  const say = (line: string) => {
    const to = mine?.login.faction
    setChat(c => [...c.slice(-40), {
      id: `${Date.now()}-${c.length}`, faction: null, from: 'Game',
      text: line, at: Date.now(), ...(to ? { to } : null),
    }])
  }

  /**
   * THE TABLE'S REAL TALK, under the SELECTED seat's own session. Until now
   * the harness chat held narration only — the embed's chat column never
   * carried a single spoken line, another surface the embed did not carry,
   * found the same way the rail was. Private lines are delivered per seat,
   * so the feed re-subscribes when the active seat changes and reads the
   * log as that seat; ChatPanel already filters what a seat may not see.
   * The narration lines stay local and merge in beside the spoken ones.
   */
  const talk = useRef<ChatFeed | null>(null)
  useEffect(() => {
    const client = mine?.client
    if (!matchId || !client) return
    const feed = watchDuneChat(matchId, {
      client,
      onMessages: lines => setChat(c => mergeChat(c, lines)),
    })
    talk.current = feed
    return () => { feed.stop(); talk.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, mine?.client])

  /** Say something AS the selected seat — the same insert the real screen
   *  makes, through this seat's own client, so RLS sees the right author. */
  const speakAs = async (session: SeatSession, text: string, scope: ChatSendScope) => {
    try {
      await sayTo(matchId, { playerId: session.login.seat, faction: session.login.faction },
        text, scope as never, session.client ?? undefined)
      await talk.current?.reread()
    } catch (e) {
      say(e instanceof Error ? e.message : 'that did not send')
    }
  }
  const tableOthers = sessions
    .filter(s => s.login.faction !== active)
    .map(s => ({ playerId: s.login.seat, name: nameOf(s.login.faction) }))
  const harnessSeatNames = Object.fromEntries(
    sessions.map(s => [s.login.seat, nameOf(s.login.faction)]))

  return (
    <>
      <DuneGameScreen
        charity={charityFor(mine)}
        setup={setupFor(mine)}
        bidding={biddingFor(mine)}
        state={publicRow ?? PUBLIC_FIXTURE}
        seat={active}
        // ONE SEAT'S ROW, from that seat's own session. The screen has no way to
        // reach the others: they are behind different clients entirely.
        own={(mine?.secrets ?? null) as DuneSecrets | null}
        chat={chat}
        onSend={mine ? (text, scope) => void speakAs(mine, text, scope) : undefined}
        talkingTo={mine ? tableOthers : []}
        seatNames={harnessSeatNames}
        now={now}
        // THE WHOLE GRAMMAR, not most of it. This embed predates the rail and
        // the board's click layers, and without these two props the screen
        // quietly renders neither — which read, three reports running, as a
        // broken phase rather than a starved embed. The harness drives them
        // through the selected seat's own session, like everything else here.
        onShipReserves={mine
          ? a => void send(mine, 'SHIP',
            { kind: 'off-planet', to: a.to, count: a.count, starred: a.starred } as never)
          : undefined}
        onShipSpecial={mine
          ? a => void send(mine, 'SHIP', a as never)
          : undefined}
        onRevive={mine
          ? a => void send(mine, 'REVIVE', a as never)
          : undefined}
        onBattlePick={mine
          ? (territoryId, opponent) => void send(mine, 'BATTLE_PICK', { territoryId, opponent } as never)
          : undefined}
        onBattlePlan={mine
          ? plan => void send(mine, 'BATTLE_PLAN', plan as never)
          : undefined}
        onBattleAnswer={mine
          ? call => void send(mine, call ? 'BATTLE_TRAITOR' : 'BATTLE_CONTINUE')
          : undefined}
        battleRefusal={refused}
        onMoveStack={mine
          ? a => void send(mine, 'MOVE', a as never)
          : undefined} />
      <DevSeatSwitcher sessions={sessions} active={active} onPick={setActive} />

      {/* DRIVING, not just watching.
          The panel posts through THIS SEAT'S client, so switching seats above
          changes who the server thinks is claiming — without any field in the
          payload saying so, and without this page holding anything the seat's
          own browser would not. That is the whole point of the harness: six
          real sessions, and the acting one is whichever token is presented. */}
      {/* TOP RIGHT, and small. It has been round three corners: bottom-left,
          where it covered DevSeatSwitcher's first two seat buttons; then
          top-left, where it sat on the chat and buried the messages this
          harness writes there. The chat owns the left column and the switcher
          owns the bottom of it, so what is left is the right — over the HUD,
          which is a list of other seats and the least costly thing to cover.

          It is also much smaller than it was, most of its contents having
          become a modal over the board. */}
      <div style={{
        position: 'fixed', right: 12, top: 12, width: 240, maxHeight: '60vh',
        overflowY: 'auto', zIndex: 40,
        background: '#0d1220ee', color: PALE, border: '1px solid #ffffff22',
        borderRadius: 8, padding: 10, font: `12px ${SERIF}`,
      }}>
        {/* NO CLIENT, NO PANEL. dispatchDuneAction falls back to the app's own
            session when none is given — right for the app, wrong here: a seat
            still signing in would post as whoever this browser happens to be,
            and the action would succeed under the wrong seat rather than fail.
            The one case where acting as the wrong seat is possible is the one
            case this must not reach. */}
        {/* THE PAUSE IS SHOWN TO EVERY SEAT, and only the Fremen get controls.
            Six people round a table can all see who is being waited on; hiding
            it is how a play-by-network game ends up with everybody waiting on
            everybody. `mine` decides the buttons, not the visibility. */}
        {publicRow?.spiceBlow && mine?.client && (
          <WormPlacementPanel
            pause={publicRow.spiceBlow}
            matchId={matchId}
            client={mine.client}
            mine={mine.login.faction === 'fremen'}
            say={say} />
        )}

        {/* SAID OUT LOUD, because the alternative is a screen with its middle
            missing and nothing explaining it. The tray needs this faction to be
            in state.players; when it is not, there is no faction card, no
            leader discs and no spice, and that looks like a rendering fault
            rather than a match this seat is not in. */}
        {notSeated && (
          <p style={{
            margin: '0 0 8px', padding: 8, borderRadius: 6,
            background: '#5a1d1d', color: '#ffe6e0', lineHeight: 1.45,
          }}>
            <b>{active}</b> is not seated in this match. The tray is empty because
            the match seats {seatedFactions.length ? seatedFactions.join(', ') : 'nobody'}.
            Check VITE_DEV_SEATS against the line the seed script printed.
          </p>
        )}

        {/* OPENING AND CLOSING ARE NOT PLAYER MOVES. Claiming and passing now
            live in the modal over the board, where the decision belongs. The
            charity and bidding buttons below predate the loop and stay for
            driving a phase out of order; a real game uses the advance.

            The running log moved to the chat, where a private line can be
            marked as one. */}
        {mine?.client ? (
          <>
            {/* THE LOOP, as the real screen drives it. Sent as whichever seat
                is selected, and the SERVER rules: the host presses early,
                anyone once the phase's look-window shuts, and a hold comes
                back naming what the turn is waiting for — so this is also how
                the refusals get exercised without six browsers. */}
            <b style={{ display: 'block', marginBottom: 6 }}>The turn</b>
            <button onClick={() => void send(mine, 'ADVANCE_PHASE')} disabled={busy}>
              Advance the phase
            </button>{' '}
            {/* DEV SCAFFOLDING, harness-only by construction: the real match
                screen never posts RESET_CLOCK, and the server refuses it
                anyway unless the project's dev switch is on. Re-stamps
                whichever window is live at its own full length, so a window
                let expire over lunch can be re-run without replaying the
                match to reach it. */}
            <button onClick={() => void send(mine, 'RESET_CLOCK', {}, 'reset the phase clock.')}
              disabled={busy}>
              Reset the clock (dev)
            </button>

            {/* THE GRANT: conjure a position to test rather than playing
                into it. Acts on the SELECTED seat — choosing whom to give
                to is the seat switcher's job, like every other act here.
                Harness-only by construction, and the server refuses the
                action anyway unless the project's dev switch is on. */}
            <b style={{ display: 'block', margin: '10px 0 6px' }}>Grant (dev)</b>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="number" min={1} value={grantSpice} style={{ width: 52 }}
                onChange={e => setGrantSpice(Math.max(1, Number(e.target.value)))} />
              <button disabled={busy}
                onClick={() => void send(mine, 'DEV_GRANT', { spice: grantSpice },
                  'granted ' + grantSpice + ' spice.')}>
                Give spice
              </button>
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 3 }}>
              <select value={grantCard} onChange={e => setGrantCard(e.target.value)}
                style={{ flex: 1, minWidth: 0 }}>
                <option value="">card…</option>
                {TREACHERY_CARDS.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button disabled={busy || !grantCard}
                onClick={() => void send(mine, 'DEV_GRANT', { cards: [grantCard] },
                  'granted a card.')}>
                Give
              </button>
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 3, flexWrap: 'wrap' }}>
              <select value={grantTerritory}
                onChange={e => { setGrantTerritory(e.target.value); setGrantSector('') }}
                style={{ flex: 1, minWidth: 0 }}>
                <option value="">territory…</option>
                {DUNE_TERRITORIES.map(t => (
                  <option key={t.id} value={t.id}>{t.displayName}</option>
                ))}
              </select>
              {(DUNE_TERRITORIES.find(t => t.id === grantTerritory)?.sectors.length ?? 0) > 1 && (
                <select value={grantSector} onChange={e => setGrantSector(e.target.value)}>
                  <option value="">sector…</option>
                  {DUNE_TERRITORIES.find(t => t.id === grantTerritory)?.sectors.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              )}
              <input type="number" min={1} value={grantCount} style={{ width: 44 }}
                onChange={e => setGrantCount(Math.max(1, Number(e.target.value)))} />
              <label style={{ fontSize: 11 }}>
                <input type="checkbox" checked={grantStarred}
                  onChange={e => setGrantStarred(e.target.checked)} />★
              </label>
              <button disabled={busy || !grantTerritory}
                onClick={() => {
                  const t = DUNE_TERRITORIES.find(x => x.id === grantTerritory)
                  const sector = grantSector || t?.sectors[0]
                  if (!sector) return
                  void send(mine, 'DEV_GRANT', {
                    forces: [{
                      territoryId: grantTerritory, sector, count: grantCount,
                      ...(grantStarred ? { starred: grantCount } : null),
                    }],
                  }, 'granted ' + grantCount + ' force(s) on the board.')
                }}>
                Place
              </button>
              <button disabled={busy}
                onClick={() => void send(mine, 'DEV_GRANT',
                  grantStarred
                    ? { reservesStarred: grantCount }
                    : { reserves: grantCount },
                  'granted ' + grantCount + ' to reserves.')}>
                To reserves
              </button>
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 3 }}>
              <select value={grantLeader} onChange={e => setGrantLeader(e.target.value)}
                style={{ flex: 1, minWidth: 0 }}>
                <option value="">leader…</option>
                {(active ? factionById(active)?.leaders ?? [] : []).map(l => (
                  <option key={l.name} value={l.name}>{l.name}</option>
                ))}
              </select>
              <button disabled={busy || !grantLeader}
                onClick={() => void send(mine, 'DEV_GRANT', { tankLeaders: [grantLeader] },
                  grantLeader + ' to the tanks.')}>
                To the tanks
              </button>
            </div>

            {/* THE ROTATION, driven as whichever seat is selected. The real
                screen has the same panel; the harness had only the timer,
                which read as a phase with nothing to press. */}
            {publicRow?.shipping && (
              <ShipmentPanel
                shipping={publicRow.shipping}
                forces={publicRow.forces ?? []}
                seat={mine.login.faction}
                guildSeated={(publicRow.players ?? []).some(p => p.faction === 'spacing-guild')}
                now={Date.now()}
                busy={busy}
                onShip={a => void send(mine, 'SHIP', a as never)}
                onMove={a => void send(mine, 'MOVE', a as never)}
                onPass={() => void send(mine, 'PASS_TURN')}
                devForms />
            )}

            <b style={{ display: 'block', margin: '10px 0 6px' }}>CHOAM Charity</b>
            <button onClick={() => void send(mine, 'OPEN_CHARITY')} disabled={busy}>
              Open window
            </button>{' '}
            <button onClick={() => void send(mine, 'CLOSE_CHARITY')} disabled={busy}>
              Close window
            </button>

            {/* THE AUCTION. Opening it is the same kind of dev control:
                which seat may drive a phase transition has no answer in the
                match state yet, and nothing else calls OPEN_BIDDING. */}
            <b style={{ display: 'block', margin: '10px 0 6px' }}>Bidding</b>
            <button onClick={openBidding} disabled={busy}>Open auction</button>{' '}

            {/* PAST THE DEADLINE, ANY SEAT MAY PUSH IT ALONG. awaitingBy says a
                timed-out stop still needs an answer and the caller supplies the
                one silence means — a pass, for bidding. The server applies that
                whoever asks, but something has to ask: the panel offers Bid and
                Pass only to the seat whose turn it is, so a seat that has walked
                away leaves nobody able to press anything and the auction cannot
                end. This is that button. */}
            {biddingExpired && (
              <button onClick={() => void resolveExpiredBid()}>
                Resolve expired bid
              </button>
            )}
            {resolveNote && (
              <span data-resolve-note="" style={{ display: 'block', fontSize: 11, marginTop: 3, opacity: 0.85 }}>
                {resolveNote}
              </span>
            )}
          </>
        ) : (
          <p style={{ margin: 0, opacity: 0.7 }}>
            {mine ? `${mine.login.faction} is still signing in…` : 'pick a seat to act as'}
          </p>
        )}
      </div>
    </>
  )
}
