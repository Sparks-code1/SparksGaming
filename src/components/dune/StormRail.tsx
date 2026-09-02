/**
 * What the Fremen know that nobody else does: next turn's storm.
 *
 * Their sheet, advanced side: "The first storm in the game is normal. All
 * subsequent storms can move either 1-6 sectors and you get to know the number
 * of sectors before the storm moves on the previous turn." So this is next
 * turn's distance, learned at the end of this one — not this turn's before it
 * moves, which is published to the whole table between the roll and the move so
 * that Family Atomics has its beat, and would be no advantage at all.
 *
 * THE RAIL AND NOWHERE ELSE. It is one seat's knowledge and the whole of its
 * value is that the other five do not have it, so it does not go on the board,
 * into the notices, or anywhere a screen might be turned around. The rail is
 * where a seat looks at its own things.
 *
 * IT SITS OUT THE WHOLE TURN because that is exactly how long the knowledge is
 * good for: told at the end of one storm, spent when the next one blows. The
 * server writes it into this seat's own secrets row and no other.
 */
import { FACTION_LOOK } from './SeatLayer'

const PALE = '#f0e2bb'
const SERIF = 'Georgia, "Times New Roman", serif'

export function StormRail({ turn, sectors }: {
  /** The turn whose storm this is — the one after the current. */
  turn: number
  sectors: number
}) {
  return (
    <div data-layer="storm-rail" style={{
      flex: '0 0 auto', width: 96, padding: '10px 8px',
      borderRight: '1px solid #ffffff1f', background: '#111a2c',
      font: `11px ${SERIF}`, color: PALE, textAlign: 'center',
    }}>
      <span style={{ display: 'block', opacity: 0.7 }}>Turn {turn}</span>
      <span style={{ display: 'block', marginTop: 1, opacity: 0.7 }}>storm</span>
      <span data-storm-ahead={sectors} style={{
        display: 'block', margin: '8px auto 0', width: 46, height: 46,
        borderRadius: '50%', lineHeight: '46px', fontSize: 19,
        background: FACTION_LOOK['fremen'].colour,
        border: `2px solid ${PALE}`,
      }}>{sectors}</span>
      <span style={{ display: 'block', marginTop: 4 }}>
        {sectors === 1 ? 'sector' : 'sectors'}
      </span>
      <p style={{ margin: '10px 0 0', opacity: 0.6, lineHeight: 1.4 }}>
        Yours alone until it blows.
      </p>
    </div>
  )
}

export default StormRail
