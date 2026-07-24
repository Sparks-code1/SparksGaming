import { useState } from 'react'
import type { Territory, ScarType } from '@/types/territory'
import type { ScarCard } from '@/data/scarCards'
import { SCAR_META } from '@/lib/legacyApi'
import BiohazardIcon from './BiohazardIcon'

interface Props {
  territory: Territory
  gameNumber: number
  /** When provided, only this card's scar type can be placed (no player choice) */
  card?: ScarCard
  onPlace: (type: ScarType) => void
  onSkip: () => void
}

export default function ScarModal({ territory, gameNumber, card, onPlace, onSkip }: Props) {
  const [selected, setSelected] = useState<ScarType | null>(card?.type ?? null)
  const existingTypes = new Set(territory.scars.map(s => s.type))

  const cardMeta = card ? SCAR_META.find(m => m.type === card.type) : null

  // Card mode: single scar, just confirm placement location
  if (card && cardMeta) {
    const alreadyHas = existingTypes.has(card.type)
    const needsCity = card.type === 'fortification'
    const hasCity = territory.cities.some(c => !c.isDestroyed && !c.headquartersFactionId)
    const blockedNoCity = needsCity && !hasCity
    return (
      <div style={{
        position: 'fixed', inset: 0,
        background: 'rgba(5,2,0,0.80)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1100, fontFamily: 'Georgia, serif',
      }}>
        <div style={{
          background: 'linear-gradient(155deg, #1A0A02 0%, #0E0500 100%)',
          border: `2px solid ${cardMeta.color}88`,
          borderRadius: 13, padding: '26px 28px 22px',
          width: 420, maxWidth: '92vw', color: '#E8DCC8',
          boxShadow: '0 12px 50px rgba(0,0,0,0.85)',
        }}>
          {/* Card header */}
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 30, marginBottom: 6, display: 'flex', justifyContent: 'center' }}>
              {card.type === 'biological'
                ? <BiohazardIcon size={48} color={cardMeta.color} />
                : cardMeta.icon}
            </div>
            <div style={{ fontSize: 18, fontWeight: 'bold', color: cardMeta.color, letterSpacing: 1 }}>
              {card.name} Card
            </div>
            <div style={{ fontSize: 11, color: '#7a6040', marginTop: 4, letterSpacing: 0.8 }}>
              {card.triggerDescription}
            </div>
          </div>

          {/* Scar effect */}
          <div style={{
            padding: '12px 14px', borderRadius: 8, marginBottom: 18,
            background: `${cardMeta.color}12`, border: `1px solid ${cardMeta.color}35`,
          }}>
            <div style={{ fontSize: 12, color: cardMeta.color, fontWeight: 'bold', marginBottom: 4 }}>
              {cardMeta.label} — Permanent Effect
            </div>
            <div style={{ fontSize: 11, color: '#9a8060', lineHeight: 1.45 }}>{cardMeta.effect}</div>
          </div>

          {/* Territory target */}
          <div style={{
            padding: '10px 14px', borderRadius: 7, marginBottom: 18,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(200,148,10,0.20)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 16, color: '#C8940A' }}>📍</span>
            <div>
              <div style={{ fontSize: 13, color: '#E8DCC8', fontWeight: 'bold' }}>{territory.name}</div>
              <div style={{ fontSize: 10, color: blockedNoCity ? '#c04040' : '#6a5030' }}>
                {alreadyHas
                  ? `Already has ${cardMeta.label} — choose a different territory`
                  : blockedNoCity
                  ? 'Fortification can only be placed on a territory with a city'
                  : `Will receive a permanent ${cardMeta.label} scar`}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onSkip} style={ghostBtn}>
              {alreadyHas || blockedNoCity ? 'Choose Different Territory' : 'Skip'}
            </button>
            {!alreadyHas && !blockedNoCity && (
              <button onClick={() => onPlace(card.type)} style={confirmBtn(cardMeta.color)}>
                Place {cardMeta.label}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Free-choice mode: player picks any scar type (post-combat, no card)
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(5,2,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1100, fontFamily: 'Georgia, serif',
    }}>
      <div style={{
        background: 'linear-gradient(155deg, #1A0A02 0%, #0E0500 100%)',
        border: '2px solid rgba(200,148,10,0.60)',
        borderRadius: 13, padding: '26px 28px 22px',
        width: 480, maxWidth: '92vw', color: '#E8DCC8',
        boxShadow: '0 12px 50px rgba(0,0,0,0.85)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 19, fontWeight: 'bold', color: '#C8940A', letterSpacing: 1 }}>
            ⚡ PLACE SCAR
          </div>
          <div style={{ fontSize: 12, color: '#9a8060', marginTop: 4 }}>
            Battle has scarred <strong style={{ color: '#E8DCC8' }}>{territory.name}</strong>.
            <br />Choose a permanent effect to mark this territory.
          </div>
          <div style={{ fontSize: 10, color: '#5a4a30', marginTop: 3 }}>Game #{gameNumber}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {SCAR_META.filter(m => m.type !== 'fortification').map(meta => {
            const alreadyHas = existingTypes.has(meta.type)
            const isBlocked = alreadyHas
            const isSelected = selected === meta.type
            return (
              <button
                key={meta.type}
                onClick={() => !isBlocked && setSelected(meta.type)}
                disabled={isBlocked}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '11px 14px', borderRadius: 8, textAlign: 'left',
                  border: isSelected
                    ? `2px solid ${meta.color}`
                    : `1px solid ${isBlocked ? 'rgba(80,60,30,0.30)' : 'rgba(200,148,10,0.20)'}`,
                  background: isSelected
                    ? `${meta.color}1E`
                    : isBlocked ? 'rgba(30,15,0,0.40)' : 'rgba(255,255,255,0.03)',
                  cursor: isBlocked ? 'not-allowed' : 'pointer',
                  opacity: isBlocked ? 0.45 : 1,
                  fontFamily: 'Georgia, serif',
                }}
              >
                {meta.type === 'biological'
                  ? <BiohazardIcon size={24} color={isSelected ? meta.color : alreadyHas ? '#3a5a3a' : meta.color} />
                  : <span style={{ fontSize: 22, flexShrink: 0, lineHeight: 1 }}>{meta.icon}</span>
                }
                <div>
                  <div style={{ fontSize: 13, fontWeight: 'bold', color: isSelected ? meta.color : '#E8DCC8', marginBottom: 2 }}>
                    {meta.label}
                    {alreadyHas && <span style={{ fontSize: 10, color: '#5a4a30', marginLeft: 8 }}>already placed</span>}
                  </div>
                  <div style={{ fontSize: 11, color: '#8a7050', lineHeight: 1.4 }}>{meta.effect}</div>
                </div>
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onSkip} style={ghostBtn}>Skip</button>
          <button
            onClick={() => selected && onPlace(selected)}
            disabled={!selected}
            style={selected
              ? confirmBtn(SCAR_META.find(m => m.type === selected)!.color)
              : { ...confirmBtn('#4a3a20'), cursor: 'not-allowed', opacity: 0.5 }
            }
          >
            {selected ? `Place ${SCAR_META.find(m => m.type === selected)!.label}` : 'Select a scar'}
          </button>
        </div>
      </div>
    </div>
  )
}

const ghostBtn: React.CSSProperties = {
  flex: 1, padding: '10px', borderRadius: 6,
  border: '1px solid rgba(200,148,10,0.25)', background: 'transparent',
  color: '#6a5a40', cursor: 'pointer', fontSize: 12, fontFamily: 'Georgia, serif',
}

const confirmBtn = (color: string): React.CSSProperties => ({
  flex: 2, padding: '10px', borderRadius: 6,
  border: `2px solid ${color}BB`,
  background: `${color}22`,
  color,
  fontSize: 13, fontWeight: 'bold', fontFamily: 'Georgia, serif', cursor: 'pointer',
})
