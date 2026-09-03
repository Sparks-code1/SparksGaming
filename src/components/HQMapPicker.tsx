import { useEffect, useState } from 'react'
import { TERRITORY_DEFINITIONS, MAP_WIDTH, MAP_HEIGHT, CONTINENT_COLORS } from '@/data/territoryData'
import { FACTION_COLORS, MOCK_PLAYERS } from '@/data/mockGameState'
import { victoryWinnerId } from '@/lib/roster'
import { SCAR_META } from '@/lib/legacyApi'
import BulletIcon from './BulletIcon'
import type { LegacyState } from '@/types/legacy'
import type { AIDifficulty } from '@/types/ai'
import { aiStartingTerritory } from '@/lib/ai'

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
  /**
   * Play this seat for the computer, at this difficulty.
   *
   * THE CHOICE BELONGS HERE, not in the screen above. blockInfo below is the
   * only thing that knows which territories an HQ may start on — cities,
   * scars, ruins, the Fallout Zone, the World Capital and the adjacency rule
   * — and its own comment is about having ONE decision read once. A caller
   * that worked out the legal set for itself would be a second copy of that,
   * and the copy that drifts is never the one you are looking at.
   *
   * So the picker hands the AI the list it has already ruled legal, and the
   * AI says which of them it wants. Null for a human, who says so by
   * clicking.
   */
  autoPick?: AIDifficulty | null
  onConfirm: (territoryId: string) => void
}

/**
 * How long the computer looks at the map, and then at its own choice.
 *
 * Not a fake think — the decision is instant. It is the time a human at the
 * table needs to see which ground each opponent took, on a screen that is
 * otherwise three placements in half a second.
 */
const AI_LOOK_MS = 550
const AI_PLACE_MS = 700

function hexToRgba(hex: number, a: number) {
  return `rgba(${(hex >> 16) & 0xff},${(hex >> 8) & 0xff},${hex & 0xff},${a})`
}

export default function HQMapPicker({ currentPlayer, placedHQs, legacy = null, autoPick = null, onConfirm }: Props) {
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

  // victoryLog fallback: game number → winner roster id. Prefers the recorded
  // id and only matches on the signed name for games played before rosters.
  const winnerPlayerByGame = new Map<number, string>()
  for (const v of (legacy?.victoryLog ?? [])) {
    const id = victoryWinnerId(legacy, v) ?? MOCK_PLAYERS.find(pl => pl.name === v.winnerName)?.id
    if (id) winnerPlayerByGame.set(v.gameNumber, id)
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

  /**
   * Major cities THIS player founded in an earlier game.
   *
   * These are the one exception to everything below: a founder may start on
   * their own major city even when it is scarred. City claims follow the
   * PLAYER, not the faction, so this still holds after switching faction.
   */
  const ownMajorCityIds = new Set<string>()
  for (const [tid, city] of cityMap.entries()) {
    if (city.isMajor && city.placedByPlayerId === currentPlayer.id) ownMajorCityIds.add(tid)
  }

  // Every city blocks EXCEPT your own major city — minor cities block even when
  // you founded them, and a major city someone else founded is theirs.
  const cityBlockedIds = new Set<string>()
  for (const tid of cityMap.keys()) {
    if (!ownMajorCityIds.has(tid)) cityBlockedIds.add(tid)
  }


  // Scar map: territoryId → scar types
  const scarMap = new Map<string, string[]>()
  for (const scar of (legacy?.scars ?? [])) {
    const existing = scarMap.get(scar.territoryId) ?? []
    scarMap.set(scar.territoryId, [...existing, scar.type])
  }

  const playerFactionColor = FACTION_COLORS[currentPlayer.factionId as keyof typeof FACTION_COLORS] ?? 0x888888
  const falloutZoneId = legacy?.falloutZoneTerritoryId ?? null
  const worldCapitalId = legacy?.worldCapitalTerritoryId ?? null

  /**
   * Territories razed by a Die Humans event — permanently destroyed ground.
   *
   * These were silently LEGAL to start on. A ruin's city sticker is recorded in
   * `destroyedCities`, so the city map skips it, and a ruin leaves no scar —
   * which meant a razed territory looked like ordinary open ground with nothing
   * on it at all. SE Asia has been startable ever since it was ruined in Game 5.
   */
  const ruinIds = new Set(legacy?.ruinTerritoryIds ?? [])

  const viewBox = `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`

  const scarLabel = (type: string) => SCAR_META.find(m => m.type === type)?.label ?? type

  /** Which rule refused a territory — drives the colour as well as the words. */
  type BlockKind = 'taken' | 'adjacent' | 'fallout' | 'ruin' | 'world-capital' | 'city' | 'scar'

  /**
   * Why an HQ may not start here, or null when it may.
   *
   * Order matters — the most specific reason is reported first. The single
   * source of truth for both the click guard and everything the map explains,
   * so a territory can never look blocked for one reason and refuse for another.
   *
   * The KIND is returned alongside the sentence because the fill colour used to
   * be decided by a second, separately-ordered chain of conditions. The two
   * disagreed: the World Capital had no colour of its own and fell through to
   * the scar branch, so Brazil — the World Capital, which also carries a
   * fortification scar — was painted "scarred" while its tooltip correctly said
   * "World Capital". One decision, read twice, cannot drift.
   */
  function blockInfo(id: string): { kind: BlockKind; message: string } | null {
    if (takenIds.has(id)) return { kind: 'taken', message: 'An HQ is already placed here' }
    if (adjacentToPlaced.has(id)) return { kind: 'adjacent', message: 'Adjacent to another HQ' }
    if (id === falloutZoneId) return { kind: 'fallout', message: 'The Fallout Zone is destroyed ground' }
    // A ruin is razed ground for the rest of the campaign — ranked with the
    // Fallout Zone, and ABOVE the founder exception below: whatever the city
    // there once was, it is gone and nobody starts on it again.
    if (ruinIds.has(id)) return { kind: 'ruin', message: 'Razed to a Ruin — nothing starts here again' }
    // The lead faction owns the World Capital at game start without an HQ on it.
    if (id === worldCapitalId) return { kind: 'world-capital', message: 'The World Capital is marked ground' }

    // Your own major city outranks the rules below — including the scar rule.
    if (ownMajorCityIds.has(id)) return null

    const city = cityMap.get(id)
    if (city) {
      return {
        kind: 'city',
        message: city.isMajor
          ? `${city.name} was founded by another player`
          : `${city.name} is a minor city — an HQ cannot start on one`,
      }
    }

    const scars = scarMap.get(id) ?? []
    if (scars.length > 0) {
      return { kind: 'scar', message: `Scarred ground — ${[...new Set(scars)].map(scarLabel).join(', ')}` }
    }
    return null
  }

  const isBlocked = (id: string) => blockInfo(id) !== null

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

  /**
   * The computer places its own HQ.
   *
   * IN TWO BEATS, ON PURPOSE — it selects, and then a moment later confirms.
   * Placing instantly would flicker three screens past a player who never sees
   * which ground their opponents took, and where the HQs are is the single most
   * useful thing to know at the start of a game. The map already draws the
   * selection and names it in the bar below, so the pause is the bot showing
   * its hand rather than dead time.
   *
   * KEYED ON THE SEAT, not on a clock. The effect re-runs when the picker moves
   * to the next player and at no other time; a `now` in here would fire it
   * again on every render and place an HQ per frame.
   */
  useEffect(() => {
    if (!autoPick) return
    const open = TERRITORY_DEFINITIONS.map(d => d.id).filter(id => !isBlocked(id))
    const want = aiStartingTerritory(open, autoPick)
    if (!want) return
    const show = setTimeout(() => setSelectedId(want), AI_LOOK_MS)
    const place = setTimeout(() => {
      onConfirm(want)
      setSelectedId(null)
      setHoveredId(null)
    }, AI_LOOK_MS + AI_PLACE_MS)
    return () => { clearTimeout(show); clearTimeout(place) }
    // The seat and the board it is choosing on. placedHQs changes exactly once
    // per placement, which is also when currentPlayer changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPick, currentPlayer.id, placedHQs.length])

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
            const info = blockInfo(def.id)
            const reason = info?.message ?? null
            const blocked = info !== null
            const isSelected = selectedId === def.id
            const isHovered = hoveredId === def.id && !blocked
            const city = cityMap.get(def.id)
            const scars = scarMap.get(def.id) ?? []
            // Every one of these now asks the SAME decision which rule applied,
            // rather than re-deriving it from the raw data and drifting.
            const cityBlocked = info?.kind === 'city'
            // Whether the city itself is off limits, regardless of which rule
            // got there first — this colours the city ICON, which describes the
            // city and not the reason the territory refuses a click.
            const isEnemyCity = cityBlockedIds.has(def.id)
            const scarBlocked = info?.kind === 'scar'
            const isFallout = info?.kind === 'fallout'
            const isRuin = info?.kind === 'ruin'
            const isWorldCapital = info?.kind === 'world-capital'
            // Your founded major city: allowed, and allowed DESPITE any scar.
            const ownMajor = ownMajorCityIds.has(def.id)

            // Color logic
            let fillColor = 'rgba(0,0,0,0)'
            let strokeColor = 'rgba(255,255,255,0.08)'
            let strokeW = 0.5

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
            } else if (isRuin) {
              // Its own dead grey-brown — it is neither a city nor a scar, and
              // reading as either would misdescribe why it refuses the click.
              fillColor = 'rgba(70,58,42,0.34)'
              strokeColor = 'rgba(140,116,80,0.70)'
              strokeW = 1.4
            } else if (isWorldCapital) {
              // The board's gold. It had no branch at all and inherited whatever
              // came next — scar-amber on a World Capital that happens to be
              // scarred, plain open ground on one that is not.
              fillColor = 'rgba(200,148,10,0.26)'
              strokeColor = 'rgba(200,148,10,0.80)'
              strokeW = 1.5
            } else if (cityBlocked) {
              fillColor = 'rgba(180,30,30,0.25)'
              strokeColor = 'rgba(220,50,50,0.55)'
              strokeW = 1
            } else if (scarBlocked) {
              fillColor = 'rgba(150,90,20,0.22)'
              strokeColor = 'rgba(210,140,40,0.50)'
              strokeW = 1
            } else if (isSelected) {
              fillColor = hexToRgba(playerFactionColor, 0.55)
              strokeColor = hexToRgba(playerFactionColor, 0.95)
              strokeW = 2
            } else if (isHovered) {
              fillColor = 'rgba(80,200,80,0.35)'
              strokeColor = 'rgba(80,220,80,0.85)'
              strokeW = 1.5
            } else if (ownMajor) {
              // Your ancestral seat — call it out rather than letting it blend
              // in with ordinary open ground.
              fillColor = 'rgba(80,200,80,0.18)'
              strokeColor = 'rgba(80,220,80,0.65)'
              strokeW = 1.2
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
            const showLabel = isHovered || isSelected || !!placed || cityBlocked || scarBlocked || ownMajor || isRuin || isWorldCapital

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
                >
                  {/* Native tooltip — says WHY a territory refuses the click. */}
                  <title>
                    {reason
                      ? `${def.name} — ${reason}`
                      : ownMajor
                        ? `${cityMap.get(def.id)?.name ?? def.name} — your major city; you may start here even though it is scarred`
                        : def.name}
                  </title>
                </polygon>

                {/* Fallout Zone — radiation symbol (destroyed ground, cannot start here) */}
                {isFallout && (
                  <text
                    x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
                    fontSize="16" style={{ pointerEvents: 'none' }}
                  >☢</text>
                )}

                {/* Ruin sticker — the same badge the board itself draws, so a
                    razed territory is recognisable from the setup screen. */}
                {isRuin && (
                  <>
                    <circle
                      cx={cx} cy={cy - 6} r={9}
                      fill="rgba(15,12,8,0.88)" stroke="#7a6040" strokeWidth="1.2"
                      style={{ pointerEvents: 'none' }}
                    />
                    <text
                      x={cx} y={cy - 5.5} textAnchor="middle" dominantBaseline="central"
                      fontSize="10" style={{ pointerEvents: 'none' }}
                    >🏚</text>
                    <text
                      x={cx} y={cy - 19}
                      textAnchor="middle" dominantBaseline="central"
                      fontSize="6" fontFamily="Georgia, serif" fontWeight="bold"
                      fill="#c0a060" stroke="rgba(0,0,0,0.85)" strokeWidth="1.5" paintOrder="stroke"
                      style={{ pointerEvents: 'none' }}
                    >
                      RUIN
                    </text>
                  </>
                )}

                {/* World Capital — the board's gold chevrons. It was the only
                    marked ground the setup map drew nothing for, so the reason
                    it refused a click was in the tooltip and nowhere else. */}
                {isWorldCapital && (() => {
                  const w = 3.2, h = 3.2
                  const chevron = (y: number) => `M ${cx - w} ${y + h} L ${cx} ${y} L ${cx + w} ${y + h}`
                  return (
                    <g style={{ pointerEvents: 'none' }}>
                      <circle cx={cx} cy={cy - 2} r={2.6} fill="#C8940A" stroke="rgba(0,0,0,0.6)" strokeWidth="0.8" />
                      <path d={chevron(cy - 9)}  fill="none" stroke="#C8940A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      <path d={chevron(cy - 13)} fill="none" stroke="#C8940A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      <path d={chevron(cy - 17)} fill="none" stroke="#C8940A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </g>
                  )
                })()}

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
                    fill={isEnemyCity ? 'rgba(255,120,120,0.90)' : (city.placedByPlayerId === currentPlayer.id ? 'rgba(80,220,80,0.95)' : 'rgba(255,220,80,0.90)')}
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
                    x={cx} y={cy + (city || scars.length > 0 || isRuin ? 13 : 0)}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize="9" fontFamily="Georgia, serif" fontWeight="bold"
                    fill={cityBlocked ? 'rgba(255,160,160,0.95)'
                      : isRuin ? 'rgba(214,186,140,0.95)'
                      : isWorldCapital ? 'rgba(230,186,80,0.95)'
                      : 'white'}
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
          {ownMajorCityIds.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 12, height: 12, background: 'rgba(80,200,80,0.18)', border: '1.2px solid rgba(80,220,80,0.65)', borderRadius: 2 }} />
              <span>Your major city — allowed</span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 12, height: 12, background: 'rgba(180,30,30,0.25)', border: '1px solid rgba(220,50,50,0.55)', borderRadius: 2 }} />
            <span>City — blocked</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 12, height: 12, background: 'rgba(150,90,20,0.22)', border: '1px solid rgba(210,140,40,0.50)', borderRadius: 2 }} />
            <span>Scarred — blocked</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 12, height: 12, background: 'rgba(20,10,0,0.25)', border: '1px solid rgba(60,40,10,0.20)', borderRadius: 2 }} />
            <span>Blocked (adj/taken)</span>
          </div>
          {ruinIds.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11 }}>🏚</span>
              <span>Ruin — blocked</span>
            </div>
          )}
          {worldCapitalId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 12, height: 12, background: 'rgba(200,148,10,0.26)', border: '1.5px solid rgba(200,148,10,0.80)', borderRadius: 2 }} />
              <span>World Capital — blocked</span>
            </div>
          )}
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
                <span>Your major city</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'rgba(255,120,120,0.90)', fontSize: 11 }}>🏙</span>
                <span>Minor / enemy city</span>
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
                {selectedId && ownMajorCityIds.has(selectedId) && (
                  <span style={{ fontSize: 10, color: 'rgba(80,220,80,0.85)', marginLeft: 8 }}>
                    · your major city{(scarMap.get(selectedId)?.length ?? 0) > 0 ? ' — scars ignored' : ''}
                  </span>
                )}
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
