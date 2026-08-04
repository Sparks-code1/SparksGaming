import { useEffect, useState } from 'react'
import type { LegacyState } from '@/types/legacy'
import {
  loadLegacyState, loadGameHistory, saveLegacyState, createCampaign, ensureJoinCode,
  getActiveCampaignId, setActiveCampaignId, clearActiveCampaignId, setLocalSeat,
  type GameSessionRow, SCAR_META,
} from '@/lib/legacyApi'
import { formatJoinCode } from '@/lib/joinCode'
import JoinCampaignPanel from './JoinCampaignPanel'
import { TERRITORY_DEFINITIONS } from '@/data/territoryData'
import { getScarCard, getInitialScarDeck } from '@/data/scarCards'
import CampaignVictoryScreen from './CampaignVictoryScreen'
import CampaignPicker from './CampaignPicker'
import AuthPanel from './AuthPanel'
import { getCurrentUser, onAuthChange, type AuthUser } from '@/lib/auth'
import { claimRosterSeat, getRoster } from '@/lib/roster'

interface Props {
  onReadyForDiceRoll: (legacy: LegacyState) => void
  /** Drop back into a game that is still in progress. */
  onResumeGame: (legacy: LegacyState) => void
  onNewCampaign: () => void
}

type LoadState =
  | 'loading'
  | 'picking'   // choosing among existing campaigns, or starting a new one
  | 'joining'   // entering someone else's join code
  | 'found'     // a campaign is open; show its lobby
  | 'none'      // naming a brand-new campaign
  | 'error'

export default function BetweenGameScreen({ onReadyForDiceRoll, onResumeGame, onNewCampaign }: Props) {
  const [status, setStatus]     = useState<LoadState>('loading')
  /** Which screen the join panel was opened FROM, so Cancel goes back there. */
  const [joinReturnTo, setJoinReturnTo] = useState<LoadState>('picking')
  const [legacy, setLegacy]     = useState<LegacyState | null>(null)
  const [sessions, setSessions] = useState<GameSessionRow[]>([])
  const [worldName, setWorldName] = useState('New World')

  // ── Optional account ─────────────────────────────────────────────────────
  // Signing in is never required. `authDismissed` records that the player chose
  // to continue without one, which simply hides the panel for this visit.
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authDismissed, setAuthDismissed] = useState(false)
  /** Guards the button that would throw away a game still in progress. */
  const [confirmRestart, setConfirmRestart] = useState(false)

  useEffect(() => {
    // A failure here resolves to null rather than throwing, so an unreachable
    // auth service leaves the campaign screen fully usable.
    getCurrentUser().then(setUser).catch(() => setUser(null))
    return onAuthChange(setUser)
  }, [])

  /** Link the signed-in account to a roster seat. Returns an error, or null. */
  async function handleClaimSeat(playerId: string): Promise<string | null> {
    if (!legacy || !user) return 'Not signed in'
    const result = claimRosterSeat(getRoster(legacy), playerId, user.id, user.email)
    if (!result.ok) return result.reason ?? 'Could not link that player'
    const updated: LegacyState = { ...legacy, roster: result.roster }
    try {
      await saveLegacyState(updated)
    } catch (e) {
      return e instanceof Error ? e.message : 'Could not save the link'
    }
    setLegacy(updated)
    return null
  }

  /** Load one campaign by id and show its lobby. */
  async function openCampaign(campaignId: string) {
    setStatus('loading')
    try {
      const ls = await loadLegacyState(campaignId)
      if (!ls) { setStatus('picking'); return }
      // Dedupe the scar deck on load — heals saves corrupted by an older
      // duplicate-append bug so the pool display shows unique cards.
      let healed = Array.isArray(ls.scarDeck)
        ? { ...ls, scarDeck: [...new Set(ls.scarDeck)] }
        : ls
      // Campaigns made before join codes existed get one the first time they
      // are opened, so every campaign is shareable without a manual step.
      if (!healed.joinCode) {
        try {
          healed = { ...healed, joinCode: await ensureJoinCode(healed) }
        } catch (e) {
          console.error('[JoinCode] backfill failed:', e)
        }
      }
      setSessions(await loadGameHistory(campaignId, healed.campaignEpoch))
      setLegacy(healed)
      setWorldName(healed.worldName)
      // Remember which campaign this device is in, so a reload resumes it.
      await setActiveCampaignId(campaignId)
      setStatus('found')
    } catch {
      setStatus('error')
    }
  }

  /** Someone joined with a code — remember who this device is, then open it. */
  async function handleJoined(campaignId: string, playerId: string) {
    await setLocalSeat(campaignId, playerId).catch(() => {})
    await openCampaign(campaignId)
  }

  useEffect(() => {
    // Open the campaign this device was last in; otherwise offer the picker.
    // There is no longer a single implicit campaign to fall back on.
    getActiveCampaignId()
      .then(id => (id ? openCampaign(id) : setStatus('picking')))
      .catch(() => setStatus('picking'))
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
    // createCampaign mints a fresh id AND a join code, so this never collides
    // with an existing campaign and is shareable the moment it exists.
    try {
      const fresh = await createCampaign(name)
      console.log('[Campaign] starting new campaign', fresh.campaignId, fresh.joinCode)
      await setActiveCampaignId(fresh.campaignId)
      onReadyForDiceRoll(normalizeLegacy(fresh))
    } catch (e) {
      console.error('[Campaign] could not create campaign:', e)
      setStatus('error')
    }
  }

  if (status === 'loading') return <FullScreen><Spinner /></FullScreen>

  // Campaign is complete — show the victory screen instead of the lobby
  if (legacy?.campaignComplete) {
    return <CampaignVictoryScreen legacy={legacy} onNewCampaign={onNewCampaign} />
  }

  const lastSession = sessions[sessions.length - 1]
  // A game is resumable when it was left mid-play rather than finished — the
  // autosave keeps both the flag and the board, so leaving is never final.
  const resumable = !!legacy?.gameInProgress && !!legacy?.activeGameState

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

        {/* Campaign picker — any campaign, not just the most recent */}
        {status === 'picking' && (
          <CampaignPicker
            onOpen={openCampaign}
            onNew={() => { setWorldName('New World'); setStatus('none') }}
            onJoin={() => { setJoinReturnTo('picking'); setStatus('joining') }}
          />
        )}

        {/* Join someone else's campaign with their code.
            `cameFrom` is remembered so Cancel returns to the screen the player
            actually came from — landing them on the picker instead would look
            like their campaign had been closed. */}
        {status === 'joining' && (
          <JoinCampaignPanel
            user={user}
            onJoined={handleJoined}
            onCancel={() => setStatus(joinReturnTo)}
          />
        )}

        {/* A campaign is open — offer a way back to the list, and a way IN to
            someone else's.

            The join path used to live only on the picker, which a returning
            player never sees: `getActiveCampaignId` opens their last campaign
            and lands them here. So the screen showed them a code to share and
            offered no way to use anyone else's — which reads, correctly, as the
            feature not existing. */}
        {status === 'found' && legacy && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14, marginBottom: 10 }}>
            <button
              onClick={() => { setJoinReturnTo('found'); setStatus('joining') }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#8a6a30', fontSize: 11, fontFamily: 'Georgia, serif', textDecoration: 'underline',
              }}>
              ⤵ Join with a code
            </button>
            <button
              onClick={async () => { await clearActiveCampaignId(); setLegacy(null); setSessions([]); setStatus('picking') }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#6a5030', fontSize: 11, fontFamily: 'Georgia, serif', textDecoration: 'underline',
              }}>
              ← All campaigns
            </button>
          </div>
        )}

        {/* Account — optional, and dismissible straight through to the game */}
        {!authDismissed && (
          <AuthPanel
            user={user}
            legacy={legacy}
            onAuthed={setUser}
            onSignedOut={() => setUser(null)}
            onContinueWithout={() => setAuthDismissed(true)}
            onClaimSeat={handleClaimSeat}
          />
        )}
        {authDismissed && (
          <div style={{ textAlign: 'right', marginBottom: 12 }}>
            <button
              onClick={() => setAuthDismissed(false)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#6a5030', fontSize: 11, fontFamily: 'Georgia, serif',
                textDecoration: 'underline',
              }}>
              {user ? `Signed in as ${user.email}` : 'Sign in or create an account'}
            </button>
          </div>
        )}

        {/* Existing campaign */}
        {(status === 'found' || status === 'error') && legacy && (
          <>
            {legacy.joinCode && <JoinCodeCard code={legacy.joinCode} />}

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

            {/* A game left mid-play is still saved. Offer it back FIRST — and
                make starting a fresh one confirm, since that discards it. */}
            {resumable ? (
              <>
                <button onClick={() => onResumeGame(legacy)} style={primaryBtn('#C8940A')}>
                  ▶ Resume Game #{legacy.currentGameNumber}
                </button>
                <div style={{ fontSize: 10.5, color: '#6a5a3a', textAlign: 'center', margin: '7px 0 0', fontStyle: 'italic' }}>
                  Turn {(legacy.activeGameState as { turnNumber?: number })?.turnNumber ?? 1} — picks up exactly where you left off
                </div>
                <div style={{ textAlign: 'center', margin: '14px 0 4px', fontSize: 10, color: '#4a3820' }}>OR</div>
                <button
                  onClick={() => setConfirmRestart(true)}
                  style={{ ...primaryBtn('#C8940A'), background: 'transparent', color: '#9a8060', borderColor: 'rgba(200,148,10,0.30)' }}>
                  🃏 Abandon it and start Game #{legacy.currentGameNumber} over
                </button>
                {confirmRestart && (
                  <div style={{
                    marginTop: 10, padding: '10px 12px', borderRadius: 7,
                    background: 'rgba(192,57,43,0.10)', border: '1px solid rgba(192,57,43,0.40)',
                  }}>
                    <div style={{ fontSize: 11.5, color: '#e08070', lineHeight: 1.5, marginBottom: 9 }}>
                      The game in progress will be discarded and Game #{legacy.currentGameNumber} restarted
                      from setup. Campaign history is untouched.
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={handleContinue} style={{
                        padding: '6px 13px', borderRadius: 6, fontSize: 11.5, cursor: 'pointer',
                        border: '1px solid rgba(192,57,43,0.7)', background: 'rgba(192,57,43,0.22)',
                        color: '#FFE8E0', fontFamily: 'Georgia, serif',
                      }}>Discard &amp; restart</button>
                      <button onClick={() => setConfirmRestart(false)} style={{
                        padding: '6px 13px', borderRadius: 6, fontSize: 11.5, cursor: 'pointer',
                        border: '1px solid rgba(200,148,10,0.30)', background: 'transparent',
                        color: '#9a8060', fontFamily: 'Georgia, serif',
                      }}>Cancel</button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <button onClick={handleContinue} style={primaryBtn('#C8940A')}>
                🃏 Deal Scar Cards &amp; Start Game #{legacy.currentGameNumber}
              </button>
            )}
            <div style={{ textAlign: 'center', margin: '14px 0 4px', fontSize: 10, color: '#4a3820' }}>OR</div>
            {/* Starting another campaign no longer destroys this one — each has
                its own id, so they sit side by side in the picker. The row is
                written by handleNewCampaignStart once it has been named. */}
            <button onClick={async () => {
              await clearActiveCampaignId()
              setLegacy(null)
              setSessions([])
              setWorldName('New World')
              setStatus('none')
            }} style={ghostBtnStyle}>Start a Separate Campaign</button>
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

/**
 * The campaign's join code, shown large enough to read across a room.
 *
 * Copy is best-effort: the clipboard API is unavailable on insecure origins and
 * the Electron build's ephemeral-port origin is one, so the code is always
 * rendered as selectable text rather than hidden behind a button that may fail.
 */
function JoinCodeCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      border: '1px solid rgba(200,148,10,0.40)', borderRadius: 10,
      background: 'rgba(200,148,10,0.06)', padding: '12px 15px', marginBottom: 18,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 9.5, color: '#6a5030', letterSpacing: 1.5, textTransform: 'uppercase' }}>
          Join Code
        </div>
        <div style={{
          fontSize: 26, color: '#E8DCC8', letterSpacing: 6, marginTop: 3,
          fontFamily: 'Menlo, Consolas, monospace', userSelect: 'all',
        }}>
          {formatJoinCode(code)}
        </div>
        <div style={{ fontSize: 10.5, color: '#6a5030', marginTop: 3 }}>
          Share this so others can join the campaign
        </div>
      </div>
      <button onClick={copy} style={{
        padding: '8px 14px', borderRadius: 7, fontSize: 11.5, flexShrink: 0,
        border: `1px solid ${copied ? 'rgba(39,174,96,0.6)' : 'rgba(200,148,10,0.45)'}`,
        background: copied ? 'rgba(39,174,96,0.15)' : 'rgba(200,148,10,0.10)',
        color: copied ? '#27AE60' : '#b09060',
        cursor: 'pointer', fontFamily: 'Georgia, serif',
      }}>
        {copied ? '✓ Copied' : 'Copy'}
      </button>
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
