import { useState, useEffect, type ReactNode } from 'react'
import type { LegacyState, DealtScar } from '@/types/legacy'
import SoundSettings from '@/components/SoundSettings'
import UpdateStatus from '@/components/UpdateStatus'
import ZoomIndicator from '@/components/ZoomIndicator'
import ConnectionStatus from '@/components/ConnectionStatus'
import { FACTION_ABILITY_OPTIONS } from '@/data/factionAbilities'
import type { GameState } from '@/types/game'
import BetweenGameScreen from '@/components/BetweenGameScreen'
import DiceRollScreen from '@/components/DiceRollScreen'
import GameSetupScreen, { type PlayerSetup } from '@/components/GameSetupScreen'
import DraftSetupScreen from '@/components/DraftSetupScreen'
import PlayerSlotsScreen, { type SlotConfig, type PlayerSlotSetup } from '@/components/PlayerSlotsScreen'
import { getCurrentUser, onAuthChange, type AuthUser } from '@/lib/auth'
import ScarDealingScreen from '@/components/ScarDealingScreen'
import GameBoard from '@/components/GameBoard'
import { loadLegacyState, saveLegacyState, getActiveCampaignId } from '@/lib/legacyApi'
import { dealScarCards } from '@/data/scarCards'
import { MOCK_PLAYERS, applyRosterNames } from '@/data/mockGameState'
import { hasRoster, getRoster, createRoster } from '@/lib/roster'
import { createLobby, matchState, type Lobby } from '@/lib/lobby'
import LobbyScreen from '@/components/LobbyScreen'

type Screen = 'loading' | 'between-games' | 'player-slots' | 'lobby' | 'scar-dealing' | 'dice-roll' | 'draft-setup' | 'game-setup' | 'playing'

type RestoredGameState = Omit<GameState, 'legacySnapshot'>

export default function App() {
  const [screen, setScreen]                     = useState<Screen>('loading')
  const [legacy, setLegacy]                     = useState<LegacyState | null>(null)
  const [rosterIds, setRosterIds]               = useState<string[]>([])
  const [playerOrder, setPlayerOrder]           = useState<string[]>([])
  const [playerSetups, setPlayerSetups]         = useState<PlayerSetup[]>([])
  /** Chosen on the slots screen: this GAME is played across machines. */
  const [playOnline, setPlayOnline]             = useState(false)
  const [user, setUser]                         = useState<AuthUser | null>(null)
  const [slotConfig, setSlotConfig]             = useState<Record<string, SlotConfig>>({})
  const [gameDeals, setGameDeals]               = useState<DealtScar[]>([])
  const [restoredGameState, setRestoredGameState] = useState<RestoredGameState | null>(null)
  /** The lobby being waited in, whether hosting it or having joined it. */
  const [lobby, setLobby]                       = useState<Lobby | null>(null)
  /**
   * The lobby this client must ACTIVATE once it has built a board. Host only —
   * a joiner never builds a board, they receive one.
   */
  const [lobbyToStart, setLobbyToStart]         = useState<string | null>(null)
  /** An already-running match this client joined. Its board comes from the server. */
  const [joinedMatch, setJoinedMatch]           = useState<{ matchId: string; version: number } | null>(null)

  // On mount: check Supabase for an in-progress game and resume it directly,
  // bypassing the between-game / dice-roll / setup screens entirely.
  useEffect(() => {
    // Resume only the campaign this device was last in. With many campaigns
    // side by side there is no "the" campaign to load, so an absent or stale
    // pointer simply drops through to the picker.
    getActiveCampaignId()
      .then(id => (id ? loadLegacyState(id) : null))
      .then(ls => {
        // Seat labels everywhere read from the shared table, so point it at the
        // campaign roster before any screen renders.
        if (ls) applyRosterNames(getRoster(ls))
        if (ls?.gameInProgress && ls.activeGameState) {
          setLegacy(ls)
          setRestoredGameState(ls.activeGameState as RestoredGameState)
          setScreen('playing')
        } else {
          setScreen('between-games')
        }
      })
      .catch(() => setScreen('between-games'))
  }, [])

  useEffect(() => {
    void getCurrentUser().then(setUser)
    return onAuthChange(setUser)
  }, [])

  // New-game flow: players (count/names/AI) → scar dealing → dice roll → setup
  function handleReadyForDiceRoll(ls: LegacyState) {
    setLegacy(ls)
    applyRosterNames(getRoster(ls))
    setRestoredGameState(null)
    setScreen('player-slots')
  }

  async function handleSlotsChosen(slots: PlayerSlotSetup[], online = false) {
    setPlayOnline(online)
    setSlotConfig(Object.fromEntries(slots.map(s => [s.playerId, { isAI: s.isAI, difficulty: s.difficulty }])))
    const ids = slots.map(s => s.playerId)
    setRosterIds(ids)

    // Deal scar cards to the SELECTED players only (legacy state was
    // normalized by BetweenGameScreen, so scarDeck/dealtScars are arrays)
    let ls = legacy
    if (!ls) return

    // ── Online: open a lobby and wait, rather than dealing straight away ────
    // Everything after this point — scars, dice, factions — is decided for a
    // fixed set of players, so it cannot begin until that set is settled. The
    // host waits here; the game proceeds when they press Start.
    if (online && user) {
      const me = getRoster(ls).find(m => m.userId === user.id)
      if (!me) return
      const humans = slots.filter(s => !s.isAI)
      const ais = slots.filter(s => s.isAI)
      try {
        const open = await createLobby(
          ls.campaignId, ls.currentGameNumber,
          { playerId: me.id, name: me.name },
          humans.length,
          ais.map(a => ({ playerId: a.playerId, name: a.name, difficulty: a.difficulty })),
        )
        setLobby(open)
        setScreen('lobby')
        return                      // the rest resumes from handleLobbyStart
      } catch (e) {
        // A lobby that cannot be opened must not silently become a game only
        // this machine can see — fall back to one screen and say so.
        console.error('[Lobby] could not open a lobby, playing on one screen:', e)
        setPlayOnline(false)
      }
    }

    // First time players are named, that list becomes the permanent campaign
    // roster. Seat ids are fixed by naming order, so every later game seats
    // people by id and their campaign record follows them.
    if (!hasRoster(ls)) {
      ls = { ...ls, roster: createRoster(slots.map(s => s.name), ls.currentGameNumber) }
      setLegacy(ls)
      await saveLegacyState(ls).catch(() => {})
    }
    // Refresh the shared seat labels from the roster (identity is unchanged —
    // seat ids ARE roster ids; only the displayed names are synced).
    applyRosterNames(getRoster(ls))
    await dealScarsAndContinue(ls, ids)
  }

  /**
   * Deal this game's scar cards and move on to the dealing screen.
   *
   * Shared by the hotseat path and the host's post-lobby path so the two cannot
   * drift — an online game must be dealt exactly like any other, from the same
   * campaign deck, to the players who are actually seated.
   */
  async function dealScarsAndContinue(ls: LegacyState, ids: string[]) {
    const gameNumber = ls.currentGameNumber
    // If this game's cards were already dealt (e.g. reloading before the game
    // started), reuse them — a player may only ever hold ONE scar card at a time
    const existing = (ls.dealtScars ?? []).filter(d => d.gameNumber === gameNumber)
    if (existing.length > 0) {
      setGameDeals(existing)
      setScreen('scar-dealing')
      return
    }
    const seed = (Date.now() ^ (gameNumber * 0x9e3779b9)) >>> 0
    const { deals, newDeckIds } = dealScarCards(ids, gameNumber, ls.scarDeck, seed)
    const newDealtScars: DealtScar[] = deals.map(d => ({
      cardId: d.cardId, playerId: d.playerId, gameNumber, placed: false,
    }))
    const updated: LegacyState = {
      ...ls,
      scarDeck: newDeckIds,
      dealtScars: [...(ls.dealtScars ?? []), ...newDealtScars],
    }
    await saveLegacyState(updated).catch(() => {})
    setLegacy(updated)
    setGameDeals(newDealtScars)
    setScreen('scar-dealing')
  }

  /**
   * The lobby is done with. Two very different continuations.
   *
   * The HOST goes on through the normal setup — scars, dice, factions — and the
   * lobby is only flipped to 'active' at the end of it, when a board finally
   * exists for the server to be authoritative over. `lobbyToStart` carries that
   * obligation to GameBoard.
   *
   * A JOINER never runs setup at all. They receive the finished board from the
   * match row, which is the whole point: one game, built once.
   */
  async function handleLobbyStart(started: Lobby) {
    const ls = legacy
    if (!ls || !user) return
    const seats = started.seats
    setSlotConfig(Object.fromEntries(seats.map(s =>
      [s.playerId, { isAI: s.isAI, difficulty: s.aiDifficulty ?? 'medium' }])))
    setRosterIds(seats.map(s => s.playerId))
    setPlayOnline(true)

    if (started.createdBy === user.id && started.status === 'lobby') {
      setLobbyToStart(started.matchId)
      setLobby(null)
      await dealScarsAndContinue(ls, seats.map(s => s.playerId))
      return
    }

    // Joiner: the board is on the server already.
    const state = await matchState(started.matchId)
    if (!state) return
    setJoinedMatch({ matchId: started.matchId, version: state.version })
    setRestoredGameState(state.state as RestoredGameState)
    setLobby(null)
    setScreen('playing')
  }

  function handleLeaveLobby() {
    setLobby(null)
    setLobbyToStart(null)
    setPlayOnline(false)
    setScreen('between-games')
  }

  function handleOrderDetermined(orderedIds: string[]) {
    setPlayerOrder(orderedIds)
    if (legacy?.draftOrderUnlocked) {
      setScreen('draft-setup')
    } else {
      setScreen('game-setup')
    }
  }

  async function handleSetupComplete(
    setups: PlayerSetup[],
    order: string[],
    abilityChoices: Record<string, string>,
    weaknessChoices: Record<string, string> = {},
  ) {
    // Merge the human/AI slot configuration chosen earlier into each setup
    const withAI: PlayerSetup[] = setups.map(s => {
      const cfg = slotConfig[s.playerId]
      return cfg?.isAI ? { ...s, isAI: true, aiDifficulty: cfg.difficulty } : { ...s, isAI: false, aiDifficulty: undefined }
    })
    setPlayerSetups(withAI)
    setPlayerOrder(order)
    if (legacy) {
      let updated: LegacyState = legacy
      let dirty = false
      if (Object.keys(abilityChoices).length > 0) {
        // Compute unchosen ability IDs: for each faction that just locked in an ability,
        // the other ability option is permanently removed from the campaign.
        const existingRemoved = legacy.removedAbilityIds ?? []
        const newlyRemoved: string[] = []
        for (const [factionId, chosenId] of Object.entries(abilityChoices)) {
          const wasAlreadyChosen = (legacy.chosenFactionAbilities ?? {})[factionId]
          if (!wasAlreadyChosen) {
            const unchosenId = FACTION_ABILITY_OPTIONS
              .find(a => a.factionId === factionId && a.id !== chosenId)?.id
            if (unchosenId && !existingRemoved.includes(unchosenId)) {
              newlyRemoved.push(unchosenId)
            }
          }
        }
        updated = {
          ...updated,
          chosenFactionAbilities: abilityChoices,
          removedAbilityIds: [...existingRemoved, ...newlyRemoved],
        }
        dirty = true
      }
      if (Object.keys(weaknessChoices).length > 0) {
        updated = {
          ...updated,
          alienWeaknessPowers: { ...(updated.alienWeaknessPowers ?? {}), ...weaknessChoices },
        }
        dirty = true
      }
      if (dirty) {
        setLegacy(updated)
        await saveLegacyState(updated).catch(() => {})
      }
    }
    setRestoredGameState(null)
    setScreen('playing')
  }

  function handleReturnToLobby() {
    setRestoredGameState(null)
    setScreen('between-games')
  }

  /**
   * Re-enter a game that is still in progress.
   *
   * Leaving to the menu does not end a game — the board is autosaved on every
   * phase boundary and `gameInProgress` stays set — so this drops straight back
   * into the saved board rather than through the setup flow.
   */
  function handleResumeGame(ls: LegacyState) {
    if (!ls.activeGameState) return
    setLegacy(ls)
    applyRosterNames(getRoster(ls))
    setRestoredGameState(ls.activeGameState as RestoredGameState)
    setScreen('playing')
  }

  let content: ReactNode
  if (screen === 'loading') {
    content = (
      <div style={{
        position: 'fixed', inset: 0,
        background: '#0A0500',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Georgia, serif', color: '#C8940A', fontSize: 16,
        letterSpacing: 2,
      }}>
        RISK LEGACY
      </div>
    )
  } else if (screen === 'between-games') {
    content = (
      <BetweenGameScreen
        onReadyForDiceRoll={handleReadyForDiceRoll}
        onResumeGame={handleResumeGame}
        onNewCampaign={() => { setLegacy(null); setScreen('between-games') }}
        onEnterLobby={(joined, ls) => {
          setLegacy(ls)
          applyRosterNames(getRoster(ls))
          setLobby(joined)
          setScreen('lobby')
        }}
      />
    )
  } else if (screen === 'player-slots') {
    content = <PlayerSlotsScreen legacy={legacy} user={user} onConfirm={handleSlotsChosen} />
  } else if (screen === 'lobby' && lobby && legacy && user) {
    content = (
      <LobbyScreen
        lobby={lobby}
        legacy={legacy}
        user={user}
        onStart={handleLobbyStart}
        onLeave={handleLeaveLobby}
      />
    )
  } else if (screen === 'scar-dealing' && legacy) {
    content = (
      <ScarDealingScreen
        legacy={legacy}
        gameDeals={gameDeals}
        players={rosterIds.map(id => MOCK_PLAYERS.find(p => p.id === id)!).filter(Boolean)}
        onContinue={() => setScreen('dice-roll')}
      />
    )
  } else if (screen === 'dice-roll') {
    content = <DiceRollScreen playerIds={rosterIds} onOrderDetermined={handleOrderDetermined} />
  } else if (screen === 'draft-setup') {
    content = (
      <DraftSetupScreen
        playerOrder={playerOrder}
        existingAbilities={legacy?.chosenFactionAbilities ?? {}}
        legacy={legacy}
        onDraftComplete={handleSetupComplete}
      />
    )
  } else if (screen === 'game-setup') {
    content = (
      <GameSetupScreen
        playerOrder={playerOrder}
        existingAbilities={legacy?.chosenFactionAbilities ?? {}}
        removedAbilityIds={legacy?.removedAbilityIds ?? []}
        legacy={legacy ?? null}
        onSetupComplete={handleSetupComplete}
      />
    )
  } else {
    content = (
      <GameBoard
        initialLegacy={legacy}
        playerOrder={playerOrder}
        playerSetups={playerSetups}
        playOnline={playOnline}
        lobbyToStart={lobbyToStart}
        joinedMatch={joinedMatch}
        restoredGameState={restoredGameState}
        onReturnToLobby={handleReturnToLobby}
      />
    )
  }

  // The in-game board hosts its own volume control inside its top-right toolbar;
  // every other screen gets the free-floating corner one.
  return (
    <>
      {content}
      {screen !== 'playing' && <SoundSettings />}
      {/* Mounted at the root so it also covers the lobby and setup screens,
          which write to Supabase too (roster, scar dealing, new campaign). */}
      <ConnectionStatus />
      {/* Desktop-only; render nothing in the browser build. */}
      <UpdateStatus />
      <ZoomIndicator />
    </>
  )
}
