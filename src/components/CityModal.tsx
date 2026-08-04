import { useState } from 'react'
import type { Territory } from '@/types/territory'
import type { FactionId } from '@/types/faction'
import { FACTION_COLORS } from '@/data/mockGameState'

type CityAction = 'place-city' | 'destroy-city' | 'place-hq' | 'remove-hq'

interface Props {
  territory: Territory
  gameNumber: number
  currentFactionId: FactionId | null
  onAction: (action: CityAction, cityId?: string, cityName?: string) => void
  onClose: () => void
}

function hexToRgb(hex: number) {
  return `${(hex >> 16) & 0xff},${(hex >> 8) & 0xff},${hex & 0xff}`
}

export default function CityModal({ territory, gameNumber, currentFactionId, onAction, onClose }: Props) {
  const [newCityName, setNewCityName] = useState(territory.name + ' City')
  const [view, setView] = useState<'menu' | 'place-city'>('menu')

  const hasHQ = territory.cities.some(c => c.headquartersFactionId === currentFactionId)
  const canPlaceHQ = currentFactionId && !territory.scars.some(s => s.type === 'wasteland') && !hasHQ

  const factionColor = currentFactionId ? hexToRgb(FACTION_COLORS[currentFactionId] ?? 0xaaaaaa) : null

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(5,2,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1100, fontFamily: 'Georgia, serif',
    }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'linear-gradient(155deg, #060E1A 0%, #030810 100%)',
        border: '2px solid rgba(41,128,185,0.60)',
        borderRadius: 13, padding: '24px 26px 20px',
        width: 420, maxWidth: '92vw', color: '#E8DCC8',
        boxShadow: '0 12px 50px rgba(0,0,0,0.85)',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 'bold', color: '#2980B9', letterSpacing: 1 }}>
            🏙 CITIES & HQ
          </div>
          <div style={{ fontSize: 12, color: '#6a8aaa', marginTop: 3 }}>
            <strong style={{ color: '#AED6F1' }}>{territory.name}</strong>
            {' — '}Game #{gameNumber}
          </div>
        </div>

        {view === 'menu' && (
          <>
            {/* Existing cities */}
            {territory.cities.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: '#4a6a8a', letterSpacing: 1.5, marginBottom: 7 }}>CITIES ON THIS TERRITORY</div>
                {territory.cities.map(city => (
                  <div key={city.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', borderRadius: 6, marginBottom: 5,
                    background: city.isDestroyed ? 'rgba(80,20,20,0.25)' : 'rgba(41,128,185,0.12)',
                    border: `1px solid ${city.isDestroyed ? 'rgba(192,57,43,0.35)' : 'rgba(41,128,185,0.30)'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16 }}>{city.isDestroyed ? '☠' : city.headquartersFactionId ? '★' : '●'}</span>
                      <div>
                        <div style={{ fontSize: 12, color: city.isDestroyed ? '#c05050' : '#AED6F1' }}>
                          {city.name}
                          {city.headquartersFactionId && (
                            <span style={{ fontSize: 10, color: '#F39C12', marginLeft: 6 }}>HQ</span>
                          )}
                        </div>
                        {city.isDestroyed && (
                          <div style={{ fontSize: 10, color: '#5a3a3a' }}>Destroyed game {city.destroyedInGame}</div>
                        )}
                      </div>
                    </div>
                    {!city.isDestroyed && (
                      <button
                        onClick={() => onAction('destroy-city', city.id)}
                        style={{
                          fontSize: 10, padding: '3px 9px', borderRadius: 4,
                          border: '1px solid rgba(192,57,43,0.50)',
                          background: 'rgba(192,57,43,0.15)', color: '#c0604a',
                          cursor: 'pointer', fontFamily: 'Georgia, serif',
                        }}
                      >☠ Destroy</button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => setView('place-city')}
                style={actionBtnStyle('#2980B9')}
              >
                ● Place City
                <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 6 }}>permanent settlement</span>
              </button>

              {canPlaceHQ && factionColor && (
                <button
                  onClick={() => onAction('place-hq')}
                  style={actionBtnStyle(`rgb(${factionColor})`)}
                >
                  ★ Place Faction HQ
                  <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 6 }}>
                    {currentFactionId?.replace(/-/g, ' ')}
                  </span>
                </button>
              )}

              {hasHQ && (
                <button
                  onClick={() => onAction('remove-hq')}
                  style={actionBtnStyle('#E74C3C')}
                >
                  ✕ Remove HQ
                </button>
              )}
            </div>

            {territory.scars.some(s => s.type === 'wasteland') && (
              <div style={{ marginTop: 12, fontSize: 10, color: '#7a3030', textAlign: 'center' }}>
                ☠ Wasteland scar — no HQ may be placed here
              </div>
            )}

            <button onClick={onClose} style={{
              width: '100%', marginTop: 14, padding: '8px', borderRadius: 6,
              border: '1px solid rgba(41,128,185,0.25)', background: 'transparent',
              color: '#4a6a8a', cursor: 'pointer', fontSize: 12, fontFamily: 'Georgia, serif',
            }}>Close</button>
          </>
        )}

        {view === 'place-city' && (
          <>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: '#4a6a8a', display: 'block', marginBottom: 7, letterSpacing: 1 }}>
                CITY NAME
              </label>
              <input
                value={newCityName}
                onChange={e => setNewCityName(e.target.value)}
                maxLength={32}
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 6,
                  border: '1.5px solid rgba(41,128,185,0.50)',
                  background: 'rgba(0,0,0,0.40)', color: '#E8DCC8',
                  fontSize: 14, fontFamily: 'Georgia, serif',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setView('menu')} style={{
                flex: 1, padding: '10px', borderRadius: 6,
                border: '1px solid rgba(41,128,185,0.25)', background: 'transparent',
                color: '#4a6a8a', cursor: 'pointer', fontSize: 12, fontFamily: 'Georgia, serif',
              }}>Back</button>
              <button
                onClick={() => { onAction('place-city', undefined, newCityName.trim() || territory.name + ' City') }}
                disabled={!newCityName.trim()}
                style={{
                  flex: 2, padding: '10px', borderRadius: 6,
                  border: '2px solid rgba(41,128,185,0.70)',
                  background: 'rgba(41,128,185,0.22)', color: '#AED6F1',
                  cursor: 'pointer', fontSize: 13, fontWeight: 'bold', fontFamily: 'Georgia, serif',
                }}
              >● Found City</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function actionBtnStyle(color: string) {
  return {
    display: 'flex', alignItems: 'center',
    padding: '11px 14px', borderRadius: 7, textAlign: 'left' as const,
    border: `1px solid ${color}55`,
    background: `${color}14`,
    color: '#E8DCC8', cursor: 'pointer',
    fontSize: 13, fontFamily: 'Georgia, serif',
    width: '100%',
  }
}
