/**
 * CHOAM Charity — against the real endpoint when there is one, simulated when
 * there is not.
 *
 * TWO MODES, and the difference is the trust boundary rather than the rules.
 *
 *   LIVE      — given a matchId, every button POSTs to dune-action through
 *               `client`, which is the acting seat's session. The server holds
 *               the window, reads the spice with the service role, and decides
 *               eligibility. That decision cannot be made anywhere else: a
 *               client cannot be told whether a seat qualifies without being
 *               told something about their purse.
 *   SIMULATED — no match, so nothing is POSTed. It holds the seats' secrets
 *               locally and calls the SAME functions the server calls, so the
 *               rules exercised are the real ones even though the boundary is
 *               pretend. This is what the dev board has always shown.
 *
 * The seat is NEVER sent. In live mode it comes from the session's own token,
 * which is why acting as a different seat means handing this a different
 * client rather than picking a name from the dropdown — see lib/dune/
 * duneDispatch. The dropdown stays in simulated mode, where there is no session
 * to speak for anybody and it is the only way to choose.
 *
 * What both modes reproduce faithfully is the part most likely to be got wrong
 * elsewhere: the deadline is stamped ONCE when the window opens, and everything
 * afterwards counts toward that timestamp. Nothing here measures a duration.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  openCharityWindow, charityWindowIsOpen, refuseCharityClaim, applyCharityClaim,
  readSpice, CHARITY_TOPS_UP_TO, CHARITY_WINDOW_MS,
} from '@/lib/dune/charity'
import type { CharityWindow, DuneSecrets } from '@/lib/dune/charity'
import { dispatchDuneAction } from '@/lib/dune/duneDispatch'
import { isEligibleForCharity, charityGrant } from '@/lib/dune/charity'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FactionId } from '@/types/Dune/Faction'

const SEATS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']
const panel = { border: '1px solid #ffffff22', borderRadius: 6, padding: 10, marginBottom: 10 }

/** Spice each seat starts with — some poor enough to claim, some not. */
const startingSpice = (): Record<string, DuneSecrets> =>
  Object.fromEntries(SEATS.map((id, i) => [id, { spice: [0, 1, 2, 3, 7, 12][i] }]))

export interface CharityPanelProps {
  say: (line: string) => void
  /** Present ⇒ live. Absent ⇒ the local simulation the dev board shows. */
  matchId?: string | null
  /**
   * Whose session acts. Defaults to the app's own inside dispatchDuneAction.
   *
   * The multi-seat harness passes the selected seat's client, which is the
   * whole mechanism by which it can DRIVE a turn rather than only watch one.
   */
  client?: SupabaseClient
  /**
   * The window as the server published it, from public state.
   *
   * Live mode does not keep its own copy. The window is public — who has
   * claimed is on the table for everyone — so the one in matches.state is the
   * only one, and a local mirror of it would be a second answer to whether the
   * phase is still open.
   */
  charity?: CharityWindow | null
  /**
   * This seat's own secrets, and who it is.
   *
   * FOR ITS OWN ELIGIBILITY, and only its own. A seat's spice is in its own
   * match_secrets row, so this client can answer "may I claim" without being
   * told anything about anybody else — which is the distinction that makes
   * showing it here safe. The server still decides; this only stops the panel
   * offering a button whose one outcome is a refusal.
   */
  own?: DuneSecrets | null
  faction?: FactionId | null
}

export default function CharityPanel({ say, matchId, client, charity, own, faction }: CharityPanelProps) {
  const live = !!matchId
  const [secrets, setSecrets] = useState<Record<string, DuneSecrets>>(startingSpice)
  const [localWindow, setWindow] = useState<CharityWindow | null>(null)
  const [seat, setSeat] = useState('p1')
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)
  // Local, and deliberately not sent anywhere — see pass().
  const [passed, setPassed] = useState(false)

  // In live mode the window comes down the changefeed; in simulated mode it is
  // held here. One name downstream, so nothing below has to know which.
  const window_ = live ? (charity ?? null) : localWindow

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
  //
  // LIVE MODE DOES NOT CLEAR IT. The window lives in public state and only
  // CLOSE_CHARITY removes it; a client that dropped its own copy at the
  // deadline would show the phase over while the row still said otherwise, and
  // every seat would do it at a slightly different moment.
  useEffect(() => {
    if (window_ && !open && !live) {
      say(`Charity closed — claimed by ${window_.claims.length ? window_.claims.join(', ') : 'nobody'}.`)
      setWindow(null)
    }
  }, [open, window_, say, live])

  const refusal = useMemo(
    () => (window_ ? refuseCharityClaim(window_, secrets[seat], seat, now, undefined) : 'no-window'),
    [window_, secrets, seat, now],
  )

  /**
   * Whether THIS seat may claim, worked out from its own row.
   *
   * The earlier version deliberately refused to judge this, on the grounds that
   * eligibility depends on a purse the client cannot read. That is true of
   * every OTHER seat and false of this one: its spice arrives on its own
   * secrets channel. Offering a Claim whose only possible outcome is
   * 'not-eligible' is not caution, it is a button that lies.
   *
   * The Bene Gesserit are eligible whatever they hold, which is why this asks
   * the shared rule rather than comparing a number — the same function the
   * server pays out from.
   */
  const canClaim = live ? isEligibleForCharity(own ?? null, faction ?? null) : !refusal
  const wouldGet = live ? charityGrant(own ?? null, faction ?? null) : 0

  /**
   * One live action, with the refusal shown rather than thrown.
   *
   * A refusal is an outcome here — "already claimed", "not eligible", "the
   * window has closed" are all things the server is supposed to say — so they
   * are surfaced beside the button instead of ending up in a console nobody has
   * open. The state is NOT advanced on any of them: the row is the truth, and
   * it arrives on the changefeed.
   */
  async function send(type: string, note: (data: Record<string, unknown>) => string) {
    if (!matchId || busy) return
    setBusy(true)
    setRefused(null)
    const res = await dispatchDuneAction(matchId, { type }, { client })
    setBusy(false)
    if (!res.ok) {
      setRefused(res.error?.code ?? 'refused')
      say(`${type} refused: ${res.error?.message ?? 'unknown'}`)
      return
    }
    say(note(res.data ?? {}))
  }

  function openWindow() {
    if (live) {
      // The DEADLINE is not sent. The server stamps it, so the phase ends at
      // one moment rather than at six slightly different ones.
      void send('OPEN_CHARITY', () => 'Charity window opened.')
      return
    }
    setNow(Date.now())
    setWindow(openCharityWindow(Date.now(), 1))
  }

  function claim() {
    if (live) {
      // `granted` comes back to the CLAIMANT alone, as the response to their own
      // request. It is deliberately not in public state, where the table would
      // read it — so it is said here and nowhere else.
      void send('CLAIM_CHARITY', data => `Claimed charity (+${data.granted ?? 0}).`)
      return
    }
    if (!window_ || refusal) return
    const out = applyCharityClaim(window_, secrets[seat], seat)
    setWindow(out.window)
    setSecrets(s => ({ ...s, [seat]: out.secrets }))
    say(`${seat} claimed charity (+${out.granted}).`)
  }

  function close() {
    void send('CLOSE_CHARITY', data =>
      `Charity closed — claimed by ${(data.claims as string[])?.length ? (data.claims as string[]).join(', ') : 'nobody'}.`)
  }

  /**
   * Passing is a decision, and it is said out loud.
   *
   * There is no PASS on the server and there should not be: a claim that never
   * arrives and a claim declined are the same thing to the rules, and inventing
   * an action for it would put a row in the log for a player doing nothing.
   * What a Pass button buys is that the seat can stop looking at the phase —
   * without one, "eligible" sits there until the window shuts and the only way
   * to be finished with it is to take spice you may not want.
   */
  function pass() {
    setPassed(true)
    say(`${live ? 'this seat' : seat} passed on charity.`)
  }

  return (
    <fieldset style={panel}>
      <legend>CHOAM Charity</legend>

      <div style={{ marginBottom: 8 }}>
        {live ? (
          // NO SEAT PICKER. Live, the acting seat is whoever this client is
          // signed in as — offering a dropdown would imply a choice that does
          // not exist, and the one honest way to change it is a different
          // session. The harness switches sessions; this just reports.
          <span style={{ opacity: 0.85 }}>acting as this session's seat</span>
        ) : (
          <>
            <label>
              viewing as{' '}
              <select value={seat} onChange={e => setSeat(e.target.value)}>
                {SEATS.map(id => <option key={id} value={id}>{id}</option>)}
              </select>
            </label>{' '}
        {/* Only the seat being viewed shows a number. Every other seat's spice is
            deliberately absent rather than hidden behind a style, because that is
            what the real thing does. */}
            {/* Only the seat being viewed shows a number, and only because
                these secrets are local. Live, this seat's spice is in its own
                match_secrets row and no panel is told anyone else's. */}
            <span style={{ opacity: 0.85 }}>holds <b>{readSpice(secrets[seat])}</b> spice</span>
          </>
        )}
      </div>

      {/* Turn 1: this panel exercises one turn, and the window is tagged with the
          turn so the endpoint can refuse a second opening within it. */}
      {!window_ && (
        <button onClick={openWindow} disabled={busy}>
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
          {/* CLAIM OR PASS, and only for a seat that may actually claim.
              This offered Claim to everyone, on the argument that eligibility
              depends on a purse the client cannot read. True of every OTHER
              seat; false of this one, whose spice arrives on its own secrets
              channel. A button whose only possible outcome is 'not-eligible'
              is not caution.

              Passing sends nothing — see pass(). A claim declined and a claim
              never made are the same thing to the rules. */}
          {passed ? (
            <span style={{ opacity: 0.7 }}>passed</span>
          ) : canClaim ? (
            <>
              <button onClick={claim} disabled={busy}>
                {live ? `Claim charity (+${wouldGet})` : `Claim charity as ${seat}`}
              </button>{' '}
              <button onClick={pass} disabled={busy}>Pass</button>{' '}
            </>
          ) : (
            <span style={{ opacity: 0.7 }}>
              {/* WHY they cannot, rather than a dead button. The Bene Gesserit
                  never land here: they are eligible whatever they hold. */}
              not eligible — holds more than {CHARITY_TOPS_UP_TO}
            </span>
          )}
          {live && !open && (
            <button onClick={close} disabled={busy}>Close window</button>
          )}{' '}
          <span style={{ opacity: 0.7 }}>
            {live
              ? (refused === 'not-eligible' ? `the server refused: holds more than ${CHARITY_TOPS_UP_TO}`
                : refused === 'already-claimed' ? 'already claimed'
                : refused === 'window-closed' ? 'window closed'
                : refused ?? (busy ? 'asking…' : ''))
              : (refusal === 'not-eligible' ? `holds more than ${CHARITY_TOPS_UP_TO}`
                : refusal === 'already-claimed' ? 'already claimed'
                : refusal === 'window-closed' ? 'window closed'
                : refusal ? refusal
                : 'eligible')}
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
