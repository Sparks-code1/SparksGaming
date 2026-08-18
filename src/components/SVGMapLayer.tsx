import React, { useEffect, useRef, useState } from 'react'
import type { Territory } from '@/types/territory'
import type { Player } from '@/types/player'
import type { LegacyState } from '@/types/legacy'
import { TERRITORY_DEFINITIONS, MAP_WIDTH, MAP_HEIGHT, CONTINENT_BONUSES } from '@/data/territoryData'
import { FACTION_COLORS, NEUTRAL_COLOR } from '@/data/mockGameState'
import BulletIcon from './BulletIcon'

function getTerritoryFillHex(t: Territory, players: Player[]): number {
  if (t.occupyingPlayerId) {
    const player = players.find(p => p.id === t.occupyingPlayerId)
    if (player) return FACTION_COLORS[player.factionId] ?? NEUTRAL_COLOR
  }
  return NEUTRAL_COLOR
}

// ─── Fortification ring ───────────────────────────────────────────────────────

function FortificationRing({ cx, cy, r, segments = 10, attackCount = 0 }: { cx: number; cy: number; r: number; segments?: number; attackCount?: number }) {
  const step = 360 / segments
  const gap = 10  // degrees — butt linecap so gap is exactly this wide
  const segAngle = step - gap
  const arcs: React.ReactNode[] = []

  for (let i = 0; i < segments; i++) {
    const startDeg = i * step - 90
    const endDeg   = startDeg + segAngle
    const start = startDeg * Math.PI / 180
    const end   = endDeg   * Math.PI / 180
    const x1 = cx + r * Math.cos(start)
    const y1 = cy + r * Math.sin(start)
    const x2 = cx + r * Math.cos(end)
    const y2 = cy + r * Math.sin(end)
    const blacked = i < attackCount
    arcs.push(
      <path
        key={i}
        d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
        fill="none"
        stroke={blacked ? '#333' : '#2a6aaa'}
        strokeWidth="2.5"
        strokeLinecap="butt"
        opacity={blacked ? 0.55 : 0.90}
      />,
    )
  }

  return <>{arcs}</>
}

// ─── City chevrons (above the troop bubble) ───────────────────────────────────

function CityChevrons({ cx, cy, isMajor, name }: { cx: number; cy: number; isMajor: boolean; name?: string }) {
  // Chevron drawn as an SVG path: V-shape pointing up, 8px wide, 5px tall
  const w = 4, h = 4
  const chevron = (x: number, y: number) =>
    `M ${x - w} ${y + h} L ${x} ${y} L ${x + w} ${y + h}`
  return (
    <g className="city-drop" style={{ userSelect: 'none' }}>
      {/* Blue dot */}
      <circle cx={cx} cy={cy + 3} r={3} fill="#2980B9" stroke="rgba(0,0,0,0.55)" strokeWidth="0.8" />
      {/* Single chevron for minor, two stacked for major */}
      <path d={chevron(cx, cy - 6)} fill="none" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {isMajor && (
        <path d={chevron(cx, cy - 11)} fill="none" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {/* City name — small black label below the dot */}
      {name && (
        <text
          x={cx} y={cy + 13}
          textAnchor="middle"
          fontSize="5.5" fontFamily="Georgia, serif" fontWeight="bold"
          fill="#111"
          stroke="rgba(255,255,255,0.80)" strokeWidth="1.4" paintOrder="stroke"
        >
          {name}
        </text>
      )}
    </g>
  )
}

// ─── World Capital marker (3 gold chevrons) ──────────────────────────────────

function WorldCapitalChevrons({ cx, cy, name }: { cx: number; cy: number; name?: string }) {
  const w = 4, h = 4
  const chevron = (x: number, y: number) =>
    `M ${x - w} ${y + h} L ${x} ${y} L ${x + w} ${y + h}`
  return (
    <g className="city-drop" style={{ userSelect: 'none' }}>
      {/* Gold dot */}
      <circle cx={cx} cy={cy + 3} r={3} fill="#C8940A" stroke="rgba(0,0,0,0.6)" strokeWidth="0.8" />
      {/* Three stacked gold chevrons */}
      <path d={chevron(cx, cy - 6)}  fill="none" stroke="#C8940A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d={chevron(cx, cy - 11)} fill="none" stroke="#C8940A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d={chevron(cx, cy - 16)} fill="none" stroke="#C8940A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {name && (
        <text
          x={cx} y={cy + 13}
          textAnchor="middle"
          fontSize="5.5" fontFamily="Georgia, serif" fontWeight="bold"
          fill="#C8940A"
          stroke="rgba(0,0,0,0.80)" strokeWidth="1.4" paintOrder="stroke"
        >
          {name}
        </text>
      )}
    </g>
  )
}

// ─── Scar icon row (below the troop bubble) ───────────────────────────────────

const SCAR_ICON: Record<string, string> = {
  'bunker':     '🏰',
  'wasteland':     '💀',
  'biological':    '☣',
  'nuclear-fallout': '☢',
  'mercenary':     '🧍',
}

function ScarIcons({ cx, cy, scars }: { cx: number; cy: number; scars: Territory['scars'] }) {
  // Filter out fortification — its ring around the troop bubble is already the visual indicator
  const visibleScars = scars.filter(s => s.type !== 'fortification')
  if (visibleScars.length === 0) return null
  const iconSize = 8
  const spacing = 11
  const startX = cx - ((visibleScars.length - 1) * spacing) / 2
  return (
    <>
      {visibleScars.map((scar, i) => {
        const x = startX + i * spacing
        const isBunker = scar.type === 'bunker'
        const isAmmo = scar.type === 'wasteland'

        if (isAmmo) {
          // Golden bullet with red circle around it
          return <BulletIcon key={i} cx={x} cy={cy} />
        }

        const icon = SCAR_ICON[scar.type] ?? '?'
        const isBigIcon = scar.type === 'biological' || scar.type === 'mercenary'
        const size = isBunker ? 14 : isBigIcon ? 16 : iconSize
        return (
          <g key={i}>
            {isBunker && (
              <circle cx={x} cy={cy} r={9} fill="black" opacity="0.75" />
            )}
            <text
              x={x} y={cy}
              textAnchor="middle" dominantBaseline="central"
              fontSize={size}
              stroke="rgba(0,0,0,0.80)" strokeWidth="2.5" paintOrder="stroke"
              fill="white"
            >
              {icon}
            </text>
          </g>
        )
      })}
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

// Continent nameplate positions — placed in water/margin areas beside each continent
// x,y is the left edge of the nameplate; nameW = name area width, bonusW = bonus pill width
const CONTINENT_PLATES = [
  { id: 'north-america', x:   3, y: 215 },  // Pacific margin, left of NA
  { id: 'south-america', x: 102, y: 488 },  // Pacific margin, left of SA
  { id: 'europe',        x: 398, y:  63 },  // above Europe in Arctic margin
  { id: 'africa',        x: 352, y: 478 },  // Atlantic margin, left of Africa (lower)
  { id: 'asia',          x: 870, y: 265 },  // right side of Asia (Pacific margin)
  { id: 'australia',     x: 920, y: 592 },  // right side of Australia
]

interface Props {
  territories: Record<string, Territory>
  players: Player[]
  legacy?: Pick<LegacyState, 'namedContinents' | 'alienIsland' | 'ruinTerritoryIds' | 'falloutZoneTerritoryId' | 'stickers' | 'continentBonusModifiers' | 'customSeaLines' | 'worldCapitalTerritoryId' | 'roster'>
  /** Troops placed per territory during the current draft phase — drives the
   *  "+N" badges. Omitted outside the draft phase, which hides them. */
  draftPlaced?: Record<string, number>
  /** Placing player's faction color, as a CSS hex string. */
  draftColor?: string
}

export default function SVGMapLayer({ territories, players, legacy, draftPlaced, draftColor = '#C8940A' }: Props) {
  // ── Change detection for animations ─────────────────────────────────────
  // Troop count changes → bubble bounce + green/red flash
  // Ownership changes  → capture ripple in the new owner's color
  const prevRef = useRef<Record<string, { troops: number; owner: string | null }> | null>(null)
  const [flashes, setFlashes] = useState<Record<string, { dir: 'up' | 'down'; seq: number }>>({})
  const [ripples, setRipples] = useState<Array<{ key: string; x: number; y: number; color: string }>>([])

  useEffect(() => {
    const prev = prevRef.current
    const next: Record<string, { troops: number; owner: string | null }> = {}
    const newFlashes: Record<string, { dir: 'up' | 'down'; seq: number }> = {}
    const newRipples: Array<{ key: string; x: number; y: number; color: string }> = []

    for (const def of TERRITORY_DEFINITIONS) {
      const t = territories[def.id]
      if (!t) continue
      next[def.id] = { troops: t.troops, owner: t.occupyingPlayerId ?? null }
      const p = prev?.[def.id]
      if (!p) continue
      // Ownership changed → ripple spreading out from the territory
      if (t.occupyingPlayerId && t.occupyingPlayerId !== p.owner) {
        const hex = getTerritoryFillHex(t, players)
        newRipples.push({
          key: `${def.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          x: def.labelX, y: def.labelY,
          color: `#${hex.toString(16).padStart(6, '0')}`,
        })
      }
      // Troop count changed under the same owner → bounce + flash
      else if (t.occupyingPlayerId && t.troops !== p.troops) {
        newFlashes[def.id] = { dir: t.troops > p.troops ? 'up' : 'down', seq: Date.now() }
      }
    }
    prevRef.current = next

    if (Object.keys(newFlashes).length > 0) {
      setFlashes(f => ({ ...f, ...newFlashes }))
      const entries = Object.entries(newFlashes)
      setTimeout(() => setFlashes(f => {
        const c = { ...f }
        for (const [id, fl] of entries) if (c[id]?.seq === fl.seq) delete c[id]
        return c
      }), 900)
    }
    if (newRipples.length > 0) {
      setRipples(rs => [...rs, ...newRipples])
      const keys = new Set(newRipples.map(r => r.key))
      setTimeout(() => setRipples(rs => rs.filter(r => !keys.has(r.key))), 1700)
    }
  }, [territories, players])

  const namedContinents = legacy?.namedContinents ?? {}
  const bonusModifiers = legacy?.continentBonusModifiers ?? []
  const alienIsland = legacy?.alienIsland ?? null
  const ruinTerritoryIds = legacy?.ruinTerritoryIds ?? []
  const falloutZoneTerritoryId = legacy?.falloutZoneTerritoryId ?? null
  const customSeaLines = legacy?.customSeaLines ?? []
  const worldCapitalTerritoryId = legacy?.worldCapitalTerritoryId ?? null

  /**
   * Display name for whoever named a continent — they collect +1 troop for it,
   * and they may not be in this game, so the roster is the reliable source with
   * the current players as a fast path.
   */
  function namerName(playerId: string): string {
    return players.find(p => p.id === playerId)?.name
      ?? (legacy?.roster ?? []).find(m => m.id === playerId)?.name
      ?? playerId
  }

  return (
    <svg
      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 5,
      }}
    >
      {/* ── Ocean labels ─────────────────────────────────────────────────── */}
      {[
        { name: 'PACIFIC\nOCEAN',   x: 100,  y: 410 },
        { name: 'ATLANTIC\nOCEAN',  x: 340,  y: 270 },
        { name: 'INDIAN\nOCEAN',    x: 680,  y: 495 },
        { name: 'ARCTIC\nOCEAN',    x: 490,  y: 38  },
        { name: 'SOUTHERN\nOCEAN',  x: 530,  y: 635 },
        { name: 'PACIFIC\nOCEAN',   x: 878,  y: 390 },
      ].map(({ name, x, y }) =>
        name.split('\n').map((line, i) => (
          <text
            key={name + i + x}
            x={x} y={y + i * 14}
            textAnchor="middle"
            fontSize="11"
            fontFamily="Georgia, serif"
            fontWeight="bold"
            letterSpacing="1.5"
            fill="rgba(60,100,160,0.45)"
            style={{ userSelect: 'none' }}
          >
            {line}
          </text>
        ))
      )}

      {/* ── Campaign sea lines (Island Empire rewards) ───────────────────── */}
      {customSeaLines.map(([a, b], i) => {
        const da = TERRITORY_DEFINITIONS.find(d => d.id === a)
        const db = TERRITORY_DEFINITIONS.find(d => d.id === b)
        if (!da || !db) return null
        const midX = (da.labelX + db.labelX) / 2
        const midY = (da.labelY + db.labelY) / 2
        return (
          <g key={`sea-${i}`} style={{ userSelect: 'none' }}>
            <line x1={da.labelX} y1={da.labelY} x2={db.labelX} y2={db.labelY}
              stroke="rgba(80,200,255,0.55)" strokeWidth="2" strokeDasharray="7 5" strokeLinecap="round" />
            <text x={midX} y={midY} textAnchor="middle" dominantBaseline="central"
              fontSize="10" fill="rgba(120,215,255,0.90)"
              stroke="rgba(0,0,0,0.75)" strokeWidth="1.5" paintOrder="stroke">
              ⚓
            </text>
          </g>
        )
      })}

      {/* ── Continent nameplates ─────────────────────────────────────────── */}
      {CONTINENT_PLATES.map(({ id, x, y }) => {
        const entry = namedContinents[id]
        const baseBonus = CONTINENT_BONUSES[id as keyof typeof CONTINENT_BONUSES] ?? 0
        // Campaign modifiers (winner rewards, unlocks) change the effective bonus
        const modDelta = bonusModifiers
          .filter(m => m.continentId === id)
          .reduce((s, m) => s + m.bonusDelta, 0)
        const bonus = baseBonus + modDelta
        const isModified = modDelta !== 0
        const nameW = 82, bonusW = 26, h = 22, r = 3
        const totalW = nameW + bonusW
        return (
          <g key={id} style={{ userSelect: 'none' }}>
            {/* White name area */}
            <rect x={x} y={y} width={nameW} height={h} rx={r} ry={r}
              fill="white" stroke="rgba(0,0,0,0.18)" strokeWidth="0.8"
            />
            {/* Black bonus pill on the right — overlaps the join */}
            <rect x={x + nameW - r} y={y} width={bonusW + r} height={h} rx={r} ry={r}
              fill="#111" stroke="rgba(0,0,0,0.25)" strokeWidth="0.8"
            />
            {/* Divider line */}
            <line x1={x + nameW} y1={y + 3} x2={x + nameW} y2={y + h - 3}
              stroke="rgba(0,0,0,0.12)" strokeWidth="0.7"
            />
            {/* Custom name or blank underline */}
            {entry ? (
              <text x={x + nameW / 2} y={y + h / 2}
                textAnchor="middle" dominantBaseline="central"
                fontSize="9" fontFamily="Georgia, serif" fontWeight="bold"
                fill="#111"
              >{entry.customName}</text>
            ) : (
              <line
                x1={x + 8} y1={y + h / 2 + 2}
                x2={x + nameW - 8} y2={y + h / 2 + 2}
                stroke="rgba(0,0,0,0.20)" strokeWidth="0.8"
              />
            )}
            {/* Bonus value in white on black pill — gold when campaign-modified */}
            <text x={x + nameW + bonusW / 2 + r / 2} y={y + h / 2}
              textAnchor="middle" dominantBaseline="central"
              fontSize="9" fontFamily="Georgia, serif" fontWeight="bold"
              fill={isModified ? '#F1C40F' : 'white'}
            >+{bonus}{entry ? '★' : ''}</text>
            {/* Who named it, under the plate. The ★ on the pill means "someone
                gets +1 here"; this says who, so the extra troop is not a mystery
                at draft time. */}
            {entry && (
              <text x={x + totalW / 2} y={y + h + 7}
                textAnchor="middle" dominantBaseline="central"
                fontSize="7" fontFamily="Georgia, serif"
                fill="#F1C40F"
                stroke="rgba(0,0,0,0.85)" strokeWidth="1.4" paintOrder="stroke"
              >★ {namerName(entry.namedByPlayerId)}</text>
            )}
          </g>
        )
      })}

      {TERRITORY_DEFINITIONS.map(def => {
        const t = territories[def.id]
        if (!t) return null

        const fillHex = getTerritoryFillHex(t, players)
        const r = (fillHex >> 16) & 0xff
        const g = (fillHex >> 8) & 0xff
        const b = fillHex & 0xff
        const cx = def.labelX
        const cy = def.labelY


        const activeCities = t.cities.filter(c => !c.isDestroyed && !c.headquartersFactionId)
        const majorCity = activeCities.find(c => c.isMajor)
        const hasAnyCity = activeCities.length > 0

        const isOccupied = !!t.occupyingPlayerId
        const hasActiveHq = !!t.activeHqPlayerId
        const hasDestroyedHq = !!t.destroyedHqMarked
        const bubbleR = 11
        const scars = t.scars ?? []
        const hasScars = scars.length > 0
        const fortificationScar = scars.find(s => s.type === 'fortification')
        // City fortifications (win screen) are stickers with remaining charges: 'fortification:N'
        const fortSticker = (legacy?.stickers ?? []).find(
          s => s.targetId === def.id && s.description.startsWith('fortification:'),
        )
        const stickerCharges = fortSticker ? parseInt(fortSticker.description.split(':')[1] ?? '0', 10) : 0
        const isFortified = !!fortificationScar || stickerCharges > 0
        // Ring segments deplete as attacks land: scar tracks attackCount directly,
        // sticker tracks remaining charges out of 10
        const fortAttackCount = fortificationScar
          ? (fortificationScar.attackCount ?? 0)
          : (stickerCharges > 0 ? 10 - stickerCharges : 0)

        // Vertical layout (all centered on cx):
        //   crownY  — HQ crown (above everything)
        //   cityY   — city chevron (above bubble)
        //   cy      — troop bubble center
        //   scarY   — scar icon row (below bubble)
        // City markers sit higher when they carry a name label below the dot
        const cityY   = isOccupied ? cy - bubbleR - 14 : cy - 20
        const crownY  = hasAnyCity  ? cityY - 9        : (isOccupied ? cy - bubbleR - 5 : cy - 2)
        const scarY   = isOccupied  ? cy + bubbleR + 7  : cy + 9

        return (
          <g key={def.id}>

            {/* HQ crown — spins in with scale when placed */}
            {(hasActiveHq || hasDestroyedHq) && (
              <text
                className={hasActiveHq ? 'hq-spin-in' : undefined}
                x={cx} y={crownY}
                textAnchor="middle" dominantBaseline="auto"
                fontSize="13"
                fill={hasActiveHq ? '#FFD700' : '#884422'}
                stroke="rgba(0,0,0,0.65)" strokeWidth="0.6" paintOrder="stroke"
                opacity={hasDestroyedHq && !hasActiveHq ? 0.75 : 1}
              >
                ♛
              </text>
            )}

            {/* World Capital — 3 gold chevrons (takes precedence over a normal city) */}
            {def.id === worldCapitalTerritoryId && (
              <WorldCapitalChevrons cx={cx} cy={cityY} name="World Capital" />
            )}

            {/* City marker — above the troop bubble (suppressed under the World Capital) */}
            {hasAnyCity && def.id !== worldCapitalTerritoryId && (
              <CityChevrons
                key={`city-${activeCities.length}-${!!majorCity}`}
                cx={cx} cy={cityY}
                isMajor={!!majorCity}
                name={(majorCity ?? activeCities[0])?.name}
              />
            )}

            {/* Fortification ring — shown even without a troop bubble (unoccupied fortified cities) */}
            {isFortified && <FortificationRing cx={cx} cy={cy} r={bubbleR + 6} attackCount={fortAttackCount} />}

            {/* Troop bubble — bounces + flashes green/red when the count changes */}
            {isOccupied && (() => {
              const flash = flashes[def.id]
              return (
                <g
                  key={flash ? `tb-${flash.seq}` : 'tb'}
                  className={flash ? `troop-anim troop-anim-${flash.dir}` : undefined}
                >
                  <circle
                    className="troop-ring"
                    cx={cx} cy={cy} r={bubbleR}
                    fill={`rgba(${r},${g},${b},0.93)`}
                    stroke="rgba(0,0,0,0.60)"
                    strokeWidth="1.8"
                  />
                  <circle
                    cx={cx - 3} cy={cy - 3} r={3.5}
                    fill="rgba(255,255,255,0.25)"
                  />
                  <text
                    x={cx} y={cy}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize={t.troops > 9 ? '9' : '10'}
                    fontFamily="Georgia, serif" fontWeight="bold"
                    fill="white"
                    stroke="rgba(0,0,0,0.55)" strokeWidth="0.7" paintOrder="stroke"
                  >
                    {t.troops}
                  </text>
                </g>
              )
            })()}

            {/* Draft placement badge — running total placed here this draft
                phase. Sits to the RIGHT of the bubble; the vertical stack
                (crown / city / scars) is already spoken for. Keyed by the count
                so each increment remounts the node and replays the animation. */}
            {(draftPlaced?.[def.id] ?? 0) > 0 && (() => {
              const n = draftPlaced![def.id]
              const w = n > 9 ? 22 : 18
              // Anchor by the LEFT edge, not the centre — otherwise a wider
              // two-digit badge grows back over the troop bubble. The gap also
              // has to clear the fortification ring when one is drawn.
              const leftX = cx + bubbleR + (isFortified ? 9 : 5)
              const bx = leftX + w / 2
              const by = cy - 5
              return (
                <g key={`dp-${n}`} className="draft-badge" pointerEvents="none">
                  <rect
                    x={leftX} y={by - 7} width={w} height={14} rx={7}
                    fill={draftColor} fillOpacity={0.94}
                    stroke="rgba(0,0,0,0.65)" strokeWidth="1.2"
                  />
                  <text
                    x={bx} y={by}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize="9" fontFamily="Georgia, serif" fontWeight="bold"
                    fill="white" stroke="rgba(0,0,0,0.5)" strokeWidth="0.6" paintOrder="stroke"
                  >
                    +{n}
                  </text>
                </g>
              )
            })()}

            {/* Scar icons — below the troop bubble */}
            {hasScars && (
              <ScarIcons cx={cx} cy={scarY} scars={scars} />
            )}
          </g>
        )
      })}

      {/* ── Capture ripples — expanding rings from newly captured territories ── */}
      {ripples.map(rp => (
        <g key={rp.key} pointerEvents="none">
          <circle className="capture-ripple" cx={rp.x} cy={rp.y} r={10} fill="none" stroke={rp.color} strokeWidth="3" />
          <circle className="capture-ripple delay-1" cx={rp.x} cy={rp.y} r={10} fill="none" stroke={rp.color} strokeWidth="2.2" />
          <circle className="capture-ripple delay-2" cx={rp.x} cy={rp.y} r={10} fill="none" stroke={rp.color} strokeWidth="1.5" />
        </g>
      ))}

      {/* ── Fallout Zone (Nuclear Milestone) ─────────────────────────────── */}
      {falloutZoneTerritoryId && (() => {
        const def = TERRITORY_DEFINITIONS.find(d => d.id === falloutZoneTerritoryId)
        if (!def) return null
        const fx = def.labelX
        const fy = def.labelY
        // The giant logo covers the territory's normal troop bubble — re-draw
        // a high-contrast bubble on the ring's edge so troops stay readable
        const fzT = territories[falloutZoneTerritoryId]
        const fzOccupied = !!fzT?.occupyingPlayerId
        const fzHex = fzT ? getTerritoryFillHex(fzT, players) : NEUTRAL_COLOR
        const fr = (fzHex >> 16) & 0xff, fg = (fzHex >> 8) & 0xff, fb = fzHex & 0xff
        return (
          <g style={{ userSelect: 'none' }}>
            {/* Scorched backdrop */}
            <circle cx={fx} cy={fy} r={24} fill="rgba(10,8,0,0.80)" stroke="#F1C40F" strokeWidth="2" />
            <circle cx={fx} cy={fy} r={29} fill="none" stroke="rgba(241,196,15,0.45)" strokeWidth="1.5" strokeDasharray="5 4" />
            {/* Giant radiation logo */}
            <text x={fx} y={fy + 1} textAnchor="middle" dominantBaseline="central" fontSize="30">☢</text>
            <text
              x={fx} y={fy + 38}
              textAnchor="middle" dominantBaseline="central"
              fontSize="7.5" fontFamily="Georgia, serif" fontWeight="bold"
              fill="#F1C40F" stroke="rgba(0,0,0,0.85)" strokeWidth="2" paintOrder="stroke"
              letterSpacing="1"
            >
              FALLOUT ZONE
            </text>
            {/* Occupying troops — bold bubble on the top-right edge of the ring */}
            {fzOccupied && fzT && (
              <>
                <circle
                  cx={fx + 21} cy={fy - 19} r={10.5}
                  fill={`rgba(${fr},${fg},${fb},0.96)`}
                  stroke="white" strokeWidth="2"
                />
                <circle cx={fx + 18} cy={fy - 22} r={3.5} fill="rgba(255,255,255,0.25)" />
                <text
                  x={fx + 21} y={fy - 19}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={fzT.troops > 9 ? '10' : '11'}
                  fontFamily="Georgia, serif" fontWeight="bold"
                  fill="white"
                  stroke="rgba(0,0,0,0.70)" strokeWidth="0.8" paintOrder="stroke"
                >
                  {fzT.troops}
                </text>
              </>
            )}
          </g>
        )
      })()}

      {/* ── Ruins (Die Humans events) ────────────────────────────────────── */}
      {ruinTerritoryIds.map(tid => {
        const def = TERRITORY_DEFINITIONS.find(d => d.id === tid)
        if (!def) return null
        const rx = def.labelX
        const ry = def.labelY - 18
        return (
          <g key={`ruin-${tid}`} style={{ userSelect: 'none' }}>
            <circle cx={rx} cy={ry} r={9} fill="rgba(15,12,8,0.88)" stroke="#7a6040" strokeWidth="1.2" />
            <text x={rx} y={ry + 0.5} textAnchor="middle" dominantBaseline="central" fontSize="10">🏚</text>
            <text
              x={rx} y={ry - 13}
              textAnchor="middle" dominantBaseline="central"
              fontSize="6" fontFamily="Georgia, serif" fontWeight="bold"
              fill="#c0a060" stroke="rgba(0,0,0,0.85)" strokeWidth="1.5" paintOrder="stroke"
            >
              RUIN
            </text>
          </g>
        )
      })}

      {/* ── Alien Island ─────────────────────────────────────────────────── */}
      {alienIsland && (() => {
        const { x, y, connectedTerritoryIds } = alienIsland
        const islandT = territories['alien-island']
        const occupied = !!islandT?.occupyingPlayerId
        const ownerHex = islandT && occupied ? getTerritoryFillHex(islandT, players) : null
        const ownerColor = ownerHex !== null ? `#${ownerHex.toString(16).padStart(6, '0')}` : '#00ffcc'
        return (
          <g>
            {/* Sea lines to connected territories */}
            {connectedTerritoryIds.map(tid => {
              const def = TERRITORY_DEFINITIONS.find(d => d.id === tid)
              if (!def) return null
              return (
                <line
                  key={tid}
                  x1={x} y1={y} x2={def.labelX} y2={def.labelY}
                  stroke="#000000"
                  strokeWidth="3"
                  strokeDasharray="10 5"
                  opacity="0.85"
                />
              )
            })}
            {/* Island body — ring takes the occupying faction's color */}
            <circle cx={x} cy={y} r={16} fill="#001a14" stroke={ownerColor} strokeWidth="2" opacity="0.92" />
            <circle cx={x} cy={y} r={20} fill="none" stroke="#00c8a0" strokeWidth="1" strokeDasharray="4 3" opacity="0.5" />
            {/* UFO icon */}
            <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize="14" style={{ userSelect: 'none' }}>🛸</text>
            {/* Troop bubble when occupied */}
            {occupied && islandT && (
              <>
                <circle cx={x + 16} cy={y - 14} r={8} fill="black" opacity="0.8" stroke={ownerColor} strokeWidth="1.2" />
                <text
                  x={x + 16} y={y - 13.5}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize="9" fontFamily="Georgia, serif" fontWeight="bold"
                  fill="white"
                  style={{ userSelect: 'none' }}
                >
                  {islandT.troops}
                </text>
              </>
            )}
            {/* Label */}
            <text
              x={x} y={y + 26}
              textAnchor="middle" dominantBaseline="central"
              fontSize="7" fontFamily="Georgia, serif" fontWeight="bold"
              fill="#00ffcc"
              stroke="rgba(0,0,0,0.85)" strokeWidth="2" paintOrder="stroke"
              style={{ userSelect: 'none' }}
            >
              ALIEN ISLAND
            </text>
          </g>
        )
      })()}
    </svg>
  )
}
