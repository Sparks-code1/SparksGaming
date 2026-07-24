import type { LegacyState, DealtScar } from '@/types/legacy'
import type { Player } from '@/types/player'
import { SCAR_CARDS, getScarCard } from '@/data/scarCards'
import { SCAR_META } from '@/lib/legacyApi'
import { FACTION_COLORS } from '@/data/mockGameState'

interface Props {
  legacy: LegacyState
  /** The deals for THIS game (already saved to legacy.dealtScars) */
  gameDeals: DealtScar[]
  players: Player[]
  onContinue: () => void
}

export default function ScarDealingScreen({ legacy, gameDeals, players, onContinue }: Props) {
  const gameNumber = legacy.currentGameNumber
  const remaining = legacy.scarDeck.length
  const totalCards = SCAR_CARDS.length

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: 'radial-gradient(ellipse at center, #1A0E04 0%, #080400 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Georgia, serif',
    }}>
      <div style={{
        background: 'linear-gradient(155deg, #1A0E02 0%, #0A0600 100%)',
        border: '2px solid rgba(200,148,10,0.60)',
        borderRadius: 14, padding: '32px 36px 28px',
        width: 560, maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto',
        color: '#E8DCC8',
        boxShadow: '0 16px 60px rgba(0,0,0,0.90)',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 'bold', color: '#C8940A', letterSpacing: 1.5 }}>
            🃏 SCAR CARD DEAL
          </div>
          <div style={{ fontSize: 13, color: '#7a6040', marginTop: 5 }}>
            Game #{gameNumber} · Each player receives one scar card
          </div>
          <div style={{ fontSize: 11, color: '#5a4020', marginTop: 3 }}>
            {remaining} of {totalCards} cards remain in the campaign pool
          </div>
        </div>

        {/* Pool status bar */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ height: 4, background: 'rgba(200,148,10,0.15)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2,
              width: `${(remaining / totalCards) * 100}%`,
              background: 'linear-gradient(90deg, #C8940A, #F0C040)',
              transition: 'width 0.4s ease',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#5a4020', marginTop: 4 }}>
            <span>Pool empty</span>
            <span>{remaining} remaining</span>
          </div>
        </div>

        {/* Dealt cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {gameDeals.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 13, color: '#5a4020', fontStyle: 'italic' }}>
              No scar cards remain in the pool — no cards dealt this game.
            </div>
          )}
          {gameDeals.map(deal => {
            const player = players.find(p => p.id === deal.playerId)
            const card = getScarCard(deal.cardId)
            const meta = card ? SCAR_META.find(m => m.type === card.type) : null
            if (!card || !meta) return null
            const factionColor = player ? FACTION_COLORS[player.factionId] ?? 0x888888 : 0x888888
            const r = (factionColor >> 16) & 0xff
            const g = (factionColor >> 8) & 0xff
            const b = factionColor & 0xff
            const playerColor = `rgb(${r},${g},${b})`

            return (
              <div key={deal.cardId} style={{
                display: 'flex', alignItems: 'stretch', gap: 0,
                borderRadius: 9, overflow: 'hidden',
                border: `1px solid ${meta.color}45`,
                boxShadow: '0 2px 12px rgba(0,0,0,0.35)',
              }}>
                {/* Player color stripe */}
                <div style={{
                  width: 5, flexShrink: 0,
                  background: playerColor,
                }} />

                {/* Card icon */}
                <div style={{
                  width: 52, flexShrink: 0,
                  background: `${meta.color}18`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 26,
                }}>
                  {meta.icon}
                </div>

                {/* Card info */}
                <div style={{
                  flex: 1, padding: '12px 14px',
                  background: 'rgba(255,255,255,0.03)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 'bold', color: meta.color }}>
                      {card.name}
                    </span>
                    <span style={{
                      fontSize: 9, padding: '2px 8px', borderRadius: 8, marginLeft: 8,
                      background: `${meta.color}18`, border: `1px solid ${meta.color}40`,
                      color: meta.color, letterSpacing: 0.5, textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                    }}>
                      {card.trigger}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#7a6040', marginBottom: 3 }}>
                    <span style={{ color: playerColor, fontWeight: 'bold' }}>
                      {player?.name ?? 'Unknown'}
                    </span>
                    {' '}receives this card
                  </div>
                  <div style={{ fontSize: 10, color: '#5a4030', lineHeight: 1.4 }}>
                    {card.triggerDescription}
                  </div>
                  <div style={{ fontSize: 10, color: '#6a5040', marginTop: 4, fontStyle: 'italic' }}>
                    Effect: {meta.effect}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Deck info */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 10, color: '#5a4020', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8, borderBottom: '1px solid rgba(200,148,10,0.15)', paddingBottom: 5 }}>
            Remaining Pool ({remaining} cards)
          </div>
          {remaining === 0 ? (
            <div style={{ fontSize: 11, color: '#4a3010', fontStyle: 'italic' }}>
              All scar cards have been dealt. No more will be available.
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {legacy.scarDeck.map(cardId => {
                const c = getScarCard(cardId)
                const m = c ? SCAR_META.find(x => x.type === c.type) : null
                return c && m ? (
                  <span key={cardId} style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 8,
                    background: `${m.color}12`, border: `1px solid ${m.color}30`,
                    color: m.color,
                  }}>
                    {m.icon} {c.name}
                  </span>
                ) : null
              })}
            </div>
          )}
        </div>

        {/* Continue to HQ placement */}
        <button onClick={onContinue} style={{
          width: '100%', padding: '14px',
          borderRadius: 8, fontSize: 15, fontWeight: 'bold', letterSpacing: 0.5,
          border: '2px solid rgba(200,148,10,0.70)',
          background: 'rgba(200,148,10,0.18)',
          color: '#E8DCC8', cursor: 'pointer', fontFamily: 'Georgia, serif',
        }}>
          ♛ Continue to HQ Placement →
        </button>

        {gameDeals.some(d => d.placed === false) && (
          <div style={{ textAlign: 'center', fontSize: 10, color: '#5a4020', marginTop: 10 }}>
            Cards are played during the game according to their trigger condition.
          </div>
        )}
      </div>
    </div>
  )
}
