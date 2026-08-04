import React, { useState, useEffect } from 'react'
import type { Territory } from '@/types/territory'
import { getTerritoryCard, getCoinCard } from '@/data/cards'
import { TERRITORY_DEFINITIONS } from '@/data/territoryData'

interface Props {
  playerId: string
  /** 4 face-up territory card IDs */
  sideboard: string[]
  /** Separate resource pile (10 cards) */
  resourceDeck: string[]
  territories: Record<string, Territory>
  /** Coin counts per territory card ID (set at game 1, permanent) */
  cardResources?: Record<string, number>
  /** When true, any sideboard card AND the resource card are freely selectable */
  freeChoice?: boolean
  /** Purist weakness power: player already holds 2 coin cards — resource card blocked */
  coinBlocked?: boolean
  /** Recon missile power: player may discard a missile to take any face-up card
   *  instead of drawing a coin card */
  reconAvailable?: boolean
  reconActive?: boolean
  onActivateRecon?: () => void
  /** Faction homeland continent (double-winner unlock): every card in this
   *  continent is claimable too, not just territories the player occupies. */
  homelandContinentId?: string | null
  /** Override modal title */
  title?: string
  /** Override modal subtitle */
  subtitle?: string
  onSelect: (cardId: string, isCoin: boolean) => void
  /** Called when coin deck is depleted and no face-up cards are selectable — player skips */
  onSkip?: () => void
}

const CONTINENT_COLOR: Record<string, string> = {
  'north-america': '#E67E22',
  'south-america': '#27AE60',
  'europe':        '#2980B9',
  'africa':        '#E74C3C',
  'asia':          '#8E44AD',
  'australia':     '#F39C12',
}

const SUIT_LABEL: Record<string, string> = {
  soldiers:  'Infantry',
  cavalry:   'Cavalry',
  artillery: 'Artillery',
  wild:      'Resource',
}

export default function CardDrawModal({ playerId, sideboard, resourceDeck, territories, cardResources = {}, freeChoice = false, coinBlocked = false, reconAvailable = false, reconActive = false, onActivateRecon, homelandContinentId = null, title, subtitle, onSelect, onSkip }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  // Card is animating out of the modal after being taken
  const [leaving, setLeaving] = useState(false)

  // A player can owe more than one draw in a turn (a conquest plus an event, say).
  // The parent renders the same element for each, so React KEEPS this component
  // mounted and its state with it — leaving `leaving` stuck true and `selected`
  // pointing at the card just taken, which disabled Take Card for good. Reset
  // whenever the cards on offer change, which is exactly when a draw completes.
  const offerKey = `${playerId}|${sideboard.join(',')}|${resourceDeck.length}`
  useEffect(() => {
    setSelected(null)
    setLeaving(false)
  }, [offerKey])

  function handleTake() {
    if (!selected || leaving) return
    const isCoin = getCoinCard(selected) !== undefined
    setLeaving(true)
    setTimeout(() => onSelect(selected, isCoin), 300)
  }

  const controlledTerritoryIds = new Set(
    Object.values(territories)
      .filter(t => t.occupyingPlayerId === playerId)
      .map(t => t.id),
  )

  const sideboardCards = sideboard.map(cardId => {
    const card = getTerritoryCard(cardId)
    const terrDef = card ? TERRITORY_DEFINITIONS.find(d => d.id === card.territoryId) : null
    const occupies = card ? controlledTerritoryIds.has(card.territoryId) : false
    // Homeland: any card in that continent is claimable, occupied or not.
    const viaHomeland = !occupies && !!homelandContinentId && terrDef?.continentId === homelandContinentId
    return { cardId, card, terrDef, controls: occupies || viaHomeland, viaHomeland }
  })

  const anyControlled = sideboardCards.some(c => c.controls)
  const hasResource = resourceDeck.length > 0

  // In freeChoice mode: all sideboard cards are selectable and resource card is always available.
  // Recon (missile power) makes every face-up territory card selectable instead of the coin.
  const sideboardSelectable = (controls: boolean) => (freeChoice || reconActive) ? true : (anyControlled ? controls : false)
  const resourceSelectable = coinBlocked ? false : (freeChoice ? true : !anyControlled)

  // Whether there is ANY legal pick. Skip used to be offered only when the
  // resource pile had run dry, which left one combination with no way out at
  // all: a full pile, no face-up card you control, and the coin blocked (Purist
  // at 2 coin cards). Nothing was selectable, Take Card stayed disabled, and
  // there was no Skip — the draw could not be finished or abandoned.
  const anySelectable =
    sideboardCards.some(c => sideboardSelectable(c.controls)) ||
    (hasResource && resourceSelectable)

  /** Why nothing can be taken — shown on the Skip button so it isn't a mystery. */
  const skipReason = coinBlocked && hasResource
    ? 'you already hold the most coin cards allowed'
    : !hasResource && !anyControlled
      ? 'no cards available'
      : 'nothing you can take'

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.82)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#1a0f00',
        border: '2px solid rgba(200,148,10,0.65)',
        borderRadius: 10,
        padding: '22px 26px',
        maxWidth: 600, width: '94%',
        fontFamily: 'Georgia, serif',
        boxShadow: '0 0 40px rgba(200,148,10,0.18)',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: '#E8DCC8', letterSpacing: 1 }}>
            {title ?? 'Draw a Resource Card'}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(200,180,140,0.55)', marginTop: 5, lineHeight: 1.5 }}>
            {subtitle ?? (anyControlled
              ? 'You control a territory on the sideboard — pick one of those cards.'
              : 'None of your territories are face-up. Draw from the Resource pile.')}
          </div>
        </div>

        {/* ── Territory sideboard ── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase',
            color: 'rgba(200,148,10,0.6)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8,
          }}>
            Territory Cards — Face Up
            <span style={{ color: 'rgba(200,148,10,0.35)', fontSize: 9 }}>
              (pick one you control)
            </span>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            {sideboardCards.map(({ cardId, card, terrDef, controls, viaHomeland }, idx) => {
              const continent = terrDef?.continentId ?? ''
              const contColor = CONTINENT_COLOR[continent] ?? '#888'
              const selectable = sideboardSelectable(controls)
              const isSelected = selected === cardId

              return (
                <button
                  key={cardId}
                  onClick={() => selectable && setSelected(isSelected ? null : cardId)}
                  disabled={!selectable}
                  className={leaving && isSelected ? 'card-slide-out' : 'card-slide-in'}
                  style={{
                    animationDelay: leaving ? '0s' : `${idx * 0.07}s`,
                    flex: 1,
                    minWidth: 0,
                    padding: '10px 6px',
                    borderRadius: 8,
                    fontFamily: 'Georgia, serif',
                    cursor: selectable ? 'pointer' : 'default',
                    background: isSelected
                      ? `${contColor}28`
                      : selectable
                        ? 'rgba(39,174,96,0.08)'
                        : 'rgba(255,255,255,0.03)',
                    border: isSelected
                      ? `2px solid ${contColor}`
                      : selectable
                        ? '1.5px solid rgba(39,174,96,0.45)'
                        : '1px solid rgba(255,255,255,0.07)',
                    opacity: !selectable && !freeChoice ? 0.35 : 1,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    transition: 'all 0.15s',
                    position: 'relative',
                  }}
                >
                  {/* Number badge */}
                  <div style={{
                    position: 'absolute', top: -8, left: -8,
                    width: 18, height: 18, borderRadius: '50%',
                    background: contColor, color: '#000',
                    fontSize: 10, fontWeight: 900,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.6)',
                  }}>
                    {idx + 1}
                  </div>
                  {/* Continent color bar */}
                  <div style={{
                    width: '100%', height: 4, borderRadius: 2,
                    background: contColor, opacity: controls ? 1 : 0.3,
                  }} />

                  {/* Territory name */}
                  <div style={{
                    fontSize: 10, fontWeight: 'bold', color: controls ? '#E8DCC8' : '#6a5040',
                    textAlign: 'center', lineHeight: 1.3,
                    wordBreak: 'break-word',
                  }}>
                    {terrDef?.name ?? cardId}
                  </div>

                  {/* Continent */}
                  <div style={{ fontSize: 8, color: contColor, opacity: controls ? 0.9 : 0.4, letterSpacing: 0.5 }}>
                    {continent.replace(/-/g, ' ').toUpperCase()}
                  </div>

                  {/* Coin slot */}
                  {(() => {
                    const coins = cardResources[cardId] ?? 0
                    return coins > 0 ? (
                      <div style={{
                        width: '100%',
                        background: 'rgba(200,148,10,0.10)',
                        border: '1px solid rgba(200,148,10,0.35)',
                        borderRadius: 4, padding: '3px 2px',
                        display: 'flex', flexWrap: 'wrap', gap: 2,
                        justifyContent: 'center', alignItems: 'center',
                      }}>
                        {Array.from({ length: coins }, (_, i) => (
                          <span key={i} style={{ fontSize: 11 }}>🪙</span>
                        ))}
                      </div>
                    ) : null
                  })()}

                  {(controls || freeChoice) && (
                    <div style={{ fontSize: 8, color: viaHomeland ? '#5DADE2' : '#2ecc71', letterSpacing: 0.5 }}>
                      {viaHomeland ? '✦ YOUR HOMELAND' : controls ? '✓ YOUR TERRITORY' : '✓ AVAILABLE'}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Resource card ── */}
        <div style={{ marginBottom: 22 }}>
          {/* Recon missile power — take a face-up card instead of the coin */}
          {reconAvailable && !reconActive && !anyControlled && !freeChoice && (
            <div style={{
              display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8,
              padding: '7px 10px', borderRadius: 6,
              background: 'rgba(160,106,42,0.08)', border: '1px solid rgba(160,106,42,0.35)',
            }}>
              <span style={{ fontSize: 10, color: '#a06a2a', flex: 1, lineHeight: 1.4 }}>
                🚀 <strong>Recon</strong> — discard a missile to take any face-up territory card instead
              </span>
              <button
                onClick={onActivateRecon}
                style={{
                  padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 'bold',
                  border: '1.5px solid rgba(160,106,42,0.60)', background: 'rgba(160,106,42,0.16)',
                  color: '#d0a060', cursor: 'pointer', fontFamily: 'Georgia, serif', whiteSpace: 'nowrap',
                }}
              >
                🚀 Activate Recon
              </button>
            </div>
          )}
          {reconActive && (
            <div style={{
              padding: '6px 10px', borderRadius: 6, fontSize: 10, marginBottom: 8,
              background: 'rgba(160,106,42,0.10)', border: '1px solid rgba(160,106,42,0.45)',
              color: '#d0a060',
            }}>
              🚀 Recon active — pick any face-up territory card above
            </div>
          )}
          {coinBlocked && hasResource && (
            <div style={{
              padding: '6px 10px', borderRadius: 6, fontSize: 10, marginBottom: 8,
              background: 'rgba(240,192,0,0.08)', border: '1px solid rgba(240,192,0,0.35)',
              color: '#f0c000',
            }}>
              ⚠ Purist weakness — you already hold 2 coin cards and cannot draw another
            </div>
          )}
          {hasResource ? (
            <button
              onClick={() => resourceSelectable && setSelected(resourceDeck[0])}
              disabled={!resourceSelectable}
              className={leaving && selected === resourceDeck[0] ? 'card-slide-out' : 'card-slide-in'}
              style={{
                animationDelay: leaving ? '0s' : '0.28s',
                flex: 1,
                minWidth: 0,
                padding: '10px 6px',
                borderRadius: 8,
                fontFamily: 'Georgia, serif',
                cursor: resourceSelectable ? 'pointer' : 'default',
                background: selected === resourceDeck[0]
                  ? 'rgba(200,148,10,0.28)'
                  : resourceSelectable
                    ? 'rgba(200,148,10,0.08)'
                    : 'rgba(255,255,255,0.03)',
                border: selected === resourceDeck[0]
                  ? '2px solid #C8940A'
                  : resourceSelectable
                    ? '1.5px solid rgba(200,148,10,0.45)'
                    : '1px solid rgba(255,255,255,0.07)',
                opacity: resourceSelectable ? 1 : 0.35,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                transition: 'all 0.15s',
                width: 80,
              }}
            >
              {/* Gold color bar */}
              <div style={{
                width: '100%', height: 4, borderRadius: 2,
                background: '#C8940A', opacity: anyControlled ? 0.3 : 1,
              }} />

              {/* Coin */}
              <div style={{ fontSize: 22, lineHeight: 1 }}>🪙</div>

              {resourceDeck.length === 1 && (
                <div style={{ fontSize: 7, color: '#E74C3C', textAlign: 'center', letterSpacing: 0.3 }}>
                  LAST ONE
                </div>
              )}
            </button>
          ) : (
            <div style={{
              padding: '10px 14px', borderRadius: 7, fontSize: 11,
              background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.3)',
              color: 'rgba(231,76,60,0.8)',
            }}>
              ★ Resource pile depleted — the player with the most territories has earned a Red Star.
            </div>
          )}
        </div>

        {(!anySelectable && onSkip) ? (
          <button
            onClick={onSkip}
            style={{
              width: '100%', padding: '12px', borderRadius: 7,
              fontSize: 13, fontWeight: 'bold', fontFamily: 'Georgia, serif',
              cursor: 'pointer',
              background: 'rgba(100,100,100,0.20)',
              border: '2px solid rgba(180,180,180,0.35)',
              color: 'rgba(220,210,190,0.80)',
            }}
          >
            Skip ({skipReason})
          </button>
        ) : (
          <button
            onClick={handleTake}
            disabled={!selected || leaving}
            style={{
              width: '100%', padding: '12px', borderRadius: 7,
              fontSize: 13, fontWeight: 'bold', fontFamily: 'Georgia, serif',
              cursor: selected ? 'pointer' : 'not-allowed',
              background: selected ? 'rgba(200,148,10,0.28)' : 'rgba(100,70,30,0.15)',
              border: `2px solid ${selected ? '#C8940A' : 'rgba(100,70,30,0.25)'}`,
              color: selected ? '#E8DCC8' : 'rgba(150,120,80,0.35)',
            }}
          >
            Take Card
          </button>
        )}
      </div>
    </div>
  )
}
