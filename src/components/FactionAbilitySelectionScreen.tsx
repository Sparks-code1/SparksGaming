import { useState } from 'react'
import type { Player } from '@/types/player'
import type { FactionId } from '@/types/faction'
import { FACTION_ABILITY_OPTIONS, getAbilitiesForFaction } from '@/data/factionAbilities'
import { FACTION_COLORS } from '@/data/mockGameState'

interface Props {
  players: Player[]
  onConfirm: (choices: Record<string, string>) => void  // factionId → abilityId
}

const PHASE_LABEL: Record<string, string> = {
  combat: '⚔ Combat',
  draft: '⊕ Draft',
  fortify: '⟳ Fortify',
  any: '★ Any Phase',
}

function factionRgb(factionId: string): string {
  const hex = FACTION_COLORS[factionId] ?? 0x888888
  return `rgb(${(hex >> 16) & 0xff},${(hex >> 8) & 0xff},${hex & 0xff})`
}

const FACTION_NAMES: Record<string, string> = {
  'enclave-of-the-bear': 'Enclave of the Bear',
  'imperial-balkania': 'Imperial Balkania',
  'khan-industries': 'Khan Industries',
  'saharan-republic': 'Saharan Republic',
  'die-mechaniker': 'Die Mechaniker',
}

export default function FactionAbilitySelectionScreen({ players, onConfirm }: Props) {
  // Track chosen ability per factionId
  const [choices, setChoices] = useState<Record<string, string>>({})
  // Which player is currently choosing (index into players)
  const [currentIdx, setCurrentIdx] = useState(0)

  const activePlayers = players.filter(p => !p.isEliminated)
  const currentPlayer = activePlayers[currentIdx] ?? null
  const allChosen = activePlayers.every(p => choices[p.factionId] !== undefined)

  function handleChoose(factionId: FactionId, abilityId: string) {
    const next = { ...choices, [factionId]: abilityId }
    setChoices(next)
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
        width: 640, maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto',
        color: '#E8DCC8',
        boxShadow: '0 16px 60px rgba(0,0,0,0.90)',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ fontSize: 22, fontWeight: 'bold', color: '#C8940A', letterSpacing: 1.5 }}>
            ★ FACTION ABILITY SELECTION
          </div>
          <div style={{ fontSize: 12, color: '#7a6040', marginTop: 5 }}>
            Each faction chooses one permanent ability for the entire campaign
          </div>
          <div style={{ fontSize: 10, color: '#5a4020', marginTop: 3 }}>
            This choice cannot be changed once confirmed
          </div>
        </div>

        {/* Progress — all players */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
          {activePlayers.map((player, idx) => {
            const color = factionRgb(player.factionId)
            const chosen = choices[player.factionId]
            const ability = FACTION_ABILITY_OPTIONS.find(a => a.id === chosen)
            const isActive = idx === currentIdx && !allChosen
            const isDone = chosen !== undefined

            return (
              <div key={player.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', borderRadius: 7,
                background: isActive ? 'rgba(200,148,10,0.08)' : isDone ? 'rgba(39,174,96,0.06)' : 'rgba(0,0,0,0.22)',
                border: `1px solid ${isActive ? 'rgba(200,148,10,0.55)' : isDone ? 'rgba(39,174,96,0.35)' : 'rgba(100,75,25,0.18)'}`,
              }}>
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <div style={{ width: 130, fontSize: 12, fontWeight: isActive ? 'bold' : 'normal', color: isActive ? '#E8DCC8' : '#9a8060' }}>
                  {player.name}
                  <div style={{ fontSize: 9, color: `${color}AA` }}>{FACTION_NAMES[player.factionId] ?? player.factionId}</div>
                </div>
                <div style={{ flex: 1, fontSize: 11 }}>
                  {isDone ? (
                    <span style={{ color: '#27AE60' }}>★ {ability?.name ?? chosen}</span>
                  ) : isActive ? (
                    <span style={{ color: '#C8940A', fontStyle: 'italic' }}>choosing…</span>
                  ) : (
                    <span style={{ color: '#3a2810' }}>waiting</span>
                  )}
                </div>
                {isActive && <span style={{ fontSize: 9, color: '#C8940A' }}>← now</span>}
              </div>
            )
          })}
        </div>

        {/* Ability selection for current player */}
        {!allChosen && currentPlayer && (() => {
          const [opt1, opt2] = getAbilitiesForFaction(currentPlayer.factionId)
          if (!opt1 || !opt2) return null
          const color = factionRgb(currentPlayer.factionId)
          return (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 10, color: '#6a5030', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 14, borderBottom: '1px solid rgba(200,148,10,0.15)', paddingBottom: 5 }}>
                <span style={{ color }}>
                  {currentPlayer.name}
                </span>
                {' '}— Choose Your Faction Ability
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                {[opt1, opt2].map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => handleChoose(currentPlayer.factionId, opt.id)}
                    style={{
                      flex: 1, padding: '16px 14px', borderRadius: 10, textAlign: 'left',
                      border: `1.5px solid ${color}50`,
                      background: `${color}0A`,
                      color: '#E8DCC8', cursor: 'pointer', fontFamily: 'Georgia, serif',
                      transition: 'all 0.18s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = `${color}1E`
                      e.currentTarget.style.borderColor = `${color}A0`
                      e.currentTarget.style.transform = 'translateY(-1px)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = `${color}0A`
                      e.currentTarget.style.borderColor = `${color}50`
                      e.currentTarget.style.transform = 'none'
                    }}
                  >
                    {/* Phase tag */}
                    <div style={{
                      display: 'inline-block', fontSize: 9, padding: '2px 8px', borderRadius: 8,
                      background: `${color}18`, border: `1px solid ${color}40`,
                      color, letterSpacing: 0.5, marginBottom: 10,
                    }}>
                      {PHASE_LABEL[opt.phase] ?? opt.phase}
                    </div>
                    {/* Ability name */}
                    <div style={{ fontSize: 15, fontWeight: 'bold', color, marginBottom: 6, lineHeight: 1.2 }}>
                      {opt.name}
                    </div>
                    {/* Tagline */}
                    <div style={{ fontSize: 11, color: '#C8940A', marginBottom: 8, fontStyle: 'italic' }}>
                      {opt.tagline}
                    </div>
                    {/* Full description */}
                    <div style={{ fontSize: 11, color: '#8a7060', lineHeight: 1.5 }}>
                      {opt.description}
                    </div>
                    {/* Click hint */}
                    <div style={{ marginTop: 12, fontSize: 10, color: `${color}80`, textAlign: 'center', letterSpacing: 0.5 }}>
                      Click to choose →
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )
        })()}

        {/* All chosen summary */}
        {allChosen && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, color: '#27AE60', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10, borderBottom: '1px solid rgba(39,174,96,0.25)', paddingBottom: 5 }}>
              ✓ All Faction Abilities Chosen
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {activePlayers.map(p => {
                const ability = FACTION_ABILITY_OPTIONS.find(a => a.id === choices[p.factionId])
                const color = factionRgb(p.factionId)
                return ability ? (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ color, width: 110 }}>{p.name}</span>
                    <span style={{ color: '#27AE60' }}>★ {ability.name}</span>
                    <span style={{ color: '#5a4030', fontStyle: 'italic', fontSize: 10 }}>— {ability.tagline}</span>
                  </div>
                ) : null
              })}
            </div>
          </div>
        )}

        <button
          onClick={() => onConfirm(choices)}
          disabled={!allChosen}
          style={{
            width: '100%', padding: '14px',
            borderRadius: 8, fontSize: 15, fontWeight: 'bold', letterSpacing: 0.5,
            border: `2px solid ${allChosen ? 'rgba(200,148,10,0.70)' : 'rgba(100,75,25,0.30)'}`,
            background: allChosen ? 'rgba(200,148,10,0.18)' : 'rgba(50,35,10,0.20)',
            color: allChosen ? '#E8DCC8' : '#5a4020',
            cursor: allChosen ? 'pointer' : 'not-allowed',
            fontFamily: 'Georgia, serif', transition: 'all 0.2s',
          }}
        >
          {allChosen
            ? '🃏 Confirm Abilities & Continue'
            : `Waiting for ${activePlayers.length - currentIdx} more player${activePlayers.length - currentIdx !== 1 ? 's' : ''} to choose…`}
        </button>
      </div>
    </div>
  )
}
