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

type Screen = 'loading' | 'between-games' | 'player-slots' | 'scar-dealing' | 'dice-roll' | 'draft-setup' | 'game-setup' | 'playing'

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
      />
    )
  } else if (screen === 'player-slots') {
    content = <PlayerSlotsScreen legacy={legacy} user={user} onConfirm={handleSlotsChosen} />
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
