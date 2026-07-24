import { useState } from 'react'
import type { LegacyState } from '@/types/legacy'
import type { Territory } from '@/types/territory'
import type { Player } from '@/types/player'
import { FACTION_COLORS } from '@/data/mockGameState'

interface Props {
  legacy: LegacyState
  players: Player[]
  territories: Record<string, Territory>
  onStartGame: (hqs: Record<string, string>) => void
}

function factionRgb(factionId: string): string {
  const hex = FACTION_COLORS[factionId] ?? 0x888888
  return `rgb(${(hex >> 16) & 0xff},${(hex >> 8) & 0xff},${hex & 0xff})`
}

export default function HQPlacementScreen({ legacy, players, territories, onStartGame }: Props) {
  const gameNumber = legacy.currentGameNumber
  // Map playerId → chosen territoryId
  const [placements, setPlacements] = useState<Record<string, string>>({})
  // Index of the player currently placing
  const [currentIdx, setCurrentIdx] = useState(0)

  const activePlayers = players.filter(p => !p.isEliminated)
  const currentPlayer = activePlayers[currentIdx] ?? null
  const allPlaced = activePlayers.every(p => placements[p.id] !== undefined)

  // Set of territories adjacent to any already-placed HQ
  const adjacentToPlacedHqs = new Set<string>()
  for (const placedId of Object.values(placements)) {
    const t = territories[placedId]
    if (t) t.adjacentIds.forEach(id => adjacentToPlacedHqs.add(id))
  }

  // Territories owned by the current player (wasteland scars and adjacency to existing HQs block placement)
  const eligibleTerritories = currentPlayer
    ? Object.values(territories).filter(
        t => t.occupyingPlayerId === currentPlayer.id
          && !t.scars.some(s => s.type === 'wasteland')
          && !Object.values(placements).includes(t.id)
          && !adjacentToPlacedHqs.has(t.id),
      )
    : []

  function handlePlace(territoryId: string) {
    if (!currentPlayer) return
    const next = { ...placements, [currentPlayer.id]: territoryId }
    setPlacements(next)
    if (currentIdx < activePlayers.length - 1) {
      setCurrentIdx(i => i + 1)
    }
  }

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: 'radial-gradient(ellipse at center, #1A0E04 0%, #080400 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Georgia, serif',
    }}>
      <div style={{
        background: 'linear-gradient(155deg, #1A0E02 0%, #0A0600 100%)',
        border: '2px solid rgba(200,148,10,0.60)',
        borderRadius: 14, padding: '32px 36px 28px',
        width: 580, maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto',
        color: '#E8DCC8',
        boxShadow: '0 16px 60px rgba(0,0,0,0.90)',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ fontSize: 24, fontWeight: 'bold', color: '#C8940A', letterSpacing: 1.5 }}>
            ♛ HQ PLACEMENT
          </div>
          <div style={{ fontSize: 12, color: '#7a6040', marginTop: 5 }}>
            Game #{gameNumber} · Each player places their HQ before the first turn
          </div>
          <div style={{ fontSize: 10, color: '#5a4020', marginTop: 3 }}>
            HQ grants +1 defender die · Capturing an enemy HQ destroys it permanently
          </div>
        </div>

        {/* Placement progress — all players */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          {activePlayers.map((player, idx) => {
            const color = factionRgb(player.factionId)
            const placed = placements[player.id]
            const placedName = placed ? (territories[placed]?.name ?? placed) : null
            const isActive = idx === currentIdx && !allPlaced
            const isDone = placed !== undefined

            return (
              <div key={player.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', borderRadius: 8,
                background: isActive ? 'rgba(200,148,10,0.08)' : isDone ? 'rgba(39,174,96,0.06)' : 'rgba(0,0,0,0.25)',
                border: `1px solid ${isActive ? 'rgba(200,148,10,0.55)' : isDone ? 'rgba(39,174,96,0.40)' : 'rgba(100,75,25,0.20)'}`,
                transition: 'all 0.2s',
              }}>
                {/* Player color dot */}
                <div style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: color,
                  boxShadow: isActive ? `0 0 8px ${color}` : 'none',
                  flexShrink: 0,
                }} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: isActive ? 'bold' : 'normal', color: isActive ? '#E8DCC8' : '#9a8060' }}>
                    {player.name}
                  </span>
                  {isActive && <span style={{ fontSize: 10, color: '#C8940A', marginLeft: 8 }}>← placing now</span>}
                </div>
                <div style={{ fontSize: 12 }}>
                  {isDone ? (
                    <span style={{ color: '#27AE60' }}>♛ {placedName}</span>
                  ) : isActive ? (
                    <span style={{ color: '#6a5030', fontStyle: 'italic' }}>choose a territory…</span>
                  ) : (
                    <span style={{ color: '#3a2810' }}>waiting</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Territory selection for current player */}
        {!allPlaced && currentPlayer && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 10, color: '#6a5030', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10, borderBottom: '1px solid rgba(200,148,10,0.15)', paddingBottom: 5 }}>
              {currentPlayer.name} — Select HQ Location
            </div>
            {eligibleTerritories.length === 0 ? (
              <div style={{ fontSize: 12, color: '#5a3020', fontStyle: 'italic', padding: '8px 0' }}>
                No eligible territories (all owned territories have Wasteland scars or are taken).
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {eligibleTerritories
                  .sort((a, b) => a.continentId.localeCompare(b.continentId) || a.name.localeCompare(b.name))
                  .map(t => (
                    <button
                      key={t.id}
                      onClick={() => handlePlace(t.id)}
                      style={{
                        padding: '6px 13px', borderRadius: 6, fontSize: 11,
                        border: `1px solid ${factionRgb(currentPlayer.factionId)}60`,
                        background: `${factionRgb(currentPlayer.factionId)}12`,
                        color: '#C8940A', cursor: 'pointer', fontFamily: 'Georgia, serif',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => {
                        const el = e.currentTarget
                        el.style.background = `${factionRgb(currentPlayer.factionId)}28`
                        el.style.borderColor = `${factionRgb(currentPlayer.factionId)}BB`
                      }}
                      onMouseLeave={e => {
                        const el = e.currentTarget
                        el.style.background = `${factionRgb(currentPlayer.factionId)}12`
                        el.style.borderColor = `${factionRgb(currentPlayer.factionId)}60`
                      }}
                    >
                      ♛ {t.name}
                      {t.scars.length > 0 && <span style={{ fontSize: 9, color: '#6a5030', marginLeft: 5 }}>
                        ({t.scars.map(s => s.type).join(', ')})
                      </span>}
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Summary of destroyed HQs from past games */}
        {(legacy.destroyedHqs ?? []).length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, color: '#5a4020', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8, borderBottom: '1px solid rgba(200,148,10,0.15)', paddingBottom: 5 }}>
              Destroyed HQ Marks (Permanent)
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {(legacy.destroyedHqs ?? []).map((hq, i) => (
                <span key={i} style={{
                  fontSize: 10, padding: '2px 9px', borderRadius: 8,
                  background: 'rgba(180,50,30,0.12)', border: '1px solid rgba(180,50,30,0.35)',
                  color: '#c06050',
                }}>
                  ☠ {territories[hq.territoryId]?.name ?? hq.territoryId}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Start button — only enabled when all players placed */}
        <button
          onClick={() => onStartGame(placements)}
          disabled={!allPlaced}
          style={{
            width: '100%', padding: '14px',
            borderRadius: 8, fontSize: 15, fontWeight: 'bold', letterSpacing: 0.5,
            border: `2px solid ${allPlaced ? 'rgba(200,148,10,0.70)' : 'rgba(100,75,25,0.30)'}`,
            background: allPlaced ? 'rgba(200,148,10,0.18)' : 'rgba(50,35,10,0.20)',
            color: allPlaced ? '#E8DCC8' : '#5a4020',
            cursor: allPlaced ? 'pointer' : 'not-allowed',
            fontFamily: 'Georgia, serif',
            transition: 'all 0.2s',
          }}
        >
          {allPlaced ? `▶ Start Game #${gameNumber}` : `Waiting for ${activePlayers.length - currentIdx} more player${activePlayers.length - currentIdx !== 1 ? 's' : ''} to place…`}
        </button>
      </div>
    </div>
  )
}
