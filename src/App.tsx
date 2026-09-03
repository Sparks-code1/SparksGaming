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
import { hasRoster, getRoster, createRoster, addRosterMember } from '@/lib/roster'
import { BUILD_STAMP } from '@/lib/buildStamp'
import { matchState, reconcileSeats, setLobbyShape, readLobby, type Lobby } from '@/lib/lobby'
import { DRAFT_TROOP_SLOTS, DRAFT_COIN_SLOTS, type SetupDoc } from '@/lib/setupFlow'
import { isComputerSeat } from '@/lib/onlineMatch'
import LobbyScreen from '@/components/LobbyScreen'
import DuneLobbyScreen from '@/components/dune/DuneLobbyScreen'
import DuneMatchScreen from '@/components/dune/DuneMatchScreen'
import OnlineSetupScreen from '@/components/OnlineSetupScreen'

type Screen = 'loading' | 'between-games' | 'player-slots' | 'lobby' | 'online-setup' | 'scar-dealing' | 'dice-roll' | 'draft-setup' | 'game-setup' | 'playing'
  // The other game. Two screens rather than one: finding or opening a table,
  // and then the match itself.
  | 'dune-lobby' | 'dune-match'

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
  /** End-of-game "everyone continued" hand-off: what this machine should do
   *  the moment the campaign screen mounts — re-host the next game, or watch
   *  for the host's lobby and join it. */
  const [autoNextGame, setAutoNextGame]         = useState<'host' | 'join' | null>(null)
  const [gameDeals, setGameDeals]               = useState<DealtScar[]>([])
  const [restoredGameState, setRestoredGameState] = useState<RestoredGameState | null>(null)
  /** The lobby being waited in, whether hosting it or having joined it. */
  const [lobby, setLobby]                       = useState<Lobby | null>(null)
  /**
   * The lobby this client must ACTIVATE once it has built a board. Host only —
   * a joiner never builds a board, they receive one.
   */
  const [lobbyToStart, setLobbyToStart]         = useState<string | null>(null)
  /** The Dune match being played, once one has been dealt. */
  const [duneMatch, setDuneMatch]               = useState<string | null>(null)
  /** An already-running match this client joined. Its board comes from the server. */
  const [joinedMatch, setJoinedMatch]           = useState<{ matchId: string; version: number } | null>(null)
  /** The reconciled lobby whose setup (dice, factions, HQs) is being played out. */
  const [setupLobby, setSetupLobby]             = useState<Lobby | null>(null)

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

  useEffect(() => { console.info(`[Build] ${BUILD_STAMP}`) }, [])
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

  /**
   * The hotseat path. Online games never come here — hosting happens from the
   * campaign screen and goes through the lobby, where players seat themselves.
   */
  async function handleSlotsChosen(slots: PlayerSlotSetup[]) {
    setPlayOnline(false)
    // A hotseat game must not inherit online leftovers from an earlier game.
    setJoinedMatch(null)
    setLobbyToStart(null)
    setSetupLobby(null)
    let ls = legacy
    if (!ls) return

    // A campaign that predates rosters names its whole table here, once.
    if (!hasRoster(ls)) {
      ls = { ...ls, roster: createRoster(slots.map(s => s.name), ls.currentGameNumber) }
    }
    // Seats with a typed name are people (or AI) joining the campaign right
    // now — their roster entry is created here, and the id it lands on is the
    // id this game seats. Sequential on purpose: each addition sees the one
    // before it, exactly like the online reconcile.
    let roster = getRoster(ls)
    const ids: string[] = []
    for (const s of slots) {
      if (s.playerId) { ids.push(s.playerId); continue }
      const added = addRosterMember(roster, s.name, ls.currentGameNumber)
      if (!added.ok || !added.member) {
        console.error('[Slots] could not add', s.name, added.reason)
        return
      }
      roster = added.roster
      ids.push(added.member.id)
    }
    if (roster !== getRoster(ls)) ls = { ...ls, roster }
    if (ls !== legacy) {
      setLegacy(ls)
      await saveLegacyState(ls).catch(() => {})
    }

    setSlotConfig(Object.fromEntries(slots.map((s, i) => [ids[i], { isAI: s.isAI, difficulty: s.difficulty }])))
    setRosterIds(ids)
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
   * The HOST first settles who the seats actually ARE. People named themselves
   * on the way in and AI names were typed or generated in the lobby, so the
   * roster may never have heard of some of them — reconcile matches every seat
   * to a roster identity, adds the missing AI, and rewrites the seat rows so
   * the server's turn-validation speaks the same ids as the board. Only then
   * does the normal setup run — scars, dice, factions — with the lobby flipped
   * to 'active' at the very end, when a board exists to be authoritative over.
   *
   * A JOINER never runs setup at all. They receive the finished board from the
   * match row, which is the whole point: one game, built once.
   *
   * Returns an error message for the lobby screen to show, or null.
   */
  async function handleLobbyStart(started: Lobby): Promise<string | null> {
    if (!legacy || !user) return 'Not signed in'
    setPlayOnline(true)

    if (started.createdBy === user.id && started.status === 'lobby') {
      // Hosting THIS game — anything joined earlier is a previous game.
      setJoinedMatch(null)
      // Joiners wrote themselves onto the roster after this screen loaded it —
      // reconcile against what the server has, not what this machine remembers.
      let fresh = await loadLegacyState(started.campaignId)
      if (!fresh) return 'Could not reload the campaign'

      const rec = reconcileSeats(started.seats, getRoster(fresh))
      if (!rec.ok) return rec.reason ?? 'Could not start the game'

      let roster = getRoster(fresh)
      for (const ai of rec.aiToAdd) {
        const added = addRosterMember(roster, ai.name, fresh.currentGameNumber)
        if (!added.ok) return added.reason ?? `Could not add ${ai.name} to the campaign`
        roster = added.roster
      }
      if (rec.aiToAdd.length > 0) {
        fresh = { ...fresh, roster }
        await saveLegacyState(fresh)
      }
      // The seat rows must carry the REAL roster ids before the game starts —
      // the server decides whose turn it is by looking them up.
      const finalAis = rec.resolved.filter(r => r.isAI)
      if (finalAis.length > 0 || started.seats.some(s => s.isAI)) {
        await setLobbyShape(started.matchId, started.humanSlots,
          finalAis.map(a => ({ playerId: a.playerId, name: a.name, difficulty: a.aiDifficulty ?? 'medium' })))
      }
      // Re-read so the setup screen sees the reconciled seats, not provisional
      // AI ids — every id shown from here on is a real roster identity.
      const reconciled = await readLobby(started.matchId)
      setSetupLobby(reconciled)

      setLegacy(fresh)
      applyRosterNames(getRoster(fresh))
      setSlotConfig(Object.fromEntries(rec.resolved.map(r =>
        [r.playerId, { isAI: r.isAI, difficulty: r.aiDifficulty ?? 'medium' }])))
      setRosterIds(rec.resolved.map(r => r.playerId))
      setLobbyToStart(started.matchId)
      // The lobby is cleared only AFTER the next screen is set. Clearing it
      // first left one await during which App rendered screen='lobby' with no
      // lobby — the gap the phantom-GameBoard fall-through lived in.
      await dealScarsAndContinue(fresh, rec.resolved.map(r => r.playerId))
      setLobby(null)
      return null
    }

    // Joiner: the board is on the server already, and so is the roster the
    // host just finished growing — read both rather than trusting this
    // machine's stale copies.
    const state = await matchState(started.matchId)
    if (!state) return 'The game started but its board could not be read'
    const fresh = (await loadLegacyState(started.campaignId).catch(() => null)) ?? legacy
    setLegacy(fresh)
    applyRosterNames(getRoster(fresh))
    setSlotConfig(Object.fromEntries(started.seats.map(s =>
      [s.playerId, { isAI: s.isAI, difficulty: s.aiDifficulty ?? 'medium' }])))
    setRosterIds(started.seats.map(s => s.playerId))
    setJoinedMatch({ matchId: started.matchId, version: state.version })
    setLobbyToStart(null)         // joining, not hosting — never both
    setRestoredGameState(state.state as RestoredGameState)
    setLobby(null)
    setSetupLobby(null)
    setScreen('playing')
    return null
  }

  function handleLeaveLobby() {
    setLobby(null)
    setSetupLobby(null)
    setLobbyToStart(null)
    setJoinedMatch(null)
    setPlayOnline(false)
    setScreen('between-games')
  }

  /**
   * The host's setup document is complete — turn it into a board, exactly the
   * way the hotseat setup screen would have: same PlayerSetup shape, same
   * ability/weakness bookkeeping, same handler.
   */
  async function handleOnlineSetupComplete(doc: SetupDoc) {
    const lobbySeats = setupLobby?.seats ?? []
    if (!doc.order) return
    // A drafted game carries two more things off the board: the troop and coin
    // slots each player claimed. They are stored as slot INDEXES, resolved
    // against the same tables the hotseat board offers.
    const troopSlots = DRAFT_TROOP_SLOTS(doc.order.length)
    const coinSlots = DRAFT_COIN_SLOTS(doc.order.length)
    const setups: PlayerSetup[] = doc.order.map(pid => {
      const t = (doc.troops ?? {})[pid]
      const c = (doc.coins ?? {})[pid]
      return {
        playerId: pid,
        name: lobbySeats.find(s => s.playerId === pid)?.name ?? pid,
        factionId: doc.factions[pid] ?? 'enclave-of-the-bear',
        startingTerritoryId: doc.territories[pid] ?? '',
        ...(t !== undefined ? { startingTroops: troopSlots[t] } : {}),
        ...(c !== undefined ? { startingCoins: coinSlots[c] } : {}),
      }
    })
    await handleSetupComplete(
      setups, doc.order,
      { ...(legacy?.chosenFactionAbilities ?? {}), ...doc.abilities },
      doc.weaknesses,
    )
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
    // Merge the human/AI slot configuration chosen earlier into each setup.
    //
    // Online, a seat with no account is a computer player whatever the slots
    // screen said — nobody can send actions for it, so leaving it human builds
    // a board that stops on its turn. The board must carry the same answer the
    // seat rows will (see isComputerSeat), because the AI driver reads the
    // board and the server reads the seats.
    const roster = legacy ? getRoster(legacy) : []
    const withAI: PlayerSetup[] = setups.map(s => {
      const cfg = slotConfig[s.playerId]
      const isAI = isComputerSeat({
        online: playOnline,
        markedAI: cfg?.isAI,
        accountUserId: roster.find(m => m.id === s.playerId)?.userId,
      })
      return isAI
        ? { ...s, isAI: true, aiDifficulty: cfg?.difficulty ?? 'medium' }
        : { ...s, isAI: false, aiDifficulty: undefined }
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

  function handleReturnToLobby(next?: 'host-next' | 'join-next') {
    setRestoredGameState(null)
    // Everything tying this client to A game must die with the game. A
    // joinedMatch that outlives its game was adopted by the NEXT game's board,
    // which then never flipped its own lobby — stranding every joiner on
    // "the game opens in a moment".
    setJoinedMatch(null)
    setLobbyToStart(null)
    setSetupLobby(null)
    setLobby(null)
    setPlayOnline(false)
    // "Continue to the next game" from the end-of-game gate: the campaign
    // screen flows straight into the next lobby — the finished match's host
    // re-hosts, everyone else auto-joins when the lobby appears.
    setAutoNextGame(next === 'host-next' ? 'host' : next === 'join-next' ? 'join' : null)
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
        autoNextGame={autoNextGame}
        onAutoNextConsumed={() => setAutoNextGame(null)}
        onEnterLobby={(joined, ls) => {
          setLegacy(ls)
          applyRosterNames(getRoster(ls))
          setLobby(joined)
          setScreen('lobby')
        }}
        onPlayDune={() => setScreen('dune-lobby')}
      />
    )
  } else if (screen === 'dune-lobby') {
    content = (
      <DuneLobbyScreen
        onExit={() => setScreen('between-games')}
        onPlay={id => {
          setDuneMatch(id)
          // THE URL FOLLOWS, so a refresh lands back in the same match and the
          // address bar is something a player can send to somebody. It is the
          // route main.tsx already has — this screen is reached without typing
          // it, which is the whole point, but it stays typeable.
          window.history.replaceState(null, '', `?dune-match=${id}`)
          setScreen('dune-match')
        }} />
    )
  } else if (screen === 'dune-match' && duneMatch) {
    content = (
      <DuneMatchScreen
        matchId={duneMatch}
        onExit={() => {
          // BACK TO THE DUNE SCREEN, not out of Dune altogether: the commonest
          // reason to leave a game is to get at another one. The match is not
          // ended and the seat is still theirs — it is listed there under
          // YOUR GAMES with a Rejoin beside it.
          //
          // The query flag goes with it, or a refresh would drop straight back
          // into the game they just left.
          window.history.replaceState(null, '', window.location.pathname)
          setDuneMatch(null)
          setScreen('dune-lobby')
        }} />
    )
  } else if (screen === 'player-slots') {
    content = (
      <PlayerSlotsScreen
        legacy={legacy}
        onConfirm={handleSlotsChosen}
        onBack={() => setScreen('between-games')}
      />
    )
  } else if (screen === 'lobby' && lobby && legacy && user) {
    content = (
      <LobbyScreen
        lobby={lobby}
        legacy={legacy}
        user={user}
        onStart={handleLobbyStart}
        onLeave={handleLeaveLobby}
        onSetupStarted={started => {
          // The host has begun setup — the dice are about to be rolled, and
          // this player rolls their own on the setup screen.
          //
          // But first: the scar deal. The host deals this game's cards on the
          // way here and saves them, and the deal is the only place the
          // campaign tells a player what they are holding this game — a
          // joiner who is dropped straight onto the dice never sees it. Their
          // copy of the campaign predates the deal (and the roster names the
          // host may have just added for the AI), so it is re-read here.
          setPlayOnline(true)
          setSetupLobby(started)
          setLobby(null)
          void (async () => {
            const fresh = await loadLegacyState(started.campaignId).catch(() => null)
            const ls = fresh ?? legacy
            if (fresh) { setLegacy(fresh); applyRosterNames(getRoster(fresh)) }
            const deals = (ls?.dealtScars ?? [])
              .filter(d => d.gameNumber === ls?.currentGameNumber)
            // Who is at this table. The host builds this on the slots screen,
            // which a joiner never sees — without it every recipient on the
            // deal screen reads "Unknown". The seats are reconciled by now, so
            // their ids are the campaign's own.
            setRosterIds(started.seats.map(s => s.playerId))
            if (deals.length > 0) { setGameDeals(deals); setScreen('scar-dealing') }
            else setScreen('online-setup')
          })()
        }}
      />
    )
  } else if (screen === 'online-setup' && setupLobby && legacy && user) {
    content = (
      <OnlineSetupScreen
        lobby={setupLobby}
        legacy={legacy}
        user={user}
        onComplete={doc => { void handleOnlineSetupComplete(doc) }}
        onActive={handleLobbyStart}
        onLeave={handleLeaveLobby}
      />
    )
  } else if (screen === 'scar-dealing' && legacy) {
    content = (
      <ScarDealingScreen
        legacy={legacy}
        gameDeals={gameDeals}
        players={rosterIds.map(id => MOCK_PLAYERS.find(p => p.id === id)!).filter(Boolean)}
        onContinue={() => {
          // Online, the dice and every pick happen on a shared document each
          // player drives from their own screen — the draft board included,
          // since S43. Offline still walks the hotseat screens.
          if (playOnline && setupLobby) setScreen('online-setup')
          else setScreen('dice-roll')
        }}
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
        aiPlayerIds={new Set(Object.keys(slotConfig).filter(id => slotConfig[id].isAI))}
        // HOW HARD, alongside WHICH. Both setup screens let the computer
        // answer their own questions now, and the slots screen has always
        // asked for a difficulty per seat — it just had nowhere to go.
        aiDifficulty={Object.fromEntries(Object.entries(slotConfig)
          .filter(([, c]) => c.isAI).map(([id, c]) => [id, c.difficulty]))}
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
        aiPlayerIds={new Set(Object.keys(slotConfig).filter(id => slotConfig[id].isAI))}
        // HOW HARD, alongside WHICH. Both setup screens let the computer
        // answer their own questions now, and the slots screen has always
        // asked for a difficulty per seat — it just had nowhere to go.
        aiDifficulty={Object.fromEntries(Object.entries(slotConfig)
          .filter(([, c]) => c.isAI).map(([id, c]) => [id, c.difficulty]))}
        onSetupComplete={handleSetupComplete}
      />
    )
  } else if (screen === 'playing') {
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
  } else {
    // A screen whose data is momentarily missing must NEVER fall through to
    // the board. GameBoard was the catch-all here, and a one-await gap in the
    // host's start flow (screen still 'lobby', lobby already null) mounted a
    // PHANTOM board — whose start effect flipped the lobby to active with a
    // default board. The real setup then could not publish, the joiner
    // adopted garbage, and every genuine move bounced off it as
    // "not your turn". The board renders for 'playing' and nothing else.
    content = (
      <div style={{
        position: 'fixed', inset: 0, background: '#0A0500',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Georgia, serif', color: '#C8940A', fontSize: 14, letterSpacing: 2,
      }}>
        …
      </div>
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
