import { useState } from 'react'
import type { Player } from '@/types/player'
import type { LegacyState } from '@/types/legacy'
import { TERRITORY_CARDS } from '@/data/cards'
import { TERRITORY_DEFINITIONS } from '@/data/territoryData'
import { FACTION_COLORS } from '@/data/mockGameState'
import type { FactionId } from '@/types/faction'

const SUIT_ICON: Record<string, string> = {
  soldiers: '⚔',
  cavalry: '🐴',
  artillery: '💣',
}

const SUIT_COLOR: Record<string, string> = {
  soldiers: '#E67E22',
  cavalry: '#2980B9',
  artillery: '#8E44AD',
}

const CONTINENT_ORDER = [
  'north-america', 'south-america', 'europe', 'africa', 'asia', 'australia',
]

const CONTINENT_LABELS: Record<string, string> = {
  'north-america': 'North America',
  'south-america': 'South America',
  'europe': 'Europe',
  'africa': 'Africa',
  'asia': 'Asia',
  'australia': 'Australia',
}

const CONTINENT_COLOR: Record<string, string> = {
  'north-america': '#E67E22',
  'south-america': '#27AE60',
  'europe': '#2980B9',
  'africa': '#E74C3C',
  'asia': '#8E44AD',
  'australia': '#F39C12',
}

interface Props {
  player: Player
  playerIndex: number
  totalPlayers: number
  legacyState: LegacyState
  onComplete: (cardId: string) => void
  onSkip: () => void
}

function hexToRgb(hex: number) {
  return `rgb(${(hex >> 16) & 0xff},${(hex >> 8) & 0xff},${hex & 0xff})`
}

function coinDots(count: number, max: number = 6) {
  const filled = Math.min(count, max)
  return (
    <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} style={{
          width: 7, height: 7, borderRadius: '50%',
          background: i < filled ? '#C8940A' : 'rgba(200,148,10,0.15)',
          border: `1px solid ${i < filled ? '#C8940A' : 'rgba(200,148,10,0.30)'}`,
          flexShrink: 0,
        }} />
      ))}
    </span>
  )
}

export default function CardUpgradeScreen({ player, playerIndex, totalPlayers, legacyState, onComplete, onSkip }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const { r, g, b } = (() => {
    const hex = FACTION_COLORS[player.factionId as FactionId] ?? 0x888888
    return { r: (hex >> 16) & 0xff, g: (hex >> 8) & 0xff, b: hex & 0xff }
  })()
  const factionColor = `rgb(${r},${g},${b})`

  const removedIds = new Set(legacyState.removedCardIds ?? [])
  const cardResources = legacyState.cardResources ?? {}
  const query = search.trim().toLowerCase()

  // Group available (non-removed) territory cards by continent
  const byContinent: Record<string, Array<{ card: typeof TERRITORY_CARDS[0]; def: typeof TERRITORY_DEFINITIONS[0]; coins: number }>> = {}

  for (const card of TERRITORY_CARDS) {
    if (removedIds.has(card.id)) continue
    const def = TERRITORY_DEFINITIONS.find(d => d.id === card.territoryId)
    if (!def) continue
    if (query && !def.name.toLowerCase().includes(query)) continue
    const coins = cardResources[card.id] ?? 1
    if (!byContinent[def.continentId]) byContinent[def.continentId] = []
    byContinent[def.continentId].push({ card, def, coins })
  }

  const selectedCard = selected ? TERRITORY_CARDS.find(c => c.id === selected) : null
  const selectedDef = selectedCard ? TERRITORY_DEFINITIONS.find(d => d.id === selectedCard.territoryId) : null
  const selectedCoins = selected ? (cardResources[selected] ?? 1) : 0
  const atMax = selectedCoins >= 6

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2500, overflowY: 'auto',
      background: `radial-gradient(ellipse at center, rgba(${r},${g},${b},0.12) 0%, rgba(3,1,0,0.97) 65%)`,
      fontFamily: 'Georgia, serif', color: '#E8DCC8',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
    }}>
      <div style={{ width: 680, maxWidth: '96vw', padding: '36px 0 60px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 11, letterSpacing: 4, color: '#C8940A', textTransform: 'uppercase', marginBottom: 10 }}>
            ✦ Territory Card Upgrade · {playerIndex} of {totalPlayers} ✦
          </div>
          <div style={{ fontSize: 30, fontWeight: 'bold', color: factionColor, marginBottom: 4 }}>
            {player.name}
          </div>
          <div style={{ fontSize: 13, color: `rgba(${r},${g},${b},0.65)`, marginBottom: 16 }}>
            Survived the campaign game — choose any territory card to permanently upgrade
          </div>
          <div style={{
            display: 'inline-block', padding: '8px 20px', borderRadius: 8,
            background: 'rgba(200,148,10,0.08)', border: '1px solid rgba(200,148,10,0.30)',
            fontSize: 12, color: '#9a8050', lineHeight: 1.5,
          }}>
            Adds +1 coin sticker to the chosen card (max 6). Applies to all future draws and trade-ins.
          </div>
        </div>

        {/* Selected card preview */}
        <div style={{
          padding: '14px 18px', borderRadius: 10, marginBottom: 20,
          background: selected
            ? `rgba(${r},${g},${b},0.10)`
            : 'rgba(0,0,0,0.25)',
          border: selected
            ? `2px solid rgba(${r},${g},${b},0.55)`
            : '2px dashed rgba(200,148,10,0.25)',
          display: 'flex', alignItems: 'center', gap: 16, minHeight: 62,
        }}>
          {selected && selectedDef && selectedCard ? (
            <>
              <span style={{ fontSize: 24 }}>{SUIT_ICON[selectedCard.suit]}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 'bold', color: '#E8DCC8' }}>{selectedDef.name}</div>
                <div style={{ fontSize: 11, color: '#8a7040', marginTop: 2 }}>
                  {CONTINENT_LABELS[selectedDef.continentId] ?? selectedDef.continentId}
                  &nbsp;·&nbsp;
                  <span style={{ color: SUIT_COLOR[selectedCard.suit] }}>{selectedCard.suit}</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#6a5030', marginBottom: 4 }}>Current → After upgrade</div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {coinDots(selectedCoins)}
                  <span style={{ color: '#27AE60', fontSize: 14, fontWeight: 'bold' }}>→</span>
                  {atMax
                    ? <span style={{ fontSize: 11, color: '#E74C3C', fontStyle: 'italic' }}>At maximum (6)</span>
                    : coinDots(selectedCoins + 1)
                  }
                </div>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: '#4a3820', fontStyle: 'italic', width: '100%', textAlign: 'center' }}>
              ← Select a card below to preview the upgrade
            </div>
          )}
        </div>

        {/* Search */}
        <input
          placeholder="Search territory cards..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', padding: '9px 14px', borderRadius: 7, marginBottom: 16,
            border: '1px solid rgba(200,148,10,0.30)', background: 'rgba(0,0,0,0.35)',
            color: '#E8DCC8', fontSize: 12, fontFamily: 'Georgia, serif',
            boxSizing: 'border-box',
          }}
        />

        {/* Card grid by continent */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 24 }}>
          {CONTINENT_ORDER.map(contId => {
            const cards = byContinent[contId]
            if (!cards || cards.length === 0) return null
            const contColor = CONTINENT_COLOR[contId] ?? '#888'
            return (
              <div key={contId}>
                <div style={{
                  fontSize: 10, letterSpacing: 2.5, color: contColor,
                  textTransform: 'uppercase', marginBottom: 8,
                  paddingBottom: 5, borderBottom: `1px solid rgba(${contColor.slice(4, -1)},0.20)`,
                }}>
                  {CONTINENT_LABELS[contId]}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
                  {cards.map(({ card, def, coins }) => {
                    const isSelected = selected === card.id
                    const isFull = coins >= 6
                    const suitColor = SUIT_COLOR[card.suit] ?? '#888'
                    return (
                      <button
                        key={card.id}
                        onClick={() => !isFull && setSelected(isSelected ? null : card.id)}
                        disabled={isFull}
                        style={{
                          padding: '8px 10px', borderRadius: 7, textAlign: 'left',
                          cursor: isFull ? 'not-allowed' : 'pointer',
                          background: isSelected
                            ? `rgba(${r},${g},${b},0.18)`
                            : isFull ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.28)',
                          border: isSelected
                            ? `1.5px solid rgba(${r},${g},${b},0.80)`
                            : isFull ? '1px solid rgba(100,80,40,0.15)' : '1px solid rgba(100,80,40,0.30)',
                          opacity: isFull ? 0.40 : 1,
                          fontFamily: 'Georgia, serif',
                          transition: 'background 0.12s, border-color 0.12s',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                          <span style={{ fontSize: 12, color: suitColor }}>{SUIT_ICON[card.suit]}</span>
                          <span style={{ fontSize: 11, color: isSelected ? factionColor : '#C8A060', fontWeight: isSelected ? 'bold' : 'normal', flex: 1, lineHeight: 1.2 }}>
                            {def.name}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {coinDots(coins)}
                          {isFull && <span style={{ fontSize: 8, color: '#6a4020' }}>MAX</span>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button
            onClick={onSkip}
            style={{
              padding: '11px 24px', borderRadius: 7, fontSize: 12,
              border: '1px solid rgba(100,80,40,0.35)', background: 'transparent',
              color: '#6a5030', cursor: 'pointer', fontFamily: 'Georgia, serif',
            }}
          >
            Skip (take nothing)
          </button>
          <button
            onClick={() => selected && !atMax && onComplete(selected)}
            disabled={!selected || atMax}
            style={{
              padding: '11px 32px', borderRadius: 7, fontSize: 13, fontWeight: 'bold',
              border: `1.5px solid ${selected && !atMax ? `rgba(${r},${g},${b},0.70)` : 'rgba(100,80,40,0.25)'}`,
              background: selected && !atMax ? `rgba(${r},${g},${b},0.18)` : 'rgba(60,40,10,0.40)',
              color: selected && !atMax ? factionColor : 'rgba(140,110,50,0.40)',
              cursor: selected && !atMax ? 'pointer' : 'not-allowed',
              fontFamily: 'Georgia, serif',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {selected && selectedDef ? `✦ Upgrade ${selectedDef.name}` : 'Select a Card to Upgrade'}
          </button>
        </div>
      </div>
    </div>
  )
}
