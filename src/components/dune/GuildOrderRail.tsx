/**
 * The Guild's ten seconds, in the rail.
 *
 * Their sheet lets them take their shipment and move out of turn — first, last,
 * or anywhere between — so before the rotation starts they are asked where they
 * want to stand in it. One bubble per slot, in the rail's own grammar, and the
 * seats they would sit between named under each so the choice reads as a
 * position at the table rather than an index.
 *
 * SILENCE IS THE STORM ORDER. The clock counts down in plain sight and the card
 * grants a choice rather than a duty, so a Guild that says nothing simply keeps
 * the slot the storm gave them — which is what the sentence at the foot says,
 * before it happens rather than after.
 *
 * EVERY OTHER SEAT SEES THE WAIT, not the choice: the rotation is public and a
 * table that did not know why nothing was happening would think it had hung.
 */
import { ForceBubble } from './ShipRail'
import { FACTION_LOOK } from './SeatLayer'
import type { FactionId } from '@/types/Dune/Faction'

const PALE = '#f0e2bb'
const SERIF = 'Georgia, "Times New Roman", serif'

export function GuildOrderRail({
  seat, order, secondsLeft, busy = false, onChoose,
}: {
  seat: FactionId
  /** The rotation as the storm left it, Guild included. */
  order: readonly FactionId[]
  secondsLeft: number
  busy?: boolean
  onChoose(at: number): void
}) {
  const mine = seat === 'spacing-guild'
  const others = order.filter(f => f !== 'spacing-guild')
  const nameOf = (f: FactionId) => FACTION_LOOK[f]?.name ?? f

  return (
    <div data-layer="guild-order-rail" style={{
      flex: '0 0 auto', width: 132, padding: '10px 8px', overflowY: 'auto',
      borderRight: '1px solid #ffffff1f', background: '#111a2c',
      font: `11px ${SERIF}`, color: PALE, textAlign: 'center',
    }}>
      <span style={{ display: 'block', opacity: 0.7 }}>
        {mine ? 'When do you go?' : 'The Guild is choosing'}
      </span>
      <span data-guild-clock="" style={{
        display: 'block', marginTop: 2, fontSize: 15, color: '#e8b04b',
      }}>{secondsLeft}s</span>

      {mine ? (
        <>
          {/* SLOT BY SLOT, named by who you would go before. */}
          {others.map((f, i) => (
            <div key={`before-${f}`} style={{ marginTop: 8 }}>
              <ForceBubble faction={seat} count={i + 1} starred={false}
                bubble={`slot-${i}`} disabled={busy}
                label={`Go before ${nameOf(f)}`}
                onClick={() => onChoose(i)} />
              <span data-guild-slot={i} style={{ display: 'block', marginTop: 3 }}>
                before {nameOf(f)}
              </span>
            </div>
          ))}
          <div style={{ marginTop: 8 }}>
            <ForceBubble faction={seat} count={others.length + 1} starred={false}
              bubble={`slot-${others.length}`} disabled={busy}
              label="Go last"
              onClick={() => onChoose(others.length)} />
            <span data-guild-slot={others.length} style={{ display: 'block', marginTop: 3 }}>
              last
            </span>
          </div>
          <p style={{ margin: '10px 0 0', opacity: 0.6, lineHeight: 1.4 }}>
            Say nothing and you keep the slot the storm gave you.
          </p>
        </>
      ) : (
        <p style={{ margin: '10px 0 0', opacity: 0.6, lineHeight: 1.4 }}>
          They may go first, last, or between. Then the rotation starts.
        </p>
      )}
    </div>
  )
}

export default GuildOrderRail
