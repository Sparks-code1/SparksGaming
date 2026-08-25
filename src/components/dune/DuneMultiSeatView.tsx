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
import CharityPanel from './CharityPanel'
import { WormPlacementPanel } from './WormPlacementPanel'
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
      {/* TOP LEFT, not bottom. This sat at left:12/bottom:12 with zIndex 40,
          directly over DevSeatSwitcher at left:10/bottom:10 — covering its first
          two seat buttons, so the seats it exists to let you act as could not be
          clicked. The switcher owns the bottom-left corner; this takes the top.

          Width capped to the chat column's, so it stays over that column rather
          than reaching across the board in the middle. */}
      <div style={{
        position: 'fixed', left: 12, top: 12, width: 320, maxHeight: '60vh',
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

        {mine?.client
          ? <CharityPanel
              say={say}
              matchId={matchId}
              client={mine.client}
              charity={publicRow?.charity ?? null}
              // ITS OWN ROW, from its own session — the same secrets the tray
              // reads. It lets the panel answer "may I claim" without being
              // told anything about anybody else's purse.
              own={(mine.secrets ?? null) as DuneSecrets | null}
              faction={mine.login.faction} />
          : <p style={{ margin: 0, opacity: 0.7 }}>
              {mine ? `${mine.login.faction} is still signing in…` : 'pick a seat to act as'}
            </p>}
        {/* The running log moved to the chat panel, where a private line can be
            marked as one. Nothing is duplicated here. */}
      </div>
    </>
  )
}
