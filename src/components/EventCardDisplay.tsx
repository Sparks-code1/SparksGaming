import type { EventCard } from '@/types/card'
import type { EventEffect } from '@/data/cards'
import DraggableResizable from './DraggableResizable'

interface Props {
  card: EventCard
  effect: EventEffect
  roundNumber: number
  onDismiss: () => void
}

const EFFECT_ICON: Record<string, string> = {
  'population-boom':     '🌱',
  'ammunition-shortage': '⚠',
  'ceasefire':           '🕊',
  'arms-race':           '⚡',
  'epidemic':            '☣',
  'nuclear-fallout-round': '☢',
  'forced-march':        '🚶',
  'famine':              '🌾',
  'fortify-city':        '🛡',
  'control-the-people':  '🏛',
  'riot':                '🔥',
  'resistance':          '✊',
  'join-the-cause':      '🫂',
  'die-humans':          '👽',
  'beam-down':           '🛸',
  'mysterious-island':   '🏝',
  'fallout-event':       '☢',
  'agent-of-chaos':      '🃏',
  'mutants-evolve':      '🧬',
}

const EFFECT_COLOR: Record<string, string> = {
  'population-boom':     '#27AE60',
  'ammunition-shortage': '#E67E22',
  'ceasefire':           '#2980B9',
  'arms-race':           '#8E44AD',
  'epidemic':            '#27AE60',
  'nuclear-fallout-round': '#F1C40F',
  'forced-march':        '#16A085',
  'famine':              '#E74C3C',
  'fortify-city':        '#3d9aef',
  'control-the-people':  '#b06cd0',
  'riot':                '#e05a30',
  'resistance':          '#d4a020',
  'join-the-cause':      '#9040c0',
  'die-humans':          '#00c8a0',
  'beam-down':           '#00c8a0',
  'mysterious-island':   '#00c8a0',
  'fallout-event':       '#F1C40F',
  'agent-of-chaos':      '#9acd32',
  'mutants-evolve':      '#9acd32',
}

const EFFECT_DURATION: Record<string, string> = {
  'population-boom':     'Applies this round only',
  'ammunition-shortage': 'Lasts the entire round',
  'ceasefire':           'Lasts the entire round',
  'arms-race':           'Applies this round only',
  'epidemic':            'Immediate effect',
  'nuclear-fallout-round': 'Lasts the entire round',
  'forced-march':        'Lasts the entire round',
  'famine':              'Immediate effect',
  'fortify-city':        'Largest population chooses — immediate',
  'control-the-people':  'Largest population chooses — immediate',
  'riot':                'Immediate — each player rolls',
  'resistance':          'Immediate effect',
  'join-the-cause':      'Largest population player chooses',
  'die-humans':          'Alien player chooses — immediate',
  'beam-down':           'Aliens choose — immediate',
  'mysterious-island':   'Alien Island controller draws',
  'fallout-event':       'Immediate — applied now',
  'agent-of-chaos':      'Checked immediately',
  'mutants-evolve':      'Mutants choose — permanent',
}

export default function EventCardDisplay({ card, effect, roundNumber, onDismiss }: Props) {
  const color = EFFECT_COLOR[effect.kind] ?? '#C8940A'
  const icon  = EFFECT_ICON[effect.kind] ?? '🃏'

  return (
    <DraggableResizable
      title={`🃏 ${card.name}`}
      accentColor={color}
      width={460}
      storageKey="event-card"
      zIndex={1050}
      onClose={onDismiss}
    >
      <div style={{ textAlign: 'center' }}>
        {/* Round indicator */}
        <div style={{ fontSize: 10, color: '#5a4020', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16 }}>
          Round {roundNumber} · Global Event
        </div>

        {/* Big icon */}
        <div style={{ fontSize: 52, marginBottom: 12, lineHeight: 1 }}>{icon}</div>

        {/* Card name */}
        <div style={{ fontSize: 22, fontWeight: 'bold', color, letterSpacing: 1, marginBottom: 8 }}>
          {card.name}
        </div>

        {/* Decorative rule */}
        <div style={{ width: 60, height: 1, background: `${color}60`, margin: '0 auto 16px' }} />

        {/* Description */}
        <div style={{
          fontSize: 13, color: '#c0a870', lineHeight: 1.6, marginBottom: 18,
          padding: '0 8px',
        }}>
          {card.description}
        </div>

        {/* Effect badge */}
        <div style={{
          display: 'inline-block', padding: '5px 16px', borderRadius: 20,
          background: `${color}15`, border: `1px solid ${color}40`,
          fontSize: 10, color, letterSpacing: 1, textTransform: 'uppercase',
          marginBottom: 24,
        }}>
          {EFFECT_DURATION[effect.kind] ?? 'One-time effect'}
        </div>

        {/* Specific effect details */}
        {effect.kind === 'population-boom' && (
          <EffectDetail color={color}>
            Each player receives <strong>+{effect.bonusTroops} bonus troops</strong> during this round's Draft phase.
          </EffectDetail>
        )}
        {effect.kind === 'arms-race' && (
          <EffectDetail color={color}>
            The player with the <strong>fewest territories</strong> receives <strong>+{effect.bonusTroops} bonus troops</strong> during Draft.
          </EffectDetail>
        )}
        {effect.kind === 'ammunition-shortage' && (
          <EffectDetail color={color}>
            Defender's <strong>highest die is reduced by 1</strong> for all attacks this round.
          </EffectDetail>
        )}
        {effect.kind === 'ceasefire' && (
          <EffectDetail color={color}>
            <strong>No attacks</strong> may be launched this round. All players skip the attack phase.
          </EffectDetail>
        )}
        {effect.kind === 'epidemic' && (
          <EffectDetail color={color}>
            All territories with a <strong>Biohazard ☣ scar</strong> immediately lose 1 troop (minimum 1). Applied now.
          </EffectDetail>
        )}
        {effect.kind === 'famine' && (
          <EffectDetail color={color}>
            All <strong>African territories</strong> immediately lose 1 troop (minimum 1). Applied now.
          </EffectDetail>
        )}
        {effect.kind === 'forced-march' && (
          <EffectDetail color={color}>
            Each player may make <strong>up to 2 fortify moves</strong> this round instead of 1.
          </EffectDetail>
        )}
        {effect.kind === 'nuclear-fallout-round' && (
          <EffectDetail color={color}>
            Attacks and defenses on <strong>Nuclear Fallout ☢ or Radiation territories</strong> cost 1 extra troop this round.
          </EffectDetail>
        )}
        {effect.kind === 'fortify-city' && (
          <EffectDetail color={color}>
            The player with the <strong>largest population</strong> chooses one:
            <br />• <strong>+{effect.troops} troops</strong> into each of <strong>2 different cities</strong> they control
            <br />• <strong>Permanently fortify</strong> one city they control
            <br />
            <br />The fortification spends one of the campaign's <strong>5</strong> — it cannot be chosen once
            they are gone — and <strong>destroys this card for the whole campaign</strong>.
            Taking the troops only discards it, so it returns in later games.
          </EffectDetail>
        )}
        {effect.kind === 'control-the-people' && (
          <EffectDetail color={color}>
            The player with the <strong>largest population</strong> chooses one reward:
            gain <strong>5 troops in any one city</strong> they control, or make one
            <strong> immediate maneuver</strong> (move troops to a connected territory).
            This card is <strong>removed from the game</strong> after use.
          </EffectDetail>
        )}
        {effect.kind === 'riot' && (
          <EffectDetail color={color}>
            Each player rolls 1 die. The player with the <strong>lowest roll loses 2 troops</strong> from
            a single territory of their choice (minimum 1 remains). Ties re-roll.
          </EffectDetail>
        )}
        {effect.kind === 'resistance' && (
          <EffectDetail color={color}>
            The player controlling the <strong>fewest territories</strong> immediately gains
            <strong> +{effect.troops} troops</strong> to place anywhere.
            This card is <strong>removed from the game</strong> after use.
          </EffectDetail>
        )}
        {effect.kind === 'join-the-cause' && (
          <EffectDetail color={color}>
            Calculate each player's <strong>population</strong>: territories owned + 1 per minor city + 2 per major city.
            The player with the <strong>largest population</strong> chooses one:
            <br />• <strong>+3 troops</strong> placed in any cities they control
            <br />• Pick any <strong>available mission</strong> to replace their current one
          </EffectDetail>
        )}
        {effect.kind === 'die-humans' && (
          <EffectDetail color={color}>
            The <strong>Alien player</strong> may replace a <strong>minor city</strong> with a Ruin.
            All troops there are removed, any HQ is demolished, and any fortification is destroyed.
            If used, this card is <strong>destroyed forever</strong>.
          </EffectDetail>
        )}
        {effect.kind === 'beam-down' && (
          <EffectDetail color={color}>
            The <strong>Aliens</strong> place <strong>{effect.troops} troops</strong> into any unoccupied city
            — no population edge required.
          </EffectDetail>
        )}
        {effect.kind === 'mysterious-island' && (
          <EffectDetail color={color}>
            The controller of <strong>Alien Island</strong> immediately draws a face-up territory card
            from the sideboard — an exception to the one-draw-per-turn rule.
          </EffectDetail>
        )}
        {effect.kind === 'fallout-event' && (
          <EffectDetail color={color}>
            Each territory connected to the <strong>Fallout Zone by land</strong> immediately loses
            <strong> 1 die of troops</strong> (a d6 is rolled per territory, minimum 1 troop remains).
            Mutants are immune. This card is <strong>destroyed forever</strong>.
          </EffectDetail>
        )}
        {effect.kind === 'agent-of-chaos' && (
          <EffectDetail color={color}>
            If <strong>no human faction</strong> currently holds a continent bonus,
            the <strong>Mutants</strong> immediately gain <strong>1 Red Star token</strong>.
          </EffectDetail>
        )}
        {effect.kind === 'mutants-evolve' && (
          <EffectDetail color={color}>
            The <strong>Mutants</strong> pick <strong>Offensive or Defensive</strong>, and
            <strong> Brains or Brawn</strong>. The pairing reveals a hidden permanent Mutant power —
            you can't predict which power you'll get.
          </EffectDetail>
        )}

        <button
          onClick={onDismiss}
          style={{
            width: '100%', padding: '13px',
            borderRadius: 8, fontSize: 14, fontWeight: 'bold',
            border: `2px solid ${color}88`,
            background: `${color}18`,
            color: '#E8DCC8', cursor: 'pointer', fontFamily: 'Georgia, serif',
            letterSpacing: 0.5, marginTop: 4,
          }}
        >
          Acknowledge &amp; Continue
        </button>
      </div>
    </DraggableResizable>
  )
}

function EffectDetail({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 7, marginBottom: 16,
      background: `${color}0C`, border: `1px solid ${color}25`,
      fontSize: 12, color: '#9a8060', lineHeight: 1.5, textAlign: 'left',
    }}>
      {children}
    </div>
  )
}
