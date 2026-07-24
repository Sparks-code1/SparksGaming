import { useState } from 'react'
import type { LegacyState } from '@/types/legacy'
import type { Territory } from '@/types/territory'

interface Props {
  legacyState: LegacyState
  territories: Record<string, Territory>
  alienPlayerName: string
  onPlace: (territoryId: string) => void
  onSkip: () => void
}

/**
 * Beam Down event resolution — the Aliens place 5 troops into any unoccupied
 * city on the board, regardless of population edge.
 */
export default function BeamDownModal({ legacyState, territories, alienPlayerName, onPlace, onSkip }: Props) {
  const [selected, setSelected] = useState<string | null>(null)

  const destroyedCityIds = new Set((legacyState.destroyedCities ?? []).map(d => d.cityId))
  const ruinIds = new Set(legacyState.ruinTerritoryIds ?? [])
  const candidateIds = [...new Set(
    legacyState.stickers
      .filter(s =>
        s.placement === 'territory' &&
        s.description.startsWith('city:') &&
        !destroyedCityIds.has(s.id) &&
        !ruinIds.has(s.targetId) &&
        !territories[s.targetId]?.occupyingPlayerId,
      )
      .map(s => s.targetId),
  )].filter(tid => !!territories[tid])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100,
      background: 'rgba(5,2,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Georgia, serif',
    }}>
      <div style={{
        background: 'linear-gradient(155deg, #02140f 0%, #060a02 100%)',
        border: '2px solid rgba(0,200,160,0.55)',
        borderRadius: 14, padding: '30px 34px 26px',
        width: 460, maxWidth: '92vw', color: '#E8DCC8',
        boxShadow: '0 0 60px rgba(0,200,160,0.18), 0 12px 50px rgba(0,0,0,0.85)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 40, lineHeight: 1, marginBottom: 10 }}>🛸</div>
          <div style={{ fontSize: 21, fontWeight: 'bold', color: '#00c8a0', letterSpacing: 1.5 }}>
            BEAM DOWN
          </div>
          <div style={{ fontSize: 12, color: '#7a9a8a', marginTop: 6, lineHeight: 1.5 }}>
            <strong style={{ color: '#00c8a0' }}>{alienPlayerName}</strong> places
            <strong style={{ color: '#00c8a0' }}> 5 troops</strong> into an unoccupied city —
            no population edge required.
          </div>
        </div>

        <div style={{
          fontSize: 10, color: '#4a6a5a', letterSpacing: 1.5, textTransform: 'uppercase',
          marginBottom: 8, borderBottom: '1px solid rgba(0,200,160,0.15)', paddingBottom: 5,
        }}>
          Unoccupied cities
        </div>
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20,
          maxHeight: 200, overflowY: 'auto',
        }}>
          {candidateIds.map(tid => {
            const t = territories[tid]!
            const sel = selected === tid
            return (
              <button
                key={tid}
                onClick={() => setSelected(sel ? null : tid)}
                style={{
                  padding: '7px 12px', borderRadius: 7,
                  border: `1.5px solid ${sel ? '#00c8a0' : 'rgba(0,200,160,0.30)'}`,
                  background: sel ? 'rgba(0,200,160,0.18)' : 'rgba(0,0,0,0.30)',
                  color: sel ? '#E8DCC8' : '#7a9a8a',
                  cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: 12,
                }}
              >
                🏙 {t.name}
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onSkip}
            style={{
              flex: 1, padding: '12px', borderRadius: 8, fontSize: 13,
              border: '1.5px solid rgba(120,120,120,0.35)', background: 'rgba(0,0,0,0.30)',
              color: '#8a8a7a', cursor: 'pointer', fontFamily: 'Georgia, serif',
            }}
          >
            Skip
          </button>
          <button
            disabled={!selected}
            onClick={() => selected && onPlace(selected)}
            style={{
              flex: 1, padding: '12px', borderRadius: 8, fontSize: 13, fontWeight: 'bold',
              border: `2px solid ${selected ? 'rgba(0,200,160,0.75)' : 'rgba(0,200,160,0.20)'}`,
              background: selected ? 'rgba(0,200,160,0.18)' : 'rgba(0,0,0,0.20)',
              color: selected ? '#E8DCC8' : '#3a5a4a',
              cursor: selected ? 'pointer' : 'not-allowed', fontFamily: 'Georgia, serif',
            }}
          >
            🛸 Beam Down 5 Troops
          </button>
        </div>
      </div>
    </div>
  )
}
