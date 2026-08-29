/**
 * The revival rail: the Tleilaxu Tanks pay out, in the rail's own grammar.
 *
 * PHASE FIVE'S RAIL. The slot between the chat and the board belongs to
 * whichever phase has business there — setup places, revival raises,
 * shipment ships — and this is revival's: your dead counted at the top, a
 * bubble per kind to stage them back, and one commit that posts the whole
 * claim. Plain and elite stage on their OWN bubbles because they are
 * different purchases: one Fedaykin or Sardaukar may return a turn, and
 * they are treated as one force in revival.
 *
 * THE PURSE STANDS STILL while the dead are merely staged; the commit
 * spends. The fare on the button is the marginal cost the server will
 * charge — the sheet's free revivals first, then 2 spice each, to the bank.
 */
import { ForceBubble } from './ShipRail'
import { REVIVAL_SPICE } from '@/lib/dune/revival'
import type { FactionId } from '@/types/Dune/Faction'

const PALE = '#f0e2bb'
const SERIF = 'Georgia, "Times New Roman", serif'

export interface RevivalRailProps {
  faction: FactionId
  /** This faction's dead, as the tanks hold them. */
  dead: { plain: number; starred: number }
  spice: number | null
  pending: { plain: number; starred: number }
  /** How many more forces may return this turn: the cap minus the ledger. */
  room: number
  /** How many of those the sheet still covers before the bank charges. */
  freeLeft: number
  /** Whether the turn's one starred revival is still open. */
  starredOpen: boolean
  /** Leaders that could return, at fighting strength, one a turn. */
  leaders: readonly { name: string; strength: number }[]
  leaderTaken: boolean
  onStage: (kind: 'plain' | 'starred') => void
  onReset: () => void
  onRevive: (a: { plain?: number; starred?: number }) => void
  onLeader: (name: string) => void
}

export function RevivalRail({
  faction, dead, spice, pending, room, freeLeft, starredOpen, leaders, leaderTaken,
  onStage, onReset, onRevive, onLeader,
}: RevivalRailProps) {
  const staged = pending.plain + pending.starred
  const cost = REVIVAL_SPICE * Math.max(0, staged - freeLeft)

  return (
    <div data-layer="revival-rail" style={{
      flex: '0 0 auto', width: 118, padding: '10px 8px', overflowY: 'auto',
      borderRight: '1px solid #ffffff1f', background: '#111a2c',
      font: `11px ${SERIF}`, color: PALE, textAlign: 'center',
    }}>
      {/* THE RAIL SUBTRACTS THE STAGED ITSELF — these figures are the tanks
          before staging, counted once, the arithmetic the setup rail taught. */}
      <span style={{ display: 'block', opacity: 0.7 }}>In the tanks</span>
      <b data-rail-dead={dead.plain - pending.plain} style={{ fontSize: 15 }}>
        {dead.plain - pending.plain}
      </b>
      {(dead.starred > 0 || pending.starred > 0) && (
        <>
          <span style={{ display: 'block', opacity: 0.7, marginTop: 2 }}>Elite</span>
          <b data-rail-dead-starred={dead.starred - pending.starred} style={{ fontSize: 15 }}>
            {dead.starred - pending.starred}
          </b>
        </>
      )}
      <span style={{ display: 'block', opacity: 0.7, marginTop: 6 }}>Spice</span>
      <b style={{ fontSize: 15 }}>{spice ?? '—'}</b>

      <ForceBubble faction={faction} count={pending.plain} starred={false}
        label="Stage one force to revive"
        disabled={dead.plain - pending.plain <= 0 || staged >= room}
        onClick={() => onStage('plain')} />
      {(dead.starred > 0 || pending.starred > 0) && (
        <ForceBubble faction={faction} count={pending.starred} starred
          label="Stage one elite to revive"
          disabled={!starredOpen || pending.starred >= 1
            || dead.starred - pending.starred <= 0 || staged >= room}
          onClick={() => onStage('starred')} />
      )}

      {staged > 0 && (
        <>
          <button type="button" data-revive-go=""
            onClick={() => onRevive({
              ...(pending.plain > 0 ? { plain: pending.plain } : null),
              ...(pending.starred > 0 ? { starred: pending.starred } : null),
            })}
            style={{ marginTop: 6 }}>
            Revive {staged} — {cost > 0 ? `${cost} spice` : 'free'}
          </button>
          <button type="button" onClick={onReset} aria-label="Put the staged dead back"
            style={{ marginTop: 4 }}>
            ↺ back
          </button>
        </>
      )}
      {room <= 0 && staged === 0 && (
        <span style={{ display: 'block', marginTop: 8, opacity: 0.6 }}>
          Your three are back for this turn
        </span>
      )}
      <span style={{ display: 'block', marginTop: 8, opacity: 0.7, lineHeight: 1.4 }}>
        Up to 3 forces a turn — {freeLeft > 0 ? `${freeLeft} still free, then ` : ''}
        {REVIVAL_SPICE} spice each to the bank. One elite a turn, to reserves.
      </span>

      {leaders.length > 0 && !leaderTaken && (
        <div data-layer="leader-revival" style={{ marginTop: 10, textAlign: 'left' }}>
          <span style={{ display: 'block', opacity: 0.7, textAlign: 'center' }}>Leaders</span>
          {/* ONE A TURN, at fighting strength — the price is the disc's, so
              it is printed on the button. */}
          {leaders.map(l => (
            <button key={l.name} type="button" data-revive-leader={l.name}
              disabled={(spice ?? 0) < l.strength}
              onClick={() => onLeader(l.name)}
              style={{
                display: 'block', width: '100%', margin: '4px 0', padding: '3px 4px',
                font: `10px ${SERIF}`, color: PALE, textAlign: 'left',
                background: 'transparent', border: '1px solid #f0e2bb55',
                borderRadius: 4, cursor: 'pointer',
              }}>
              {l.name} — {l.strength} spice
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
