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
import type { ChatMessage } from './ChatPanel'

const PALE = '#f0e2bb'
const SERIF = "Georgia, 'Times New Roman', serif"

/**
 * The public state, until the shared row is wired here too.
 *
 * The harness's job is the SECRETS side — several sessions, each seeing only
 * its own. The public row is one record everybody gets identically, so it is
 * not what needed proving and is left as a fixture rather than half-subscribed.
 */
const PUBLIC_FIXTURE: DuneGameState = {
  storm: 'sector-4', turn: 1, phase: 'Bidding', shieldWall: 'intact', mode: 'advanced',
  spiceDeck: { remaining: 21, discardA: [], discardB: [] },
  players: [], forces: [], spiceOnBoard: {}, awaiting: null,
}

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

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!matchId || logins.length === 0) return
    return startMultiSeat(matchId, logins, setSessions)
  }, [matchId, logins])

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

  return (
    <>
      <DuneGameScreen
        state={PUBLIC_FIXTURE}
        seat={active}
        // ONE SEAT'S ROW, from that seat's own session. The screen has no way to
        // reach the others: they are behind different clients entirely.
        own={(mine?.secrets ?? null) as DuneSecrets | null}
        chat={[] as ChatMessage[]}
        now={now} />
      <DevSeatSwitcher sessions={sessions} active={active} onPick={setActive} />
    </>
  )
}
