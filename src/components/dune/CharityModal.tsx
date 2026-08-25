/**
 * CHOAM Charity, as a decision put in front of the seat that has to make it.
 *
 * OVER THE BOARD, and blocking it. Every other overlay here scrims the board
 * rather than covering it, because what is behind matters while you decide —
 * an auction is about a card you are bidding real spice on, with your forces
 * and everybody else's still worth looking at. Charity is not that. It is two
 * words and a number, it lasts fifteen seconds, and the board says nothing
 * about it. So this covers the board rather than dimming it, which is also the
 * only way it stops competing with the chat for a corner.
 *
 * WHAT IT DOES NOT SHOW: a clock. That is on the board, between the two
 * off-board boxes, where the whole table can see the same one — see PhaseTimer.
 * A second countdown here would be a second answer to how long is left, and
 * the two would disagree by a frame.
 *
 * WHAT IT KNOWS is this seat's own purse, and only its own. Eligibility is
 * worked out from the secrets row this client already holds, so the modal can
 * decline to offer a button whose one outcome is a refusal — without being told
 * anything about anybody else. The server still decides; this only avoids
 * asking a question with a known answer.
 */
import { isEligibleForCharity, charityGrant, CHARITY_TOPS_UP_TO } from '@/lib/dune/charity'
import type { DuneSecrets } from '@/lib/dune/charity'
import type { FactionId } from '@/types/Dune/Faction'

const PALE = '#f0e2bb'
const SERIF = "Georgia, 'Times New Roman', serif"

export interface CharityModalProps {
  /** This seat, whose decision it is. */
  faction: FactionId
  /** Its own secrets row — never anybody else's. */
  own: DuneSecrets | null
  /** Claim, or decline. Passing sends nothing; see the note on onPass. */
  onClaim(): void
  /**
   * Decline.
   *
   * THERE IS NO PASS ON THE SERVER and there should not be: a claim declined
   * and a claim never made are the same thing to the rules. This closes the
   * modal for this seat and says so locally — the phase ends on its own clock
   * either way.
   */
  onPass(): void
  /** A request is in flight; both buttons wait rather than queueing. */
  busy?: boolean
  /** The server's refusal code, if it refused. */
  refused?: string | null
}

const button = (primary: boolean) => ({
  font: `600 14px ${SERIF}`,
  padding: '9px 20px',
  borderRadius: 6,
  cursor: 'pointer',
  border: primary ? '1px solid #c9542a' : '1px solid #ffffff33',
  background: primary ? '#c9542a' : 'transparent',
  color: primary ? '#fff' : PALE,
})

export function CharityModal({ faction, own, onClaim, onPass, busy, refused }: CharityModalProps) {
  const eligible = isEligibleForCharity(own, faction)
  const grant = charityGrant(own, faction)

  return (
    <div
      data-layer="charity-modal"
      role="dialog"
      aria-modal="true"
      aria-label="CHOAM Charity"
      style={{
        // COVERING, not dimming — see the note above. Opaque enough that the
        // board behind is genuinely gone rather than distractingly half there.
        position: 'absolute', inset: 0, zIndex: 20,
        background: '#0d1220f2',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}>
      <div style={{
        maxWidth: 380, width: '100%', textAlign: 'center', color: PALE,
        border: '1px solid #ffffff22', borderRadius: 10, padding: '22px 20px',
        background: '#151d30',
      }}>
        <h2 style={{ font: `600 17px ${SERIF}`, margin: '0 0 6px', letterSpacing: 0.6 }}>
          CHOAM Charity
        </h2>

        {eligible ? (
          <>
            <p style={{ margin: '0 0 16px', opacity: 0.85, lineHeight: 1.5 }}>
              You may claim <b>{grant}</b> spice from the bank.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={onClaim} disabled={busy} style={button(true)}>
                Claim CHOAM
              </button>
              <button onClick={onPass} disabled={busy} style={button(false)}>
                Pass
              </button>
            </div>
          </>
        ) : (
          <>
            {/* NO CLAIM BUTTON AT ALL for a seat that cannot claim. Offering one
                whose only outcome is a refusal is not caution — and this client
                can answer the question about ITS OWN purse without being told
                anything about anybody else's. */}
            <p style={{ margin: '0 0 16px', opacity: 0.85, lineHeight: 1.5 }}>
              You hold more than {CHARITY_TOPS_UP_TO} spice, so there is nothing to claim.
            </p>
            <button onClick={onPass} disabled={busy} style={button(false)}>
              Close
            </button>
          </>
        )}

        <p style={{ margin: '14px 0 0', minHeight: '1.3em', fontSize: 12.5, opacity: 0.75 }}>
          {busy ? 'asking…'
            : refused === 'not-eligible' ? `the server refused: you hold more than ${CHARITY_TOPS_UP_TO}`
            : refused === 'already-claimed' ? 'you have already claimed this turn'
            : refused === 'window-closed' ? 'the window has closed'
            : refused ?? ''}
        </p>
      </div>
    </div>
  )
}

export default CharityModal
