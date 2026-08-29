/**
 * The seat switcher: which of the signed-in seats this screen is showing.
 *
 * It switches SESSIONS, not seats. Each row here is a separate authenticated
 * client holding its own secrets row — see src/dev/multiSeat — so picking one
 * changes whose credentials the screen is reading and acting with. There is no
 * mode in which one session sees two seats.
 *
 * It shows each seat's channel status because that is the thing that goes wrong:
 * a seat whose account does not exist, or whose password is stale, looks exactly
 * like a seat with no secrets yet until you can see it said "failed".
 */
import type { FactionId } from '@/types/Dune/Faction'
import type { SeatSession } from '@/dev/multiSeat'
import { FACTION_LOOK, SeatMark, SeatFilters } from './SeatLayer'

const PALE = '#f0e2bb'
const SERIF = "Georgia, 'Times New Roman', serif"

const STATUS_COLOUR: Record<string, string> = {
  subscribed: '#2f8f4e',
  'signing-in': '#c8940a',
  closed: '#8a8a8a',
  error: '#b3202a',
  failed: '#b3202a',
}

export interface DevSeatSwitcherProps {
  sessions: readonly SeatSession[]
  active: FactionId | null
  onPick(faction: FactionId): void
}

export function DevSeatSwitcher({ sessions, active, onPick }: DevSeatSwitcherProps) {
  return (
    <div data-layer="dev-seat-switcher" style={{
      // RAISED OFF THE CHAT INPUT. The chat is real now and its box lives
      // at the bottom of the left column — pinned at 10 the switcher sat
      // exactly on it, and typing meant moving the switcher's own seat
      // pills out of the way first.
      position: 'fixed', left: 10, bottom: 62, zIndex: 6,
      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      background: '#1b2337ee', color: PALE, border: '1px solid #f0e2bb44',
      borderRadius: 6, padding: '6px 8px', font: `12px ${SERIF}`,
      maxWidth: '46vw',
    }}>
      <span style={{ opacity: 0.6, letterSpacing: 1, fontSize: 10 }}>ACTING AS</span>
      {sessions.length === 0 && (
        <span style={{ opacity: 0.7 }}>
          no seats — set VITE_DEV_SEATS
        </span>
      )}
      {sessions.map(s => {
        const look = FACTION_LOOK[s.login.faction]
        const on = s.login.faction === active
        return (
          <button key={s.login.seat} type="button"
            onClick={() => onPick(s.login.faction)}
            data-seat={s.login.seat} data-active={on || undefined}
            title={s.error ? `${s.status}: ${s.error}` : s.status}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
              background: on ? `${look.colour}44` : 'transparent', color: PALE,
              border: `1px solid ${on ? look.colour : '#ffffff33'}`,
              borderRadius: 999, padding: '2px 8px 2px 3px', font: `12px ${SERIF}`,
            }}>
            <svg width={20} height={20} viewBox="-10 -10 20 20" style={{ display: 'block' }}>
              <SeatFilters />
              <SeatMark faction={s.login.faction} x={0} y={0} r={9} />
            </svg>
            {look.name}
            {/* The channel, in one dot. A seat that never signed in is the
                commonest fault here and is otherwise indistinguishable from a
                seat that simply holds nothing yet. */}
            <span aria-label={s.status} style={{
              width: 7, height: 7, borderRadius: '50%',
              background: STATUS_COLOUR[s.status] ?? '#8a8a8a',
            }} />
          </button>
        )
      })}
    </div>
  )
}

export default DevSeatSwitcher
