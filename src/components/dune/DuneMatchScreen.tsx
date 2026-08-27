/**
 * A real Dune match, in one browser, as one seat.
 *
 * THE THING THE HARNESS HAS BEEN STANDING IN FOR. ?dune-seats drives six seats
 * from one page with six sessions, which is the hard version of this and exists
 * to prove the boundary holds; this is the ordinary version, and it is simpler
 * in exactly the way that matters — ONE session, so the seat this browser holds
 * is whoever it is signed in as, and there is nothing here that could act as
 * anybody else even by mistake.
 *
 * WHERE EACH HALF COMES FROM, which is the whole architecture in two lines:
 *
 *   The public half is matches.state, watched by watchDuneMatch. Identical for
 *   every client, and it says nothing any seat is not entitled to.
 *
 *   The private half is this seat's match_secrets row, watched by
 *   startSecretsSync on this browser's own session. RLS is what makes it
 *   private — not this component, which could not reach another seat's row if
 *   it tried, because it has no credentials to do it with.
 *
 * WHICH SEAT THIS IS comes from the database, never from the URL. The match id
 * is in the address bar and can be anything; the seat is match_players' row for
 * the signed-in user, and the server resolves it again the same way on every
 * action. A seat id in a request is a claim about identity — see duneDispatch,
 * which refuses payloads that carry one.
 *
 * TALKING IS REAL, and separate from everything else on this screen. Lines the
 * table says go through match_chat — see lib/dune/duneChat — while lines this
 * client composes ABOUT ITSELF ("bid 4", "charity refused") stay here and are
 * marked for this seat alone. A refusal is a sentence about how much spice
 * somebody holds, and the chat is the one place such a sentence would sit in
 * front of everybody.
 *
 * WHAT IT CANNOT DO YET, said plainly because a screen that half-works is worse
 * than one that explains itself: nothing here opens a phase. Charity's window
 * and the auction are opened by OPEN_CHARITY and OPEN_BIDDING, which the dev
 * harness fires from buttons because "which seat may drive a phase transition"
 * has no answer in the match state yet. Until it does, a real match sits in
 * whatever phase it was seeded into and this screen plays whatever window is
 * open in it.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentUser, onAuthChange } from '@/lib/auth'
import type { AuthUser } from '@/lib/auth'
import { startSecretsSync, readOwnSecrets } from '@/lib/secretsSync'
import { watchDuneMatch } from '@/lib/dune/matchFeed'
import type { DuneMatchFeed, FeedStatus } from '@/lib/dune/matchFeed'
import {
  openAuction, openCharity, auctionExpired, seatedIn, winLines, openSetup, setupWants,
} from '@/lib/dune/publicRow'
import type { PublicRow } from '@/lib/dune/publicRow'
import { dispatchDuneAction } from '@/lib/dune/duneDispatch'
import { watchDuneChat, sayTo, mergeChat, sayable } from '@/lib/dune/duneChat'
import type { ChatScope } from '@/lib/dune/duneChat'
import type { ChatFeed } from '@/lib/dune/duneChat'
import type { DuneAction } from '@/lib/dune/duneDispatch'
import type { DuneSecrets } from '@/lib/dune/charity'
import type { FactionId } from '@/types/Dune/Faction'
import type { BidRefusal } from '@/lib/dune/bidding'
import { DuneGameScreen } from './DuneGameScreen'
import type { PlacedForce } from './SetupWindow'
import { WormPlacementPanel } from './WormPlacementPanel'
import { FACTION_LOOK } from './SeatLayer'
import SoundSettings from '@/components/SoundSettings'
import type { ChatMessage } from './ChatPanel'

const PALE = '#f0e2bb'
const SERIF = "Georgia, 'Times New Roman', serif"

const nameOf = (f: FactionId) => FACTION_LOOK[f]?.name ?? f

/** Which seat this browser holds, as the database has it. */
interface MySeat {
  /** match_players.player_id — 'p1'..'p6'. What match_secrets rows are keyed by. */
  playerId: string
  faction: FactionId
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#0d1220', color: PALE, padding: 28,
      font: `14px ${SERIF}`, lineHeight: 1.55,
    }}>{children}</div>
  )
}

export interface DuneMatchScreenProps {
  matchId: string
  /**
   * Leave the game.
   *
   * THE MATCH DOES NOT END. Five other people are still playing it, and the
   * seat stays yours — walking away from the table is not resigning from the
   * game, exactly as Risk's "← Menu" leaves a game running and resumable.
   * Absent means no way out is offered, which is what a standalone route gets.
   */
  onExit?(): void
}

export function DuneMatchScreen({ matchId, onExit }: DuneMatchScreenProps) {
  /** Confirmed before it happens — see the note where it is drawn. */
  const [leaving, setLeaving] = useState(false)
  /** The corner menu, open or shut. */
  const [menuOpen, setMenuOpen] = useState(false)
  /**
   * Everybody's SEAT ID, which is a different thing from their place on the
   * board — see the note where it is read.
   */
  const [roster, setRoster] = useState<
    { playerId: string; faction: FactionId; name: string }[]>([])
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined)
  const [seat, setSeat] = useState<MySeat | null | undefined>(undefined)
  const [row, setRow] = useState<PublicRow | null>(null)
  const [feed, setFeed] = useState<FeedStatus>('connecting')
  const [own, setOwn] = useState<DuneSecrets | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [chat, setChat] = useState<ChatMessage[]>([])
  const [sending, setSending] = useState(false)
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)
  const [bidRefusal, setBidRefusal] = useState<BidRefusal | null>(null)
  /**
   * The charity turn this seat has answered.
   *
   * LOCAL, because passing sends nothing: a claim declined and a claim never
   * made are the same thing to the rules, so there is no server record to read
   * back. It is the turn number rather than a boolean so the next turn's window
   * opens by itself.
   */
  const [answeredTurn, setAnsweredTurn] = useState<number | null>(null)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // ── who is signed in ──────────────────────────────────────────────────────
  useEffect(() => {
    let live = true
    void getCurrentUser().then(u => { if (live) setUser(u) })
    const off = onAuthChange(u => { if (live) setUser(u) })
    return () => { live = false; off() }
  }, [])

  // ── which seat that is, in this match ─────────────────────────────────────
  // FROM match_players, not from the URL. The address bar carries the match; it
  // does not get to say who you are in it.
  useEffect(() => {
    if (!matchId || user === undefined) return
    if (user === null) { setSeat(null); return }
    let live = true
    void supabase
      .from('match_players')
      .select('player_id, faction_id')
      .eq('match_id', matchId)
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!live) return
        setSeat(data?.player_id && data?.faction_id
          ? { playerId: data.player_id as string, faction: data.faction_id as FactionId }
          : null)
      })
    return () => { live = false }
  }, [matchId, user])

  /**
   * The seat ids of everybody at the table.
   *
   * WHY THIS IS NOT THE PUBLIC ROW'S SEATING. There are two seat namespaces and
   * they are easy to confuse, which is exactly what went wrong:
   *
   *   DunePlayerPublic.seat is 'player-position-N' — the printed circle a
   *   player sits at, which the board draws.
   *
   *   match_players.player_id is 'p1'..'p6' — the seat itself, which
   *   match_secrets rows are keyed by and which every policy checks.
   *
   * A whisper names the SECOND one. Built from the first, every whisper named a
   * recipient no policy could match, and the insert came back as "new row
   * violates row-level security policy" — the database correctly refusing a
   * line addressed to somebody who does not exist. multiSeat.ts has a note
   * about these two being different; it did not stop this.
   *
   * A SEPARATE READ from the seat lookup above, deliberately: that one is
   * filtered by user_id in the DATABASE, which is the rule the server applies
   * too, and folding the two together would have meant picking my own row out
   * of a list on the client. One extra request is cheaper than that.
   *
   * Only for a seated player: a spectator has no composer to address.
   */
  useEffect(() => {
    if (!matchId || !seat) return
    let live = true
    void supabase
      .from('match_players')
      .select('player_id, faction_id, name')
      .eq('match_id', matchId)
      .then(({ data }) => {
        if (!live) return
        const rows = (data ?? []) as
          { player_id: string; faction_id: string | null; name: string | null }[]
        setRoster(rows
          .filter(r => r.player_id && r.faction_id)
          .map(r => ({
            playerId: r.player_id,
            faction: r.faction_id as FactionId,
            name: r.name ?? r.player_id,
          })))
      })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, seat?.playerId])

  // ── the public row ────────────────────────────────────────────────────────
  const live = useRef<DuneMatchFeed | null>(null)
  useEffect(() => {
    if (!matchId) return
    const f = watchDuneMatch(matchId, {
      onRow: setRow,
      onStatus: setFeed,
    })
    live.current = f
    return () => { f.stop(); live.current = null }
  }, [matchId])

  // ── this seat's own row ───────────────────────────────────────────────────
  // On the app's own session, which is this seat's. There is no second client
  // in this page and no way to ask for another seat's row.
  useEffect(() => {
    if (!matchId || !seat) return
    const stop = startSecretsSync(matchId, {
      expectPlayerId: seat.playerId,
      onSecrets: r => setOwn(r.data as DuneSecrets),
      onForeignRow: r => say(`received seat ${r.playerId}'s row — RLS is not holding`),
    })
    return stop
    // `say` is stable enough for this; the seat is what this watches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, seat?.playerId])

  /**
   * The table's talk.
   *
   * MERGED RATHER THAN REPLACED, because this list holds two kinds of line: the
   * ones everybody said, which arrive here, and the ones this client composed
   * about its own turn, which never leave the browser. Replacing the list on
   * every frame would wipe the local half every time somebody spoke.
   */
  const talk = useRef<ChatFeed | null>(null)
  useEffect(() => {
    if (!matchId) return
    const feed = watchDuneChat(matchId, {
      onMessages: lines => setChat(c => mergeChat(c, lines)),
    })
    talk.current = feed
    return () => { feed.stop(); talk.current = null }
  }, [matchId])

  /**
   * Say something to the table.
   *
   * Absent for a spectator, which is what makes the box disappear for them
   * rather than refusing what they type: the insert policy would refuse it
   * anyway, and a chat box that swallows what you write is worse than none.
   */
  const speak = async (text: string, scope: ChatScope = { kind: 'table' }) => {
    if (!seat || sending || !sayable(text)) return
    setSending(true)
    try {
      await sayTo(matchId, { playerId: seat.playerId, faction: seat.faction }, text, scope)
      // READ-YOUR-OWN-WRITES, like everything else here: a line that does not
      // appear reads as a line that was not sent, and people say it twice.
      await talk.current?.reread()
    } catch (e) {
      say(e instanceof Error ? e.message : 'that did not send')
    }
    setSending(false)
  }

  const rereadOwn = async () => {
    if (!seat) return
    const fresh = await readOwnSecrets(matchId, seat.playerId)
    // KEEP WHAT WE HAD on a failed read. Blanking the tray because one request
    // hiccuped looks exactly like losing your hand.
    if (fresh) setOwn(fresh as DuneSecrets)
  }

  /** A line for this seat alone. Nothing here is ever sent anywhere. */
  const say = (text: string) => setChat(c => [...c.slice(-40), {
    id: `${Date.now()}-${c.length}`, faction: null, from: 'Game',
    text, at: Date.now(), ...(seat ? { to: seat.faction } : null),
  }])

  /** A line the whole table derives for itself from the public row. */
  const announce = (text: string) => setChat(c => [...c.slice(-40), {
    id: `${Date.now()}-${c.length}`, faction: null, from: 'Game', text, at: Date.now(),
  }])

  /**
   * A settlement, said once.
   *
   * The row is re-delivered on every subsequent change, so the server's
   * timestamp is the key: two cards in one turn can go to the same seat for the
   * same price, which makes the awards themselves unreliable for this.
   */
  const announced = useRef<number | null>(null)
  useEffect(() => {
    const last = row?.lastAuction
    if (!last || last.at === announced.current) return
    // Set BEFORE announcing: announce() re-renders, and a guard written
    // afterwards would let the second pass through.
    announced.current = last.at
    for (const line of winLines(last, nameOf)) announce(line)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.lastAuction?.at])

  /**
   * Everybody else at the table, for addressing a line to one of them.
   *
   * BY SEAT ID, off the roster — see the read above for why not off the public
   * row. Named by faction, because that is what a player recognises in a list.
   * Yourself excluded: whispering to yourself is a note, and the panel is not a
   * notebook.
   */
  const others = roster
    .filter(r => r.playerId !== seat?.playerId)
    // NAMED BY PERSON AND POWER BOTH. In a whisper list the person is what you
    // are choosing between; the faction is how you remember which is which.
    .map(r => ({ playerId: r.playerId, name: `${r.name} — ${nameOf(r.faction)}` }))

  /** What each seat's player is called, for the chat. */
  const seatNames = Object.fromEntries(roster.map(r => [r.playerId, r.name]))

  const setup = openSetup(row)
  const auction = useMemo(() => openAuction(row), [row])
  const charityWindow = openCharity(row, answeredTurn)
  const expired = auctionExpired(row, now)

  /** One action as this seat, with a refusal shown rather than thrown. */
  const send = async (action: DuneAction) => {
    if (busy) return null
    setBusy(true)
    setRefused(null)
    // NO CLIENT PASSED. dispatchDuneAction uses the app's own session, which is
    // the only session this page has — the acting seat is stated by the token
    // in the header and by nothing in the payload.
    const res = await dispatchDuneAction(matchId, action)
    setBusy(false)
    if (!res.ok) {
      setRefused(res.error?.code ?? 'refused')
      return null
    }
    // The row moved and so may this seat's own. Both are re-read rather than
    // waited for — see the notes on reread and readOwnSecrets.
    await live.current?.reread()
    await rereadOwn()
    return res
  }

  const claimCharity = async () => {
    const res = await send({ type: 'CLAIM_CHARITY' })
    const turn = row?.charity?.turn
    if (turn != null) setAnsweredTurn(turn)
    if (res) say(`claimed charity (+${(res.data as { granted?: number })?.granted ?? 0}).`)
    else say('charity refused.')
  }

  const passCharity = () => {
    const turn = row?.charity?.turn
    if (turn != null) setAnsweredTurn(turn)
    say('passed on charity.')
  }

  const bid = async (answer: { kind: 'bid'; spice: number } | { kind: 'pass' }) => {
    if (busy) return
    setBusy(true)
    setBidRefusal(null)
    const res = await dispatchDuneAction(matchId, { type: 'BID', bid: answer })
    setBusy(false)
    if (!res.ok) {
      // A REFUSAL IS NOT AN ERROR. "More than you hold" and "not your turn" are
      // things the server is supposed to say, they change nothing, and they are
      // shown to the bidder alone beside a clock that goes on counting — a
      // refused bid must not be a way to buy thinking time.
      setBidRefusal((res.error?.code ?? null) as BidRefusal | null)
      return
    }
    await live.current?.reread()
    await rereadOwn()
    say(answer.kind === 'pass' ? 'passed on the card.' : `bid ${answer.spice}.`)
  }

  /**
   * One setup answer, as this seat.
   *
   * THROUGH THE SAME send() AS EVERYTHING ELSE, so a refusal lands in `refused`
   * and the panel shows it rather than this page inventing a second way to
   * fail. The server settles the decision and the row comes back with it gone
   * from `outstanding`, which is what takes the control off the screen — this
   * never marks anything answered locally. A client that hid its own control
   * on a request it had not yet been told succeeded would hide it on a request
   * that was about to be refused.
   */
  const answerSetup = async (answer: Record<string, unknown>, line: string) => {
    const res = await send({ type: 'SETUP_ANSWER', ...answer })
    say(res ? line : 'the server refused that setup answer.')
  }

  const setupAnswers = {
    onFremenPlacement: (at: readonly PlacedForce[]) => void answerSetup(
      { answer: 'fremen-placement', at },
      `placed your forces: ${at.map(a => a.count).join(' + ')}.`),
    onPrediction: (faction: FactionId, turn: number) => void answerSetup(
      { answer: 'prediction', faction, turn },
      // NOT WHAT WAS PREDICTED. This line is local, but the prediction is the
      // one secret that is worthless the moment it is read over a shoulder,
      // and a chat log scrolls.
      'sealed your prediction.'),
    onTraitor: (keep: string) => void answerSetup(
      { answer: 'traitor', keep },
      // AND NOT WHICH LEADER, for the same reason and more of it: a known
      // traitor is a battle that cannot be lost.
      'kept one of your four traitors.'),
    onAdvisorPlacement: (territoryId: string, sector?: string) => void answerSetup(
      { answer: 'advisor-placement', territoryId, ...(sector ? { sector } : null) },
      'placed your advisor.'),
    // A DECLARATION, NOT A DECISION: recorded on the shared row, so the READY
    // tag under this seat's bubble is the confirmation — no local line needed.
    onReady: () => void answerSetup({ answer: 'ready' },
      'ready — the game starts when every seat is.'),
    busy,
    refused,
  }

  // ── what to show before there is a game to show ───────────────────────────
  if (!matchId) {
    return <Notice><b>No match.</b> Open this screen with <code>?dune-match=&lt;id&gt;</code>.</Notice>
  }
  if (user === undefined || seat === undefined) {
    return <Notice>Finding your seat…</Notice>
  }
  if (user === null) {
    return (
      <Notice>
        <b>Sign in first.</b> The server identifies players by account: which seat you
        hold is a row in the database matched against your token, so there is nothing
        to show until it knows who is asking.
      </Notice>
    )
  }

  const spectating = seat === null
  const notSeated = !!row && !seatedIn(row, seat?.faction ?? null)

  return (
    <>
      <DuneGameScreen
        state={row ?? EMPTY}
        seat={seat?.faction ?? null}
        own={own}
        chat={chat}
        onSend={seat ? (text: string, scope: ChatScope) => void speak(text, scope) : undefined}
        talkingTo={seat ? others : []}
        seatNames={seatNames}
        now={now}
        setup={seat ? setupAnswers : null}
        charity={charityWindow && seat ? {
          onClaim: () => void claimCharity(),
          onPass: passCharity,
          busy,
          refused,
        } : null}
        bidding={auction && seat ? {
          ask: auction.ask,
          order: auction.carry.order,
          toAct: auction.carry.toAct,
          passed: auction.carry.passed,
          closesAt: auction.closesAt,
          refusal: bidRefusal,
          onBid: (spice: number) => void bid({ kind: 'bid', spice }),
          onPass: () => void bid({ kind: 'pass' }),
        } : null} />

      {/* THE WAY OUT.
          Beside everything else in the corner, and it CONFIRMS FIRST: it sits
          near controls that get pressed in a hurry, and leaving mid-auction
          because a finger slipped is the sort of thing that ends an evening.
          The game is never lost either way — the match runs on without you and
          the seat stays yours, which is what the confirmation says rather than
          leaving somebody to guess. Risk's "← Menu" works the same way. */}
      {/* TOP RIGHT, as Risk's is. Leaving and the volume are both things you
          reach for between turns rather than during one, and a game screen with
          controls scattered along three edges makes you hunt for the one you
          want. One corner, one button, everything behind it.

          The sound settings move INTO it rather than sitting beside it: they
          are the same kind of thing, and SoundSettings already takes an inline
          for exactly this — a toolbar rather than its own floating corner. */}
      <div style={{ position: 'fixed', right: 12, top: 12, zIndex: 45 }}>
        <button type="button" onClick={() => setMenuOpen(o => !o)}
          aria-label="Menu" aria-expanded={menuOpen}
          style={{
            font: `12px ${SERIF}`, padding: '6px 13px', borderRadius: 5,
            cursor: 'pointer', background: menuOpen ? '#151d30' : '#0d1220ee',
            color: PALE, border: '1px solid #ffffff26',
          }}>
          ☰ Menu
        </button>

        {menuOpen && (
          <>
            {/* A CLICK ANYWHERE ELSE SHUTS IT. Without this the menu stays open
                behind whatever you go on to press, over a board you are trying
                to read. */}
            <div onClick={() => setMenuOpen(false)}
              style={{ position: 'fixed', inset: 0, zIndex: -1 }} />
            <div data-layer="dune-menu" role="menu" style={{
              position: 'absolute', right: 0, top: 'calc(100% + 6px)', minWidth: 210,
              background: '#151d30', border: '1px solid #ffffff22', borderRadius: 8,
              padding: 8, boxShadow: '0 10px 30px #00000066',
            }}>
              <div style={{
                padding: '4px 6px 8px', borderBottom: '1px solid #ffffff14', marginBottom: 6,
              }}>
                <SoundSettings inline />
              </div>
              {onExit && (
                <button type="button" role="menuitem"
                  onClick={() => { setMenuOpen(false); setLeaving(true) }}
                  aria-label="Leave this game"
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    font: `12.5px ${SERIF}`, padding: '7px 8px', borderRadius: 5,
                    cursor: 'pointer', background: 'transparent', color: PALE,
                    border: 'none',
                  }}>
                  ← Leave this game
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {leaving && onExit && (
        <div role="dialog" aria-modal="true" aria-label="Leave this game"
          onClick={e => { if (e.target === e.currentTarget) setLeaving(false) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 60, background: '#0d1220e8',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18,
          }}>
          <div style={{
            maxWidth: 420, background: '#151d30', color: PALE, borderRadius: 10,
            border: '1px solid #ffffff22', padding: '22px 24px', font: `14px ${SERIF}`,
          }}>
            <b style={{ font: `600 17px ${SERIF}`, display: 'block', marginBottom: 10 }}>
              Leave this game?
            </b>
            <p style={{ margin: '0 0 18px', opacity: 0.8, lineHeight: 1.55 }}>
              The game carries on without you and your seat stays yours — your
              spice, your cards and your forces are all where you left them. Come
              back to it from the Dune screen whenever you like.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => setLeaving(false)} style={{
                flex: 1, font: `600 13px ${SERIF}`, padding: '9px', borderRadius: 6,
                cursor: 'pointer', border: '1px solid #c9542a', background: '#c9542a', color: '#fff',
              }}>Keep playing</button>
              <button type="button" onClick={onExit} style={{
                flex: 1, font: `13px ${SERIF}`, padding: '9px', borderRadius: 6,
                cursor: 'pointer', border: '1px solid #ffffff33', background: 'transparent', color: PALE,
              }}>Leave</button>
            </div>
          </div>
        </div>
      )}

      {/* THE THINGS THE BOARD CANNOT SAY, in one corner and only when they
          apply. The right-hand column is the HUD, the left is the chat, so
          this takes the top right — over a list of other seats, which is the
          least costly thing to cover. */}
      {(setup || row?.spiceBlow || expired || spectating || notSeated || feed !== 'live') && (
        <div style={{
          // BELOW THE MENU, which took this corner and is drawn over it. A
          // setup prompt or a "you are watching" banner with a button sitting
          // on its first line is a notice you cannot finish reading.
          position: 'fixed', right: 12, top: 52, width: 250, maxHeight: '60vh',
          overflowY: 'auto', zIndex: 40,
          background: '#0d1220ee', color: PALE, border: '1px solid #ffffff22',
          borderRadius: 8, padding: 10, font: `12px ${SERIF}`,
        }}>
          {/* A BOARD THAT HAS STOPPED UPDATING LOOKS EXACTLY LIKE A BOARD WHERE
              NOBODY IS MOVING. Which one it is gets said out loud. */}
          {feed !== 'live' && (
            <p style={{ margin: '0 0 8px', padding: 7, borderRadius: 5, background: '#3a2c1a' }}>
              {feed === 'connecting' ? 'Connecting to the table…'
                : 'Not receiving updates. Still reading the table every few seconds.'}
            </p>
          )}

          {/* SETUP IS NOT A PHASE and the board has nothing to show for it, so
              a match still being dealt looks exactly like one where nobody is
              moving. It says which seats it is waiting on, which is public —
              six people round a table can see who is still placing.

              THE ANSWERING IS NOT HERE. This corner is a notice board; the
              controls are over the board, where the map they are decided from
              is — see SetupWindow. What this adds is the half the window cannot
              show a seat: who ELSE is still to answer, which is why nothing has
              started even after you are done. */}
          {setup && (
            <div style={{
              margin: '0 0 8px', padding: 8, borderRadius: 6, background: '#1d2a44',
              lineHeight: 1.5,
            }}>
              <b style={{ display: 'block', marginBottom: 4 }}>Setting up</b>
              {setupWants(row, seat?.faction ?? null) && (
                <span style={{ display: 'block', marginBottom: 4 }}>
                  Your answers are in the column beside the board.
                </span>
              )}
              Waiting on <b>{[...new Set(setup.outstanding.map(d => d.faction))].join(', ')}</b>.
              {' '}The clock answers for whoever says nothing.
            </div>
          )}

          {spectating && (
            <p style={{ margin: '0 0 8px', padding: 7, borderRadius: 5, background: '#1d2a44' }}>
              <b>Watching.</b> You hold no seat in this match, so there is no tray —
              everything on the board is public anyway.
            </p>
          )}

          {notSeated && !spectating && (
            <p style={{
              margin: '0 0 8px', padding: 8, borderRadius: 6,
              background: '#5a1d1d', color: '#ffe6e0',
            }}>
              <b>{seat?.faction}</b> holds a seat row but is not in the match state, so
              the tray is empty. The match seats {(row?.players ?? []).map(p => p.faction).join(', ') || 'nobody'}.
            </p>
          )}

          {/* SHOWN TO EVERY SEAT, and only the Fremen get controls. Six people
              round a table can all see who is being waited on; hiding it is how
              a play-by-network game ends up with everybody waiting on
              everybody. The seat decides the buttons, not the visibility. */}
          {row?.spiceBlow && (
            <WormPlacementPanel
              pause={row.spiceBlow}
              matchId={matchId}
              mine={seat?.faction === 'fremen'}
              say={say} />
          )}

          {/* PAST THE DEADLINE, ANYBODY MAY PUSH IT ALONG. The panel offers Bid
              and Pass only to the seat whose turn it is, so a player who has
              walked away leaves nobody able to press anything and the auction
              cannot end. The server's timeout path answers for whoever is to
              act regardless of who asked — but something has to ask, and on six
              separate machines this is the only thing that can. */}
          {expired && !spectating && (
            <>
              <b style={{ display: 'block', margin: '8px 0 6px' }}>The clock has run out</b>
              <button onClick={() => void bid({ kind: 'pass' })} disabled={busy}>
                End the wait
              </button>
              <p style={{ margin: '6px 0 0', opacity: 0.65 }}>
                Silence is a pass. This asks the server to apply it for whoever it is
                still waiting on.
              </p>
            </>
          )}
        </div>
      )}
    </>
  )
}

/**
 * What to draw before the row arrives.
 *
 * DELIBERATELY EMPTY, not a plausible-looking fixture. A screen that shows a
 * board with pieces on it before it has heard from the server is a screen that
 * cannot tell a slow connection from a working one — the harness learned this
 * with a fixture whose "21 LEFT" spice deck sat there through every real
 * update.
 */
const EMPTY: PublicRow = {
  storm: 'sector-1', turn: 0, phase: 'Storm', shieldWall: 'intact', mode: 'basic',
  spiceDeck: { remaining: 0, discardA: [], discardB: [] },
  players: [], forces: [], spiceOnBoard: {}, awaiting: null,
}

export default DuneMatchScreen
