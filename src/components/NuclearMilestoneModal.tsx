import { useState } from 'react'

interface Props {
  bringerPlayerName: string
  bringerFactionName: string
  falloutTerritoryName: string
  onComplete: () => void
}

type Step = 'announce' | 'consequences'

/**
 * Nuclear Milestone transition — triggered when 3 missiles are placed on a
 * single combat roll. The player who placed the last missile becomes the
 * Bringer of Nuclear Fire and the defended territory becomes the Fallout Zone.
 */
export default function NuclearMilestoneModal({ bringerPlayerName, bringerFactionName, falloutTerritoryName, onComplete }: Props) {
  const [step, setStep] = useState<Step>('announce')

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 4000,
      background: 'radial-gradient(ellipse at center, #1a1400 0%, #050300 75%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Georgia, serif',
    }}>
      {step === 'announce' && (
        <div style={{ textAlign: 'center', maxWidth: 640, padding: '0 24px' }}>
          <div style={{ fontSize: 64, marginBottom: 24, lineHeight: 1 }}>☢</div>
          <div style={{
            fontSize: 46, fontWeight: 'bold', color: '#F1C40F', letterSpacing: 6,
            textShadow: '0 0 40px rgba(241,196,15,0.45)', marginBottom: 22,
          }}>
            THE WAR PROGRESSES
          </div>
          <div style={{ fontSize: 17, color: '#c0a870', lineHeight: 1.7, marginBottom: 40, fontStyle: 'italic' }}>
            The Unthinkable has happened. The factions pushed the war until someone
            unleashed a nuclear device. There will be consequences.
          </div>
          <button
            onClick={() => setStep('consequences')}
            style={{
              padding: '14px 44px', borderRadius: 8, fontSize: 15, fontWeight: 'bold',
              border: '2px solid rgba(241,196,15,0.70)', background: 'rgba(241,196,15,0.14)',
              color: '#E8DCC8', cursor: 'pointer', fontFamily: 'Georgia, serif', letterSpacing: 1,
            }}
          >
            Witness the Consequences →
          </button>
        </div>
      )}

      {step === 'consequences' && (
        <div style={{
          width: 560, maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto',
          background: 'linear-gradient(155deg, #1a1200 0%, #0a0600 100%)',
          border: '2px solid rgba(241,196,15,0.55)', borderRadius: 14,
          padding: '28px 32px 24px', color: '#E8DCC8',
          boxShadow: '0 0 80px rgba(241,196,15,0.15)',
        }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 22, fontWeight: 'bold', color: '#F1C40F', letterSpacing: 2 }}>
              ☢ CONSEQUENCES
            </div>
          </div>

          <Consequence icon="☢" color="#e74c3c" title="The Bringer of Nuclear Fire">
            <strong style={{ color: '#e74c3c' }}>{bringerPlayerName}</strong> ({bringerFactionName}) placed the
            third missile and is forever marked as the Bringer of Nuclear Fire. In games where the
            <strong style={{ color: '#8B0000' }}> Mutants</strong> are playing, this faction receives
            <strong> 2 bonus missiles</strong>.
          </Consequence>

          <Consequence icon="💥" color="#F1C40F" title={`Fallout Zone — ${falloutTerritoryName}`}>
            All cities, scars, HQs, troops and fortifications there are destroyed.
            Moving in costs <strong>half your troops on entry</strong>; occupying it costs
            <strong> 1 troop at the end of each turn</strong>. You cannot draft troops into it,
            and fortify moves may not pass through it.
          </Consequence>

          <Consequence icon="🚀" color="#a06a2a" title="Missile Powers Unlocked">
            The next time a player earns a <strong>red star token during a game</strong> (starting
            tokens don't count), they choose a missile power — activated by discarding a missile:
            Stealthy, Convincing, EMP, Recon, or Rally.
          </Consequence>

          <Consequence icon="🧟" color="#8B0000" title="The Mutants Rise">
            A new faction — the <strong style={{ color: '#8B0000' }}>Mutants</strong> — is playable
            from the next game, immune to the wasteland they were born from.
          </Consequence>

          <Consequence icon="🃏" color="#c0a060" title="New Events">
            Next game's deck gains <strong>3× Fallout</strong>, <strong>3× Agent of Chaos</strong> and
            <strong> 2× The Mutants Evolve</strong>.
          </Consequence>

          <button
            onClick={onComplete}
            style={{
              width: '100%', padding: '13px', marginTop: 8,
              borderRadius: 8, fontSize: 14, fontWeight: 'bold',
              border: '2px solid rgba(241,196,15,0.70)', background: 'rgba(241,196,15,0.14)',
              color: '#E8DCC8', cursor: 'pointer', fontFamily: 'Georgia, serif', letterSpacing: 0.5,
            }}
          >
            ☢ Let It Be Done
          </button>
        </div>
      )}
    </div>
  )
}

function Consequence({ icon, color, title, children }: {
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
