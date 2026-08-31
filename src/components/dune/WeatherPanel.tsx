/**
 * Weather Control: the storm steered by hand, nought to ten sectors.
 *
 * Played before the marker is calculated, from turn two — the chosen reach
 * BECOMES the calculation, published to the table like any roll, and the
 * Family Atomics beat still follows it when someone stands in the Wall's
 * reach. Zero is a real choice: a storm held still is the card at its most
 * useful.
 */
import { useState } from 'react'
import { TreacheryCardFace } from './TreacheryCardFace'
import { TREACHERY_CARDS } from '@/data/dune/treachery'
import { WEATHER_CONTROL_MAX } from '@/lib/dune/storm'

export interface WeatherPanelProps {
  onPlay: (sectors: number) => void
  onClose: () => void
  busy?: boolean
  refusal?: string | null
}

const REFUSAL_TEXT: Record<string, string> = {
  'no-window': 'The storm is not waiting to be calculated.',
  'too-early': 'The first storm belongs to the dials alone.',
  'bad-sectors': 'Nought to ten sectors.',
  'card-not-held': 'You do not hold Weather Control.',
  'stale': 'The table moved first — try again.',
}

const btn = {
  padding: '5px 12px', borderRadius: 4, border: 'none', cursor: 'pointer',
  font: '13px Georgia, serif',
} as const

export function WeatherPanel({ onPlay, onClose, busy = false, refusal = null }: WeatherPanelProps) {
  const [sectors, setSectors] = useState(0)
  return (
    <div data-layer="weather-panel" style={{
      position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
      background: '#000000a0', zIndex: 1100,
    }}>
      <div style={{
        width: 420, maxWidth: '92%',
        background: '#131c2e', color: '#f0e2bb', borderRadius: 8,
        border: '1px solid #f0e2bb44', padding: '14px 16px',
        font: '14px Georgia, serif',
      }}>
        <div style={{ display: 'flex', gap: 12 }}>
          {(() => {
            const c = TREACHERY_CARDS.find(x => x.id === 'weathercontrol')
            return c ? <TreacheryCardFace card={c} width={92} /> : null
          })()}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <b style={{ fontSize: 16 }}>Weather Control</b>
              <span style={{ flex: 1 }} />
              <button type="button" data-weather-close="" onClick={onClose}
                style={{ background: 'none', border: 'none', color: '#f0e2bb', cursor: 'pointer', fontSize: 15 }}>
                ✕
              </button>
            </div>
            <p style={{ margin: '4px 0 0', opacity: 0.75, fontSize: 12.5 }}>
              You control the storm this phase: it will move exactly the
              sectors you choose, published to the table as the calculation.
              Zero holds it where it stands.
            </p>
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
          <button type="button" data-weather-minus="" disabled={busy}
            onClick={() => setSectors(s => Math.max(0, s - 1))} style={btn}>−</button>
          <b style={{ fontSize: 18, minWidth: 26, textAlign: 'center' }}>{sectors}</b>
          <button type="button" data-weather-plus="" disabled={busy}
            onClick={() => setSectors(s => Math.min(WEATHER_CONTROL_MAX, s + 1))} style={btn}>+</button>
          <span style={{ opacity: 0.7, fontSize: 12.5 }}>
            sector{sectors === 1 ? '' : 's'}, counterclockwise
          </span>
        </div>

        {refusal && (
          <p data-weather-refusal={refusal} style={{ color: '#e8b04b', marginTop: 8 }}>
            {REFUSAL_TEXT[refusal] ?? `Refused: ${refusal}`}
          </p>
        )}

        <div style={{ marginTop: 12 }}>
          <button type="button" data-weather-play="" disabled={busy}
            onClick={() => onPlay(sectors)}
            style={{ padding: '6px 16px', borderRadius: 4, border: 'none', cursor: 'pointer' }}>
            Steer the storm {sectors} — the card is spent
          </button>
        </div>
      </div>
    </div>
  )
}
