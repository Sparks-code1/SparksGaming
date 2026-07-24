import { useState } from 'react'
import type { Player } from '@/types/player'
import { getTerritoryCard, getMissionCard, getCoinCard, checkMissionComplete, coinTradeInTroops } from '@/data/cards'
import type { GameState } from '@/types/game'
import { TERRITORY_DEFINITIONS } from '@/data/territoryData'

interface Props {
  player: Player
  gameState: GameState
  cardResources: Record<string, number>
  canTradeIn: boolean
  onTradeIn: (cardIds: string[], bonus: number) => void
  /** Spend exactly 4 cards to buy a red star (in-game star toward the 4-star win) */
  onBuyStar: (cardIds: string[]) => void
  onClose: () => void
}

function CoinDots({ count, small }: { count: number; small?: boolean }) {
  const filled = Math.min(count, 6)
  const size = small ? 7 : 9
  return (
    <span style={{ display: 'inline-flex', gap: small ? 2 : 3, alignItems: 'center' }}>
      {Array.from({ length: filled }).map((_, i) => (
        <span key={i} style={{
          width: size, height: size, borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 35%, #F0C040, #C8940A)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.5)',
          flexShrink: 0,
          display: 'inline-block',
        }} />
      ))}
    </span>
  )
}

export default function CardHand({ player, gameState, cardResources, canTradeIn, onTradeIn, onBuyStar, onClose }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // Cards animating out of the hand after a trade-in / star purchase
  const [leavingIds, setLeavingIds] = useState<Set<string>>(new Set())

  const allCardIds = player.cards
  const territoryCards = allCardIds
    .map(id => ({ id, card: getTerritoryCard(id) }))
    .filter((x): x is { id: string; card: NonNullable<ReturnType<typeof getTerritoryCard>> } => x.card !== null && x.card !== undefined)
  const coinCards = allCardIds
    .map(id => ({ id, card: getCoinCard(id) }))
    .filter((x): x is { id: string; card: NonNullable<ReturnType<typeof getCoinCard>> } => x.card !== null && x.card !== undefined)

  const mission = player.missionCardId ? getMissionCard(player.missionCardId) : null
  const missionComplete = mission ? checkMissionComplete(mission.id, gameState, player.id) : false

  function toggleCard(id: string) {
    if (!canTradeIn) return
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const totalCoins = Array.from(selectedIds).reduce((sum, id) => {
    if (getCoinCard(id)) return sum + 1
    return sum + (cardResources[id] ?? 1)
  }, 0)

  const troopReward = coinTradeInTroops(totalCoins)

  function handleConfirmTradeIn() {
    if (!troopReward || leavingIds.size > 0) return
    const ids = Array.from(selectedIds)
    setLeavingIds(new Set(ids))
    // Let the cards animate out of the hand before committing the trade
    setTimeout(() => {
      onTradeIn(ids, troopReward)
      setSelectedIds(new Set())
      setLeavingIds(new Set())
    }, 320)
  }

  // 4 cards = ★ — exactly 4 selected cards can be spent on a red star instead
  const canBuyStar = selectedIds.size === 4

  function handleConfirmBuyStar() {
    if (!canBuyStar || leavingIds.size > 0) return
    const ids = Array.from(selectedIds)
    setLeavingIds(new Set(ids))
    setTimeout(() => {
      onBuyStar(ids)
      setSelectedIds(new Set())
      setLeavingIds(new Set())
    }, 320)
  }

  const hasCards = territoryCards.length > 0 || coinCards.length > 0

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(5,2,0,0.78)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, fontFamily: 'Georgia, serif',
    }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'linear-gradient(155deg, #1A0E02 0%, #0A0600 100%)',
        border: '2px solid rgba(200,148,10,0.60)',
        borderRadius: 13, padding: '24px 28px 20px',
        width: 560, maxWidth: '94vw', maxHeight: '88vh', overflowY: 'auto',
        color: '#E8DCC8', boxShadow: '0 12px 50px rgba(0,0,0,0.85)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 'bold', color: '#C8940A', letterSpacing: 1 }}>
              🃏 {player.name}'s Cards
            </div>
            <div style={{ fontSize: 11, color: '#6a5030', marginTop: 2 }}>
              {territoryCards.length} territory card{territoryCards.length !== 1 ? 's' : ''}
              {coinCards.length > 0 ? ` · ${coinCards.length} coin card${coinCards.length !== 1 ? 's' : ''}` : ''}
              {mission ? ' · 1 mission' : ''}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#6a5030',
            fontSize: 22, cursor: 'pointer', lineHeight: 1,
          }}>×</button>
        </div>

        {/* Mission card */}
        {mission && (
          <div style={{ marginBottom: 18 }}>
            <SectionHead>Mission</SectionHead>
            <div style={{
              padding: '12px 14px', borderRadius: 8,
              background: missionComplete ? 'rgba(39,174,96,0.12)' : 'rgba(200,148,10,0.08)',
              border: `1px solid ${missionComplete ? 'rgba(39,174,96,0.50)' : 'rgba(200,148,10,0.25)'}`,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{ fontSize: 22 }}>{missionComplete ? '✅' : '🎯'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: missionComplete ? '#27AE60' : '#E8DCC8', fontWeight: 'bold', marginBottom: 4 }}>
                  {missionComplete ? '✓ MISSION COMPLETE!' : mission.name}
                </div>
                <div style={{ fontSize: 12, color: '#9a8060', lineHeight: 1.45 }}>{mission.description}</div>
                <div style={{ fontSize: 10, color: '#6a5030', marginTop: 4 }}>
                  {mission.stars === 2 ? '★★ Special — single use' : '★ Standard mission'}
                </div>
              </div>
            </div>
            {missionComplete && (
              <div style={{ fontSize: 11, color: '#27AE60', marginTop: 6, textAlign: 'center' }}>
                🏆 Completing this mission wins you the game!
              </div>
            )}
          </div>
        )}

        {/* Territory cards */}
        <div style={{ marginBottom: 14 }}>
          <SectionHead>
            Territory Cards ({territoryCards.length})
            {canTradeIn && territoryCards.length > 0 && (
              <span style={{ color: '#5a8040', marginLeft: 8, fontStyle: 'italic', textTransform: 'none', letterSpacing: 0 }}>
                — click to select for trade-in
              </span>
            )}
          </SectionHead>
          {territoryCards.length === 0 ? (
            <div style={{ fontSize: 12, color: '#4a3820', fontStyle: 'italic', padding: '8px 0' }}>
              No territory cards yet — capture territories to earn cards.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {territoryCards.map(({ id, card }, idx) => {
                const tName = TERRITORY_DEFINITIONS.find(d => d.id === card.territoryId)?.name ?? card.territoryId
                const coins = cardResources[id] ?? 1
                const isSelected = selectedIds.has(id)
                return (
                  <button
                    key={id}
                    onClick={() => toggleCard(id)}
                    disabled={!canTradeIn}
                    className={leavingIds.has(id) ? 'card-slide-out' : 'card-slide-in'}
                    style={{
                      animationDelay: leavingIds.has(id) ? '0s' : `${idx * 0.05}s`,
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 12px', borderRadius: 7, textAlign: 'left',
                      background: isSelected ? 'rgba(200,148,10,0.20)' : 'rgba(255,255,255,0.03)',
                      border: `${isSelected ? 2 : 1}px solid ${isSelected ? 'rgba(200,148,10,0.75)' : 'rgba(200,148,10,0.15)'}`,
                      cursor: canTradeIn ? 'pointer' : 'default',
                      fontFamily: 'Georgia, serif',
                      transition: 'all 0.12s',
                      outline: 'none',
                    }}
                  >
                    {canTradeIn && (
                      <div style={{
                        width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                        border: `2px solid ${isSelected ? '#C8940A' : 'rgba(200,148,10,0.35)'}`,
                        background: isSelected ? '#C8940A' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isSelected && <span style={{ fontSize: 9, color: '#000', fontWeight: 'bold' }}>✓</span>}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 11, color: isSelected ? '#E8DCC8' : '#B0946A',
                        fontWeight: isSelected ? 'bold' : 'normal',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {tName}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      <span style={{ fontSize: 10, color: '#C8940A', fontWeight: 'bold' }}>{coins}</span>
                      <CoinDots count={coins} small />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Coin cards */}
        {(coinCards.length > 0 || canTradeIn) && (
          <div style={{ marginBottom: 14 }}>
            <SectionHead>
              Coin Cards ({coinCards.length})
              {canTradeIn && coinCards.length > 0 && (
                <span style={{ color: '#5a8040', marginLeft: 8, fontStyle: 'italic', textTransform: 'none', letterSpacing: 0 }}>
                  — each worth 1 coin
                </span>
              )}
            </SectionHead>
            {coinCards.length === 0 ? (
              <div style={{ fontSize: 12, color: '#4a3820', fontStyle: 'italic', padding: '4px 0' }}>
                No coin cards in hand.
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {coinCards.map(({ id }, idx) => {
                  const isSelected = selectedIds.has(id)
                  return (
                    <button
                      key={id}
                      onClick={() => toggleCard(id)}
                      disabled={!canTradeIn}
                      className={leavingIds.has(id) ? 'card-slide-out' : 'card-slide-in'}
                      style={{
                        animationDelay: leavingIds.has(id) ? '0s' : `${(territoryCards.length + idx) * 0.05}s`,
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '7px 12px', borderRadius: 7,
                        background: isSelected ? 'rgba(200,148,10,0.20)' : 'rgba(255,255,255,0.03)',
                        border: `${isSelected ? 2 : 1}px solid ${isSelected ? 'rgba(200,148,10,0.75)' : 'rgba(200,148,10,0.15)'}`,
                        cursor: canTradeIn ? 'pointer' : 'default',
                        fontFamily: 'Georgia, serif',
                        transition: 'all 0.12s',
                        outline: 'none',
                      }}
                    >
                      {canTradeIn && (
                        <div style={{
                          width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                          border: `2px solid ${isSelected ? '#C8940A' : 'rgba(200,148,10,0.35)'}`,
                          background: isSelected ? '#C8940A' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {isSelected && <span style={{ fontSize: 9, color: '#000', fontWeight: 'bold' }}>✓</span>}
                        </div>
                      )}
                      <span style={{ fontSize: 18, lineHeight: 1 }}>🪙</span>
                      <span style={{ fontSize: 10, color: isSelected ? '#E8DCC8' : '#B0946A' }}>= 1 coin</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Trade-in section */}
        {canTradeIn && hasCards && (
          <div style={{
            marginTop: 6, padding: '14px 16px', borderRadius: 9,
            background: 'rgba(0,0,0,0.25)',
            border: '1px solid rgba(200,148,10,0.20)',
          }}>
            {/* Running total */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: '#6a5030', minWidth: 80 }}>Selected:</span>
              <span style={{ fontSize: 15, fontWeight: 'bold', color: totalCoins > 0 ? '#C8940A' : '#4a3820' }}>
                {totalCoins} coin{totalCoins !== 1 ? 's' : ''}
              </span>
              {selectedIds.size > 0 && (
                <span style={{ fontSize: 10, color: '#5a4020' }}>
                  ({selectedIds.size} card{selectedIds.size !== 1 ? 's' : ''})
                </span>
              )}
              <button
                onClick={() => setSelectedIds(new Set())}
                style={{
                  marginLeft: 'auto', fontSize: 10, color: '#5a4020',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                }}
              >
                Clear
              </button>
            </div>

            {/* Troop reward preview */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: '#6a5030', minWidth: 80 }}>Reward:</span>
              {troopReward != null ? (
                <span style={{ fontSize: 18, fontWeight: 'bold', color: '#4ade80' }}>
                  +{troopReward} troops
                </span>
              ) : (
                <span style={{ fontSize: 12, color: '#4a3820', fontStyle: 'italic' }}>
                  {totalCoins === 0 ? 'Select cards above' : totalCoins === 1 ? 'Need at least 2 coins' : '—'}
                </span>
              )}
            </div>

            <button
              onClick={handleConfirmTradeIn}
              disabled={troopReward == null}
              style={{
                width: '100%', padding: '12px',
                borderRadius: 8, fontSize: 14, fontWeight: 'bold',
                border: `2px solid ${troopReward != null ? 'rgba(200,148,10,0.80)' : 'rgba(100,70,30,0.25)'}`,
                background: troopReward != null ? 'rgba(200,148,10,0.22)' : 'rgba(100,70,30,0.10)',
                color: troopReward != null ? '#E8DCC8' : 'rgba(150,120,80,0.35)',
                cursor: troopReward != null ? 'pointer' : 'not-allowed',
                fontFamily: 'Georgia, serif', letterSpacing: 0.5,
                transition: 'all 0.15s',
              }}
            >
              {troopReward != null
                ? `↩ Trade In ${totalCoins} coins — +${troopReward} troops`
                : '↩ Trade In (select cards to trade)'}
            </button>

            {/* 4 cards = ★ — buy a red star instead of taking troops */}
            <button
              onClick={handleConfirmBuyStar}
              disabled={!canBuyStar}
              style={{
                width: '100%', padding: '12px', marginTop: 8,
                borderRadius: 8, fontSize: 14, fontWeight: 'bold',
                border: `2px solid ${canBuyStar ? 'rgba(231,76,60,0.80)' : 'rgba(100,40,30,0.25)'}`,
                background: canBuyStar ? 'rgba(231,76,60,0.20)' : 'rgba(100,40,30,0.08)',
                color: canBuyStar ? '#E8DCC8' : 'rgba(150,90,80,0.35)',
                cursor: canBuyStar ? 'pointer' : 'not-allowed',
                fontFamily: 'Georgia, serif', letterSpacing: 0.5,
                transition: 'all 0.15s',
              }}
            >
              {canBuyStar
                ? '★ Buy a Red Star — spend these 4 cards'
                : `★ Buy a Red Star (select exactly 4 cards — ${selectedIds.size}/4)`}
            </button>
          </div>
        )}

        {!canTradeIn && (
          <div style={{ textAlign: 'center', fontSize: 10, color: '#4a3020', marginTop: 10 }}>
            Card trade-ins are only available during the Draft phase
          </div>
        )}
      </div>
    </div>
  )
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, color: '#6a5030', letterSpacing: 1.5, textTransform: 'uppercase',
      marginBottom: 9, borderBottom: '1px solid rgba(200,148,10,0.15)', paddingBottom: 5,
    }}>
      {children}
    </div>
  )
}
