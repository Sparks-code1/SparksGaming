import { useState } from 'react'
import type { Territory } from '@/types/territory'
import { TERRITORY_DEFINITIONS, MAP_WIDTH, MAP_HEIGHT } from '@/data/territoryData'
import { isSeaLine } from '@/data/seaLines'

// Territories with no coastline on the board art — sea lines can't reach them
const LANDLOCKED = new Set(['afghanistan', 'irkutsk'])

interface Props {
  playerName: string
  territories: Record<string, Territory>
  existingSeaLines: Array<[string, string]>
  onPlace: (a: string, b: string) => void
  onSkip: () => void
}

/**
 * Island Empire mission reward — draw a permanent new sea line between any
 * two coastal territories. Pick two on the map, confirm, done.
 */
export default function SeaLinePlacementModal({ playerName, territories, existingSeaLines, onPlace, onSkip }: Props) {
  const [first, setFirst] = useState<string | null>(null)
  const [second, setSecond] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  function isEligible(id: string): boolean {
    if (LANDLOCKED.has(id)) return false
    if (id === first || id === second) return true // clicking again deselects
    if (first && !second) {
      // Second pick: must not already border the first pick
      const t = territories[first]
      if (t?.adjacentIds.includes(id)) return false
      if (isSeaLine(first, id)) return false
    }
    return true
  }

  function handleClick(id: string) {
    if (!isEligible(id)) return
    if (id === first) { setFirst(second); setSecond(null); return }
    if (id === second) { setSecond(null); return }
    if (!first) { setFirst(id); return }
    if (!second) { setSecond(id); return }
    // Both picked — replace the second
    setSecond(id)
  }

  const defOf = (id: string | null) => id ? TERRITORY_DEFINITIONS.find(d => d.id === id) : undefined
  const dA = defOf(first)
  const dB = defOf(second)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Georgia, serif',
    }}>
      <div style={{
        background: '#0a1420',
        border: '2px solid rgba(80,180,255,0.65)',
        borderRadius: 12, padding: '18px 22px',
        width: 'min(980px, 94vw)', maxHeight: '92vh',
        display: 'flex', flexDirection: 'column', color: '#E8DCC8',
        boxShadow: '0 0 50px rgba(80,180,255,0.18)',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: '#5ab4ff', letterSpacing: 1 }}>
            ⚓ NEW SEA ROUTE
          </div>
          <div style={{ fontSize: 11, color: 'rgba(160,200,240,0.7)', marginTop: 4 }}>
            {playerName} controls 7+ islands — draw a permanent sea line between any two
            coastal territories. It becomes a two-way attack and maneuver route for the rest of the campaign.
          </div>
        </div>

        {/* Map */}
        <div style={{ position: 'relative', flex: 1, minHeight: 360, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(80,180,255,0.30)' }}>
          <img
            src="/Risk_board.svg.png" alt="Risk board"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center', filter: 'grayscale(55%) brightness(0.55)', pointerEvents: 'none' }}
          />
          <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} preserveAspectRatio="xMidYMid meet"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            {/* Existing custom sea lines */}
            {existingSeaLines.map(([a, b], i) => {
              const da = TERRITORY_DEFINITIONS.find(d => d.id === a)
              const db = TERRITORY_DEFINITIONS.find(d => d.id === b)
              if (!da || !db) return null
              return (
                <line key={`ex-${i}`} x1={da.labelX} y1={da.labelY} x2={db.labelX} y2={db.labelY}
                  stroke="rgba(80,200,255,0.40)" strokeWidth="2" strokeDasharray="6 5"
                  style={{ pointerEvents: 'none' }} />
              )
            })}
            {/* Preview of the new line */}
            {dA && dB && (
              <line x1={dA.labelX} y1={dA.labelY} x2={dB.labelX} y2={dB.labelY}
                stroke="rgba(80,220,255,0.95)" strokeWidth="2.5" strokeDasharray="7 5"
                style={{ pointerEvents: 'none' }} />
            )}
            {TERRITORY_DEFINITIONS.map(def => {
              const poly = def.polygon as number[][]
              const pts = poly.map(([x, y]) => `${x},${y}`).join(' ')
              const eligible = isEligible(def.id)
              const isPicked = def.id === first || def.id === second
              const hov = hoveredId === def.id && eligible

              let fill = 'rgba(0,0,0,0)'
              let stroke = 'rgba(255,255,255,0.06)'
              let strokeW = 0.5
              if (isPicked) { fill = 'rgba(80,200,255,0.45)'; stroke = 'rgba(80,220,255,0.95)'; strokeW = 2 }
              else if (hov) { fill = 'rgba(80,200,255,0.25)'; stroke = 'rgba(80,220,255,0.70)'; strokeW = 1.5 }
              else if (LANDLOCKED.has(def.id)) { fill = 'rgba(120,90,40,0.25)'; stroke = 'rgba(160,120,60,0.40)'; strokeW = 0.8 }

              return (
                <g key={def.id}>
                  <polygon
                    points={pts} fill={fill} stroke={stroke} strokeWidth={strokeW}
                    style={{ cursor: eligible ? 'pointer' : 'not-allowed', transition: 'fill 0.1s' }}
                    onMouseEnter={() => setHoveredId(def.id)}
                    onMouseLeave={() => setHoveredId(prev => prev === def.id ? null : prev)}
                    onClick={() => handleClick(def.id)}
                  />
                  {(isPicked || hov) && (
                    <text x={def.labelX} y={def.labelY - 10} textAnchor="middle" dominantBaseline="central"
                      fontSize="9" fontFamily="Georgia, serif" fontWeight="bold"
                      fill="white" stroke="rgba(0,0,0,0.85)" strokeWidth="2.5" paintOrder="stroke"
                      style={{ pointerEvents: 'none' }}>
                      {def.name}
                    </text>
                  )}
                  {isPicked && (
                    <text x={def.labelX} y={def.labelY + 4} textAnchor="middle" dominantBaseline="central"
                      fontSize="12" fill="rgba(80,220,255,0.95)" stroke="rgba(0,0,0,0.7)" strokeWidth="1" paintOrder="stroke"
                      style={{ pointerEvents: 'none' }}>⚓</text>
                  )}
                </g>
              )
            })}
          </svg>
          {/* Legend */}
          <div style={{
            position: 'absolute', top: 8, right: 8,
            background: 'rgba(3,8,15,0.85)', borderRadius: 7,
            border: '1px solid rgba(80,180,255,0.30)',
            padding: '6px 10px', fontSize: 10, color: '#7a9ac0',
            display: 'flex', flexDirection: 'column', gap: 4, pointerEvents: 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 12, height: 12, background: 'rgba(80,200,255,0.45)', border: '1.5px solid rgba(80,220,255,0.95)', borderRadius: 2 }} />
              <span>Selected endpoint</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 12, height: 12, background: 'rgba(120,90,40,0.35)', border: '1px solid rgba(160,120,60,0.55)', borderRadius: 2 }} />
              <span>Landlocked — blocked</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
          <div style={{
            flex: 1, padding: '8px 14px', borderRadius: 7, fontSize: 12,
            background: first && second ? 'rgba(80,180,255,0.10)' : 'rgba(0,0,0,0.25)',
            border: first && second ? '1.5px solid rgba(80,180,255,0.55)' : '1px solid rgba(80,120,160,0.20)',
            color: first && second ? '#cfe8ff' : '#4a6a8a',
            fontStyle: first && second ? 'normal' : 'italic',
          }}>
            {first && second
              ? <><strong style={{ color: '#5ab4ff' }}>{dA?.name}</strong> ⚓⇄⚓ <strong style={{ color: '#5ab4ff' }}>{dB?.name}</strong> — confirm to make this route permanent</>
              : first
                ? <>First endpoint: <strong style={{ color: '#5ab4ff' }}>{dA?.name}</strong> — now click the second coastal territory</>
                : 'Click the first coastal territory for the new sea route'}
          </div>
          <button
            onClick={() => first && second && onPlace(first, second)}
            disabled={!first || !second}
            style={{
              padding: '11px 22px', borderRadius: 7, fontSize: 13, fontWeight: 'bold',
              fontFamily: 'Georgia, serif', cursor: first && second ? 'pointer' : 'not-allowed',
              background: first && second ? 'rgba(80,180,255,0.85)' : 'rgba(60,90,120,0.3)',
              border: `2px solid ${first && second ? '#5ab4ff' : 'rgba(60,90,120,0.4)'}`,
              color: first && second ? '#04121f' : 'rgba(120,150,180,0.5)',
            }}
          >
            ⚓ Draw Sea Line
          </button>
          <button
            onClick={onSkip}
            style={{
              padding: '11px 16px', borderRadius: 7, fontSize: 12,
              fontFamily: 'Georgia, serif', cursor: 'pointer',
              background: 'transparent', border: '1px solid rgba(80,120,160,0.35)',
              color: 'rgba(140,170,200,0.7)',
            }}
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  )
}
