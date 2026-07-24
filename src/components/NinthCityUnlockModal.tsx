import { useState } from 'react'

interface Props {
  onComplete: () => void
}

type Step =
  | 'announce'
  | 'biohazard'
  | 'draft'
  | 'event-fortify'
  | 'event-control'
  | 'event-riot'
  | 'event-resistance'
  | 'done'

const STEPS: Step[] = [
  'announce',
  'biohazard',
  'draft',
  'event-fortify',
  'event-control',
  'event-riot',
  'event-resistance',
  'done',
]

export default function NinthCityUnlockModal({ onComplete }: Props) {
  const [stepIdx, setStepIdx] = useState(0)
  const step = STEPS[stepIdx]

  function next() {
    if (stepIdx + 1 >= STEPS.length) {
      onComplete()
    } else {
      setStepIdx(i => i + 1)
    }
  }

  if (step === 'done') {
    onComplete()
    return null
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 3000,
      background: 'radial-gradient(ellipse at center, #0d0508 0%, #000000 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Georgia, serif',
    }}>
      <div style={{ width: 540, maxWidth: '94vw', color: '#E8DCC8', textAlign: 'center', padding: 24 }}>
        {step === 'announce' && <AnnounceStep onNext={next} />}
        {step === 'biohazard' && <BiohazardStep onNext={next} />}
        {step === 'draft' && <DraftStep onNext={next} />}
        {step === 'event-fortify' && <EventStep
          icon="🛡" color="#3d9aef" name="Fortify (×2)"
          description="Choose a territory you control. Place 2 troops on it immediately. Removed from the game after use."
          onNext={next}
        />}
        {step === 'event-control' && <EventStep
          icon="🏛" color="#b06cd0" name="Control the People (×2)"
          description="Choose a city you control. Its owner gains 1 Red Star immediately. Removed from the game after use."
          onNext={next}
        />}
        {step === 'event-riot' && <EventStep
          icon="🔥" color="#e05a30" name="Riot (×1)"
          description="Each player rolls 1 die. The lowest roll loses 2 troops from any territory (min 1 remains). Ties re-roll."
          onNext={next}
        />}
        {step === 'event-resistance' && <EventStep
          icon="✊" color="#d4a020" name="Resistance (×2)"
          description="The player with the fewest territories gains 3 troops to place anywhere. Removed from the game after use."
          onNext={next}
          isLast
        />}
      </div>
    </div>
  )
}

function AnnounceStep({ onNext }: { onNext: () => void }) {
  return (
    <div style={{ animation: 'fadeIn 0.8s ease' }}>
      <div style={{ fontSize: 64, marginBottom: 8 }}>🌍</div>
      <div style={{
        fontSize: 11, letterSpacing: 4, color: '#8a5a20', textTransform: 'uppercase', marginBottom: 20,
      }}>
        Campaign Milestone
      </div>
      <h1 style={{
        fontSize: 38, fontWeight: 'bold', color: '#e8c060',
        textShadow: '0 0 40px #c8900a88, 0 0 80px #c8900a44',
        margin: '0 0 16px', letterSpacing: 2,
      }}>
        The World is Changing
      </h1>
      <div style={{ width: 80, height: 2, background: '#c8900a66', margin: '0 auto 24px' }} />
      <p style={{ color: '#c0a870', fontSize: 15, lineHeight: 1.7, margin: '0 0 32px' }}>
        The 9th city has risen. Civilization has spread to every corner of the world —
        and with it comes new conflict, new power, and new rules that will shape
        the fate of this campaign forever.
      </p>
      <p style={{ color: '#7a6040', fontSize: 13, marginBottom: 36 }}>
        The following changes take effect starting next game.
      </p>
      <ContinueButton onClick={onNext} label="Reveal What Has Changed" />
    </div>
  )
}

function BiohazardStep({ onNext }: { onNext: () => void }) {
  return (
    <RevealCard
      icon="☣"
      iconColor="#44dd44"
      glowColor="#44dd44"
      title="Biohazard Scars Unleashed"
      subtitle="New Scar Card Unlocked"
      subtitleColor="#44dd44"
      onNext={onNext}
    >
      <p style={{ color: '#c0a870', fontSize: 14, lineHeight: 1.7, margin: '0 0 16px' }}>
        <strong style={{ color: '#44dd44' }}>3 Biohazard scar cards</strong> are added to
        the scar deck immediately.
      </p>
      <DetailBox color="#44dd44">
        A territory with a Biohazard scar loses 1 troop at the start of its owner's turn.
        If it reaches 1 troop, the territory becomes unoccupied — claimed by no one.
      </DetailBox>
      <p style={{ color: '#7a6040', fontSize: 12, marginTop: 12 }}>
        Biohazard scars are dealt alongside bunker and ammo shortage cards going forward.
      </p>
    </RevealCard>
  )
}

function DraftStep({ onNext }: { onNext: () => void }) {
  return (
    <RevealCard
      icon="🎲"
      iconColor="#e8c060"
      glowColor="#c8900a"
      title="Draft Order Unlocked"
      subtitle="New Game Setup Rule"
      subtitleColor="#e8c060"
      onNext={onNext}
    >
      <p style={{ color: '#c0a870', fontSize: 14, lineHeight: 1.7, margin: '0 0 16px' }}>
        All future games now begin with a <strong style={{ color: '#e8c060' }}>Draft Phase</strong>.
        Players roll to determine order — the lowest roll picks first.
      </p>
      <DetailBox color="#e8c060">
        <strong>Pick order → Troops → Coins</strong>
        <br />
        1st pick: 10 troops, 2 coins &nbsp;·&nbsp; 2nd: 10 troops, 1 coin
        <br />
        3rd: 8 troops, 1 coin &nbsp;·&nbsp; 4th: 8 troops, 0 coins &nbsp;·&nbsp; 5th: 6 troops, 0 coins
      </DetailBox>
      <p style={{ color: '#7a6040', fontSize: 12, marginTop: 12 }}>
        Each player drafts a faction and a starting territory. No two players may start in the same territory.
      </p>
    </RevealCard>
  )
}

function EventStep({
  icon, color, name, description, onNext, isLast,
}: {
  icon: string; color: string; name: string; description: string
  onNext: () => void; isLast?: boolean
}) {
  return (
    <RevealCard
      icon={icon}
      iconColor={color}
      glowColor={color}
      title={name}
      subtitle="New Event Card Added to Deck"
      subtitleColor={color}
      onNext={onNext}
      nextLabel={isLast ? 'Begin Campaign Transformation' : undefined}
    >
      <DetailBox color={color}>{description}</DetailBox>
    </RevealCard>
  )
}

function RevealCard({
  icon, iconColor, glowColor, title, subtitle, subtitleColor, children, onNext, nextLabel,
}: {
  icon: string; iconColor: string; glowColor: string
  title: string; subtitle: string; subtitleColor: string
  children: React.ReactNode
  onNext: () => void; nextLabel?: string
}) {
  return (
    <div style={{
      background: 'linear-gradient(155deg, #140a02 0%, #0a0500 100%)',
      border: `1px solid ${glowColor}44`,
      borderRadius: 16,
      padding: '36px 32px 28px',
      boxShadow: `0 0 60px ${glowColor}18, 0 12px 60px rgba(0,0,0,0.9)`,
    }}>
      <div style={{ fontSize: 52, color: iconColor, marginBottom: 12, lineHeight: 1 }}>{icon}</div>
      <div style={{ fontSize: 10, color: subtitleColor, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 10 }}>
        {subtitle}
      </div>
      <h2 style={{ fontSize: 26, color: '#e8dcc8', margin: '0 0 8px', letterSpacing: 1 }}>{title}</h2>
      <div style={{ width: 50, height: 1, background: `${glowColor}60`, margin: '0 auto 20px' }} />
      <div style={{ textAlign: 'left' }}>{children}</div>
      <div style={{ marginTop: 24 }}>
        <ContinueButton onClick={onNext} label={nextLabel ?? 'Continue'} />
      </div>
    </div>
  )
}

function DetailBox({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: `${color}0e`,
      border: `1px solid ${color}30`,
      borderRadius: 8,
      padding: '12px 16px',
      fontSize: 13,
      color: '#a09070',
      lineHeight: 1.6,
    }}>
      {children}
    </div>
  )
}

function ContinueButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '13px 32px',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 'bold',
        border: '1px solid #c8900a88',
        background: '#c8900a18',
        color: '#e8c060',
        cursor: 'pointer',
        fontFamily: 'Georgia, serif',
        letterSpacing: 1,
        width: '100%',
      }}
    >
      {label} →
    </button>
  )
}
