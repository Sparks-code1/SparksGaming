import { useState } from 'react'
import { TERRITORY_DEFINITIONS, MAP_WIDTH, MAP_HEIGHT } from '@/data/territoryData'
import { WEAKNESS_POWERS } from '@/data/weaknessPowers'

// Territories that have at least one sea-line in the base game (coastal)
const COASTAL_TERRITORY_IDS = new Set([
  'alaska', 'kamchatka', 'greenland', 'iceland', 'brazil', 'north-africa',
  'western-europe', 'east-africa', 'middle-east', 'southeast-asia', 'indonesia',
  'japan', 'mongolia', 'great-britain', 'scandinavia', 'new-guinea', 'western-australia',
])

interface AlienIslandResult {
  x: number
  y: number
  connectedTerritoryIds: [string, string]
}

interface Props {
  activeFactionId: string
  activeFactionName: string
  activeFactionColor: string
  onComplete: (island: AlienIslandResult) => void
}

type Step = 'announce' | 'collaborator' | 'island-place' | 'island-connect' | 'events-reveal' | 'weakness-preview'

export default function AlienMilestoneModal({ activeFactionId: _activeFactionId, activeFactionName, activeFactionColor, onComplete }: Props) {
  const [step, setStep] = useState<Step>('announce')
  const [islandPos, setIslandPos] = useState<{ x: number; y: number } | null>(null)
  const [conn1, setConn1] = useState<string | null>(null)
  const [conn2, setConn2] = useState<string | null>(null)
  const [hoveredMapPos, setHoveredMapPos] = useState<{ x: number; y: number } | null>(null)
  const [hovTerr, setHovTerr] = useState<string | null>(null)

  function handleMapClick(e: React.MouseEvent<SVGSVGElement>) {
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const scaleX = MAP_WIDTH / rect.width
    const scaleY = MAP_HEIGHT / rect.height
    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY
    setIslandPos({ x: Math.round(x), y: Math.round(y) })
  }

  function handleMapMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const scaleX = MAP_WIDTH / rect.width
    const scaleY = MAP_HEIGHT / rect.height
    setHoveredMapPos({
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    })
  }

  function selectTerritory(id: string) {
    if (conn1 === id) { setConn1(null); return }
    if (conn2 === id) { setConn2(null); return }
    if (!conn1) { setConn1(id); return }
    if (!conn2) { setConn2(id); return }
    // Both filled — replace conn1, shift conn2 to conn1
    setConn1(conn2); setConn2(id)
  }

  function canFinishIsland() {
    return islandPos !== null && conn1 !== null && conn2 !== null && conn1 !== conn2
  }

  function commitIsland() {
    if (!canFinishIsland()) return
    onComplete({
      x: islandPos!.x,
      y: islandPos!.y,
      connectedTerritoryIds: [conn1!, conn2!],
    })
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 4000,
      background: 'radial-gradient(ellipse at center, #000a1a 0%, #000000 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Georgia, serif',
    }}>
      <div style={{ width: step === 'island-place' || step === 'island-connect' ? 760 : 600, maxWidth: '96vw', color: '#E8DCC8', textAlign: 'center', padding: 16 }}>

        {step === 'announce' && <AnnounceStep onNext={() => setStep('collaborator')} />}

        {step === 'collaborator' && (
          <CollaboratorStep
            factionName={activeFactionName}
            factionColor={activeFactionColor}
            onNext={() => setStep('island-place')}
          />
        )}

        {step === 'island-place' && (
          <IslandPlaceStep
            islandPos={islandPos}
            hoveredMapPos={hoveredMapPos}
            conn1={conn1}
            conn2={conn2}
            onMapClick={handleMapClick}
            onMapMove={handleMapMove}
            onLeave={() => setHoveredMapPos(null)}
            onNext={() => setStep('island-connect')}
          />
        )}

        {step === 'island-connect' && (
          <IslandConnectStep
            islandPos={islandPos}
            conn1={conn1}
            conn2={conn2}
            hovTerr={hovTerr}
            onSelectTerritory={selectTerritory}
            onHoverTerritory={setHovTerr}
            canFinish={canFinishIsland()}
            onConfirm={commitIsland}
            onBack={() => setStep('island-place')}
          />
        )}

        {step === 'events-reveal' && (
          <EventsRevealStep onNext={() => setStep('weakness-preview')} />
        )}

        {step === 'weakness-preview' && (
          <WeaknessPreviewStep onDone={commitIsland} canDone={canFinishIsland()} />
        )}
      </div>
    </div>
  )
}

// ─── Step 1: Announce ─────────────────────────────────────────────────────────

function AnnounceStep({ onNext }: { onNext: () => void }) {
  return (
    <div>
      <div style={{
        fontSize: 11, letterSpacing: 5, color: '#00c8a0',
        textTransform: 'uppercase', marginBottom: 32,
        animation: 'pulse 2s ease-in-out infinite',
      }}>
        ⚠ Campaign Milestone
      </div>

      <div style={{
        fontSize: 56, fontWeight: 'bold',
        color: '#00ffcc',
        textShadow: '0 0 60px #00c8a088, 0 0 120px #00c8a044, 0 0 200px #00c8a022',
        margin: '0 0 20px', letterSpacing: 4, lineHeight: 1.1,
        textTransform: 'uppercase',
      }}>
        THE WAR PROGRESSES
      </div>

      <div style={{ width: 120, height: 2, background: '#00c8a055', margin: '0 auto 32px' }} />

      <div style={{
        fontSize: 22, fontStyle: 'italic', color: '#80e8d0',
        marginBottom: 48, letterSpacing: 1,
        textShadow: '0 0 30px #00c8a044',
      }}>
        They have been living among us.
      </div>

      <div style={{
        display: 'flex', justifyContent: 'center', gap: 32, marginBottom: 48, fontSize: 52,
        filter: 'drop-shadow(0 0 20px #00c8a066)',
      }}>
        <span>👽</span><span>🛸</span><span>👽</span>
      </div>

      <AlienBtn onClick={onNext} label="Reveal What Has Changed →" />
    </div>
  )
}

// ─── Step 2: Collaborator ─────────────────────────────────────────────────────

function CollaboratorStep({ factionName, factionColor, onNext }: {
  factionName: string; factionColor: string; onNext: () => void
}) {
  return (
    <div>
      <div style={{ fontSize: 11, letterSpacing: 4, color: '#00c8a0', textTransform: 'uppercase', marginBottom: 20 }}>
        Alien Invasion — New Faction Power
      </div>
      <div style={{ fontSize: 32, fontWeight: 'bold', color: '#00ffcc', marginBottom: 8, letterSpacing: 2 }}>
        Alien Collaborator
      </div>
      <div style={{ width: 60, height: 2, background: '#00c8a055', margin: '0 auto 28px' }} />

      <div style={{
        background: `${factionColor}18`, border: `2px solid ${factionColor}88`,
        borderRadius: 12, padding: '18px 24px', marginBottom: 24,
      }}>
        <div style={{ fontSize: 13, color: '#9a8060', marginBottom: 6 }}>Active faction</div>
        <div style={{ fontSize: 26, fontWeight: 'bold', color: factionColor }}>{factionName}</div>
        <div style={{ fontSize: 11, color: '#00c8a0', marginTop: 4 }}>
          has made a deal with the aliens.
        </div>
      </div>

      <div style={{
        background: '#c8a00018', border: '2px solid #c8a00055',
        borderRadius: 12, padding: '18px 24px', marginBottom: 24,
        textAlign: 'left',
      }}>
        <div style={{
          fontSize: 10, letterSpacing: 2, color: '#c8a000', fontWeight: 'bold',
          textTransform: 'uppercase', marginBottom: 14,
        }}>
          ⭐ Weakness Power (Yellow) — Permanent
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <WeaknessEffect
            icon="🪙"
            title="Alien Aid"
            desc="Add +1 to your resource total (coin) when turning in territory cards."
            positive
          />
          <WeaknessEffect
            icon="💀"
            title="Traitorous Expansion"
            desc="Lose 2 extra troops when expanding into empty cities."
            positive={false}
          />
        </div>
      </div>

      <AlienBtn onClick={onNext} label="Place the Alien Island →" />
    </div>
  )
}

function WeaknessEffect({ icon, title, desc, positive }: { icon: string; title: string; desc: string; positive: boolean }) {
  return (
    <div style={{
      display: 'flex', gap: 12, alignItems: 'flex-start',
      padding: '10px 12px', borderRadius: 8,
      background: positive ? 'rgba(0,200,160,0.08)' : 'rgba(220,50,50,0.08)',
      border: `1px solid ${positive ? 'rgba(0,200,160,0.25)' : 'rgba(220,50,50,0.25)'}`,
    }}>
      <span style={{ fontSize: 20, flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 12, fontWeight: 'bold', color: positive ? '#00c8a0' : '#e05050', marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 11, color: '#9a8060', lineHeight: 1.4 }}>{desc}</div>
      </div>
    </div>
  )
}

// ─── Step 3: Island placement ─────────────────────────────────────────────────

function IslandPlaceStep({ islandPos, hoveredMapPos, conn1, conn2, onMapClick, onMapMove, onLeave, onNext }: {
  islandPos: { x: number; y: number } | null
  hoveredMapPos: { x: number; y: number } | null
  conn1: string | null; conn2: string | null
  onMapClick: (e: React.MouseEvent<SVGSVGElement>) => void
  onMapMove: (e: React.MouseEvent<SVGSVGElement>) => void
  onLeave: () => void
  onNext: () => void
}) {
  const t1 = conn1 ? TERRITORY_DEFINITIONS.find(d => d.id === conn1) : null
  const t2 = conn2 ? TERRITORY_DEFINITIONS.find(d => d.id === conn2) : null

  return (
    <div>
      <div style={{ fontSize: 11, letterSpacing: 4, color: '#00c8a0', textTransform: 'uppercase', marginBottom: 12 }}>
        Alien Island — Placement
      </div>
      <div style={{ fontSize: 22, fontWeight: 'bold', color: '#00ffcc', marginBottom: 4 }}>
        Click to Place Alien Island
      </div>
      <div style={{ fontSize: 11, color: '#6a8060', marginBottom: 16 }}>
        Click anywhere in the ocean on the map to drop the island.
      </div>

      <div style={{ position: 'relative', width: '100%', borderRadius: 8, overflow: 'hidden', border: '1px solid #00c8a030', cursor: 'crosshair' }}>
        <img
          src="/Risk_board.svg.png" alt="map"
          style={{ display: 'block', width: '100%', filter: 'brightness(0.45) sepia(0.3) hue-rotate(160deg)' }}
          draggable={false}
        />
        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          onClick={onMapClick}
          onMouseMove={onMapMove}
          onMouseLeave={onLeave}
        >
          {/* Ghost island at cursor */}
          {hoveredMapPos && !islandPos && (
            <IslandIcon cx={hoveredMapPos.x} cy={hoveredMapPos.y} opacity={0.4} />
          )}
          {/* Placed island */}
          {islandPos && (
            <>
              {t1 && <line x1={islandPos.x} y1={islandPos.y} x2={t1.labelX} y2={t1.labelY} stroke="#000" strokeWidth="3" strokeDasharray="8 4" opacity="0.8" />}
              {t2 && <line x1={islandPos.x} y1={islandPos.y} x2={t2.labelX} y2={t2.labelY} stroke="#000" strokeWidth="3" strokeDasharray="8 4" opacity="0.8" />}
              <IslandIcon cx={islandPos.x} cy={islandPos.y} opacity={1} />
            </>
          )}
        </svg>
      </div>

      {islandPos && (
        <div style={{ marginTop: 12, fontSize: 11, color: '#00c8a0' }}>
          ✓ Island placed — next, connect it to 2 territories.
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <AlienBtn onClick={onNext} label="Connect Sea Lines →" disabled={!islandPos} />
      </div>
    </div>
  )
}

function IslandIcon({ cx, cy, opacity }: { cx: number; cy: number; opacity: number }) {
  return (
    <g opacity={opacity}>
      <circle cx={cx} cy={cy} r={14} fill="#001a18" stroke="#00ffcc" strokeWidth="2" />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize="14" fill="#00ffcc">🛸</text>
    </g>
  )
}

// ─── Step 4: Connect territories ──────────────────────────────────────────────

function IslandConnectStep({ islandPos, conn1, conn2, hovTerr, onSelectTerritory, onHoverTerritory, canFinish, onConfirm, onBack }: {
  islandPos: { x: number; y: number } | null
  conn1: string | null; conn2: string | null; hovTerr: string | null
  onSelectTerritory: (id: string) => void
  onHoverTerritory: (id: string | null) => void
  canFinish: boolean
  onConfirm: () => void
  onBack: () => void
}) {
  const sorted = [...TERRITORY_DEFINITIONS].sort((a, b) => {
    const aCoast = COASTAL_TERRITORY_IDS.has(a.id) ? 0 : 1
    const bCoast = COASTAL_TERRITORY_IDS.has(b.id) ? 0 : 1
    if (aCoast !== bCoast) return aCoast - bCoast
    return a.name.localeCompare(b.name)
  })

  return (
    <div>
      <div style={{ fontSize: 11, letterSpacing: 4, color: '#00c8a0', textTransform: 'uppercase', marginBottom: 12 }}>
        Alien Island — Sea Lines
      </div>
      <div style={{ fontSize: 20, fontWeight: 'bold', color: '#00ffcc', marginBottom: 4 }}>
        Connect 2 Territories
      </div>
      <div style={{ fontSize: 11, color: '#6a8060', marginBottom: 16 }}>
        Select exactly 2 territories to link to Alien Island via sea lines. Coastal territories recommended.
      </div>

      {/* Map preview */}
      <div style={{ position: 'relative', width: '100%', borderRadius: 8, overflow: 'hidden', border: '1px solid #00c8a030', marginBottom: 14 }}>
        <img src="/Risk_board.svg.png" alt="map" style={{ display: 'block', width: '100%', filter: 'brightness(0.45) sepia(0.3) hue-rotate(160deg)' }} draggable={false} />
        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          {islandPos && conn1 && (() => {
            const t = TERRITORY_DEFINITIONS.find(d => d.id === conn1)
            return t ? <line x1={islandPos.x} y1={islandPos.y} x2={t.labelX} y2={t.labelY} stroke="#000000" strokeWidth="3.5" strokeDasharray="8 4" opacity="0.9" /> : null
          })()}
          {islandPos && conn2 && (() => {
            const t = TERRITORY_DEFINITIONS.find(d => d.id === conn2)
            return t ? <line x1={islandPos.x} y1={islandPos.y} x2={t.labelX} y2={t.labelY} stroke="#000000" strokeWidth="3.5" strokeDasharray="8 4" opacity="0.9" /> : null
          })()}
          {islandPos && hovTerr && hovTerr !== conn1 && hovTerr !== conn2 && (() => {
            const t = TERRITORY_DEFINITIONS.find(d => d.id === hovTerr)
            return t ? <line x1={islandPos.x} y1={islandPos.y} x2={t.labelX} y2={t.labelY} stroke="#00c8a0" strokeWidth="2" strokeDasharray="6 4" opacity="0.5" /> : null
          })()}
          {islandPos && <IslandIcon cx={islandPos.x} cy={islandPos.y} opacity={1} />}
          {conn1 && (() => {
            const t = TERRITORY_DEFINITIONS.find(d => d.id === conn1)
            return t ? <circle cx={t.labelX} cy={t.labelY} r={7} fill="none" stroke="#00ffcc" strokeWidth="2" /> : null
          })()}
          {conn2 && (() => {
            const t = TERRITORY_DEFINITIONS.find(d => d.id === conn2)
            return t ? <circle cx={t.labelX} cy={t.labelY} r={7} fill="none" stroke="#00ffcc" strokeWidth="2" /> : null
          })()}
        </svg>
      </div>

      {/* Territory list */}
      <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 5, padding: '4px 0', marginBottom: 14 }}>
        {sorted.map(def => {
          const isConn1 = conn1 === def.id
          const isConn2 = conn2 === def.id
          const isSelected = isConn1 || isConn2
          const isCoastal = COASTAL_TERRITORY_IDS.has(def.id)
          return (
            <button
              key={def.id}
              onClick={() => onSelectTerritory(def.id)}
              onMouseEnter={() => onHoverTerritory(def.id)}
              onMouseLeave={() => onHoverTerritory(null)}
              style={{
                padding: '4px 8px', borderRadius: 5, fontSize: 10, fontFamily: 'Georgia, serif',
                border: isSelected ? '2px solid #00ffcc' : `1px solid ${isCoastal ? '#00c8a040' : 'rgba(200,148,10,0.15)'}`,
                background: isSelected ? '#00c8a020' : 'rgba(0,0,0,0.3)',
                color: isSelected ? '#00ffcc' : isCoastal ? '#80e8d0' : '#7a6a50',
                cursor: 'pointer',
              }}
            >
              {def.name}{isCoastal ? ' ⚓' : ''}
            </button>
          )
        })}
      </div>

      <div style={{ fontSize: 11, color: '#5a8060', marginBottom: 16 }}>
        {conn1 && conn2
          ? `✓ ${TERRITORY_DEFINITIONS.find(d => d.id === conn1)?.name} ↔ Alien Island ↔ ${TERRITORY_DEFINITIONS.find(d => d.id === conn2)?.name}`
          : conn1
          ? `1/2 — ${TERRITORY_DEFINITIONS.find(d => d.id === conn1)?.name} connected. Select one more.`
          : 'Select 2 territories (⚓ = coastal, recommended)'}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onBack} style={ghostBtn}>← Back</button>
        <button
          onClick={onConfirm}
          disabled={!canFinish}
          style={{ ...primaryAlienBtn, flex: 2, opacity: canFinish ? 1 : 0.4, cursor: canFinish ? 'pointer' : 'not-allowed' }}
        >
          Confirm & Continue →
        </button>
      </div>
    </div>
  )
}

// ─── Step 5: Events reveal ────────────────────────────────────────────────────

const EVENT_ENTRIES = [
  {
    count: 3, name: 'Die Humans', icon: '💀', color: '#e05050',
    desc: 'The Alien player may replace a minor city with a Ruin sticker. Remove all troops, demolish any HQ, destroy any fortification, and DESTROY this card. Ruins are not cities but may have new cities built on them.',
  },
  {
    count: 2, name: 'Beam Down', icon: '⚡', color: '#00c8a0',
    desc: 'The Aliens place 5 troops into any unoccupied city. The Aliens get this benefit regardless of population edge.',
  },
  {
    count: 2, name: 'Mysterious Island', icon: '🏝', color: '#c8940a',
    desc: 'The controller of Alien Island draws a face-up territory card from the sideboard immediately — even after a conquest draw, and can chain into another Mysterious Island.',
  },
]

const ALIEN_POWERS = [
  { color: '#e74c3c', label: '★ Star Power', name: 'Domination', desc: 'Controlling every city on the board earns you 2 Red Stars instantly.' },
  { color: '#2980b9', label: '↺ Comeback', name: 'Alien Reinforcements', desc: 'When recruiting, gain +2 troops if you control Alien Island and +1 troop for each Ruin you control.' },
  { color: '#27ae60', label: '⊕ Starting Power', name: 'Alien Form', desc: 'You do not lose troops when expanding into empty cities.' },
]

function EventsRevealStep({ onNext }: { onNext: () => void }) {
  return (
    <div style={{ textAlign: 'left' }}>
      <div style={{ fontSize: 11, letterSpacing: 4, color: '#00c8a0', textTransform: 'uppercase', marginBottom: 12, textAlign: 'center' }}>
        New Content Unlocked
      </div>
      <div style={{ fontSize: 26, fontWeight: 'bold', color: '#00ffcc', marginBottom: 20, textAlign: 'center' }}>
        Events &amp; Faction: Aliens
      </div>

      {/* New events */}
      <div style={{ fontSize: 10, letterSpacing: 2, color: '#6a8060', textTransform: 'uppercase', marginBottom: 8 }}>New Event Cards (×7)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        {EVENT_ENTRIES.map(e => (
          <div key={e.name} style={{
            display: 'flex', gap: 12, padding: '10px 12px', borderRadius: 8,
            background: `${e.color}10`, border: `1px solid ${e.color}35`,
          }}>
            <div style={{ flexShrink: 0 }}>
              <div style={{ fontSize: 20 }}>{e.icon}</div>
              <div style={{ fontSize: 9, color: e.color, textAlign: 'center', marginTop: 2 }}>×{e.count}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 'bold', color: e.color, marginBottom: 3 }}>{e.name}</div>
              <div style={{ fontSize: 10, color: '#8a7050', lineHeight: 1.4 }}>{e.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Aliens faction */}
      <div style={{ fontSize: 10, letterSpacing: 2, color: '#6a8060', textTransform: 'uppercase', marginBottom: 8 }}>New Faction Available</div>
      <div style={{
        padding: '14px 16px', borderRadius: 10,
        background: '#00c8a010', border: '2px solid #00c8a040',
        marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 28 }}>👽</span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 'bold', color: '#00ffcc' }}>Aliens</div>
            <div style={{ fontSize: 10, color: '#4a9070' }}>Can be selected in future games</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ALIEN_POWERS.map(p => (
            <div key={p.label} style={{
              display: 'flex', gap: 10, padding: '8px 10px', borderRadius: 6,
              background: `${p.color}10`, border: `1px solid ${p.color}30`,
            }}>
              <div style={{ fontSize: 9, color: p.color, fontWeight: 'bold', letterSpacing: 1, flexShrink: 0, width: 80 }}>{p.label}</div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 'bold', color: '#E8DCC8', marginBottom: 2 }}>{p.name}</div>
                <div style={{ fontSize: 10, color: '#7a6040', lineHeight: 1.4 }}>{p.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ textAlign: 'center' }}>
        <AlienBtn onClick={onNext} label="See Weakness Powers →" />
      </div>
    </div>
  )
}

// ─── Step 6: Weakness preview ─────────────────────────────────────────────────

function WeaknessPreviewStep({ onDone, canDone }: { onDone: () => void; canDone: boolean }) {
  return (
    <div style={{ textAlign: 'left' }}>
      <div style={{ fontSize: 11, letterSpacing: 4, color: '#c8a000', textTransform: 'uppercase', marginBottom: 12, textAlign: 'center' }}>
        Next Game — New Rule
      </div>
      <div style={{ fontSize: 24, fontWeight: 'bold', color: '#e8d000', marginBottom: 8, textAlign: 'center' }}>
        Weakness Powers
      </div>
      <div style={{ fontSize: 11, color: '#8a7040', marginBottom: 20, textAlign: 'center', lineHeight: 1.5 }}>
        In the next game, every faction (except the Alien Collaborator, Mutants, and Aliens)
        must choose one of the following weakness powers. 5 powers will be available to choose from.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {WEAKNESS_POWERS.map(wp => (
          <div key={wp.id} style={{
            display: 'flex', gap: 12, padding: '10px 12px', borderRadius: 8,
            background: `${wp.color}10`, border: `1px solid ${wp.color}35`,
          }}>
            <div style={{ width: 80, flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 'bold', color: wp.color }}>{wp.name}</div>
            </div>
            <div style={{ fontSize: 10, color: '#8a7050', lineHeight: 1.4 }}>{wp.description}</div>
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center' }}>
        <AlienBtn onClick={onDone} label="The Invasion Begins →" disabled={!canDone} />
      </div>
    </div>
  )
}

// ─── Shared styles ────────────────────────────────────────────────────────────

function AlienBtn({ onClick, label, disabled }: { onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '13px 32px', borderRadius: 8, fontSize: 13, fontWeight: 'bold',
        border: '2px solid #00c8a088',
        background: disabled ? 'rgba(0,30,25,0.5)' : '#00c8a018',
        color: disabled ? '#2a5040' : '#00ffcc',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'Georgia, serif', letterSpacing: 1, width: '100%',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  )
}

const primaryAlienBtn: React.CSSProperties = {
  padding: '12px 24px', borderRadius: 8, fontSize: 13, fontWeight: 'bold',
  border: '2px solid #00c8a088', background: '#00c8a018',
  color: '#00ffcc', fontFamily: 'Georgia, serif', letterSpacing: 1,
}

const ghostBtn: React.CSSProperties = {
  flex: 1, padding: '12px', borderRadius: 8, fontSize: 12,
  border: '1px solid rgba(0,200,160,0.20)', background: 'transparent',
  color: '#3a7060', cursor: 'pointer', fontFamily: 'Georgia, serif',
}
