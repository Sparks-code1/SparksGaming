import { useState } from 'react'
import { TERRITORY_DEFINITIONS, MAP_WIDTH, MAP_HEIGHT, CONTINENT_COLORS } from '@/data/territoryData'
import { FACTION_COLORS, MOCK_PLAYERS } from '@/data/mockGameState'
import { SCAR_META } from '@/lib/legacyApi'
import BulletIcon from './BulletIcon'
import type { LegacyState } from '@/types/legacy'

interface PlacedHQ {
  playerId: string
  playerName: string
  factionId: string
  territoryId: string
}

interface Props {
  currentPlayer: { id: string; name: string; factionId: string }
  placedHQs: PlacedHQ[]
  legacy?: LegacyState | null
  onConfirm: (territoryId: string) => void
}

function hexToRgba(hex: number, a: number) {
  return `rgba(${(hex >> 16) & 0xff},${(hex >> 8) & 0xff},${hex & 0xff},${a})`
}

export default function HQMapPicker({ currentPlayer, placedHQs, legacy = null, onConfirm }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const takenIds = new Set(placedHQs.map(h => h.territoryId))

  // Build adjacency exclusion: no territory adjacent to an already-placed HQ
  const adjacentToPlaced = new Set<string>()
  for (const { territoryId } of placedHQs) {
    const def = TERRITORY_DEFINITIONS.find(d => d.id === territoryId)
    if (def) def.adjacentIds.forEach(id => adjacentToPlaced.add(id))
  }

  // Build city data from legacy
  const destroyedCityIds = new Set((legacy?.destroyedCities ?? []).map(d => d.cityId))

  // victoryLog fallback: game number → winner playerId (matched by name)
  const winnerPlayerByGame = new Map<number, string>()
  for (const v of (legacy?.victoryLog ?? [])) {
    const p = MOCK_PLAYERS.find(pl => pl.name === v.winnerName)
    if (p) winnerPlayerByGame.set(v.gameNumber, p.id)
  }

  // Resolve who placed a sticker — 3-tier fallback:
  // 1. placedByPlayerId field (new data)
  // 2. victoryLog name match on appliedInGame (old major cities)
  // 3. parse sticker ID suffix "-p1"/"-p2" etc. (old minor cities)
  function resolvePlacedByPlayer(sticker: { id: string; appliedInGame: number; description: string; placedByPlayerId?: string }): string | null {
    if (sticker.placedByPlayerId) return sticker.placedByPlayerId
    const isMajor = sticker.description === 'city:major'
    if (isMajor) return winnerPlayerByGame.get(sticker.appliedInGame) ?? null
    // Old minor city IDs: "city-{timestamp}-{playerId}"
    const parts = sticker.id.split('-')
    const embeddedId = parts[parts.length - 1]
    return MOCK_PLAYERS.some(pl => pl.id === embeddedId) ? embeddedId : null
  }

  // territoryId → { isMajor, placedByPlayerId, name }
  const cityMap = new Map<string, { isMajor: boolean; placedByPlayerId: string | null; name: string }>()
  for (const sticker of (legacy?.stickers ?? [])) {
    if (sticker.placement !== 'territory') continue
    if (!sticker.description.startsWith('city:')) continue
    if (destroyedCityIds.has(sticker.id)) continue
    cityMap.set(sticker.targetId, {
      isMajor: sticker.description === 'city:major',
      placedByPlayerId: resolvePlacedByPlayer(sticker),
      name: sticker.name,
    })
  }

  // Fortified territories (city fortification stickers with charges remaining)
  const fortifiedIds = new Set(
    (legacy?.stickers ?? [])
      .filter(s =>
        s.description.startsWith('fortification:') &&
        parseInt(s.description.split(':')[1] ?? '0', 10) > 0,
      )
      .map(s => s.targetId),
  )

  // Block any city territory the current player did not place (unknown → blocked)
  const cityBlockedIds = new Set<string>()
  for (const [tid, city] of cityMap.entries()) {
    if (city.placedByPlayerId !== currentPlayer.id) {
      cityBlockedIds.add(tid)
    }
  }


  // Scar map: territoryId → scar types
  const scarMap = new Map<string, string[]>()
  for (const scar of (legacy?.scars ?? [])) {
    const existing = scarMap.get(scar.territoryId) ?? []
    scarMap.set(scar.territoryId, [...existing, scar.type])
  }

  const playerFactionColor = FACTION_COLORS[currentPlayer.factionId as keyof typeof FACTION_COLORS] ?? 0x888888
  const falloutZoneId = legacy?.falloutZoneTerritoryId ?? null

  const viewBox = `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`

  function isBlocked(id: string) {
    // Placement is free EXCEPT: taken HQ spots, territories adjacent to a
    // placed HQ, cities named by another faction, and the Fallout Zone
    return takenIds.has(id) || adjacentToPlaced.has(id) || cityBlockedIds.has(id) || id === falloutZoneId
  }

  function handleTerritoryClick(id: string) {
    if (isBlocked(id)) return
    setSelectedId(prev => (prev === id ? null : id))
  }

  function handleConfirm() {
    if (!selectedId) return
    onConfirm(selectedId)
    setSelectedId(null)
    setHoveredId(null)
  }

  const selectedDef = selectedId ? TERRITORY_DEFINITIONS.find(d => d.id === selectedId) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>
      {/* Map container */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(200,148,10,0.25)' }}>
        {/* Background map image */}
        <img
          src="/Risk_board.svg.png"
          alt="Risk board"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center', filter: 'grayscale(60%) brightness(0.55)', pointerEvents: 'none' }}
        />

        {/* SVG interaction overlay */}
        <svg
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          {TERRITORY_DEFINITIONS.map(def => {
            const poly = def.polygon as number[][]
            const pts = poly.map(([x, y]) => `${x},${y}`).join(' ')
            const blocked = isBlocked(def.id)
            const cityBlocked = cityBlockedIds.has(def.id)
            const isSelected = selectedId === def.id
            const isHovered = hoveredId === def.id && !blocked
            const city = cityMap.get(def.id)
            const scars = scarMap.get(def.id) ?? []

            // Color logic
            let fillColor = 'rgba(0,0,0,0)'
            let strokeColor = 'rgba(255,255,255,0.08)'
            let strokeW = 0.5

            const isFallout = def.id === falloutZoneId
            const placed = placedHQs.find(h => h.territoryId === def.id)
            if (placed) {
              const fc = FACTION_COLORS[placed.factionId as keyof typeof FACTION_COLORS] ?? 0x888888
              fillColor = hexToRgba(fc, 0.35)
              strokeColor = hexToRgba(fc, 0.70)
              strokeW = 1.5
            } else if (isFallout) {
              fillColor = 'rgba(241,196,15,0.20)'
              strokeColor = 'rgba(241,196,15,0.75)'
              strokeW = 1.5
            } else if (cityBlocked) {
              fillColor = 'rgba(180,30,30,0.25)'
              strokeColor = 'rgba(220,50,50,0.55)'
              strokeW = 1
            } else if (isSelected) {
              fillColor = hexToRgba(playerFactionColor, 0.55)
              strokeColor = hexToRgba(playerFactionColor, 0.95)
              strokeW = 2
            } else if (isHovered) {
              fillColor = 'rgba(80,200,80,0.35)'
              strokeColor = 'rgba(80,220,80,0.85)'
              strokeW = 1.5
            } else if (!blocked) {
              const cc = CONTINENT_COLORS[def.continentId as keyof typeof CONTINENT_COLORS] ?? 0x888888
              fillColor = hexToRgba(cc, 0.10)
              strokeColor = hexToRgba(cc, 0.25)
              strokeW = 0.8
            }

            // Center point for icons
            const cx = def.labelX
            const cy = def.labelY

            // Label position: stack name, city icon row, scar icon row
            const showLabel = isHovered || isSelected || !!placed || cityBlocked

            return (
              <g key={def.id}>
                <polygon
                  points={pts}
                  fill={fillColor}
                  stroke={strokeColor}
                  strokeWidth={strokeW}
                  style={{ cursor: blocked ? 'default' : 'pointer', transition: 'fill 0.12s, stroke 0.12s' }}
                  onMouseEnter={() => !blocked && setHoveredId(def.id)}
                  onMouseLeave={() => setHoveredId(prev => (prev === def.id ? null : prev))}
                  onClick={() => handleTerritoryClick(def.id)}
                />

                {/* Fallout Zone — radiation symbol (destroyed ground, cannot start here) */}
                {isFallout && (
                  <text
                    x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
                    fontSize="16" style={{ pointerEvents: 'none' }}
                  >☢</text>
                )}

                {/* Fortification ring — around the city icon position */}
                {fortifiedIds.has(def.id) && (
                  <circle
                    cx={cx} cy={cy - (scars.length > 0 ? 10 : 6)} r={8}
                    fill="none"
                    stroke="rgba(74,154,223,0.90)"
                    strokeWidth="1.5"
                    strokeDasharray="3 2"
                    style={{ pointerEvents: 'none' }}
                  />
                )}

                {/* City dot — always visible when a city is present */}
                {city && (
                  <text
                    x={cx} y={cy - (scars.length > 0 ? 10 : 6)}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize={city.isMajor ? '11' : '9'}
                    fill={cityBlocked ? 'rgba(255,120,120,0.90)' : (city.placedByPlayerId === currentPlayer.id ? 'rgba(80,220,80,0.95)' : 'rgba(255,220,80,0.90)')}
                    stroke="rgba(0,0,0,0.80)" strokeWidth="2" paintOrder="stroke"
                    style={{ pointerEvents: 'none' }}
                  >
                    {city.isMajor ? '🏛' : '🏙'}
                  </text>
                )}

                {/* Scar icons — always visible; Ammo Shortage renders as the board's bullet glyph */}
                {scars.length > 0 && (() => {
                  const sy = cy + (city ? 4 : -2)
                  const hasAmmo = scars.includes('wasteland')
                  const others = scars
                    .filter(t => t !== 'wasteland')
                    .map(t => SCAR_META.find(m => m.type === t)?.icon ?? '')
                    .filter(Boolean)
                  return (
                    <>
                      {hasAmmo && <BulletIcon cx={cx - (others.length > 0 ? 7 : 0)} cy={sy} scale={0.75} />}
                      {others.length > 0 && (
                        <text
                          x={cx + (hasAmmo ? 7 : 0)} y={sy}
                          textAnchor="middle" dominantBaseline="central"
                          fontSize="8"
                          fill="rgba(255,255,255,0.85)"
                          stroke="rgba(0,0,0,0.80)" strokeWidth="1.5" paintOrder="stroke"
                          style={{ pointerEvents: 'none' }}
                        >
                          {others.join('')}
                        </text>
                      )}
                    </>
                  )
                })()}

                {/* Name label — city name takes precedence over the territory name */}
                {showLabel && (
                  <text
                    x={cx} y={cy + (city || scars.length > 0 ? 13 : 0)}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize="9" fontFamily="Georgia, serif" fontWeight="bold"
                    fill={cityBlocked ? 'rgba(255,160,160,0.95)' : 'white'}
                    stroke="rgba(0,0,0,0.85)" strokeWidth="2.5" paintOrder="stroke"
                    style={{ pointerEvents: 'none' }}
                  >
                    {city?.name ?? def.name}
                  </text>
                )}

                {/* "Blocked — enemy city" label */}
                {cityBlocked && (
                  <text
                    x={cx} y={cy + 22}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize="7" fontFamily="Georgia, serif"
                    fill="rgba(255,100,100,0.80)"
                    stroke="rgba(0,0,0,0.75)" strokeWidth="1.8" paintOrder="stroke"
                    style={{ pointerEvents: 'none' }}
                  >
                    enemy city
                  </text>
                )}

                {/* Crown icon for placed HQs */}
                {placed && (
                  <>
                    <text
                      x={cx} y={cy - 11}
                      textAnchor="middle" dominantBaseline="central"
                      fontSize="12"
                      fill={hexToRgba(FACTION_COLORS[placed.factionId as keyof typeof FACTION_COLORS] ?? 0x888888, 1)}
                      stroke="rgba(0,0,0,0.70)" strokeWidth="0.7" paintOrder="stroke"
                      style={{ pointerEvents: 'none' }}
                    >
                      ♛
                    </text>
                    <text
                      x={cx} y={cy + 8}
                      textAnchor="middle" dominantBaseline="central"
                      fontSize="7" fontFamily="Georgia, serif"
                      fill="rgba(255,255,255,0.75)"
                      stroke="rgba(0,0,0,0.80)" strokeWidth="2" paintOrder="stroke"
                      style={{ pointerEvents: 'none' }}
                    >
                      {placed.playerName}
                    </text>
                  </>
                )}

                {/* Selected territory: pending crown */}
                {isSelected && (
                  <text
                    x={cx} y={cy - 11}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize="12"
                    fill={hexToRgba(playerFactionColor, 0.9)}
                    stroke="rgba(0,0,0,0.65)" strokeWidth="0.7" paintOrder="stroke"
                    style={{ pointerEvents: 'none' }}
                  >
                    ♛
                  </text>
                )}
              </g>
            )
          })}
        </svg>

        {/* Legend overlay */}
        <div style={{
          position: 'absolute', top: 8, right: 8,
          background: 'rgba(5,3,0,0.82)', borderRadius: 7,
          border: '1px solid rgba(200,148,10,0.25)',
          padding: '6px 10px', fontSize: 10, color: '#9a8060',
          display: 'flex', flexDirection: 'column', gap: 4,
          pointerEvents: 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 12, height: 12, background: 'rgba(80,200,80,0.45)', border: '1.5px solid rgba(80,220,80,0.85)', borderRadius: 2 }} />
            <span>Valid territory</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 12, height: 12, background: hexToRgba(playerFactionColor, 0.55), border: `1.5px solid ${hexToRgba(playerFactionColor, 0.95)}`, borderRadius: 2 }} />
            <span>Selected — confirm</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 12, height: 12, background: 'rgba(180,30,30,0.25)', border: '1px solid rgba(220,50,50,0.55)', borderRadius: 2 }} />
            <span>Enemy city — blocked</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 12, height: 12, background: 'rgba(20,10,0,0.25)', border: '1px solid rgba(60,40,10,0.20)', borderRadius: 2 }} />
            <span>Blocked (adj/taken)</span>
          </div>
          {falloutZoneId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11 }}>☢</span>
              <span>Fallout Zone — blocked</span>
            </div>
          )}
          {cityMap.size > 0 && (
            <div style={{ borderTop: '1px solid rgba(200,148,10,0.15)', paddingTop: 4, marginTop: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'rgba(80,220,80,0.95)', fontSize: 11 }}>🏛</span>
                <span>Your city</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'rgba(255,120,120,0.90)', fontSize: 11 }}>🏙</span>
                <span>Enemy city</span>
              </div>
            </div>
          )}
          {fortifiedIds.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', border: '1.5px dashed rgba(74,154,223,0.90)', boxSizing: 'border-box' }} />
              <span>Fortified city</span>
            </div>
          )}
        </div>
      </div>

      {/* Confirm bar */}
      <div style={{ padding: '10px 0 0', display: 'flex', alignItems: 'center', gap: 12 }}>
        {selectedDef ? (
          <>
            <div style={{
              flex: 1, padding: '8px 14px', borderRadius: 7,
              background: hexToRgba(playerFactionColor, 0.10),
              border: `1.5px solid ${hexToRgba(playerFactionColor, 0.50)}`,
              fontSize: 13, color: '#E8DCC8',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 16 }}>♛</span>
              <span>
                <span style={{ color: hexToRgba(playerFactionColor, 1), fontWeight: 'bold' }}>
                  {(selectedId ? cityMap.get(selectedId)?.name : null) ?? selectedDef.name}
                </span>
                {selectedId && cityMap.has(selectedId) && (
                  <span style={{ fontSize: 10, color: '#9a8060', marginLeft: 6 }}>({selectedDef.name})</span>
                )}
                <span style={{ fontSize: 10, color: '#7a6040', marginLeft: 8 }}>selected — confirm to place HQ here</span>
              </span>
            </div>
            <button
              onClick={handleConfirm}
              style={{
                padding: '9px 22px', borderRadius: 7, fontSize: 13, fontWeight: 'bold',
                background: hexToRgba(playerFactionColor, 0.85),
                border: `2px solid ${hexToRgba(playerFactionColor, 1)}`,
                color: 'white', cursor: 'pointer', fontFamily: 'Georgia, serif',
                letterSpacing: 0.5,
                boxShadow: `0 0 12px ${hexToRgba(playerFactionColor, 0.45)}`,
              }}
            >
              Confirm HQ ♛
            </button>
          </>
        ) : (
          <div style={{
            flex: 1, padding: '8px 14px', borderRadius: 7,
            background: 'rgba(0,0,0,0.20)',
            border: '1px solid rgba(100,75,25,0.15)',
            fontSize: 12, color: '#4a3820', fontStyle: 'italic',
          }}>
            Click any highlighted territory to select your HQ location, then confirm
          </div>
        )}
      </div>
    </div>
  )
}
