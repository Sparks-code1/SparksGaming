import { useState } from 'react'
import type { Territory } from '@/types/territory'
import type { Player } from '@/types/player'
import { FACTION_COLORS } from '@/data/mockGameState'

interface Props {
  /** Player who completed the world-capital mission */
  completingPlayer: Player
  territories: Record<string, Territory>
  /**
   * Where the Capital may go: the territories of the 4+ coin cards that made
   * this player eligible. Normally one — the destination is decided by the card,
   * not chosen. Several only when more than one claimable face-up card was worth
   * 4+. Empty on a save from before this rule, which falls back to a free pick
   * among the player's own territories.
   */
  candidateTerritoryIds: string[]
  onPlace: (territoryId: string) => void
}

type Phase = 'announce' | 'place'

const GOLD = '#c8940a'
const DARK = '#0a0800'

function hexToRgb(hex: number) {
  return `rgb(${(hex >> 16) & 0xff},${(hex >> 8) & 0xff},${hex & 0xff})`
}

function CrownIcon({ size = 64, color = GOLD }: { size?: number; color?: string }) {
  const s = size
  return (
    <svg width={s} height={s} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      {/* Crown base */}
      <rect x="15" y="65" width="70" height="14" rx="3" fill={color} />
      {/* Crown body */}
      <polygon points="15,65 20,30 38,52 50,20 62,52 80,30 85,65" fill={color} />
      {/* Jewels on points */}
      <circle cx="20" cy="30" r="5" fill="#fff" opacity="0.9" />
      <circle cx="50" cy="20" r="5" fill="#fff" opacity="0.9" />
      <circle cx="80" cy="30" r="5" fill="#fff" opacity="0.9" />
      {/* Center gem */}
      <circle cx="50" cy="72" r="5" fill="#ff4444" opacity="0.9" />
    </svg>
  )
}

export default function WorldCapitalModal({ completingPlayer, territories, candidateTerritoryIds, onPlace }: Props) {
  const [phase, setPhase] = useState<Phase>('announce')

  const playerColor = hexToRgb(FACTION_COLORS[completingPlayer.factionId as keyof typeof FACTION_COLORS] ?? 0xaaaaaa)

  // The card decides the destination. Only a pre-rule save reaches the fallback,
  // which lets the player pick any territory they control as the old rule did.
  const candidates = candidateTerritoryIds.map(id => territories[id]).filter(Boolean)
  const fallback = candidates.length === 0
  const options = fallback
    ? Object.values(territories)
        .filter(t => t.occupyingPlayerId === completingPlayer.id)
        .sort((a, b) => a.name.localeCompare(b.name))
    : candidates

  // One candidate is the normal case — nothing to choose, so pre-select it.
  const [selectedId, setSelectedId] = useState<string | null>(
    options.length === 1 ? options[0].id : null)

  const containerStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 8000,
    background: 'rgba(6,4,0,0.92)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'Georgia, serif',
  }

  const cardStyle: React.CSSProperties = {
    background: `linear-gradient(160deg, #1a1200 0%, #0d0900 60%, #0a0600 100%)`,
    border: `2px solid ${GOLD}`,
    borderRadius: 20,
    padding: 40,
    maxWidth: 560,
    width: '90%',
    textAlign: 'center',
    boxShadow: `0 0 60px rgba(200,148,10,0.35), 0 0 20px rgba(200,148,10,0.2)`,
    color: '#fff',
  }

  if (phase === 'announce') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ marginBottom: 16 }}>
            <CrownIcon size={80} color={GOLD} />
          </div>
          <div style={{ fontSize: 11, letterSpacing: 4, color: GOLD, textTransform: 'uppercase', marginBottom: 8 }}>
            Milestone Unlocked
          </div>
          <h1 style={{ fontSize: 36, color: GOLD, margin: '0 0 12px', textShadow: `0 0 20px ${GOLD}` }}>
            World Capital
          </h1>
          <div style={{ fontSize: 15, color: '#c8b060', marginBottom: 20, lineHeight: 1.5 }}>
            <span style={{ color: playerColor, fontWeight: 'bold' }}>{completingPlayer.name}</span> has
            achieved the ultimate resource dominance — a territory of unparalleled wealth and power
            shall become the <em>World Capital</em>, the crown jewel of this campaign.
          </div>
          <div style={{
            background: 'rgba(200,148,10,0.1)', border: `1px solid rgba(200,148,10,0.3)`,
            borderRadius: 10, padding: '14px 18px', marginBottom: 24, textAlign: 'left',
          }}>
            <div style={{ fontSize: 12, color: GOLD, letterSpacing: 2, marginBottom: 8 }}>WORLD CAPITAL RULES</div>
            <ul style={{ margin: 0, padding: '0 0 0 18px', color: '#c8b888', fontSize: 13, lineHeight: 1.8 }}>
              <li>Placed on the territory of the <strong>4+ coin card</strong> that earned it — <strong>replacing any city there, minor or major</strong></li>
              <li>Adds <strong>+5 to population</strong> (for Join the Cause and similar effects)</li>
              <li>Counts as <strong>one city</strong> for missions that count cities</li>
              <li>Any player who conquers it must <strong>sacrifice 5 troops</strong> (permanently lost) before advancing</li>
              <li>Only <strong>one World Capital</strong> can ever exist in this campaign</li>
            </ul>
          </div>
          <button
            onClick={() => setPhase('place')}
            style={{
              background: `linear-gradient(135deg, ${GOLD}, #a06800)`,
              color: DARK, border: 'none', borderRadius: 10,
              padding: '12px 32px', fontSize: 16, fontWeight: 700,
              cursor: 'pointer', letterSpacing: 1,
            }}
          >
            Place the World Capital →
          </button>
        </div>
      </div>
    )
  }

  // phase === 'place'
  return (
    <div style={containerStyle}>
      <div style={{ ...cardStyle, maxWidth: 640, maxHeight: '85vh', overflowY: 'auto' }}>
        <CrownIcon size={48} color={GOLD} />
        <h2 style={{ color: GOLD, margin: '8px 0 4px' }}>
          {options.length === 1 ? 'The World Capital Rises' : 'Place the World Capital'}
        </h2>
        <p style={{ color: '#c8b060', fontSize: 14, margin: '0 0 16px' }}>
          {fallback ? (
            <>Choose a territory <span style={{ color: playerColor, fontWeight: 'bold' }}>{completingPlayer.name}</span> controls.
              Any city there is replaced.</>
          ) : options.length === 1 ? (
            <>The Capital goes to the territory of the 4+ coin card that earned it.
              Any city there is replaced.</>
          ) : (
            <>Several 4+ coin cards were within reach — choose which one&rsquo;s territory
              becomes the Capital. Any city there is replaced.</>
          )}
        </p>
        <div style={{
          display: 'grid', gridTemplateColumns: options.length === 1 ? '1fr' : '1fr 1fr', gap: 8,
          maxHeight: 340, overflowY: 'auto', marginBottom: 20,
        }}>
          {options.map(t => {
            const isSelected = selectedId === t.id
            const cities = t.cities.filter(c => !c.isDestroyed && !c.headquartersFactionId)
            const locked = options.length === 1
            return (
              <button
                key={t.id}
                onClick={() => !locked && setSelectedId(t.id)}
                style={{
                  background: isSelected ? `rgba(200,148,10,0.25)` : 'rgba(255,255,255,0.04)',
                  border: isSelected ? `2px solid ${GOLD}` : '1px solid rgba(200,148,10,0.2)',
                  borderRadius: 8, padding: '10px 12px', cursor: locked ? 'default' : 'pointer',
                  textAlign: 'left', color: '#fff', transition: 'all 0.15s',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, color: isSelected ? GOLD : '#e8d888' }}>
                  👑 {t.name}
                </div>
                <div style={{ fontSize: 11, color: cities.length > 0 ? '#c07050' : '#888', marginTop: 2 }}>
                  {cities.length > 0
                    ? `Replaces ${cities.map(c => c.isMajor ? `★ ${c.name}` : `● ${c.name}`).join(' · ')}`
                    : 'No cities'}
                </div>
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button
            onClick={() => setPhase('announce')}
            style={{
              background: 'transparent', color: '#888', border: '1px solid #444',
              borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontSize: 14,
            }}
          >
            ← Back
          </button>
          <button
            onClick={() => selectedId && onPlace(selectedId)}
            disabled={!selectedId}
            style={{
              background: selectedId ? `linear-gradient(135deg, ${GOLD}, #a06800)` : '#333',
              color: selectedId ? DARK : '#666', border: 'none', borderRadius: 8,
              padding: '10px 28px', fontSize: 15, fontWeight: 700,
              cursor: selectedId ? 'pointer' : 'default',
            }}
          >
            Confirm Placement
          </button>
        </div>
      </div>
    </div>
  )
}
