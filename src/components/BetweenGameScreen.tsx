import { useEffect, useRef, useState } from 'react'
import type { LegacyState } from '@/types/legacy'
import {
  loadLegacyState, loadGameHistory, saveLegacyState, createCampaign, ensureJoinCode,
  getActiveCampaignId, setActiveCampaignId, clearActiveCampaignId, setLocalSeat,
  getPreferredName, setPreferredName,
  type GameSessionRow, SCAR_META,
} from '@/lib/legacyApi'
import JoinCodeCard from './JoinCodeCard'
import JoinCampaignPanel from './JoinCampaignPanel'
import { TERRITORY_DEFINITIONS } from '@/data/territoryData'
import { getInitialScarDeck } from '@/data/scarCards'
import CampaignVictoryScreen from './CampaignVictoryScreen'
import CampaignPicker from './CampaignPicker'
import AccountMenu from './AccountMenu'
import { getCurrentUser, onAuthChange, type AuthUser } from '@/lib/auth'
import { claimRosterSeat, getRoster, addRosterMember, MAX_ROSTER_NAME } from '@/lib/roster'
import CampaignRosterPanel from './CampaignRosterPanel'
import { BUILD_STAMP } from '@/lib/buildStamp'
import { findOpenLobby, takeSeat, createLobby, type Lobby } from '@/lib/lobby'

interface Props {
  onReadyForDiceRoll: (legacy: LegacyState) => void
  /** Drop back into a game that is still in progress. */
  onResumeGame: (legacy: LegacyState) => void
  onNewCampaign: () => void
  /** A seat has been taken in someone's lobby — show the waiting room. */
  onEnterLobby: (lobby: Lobby, legacy: LegacyState) => void
  /**
   * End-of-game hand-off, set when every player clicked Continue at the
   * finished game's gate: 'host' re-opens a lobby for the next game the
   * moment the campaign record settles; 'join' watches for that lobby and
   * takes a seat in it automatically. Consumed once acted on.
   */
  autoNextGame?: 'host' | 'join' | null
  onAutoNextConsumed?: () => void
}

type LoadState =
  | 'loading'
  | 'picking'   // choosing among existing campaigns, or starting a new one
  | 'joining'   // entering someone else's join code
  | 'found'     // a campaign is open; show its lobby
  | 'none'      // naming a brand-new campaign
  | 'error'

export default function BetweenGameScreen({ onReadyForDiceRoll, onResumeGame, onNewCampaign, onEnterLobby, autoNextGame = null, onAutoNextConsumed }: Props) {
  const [status, setStatus]     = useState<LoadState>('loading')
  /** Which screen the join panel was opened FROM, so Cancel goes back there. */
  const [joinReturnTo, setJoinReturnTo] = useState<LoadState>('picking')
  const [legacy, setLegacy]     = useState<LegacyState | null>(null)
  const [sessions, setSessions] = useState<GameSessionRow[]>([])
  const [worldName, setWorldName] = useState('New World')

  // ── New campaign ─────────────────────────────────────────────────────────
  // The founder types only their OWN name. Everyone else names themself when
  // they join — by code or by lobby seat — because the person at the other
  // machine is the authority on what they are called, not the host.
  const [founderName, setFounderName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // ── Optional account ─────────────────────────────────────────────────────
  // Signing in is never required, and the whole account lives behind one small
  // button now (AccountMenu) rather than a panel in the way of the campaign.
  const [user, setUser] = useState<AuthUser | null>(null)
  /** What this player calls themself — fills in every join form. */
  const [playerName, setPlayerName] = useState('')
  /** Guards the button that would throw away a game still in progress. */
  const [confirmRestart, setConfirmRestart] = useState(false)

  // ── Somebody is hosting this game right now ───────────────────────────────
  // Polled rather than pushed: a player sitting on this screen has not
  // subscribed to anything yet, and the whole point is to notice a lobby that
  // opened while they were looking at it.
  const [openLobby, setOpenLobby] = useState<Lobby | null>(null)
  const [lobbyError, setLobbyError] = useState<string | null>(null)
  const [joiningLobby, setJoiningLobby] = useState(false)
  /** What a first-time joiner wants to be called — they name themself. */
  const [joinName, setJoinName] = useState('')
  const [hostingGame, setHostingGame] = useState(false)
  const [hostError, setHostError] = useState<string | null>(null)

  useEffect(() => {
    const campaignId = legacy?.campaignId
    const gameNumber = legacy?.currentGameNumber
    if (!campaignId || !gameNumber || !user) { setOpenLobby(null); return }
    let cancelled = false
    const look = async () => {
      const found = await findOpenLobby(campaignId, gameNumber).catch(() => null)
      if (!cancelled) setOpenLobby(found?.status === 'lobby' ? found : null)
    }
    void look()
    const timer = setInterval(look, 4000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [legacy?.campaignId, legacy?.currentGameNumber, user?.id])

  // ── End-of-game hand-off ──────────────────────────────────────────────────
  // Everyone clicked Continue at the finished game's gate. The winner's
  // machine finalized the campaign (game number bumped, gameInProgress
  // cleared) right as that gate opened — but this machine's mount-load can
  // race that write, so an unsettled record is re-read every couple of
  // seconds rather than acted on: hosting off the stale copy would open a
  // lobby for the game that just ENDED, which nobody's search would find.
  const autoFiredRef = useRef(false)
  useEffect(() => {
    if (!autoNextGame || autoFiredRef.current) return
    if (status !== 'found' || !legacy || !user) return
    if (legacy.gameInProgress || legacy.activeGameState) {
      const t = window.setTimeout(() => { void openCampaign(legacy.campaignId) }, 2000)
      return () => window.clearTimeout(t)
    }
    if (autoNextGame === 'host') {
      if (hostingGame) return
      autoFiredRef.current = true
      onAutoNextConsumed?.()
      void hostOnlineGame()
      return
    }
    // 'join': wait for the host's lobby to appear in the existing poll.
    if (!openLobby || joiningLobby) return
    autoFiredRef.current = true
    onAutoNextConsumed?.()
    void joinOpenLobby()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoNextGame, status, legacy, user, openLobby, hostingGame, joiningLobby])

  /**
   * Take a seat in the open lobby and go and wait in it.
   *
   * A returning player joins as the name their account already holds. A NEW
   * player types their own name right here — it becomes their permanent roster
   * entry, written by them, which is the entire point of the rework: the host
   * hosts, and everyone names themself.
   */
  async function joinOpenLobby() {
    if (!openLobby || !legacy || !user) return
    let ls = legacy
    let me = getRoster(ls).find(m => m.userId === user.id)
    setJoiningLobby(true); setLobbyError(null)
    try {
      if (!me) {
        // Their remembered name, unless they typed a different one here. The
        // name they actually join with becomes the remembered one.
        const chosen = (joinName.trim() || playerName.trim())
        if (chosen && chosen !== playerName) { setPlayerName(chosen); void setPreferredName(chosen) }
        const added = addRosterMember(getRoster(ls), chosen, ls.currentGameNumber,
          { userId: user.id, userEmail: user.email })
        if (!added.ok || !added.member) throw new Error(added.reason ?? 'Could not join the campaign')
        ls = { ...ls, roster: added.roster }
        await saveLegacyState(ls)     // their entry, written by them
        setLegacy(ls)
        me = added.member
      }
      onEnterLobby(await takeSeat(openLobby.matchId, { playerId: me.id, name: me.name }), ls)
    } catch (e) {
      setLobbyError(e instanceof Error ? e.message : 'Could not join that game')
      setJoiningLobby(false)
    }
  }

  /**
   * Open a lobby for this game and go and wait in it.
   *
   * The host configures nothing here — how many humans, how many AI, and the
   * AI names are all adjusted inside the lobby itself, where changes are
   * visible to everyone who has already joined.
   */
  async function hostOnlineGame() {
    if (!legacy || !user) return
    const me = getRoster(legacy).find(m => m.userId === user.id)
    if (!me) {
      setHostError('Link your account to your name first — My Account, top right, does it in one click.')
      return
    }
    setHostingGame(true); setHostError(null)
    try {
      const lobby = await createLobby(
        legacy.campaignId, legacy.currentGameNumber,
        { playerId: me.id, name: me.name },
        2,      // waiting for one other human by default; adjustable in the lobby
        [],
      )
      onEnterLobby(lobby, legacy)
    } catch (e) {
      setHostError(e instanceof Error ? e.message : 'Could not open the game')
      setHostingGame(false)
    }
  }

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

  /**
   * Add someone to the campaign roster mid-campaign. Returns an error, or null.
   *
   * Names are permanent; the roster SIZE is not. Someone joining the group at
   * game four is ordinary, and the entry is created UNCLAIMED so the join code
   * has something for them to take.
   */
  async function handleAddRosterMember(name: string): Promise<string | null> {
    if (!legacy) return 'No campaign is open'
    const result = addRosterMember(getRoster(legacy), name, legacy.currentGameNumber)
    if (!result.ok) return result.reason ?? 'Could not add that player'
    const updated: LegacyState = { ...legacy, roster: result.roster }
    try {
      await saveLegacyState(updated)
    } catch (e) {
      // Do NOT keep the local copy on a failed save — the next write would send
      // a roster the server never agreed to.
      return e instanceof Error ? e.message : 'Could not save the new player'
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
    void getPreferredName().then(n => {
      if (!n) return
      setPlayerName(n)
      // Founding a campaign asks the same question; answer it in advance.
      setFounderName(prev => prev || n)
    }).catch(() => {})
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
    // createCampaign mints a fresh id, the founder's roster entry and a join
    // code, so the campaign is shareable the moment it exists. It does NOT go
    // straight into a game any more — the founder lands on the campaign
    // screen, where they can host, share the code, or seat a table by hand.
    if (!founderName.trim()) return
    setCreating(true)
    setCreateError(null)
    try {
      const fresh = await createCampaign(
        name, founderName,
        user ? { userId: user.id, userEmail: user.email } : undefined,
      )
      console.log('[Campaign] created', fresh.campaignId, fresh.joinCode, 'founder:', founderName)
      // The name they founded under is the one this device remembers.
      if (founderName.trim() !== playerName) {
        setPlayerName(founderName.trim())
        void setPreferredName(founderName.trim())
      }
      await setActiveCampaignId(fresh.campaignId)
      setLegacy(normalizeLegacy(fresh))
      setSessions([])
      setCreating(false)
      setStatus('found')
    } catch (e) {
      // A failure here leaves the form filled in and says why, rather than
      // dropping to the generic error screen with the typed name lost.
      console.error('[Campaign] could not create campaign:', e)
      setCreateError(e instanceof Error ? e.message : 'Could not create the campaign')
      setCreating(false)
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
        {/* Account — one small button, top right */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: -14 }}>
          <AccountMenu
            user={user}
            legacy={legacy}
            playerName={playerName}
            onNameChange={name => { setPlayerName(name); void setPreferredName(name) }}
            onAuthed={setUser}
            onSignedOut={() => setUser(null)}
            onClaimSeat={handleClaimSeat}
          />
        </div>

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
            defaultName={playerName}
            onJoined={handleJoined}
            onNameChosen={name => { setPlayerName(name); void setPreferredName(name) }}
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

        {/* Existing campaign */}
        {(status === 'found' || status === 'error') && legacy && (
          <>
            {/* An open lobby outranks everything else on this screen — someone
                is sitting waiting for you, and starting your own game instead
                would produce the second game this whole flow exists to stop. */}
            {openLobby && user && (() => {
              const mine = openLobby.createdBy === user.id
              const claimed = getRoster(legacy).find(m => m.userId === user.id)
              // A remembered name IS their answer — only a player this device
              // has never named is asked, and only once ever.
              const needsName = !mine && !claimed && !playerName.trim()
              const joinDisabled = joiningLobby || (needsName && !joinName.trim())
              return (
                <div style={{
                  border: '1.5px solid rgba(39,174,96,0.45)', borderRadius: 10,
                  background: 'rgba(39,174,96,0.07)', padding: '13px 15px', marginBottom: 18,
                }}>
                  <div style={{ fontSize: 12.5, color: '#8fbf9a', marginBottom: 3 }}>
                    {mine ? '🎲 You are hosting a game' : '🎲 A game is being hosted right now'}
                  </div>
                  <div style={{ fontSize: 10.5, color: '#6a8a72', marginBottom: 10 }}>
                    Game #{openLobby.gameNumber} ·{' '}
                    {openLobby.seats.filter(s => !s.isAI).length} of {openLobby.humanSlots} players in
                    {openLobby.seats.some(s => s.isAI) &&
                      ` · ${openLobby.seats.filter(s => s.isAI).length} computer`}
                  </div>
                  {/* First-time joiners name THEMSELVES — this becomes their
                      permanent campaign identity, typed by its owner. */}
                  {needsName && (
                    <input
                      value={joinName}
                      onChange={e => { setJoinName(e.target.value); setLobbyError(null) }}
                      onKeyDown={e => { if (e.key === 'Enter' && !joinDisabled) joinOpenLobby() }}
                      maxLength={MAX_ROSTER_NAME}
                      placeholder="Your name — what the board will call you"
                      style={{
                        width: '100%', padding: '9px 12px', borderRadius: 6, marginBottom: 8,
                        border: '1.5px solid rgba(39,174,96,0.40)',
                        background: 'rgba(0,0,0,0.40)', color: '#E8DCC8',
                        fontSize: 13, fontFamily: 'Georgia, serif', boxSizing: 'border-box',
                      }}
                    />
                  )}
                  <button
                    onClick={mine ? () => onEnterLobby(openLobby, legacy) : joinOpenLobby}
                    disabled={joinDisabled}
                    style={{
                      width: '100%', padding: '11px', borderRadius: 8, fontSize: 13, fontWeight: 'bold',
                      fontFamily: 'Georgia, serif', cursor: joinDisabled ? 'not-allowed' : 'pointer',
                      border: '1.5px solid rgba(39,174,96,0.6)',
                      background: 'rgba(39,174,96,0.16)',
                      color: joinDisabled ? '#5a7a62' : '#E8DCC8',
                    }}>
                    {mine ? 'Return to Your Lobby →'
                      : joiningLobby ? 'Joining…'
                      : !claimed && playerName.trim() ? `Join as ${playerName.trim()} →`
                      : claimed ? `Join This Game as ${claimed.name} →`
                      : `Join as ${joinName.trim() || '…'} →`}
                  </button>
                  {lobbyError && (
                    <div style={{ fontSize: 10.5, color: '#e08070', marginTop: 8, lineHeight: 1.5 }}>
                      {lobbyError}
                    </div>
                  )}
                </div>
              )
            })()}

            {legacy.joinCode && <JoinCodeCard code={legacy.joinCode} />}

            {/* Who the code lets in. Sits directly under it because the two are
                one thought: a code is only useful while an unclaimed name
                exists for the person you send it to. */}
            <CampaignRosterPanel legacy={legacy} user={user} onAdd={handleAddRosterMember} />

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

            {/* The scar POOL is deliberately not shown here. Which cards are
                still in the box is a mid-game concern, dealt at the start of
                each game and visible in the Legacy panel — announcing "6 of 6
                remaining" before anyone has sat down was noise on the one
                screen that should be about picking up where you left off. */}

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
              <>
                <button onClick={handleContinue} style={primaryBtn('#C8940A')}>
                  🃏 Deal Scar Cards &amp; Start Game #{legacy.currentGameNumber} (one screen)
                </button>
                {/* Hosting opens a lobby and waits. Hidden while somebody else
                    is already hosting — the panel above outranks it, because a
                    second lobby is the two-games problem all over again. */}
                {user && !openLobby && (
                  <button
                    onClick={hostOnlineGame}
                    disabled={hostingGame}
                    style={{
                      ...primaryBtn('#2980B9'), marginTop: 8,
                      border: '2px solid rgba(41,128,185,0.55)',
                      background: 'rgba(41,128,185,0.12)',
                      opacity: hostingGame ? 0.5 : 1,
                    }}>
                    {hostingGame ? 'Opening lobby…' : `🌐 Host Game #${legacy.currentGameNumber} Online`}
                  </button>
                )}
                {hostError && (
                  <div style={{
                    padding: '8px 12px', borderRadius: 6, marginTop: 8, fontSize: 11,
                    background: 'rgba(231,76,60,0.10)', border: '1px solid rgba(231,76,60,0.40)',
                    color: '#e08070', textAlign: 'center', lineHeight: 1.5,
                  }}>
                    {hostError}
                  </div>
                )}
              </>
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

            {/* Only the founder's own name. Everyone else types theirs when
                they join — the person at the other machine is the authority on
                what they are called, not whoever made the campaign. */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 11, color: '#6a5030', display: 'block', marginBottom: 8, letterSpacing: 1 }}>
                YOUR NAME
              </label>
              <input
                value={founderName}
                onChange={e => { setFounderName(e.target.value); setCreateError(null) }}
                onKeyDown={e => { if (e.key === 'Enter' && founderName.trim() && !creating) handleNewCampaignStart(worldName.trim() || 'New World') }}
                maxLength={MAX_ROSTER_NAME}
                placeholder="What the board will call you"
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 6,
                  border: '1.5px solid rgba(200,148,10,0.45)',
                  background: 'rgba(0,0,0,0.40)', color: '#E8DCC8',
                  fontSize: 15, fontFamily: 'Georgia, serif', boxSizing: 'border-box',
                }}
              />
              <div style={{ fontSize: 10, color: '#5a4020', marginTop: 8, lineHeight: 1.5 }}>
                Permanent for the whole campaign — it goes on every signature and city you claim.
                Everyone else adds their own name when they join with the campaign code.
                {user
                  ? ` This name will be linked to ${user.email}.`
                  : ' Sign in first if you want your record to follow your account.'}
              </div>
            </div>

            {createError && (
              <div style={{
                padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 11,
                background: 'rgba(231,76,60,0.10)', border: '1px solid rgba(231,76,60,0.40)',
                color: '#e08070', textAlign: 'center',
              }}>
                {createError}
              </div>
            )}

            <button
              onClick={() => handleNewCampaignStart(worldName.trim() || 'New World')}
              disabled={!founderName.trim() || creating}
              style={{
                ...primaryBtn('#C8940A'),
                opacity: founderName.trim() && !creating ? 1 : 0.4,
                cursor: founderName.trim() && !creating ? 'pointer' : 'not-allowed',
              }}
            >
              {creating ? 'Creating…' : '✦ Create Campaign'}
            </button>
            <button
              onClick={() => { setCreateError(null); setStatus('picking') }}
              style={{ ...ghostBtnStyle, marginTop: 8 }}>
              ← Back
            </button>
          </>
        )}
      </div>
      <div style={{ position: 'fixed', bottom: 6, right: 10, fontSize: 9, color: '#4a3820', fontFamily: 'Menlo, Consolas, monospace' }}>{BUILD_STAMP}</div>
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
