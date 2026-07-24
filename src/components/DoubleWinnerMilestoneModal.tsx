import { useState } from 'react'

interface Props {
  winnerName: string
  onComplete: () => void
}

type Step = 'announce' | 'card-reveal' | 'done'
const STEPS: Step[] = ['announce', 'card-reveal', 'done']

export default function DoubleWinnerMilestoneModal({ winnerName, onComplete }: Props) {
  const [stepIdx, setStepIdx] = useState(0)
  const step = STEPS[stepIdx]

  function next() {
    if (stepIdx + 1 >= STEPS.length) { onComplete(); return }
    setStepIdx(i => i + 1)
  }

  if (step === 'done') { onComplete(); return null }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 3000,
      background: 'radial-gradient(ellipse at center, #080212 0%, #000000 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Georgia, serif',
    }}>
      <div style={{ width: 560, maxWidth: '94vw', color: '#E8DCC8', textAlign: 'center', padding: 24 }}>
        {step === 'announce' && <AnnounceStep winnerName={winnerName} onNext={next} />}
        {step === 'card-reveal' && <CardRevealStep onNext={next} />}
      </div>
    </div>
  )
}

function AnnounceStep({ winnerName, onNext }: { winnerName: string; onNext: () => void }) {
  return (
    <div>
      <div style={{ fontSize: 64, marginBottom: 8 }}>✍️</div>
      <div style={{
        fontSize: 10, letterSpacing: 4, color: '#7a4a9a',
        textTransform: 'uppercase', marginBottom: 20,
      }}>
        Campaign Milestone
      </div>
      <h1 style={{
        fontSize: 36, fontWeight: 'bold',
        color: '#c8a0e8',
        textShadow: '0 0 40px #9040c088, 0 0 80px #9040c044',
        margin: '0 0 12px', letterSpacing: 2,
      }}>
        The Board is Signed Twice
      </h1>
      <div style={{ width: 80, height: 2, background: '#9040c066', margin: '0 auto 24px' }} />

      <div style={{
        background: '#9040c012',
        border: '1px solid #9040c040',
        borderRadius: 10, padding: '18px 24px', marginBottom: 24,
      }}>
        <div style={{ fontSize: 13, color: '#c8a0e8', marginBottom: 8 }}>
          Second signature by
        </div>
        <div style={{
          fontSize: 32, fontWeight: 'bold', color: '#e8d0ff',
          textShadow: '0 0 20px #9040c066',
          letterSpacing: 1,
        }}>
          {winnerName}
        </div>
      </div>

      <p style={{ color: '#c0a870', fontSize: 14, lineHeight: 1.7, margin: '0 0 32px' }}>
        A warrior has proven themselves twice. Their legend echoes across the world —
        and others flock to their banner. A new force awakens in the campaign.
      </p>

      <ContinueButton onClick={onNext} label="See What Has Changed" />
    </div>
  )
}

function CardRevealStep({ onNext }: { onNext: () => void }) {
  return (
    <div style={{
      background: 'linear-gradient(155deg, #120818 0%, #080212 100%)',
      border: '1px solid #9040c044',
      borderRadius: 16,
      padding: '36px 32px 28px',
      boxShadow: '0 0 60px #9040c018, 0 12px 60px rgba(0,0,0,0.9)',
    }}>
      <div style={{ fontSize: 52, marginBottom: 12 }}>🫂</div>
      <div style={{ fontSize: 10, color: '#9040c0', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 10 }}>
        New Event Card Unlocked (×3)
      </div>
      <h2 style={{ fontSize: 28, color: '#e8d0ff', margin: '0 0 8px', letterSpacing: 1 }}>
        Join the Cause
      </h2>
      <div style={{ width: 50, height: 1, background: '#9040c060', margin: '0 auto 20px' }} />

      <div style={{ textAlign: 'left' }}>
        <DetailBox>
          <strong style={{ color: '#c8a0e8' }}>When drawn:</strong> Calculate each player's
          population score — territories owned, plus 1 per minor city, plus 2 per major city.
          <br /><br />
          The player with the <strong style={{ color: '#e8d0ff' }}>largest population</strong> chooses one:
          <ul style={{ margin: '10px 0 0 16px', padding: 0, listStyle: 'disc' }}>
            <li style={{ marginBottom: 6 }}>
              <strong style={{ color: '#e8d0ff' }}>Reinforce:</strong> Gain 3 troops placed anywhere in cities they control.
            </li>
            <li>
              <strong style={{ color: '#e8d0ff' }}>New Mission:</strong> Replace their active mission with any available mission of their choice (they see the full list).
            </li>
          </ul>
        </DetailBox>
        <p style={{ color: '#7a5a9a', fontSize: 12, marginTop: 12, textAlign: 'center' }}>
          Three copies have been shuffled into the event deck.
        </p>
      </div>

      <div style={{ marginTop: 24 }}>
        <ContinueButton onClick={onNext} label="Begin Next Game" />
      </div>
    </div>
  )
}

function DetailBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: '#9040c00e', border: '1px solid #9040c030',
      borderRadius: 8, padding: '14px 16px',
      fontSize: 13, color: '#a090b0', lineHeight: 1.65,
    }}>
      {children}
    </div>
  )
}

function ContinueButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} style={{
      padding: '13px 32px', borderRadius: 8, fontSize: 13, fontWeight: 'bold',
      border: '1px solid #9040c088', background: '#9040c018',
      color: '#c8a0e8', cursor: 'pointer', fontFamily: 'Georgia, serif',
      letterSpacing: 1, width: '100%',
    }}>
      {label} →
    </button>
  )
}
