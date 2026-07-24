import { useState } from 'react'
import type { UnlockOption } from '@/lib/legacyApi'
import type { Player } from '@/types/player'

interface Props {
  winner: Player
  gameNumber: number
  options: UnlockOption[]
  onConfirm: (chosen: UnlockOption) => void
}

const TYPE_COLORS: Record<string, string> = {
  'faction-power':   '#8E44AD',
  'rule-section':    '#2980B9',
  'continent-bonus': '#F39C12',
  'event-deck':      '#E74C3C',
}

const TYPE_ICONS: Record<string, string> = {
  'faction-power':   '⚡',
  'rule-section':    '📖',
  'continent-bonus': '⊕',
  'event-deck':      '🃏',
}

export default function UnlockModal({ winner, gameNumber, options, onConfirm }: Props) {
  const [chosen, setChosen] = useState<UnlockOption | null>(null)

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(5,2,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1200, fontFamily: 'Georgia, serif',
    }}>
      <div style={{
        background: 'linear-gradient(155deg, #1A0E02 0%, #0E0700 100%)',
        border: '2px solid rgba(200,148,10,0.80)',
        borderRadius: 14, padding: '30px 32px 26px',
        width: 500, maxWidth: '92vw', color: '#E8DCC8',
        boxShadow: '0 16px 60px rgba(0,0,0,0.90)',
      }}>
        {/* Victory header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 32, marginBottom: 6 }}>🏆</div>
          <div style={{ fontSize: 22, fontWeight: 'bold', color: '#C8940A', letterSpacing: 1.5 }}>
            VICTORY!
          </div>
          <div style={{ fontSize: 14, color: '#b09060', marginTop: 6 }}>
            <strong style={{ color: '#E8DCC8' }}>{winner.name}</strong> wins Game #{gameNumber}!
          </div>
          <div style={{ fontSize: 11, color: '#7a6040', marginTop: 4, letterSpacing: 1 }}>
            Choose a legacy unlock to permanently change the campaign
          </div>
        </div>

        {/* Unlock options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
          {options.map(opt => {
            const color = TYPE_COLORS[opt.contentType] ?? '#C8940A'
            const icon  = TYPE_ICONS[opt.contentType] ?? '★'
            const isSel = chosen?.id === opt.id
            return (
              <button
                key={opt.id}
                onClick={() => setChosen(opt)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '14px 16px', borderRadius: 9, textAlign: 'left',
                  border: isSel ? `2px solid ${color}` : `1px solid ${color}40`,
                  background: isSel ? `${color}1E` : `${color}0A`,
                  cursor: 'pointer', fontFamily: 'Georgia, serif',
                }}
              >
                <span style={{ fontSize: 26, lineHeight: 1, flexShrink: 0 }}>{icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 'bold', color: isSel ? color : '#E8DCC8' }}>
                      {opt.name}
                    </span>
                    <span style={{
                      fontSize: 9, padding: '2px 7px', borderRadius: 8,
                      background: `${color}22`, border: `1px solid ${color}55`,
                      color, letterSpacing: 0.5, textTransform: 'uppercase' as const,
                    }}>
                      {opt.contentType.replace(/-/g, ' ')}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#8a7050', lineHeight: 1.45 }}>
                    {opt.description}
                    {opt.bonusDelta && (
                      <span style={{ color: '#F39C12', marginLeft: 6, fontWeight: 'bold' }}>
                        +{opt.bonusDelta} troop bonus
                      </span>
                    )}
                  </div>
                </div>
                {isSel && (
                  <span style={{ color, fontSize: 18, flexShrink: 0, alignSelf: 'center' }}>✓</span>
                )}
              </button>
            )
          })}
        </div>

        <button
          onClick={() => chosen && onConfirm(chosen)}
          disabled={!chosen}
          style={{
            width: '100%', padding: '13px',
            borderRadius: 8,
            border: `2px solid ${chosen ? '#C8940A' : 'rgba(100,75,20,0.30)'}`,
            background: chosen ? 'rgba(200,148,10,0.22)' : 'rgba(40,25,5,0.50)',
            color: chosen ? '#E8DCC8' : '#4a3a20',
            fontSize: 15, fontWeight: 'bold', letterSpacing: 1,
            cursor: chosen ? 'pointer' : 'not-allowed',
            fontFamily: 'Georgia, serif',
          }}
        >
          {chosen ? `Unlock: ${chosen.name}` : 'Select an unlock to continue'}
        </button>
      </div>
    </div>
  )
}
