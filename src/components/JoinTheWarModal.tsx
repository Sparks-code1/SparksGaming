import { useState } from 'react'
import type { Territory } from '@/types/territory'
import type { Player } from '@/types/player'
import { FACTION_COLORS } from '@/data/mockGameState'
import { TERRITORY_DEFINITIONS, MAP_WIDTH, MAP_HEIGHT, CONTINENT_COLORS } from '@/data/territoryData'
import { SCAR_META } from '@/lib/legacyApi'
import { legalJoinWarTerritoryIds } from '@/lib/gameLogic'
import BulletIcon from './BulletIcon'

interface Props {
  player: Player
  territories: Record<string, Territory>
  /** Territory ids of every active HQ on the board — these and their neighbours are blocked */
  hqTerritoryIds: string[]
  falloutZoneTerritoryId?: string | null
  onJoin: (territoryId: string) => void
  onForfeit: () => void
}

function hexToRgba(hex: number, a: number) {
  return `rgba(${(hex >> 16) & 0xff},${(hex >> 8) & 0xff},${hex & 0xff},${a})`
}

export default function JoinTheWarModal({ player, territories, hqTerritoryIds, falloutZoneTerritoryId = null, onJoin, onForfeit }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const col = FACTION_COLORS[player.factionId] ?? 0x888888
  const playerColor = hexToRgba(col, 1)

  // Legal starting territory: unowned, no cities, not adjacent to any HQ, and
  // not the Fallout Zone. Shared with the AI picker and the turn-advance skip
  // so the board can never offer a re-entry those would disagree with.
  const legalIds = new Set(
    legalJoinWarTerritoryIds(territories, hqTerritoryIds, falloutZoneTerritoryId),
  )

  function isLegal(t: Territory | undefined): boolean {
    return !!t && legalIds.has(t.id)
  }

  const anyLegal = TERRITORY_DEFINITIONS.some(d => isLegal(territories[d.id]))
  const selectedName = selected ? (territories[selected]?.name ?? selected) : null

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.82)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#1a0f00',
        border: `2px solid ${playerColor}`,
        borderRadius: 10,
        padding: '18px 22px',
        width: 'min(1000px, 94vw)',
        maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
        fontFamily: 'Georgia, serif',
        boxShadow: `0 0 40px ${hexToRgba(col, 0.27)}`,
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: playerColor, textTransform: 'uppercase', marginBottom: 4 }}>
            {player.name} has been eliminated
          </div>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: '#E8DCC8', letterSpacing: 1 }}>
            ⚔ Join the War
          </div>
          <div style={{ fontSize: 11, color: 'rgba(200,180,140,0.65)', marginTop: 4 }}>
            Click a highlighted territory on the map to rejoin with 3 troops — or forfeit this game.
            You do <em>not</em> receive a new HQ.
          </div>
          <div style={{ fontSize: 10, color: 'rgba(200,148,10,0.7)', marginTop: 4 }}>
            Legal territory: <strong>unowned</strong> · <strong>no cities</strong> · <strong>not adjacent to any HQ</strong>
          </div>
        </div>

        {/* Map */}
        <div style={{ position: 'relative', flex: 1, minHeight: 340, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(200,148,10,0.25)' }}>
          <img
            src="/Risk_board.svg.png"
            alt="Risk board"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center', filter: 'grayscale(60%) brightness(0.55)', pointerEvents: 'none' }}
          />
          <svg
            viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          >
            {TERRITORY_DEFINITIONS.map(def => {
              const t = territories[def.id]
              if (!t) return null
              const poly = def.polygon as number[][]
              const pts = poly.map(([x, y]) => `${x},${y}`).join(' ')
              const legal = isLegal(t)
              const isSelected = selected === def.id
              const isHovered = hoveredId === def.id && legal
              const isHq = hqTerritoryIds.includes(def.id)
              const occupied = !!t.occupyingPlayerId

              let fillColor = 'rgba(0,0,0,0)'
              let strokeColor = 'rgba(255,255,255,0.08)'
              let strokeW = 0.5
              if (occupied) {
                fillColor = 'rgba(90,90,90,0.20)'
                strokeColor = 'rgba(120,120,120,0.30)'
              }
              if (isSelected) {
                fillColor = hexToRgba(col, 0.55)
                strokeColor = hexToRgba(col, 0.95)
                strokeW = 2
              } else if (isHovered) {
                fillColor = 'rgba(80,200,80,0.35)'
                strokeColor = 'rgba(80,220,80,0.85)'
                strokeW = 1.5
              } else if (legal) {
                const cc = CONTINENT_COLORS[def.continentId as keyof typeof CONTINENT_COLORS] ?? 0x888888
                fillColor = hexToRgba(cc, 0.22)
                strokeColor = 'rgba(80,220,80,0.45)'
                strokeW = 1
              }

              const cx = def.labelX
              const cy = def.labelY
              const scarTypes = (t.scars ?? []).map(s => s.type)
              const hasAmmo = scarTypes.includes('wasteland')
              const scarIcons = scarTypes.filter(ty => ty !== 'wasteland')
                .map(ty => SCAR_META.find(m => m.type === ty)?.icon ?? '').filter(Boolean)
              const hasCity = t.cities.some(c => !c.isDestroyed)
              const showLabel = isHovered || isSelected

              return (
                <g key={def.id}>
                  <polygon
                    points={pts}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={strokeW}
                    style={{ cursor: legal ? 'pointer' : 'default', transition: 'fill 0.12s, stroke 0.12s' }}
                    onMouseEnter={() => legal && setHoveredId(def.id)}
                    onMouseLeave={() => setHoveredId(prev => (prev === def.id ? null : prev))}
                    onClick={() => legal && setSelected(prev => (prev === def.id ? null : def.id))}
                  />
                  {isHq && (
                    <text x={cx} y={cy - 8} textAnchor="middle" dominantBaseline="central" fontSize="11"
                      fill="rgba(255,200,80,0.95)" stroke="rgba(0,0,0,0.75)" strokeWidth="1.5" paintOrder="stroke"
                      style={{ pointerEvents: 'none' }}>♛</text>
                  )}
                  {hasCity && !isHq && (
                    <text x={cx} y={cy - 8} textAnchor="middle" dominantBaseline="central" fontSize="9"
                      fill="rgba(255,220,80,0.85)" stroke="rgba(0,0,0,0.75)" strokeWidth="1.5" paintOrder="stroke"
                      style={{ pointerEvents: 'none' }}>🏙</text>
                  )}
                  {hasAmmo && <BulletIcon cx={cx - (scarIcons.length > 0 ? 7 : 0)} cy={cy + 4} scale={0.75} />}
                  {scarIcons.length > 0 && (
                    <text x={cx + (hasAmmo ? 7 : 0)} y={cy + 4} textAnchor="middle" dominantBaseline="central" fontSize="8"
                      fill="rgba(255,255,255,0.85)" stroke="rgba(0,0,0,0.75)" strokeWidth="1.2" paintOrder="stroke"
                      style={{ pointerEvents: 'none' }}>{scarIcons.join('')}</text>
                  )}
                  {showLabel && (
                    <text x={cx} y={cy + (hasCity || hasAmmo || scarIcons.length > 0 ? 13 : 0)} textAnchor="middle" dominantBaseline="central"
                      fontSize="9" fontFamily="Georgia, serif" fontWeight="bold"
                      fill="white" stroke="rgba(0,0,0,0.85)" strokeWidth="2.5" paintOrder="stroke"
                      style={{ pointerEvents: 'none' }}>{t.name}</text>
                  )}
                  {isSelected && (
                    <text x={cx} y={cy - 11} textAnchor="middle" dominantBaseline="central" fontSize="12"
                      fill={hexToRgba(col, 0.95)} stroke="rgba(0,0,0,0.65)" strokeWidth="0.7" paintOrder="stroke"
                      style={{ pointerEvents: 'none' }}>⚔</text>
                  )}
                </g>
              )
            })}
          </svg>

          {/* Legend */}
          <div style={{
            position: 'absolute', top: 8, right: 8,
            background: 'rgba(5,3,0,0.82)', borderRadius: 7,
            border: '1px solid rgba(200,148,10,0.25)',
            padding: '6px 10px', fontSize: 10, color: '#9a8060',
            display: 'flex', flexDirection: 'column', gap: 4,
            pointerEvents: 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 12, height: 12, background: 'rgba(80,200,80,0.30)', border: '1.5px solid rgba(80,220,80,0.65)', borderRadius: 2 }} />
              <span>Legal territory</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 12, height: 12, background: hexToRgba(col, 0.55), border: `1.5px solid ${hexToRgba(col, 0.95)}`, borderRadius: 2 }} />
              <span>Selected — confirm</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'rgba(255,200,80,0.95)', fontSize: 11 }}>♛</span>
              <span>HQ (blocked + neighbours)</span>
            </div>
          </div>

          {!anyLegal && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }}>
              <div style={{
                background: 'rgba(20,5,0,0.88)', border: '1px solid rgba(180,60,40,0.5)',
                borderRadius: 8, padding: '14px 22px', color: 'rgba(200,120,90,0.9)', fontSize: 13,
              }}>
                No legal territories available — you must forfeit.
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
          <div style={{
            flex: 1, padding: '8px 14px', borderRadius: 7,
            background: selected ? hexToRgba(col, 0.10) : 'rgba(0,0,0,0.20)',
            border: selected ? `1.5px solid ${hexToRgba(col, 0.50)}` : '1px solid rgba(100,75,25,0.15)',
            fontSize: 12, color: selected ? '#E8DCC8' : '#4a3820',
            fontStyle: selected ? 'normal' : 'italic',
          }}>
            {selected
              ? <><strong style={{ color: playerColor }}>{selectedName}</strong> selected — confirm to rejoin here with 3 troops</>
              : 'Click a highlighted territory to select your landing zone'}
          </div>
          <button
            onClick={() => selected && onJoin(selected)}
            disabled={!selected}
            style={{
              padding: '11px 22px', borderRadius: 7, fontSize: 13,
              fontWeight: 'bold', fontFamily: 'Georgia, serif', cursor: selected ? 'pointer' : 'not-allowed',
              background: selected ? playerColor : 'rgba(100,70,30,0.3)',
              border: `2px solid ${selected ? playerColor : 'rgba(100,70,30,0.4)'}`,
              color: selected ? 'white' : 'rgba(150,120,80,0.5)',
            }}
          >
            ⚔ Join the War
          </button>
          <button
            onClick={onForfeit}
            style={{
              padding: '11px 16px', borderRadius: 7, fontSize: 12,
              fontFamily: 'Georgia, serif', cursor: 'pointer',
              background: 'rgba(80,20,10,0.5)',
              border: '1px solid rgba(180,60,40,0.4)',
              color: 'rgba(200,100,80,0.85)',
            }}
          >
            Forfeit Game
          </button>
        </div>
      </div>
    </div>
  )
}
