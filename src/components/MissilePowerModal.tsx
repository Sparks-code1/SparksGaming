import { useState } from 'react'
import { MISSILE_POWERS, MISSILE_POWER_COLOR } from '@/data/missilePowers'

interface Props {
  playerName: string
  factionName: string
  /** Power IDs already claimed by any faction */
  claimedPowerIds: Set<string>
  onSelect: (powerId: string) => void
}

/**
 * Missile power selection (brown slot) — offered when a player earns a red
 * star token during a game after the Nuclear Milestone. Each power is unique.
 */
export default function MissilePowerModal({ playerName, factionName, claimedPowerIds, onSelect }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const c = MISSILE_POWER_COLOR

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1200,
      background: 'rgba(5,2,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Georgia, serif',
    }}>
      <div style={{
        width: 500, maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto',
        background: 'linear-gradient(155deg, #1a1006 0%, #0a0602 100%)',
        border: `2px solid ${c}90`, borderRadius: 14,
        padding: '26px 30px 22px', color: '#E8DCC8',
        boxShadow: `0 0 50px ${c}25`,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 36, lineHeight: 1, marginBottom: 8 }}>🚀</div>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: c, letterSpacing: 1.5 }}>
            CHOOSE A MISSILE POWER
          </div>
          <div style={{ fontSize: 11.5, color: '#9a8a68', marginTop: 6, lineHeight: 1.5 }}>
            <strong style={{ color: c }}>{playerName}</strong> ({factionName}) earned a red star —
            choose a permanent missile power. Each is activated in-game by
            <strong> discarding a missile</strong>, and each may only be claimed by one faction.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {MISSILE_POWERS.map(power => {
            const taken = claimedPowerIds.has(power.id)
            const sel = selected === power.id
            return (
              <button
                key={power.id}
                disabled={taken}
                onClick={() => !taken && setSelected(sel ? null : power.id)}
                style={{
                  padding: '10px 14px', borderRadius: 8, textAlign: 'left',
                  border: `1.5px solid ${taken ? 'rgba(100,75,25,0.15)' : sel ? c : `${c}55`}`,
                  background: taken ? 'rgba(20,10,0,0.30)' : sel ? `${c}28` : `${c}10`,
                  color: taken ? '#3a2810' : '#e8dcc8',
                  cursor: taken ? 'not-allowed' : 'pointer',
                  fontFamily: 'Georgia, serif',
                  opacity: taken ? 0.45 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: taken ? '#333' : c, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 'bold', color: taken ? '#4a3020' : c }}>{power.name}</span>
                  {taken && <span style={{ fontSize: 9, color: '#3a2810', marginLeft: 4 }}>(claimed)</span>}
                </div>
                <div style={{ fontSize: 11, color: taken ? '#3a2010' : '#9a8060', lineHeight: 1.4, marginLeft: 18 }}>
                  {power.description}
                </div>
              </button>
            )
          })}
        </div>

        <button
          disabled={!selected}
          onClick={() => selected && onSelect(selected)}
          style={{
            width: '100%', padding: '12px', borderRadius: 8, fontSize: 13, fontWeight: 'bold',
            border: `2px solid ${selected ? `${c}BB` : `${c}30`}`,
            background: selected ? `${c}28` : 'rgba(0,0,0,0.20)',
            color: selected ? '#E8DCC8' : '#4a3a20',
            cursor: selected ? 'pointer' : 'not-allowed', fontFamily: 'Georgia, serif',
          }}
        >
          🚀 Claim Missile Power
        </button>
      </div>
    </div>
  )
}
