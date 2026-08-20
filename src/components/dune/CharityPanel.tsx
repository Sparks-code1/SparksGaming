/**
 * CHOAM Charity, in the development view.
 *
 * The endpoint this mirrors is supabase/functions/dune-action. There is no auth
 * or match here, so nothing is POSTed: this holds the seats' secrets locally and
 * calls the SAME pure functions the server calls, so the rules being exercised
 * are the real ones even though the trust boundary is simulated.
 *
 * What it does reproduce faithfully is the part most likely to be got wrong
 * elsewhere: the deadline is stamped ONCE when the window opens, and everything
 * afterwards counts toward that timestamp. Nothing here measures a duration.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  openCharityWindow, charityWindowIsOpen, refuseCharityClaim, applyCharityClaim,
  readSpice, CHARITY_TOPS_UP_TO, CHARITY_WINDOW_MS,
} from '@/lib/dune/charity'
import type { CharityWindow, DuneSecrets } from '@/lib/dune/charity'

const SEATS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']
const panel = { border: '1px solid #ffffff22', borderRadius: 6, padding: 10, marginBottom: 10 }

/** Spice each seat starts with — some poor enough to claim, some not. */
const startingSpice = (): Record<string, DuneSecrets> =>
  Object.fromEntries(SEATS.map((id, i) => [id, { spice: [0, 1, 2, 3, 7, 12][i] }]))

export default function CharityPanel({ say }: { say: (line: string) => void }) {
  const [secrets, setSecrets] = useState<Record<string, DuneSecrets>>(startingSpice)
  const [window_, setWindow] = useState<CharityWindow | null>(null)
  const [seat, setSeat] = useState('p1')
  const [now, setNow] = useState(() => Date.now())

  // A ticker, not a timer. It re-reads the clock so the countdown can be
  // rendered; the deadline it counts toward was fixed when the window opened.
  // A setTimeout for the remaining duration would drift the moment the tab was
  // backgrounded, and each client would drift differently.
  useEffect(() => {
    if (!window_) return
    const t = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(t)
  }, [window_])

  const open = charityWindowIsOpen(window_, now)
  const remaining = window_ ? Math.max(0, window_.expiresAt - now) : 0

  // The phase ends on the clock, not on a click.
  useEffect(() => {
    if (window_ && !open) {
      say(`Charity closed — claimed by ${window_.claims.length ? window_.claims.join(', ') : 'nobody'}.`)
      setWindow(null)
    }
  }, [open, window_, say])

  const refusal = useMemo(
    () => (window_ ? refuseCharityClaim(window_, secrets[seat], seat, now) : 'no-window'),
    [window_, secrets, seat, now],
  )

  function claim() {
    if (!window_ || refusal) return
    const out = applyCharityClaim(window_, secrets[seat], seat)
    setWindow(out.window)
    setSecrets(s => ({ ...s, [seat]: out.secrets }))
    say(`${seat} claimed charity (+${out.granted}).`)
  }

  return (
    <fieldset style={panel}>
      <legend>CHOAM Charity</legend>

      <div style={{ marginBottom: 8 }}>
        <label>
          viewing as{' '}
          <select value={seat} onChange={e => setSeat(e.target.value)}>
            {SEATS.map(id => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>{' '}
        {/* Only the seat being viewed shows a number. Every other seat's spice is
            deliberately absent rather than hidden behind a style, because that is
            what the real thing does. */}
        <span style={{ opacity: 0.85 }}>holds <b>{readSpice(secrets[seat])}</b> spice</span>
      </div>

      {/* Turn 1: this panel exercises one turn, and the window is tagged with the
          turn so the endpoint can refuse a second opening within it. */}
      {!window_ && (
        <button onClick={() => { setNow(Date.now()); setWindow(openCharityWindow(Date.now(), 1)) }}>
          Open charity window ({CHARITY_WINDOW_MS / 1000}s)
        </button>
      )}

      {window_ && (
        <>
          <div style={{ marginBottom: 6 }}>
            closes in <b>{(remaining / 1000).toFixed(1)}s</b>
            <div style={{ height: 4, background: '#ffffff22', borderRadius: 2, marginTop: 4 }}>
              <div style={{
                height: 4, borderRadius: 2, background: '#c9542a',
                width: `${(remaining / CHARITY_WINDOW_MS) * 100}%`,
              }} />
            </div>
          </div>
          <button onClick={claim} disabled={!!refusal}>Claim charity as {seat}</button>{' '}
          <span style={{ opacity: 0.7 }}>
            {refusal === 'not-eligible' ? `holds more than ${CHARITY_TOPS_UP_TO}`
              : refusal === 'already-claimed' ? 'already claimed'
              : refusal === 'window-closed' ? 'window closed'
              : refusal ? refusal
              : 'eligible'}
          </span>
        </>
      )}

      {/* Public by rule: everyone sees who claimed, and nobody sees an amount. */}
      <p style={{ margin: '8px 0 0', opacity: 0.75 }}>
        claimed: {window_?.claims.length ? window_.claims.join(', ') : '—'}
      </p>
    </fieldset>
  )
}
