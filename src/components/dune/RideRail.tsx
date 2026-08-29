/**
 * The ride rail: Shai-Hulud waits, and the Fremen may board.
 *
 * THE BLOW PHASE'S RAIL, for the one seat with business in it. The sentence
 * is the ruling's own wording; the bubble counts the riders as stacks are
 * clicked on the board, and the destination click is the ride — anywhere on
 * the board, storm and the stronghold gate standing, no distance at all.
 */
import { ForceBubble } from './ShipRail'
import type { FactionId } from '@/types/Dune/Faction'

const PALE = '#f0e2bb'
const SERIF = 'Georgia, "Times New Roman", serif'

export function RideRail({ faction, gathered, onReset }: {
  faction: FactionId
  gathered: number
  onReset: () => void
}) {
  return (
    <div data-layer="ride-rail" style={{
      flex: '0 0 auto', width: 118, padding: '10px 8px', overflowY: 'auto',
      borderRight: '1px solid #ffffff1f', background: '#111a2c',
      font: `11px ${SERIF}`, color: PALE, textAlign: 'center',
    }}>
      <span style={{ display: 'block', opacity: 0.7 }}>Shai-Hulud</span>
      <ForceBubble faction={faction} count={gathered} starred={false}
        bubble="riders" label="Put the riders back"
        disabled={gathered === 0}
        onClick={onReset} />
      {gathered > 0 && (
        <>
          <span style={{ display: 'block', marginTop: 6, opacity: 0.85 }}>
            Click the board to land {gathered}
          </span>
          <button type="button" onClick={onReset} aria-label="Put the riders back"
            style={{ marginTop: 4 }}>
            ↺ back
          </button>
        </>
      )}
      <span style={{ display: 'block', marginTop: 8, opacity: 0.7, lineHeight: 1.4 }}>
        Click on units to ride the sandworm to move some or all of the forces
        in the territory to any other territory.
      </span>
    </div>
  )
}
