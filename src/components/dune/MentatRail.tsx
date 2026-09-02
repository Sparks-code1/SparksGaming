/**
 * The Mentat Pause, in the rail.
 *
 * IT WAS A BAR ACROSS THE FOOT OF THE BOARD, which is where a notice goes and
 * not where a control goes. Everything else this table presses lives in the
 * strip between the chat and the board — the reserves you ship, the forces you
 * revive, the riders you put on a worm — and the pause's Ready is a control
 * like any of them. One place to look.
 *
 * A BUBBLE, not a button, for the same reason: the rail's grammar is a round
 * thing you press with a count beside it, and a plain rectangle in that column
 * reads as something that arrived from somewhere else.
 */
import { ForceBubble } from './ShipRail'
import type { FactionId } from '@/types/Dune/Faction'

const PALE = '#f0e2bb'
const SERIF = 'Georgia, "Times New Roman", serif'

export function MentatRail({ faction, ready, seated, iAmReady, onReady }: {
  faction: FactionId
  /** How many seats have readied. */
  ready: number
  seated: number
  iAmReady: boolean
  onReady: () => void
}) {
  return (
    <div data-layer="mentat-rail" style={{
      flex: '0 0 auto', width: 118, padding: '10px 8px', overflowY: 'auto',
      borderRight: '1px solid #ffffff1f', background: '#111a2c',
      font: `11px ${SERIF}`, color: PALE, textAlign: 'center',
    }}>
      <span style={{ display: 'block', opacity: 0.7 }}>Mentat Pause</span>
      <ForceBubble faction={faction} count={ready} starred={false}
        bubble="mentat-ready"
        label={iAmReady ? 'You are ready' : 'Ready for the next turn'}
        disabled={iAmReady}
        onClick={onReady} />
      <span data-mentat-count="" style={{ display: 'block', marginTop: 6, opacity: 0.85 }}>
        {ready} of {seated} ready
      </span>
      {iAmReady ? (
        <span data-mentat-waiting="" style={{ display: 'block', marginTop: 4, opacity: 0.6 }}>
          waiting on the table
        </span>
      ) : (
        <span style={{ display: 'block', marginTop: 4, opacity: 0.6 }}>
          No winner — take a moment, then ready.
        </span>
      )}
    </div>
  )
}

export default MentatRail
