/**
 * The Bene Gesserit's flips, in the rail.
 *
 * IT WAS A FLOATING BOX over the top-right of the board — the corner the HUD
 * already occupies, and the same corner a notice once covered a Ready button
 * in. A control that hovers over the board is a control that will one day sit
 * on top of another one, and the rail is where this table's controls live.
 *
 * ONE BUBBLE PER TERRITORY, because that is the rail's grammar and because the
 * choice really is per-territory: advisors become fighters in one place while
 * staying advisors in another. The territory is named under its bubble rather
 * than inside it — a name will not fit in a circle, and the circle is what you
 * press.
 */
import { ForceBubble } from './ShipRail'
import { DUNE_TERRITORIES } from '@/data/dune/boardData'
import type { FactionId } from '@/types/Dune/Faction'

const PALE = '#f0e2bb'
const SERIF = 'Georgia, "Times New Roman", serif'
const nameOf = (t: string) =>
  DUNE_TERRITORIES.find(d => d.id === t)?.displayName ?? t

export function BgFlipRail({ faction, toFighter, toAdvisor, refusal, onFlip }: {
  faction: FactionId
  toFighter: readonly string[]
  toAdvisor: readonly string[]
  refusal: string | null
  onFlip: (territoryId: string, to: 'to-fighter' | 'to-advisor') => void
}) {
  return (
    <div data-layer="bg-flip-rail" style={{
      flex: '0 0 auto', width: 118, padding: '10px 8px', overflowY: 'auto',
      borderRight: '1px solid #ffffff1f', background: '#111a2c',
      font: `11px ${SERIF}`, color: PALE, textAlign: 'center',
    }}>
      <span style={{ display: 'block', opacity: 0.7 }}>Your advisors</span>
      {toFighter.map(t => (
        <div key={`f-${t}`} style={{ marginBottom: 8 }}>
          <ForceBubble faction={faction} count={0} starred={false}
            bubble="to-fighter"
            label={`Stand up as fighters in ${nameOf(t)}`} disabled={false}
            onClick={() => onFlip(t, 'to-fighter')} />
          <span data-bg-flip-fighter={t} style={{ display: 'block', marginTop: 3 }}>
            {nameOf(t)} — stand up
          </span>
        </div>
      ))}
      {toAdvisor.map(t => (
        <div key={`a-${t}`} style={{ marginBottom: 8 }}>
          <ForceBubble faction={faction} count={0} starred={false}
            bubble="to-advisor"
            label={`Sit down as advisors in ${nameOf(t)}`} disabled={false}
            onClick={() => onFlip(t, 'to-advisor')} />
          <span data-bg-flip-advisor={t} style={{ display: 'block', marginTop: 3 }}>
            {nameOf(t)} — sit down
          </span>
        </div>
      ))}
      {refusal && (
        <span data-bg-flip-refusal={refusal} style={{ color: '#e8b04b' }}>
          Refused: {refusal}
        </span>
      )}
    </div>
  )
}

export default BgFlipRail
