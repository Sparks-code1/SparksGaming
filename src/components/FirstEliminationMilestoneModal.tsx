import { useState } from 'react'

interface Props {
  eliminatedPlayerName: string
  eliminatedFactionName: string
  conquerorName: string
  onComplete: () => void
}

type Step = 'announce' | 'unlocks'

/**
 * First Blood milestone transition — triggered the first time any faction is
 * eliminated in the campaign. Shown before the eliminated player chooses their
 * comeback power.
 */
export default function FirstEliminationMilestoneModal({ eliminatedPlayerName, eliminatedFactionName, conquerorName, onComplete }: Props) {
  const [step, setStep] = useState<Step>('announce')

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 4000,
      background: 'radial-gradient(ellipse at center, #1a0505 0%, #050200 75%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Georgia, serif',
    }}>
      {step === 'announce' && (
        <div style={{ textAlign: 'center', maxWidth: 640, padding: '0 24px' }}>
          <div style={{ fontSize: 64, marginBottom: 24, lineHeight: 1 }}>💀</div>
          <div style={{
            fontSize: 46, fontWeight: 'bold', color: '#E74C3C', letterSpacing: 6,
            textShadow: '0 0 40px rgba(231,76,60,0.45)', marginBottom: 22,
          }}>
            FIRST BLOOD
          </div>
          <div style={{ fontSize: 17, color: '#c08a70', lineHeight: 1.7, marginBottom: 40, fontStyle: 'italic' }}>
            For the first time in this world's history, a faction has been wiped
            from the map. <strong style={{ color: '#E8DCC8' }}>{eliminatedPlayerName}</strong> and
            the {eliminatedFactionName} have fallen to <strong style={{ color: '#E8DCC8' }}>{conquerorName}</strong>.
            The war will never be the same.
          </div>
          <button
            onClick={() => setStep('unlocks')}
            style={{
              padding: '14px 44px', borderRadius: 8, fontSize: 15, fontWeight: 'bold',
              border: '2px solid rgba(231,76,60,0.70)', background: 'rgba(231,76,60,0.14)',
              color: '#E8DCC8', cursor: 'pointer', fontFamily: 'Georgia, serif', letterSpacing: 1,
            }}
          >
            See What Has Changed →
          </button>
        </div>
      )}

      {step === 'unlocks' && (
        <div style={{
          width: 560, maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto',
          background: 'linear-gradient(155deg, #1a0808 0%, #0a0300 100%)',
          border: '2px solid rgba(231,76,60,0.55)', borderRadius: 14,
          padding: '28px 32px 24px', color: '#E8DCC8',
          boxShadow: '0 0 80px rgba(231,76,60,0.15)',
        }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 22, fontWeight: 'bold', color: '#E74C3C', letterSpacing: 2 }}>
              💀 UNLOCKED
            </div>
          </div>

          <Unlock icon="🔵" color="#3498DB" title="Comeback Powers">
            Every faction that gets eliminated claims a permanent <strong>comeback power </strong>
            (the blue slot on its faction card). Each power can only ever be claimed by one
            faction. <strong style={{ color: '#3498DB' }}>{eliminatedPlayerName}</strong> chooses
            first, right now: <em>Expand, Aggressive, Mobile HQ, Mercenary or Resilient</em>.
          </Unlock>

          <Unlock icon="🧍" color="#c0a060" title="Mercenary Scar Cards ×3">
            Three <strong>Mercenary</strong> cards join the campaign scar deck and can be dealt
            into hands from the next game onward. A Mercenary territory automatically gains
            <strong> +1 troop</strong> during its owner's draft.
          </Unlock>

          <Unlock icon="⚔" color="#E74C3C" title="Join the War">
            Elimination is not the end. On their next turn, a fallen player may
            <strong> rejoin the war</strong> — landing 3 troops on any unowned territory with no
            cities that isn't adjacent to an HQ — or forfeit the game.
          </Unlock>

          <Unlock icon="🃏" color="#9a8a68" title="Spoils of Conquest">
            The conqueror seizes everything: <strong>{conquerorName}</strong> takes all of
            {' '}{eliminatedPlayerName}'s territory cards.
          </Unlock>

          <button
            onClick={onComplete}
            style={{
              width: '100%', padding: '13px', marginTop: 8,
              borderRadius: 8, fontSize: 14, fontWeight: 'bold',
              border: '2px solid rgba(231,76,60,0.70)', background: 'rgba(231,76,60,0.14)',
              color: '#E8DCC8', cursor: 'pointer', fontFamily: 'Georgia, serif', letterSpacing: 0.5,
            }}
          >
            💀 Choose a Comeback Power →
          </button>
        </div>
      )}
    </div>
  )
}

function Unlock({ icon, color, title, children }: {
  icon: string; color: string; title: string; children: React.ReactNode
}) {
  return (
    <div style={{
      display: 'flex', gap: 12, alignItems: 'flex-start',
      padding: '12px 14px', borderRadius: 9, marginBottom: 10,
      background: `${color}0C`, border: `1px solid ${color}30`,
    }}>
      <div style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 'bold', color, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 11.5, color: '#9a8a68', lineHeight: 1.55 }}>{children}</div>
      </div>
    </div>
  )
}
