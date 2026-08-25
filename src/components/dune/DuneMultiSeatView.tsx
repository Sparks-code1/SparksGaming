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
import { useEffect, useMemo, useState } from 'react'
import type { FactionId } from '@/types/Dune/Faction'
import type { DuneGameState } from '@/types/Dune/Game'
import type { DuneSecrets } from '@/lib/dune/charity'
import { startMultiSeat, seatLoginsFromEnv } from '@/dev/multiSeat'
import type { SeatSession } from '@/dev/multiSeat'
import { DuneGameScreen } from './DuneGameScreen'
import { DevSeatSwitcher } from './DevSeatSwitcher'
import { WormPlacementPanel } from './WormPlacementPanel'
import { dispatchDuneAction } from '@/lib/dune/duneDispatch'
import type { SpiceBlowPause } from './WormPlacementPanel'
import type { CharityWindow } from '@/lib/dune/charity'
import type { ChatMessage } from './ChatPanel'

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

/** The public row carries fields the screen's type does not name — the charity
 *  window among them, which is public because who has claimed is on the table. */
type PublicRow = DuneGameState & { charity?: CharityWindow; spiceBlow?: SpiceBlowPause }

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

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!matchId || logins.length === 0) return
    return startMultiSeat(matchId, logins, setSessions)
  }, [matchId, logins])

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
  useEffect(() => {
    if (!matchId || !readyClient) return
    let live = true
    const take = (row: unknown) => {
      const state = (row as { state?: PublicRow } | null)?.state
      if (live && state) setPublicRow(state)
    }
    void readyClient.from('matches').select('state').eq('id', matchId).maybeSingle()
      .then(({ data }) => take(data))
    const channel = readyClient
      .channel(`dune-harness:${matchId}:${Math.random().toString(36).slice(2, 10)}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
        payload => take(payload.new))
      .subscribe()
    return () => { live = false; void readyClient.removeChannel(channel) }
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
    const window_ = publicRow?.charity
    if (!window_ || !session?.client) return null
    if (answered[session.login.faction] === window_.turn) return null
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

  /** One action, as this seat, with the refusal shown rather than thrown. */
  const send = async (session: SeatSession, type: string) => {
    if (busy) return
    setBusy(true)
    setRefused(null)
    const res = await dispatchDuneAction(matchId, { type }, { client: session.client })
    setBusy(false)
    if (!res.ok) {
      setRefused(res.error?.code ?? 'refused')
      say(`${type} refused: ${res.error?.message ?? 'unknown'}`)
      return
    }
    // Answered, so the modal comes down. The board comes back on the
    // changefeed; nothing is advanced here.
    const turn = publicRow?.charity?.turn
    if (turn != null) setAnswered(a => ({ ...a, [session.login.faction]: turn }))
    say(`claimed charity (+${(res.data as { granted?: number })?.granted ?? 0}).`)
  }

  const say = (line: string) => {
    const to = mine?.login.faction
    setChat(c => [...c.slice(-40), {
      id: `${Date.now()}-${c.length}`, faction: null, from: 'Game',
      text: line, at: Date.now(), ...(to ? { to } : null),
    }])
  }

  return (
    <>
      <DuneGameScreen
        charity={charityFor(mine)}
        state={publicRow ?? PUBLIC_FIXTURE}
        seat={active}
        // ONE SEAT'S ROW, from that seat's own session. The screen has no way to
        // reach the others: they are behind different clients entirely.
        own={(mine?.secrets ?? null) as DuneSecrets | null}
        chat={chat}
        now={now} />
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

        {/* OPENING AND CLOSING ARE NOT PLAYER MOVES. Claiming and passing now
            live in the modal over the board, where the decision belongs. What
            is left here is the phase driving a real game would do for itself —
            a host, or a clock — and which nothing does yet.

            The running log moved to the chat, where a private line can be
            marked as one. */}
        {mine?.client ? (
          <>
            <b style={{ display: 'block', marginBottom: 6 }}>CHOAM Charity</b>
            <button onClick={() => void send(mine, 'OPEN_CHARITY')} disabled={busy}>
              Open window
            </button>{' '}
            <button onClick={() => void send(mine, 'CLOSE_CHARITY')} disabled={busy}>
              Close window
            </button>
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
