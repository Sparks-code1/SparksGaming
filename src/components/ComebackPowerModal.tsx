import { useState } from 'react'
import type { Player } from '@/types/player'

// ─── Comeback power definitions ───────────────────────────────────────────────

export interface ComebackPower {
  id: string
  name: string
  icon: string
  desc: string
  gameplayNote: string
}

export const COMEBACK_POWERS: ComebackPower[] = [
  {
    id: 'expand',
    name: 'Expand',
    icon: '🌍',
    desc: 'When recruiting troops you may place some or all into one unoccupied unmarked territory.',
    gameplayNote: 'During reinforce, click any unoccupied territory with no scars or cities to target it for troop placement.',
  },
  {
    id: 'aggressive',
    name: 'Aggressive',
    icon: '⚔️',
    desc: 'Add +1 to all attack dice when attacking a territory with an HQ.',
    gameplayNote: 'Applies automatically in combat when the defending territory holds an HQ.',
  },
  {
    id: 'mobile-hq',
    name: 'Mobile HQ',
    icon: '🏰',
    desc: 'Once per turn, move one of your HQ units to an adjacent territory you control.',
    gameplayNote: 'Use the "Move HQ" button that appears during your turn.',
  },
  {
    id: 'mercenary',
    name: 'Mercenary',
    icon: '💀',
    desc: 'Gain one extra troop for each mercenary territory you control during draft.',
    gameplayNote: 'Mercenary territories are neutral (unowned) territories. Bonus applied automatically at reinforce.',
  },
  {
    id: 'resilient',
    name: 'Resilient',
    icon: '🛡️',
    desc: 'Your faction is unaffected by Ammo Shortage scars.',
    gameplayNote: 'Automatically bypasses the Ammo Shortage dice cap when attacking.',
  },
]

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  eliminatedPlayer: Player
  factionName: string
  claimedPowerIds: string[]
  isFirstElimination: boolean
  onSelect: (powerId: string) => void
}

export default function ComebackPowerModal({
  eliminatedPlayer,
  factionName,
  claimedPowerIds,
  isFirstElimination,
  onSelect,
}: Props) {
  const [step, setStep] = useState<'announce' | 'select'>(
    isFirstElimination ? 'announce' : 'select',
  )
  const [hovered, setHovered] = useState<string | null>(null)
  const [chosen, setChosen] = useState<string | null>(null)

  const claimedSet = new Set(claimedPowerIds)

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2000,
        fontFamily: 'Georgia, serif',
      }}
    >
      <div
        style={{
          background: 'linear-gradient(155deg, #0d0500 0%, #1a0800 100%)',
          border: '2px solid rgba(41,128,185,0.75)',
          borderRadius: 16,
          padding: '36px 32px 28px',
          width: 560,
          maxWidth: '94vw',
          color: '#E8DCC8',
          boxShadow: '0 16px 60px rgba(0,0,0,0.95), 0 0 40px rgba(41,128,185,0.15)',
        }}
      >
        {step === 'announce' ? (
          /* ── First-time packet announcement ── */
          <div style={{ textAlign: 'center' }}>
            <div style={{
              display: 'inline-block',
              background: 'rgba(41,128,185,0.12)',
              border: '2px solid rgba(41,128,185,0.60)',
              borderRadius: 10, padding: '6px 18px', marginBottom: 20,
              fontSize: 10, letterSpacing: 2, color: '#3498DB', textTransform: 'uppercase',
            }}>
              ✉ Open Envelope
            </div>

            <div style={{ fontSize: 11, color: '#5a90b0', letterSpacing: 2, marginBottom: 10, textTransform: 'uppercase' }}>
              First Time a Faction is Eliminated
            </div>

            <div style={{ fontSize: 28, fontWeight: 'bold', color: '#3498DB', marginBottom: 16, lineHeight: 1.15 }}>
              COMEBACK POWERS<br />
              <span style={{ fontSize: 18, color: '#7fb3d3' }}>UNLOCKED</span>
            </div>

            <div style={{
              background: 'rgba(41,128,185,0.08)',
              border: '1px solid rgba(41,128,185,0.25)',
              borderRadius: 8, padding: '14px 18px', marginBottom: 24,
              fontSize: 13, color: '#b0c8d8', lineHeight: 1.6, textAlign: 'left',
            }}>
              <p style={{ margin: '0 0 10px' }}>
                A faction has been eliminated for the first time in this campaign.
              </p>
              <p style={{ margin: '0 0 10px' }}>
                From now on, whenever a faction is eliminated and has an empty blue slot on their faction card,
                they may choose one <strong style={{ color: '#3498DB' }}>Comeback Power</strong> from the pool below.
              </p>
              <p style={{ margin: 0, fontSize: 11, color: '#7a9aaa' }}>
                Each power can only be claimed once across the entire campaign — once chosen, it is removed from the pool permanently.
              </p>
            </div>

            <button
              onClick={() => setStep('select')}
              style={{
                width: '100%', padding: '13px',
                borderRadius: 8, border: '2px solid rgba(41,128,185,0.75)',
                background: 'rgba(41,128,185,0.22)',
                color: '#7fb3d3', fontSize: 14, fontWeight: 'bold',
                cursor: 'pointer', fontFamily: 'Georgia, serif', letterSpacing: 0.5,
              }}
            >
              Choose a Comeback Power for {eliminatedPlayer.name} →
            </button>
          </div>
        ) : (
          /* ── Power selection ── */
          <>
            <div style={{ textAlign: 'center', marginBottom: 22 }}>
              <div style={{ fontSize: 10, letterSpacing: 2, color: '#3498DB', textTransform: 'uppercase', marginBottom: 6 }}>
                Comeback Power — Blue Slot
              </div>
              <div style={{ fontSize: 20, fontWeight: 'bold', color: '#E8DCC8' }}>
                {eliminatedPlayer.name}
                <span style={{ fontSize: 13, color: '#7a90a0', fontWeight: 'normal' }}> ({factionName})</span>
              </div>
              <div style={{ fontSize: 11, color: '#5a7a8a', marginTop: 4 }}>
                Choose one power — this slot cannot be changed later
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {COMEBACK_POWERS.map(p => {
                const claimed = claimedSet.has(p.id)
                const isChosen = chosen === p.id
                const isHov = hovered === p.id

                return (
                  <button
                    key={p.id}
                    disabled={claimed}
                    onClick={() => !claimed && setChosen(p.id)}
                    onMouseEnter={() => setHovered(p.id)}
                    onMouseLeave={() => setHovered(null)}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 14,
                      padding: '12px 14px', borderRadius: 9, textAlign: 'left',
                      fontFamily: 'Georgia, serif', cursor: claimed ? 'not-allowed' : 'pointer',
                      border: isChosen
                        ? '2px solid #3498DB'
                        : claimed
                          ? '1px solid rgba(255,255,255,0.05)'
                          : isHov
                            ? '1.5px solid rgba(41,128,185,0.50)'
                            : '1px solid rgba(41,128,185,0.22)',
                      background: isChosen
                        ? 'rgba(41,128,185,0.20)'
                        : claimed
                          ? 'rgba(255,255,255,0.02)'
                          : isHov
                            ? 'rgba(41,128,185,0.10)'
                            : 'rgba(255,255,255,0.03)',
                      opacity: claimed ? 0.38 : 1,
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>{p.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 'bold', color: claimed ? '#4a5a6a' : isChosen ? '#3498DB' : '#C8D8E8' }}>
                          {p.name}
                        </span>
                        {claimed && (
                          <span style={{ fontSize: 9, color: '#3a4a5a', letterSpacing: 1, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, padding: '1px 5px' }}>
                            CLAIMED
                          </span>
                        )}
                        {isChosen && (
                          <span style={{ fontSize: 9, color: '#3498DB', letterSpacing: 1, border: '1px solid rgba(41,128,185,0.50)', borderRadius: 3, padding: '1px 5px' }}>
                            SELECTED ✓
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: claimed ? '#3a4a5a' : '#8aA0b0', lineHeight: 1.45 }}>
                        {p.desc}
                      </div>
                      {isChosen && (
                        <div style={{ fontSize: 10, color: '#5a90b0', marginTop: 4, fontStyle: 'italic' }}>
                          {p.gameplayNote}
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>

            <button
              disabled={!chosen}
              onClick={() => chosen && onSelect(chosen)}
              style={{
                width: '100%', padding: '13px',
                borderRadius: 8,
                border: chosen ? '2px solid rgba(41,128,185,0.80)' : '1px solid rgba(255,255,255,0.08)',
                background: chosen ? 'rgba(41,128,185,0.25)' : 'rgba(255,255,255,0.03)',
                color: chosen ? '#7fb3d3' : '#4a5a6a',
                fontSize: 14, fontWeight: 'bold',
                cursor: chosen ? 'pointer' : 'not-allowed',
                fontFamily: 'Georgia, serif', letterSpacing: 0.5,
                transition: 'all 0.15s',
              }}
            >
              {chosen
                ? `Claim "${COMEBACK_POWERS.find(p => p.id === chosen)?.name}" for ${eliminatedPlayer.name} →`
                : 'Select a power above'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
