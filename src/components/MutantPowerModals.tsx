import { useState } from 'react'
import type { Territory } from '@/types/territory'

const GREEN = '#8B0000'

const shell: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 1200,
  background: 'rgba(5,2,0,0.85)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'Georgia, serif',
}

const panel: React.CSSProperties = {
  width: 440, maxWidth: '92vw',
  background: 'linear-gradient(155deg, #101a04 0%, #060a02 100%)',
  border: '2px solid rgba(139,0,0,0.55)', borderRadius: 14,
  padding: '24px 28px 20px', color: '#E8DCC8',
  boxShadow: '0 0 50px rgba(139,0,0,0.18)',
}

/**
 * Mass Hypnosis (Mutant Evolve power) — after trading in cards, the Mutants
 * may pick one of the traded territories; it cannot be attacked until the
 * beginning of their next turn.
 */
export function MassHypnosisModal({ territoryIds, territories, onPick, onSkip }: {
  territoryIds: string[]
  territories: Record<string, Territory>
  onPick: (territoryId: string) => void
  onSkip: () => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  return (
    <div style={shell}>
      <div style={panel}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 34, lineHeight: 1, marginBottom: 8 }}>🌀</div>
          <div style={{ fontSize: 19, fontWeight: 'bold', color: GREEN, letterSpacing: 1.5 }}>
            MASS HYPNOSIS
          </div>
          <div style={{ fontSize: 11.5, color: '#7a9a5a', marginTop: 6, lineHeight: 1.5 }}>
            Pick one of the traded territories — it <strong>cannot be attacked</strong> until
            the beginning of your next turn.
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18, justifyContent: 'center' }}>
          {territoryIds.map(tid => {
            const t = territories[tid]
            if (!t) return null
            const sel = selected === tid
            return (
              <button
                key={tid}
                onClick={() => setSelected(sel ? null : tid)}
                style={{
                  padding: '7px 12px', borderRadius: 7,
                  border: `1.5px solid ${sel ? GREEN : 'rgba(139,0,0,0.30)'}`,
                  background: sel ? 'rgba(139,0,0,0.18)' : 'rgba(0,0,0,0.30)',
                  color: sel ? '#E8DCC8' : '#7a9a5a',
                  cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: 12,
                }}
              >
                {t.name}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onSkip} style={{
            flex: 1, padding: '11px', borderRadius: 8, fontSize: 13,
            border: '1.5px solid rgba(120,120,120,0.35)', background: 'rgba(0,0,0,0.30)',
            color: '#8a8a7a', cursor: 'pointer', fontFamily: 'Georgia, serif',
          }}>
            Skip
          </button>
          <button
            disabled={!selected}
            onClick={() => selected && onPick(selected)}
            style={{
              flex: 1, padding: '11px', borderRadius: 8, fontSize: 13, fontWeight: 'bold',
              border: `2px solid ${selected ? 'rgba(139,0,0,0.75)' : 'rgba(139,0,0,0.20)'}`,
              background: selected ? 'rgba(139,0,0,0.18)' : 'rgba(0,0,0,0.20)',
              color: selected ? '#E8DCC8' : '#3a5a2a',
              cursor: selected ? 'pointer' : 'not-allowed', fontFamily: 'Georgia, serif',
            }}
          >
            🌀 Hypnotize
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Mindshackle (Mutant Evolve power) — after collecting a resource card, the
 * Mutants may trade it for a random card from the hand of a player whose
 * territory they conquered this turn.
 */
export function MindshackleModal({ victims, onPick, onSkip }: {
  victims: Array<{ id: string; name: string; cardCount: number }>
  onPick: (victimPlayerId: string) => void
  onSkip: () => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  return (
    <div style={shell}>
      <div style={panel}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 34, lineHeight: 1, marginBottom: 8 }}>⛓</div>
          <div style={{ fontSize: 19, fontWeight: 'bold', color: GREEN, letterSpacing: 1.5 }}>
            MINDSHACKLE
          </div>
          <div style={{ fontSize: 11.5, color: '#7a9a5a', marginTop: 6, lineHeight: 1.5 }}>
            Trade the resource card you just collected for a <strong>random card</strong> from
            the hand of a player whose territory you conquered this turn.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
          {victims.map(v => {
            const sel = selected === v.id
            return (
              <button
                key={v.id}
                onClick={() => setSelected(sel ? null : v.id)}
                style={{
                  padding: '9px 14px', borderRadius: 7, textAlign: 'left',
                  border: `1.5px solid ${sel ? GREEN : 'rgba(139,0,0,0.30)'}`,
                  background: sel ? 'rgba(139,0,0,0.18)' : 'rgba(0,0,0,0.30)',
                  color: sel ? '#E8DCC8' : '#7a9a5a',
                  cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: 12,
                  display: 'flex', justifyContent: 'space-between',
                }}
              >
                <span>{v.name}</span>
                <span style={{ color: '#5a7a3a', fontSize: 11 }}>🃏 {v.cardCount} card{v.cardCount !== 1 ? 's' : ''}</span>
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onSkip} style={{
            flex: 1, padding: '11px', borderRadius: 8, fontSize: 13,
            border: '1.5px solid rgba(120,120,120,0.35)', background: 'rgba(0,0,0,0.30)',
            color: '#8a8a7a', cursor: 'pointer', fontFamily: 'Georgia, serif',
          }}>
            Keep the Resource Card
          </button>
          <button
            disabled={!selected}
            onClick={() => selected && onPick(selected)}
            style={{
              flex: 1, padding: '11px', borderRadius: 8, fontSize: 13, fontWeight: 'bold',
              border: `2px solid ${selected ? 'rgba(139,0,0,0.75)' : 'rgba(139,0,0,0.20)'}`,
              background: selected ? 'rgba(139,0,0,0.18)' : 'rgba(0,0,0,0.20)',
              color: selected ? '#E8DCC8' : '#3a5a2a',
              cursor: selected ? 'pointer' : 'not-allowed', fontFamily: 'Georgia, serif',
            }}
          >
            ⛓ Trade Cards
          </button>
        </div>
      </div>
    </div>
  )
}
