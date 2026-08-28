/**
 * The rail: reserves, spice, and the bubbles that ship them.
 *
 * A REDUNDANT COUNTER ON PURPOSE, between the chat and the board: the HUD on
 * the right knows these numbers too, but the rail is where shipping HAPPENS,
 * so the numbers being spent sit beside the thing spending them. Click the
 * faction bubble to stage a force from reserves; click again for a second —
 * the glyph gives way to the count — and the reserve figure falls as you
 * stage. Then click the board where they should land; the landing is the
 * shipment, and the server prices it.
 *
 * TWO BUBBLES for the Emperor and the Fremen: the plain force, and the elite
 * (Sardaukar, Fedaykin) as the faction's glyph inside a star. Elites stage
 * from their own reserve.
 *
 * THE RESERVE FALLS AS YOU STAGE; THE SPICE DOES NOT. What a shipment costs
 * depends on the ground it lands on — one spice per force into a stronghold,
 * two elsewhere, the desert's radius free — so the purse moves only when the
 * board click ships, and the figure here is the purse as it stands. Staging
 * is free to undo; the landing is the spend.
 */
import { FACTION_LOOK, glyph } from './SeatLayer'
import type { FactionId } from '@/types/Dune/Faction'

const PALE = '#f0e2bb'
const SERIF = 'Georgia, "Times New Roman", serif'

export interface ShipRailProps {
  faction: FactionId
  reserves: number
  reservesStarred: number
  spice: number | null
  pending: { plain: number; starred: number }
  /** Whether clicks stage anything: this seat's ship window, unshipped. */
  active: boolean
  onStage: (kind: 'plain' | 'starred') => void
  onReset: () => void
  /** What the pool is called. 'Reserves' in play; the Fremen's setup calls
   *  it 'Starting troops', because it is not a reserve at that point. */
  poolLabel?: string
  /** A rule worth remembering, under the bubbles — the Fremen's free radius
   *  rides here during shipment. */
  note?: string
}

/**
 * One force-staging bubble: the faction's glyph until something is staged,
 * then the count. EXPORTED because the grammar is shared — the Fremen's
 * setup placement stages with the same bubbles it ships with, so the same
 * action looks the same in both places.
 */
export function ForceBubble({ faction, count, starred, disabled, onClick }: {
  faction: FactionId
  count: number
  starred: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      data-ship-bubble={starred ? 'starred' : 'plain'}
      aria-label={starred ? 'Stage one elite force to ship' : 'Stage one force to ship'}
      style={{
        width: 46, height: 46, borderRadius: '50%', display: 'block', margin: '6px auto 0',
        background: FACTION_LOOK[faction].colour,
        border: `2px solid ${PALE}`, cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1, padding: 0,
      }}>
      <svg viewBox="-12 -12 24 24" width="42" height="42" style={{ display: 'block', margin: 'auto' }}>
        {starred && (
          <path d="M0 -11 L2.6 -3.6 L10.5 -3.4 L4.2 1.4 L6.5 9 L0 4.4 L-6.5 9 L-4.2 1.4 L-10.5 -3.4 L-2.6 -3.6 Z"
            fill="none" stroke={PALE} strokeWidth="1.3" />
        )}
        {count > 0
          ? <text x="0" y="0" fontSize={starred ? 9 : 12} fill={PALE} textAnchor="middle"
              dominantBaseline="central" fontFamily={SERIF} fontWeight="bold">{count}</text>
          : <g transform={starred ? 'scale(0.55)' : undefined}>{glyph(faction)}</g>}
      </svg>
    </button>
  )
}

export function ShipRail({
  faction, reserves, reservesStarred, spice, pending, active, onStage, onReset,
  poolLabel = 'Reserves', note,
}: ShipRailProps) {
  const staged = pending.plain + pending.starred
  const hasStarredCorps = reservesStarred > 0 || pending.starred > 0

  return (
    <div data-layer="ship-rail" style={{
      flex: '0 0 auto', width: 76, padding: '10px 6px', overflowY: 'auto',
      borderRight: '1px solid #ffffff1f', background: '#111a2c',
      font: `11px ${SERIF}`, color: PALE, textAlign: 'center',
    }}>
      <span style={{ display: 'block', opacity: 0.7 }}>{poolLabel}</span>
      <b data-rail-reserves={reserves - pending.plain} style={{ fontSize: 15 }}>
        {reserves - pending.plain}
      </b>
      {hasStarredCorps && (
        <>
          <span style={{ display: 'block', opacity: 0.7, marginTop: 2 }}>Elite</span>
          <b data-rail-starred={reservesStarred - pending.starred} style={{ fontSize: 15 }}>
            {reservesStarred - pending.starred}
          </b>
        </>
      )}
      {/* THE PURSE AS IT STANDS. It falls when the landing ships, not
          while forces are merely staged — the fare is the ground's to name. */}
      <span style={{ display: 'block', opacity: 0.7, marginTop: 6 }}>Spice</span>
      <b data-rail-spice={spice ?? ''} style={{ fontSize: 15 }}>{spice ?? '—'}</b>

      <ForceBubble faction={faction} count={pending.plain} starred={false}
        disabled={!active || reserves - pending.plain <= 0}
        onClick={() => onStage('plain')} />
      {hasStarredCorps && (
        <ForceBubble faction={faction} count={pending.starred} starred
          disabled={!active || reservesStarred - pending.starred <= 0}
          onClick={() => onStage('starred')} />
      )}

      {staged > 0 && (
        <>
          <span style={{ display: 'block', marginTop: 6, opacity: 0.85 }}>
            Click the board to land {staged}
          </span>
          <button type="button" onClick={onReset} aria-label="Put the staged forces back"
            style={{ marginTop: 4 }}>
            ↺ back
          </button>
        </>
      )}
      {!active && staged === 0 && (
        <span style={{ display: 'block', marginTop: 8, opacity: 0.5 }}>
          Ships in your shipment window
        </span>
      )}
      {note && (
        <span style={{ display: 'block', marginTop: 8, opacity: 0.7, lineHeight: 1.4 }}>
          {note}
        </span>
      )}
    </div>
  )
}
