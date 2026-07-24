import { useEffect, useState } from 'react'
import type { LegacyState } from '@/types/legacy'
import {
  loadLegacyState, loadGameHistory, saveLegacyState,
  defaultLegacyState, type GameSessionRow, SCAR_META,
} from '@/lib/legacyApi'
import { TERRITORY_DEFINITIONS } from '@/data/territoryData'
import { getScarCard, getInitialScarDeck } from '@/data/scarCards'
import CampaignVictoryScreen from './CampaignVictoryScreen'

interface Props {
  onReadyForDiceRoll: (legacy: LegacyState) => void
  onNewCampaign: () => void
}

type LoadState = 'loading' | 'found' | 'none' | 'error'

export default function BetweenGameScreen({ onReadyForDiceRoll, onNewCampaign }: Props) {
  const [status, setStatus]     = useState<LoadState>('loading')
  const [legacy, setLegacy]     = useState<LegacyState | null>(null)
  const [sessions, setSessions] = useState<GameSessionRow[]>([])
  const [worldName, setWorldName] = useState('New World')

  useEffect(() => {
    loadLegacyState().then(async ls => {
      const hist = await loadGameHistory(ls?.campaignEpoch)
      setSessions(hist)
      if (ls) {
        // Dedupe the scar deck on load — heals saves corrupted by an older
        // duplicate-append bug so the pool display shows unique cards.
        const healed = Array.isArray(ls.scarDeck)
          ? { ...ls, scarDeck: [...new Set(ls.scarDeck)] }
          : ls
        setLegacy(healed)
        setWorldName(healed.worldName)
        setStatus('found')
      } else {
        setStatus('none')
      }
    }).catch(() => setStatus('error'))
  }, [])

  // Normalize fields that may be missing from legacy Supabase records.
  // Dedupe the scar deck by unique ID — heals any save corrupted by an older
  // duplicate-append bug (every scar-card id is unique).
  function normalizeLegacy(ls: LegacyState): LegacyState {
    return {
      ...ls,
      scarDeck:   Array.isArray(ls.scarDeck)   ? [...new Set(ls.scarDeck)] : getInitialScarDeck(),
      dealtScars: Array.isArray(ls.dealtScars) ? ls.dealtScars : [],
    }
  }

  // Scar dealing now happens AFTER player selection (App handles it) — this
  // screen just hands the healed legacy state onward to the players screen.
  function handleContinue() {
    if (!legacy) return
    onReadyForDiceRoll(normalizeLegacy(legacy))
  }

  async function handleNewCampaignStart(name: string) {
    console.log('[Campaign] handleNewCampaignStart called, name=', name)
    const fresh: LegacyState = { ...defaultLegacyState(), worldName: name }
    console.log('[Campaign] fresh state built, saving to DB...')
    await saveLegacyState(fresh).catch(e => console.error('[Campaign] saveLegacyState failed:', e))
    console.log('[Campaign] save complete, moving to player selection')
    onReadyForDiceRoll(normalizeLegacy(fresh))
  }

  if (status === 'loading') return <FullScreen><Spinner /></FullScreen>

  // Campaign is complete — show the victory screen instead of the lobby
  if (legacy?.campaignComplete) {
    return <CampaignVictoryScreen legacy={legacy} onNewCampaign={onNewCampaign} />
  }

  const lastSession = sessions[sessions.length - 1]

  return (
    <FullScreen>
      <div style={{
        background: 'linear-gradient(155deg, #1A0E02 0%, #0A0600 100%)',
        border: '2px solid rgba(200,148,10,0.60)',
        borderRadius: 14, padding: '36px 40px 30px',
        width: 560, maxWidth: '94vw', maxHeight: '90vh',
        overflowY: 'auto',
        color: '#E8DCC8', fontFamily: 'Georgia, serif',
        boxShadow: '0 16px 60px rgba(0,0,0,0.90)',
      }}>
        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: '#C8940A', letterSpacing: 2 }}>
            ⚔ RISK LEGACY
          </div>
          {status === 'found' && legacy && (
            <div style={{ fontSize: 13, color: '#7a6040', marginTop: 6 }}>
              Campaign: <strong style={{ color: '#b09060' }}>{legacy.worldName}</strong>
              &nbsp;·&nbsp; Game #{legacy.currentGameNumber}
            </div>
          )}
          {status === 'none' && (
            <div style={{ fontSize: 13, color: '#7a6040', marginTop: 6 }}>Begin a new campaign</div>
          )}
          {status === 'error' && (
            <div style={{ fontSize: 12, color: '#c04040', marginTop: 6 }}>Could not connect — playing offline</div>
          )}
        </div>

        {/* Existing campaign */}
        {(status === 'found' || status === 'error') && legacy && (
          <>
            {lastSession && (
              <Section title="Last Game">
                <div style={{ fontSize: 13, color: '#b09060' }}>
                  Game #{lastSession.game_number}
                  {lastSession.winner_player_name
                    ? <> — 🏆 <strong style={{ color: '#E8DCC8' }}>{lastSession.winner_player_name}</strong> won</>
                    : ' — no winner recorded'}
                </div>
                {lastSession.legacy_events?.slice(0, 4).map((ev, i) => (
                  <div key={i} style={{ fontSize: 11, color: '#6a5030', marginTop: 4 }}>· {ev.description}</div>
                ))}
              </Section>
            )}

            {/* Scar deck */}
            <Section title={`Scar Card Pool — ${legacy.scarDeck?.length ?? 0} of ${getInitialScarDeck().length} remaining`}>
              {(legacy.scarDeck?.length ?? 0) === 0 ? (
                <div style={{ fontSize: 11, color: '#4a3020', fontStyle: 'italic' }}>Pool exhausted — no cards dealt this game</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {(legacy.scarDeck ?? []).map(cardId => {
                    const card = getScarCard(cardId)
                    const meta = card ? SCAR_META.find(m => m.type === card.type) : null
                    return card && meta ? (
                      <span key={cardId} style={{
                        fontSize: 10, padding: '2px 7px', borderRadius: 7,
                        background: `${meta.color}12`, border: `1px solid ${meta.color}30`, color: meta.color,
                      }}>{meta.icon} {card.name}</span>
                    ) : null
                  })}
                </div>
              )}
            </Section>

            {/* Map changes */}
            <Section title="Persistent Map Changes">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                {legacy.scars.length > 0 && <Chip color="#E74C3C">{legacy.scars.length} scar{legacy.scars.length !== 1 ? 's' : ''}</Chip>}
                {legacy.stickers.filter(s => s.placement === 'territory').length > 0 && (
                  <Chip color="#2980B9">{legacy.stickers.filter(s => s.placement === 'territory').length} cities</Chip>
                )}
                {legacy.unlockedContent.length > 0 && (
                  <Chip color="#8E44AD">{legacy.unlockedContent.length} unlocks</Chip>
                )}
                {legacy.scars.length === 0 && legacy.stickers.length === 0 && (
                  <span style={{ fontSize: 11, color: '#4a3020', fontStyle: 'italic' }}>No changes yet</span>
                )}
              </div>
              {legacy.scars.slice(0, 3).map((s, i) => {
                const meta = SCAR_META.find(m => m.type === s.type)
                const tName = TERRITORY_DEFINITIONS.find(d => d.id === s.territoryId)?.name ?? s.territoryId
                return (
                  <div key={i} style={{ fontSize: 11, color: '#7a5030', marginTop: 3 }}>
                    {meta?.icon} {meta?.label} on {tName}
                  </div>
                )
              })}
            </Section>

            <button onClick={handleContinue} style={primaryBtn('#C8940A')}>
              🃏 Deal Scar Cards &amp; Start Game #{legacy.currentGameNumber}
            </button>
            <div style={{ textAlign: 'center', margin: '14px 0 4px', fontSize: 10, color: '#4a3820' }}>OR</div>
            <button onClick={async () => {
              const fresh = defaultLegacyState()
              await saveLegacyState(fresh).catch(() => {})
              setLegacy(null)
              setSessions([])
              setStatus('none')
            }} style={ghostBtnStyle}>Start New Campaign (clears all legacy)</button>
          </>
        )}

        {/* No campaign */}
        {status === 'none' && (
          <>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, color: '#6a5030', display: 'block', marginBottom: 8, letterSpacing: 1 }}>
                WORLD NAME
              </label>
              <input
                value={worldName}
                onChange={e => setWorldName(e.target.value)}
                maxLength={40}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 6,
                  border: '1.5px solid rgba(200,148,10,0.45)',
                  background: 'rgba(0,0,0,0.40)', color: '#E8DCC8',
                  fontSize: 15, fontFamily: 'Georgia, serif', boxSizing: 'border-box',
                }}
              />
            </div>
            <button
              onClick={() => handleNewCampaignStart(worldName.trim() || 'New World')}
              style={primaryBtn('#C8940A')}
            >
              🃏 Begin Campaign — Deal Cards &amp; Start Game #1
            </button>
          </>
        )}
      </div>
    </FullScreen>
  )
}

// ─── Tiny helpers ─────────────────────────────────────────────────────────────

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: 'radial-gradient(ellipse at center, #1A0E04 0%, #080400 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Georgia, serif',
    }}>
      {children}
    </div>
  )
}

function Spinner() {
  return <div style={{ fontSize: 24, color: '#C8940A' }}>⌛</div>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 10, color: '#6a5030', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8, borderBottom: '1px solid rgba(200,148,10,0.15)', paddingBottom: 5 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Chip({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 11, padding: '3px 10px', borderRadius: 10,
      background: `${color}18`, border: `1px solid ${color}45`, color,
    }}>{children}</span>
  )
}

const primaryBtn = (color: string): React.CSSProperties => ({
  width: '100%', padding: '13px', borderRadius: 8, fontSize: 14, fontWeight: 'bold',
  border: `2px solid ${color}`, background: `${color}22`, color: '#E8DCC8',
  cursor: 'pointer', fontFamily: 'Georgia, serif', letterSpacing: 0.5,
})

const ghostBtnStyle: React.CSSProperties = {
  width: '100%', padding: '10px', borderRadius: 8, fontSize: 12,
  border: '1px solid rgba(200,148,10,0.25)', background: 'transparent',
  color: '#5a4020', cursor: 'pointer', fontFamily: 'Georgia, serif',
}
