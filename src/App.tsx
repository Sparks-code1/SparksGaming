import { useState, useEffect } from 'react'
import type { LegacyState, DealtScar } from '@/types/legacy'
import { FACTION_ABILITY_OPTIONS } from '@/data/factionAbilities'
import type { GameState } from '@/types/game'
import BetweenGameScreen from '@/components/BetweenGameScreen'
import DiceRollScreen from '@/components/DiceRollScreen'
import GameSetupScreen, { type PlayerSetup } from '@/components/GameSetupScreen'
import DraftSetupScreen from '@/components/DraftSetupScreen'
import PlayerSlotsScreen, { type SlotConfig, type PlayerSlotSetup } from '@/components/PlayerSlotsScreen'
import ScarDealingScreen from '@/components/ScarDealingScreen'
import GameBoard from '@/components/GameBoard'
import { loadLegacyState, saveLegacyState } from '@/lib/legacyApi'
import { dealScarCards } from '@/data/scarCards'
import { MOCK_PLAYERS } from '@/data/mockGameState'

type Screen = 'loading' | 'between-games' | 'player-slots' | 'scar-dealing' | 'dice-roll' | 'draft-setup' | 'game-setup' | 'playing'

type RestoredGameState = Omit<GameState, 'legacySnapshot'>

export default function App() {
  const [screen, setScreen]                     = useState<Screen>('loading')
  const [legacy, setLegacy]                     = useState<LegacyState | null>(null)
  const [rosterIds, setRosterIds]               = useState<string[]>([])
  const [playerOrder, setPlayerOrder]           = useState<string[]>([])
  const [playerSetups, setPlayerSetups]         = useState<PlayerSetup[]>([])
  const [slotConfig, setSlotConfig]             = useState<Record<string, SlotConfig>>({})
  const [gameDeals, setGameDeals]               = useState<DealtScar[]>([])
  const [restoredGameState, setRestoredGameState] = useState<RestoredGameState | null>(null)

  // On mount: check Supabase for an in-progress game and resume it directly,
  // bypassing the between-game / dice-roll / setup screens entirely.
  useEffect(() => {
    loadLegacyState().then(ls => {
      if (ls?.gameInProgress && ls.activeGameState) {
        setLegacy(ls)
        setRestoredGameState(ls.activeGameState as RestoredGameState)
        setScreen('playing')
      } else {
        setScreen('between-games')
      }
    }).catch(() => setScreen('between-games'))
  }, [])

  // New-game flow: players (count/names/AI) → scar dealing → dice roll → setup
  function handleReadyForDiceRoll(ls: LegacyState) {
    setLegacy(ls)
    setRestoredGameState(null)
    setScreen('player-slots')
  }

  async function handleSlotsChosen(slots: PlayerSlotSetup[]) {
    // Apply custom names to the shared roster so every screen shows them
    for (const s of slots) {
      const p = MOCK_PLAYERS.find(mp => mp.id === s.playerId)
      if (p) p.name = s.name
    }
    setSlotConfig(Object.fromEntries(slots.map(s => [s.playerId, { isAI: s.isAI, difficulty: s.difficulty }])))
    const ids = slots.map(s => s.playerId)
    setRosterIds(ids)

    // Deal scar cards to the SELECTED players only (legacy state was
    // normalized by BetweenGameScreen, so scarDeck/dealtScars are arrays)
    const ls = legacy
    if (!ls) return
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

  if (screen === 'loading') {
    return (
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
  }

  if (screen === 'between-games') {
    return (
      <BetweenGameScreen
        onReadyForDiceRoll={handleReadyForDiceRoll}
        onNewCampaign={() => { setLegacy(null); setScreen('between-games') }}
      />
    )
  }

  if (screen === 'player-slots') {
    return <PlayerSlotsScreen onConfirm={handleSlotsChosen} />
  }

  if (screen === 'scar-dealing' && legacy) {
    return (
      <ScarDealingScreen
        legacy={legacy}
        gameDeals={gameDeals}
        players={rosterIds.map(id => MOCK_PLAYERS.find(p => p.id === id)!).filter(Boolean)}
        onContinue={() => setScreen('dice-roll')}
      />
    )
  }

  if (screen === 'dice-roll') {
    return <DiceRollScreen playerIds={rosterIds} onOrderDetermined={handleOrderDetermined} />
  }

  if (screen === 'draft-setup') {
    return (
      <DraftSetupScreen
        playerOrder={playerOrder}
        existingAbilities={legacy?.chosenFactionAbilities ?? {}}
        legacy={legacy}
        onDraftComplete={handleSetupComplete}
      />
    )
  }

  if (screen === 'game-setup') {
    return (
      <GameSetupScreen
        playerOrder={playerOrder}
        existingAbilities={legacy?.chosenFactionAbilities ?? {}}
        removedAbilityIds={legacy?.removedAbilityIds ?? []}
        legacy={legacy ?? null}
        onSetupComplete={handleSetupComplete}
      />
    )
  }

  return (
    <GameBoard
      initialLegacy={legacy}
      playerOrder={playerOrder}
      playerSetups={playerSetups}
      restoredGameState={restoredGameState}
      onReturnToLobby={handleReturnToLobby}
    />
  )
}
