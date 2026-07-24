import { useState } from 'react'
import { MUTANT_EVOLVE_POWERS } from '@/data/missilePowers'

interface Props {
  mutantPlayerName: string
  /** Evolve power IDs already revealed in previous events */
  revealedPowerIds: Set<string>
  onReveal: (powerId: string) => void
  onSkip: () => void
}

const GREEN = '#8B0000'

/**
 * The Mutants Evolve — the Mutant player secretly picks a stance
 * (Offensive/Defensive) and an aptitude (Brains/Brawn); the pairing reveals a
 * hidden permanent Mutant power. Digital equivalent of scratch-n-sniff.
 */
export default function MutantsEvolveModal({ mutantPlayerName, revealedPowerIds, onReveal, onSkip }: Props) {
  const [stance, setStance]     = useState<'offensive' | 'defensive' | null>(null)
  const [aptitude, setAptitude] = useState<'brains' | 'brawn' | null>(null)
  const [revealed, setRevealed] = useState(false)

  const power = stance && aptitude
    ? MUTANT_EVOLVE_POWERS.find(p => p.stance === stance && p.aptitude === aptitude) ?? null
    : null
  const alreadyRevealed = power ? revealedPowerIds.has(power.id) : false

  function axisButton<T extends string>(value: T, current: T | null, set: (v: T) => void, label: string, icon: string) {
    const sel = current === value
    return (
      <button
        onClick={() => !revealed && set(value)}
        disabled={revealed}
        style={{
          flex: 1, padding: '14px 10px', borderRadius: 9,
          border: `2px solid ${sel ? GREEN : 'rgba(139,0,0,0.25)'}`,
          background: sel ? 'rgba(139,0,0,0.18)' : 'rgba(0,0,0,0.30)',
          color: sel ? '#E8DCC8' : '#7a9a5a',
          cursor: revealed ? 'default' : 'pointer', fontFamily: 'Georgia, serif',
          fontSize: 13, fontWeight: 'bold', letterSpacing: 0.5,
        }}
      >
        <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
        {label}
      </button>
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1200,
      background: 'rgba(5,2,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Georgia, serif',
    }}>
      <div style={{
        width: 480, maxWidth: '94vw',
        background: 'linear-gradient(155deg, #101a04 0%, #060a02 100%)',
        border: `2px solid rgba(139,0,0,0.55)`, borderRadius: 14,
        padding: '26px 30px 22px', color: '#E8DCC8',
        boxShadow: '0 0 50px rgba(139,0,0,0.18)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 36, lineHeight: 1, marginBottom: 8 }}>🧬</div>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: GREEN, letterSpacing: 1.5 }}>
            THE MUTANTS EVOLVE
          </div>
          <div style={{ fontSize: 11.5, color: '#7a9a5a', marginTop: 6, lineHeight: 1.5 }}>
            <strong style={{ color: GREEN }}>{mutantPlayerName}</strong> — pick one from each pair.
            The hidden pairing determines which power you evolve. No peeking.
          </div>
        </div>

        <div style={{ fontSize: 10, color: '#5a7a3a', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>Stance</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          {axisButton('offensive', stance, setStance, 'Offensive', '⚔')}
          {axisButton('defensive', stance, setStance, 'Defensive', '🛡')}
        </div>

        <div style={{ fontSize: 10, color: '#5a7a3a', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>Aptitude</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
          {axisButton('brains', aptitude, setAptitude, 'Brains', '🧠')}
          {axisButton('brawn', aptitude, setAptitude, 'Brawn', '💪')}
        </div>

        {revealed && power && (
          <div style={{
            padding: '14px 16px', borderRadius: 9, marginBottom: 16,
            background: alreadyRevealed ? 'rgba(120,120,120,0.10)' : 'rgba(139,0,0,0.12)',
            border: `1.5px solid ${alreadyRevealed ? 'rgba(120,120,120,0.35)' : 'rgba(139,0,0,0.55)'}`,
          }}>
            <div style={{ fontSize: 15, fontWeight: 'bold', color: alreadyRevealed ? '#8a8a7a' : GREEN, marginBottom: 6 }}>
              🧬 {power.name}{alreadyRevealed ? ' — already evolved!' : ''}
            </div>
            <div style={{ fontSize: 11.5, color: '#9aa878', lineHeight: 1.55 }}>
              {power.description}
            </div>
            {alreadyRevealed && (
              <div style={{ fontSize: 10.5, color: '#7a7a6a', marginTop: 8 }}>
                The Mutants had already evolved this power — nothing new is gained.
              </div>
            )}
          </div>
        )}

        {!revealed ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={onSkip}
              style={{
                flex: 1, padding: '12px', borderRadius: 8, fontSize: 13,
                border: '1.5px solid rgba(120,120,120,0.35)', background: 'rgba(0,0,0,0.30)',
                color: '#8a8a7a', cursor: 'pointer', fontFamily: 'Georgia, serif',
              }}
            >
              Skip
            </button>
            <button
              disabled={!stance || !aptitude}
              onClick={() => setRevealed(true)}
              style={{
                flex: 1, padding: '12px', borderRadius: 8, fontSize: 13, fontWeight: 'bold',
                border: `2px solid ${stance && aptitude ? 'rgba(139,0,0,0.75)' : 'rgba(139,0,0,0.20)'}`,
                background: stance && aptitude ? 'rgba(139,0,0,0.18)' : 'rgba(0,0,0,0.20)',
                color: stance && aptitude ? '#E8DCC8' : '#3a5a2a',
                cursor: stance && aptitude ? 'pointer' : 'not-allowed', fontFamily: 'Georgia, serif',
              }}
            >
              🧬 Scratch &amp; Reveal
            </button>
          </div>
        ) : (
          <button
            onClick={() => power && !alreadyRevealed ? onReveal(power.id) : onSkip()}
            style={{
              width: '100%', padding: '12px', borderRadius: 8, fontSize: 13, fontWeight: 'bold',
              border: '2px solid rgba(139,0,0,0.75)', background: 'rgba(139,0,0,0.18)',
              color: '#E8DCC8', cursor: 'pointer', fontFamily: 'Georgia, serif',
            }}
          >
            {alreadyRevealed ? 'Continue' : '🧬 Evolution Complete'}
          </button>
        )}
      </div>
    </div>
  )
}
