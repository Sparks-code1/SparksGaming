import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import ConfettiBurst from './ConfettiBurst'
import type { Player } from '@/types/player'
import type { Territory } from '@/types/territory'
import type { LegacyState } from '@/types/legacy'
import type { LegacyEvent } from '@/lib/legacyApi'
import { saveLegacyState, saveGameSession, SCAR_META } from '@/lib/legacyApi'

/** Display label for a scar type (falls back to the raw type). */
function scarLabel(type: string): string {
  return SCAR_META.find(m => m.type === type)?.label ?? type
}
import { FACTION_COLORS, MOCK_PLAYERS } from '@/data/mockGameState'
import { victoryWinnerId } from '@/lib/roster'
import { FORTIFICATION_SUPPLY, fortificationsPlaced, SCAR_CANCEL_LIMIT, scarCancelsLeft, canCancelScar } from '@/lib/gameLogic'
import { playCity } from '@/lib/sounds'
import { CONTINENT_BONUSES, TERRITORY_DEFINITIONS, MAP_WIDTH, MAP_HEIGHT } from '@/data/territoryData'
import { TERRITORY_CARDS } from '@/data/cards'

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_CONTINENTS = [
  { id: 'north-america', name: 'North America' },
  { id: 'south-america', name: 'South America' },
  { id: 'europe',        name: 'Europe' },
  { id: 'africa',        name: 'Africa' },
  { id: 'asia',          name: 'Asia' },
  { id: 'australia',     name: 'Australia' },
]

const CONTINENT_COLOR: Record<string, string> = {
  'north-america': '#E67E22', 'south-america': '#27AE60',
  'europe': '#2980B9', 'africa': '#E74C3C',
  'asia': '#8E44AD', 'australia': '#F39C12',
}

const FACTION_NAMES: Record<string, string> = {
  'enclave-of-the-bear': 'Enclave of the Bear',
  'imperial-balkania':   'Imperial Balkania',
  'khan-industries':     'Khan Industries',
  'saharan-republic':    'Saharan Republic',
  'die-mechaniker':      'Die Mechaniker',
  'noble-vigil':         'Noble Vigil',
  'aliens':              'Aliens',
}

// ─── Types ────────────────────────────────────────────────────────────────────

type WinStep =
  | 'announce'
  | 'sign-board'
  | 'winner-city'
  | 'winner-continent'
  | 'winner-cancel-scar'
  | 'winner-modify-bonus'
  | 'winner-fortify-city'
  | 'winner-destroy-card'
  | 'runnerup-city'
  | 'runnerup-upgrade'

interface Props {
  winner: Player
  winCondition: 'mission' | 'elimination' | 'stars'
  gameNumber: number
  players: Player[]
  territories: Record<string, Territory>
  legacyState: LegacyState
  legacyEvents: LegacyEvent[]
  unlockOptions?: unknown[]
  /**
   * Which slice of the ceremony this machine runs.
   *
   * 'hotseat' (default) — the whole flow at one keyboard, exactly as always:
   * winner steps, every runner-up, then finalize saves the campaign.
   * 'online-winner' — the winner's steps (plus any AI runner-ups this machine
   * answers for); NO finalize — the caller records the edits and the campaign
   * is finalized once every machine's rewards are in.
   * 'online-runnerup' — one runner-up's two steps only, no announce, no
   * finalize. `runnerUpIds` names them.
   */
  variant?: 'hotseat' | 'online-winner' | 'online-runnerup'
  /** Restrict the runner-up walk to these players (online split). */
  runnerUpIds?: string[]
  /**
   * `baseline` is the campaign state this screen opened with. The caller needs
   * it to tell which fields were actually edited here — this screen is long
   * lived, and anything written elsewhere in the meantime must not be reverted.
   */
  onComplete: (newLegacy: LegacyState, baseline: LegacyState) => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function factionRgb(factionId: string) {
  const hex = FACTION_COLORS[factionId as keyof typeof FACTION_COLORS] ?? 0x888888
  return { r: (hex >> 16) & 0xff, g: (hex >> 8) & 0xff, b: hex & 0xff }
}

function primaryBtn(color: string): React.CSSProperties {
  return {
    width: '100%', padding: '13px', borderRadius: 8, fontSize: 14, fontWeight: 'bold',
    border: `2px solid ${color}`, background: `${color}22`,
    color: '#E8DCC8', cursor: 'pointer', fontFamily: 'Georgia, serif', letterSpacing: 0.5,
  }
}

const detailPanel: React.CSSProperties = {
  padding: '14px', borderRadius: 8, marginTop: 12,
  background: 'rgba(0,0,0,0.20)', border: '1px solid rgba(200,148,10,0.18)',
}

const detailLabel: React.CSSProperties = {
  fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase',
  color: 'rgba(200,148,10,0.55)', marginBottom: 10,
}

const skipBtn: React.CSSProperties = {
  flex: 1, padding: '13px', borderRadius: 8, fontSize: 13, fontWeight: 'bold',
  border: '2px solid rgba(100,80,40,0.45)', background: 'rgba(60,40,10,0.20)',
  color: 'rgba(180,150,100,0.65)', cursor: 'pointer', fontFamily: 'Georgia, serif',
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WinScreen({
  winner, winCondition, gameNumber, players, territories,
  legacyState, legacyEvents, onComplete,
  variant = 'hotseat', runnerUpIds,
}: Props) {
  const [step, setStep]           = useState<WinStep>(
    variant === 'online-runnerup' ? 'runnerup-city' : 'announce')
  const [signedName, setSignedName] = useState(winner.name)
  const [saving, setSaving]       = useState(false)
  const [workingLegacy, setWorkingLegacy] = useState<LegacyState>(legacyState)
  /** What this screen opened with — never updated, so it can serve as the
   *  baseline the caller diffs against on completion. */
  const baselineRef = useRef<LegacyState>(legacyState)

  // Winner city step
  const [winCityTerrId, setWinCityTerrId] = useState<string | null>(null)
  const [winCityName, setWinCityName]     = useState('')

  // Winner continent step
  const [contId, setContId]     = useState<string | null>(null)
  const [contName, setContName] = useState('')

  // Step 4: Cancel a scar
  const [cancelScarIdx, setCancelScarIdx] = useState<number | null>(null)

  // Step 5: Modify continent bonus
  const [modContId, setModContId] = useState<string | null>(null)
  const [modDelta, setModDelta]   = useState<1 | -1>(1)

  // Step 6: Fortify a city
  const [fortifyTerrId, setFortifyTerrId] = useState<string | null>(null)

  // Step 7: Destroy a card
  const [destroyCardId, setDestroyCardId] = useState<string | null>(null)

  // Runner-up tracking. Online the walk is restricted: the winner's machine
  // covers only the AI runner-ups, and each human runner-up's machine covers
  // exactly themselves — `runnerUpIds` carries the split.
  const runnerUps = players.filter(p =>
    p.id !== winner.id &&
    !p.isEliminated &&
    (!runnerUpIds || runnerUpIds.includes(p.id)) &&
    Object.values(territories).some(t => t.occupyingPlayerId === p.id),
  )
  const [ruIdx, setRuIdx]           = useState(0)
  const [ruCityTerrId, setRuCityTerrId] = useState<string | null>(null)
  const [ruCityName, setRuCityName]     = useState('')
  const [ruCardId, setRuCardId]         = useState<string | null>(null)

  const { r, g, b } = factionRgb(winner.factionId)
  const factionColor = `rgb(${r},${g},${b})`
  const factionName  = FACTION_NAMES[winner.factionId] ?? winner.factionId

  const unnamedContinents = ALL_CONTINENTS.filter(c => !(workingLegacy.namedContinents ?? {})[c.id])

  // Step numbers: 1=sign, 2=city, 3=continent(optional), 4=cancel-scar, 5=modify-bonus, 6=fortify, 7=destroy
  const TOTAL_STEPS = 7
  const continentStepNum = 3
  const cancelScarStepNum = 4
  const modifyBonusStepNum = 5
  const fortifyCityStepNum = 6
  const destroyCardStepNum = 7

  function stepLabel(n: number) {
    return `Step ${n} of ${TOTAL_STEPS}`
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function logEntry(entry: string, legacy = workingLegacy): LegacyState {
    return {
      ...legacy,
      historyLog: [...legacy.historyLog, { gameNumber, timestamp: new Date().toISOString(), entry }],
    }
  }

  // ── Step commits ───────────────────────────────────────────────────────────

  function commitSignBoard() {
    const winName = signedName.trim() || winner.name
    const newMissiles = { ...(workingLegacy.missiles ?? {}) }
    newMissiles[winner.id] = (newMissiles[winner.id] ?? 0) + 1
    // Career win record — missiles replenish to this count at every game start
    const newPlayerWins = { ...(workingLegacy.playerWins ?? {}) }
    newPlayerWins[winner.id] = (newPlayerWins[winner.id] ?? 0) + 1
    const newVictoryLog = [
      ...(workingLegacy.victoryLog ?? []),
      // winnerPlayerId is the durable link: the signature is free text and the
      // faction changes between games, so only the roster id identifies who won.
      { gameNumber, winnerName: winName, winnerPlayerId: winner.id, factionId: winner.factionId, winCondition },
    ]
    const entry = `${winName} (${factionName}) won Game #${gameNumber} by ${
      winCondition === 'mission' ? 'completing their mission'
      : winCondition === 'stars' ? 'holding 4 red stars'
      : 'last faction standing'}`
    const updated: LegacyState = {
      ...workingLegacy, missiles: newMissiles, playerWins: newPlayerWins, victoryLog: newVictoryLog,
      historyLog: [...workingLegacy.historyLog, { gameNumber, timestamp: new Date().toISOString(), entry }],
    }
    setWorkingLegacy(updated)
    setStep('winner-city')
  }

  function commitWinnerCity() {
    if (!winCityTerrId) { setStep(unnamedContinents.length > 0 ? 'winner-continent' : cancelScarStep()); return }
    playCity()
    const label = winCityName.trim() || (territories[winCityTerrId]?.name ?? '') + ' City'
    let newStickers = [...workingLegacy.stickers]
    const existIdx = newStickers.findIndex(s => s.targetId === winCityTerrId && s.description.startsWith('city:'))
    if (existIdx >= 0) {
      newStickers = newStickers.map((s, i) => i === existIdx ? { ...s, description: 'city:major', name: label } : s)
    } else {
      newStickers = [...newStickers, {
        id: `city-${Date.now()}`, name: label, description: 'city:major',
        placement: 'territory' as const, targetId: winCityTerrId, appliedInGame: gameNumber,
        placedByPlayerId: winner.id,
      }]
    }
    const updated: LegacyState = logEntry(
      `Major City "${label}" founded at ${territories[winCityTerrId]?.name ?? winCityTerrId}`,
      { ...workingLegacy, stickers: newStickers },
    )
    setWorkingLegacy(updated)
    setStep(unnamedContinents.length > 0 ? 'winner-continent' : cancelScarStep())
  }

  function commitWinnerContinent() {
    if (!contId || !contName.trim()) { setStep(cancelScarStep()); return }
    const newNamedConts = {
      ...(workingLegacy.namedContinents ?? {}),
      [contId]: { customName: contName.trim(), namedByPlayerId: winner.id, namedInGame: gameNumber },
    }
    const updated = logEntry(
      `${signedName.trim() || winner.name} renamed ${ALL_CONTINENTS.find(c => c.id === contId)?.name} to "${contName.trim()}"`,
      { ...workingLegacy, namedContinents: newNamedConts },
    )
    setWorkingLegacy(updated)
    setStep(cancelScarStep())
  }

  // Winner-reward bonus modifiers are campaign-limited: one +1 and one −1 total.
  // (Unlock-based modifiers don't count against the limit.)
  const winnerBonusMods = workingLegacy.continentBonusModifiers.filter(m => m.reason?.startsWith('Winner reward'))
  const plusBonusUsed  = winnerBonusMods.some(m => m.bonusDelta > 0)
  const minusBonusUsed = winnerBonusMods.some(m => m.bonusDelta < 0)

  /** The step after cancelling — skips the bonus step once both mods are spent. */
  const afterCancelStep = () =>
    (plusBonusUsed && minusBonusUsed) ? 'winner-fortify-city' as const : 'winner-modify-bonus' as const

  /**
   * Where to go when the cancel step would come next.
   *
   * Once the campaign has spent all `SCAR_CANCEL_LIMIT` cancellations the step
   * is skipped outright rather than shown greyed out — it is no longer a reward
   * this campaign offers, the same way the bonus step disappears once both
   * modifiers are placed.
   */
  const cancelScarStep = () =>
    canCancelScar(workingLegacy) ? 'winner-cancel-scar' as const : afterCancelStep()

  function commitCancelScar(scarIdx: number | null) {
    const afterCancel = afterCancelStep()
    if (scarIdx === null) { setStep(afterCancel); return }
    // Re-checked here, not just in the UI: the button is the only other guard,
    // and a campaign limit that lives only in a disabled attribute is not one.
    if (!canCancelScar(workingLegacy)) { setStep(afterCancel); return }
    const scar = workingLegacy.scars[scarIdx]
    if (!scar) { setStep(afterCancel); return }
    if (scar.type === 'fortification') { setStep(afterCancel); return }  // never cancellable
    const terrName = TERRITORY_DEFINITIONS.find(d => d.id === scar.territoryId)?.name ?? scar.territoryId
    const cancelled = [...(workingLegacy.cancelledScars ?? []), {
      type: scar.type,
      territoryId: scar.territoryId,
      appliedInGame: scar.appliedInGame,
      cancelledInGame: gameNumber,
      cancelledByPlayerId: winner.id,
    }]
    const left = SCAR_CANCEL_LIMIT - cancelled.length
    const updated = logEntry(
      `${signedName.trim() || winner.name} cancelled a ${scarLabel(scar.type)} on ${terrName}`
      + ` — ${left} of ${SCAR_CANCEL_LIMIT} scar cancellations left in the campaign`,
      { ...workingLegacy, scars: workingLegacy.scars.filter((_, i) => i !== scarIdx), cancelledScars: cancelled },
    )
    setWorkingLegacy(updated)
    setCancelScarIdx(null)
    setStep(afterCancel)
  }

  function commitModifyBonus(contIdVal: string | null, delta: 1 | -1) {
    if (!contIdVal) { setStep('winner-fortify-city'); return }
    // Campaign limit: one +1 and one −1 winner reward total
    if ((delta > 0 && plusBonusUsed) || (delta < 0 && minusBonusUsed)) { setStep('winner-fortify-city'); return }
    // A continent can only ever carry ONE winner-reward modifier — never both
    if (winnerBonusMods.some(m => m.continentId === contIdVal)) { setStep('winner-fortify-city'); return }
    const updated = logEntry(
      `${signedName.trim() || winner.name} modified ${ALL_CONTINENTS.find(c => c.id === contIdVal)?.name} bonus by ${delta > 0 ? '+' : ''}${delta}`,
      {
        ...workingLegacy,
        continentBonusModifiers: [...workingLegacy.continentBonusModifiers, {
          continentId: contIdVal, bonusDelta: delta,
          reason: `Winner reward: ${signedName.trim() || winner.name} Game #${gameNumber}`, appliedInGame: gameNumber,
        }],
      },
    )
    setWorkingLegacy(updated)
    setModContId(null); setModDelta(1)
    setStep('winner-fortify-city')
  }

  function commitFortifyCity(terrId: string | null) {
    if (!terrId) { setStep('winner-destroy-card'); return }
    // The supply is finite and spent ones never return, so guard the write as
    // well as the button — the step is skippable and re-enterable.
    if (fortificationsPlaced(workingLegacy.stickers) >= FORTIFICATION_SUPPLY) {
      setStep('winner-destroy-card'); return
    }
    const updated = logEntry(
      `${signedName.trim() || winner.name} fortified ${territories[terrId]?.name ?? terrId} (10 charges)`,
      {
        ...workingLegacy,
        stickers: [...workingLegacy.stickers, {
          id: `fortify-${Date.now()}`, name: 'Fortification', description: 'fortification:10',
          placement: 'territory' as const, targetId: terrId, appliedInGame: gameNumber,
        }],
      },
    )
    setWorkingLegacy(updated)
    setFortifyTerrId(null)
    setStep('winner-destroy-card')
  }

  async function commitDestroyCard(cardId: string | null) {
    let updated = { ...workingLegacy }
    if (cardId) {
      const card = TERRITORY_CARDS.find(c => c.id === cardId)
      const terrName = card ? TERRITORY_DEFINITIONS.find(d => d.id === card.territoryId)?.name ?? cardId : cardId
      updated = logEntry(
        `${signedName.trim() || winner.name} permanently destroyed the territory card for ${terrName}`,
        { ...workingLegacy, removedCardIds: [...workingLegacy.removedCardIds, cardId] },
      )
    }
    setWorkingLegacy(updated)
    setDestroyCardId(null)
    if (runnerUps.length > 0) {
      setRuIdx(0); setRuCityTerrId(null); setRuCityName(''); setRuCardId(null)
      setStep('runnerup-city')
    } else {
      await conclude(updated)
    }
  }

  function commitRunnerUpCity() {
    const player = runnerUps[ruIdx]
    if (!player) return
    let updated = { ...workingLegacy }
    if (ruCityTerrId) {
      playCity()
      const label = ruCityName.trim() || (territories[ruCityTerrId]?.name ?? '') + ' City'
      const minorFull = updated.stickers.filter(s => s.description === 'city:minor').length >= 9
      if (!minorFull) {
        const existIdx = updated.stickers.findIndex(s => s.targetId === ruCityTerrId && s.description.startsWith('city:'))
        if (existIdx < 0) {
          updated = logEntry(
            `Minor City "${label}" founded at ${territories[ruCityTerrId]?.name ?? ruCityTerrId} by ${player.name}`,
            {
              ...updated,
              stickers: [...updated.stickers, {
                id: `city-${Date.now()}-${player.id}`, name: label, description: 'city:minor',
                placement: 'territory' as const, targetId: ruCityTerrId, appliedInGame: gameNumber,
                placedByPlayerId: player.id,
              }],
            },
          )
        }
      }
    }
    setWorkingLegacy(updated)
    setRuCardId(null)
    setStep('runnerup-upgrade')
  }

  async function commitRunnerUpUpgrade() {
    let updated = { ...workingLegacy }
    if (ruCardId) {
      const prev = (updated.cardResources ?? {})[ruCardId] ?? 1
      const card = TERRITORY_CARDS.find(c => c.id === ruCardId)
      const terrName = card ? TERRITORY_DEFINITIONS.find(d => d.id === card.territoryId)?.name ?? ruCardId : ruCardId
      updated = logEntry(
        `${runnerUps[ruIdx]?.name} added +1 coin to ${terrName} card (now ${Math.min(6, prev + 1)} coins)`,
        { ...updated, cardResources: { ...(updated.cardResources ?? {}), [ruCardId]: Math.min(6, prev + 1) } },
      )
    }
    setWorkingLegacy(updated)
    const nextIdx = ruIdx + 1
    if (nextIdx < runnerUps.length) {
      setRuIdx(nextIdx)
      setRuCityTerrId(null); setRuCityName(''); setRuCardId(null)
      setStep('runnerup-city')
    } else {
      await conclude(updated)
    }
  }

  /**
   * The last step is done — what happens next depends on the variant.
   * Hotseat finalizes the campaign right here, as it always has. The online
   * slices hand their edits back instead: finalization (game-number bump,
   * session save, scar returns) happens ONCE, after every machine's rewards
   * are recorded — not after each slice.
   */
  async function conclude(legacy: LegacyState) {
    if (variant === 'hotseat') { await finalize(legacy); return }
    onComplete(legacy, baselineRef.current)
  }

  async function finalize(legacy: LegacyState) {
    // Return unused scar cards for this game back to the pool.
    // Dedupe by unique ID — every scar-card id is unique, so a card can never
    // legitimately appear twice in the deck.
    const unusedCardIds = (legacy.dealtScars ?? [])
      .filter(d => d.gameNumber === gameNumber && !d.placed)
      .map(d => d.cardId)
    const scarDeckWithReturned = [...new Set([...(legacy.scarDeck ?? []), ...unusedCardIds])]
    const cleaned: LegacyState = {
      ...legacy,
      purchasedStars: {},
      currentGameNumber: legacy.currentGameNumber + 1,
      scarDeck: scarDeckWithReturned,
      // Drop the unplaced deal records — their cards are back in the deck, so a
      // stale entry must never resurface in a future game's hand.
      dealtScars: (legacy.dealtScars ?? []).filter(d => !(d.gameNumber === gameNumber && !d.placed)),
    }
    setSaving(true)
    const winName = signedName.trim() || winner.name
    await Promise.all([
      saveLegacyState(cleaned),
      saveGameSession(cleaned.campaignId, gameNumber, winName, winner.factionId, legacyEvents),
    ]).catch(() => {})
    setSaving(false)
    // The caller merges this against the baseline before saving again, so its
    // write is the one that lands last — the save above is only a safety net if
    // the app dies between here and there.
    onComplete(cleaned, baselineRef.current)
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: `radial-gradient(ellipse at center, rgba(${r},${g},${b},0.18) 0%, rgba(5,2,0,0.97) 70%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Georgia, serif',
    }}>
      {step === 'announce' && (
        <AnnounceStep
          winner={winner} winCondition={winCondition} gameNumber={gameNumber}
          factionColor={factionColor} factionName={factionName} rgb={{ r, g, b }}
          onNext={() => setStep('sign-board')}
        />
      )}

      {step === 'sign-board' && (
        <SignBoardStep
          factionColor={factionColor} factionName={factionName} gameNumber={gameNumber}
          signedName={signedName} onChangeName={setSignedName}
          winnerMissiles={(workingLegacy.missiles ?? {})[winner.id] ?? 0}
          stepLabel={stepLabel(1)}
          onNext={commitSignBoard}
        />
      )}

      {step === 'winner-city' && (
        <WinnerCityStep
          winner={winner} factionColor={factionColor}
          territories={territories} legacyState={workingLegacy}
          cityTerrId={winCityTerrId} cityName={winCityName}
          onSelectTerr={id => { setWinCityTerrId(id); setWinCityName((territories[id]?.name ?? '') + ' City') }}
          onChangeName={setWinCityName}
          stepLabel={stepLabel(2)}
          onNext={commitWinnerCity}
          onSkip={() => setStep(unnamedContinents.length > 0 ? 'winner-continent' : cancelScarStep())}
        />
      )}

      {step === 'winner-continent' && unnamedContinents.length > 0 && (
        <WinnerContinentStep
          factionColor={factionColor} legacyState={workingLegacy}
          contId={contId} contName={contName}
          setContId={id => { setContId(id); if (id && !contName) setContName(ALL_CONTINENTS.find(c => c.id === id)?.name ?? '') }}
          setContName={setContName}
          stepLabel={stepLabel(continentStepNum)}
          onNext={commitWinnerContinent}
          onSkip={() => setStep(cancelScarStep())}
        />
      )}

      {step === 'winner-cancel-scar' && (
        <CancelScarStep
          factionColor={factionColor} legacyState={workingLegacy}
          cancelScarIdx={cancelScarIdx} setCancelScarIdx={setCancelScarIdx}
          stepLabel={stepLabel(cancelScarStepNum)}
          onConfirm={() => commitCancelScar(cancelScarIdx)}
          onSkip={() => commitCancelScar(null)}
        />
      )}

      {step === 'winner-modify-bonus' && (
        <ModifyBonusStep
          plusUsed={plusBonusUsed}
          minusUsed={minusBonusUsed}
          factionColor={factionColor} legacyState={workingLegacy}
          modContId={modContId} modDelta={modDelta}
          setModContId={setModContId} setModDelta={setModDelta}
          stepLabel={stepLabel(modifyBonusStepNum)}
          onConfirm={() => commitModifyBonus(modContId, modDelta)}
          onSkip={() => commitModifyBonus(null, 1)}
        />
      )}

      {step === 'winner-fortify-city' && (
        <FortifyCityStep
          factionColor={factionColor} legacyState={workingLegacy} territories={territories}
          fortifyTerrId={fortifyTerrId} setFortifyTerrId={setFortifyTerrId}
          stepLabel={stepLabel(fortifyCityStepNum)}
          onConfirm={() => commitFortifyCity(fortifyTerrId)}
          onSkip={() => commitFortifyCity(null)}
        />
      )}

      {step === 'winner-destroy-card' && (
        <DestroyCardStep
          factionColor={factionColor} legacyState={workingLegacy}
          destroyCardId={destroyCardId} setDestroyCardId={setDestroyCardId}
          saving={saving}
          stepLabel={stepLabel(destroyCardStepNum)}
          onConfirm={() => commitDestroyCard(destroyCardId)}
          onSkip={() => commitDestroyCard(null)}
        />
      )}

      {step === 'runnerup-city' && runnerUps[ruIdx] && (
        <RunnerUpCityStep
          player={runnerUps[ruIdx]} ruIdx={ruIdx} total={runnerUps.length}
          territories={territories} legacyState={workingLegacy}
          cityTerrId={ruCityTerrId} cityName={ruCityName}
          onSelectTerr={id => { setRuCityTerrId(id); setRuCityName((territories[id]?.name ?? '') + ' City') }}
          onChangeName={setRuCityName}
          onNext={commitRunnerUpCity}
        />
      )}

      {step === 'runnerup-upgrade' && runnerUps[ruIdx] && (
        <RunnerUpUpgradeStep
          player={runnerUps[ruIdx]} ruIdx={ruIdx} total={runnerUps.length}
          legacyState={workingLegacy}
          cardId={ruCardId} setCardId={setRuCardId}
          saving={saving}
          onNext={commitRunnerUpUpgrade}
        />
      )}
    </div>
  )
}

// ─── Announce ─────────────────────────────────────────────────────────────────

function AnnounceStep({ winner, winCondition, gameNumber, factionColor, factionName, rgb, onNext }: {
  winner: Player; winCondition: 'mission' | 'elimination' | 'stars'; gameNumber: number
  factionColor: string; factionName: string; rgb: { r: number; g: number; b: number }
  onNext: () => void
}) {
  const conditionText = winCondition === 'mission' ? '🎯 Mission Accomplished'
    : winCondition === 'stars' ? '★ Four Red Stars'
    : '⚔ Last Faction Standing'
  return (
    <div style={{ textAlign: 'center', padding: '0 20px', maxWidth: 560 }}>
      <ConfettiBurst count={130} originY={30} duration={3400} />
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 0.8, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        style={{ fontSize: 13, color: factionColor, letterSpacing: 4, textTransform: 'uppercase', marginBottom: 18 }}
      >
        ✦ Game {gameNumber} of 15 ✦
      </motion.div>
      <motion.div
        initial={{ scale: 0, rotate: -25 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 13, delay: 0.3 }}
        style={{ fontSize: 72, marginBottom: 8, filter: `drop-shadow(0 0 20px ${factionColor})` }}
      >
        🏆
      </motion.div>
      <motion.div
        initial={{ opacity: 0, letterSpacing: '18px' }}
        animate={{ opacity: 1, letterSpacing: '10px' }}
        transition={{ delay: 0.55, duration: 0.7, ease: 'easeOut' }}
        className="victory-shimmer"
        style={{ fontSize: 26, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 12 }}
      >
        Victory
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 26, scale: 0.85 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 240, damping: 18, delay: 0.75 }}
        style={{ fontSize: 40, fontWeight: 'bold', color: factionColor, marginBottom: 4, lineHeight: 1.1, textShadow: `0 0 30px rgba(${rgb.r},${rgb.g},${rgb.b},0.55)` }}
      >
        {winner.name}
      </motion.div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.0, duration: 0.4 }}
        style={{ fontSize: 14, color: `rgba(${rgb.r},${rgb.g},${rgb.b},0.75)`, marginBottom: 28 }}
      >
        {factionName}
      </motion.div>
      <motion.div
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 1.15 }}
        style={{ display: 'inline-block', fontSize: 14, padding: '8px 22px', borderRadius: 20, border: `1px solid rgba(${rgb.r},${rgb.g},${rgb.b},0.45)`, background: `rgba(${rgb.r},${rgb.g},${rgb.b},0.10)`, color: '#E8DCC8', marginBottom: 48 }}
      >
        {conditionText}
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.45, duration: 0.4 }}
      >
        <button onClick={onNext} style={primaryBtn(factionColor)}>Record Legacy Consequences →</button>
      </motion.div>
    </div>
  )
}

// ─── Sign Board ───────────────────────────────────────────────────────────────

function SignBoardStep({ factionColor, factionName, gameNumber, signedName, onChangeName, winnerMissiles, stepLabel, onNext }: {
  factionColor: string; factionName: string; gameNumber: number
  signedName: string; onChangeName: (n: string) => void
  winnerMissiles: number; stepLabel: string; onNext: () => void
}) {
  return (
    <Card title="✍ SIGN THE BOARD" subtitle={stepLabel}>
      <div style={{ marginBottom: 14, textAlign: 'center', fontSize: 11, color: '#6a5030' }}>Game #{gameNumber} · {factionName} — your name is permanently recorded</div>
      <input
        autoFocus value={signedName} onChange={e => onChangeName(e.target.value)} maxLength={40}
        style={{ width: '100%', padding: '13px 16px', borderRadius: 7, border: `2px solid ${factionColor}60`, background: 'rgba(0,0,0,0.45)', color: '#E8DCC8', fontSize: 22, fontFamily: 'Georgia, serif', textAlign: 'center', boxSizing: 'border-box', marginBottom: 14 }}
      />
      <div style={{ padding: '10px 16px', borderRadius: 7, marginBottom: 18, background: 'rgba(200,148,10,0.05)', border: '1px solid rgba(200,148,10,0.18)', fontSize: 12, color: '#C8940A', textAlign: 'center' }}>
        🚀 Missile Token awarded — you now have {winnerMissiles + 1} missile{winnerMissiles + 1 !== 1 ? 's' : ''}
        <div style={{ fontSize: 10, color: '#6a5030', marginTop: 3 }}>Spend in combat to set any one die to 6</div>
      </div>
      <button onClick={onNext} disabled={!signedName.trim()} style={signedName.trim() ? primaryBtn(factionColor) : { ...primaryBtn('#555'), cursor: 'not-allowed', opacity: 0.4 }}>Sign &amp; Continue →</button>
    </Card>
  )
}

// ─── Winner City ──────────────────────────────────────────────────────────────

function WinnerCityStep({ winner, factionColor, territories, legacyState, cityTerrId, cityName, onSelectTerr, onChangeName, stepLabel, onNext, onSkip }: {
  winner: Player; factionColor: string
  territories: Record<string, Territory>; legacyState: LegacyState
  cityTerrId: string | null; cityName: string
  onSelectTerr: (id: string) => void; onChangeName: (n: string) => void
  stepLabel: string; onNext: () => void; onSkip: () => void
}) {
  const majorFull = legacyState.stickers.filter(s => s.description === 'city:major').length >= 5
  return (
    <LargeCard title="🏙 FOUND A MAJOR CITY" subtitle={stepLabel}>
      <div style={{ fontSize: 11, color: '#7a6040', marginBottom: 14, textAlign: 'center' }}>
        {majorFull
          ? 'Major city limit reached (5/5) — skip or continue.'
          : 'Click any territory on the board to place a 2-population Major City.'}
      </div>
      {!majorFull && (
        <>
          <CityMapPicker
            playerId={winner.id} territories={territories} legacyState={legacyState}
            cityType="major" factionId={winner.factionId}
            selectedId={cityTerrId} onSelect={onSelectTerr}
          />
          {cityTerrId && (
            <div style={{ marginTop: 10 }}>
              <div style={detailLabel}>City name</div>
              <input value={cityName} onChange={e => onChangeName(e.target.value)} maxLength={32}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 6, border: `1.5px solid ${factionColor}50`, background: 'rgba(0,0,0,0.40)', color: '#E8DCC8', fontSize: 15, fontFamily: 'Georgia, serif', boxSizing: 'border-box' }} />
            </div>
          )}
        </>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={onSkip} style={skipBtn}>Skip →</button>
        <button
          onClick={onNext}
          disabled={!majorFull && !cityTerrId}
          style={{ ...((majorFull || cityTerrId) ? primaryBtn(factionColor) : { ...primaryBtn('#555'), cursor: 'not-allowed', opacity: 0.4 }), flex: 2 }}
        >
          {majorFull ? 'Continue →' : cityTerrId ? `Found "${cityName || 'City'}" →` : 'Select a territory →'}
        </button>
      </div>
    </LargeCard>
  )
}

// ─── Winner Continent ─────────────────────────────────────────────────────────

function WinnerContinentStep({ factionColor, legacyState, contId, contName, setContId, setContName, stepLabel, onNext, onSkip }: {
  factionColor: string; legacyState: LegacyState
  contId: string | null; contName: string
  setContId: (id: string) => void; setContName: (n: string) => void
  stepLabel: string; onNext: () => void; onSkip: () => void
}) {
  const unnamed = ALL_CONTINENTS.filter(c => !(legacyState.namedContinents ?? {})[c.id])
  return (
    <Card title="🌍 NAME A CONTINENT" subtitle={stepLabel}>
      <div style={{ fontSize: 11, color: '#7a6040', marginBottom: 14, textAlign: 'center' }}>
        {unnamed.length} continent{unnamed.length !== 1 ? 's' : ''} remain unnamed — choose one to name permanently.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {unnamed.map(c => {
          const bonus = CONTINENT_BONUSES[c.id as keyof typeof CONTINENT_BONUSES] ?? 0
          const color = CONTINENT_COLOR[c.id] ?? '#888'
          const sel = contId === c.id
          return (
            <button key={c.id} onClick={() => setContId(c.id)}
              style={{ padding: '8px 14px', borderRadius: 7, border: `2px solid ${sel ? color : color + '40'}`, background: sel ? color + '22' : 'rgba(0,0,0,0.25)', color: sel ? '#E8DCC8' : '#9a8060', cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: 12 }}>
              {c.name} <span style={{ fontSize: 10, color: sel ? color : '#5a4020' }}>+{bonus}</span>
            </button>
          )
        })}
      </div>
      {contId && (
        <input value={contName} onChange={e => setContName(e.target.value)} maxLength={32}
          placeholder="New name for this continent…"
          style={{ width: '100%', padding: '10px 14px', borderRadius: 6, border: `1.5px solid ${factionColor}50`, background: 'rgba(0,0,0,0.40)', color: '#E8DCC8', fontSize: 15, fontFamily: 'Georgia, serif', boxSizing: 'border-box', marginBottom: 14 }} />
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onSkip} style={skipBtn}>Skip →</button>
        <button onClick={onNext} disabled={!contId || !contName.trim()}
          style={contId && contName.trim() ? { ...primaryBtn(factionColor), flex: 2 } : { ...primaryBtn('#555'), flex: 2, cursor: 'not-allowed', opacity: 0.4 }}>
          Confirm Name →
        </button>
      </div>
    </Card>
  )
}

// ─── Step 4: Cancel a Scar ────────────────────────────────────────────────────

function CancelScarStep({ factionColor, legacyState, cancelScarIdx, setCancelScarIdx, stepLabel, onConfirm, onSkip }: {
  factionColor: string; legacyState: LegacyState
  cancelScarIdx: number | null; setCancelScarIdx: (i: number | null) => void
  stepLabel: string; onConfirm: () => void; onSkip: () => void
}) {
  // Fortifications cannot be cancelled — they deplete through use instead
  const removableScars = legacyState.scars
    .map((scar, i) => ({ scar, i }))
    .filter(({ scar }) => scar.type !== 'fortification')
  const hasScars = removableScars.length > 0
  // The campaign gets SCAR_CANCEL_LIMIT of these in total. Spending one here is
  // spending it for every future winner, so say how many are left before they
  // choose — the step vanishes entirely once they run out.
  const left = scarCancelsLeft(legacyState)
  return (
    <Card title="✂ CANCEL A SCAR" subtitle={stepLabel}>
      <div style={{ fontSize: 11, color: '#7a6040', marginBottom: 8, textAlign: 'center' }}>
        {hasScars
          ? 'Permanently remove any scar from the board, or skip. Fortifications cannot be cancelled.'
          : 'No removable scars are on the board — skip to continue.'}
      </div>
      <div style={{
        fontSize: 10, marginBottom: 14, textAlign: 'center',
        color: left === 1 ? '#d08040' : '#6a5030', letterSpacing: 0.3,
      }}>
        {left} of {SCAR_CANCEL_LIMIT} campaign scar cancellations remaining
        {left === 1 ? ' — this is the last one' : ''}
      </div>
      {hasScars && (
        <div style={detailPanel}>
          <div style={detailLabel}>Select a scar to remove</div>
          {removableScars.map(({ scar, i }) => {
            const terrName = TERRITORY_DEFINITIONS.find(d => d.id === scar.territoryId)?.name ?? scar.territoryId
            const sel = cancelScarIdx === i
            return (
              <button key={i} onClick={() => setCancelScarIdx(sel ? null : i)}
                style={{ display: 'block', width: '100%', marginBottom: 6, padding: '8px 14px', borderRadius: 7, border: `1.5px solid ${sel ? '#E74C3C' : 'rgba(231,76,60,0.30)'}`, background: sel ? 'rgba(231,76,60,0.15)' : 'rgba(0,0,0,0.25)', color: sel ? '#E8DCC8' : '#9a7060', cursor: 'pointer', fontFamily: 'Georgia, serif', textAlign: 'left', fontSize: 12 }}>
                ☣ {scarLabel(scar.type)} on {terrName} <span style={{ fontSize: 9, color: '#6a4030' }}>(Game #{scar.appliedInGame})</span>
              </button>
            )
          })}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button onClick={onSkip} style={skipBtn}>Skip →</button>
        <button
          onClick={onConfirm}
          disabled={hasScars && cancelScarIdx === null}
          style={{ ...((cancelScarIdx !== null || !hasScars) ? primaryBtn(factionColor) : { ...primaryBtn('#555'), cursor: 'not-allowed', opacity: 0.4 }), flex: 2 }}
        >
          {!hasScars ? 'No Scars — Continue →' : cancelScarIdx !== null ? 'Remove Scar →' : 'Select a scar above'}
        </button>
      </div>
    </Card>
  )
}

// ─── Step 5: Modify Continent Bonus ──────────────────────────────────────────

function ModifyBonusStep({ factionColor, legacyState, modContId, modDelta, setModContId, setModDelta, plusUsed, minusUsed, stepLabel, onConfirm, onSkip }: {
  factionColor: string; legacyState: LegacyState
  modContId: string | null; modDelta: 1 | -1
  setModContId: (id: string | null) => void; setModDelta: (d: 1 | -1) => void
  plusUsed: boolean; minusUsed: boolean
  stepLabel: string; onConfirm: () => void; onSkip: () => void
}) {
  // Only the unused modifier can be applied — auto-select it when picking a continent
  function pickContinent(id: string | null) {
    setModContId(id)
    if (plusUsed && !minusUsed) setModDelta(-1)
    if (minusUsed && !plusUsed) setModDelta(1)
  }
  // A continent may only ever carry one winner-reward modifier — block placing
  // the second (+1 or −1) on a continent that already has one
  const modifiedContinentIds = new Set(
    legacyState.continentBonusModifiers
      .filter(m => m.reason?.startsWith('Winner reward'))
      .map(m => m.continentId),
  )
  return (
    <Card title="± MODIFY CONTINENT BONUS" subtitle={stepLabel}>
      <div style={{ fontSize: 11, color: '#7a6040', marginBottom: 14, textAlign: 'center' }}>
        The campaign has one <strong style={{ color: '#2ecc71' }}>+1</strong> and one{' '}
        <strong style={{ color: '#e74c3c' }}>−1</strong> modifier total — and a continent
        can only ever receive <strong>one</strong> of them.
        {plusUsed && !minusUsed && ' The +1 has already been placed — only −1 remains.'}
        {minusUsed && !plusUsed && ' The −1 has already been placed — only +1 remains.'}
        {!plusUsed && !minusUsed && ' Apply one to any continent, or skip.'}
      </div>
      <div style={detailPanel}>
        <div style={detailLabel}>Select a continent</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {ALL_CONTINENTS.map(c => {
            const base = CONTINENT_BONUSES[c.id as keyof typeof CONTINENT_BONUSES] ?? 0
            const existing = legacyState.continentBonusModifiers.filter(m => m.continentId === c.id).reduce((s, m) => s + m.bonusDelta, 0)
            const color = CONTINENT_COLOR[c.id] ?? '#888'
            const sel = modContId === c.id
            const alreadyModified = modifiedContinentIds.has(c.id)
            return (
              <button key={c.id} onClick={() => !alreadyModified && pickContinent(sel ? null : c.id)} disabled={alreadyModified}
                style={{ padding: '7px 12px', borderRadius: 7, border: `2px solid ${alreadyModified ? 'rgba(100,100,100,0.25)' : sel ? color : color + '40'}`, background: sel ? color + '22' : 'rgba(0,0,0,0.25)', color: alreadyModified ? '#4a4a3a' : sel ? '#E8DCC8' : '#9a8060', cursor: alreadyModified ? 'not-allowed' : 'pointer', fontFamily: 'Georgia, serif', fontSize: 11, opacity: alreadyModified ? 0.5 : 1 }}>
                {c.name} <span style={{ fontSize: 9 }}>+{base + existing}{alreadyModified ? ' · modified' : sel ? ` → +${base + existing + modDelta}` : ''}</span>
              </button>
            )
          })}
        </div>
        {modContId && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              disabled={plusUsed}
              onClick={() => !plusUsed && setModDelta(1)}
              style={{ flex: 1, padding: '8px', borderRadius: 7, border: `2px solid ${plusUsed ? 'rgba(100,100,100,0.25)' : modDelta === 1 ? '#2ecc71' : 'rgba(46,204,113,0.3)'}`, background: modDelta === 1 && !plusUsed ? 'rgba(46,204,113,0.15)' : 'rgba(0,0,0,0.25)', color: plusUsed ? '#4a4a3a' : modDelta === 1 ? '#2ecc71' : '#5a8060', cursor: plusUsed ? 'not-allowed' : 'pointer', fontFamily: 'Georgia, serif', opacity: plusUsed ? 0.5 : 1 }}>
              +1{plusUsed ? ' (used)' : ''}
            </button>
            <button
              disabled={minusUsed}
              onClick={() => !minusUsed && setModDelta(-1)}
              style={{ flex: 1, padding: '8px', borderRadius: 7, border: `2px solid ${minusUsed ? 'rgba(100,100,100,0.25)' : modDelta === -1 ? '#e74c3c' : 'rgba(231,76,60,0.3)'}`, background: modDelta === -1 && !minusUsed ? 'rgba(231,76,60,0.15)' : 'rgba(0,0,0,0.25)', color: minusUsed ? '#4a4a3a' : modDelta === -1 ? '#e74c3c' : '#8a4040', cursor: minusUsed ? 'not-allowed' : 'pointer', fontFamily: 'Georgia, serif', opacity: minusUsed ? 0.5 : 1 }}>
              −1{minusUsed ? ' (used)' : ''}
            </button>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button onClick={onSkip} style={skipBtn}>Skip →</button>
        <button
          onClick={onConfirm}
          disabled={!modContId}
          style={{ ...(modContId ? primaryBtn(factionColor) : { ...primaryBtn('#555'), cursor: 'not-allowed', opacity: 0.4 }), flex: 2 }}
        >
          {modContId ? 'Confirm Change →' : 'Select a continent above'}
        </button>
      </div>
    </Card>
  )
}

// ─── Step 6: Fortify a City ───────────────────────────────────────────────────

function FortifyCityStep({ factionColor, legacyState, territories, fortifyTerrId, setFortifyTerrId, stepLabel, onConfirm, onSkip }: {
  factionColor: string; legacyState: LegacyState; territories: Record<string, Territory>
  fortifyTerrId: string | null; setFortifyTerrId: (id: string | null) => void
  stepLabel: string; onConfirm: () => void; onSkip: () => void
}) {
  // One entry per living city sticker — labeled by CITY name, not territory name.
  // The World Capital is also fortifiable even though it isn't a normal city sticker.
  const destroyedCityIds = new Set((legacyState.destroyedCities ?? []).map(d => d.cityId))
  const targets: Array<{ key: string; name: string; territoryId: string }> = legacyState.stickers
    .filter(s => s.description.startsWith('city:') && !destroyedCityIds.has(s.id))
    .filter(s => !!territories[s.targetId])
    .map(s => ({ key: s.id, name: s.name, territoryId: s.targetId }))
  const wcId = legacyState.worldCapitalTerritoryId
  if (wcId && territories[wcId] && !targets.some(t => t.territoryId === wcId)) {
    targets.push({ key: `wc-${wcId}`, name: '⌃ World Capital', territoryId: wcId })
  }
  // Five in the campaign box, and a worn-out one is never recycled — spent
  // stickers stay on the board at 0 charges and still count against the supply.
  const used = fortificationsPlaced(legacyState.stickers)
  const supplyLeft = Math.max(0, FORTIFICATION_SUPPLY - used)
  const hasCities = targets.length > 0 && supplyLeft > 0
  return (
    <Card title="🏰 FORTIFY A CITY" subtitle={stepLabel}>
      <div style={{ fontSize: 11, color: '#7a6040', marginBottom: 14, textAlign: 'center' }}>
        {supplyLeft === 0
          ? `All ${FORTIFICATION_SUPPLY} fortifications have been used this campaign — there are no more. Skip to continue.`
          : targets.length === 0
          ? 'No cities on the board yet — skip to continue.'
          : `Add a Fortification (+1 to defender's highest and lowest die, 10 uses) to any city or the World Capital, or skip. ${supplyLeft} of ${FORTIFICATION_SUPPLY} left.`}
      </div>
      {hasCities && (
        <div style={detailPanel}>
          <div style={detailLabel}>Select a city to fortify</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {targets.map(({ key, name, territoryId }) => {
              const t = territories[territoryId]!
              const sel = fortifyTerrId === t.id
              const alreadyFortified = legacyState.stickers.some(s => s.targetId === t.id && s.description.startsWith('fortification:'))
              return (
                <button key={key} onClick={() => !alreadyFortified && setFortifyTerrId(sel ? null : t.id)} disabled={alreadyFortified}
                  style={{ padding: '7px 12px', borderRadius: 7, border: `1.5px solid ${sel ? '#C8940A' : alreadyFortified ? 'rgba(100,80,40,0.2)' : 'rgba(200,148,10,0.30)'}`, background: sel ? 'rgba(200,148,10,0.18)' : 'rgba(0,0,0,0.25)', color: alreadyFortified ? '#3a2a10' : sel ? '#E8DCC8' : '#9a8060', cursor: alreadyFortified ? 'not-allowed' : 'pointer', fontFamily: 'Georgia, serif', fontSize: 12 }}>
                  🏰 {name}{alreadyFortified ? ' ✓' : ''}
                  <span style={{ fontSize: 9, color: alreadyFortified ? '#2a1a08' : '#6a5030', marginLeft: 5 }}>({t.name})</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button onClick={onSkip} style={skipBtn}>Skip →</button>
        <button
          onClick={onConfirm}
          disabled={hasCities && !fortifyTerrId}
          style={{ ...((fortifyTerrId || !hasCities) ? primaryBtn(factionColor) : { ...primaryBtn('#555'), cursor: 'not-allowed', opacity: 0.4 }), flex: 2 }}
        >
          {supplyLeft === 0 ? 'None Left — Continue →'
            : !hasCities ? 'No Cities — Continue →'
            : fortifyTerrId ? `Fortify ${territories[fortifyTerrId]?.name ?? ''} →`
            : 'Select a city above'}
        </button>
      </div>
    </Card>
  )
}

// ─── Step 7: Destroy a Card ───────────────────────────────────────────────────

function DestroyCardStep({ factionColor, legacyState, destroyCardId, setDestroyCardId, saving, stepLabel, onConfirm, onSkip }: {
  factionColor: string; legacyState: LegacyState
  destroyCardId: string | null; setDestroyCardId: (id: string | null) => void
  saving: boolean; stepLabel: string; onConfirm: () => void; onSkip: () => void
}) {
  const availCards = TERRITORY_CARDS.filter(c => !legacyState.removedCardIds.includes(c.id))
  const selectedCard = destroyCardId ? TERRITORY_CARDS.find(c => c.id === destroyCardId) : null
  const selectedDef  = selectedCard ? TERRITORY_DEFINITIONS.find(d => d.id === selectedCard.territoryId) : null
  return (
    <Card title="🔥 DESTROY A CARD" subtitle={stepLabel}>
      <div style={{ fontSize: 11, color: '#7a6040', marginBottom: 14, textAlign: 'center' }}>
        Permanently remove any territory card from play, or skip.
      </div>
      {selectedCard && (
        <div style={{ padding: '8px 12px', borderRadius: 7, marginBottom: 10, background: 'rgba(231,76,60,0.10)', border: '1.5px solid rgba(231,76,60,0.45)', fontSize: 12, color: '#E8DCC8', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🔥</span>
          <span>{selectedDef?.name ?? destroyCardId} — will be permanently removed</span>
        </div>
      )}
      <div style={{ maxHeight: 200, overflowY: 'auto', ...detailPanel }}>
        <div style={detailLabel}>Select a card to destroy</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
          {availCards.map(c => {
            const terrDef = TERRITORY_DEFINITIONS.find(d => d.id === c.territoryId)
            const sel = destroyCardId === c.id
            const coins = legacyState.cardResources?.[c.id] ?? 0
            return (
              <button key={c.id} onClick={() => setDestroyCardId(sel ? null : c.id)}
                style={{ padding: '6px 8px', borderRadius: 6, border: `1.5px solid ${sel ? '#E74C3C' : 'rgba(231,76,60,0.25)'}`, background: sel ? 'rgba(231,76,60,0.15)' : 'rgba(0,0,0,0.25)', color: sel ? '#E8DCC8' : '#9a7060', cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: 10, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span>{terrDef?.name ?? c.id}</span>
                {coins > 0 && (
                  <span style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    {Array.from({ length: coins }, (_, i) => (
                      <span key={i} style={{ fontSize: 9 }}>🪙</span>
                    ))}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button onClick={onSkip} style={skipBtn} disabled={saving}>Skip →</button>
        <button
          onClick={onConfirm}
          disabled={saving || !destroyCardId}
          style={{ ...(destroyCardId && !saving ? primaryBtn(factionColor) : { ...primaryBtn('#555'), cursor: 'not-allowed', opacity: 0.4 }), flex: 2 }}
        >
          {saving ? 'Saving…' : destroyCardId ? `Destroy ${selectedDef?.name ?? ''} →` : 'Select a card above'}
        </button>
      </div>
    </Card>
  )
}

// ─── Runner-up City ───────────────────────────────────────────────────────────

function RunnerUpCityStep({ player, ruIdx, total, territories, legacyState, cityTerrId, cityName, onSelectTerr, onChangeName, onNext }: {
  player: Player; ruIdx: number; total: number
  territories: Record<string, Territory>; legacyState: LegacyState
  cityTerrId: string | null; cityName: string
  onSelectTerr: (id: string) => void; onChangeName: (n: string) => void
  onNext: () => void
}) {
  const { r, g, b } = factionRgb(player.factionId)
  const pColor = `rgb(${r},${g},${b})`
  const minorFull = legacyState.stickers.filter(s => s.description === 'city:minor').length >= 9
  const hasEligible = TERRITORY_DEFINITIONS.some(
    def => !legacyState.stickers.some(s => s.targetId === def.id && s.description.startsWith('city:'))
  )
  const canPlace = !minorFull && hasEligible
  return (
    <LargeCard title={`🏘 ${player.name.toUpperCase()} — PLACE A CITY`} subtitle={`Runner-up ${ruIdx + 1} of ${total} · Step 1 of 2`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, padding: '8px 12px', borderRadius: 7, background: `rgba(${r},${g},${b},0.08)`, border: `1px solid rgba(${r},${g},${b},0.35)` }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: pColor, flexShrink: 0 }} />
        <div style={{ fontSize: 13, color: '#E8DCC8', fontWeight: 'bold' }}>{player.name}</div>
        <div style={{ fontSize: 10, color: `rgba(${r},${g},${b},0.7)`, marginLeft: 'auto' }}>{FACTION_NAMES[player.factionId] ?? player.factionId}</div>
      </div>
      <div style={{ fontSize: 11, color: '#7a6040', marginBottom: 14, textAlign: 'center' }}>
        {minorFull ? 'Minor city limit reached (9/9) — skip to continue.' : !hasEligible ? 'No eligible territories (all territories already have cities).' : 'Click any territory on the board to place a Minor City there.'}
      </div>
      {canPlace && (
        <>
          <CityMapPicker
            playerId={player.id} territories={territories} legacyState={legacyState}
            cityType="minor" factionId={player.factionId}
            selectedId={cityTerrId} onSelect={onSelectTerr}
          />
          {cityTerrId && (
            <div style={{ marginTop: 10 }}>
              <div style={detailLabel}>City name</div>
              <input value={cityName} onChange={e => onChangeName(e.target.value)} maxLength={32}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 6, border: `1.5px solid ${pColor}50`, background: 'rgba(0,0,0,0.40)', color: '#E8DCC8', fontSize: 14, fontFamily: 'Georgia, serif', boxSizing: 'border-box' }} />
            </div>
          )}
        </>
      )}
      <button
        onClick={onNext}
        disabled={canPlace && !cityTerrId}
        style={(canPlace && !cityTerrId) ? { ...primaryBtn('#555'), marginTop: 14, cursor: 'not-allowed', opacity: 0.4 } : { ...primaryBtn(pColor), marginTop: 14 }}
      >
        {!canPlace ? 'Skip →' : cityTerrId ? `Found "${cityName || 'City'}" →` : 'Select a territory →'}
      </button>
    </LargeCard>
  )
}

// ─── Runner-up Upgrade ────────────────────────────────────────────────────────

function RunnerUpUpgradeStep({ player, ruIdx, total, legacyState, cardId, setCardId, saving, onNext }: {
  player: Player; ruIdx: number; total: number
  legacyState: LegacyState
  cardId: string | null; setCardId: (id: string | null) => void
  saving: boolean; onNext: () => void
}) {
  const { r, g, b } = factionRgb(player.factionId)
  const pColor = `rgb(${r},${g},${b})`
  const [search, setSearch] = useState('')
  const [hoveredTerrId, setHoveredTerrId] = useState<string | null>(null)
  // Card briefly highlighted after being located via a map click
  const [flashCardId, setFlashCardId] = useState<string | null>(null)
  const cardRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const removedIds = new Set(legacyState.removedCardIds ?? [])
  const cardResources = legacyState.cardResources ?? {}

  const allCards = TERRITORY_CARDS.filter(c => !removedIds.has(c.id))
  const filtered = search.trim()
    ? allCards.filter(c => {
        const name = TERRITORY_DEFINITIONS.find(d => d.id === c.territoryId)?.name ?? ''
        return name.toLowerCase().includes(search.toLowerCase())
      })
    : allCards

  // territoryId → live card (removed cards excluded, so a miss = "no card anymore")
  const cardByTerritory = new Map(allCards.map(c => [c.territoryId, c]))

  // Face-up sideboard cards from the game that just ended — surfaced first,
  // since those are the ones visible on the board with their coin counts
  const sideboardIds = legacyState.activeGameCards?.sideboard ?? []
  const faceUpCards = sideboardIds
    .map(id => allCards.find(c => c.id === id))
    .filter((c): c is typeof TERRITORY_CARDS[0] => !!c)

  const selectedCard = cardId ? TERRITORY_CARDS.find(c => c.id === cardId) : null
  const selectedDef  = selectedCard ? TERRITORY_DEFINITIONS.find(d => d.id === selectedCard.territoryId) : null
  const currentCoins = cardId ? (cardResources[cardId] ?? 1) : 0

  // Map click: locate the territory's card in the list — clear the search so
  // the card is visible, scroll to it and flash it. Selecting still requires
  // clicking the card itself.
  function locateCard(territoryId: string) {
    const card = cardByTerritory.get(territoryId)
    if (!card) return
    setSearch('')
    setFlashCardId(card.id)
    setTimeout(() => cardRefs.current[card.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
    setTimeout(() => setFlashCardId(prev => (prev === card.id ? null : prev)), 1800)
  }

  function cardBtnStyle(c: typeof TERRITORY_CARDS[0], opts: { faceUp?: boolean } = {}): React.CSSProperties {
    const coins = cardResources[c.id] ?? 1
    const atMax = coins >= 6
    const sel = cardId === c.id
    const flash = flashCardId === c.id
    return {
      padding: '7px 6px', borderRadius: 6,
      border: `1.5px solid ${flash ? '#F1C40F' : sel ? pColor : atMax ? 'rgba(100,80,40,0.2)' : opts.faceUp ? 'rgba(200,148,10,0.55)' : 'rgba(200,148,10,0.22)'}`,
      background: flash ? 'rgba(241,196,15,0.20)' : sel ? `rgba(${r},${g},${b},0.15)` : atMax ? 'rgba(0,0,0,0.10)' : opts.faceUp ? 'rgba(200,148,10,0.08)' : 'rgba(0,0,0,0.25)',
      color: atMax ? '#3a2a10' : sel ? '#E8DCC8' : opts.faceUp ? '#c8a860' : '#9a8060',
      cursor: atMax ? 'not-allowed' : 'pointer', fontFamily: 'Georgia, serif', fontSize: 9, textAlign: 'left',
      boxShadow: flash ? '0 0 10px rgba(241,196,15,0.55)' : 'none',
      transition: 'border-color 0.25s, background 0.25s, box-shadow 0.25s',
    }
  }

  function renderCardButton(c: typeof TERRITORY_CARDS[0], opts: { faceUp?: boolean } = {}) {
    const def = TERRITORY_DEFINITIONS.find(d => d.id === c.territoryId)
    const coins = cardResources[c.id] ?? 1
    const atMax = coins >= 6
    const sel = cardId === c.id
    return (
      <button
        key={`${opts.faceUp ? 'fu-' : ''}${c.id}`}
        ref={el => { if (!opts.faceUp) cardRefs.current[c.id] = el }}
        onClick={() => !atMax && setCardId(sel ? null : c.id)}
        disabled={atMax}
        style={cardBtnStyle(c, opts)}
      >
        <div style={{ marginBottom: 2 }}>{def?.name ?? c.id}</div>
        <span style={{ color: '#C8940A', fontSize: 8 }}>{atMax ? 'MAX 🪙' : `🪙×${coins}`}</span>
      </button>
    )
  }

  return (
    <div style={{ background: 'linear-gradient(155deg,#1A0E02 0%,#0A0600 100%)', border: '2px solid rgba(200,148,10,0.55)', borderRadius: 13, padding: '20px 24px 18px', width: 1040, maxWidth: '97vw', maxHeight: '94vh', overflowY: 'auto', color: '#E8DCC8', boxShadow: '0 12px 50px rgba(0,0,0,0.85)' }}>
      <div style={{ marginBottom: 12, textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 'bold', color: '#C8940A', letterSpacing: 1, marginBottom: 4 }}>
          🪙 {player.name.toUpperCase()} — UPGRADE A CARD
        </div>
        <div style={{ fontSize: 10, color: 'rgba(200,180,140,0.50)', letterSpacing: 0.5 }}>
          Runner-up {ruIdx + 1} of {total} · Step 2 of 2 — click a territory on the map to find its card, then click the card to upgrade it
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
        {/* Map — click a territory to jump to its card; red = card destroyed */}
        <div style={{ flex: 1.4, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ position: 'relative', width: '100%', flex: 1, minHeight: 380, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(200,148,10,0.25)' }}>
            <img src="/Risk_board.svg.png" alt="map" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', filter: 'grayscale(60%) brightness(0.50)', pointerEvents: 'none' }} />
            <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} preserveAspectRatio="xMidYMid meet"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
              {TERRITORY_DEFINITIONS.map(def => {
                const poly = def.polygon as number[][]
                const pts = poly.map(([x, y]) => `${x},${y}`).join(' ')
                const card = cardByTerritory.get(def.id)
                const noCard = !card
                const isSelectedTerr = !!selectedCard && selectedCard.territoryId === def.id
                const hov = hoveredTerrId === def.id && !noCard

                let fill = 'rgba(0,0,0,0)'
                let stroke = 'rgba(255,255,255,0.06)'
                let strokeW = 0.5
                if (noCard) { fill = 'rgba(200,40,30,0.30)'; stroke = 'rgba(220,60,50,0.55)'; strokeW = 1 }
                else if (isSelectedTerr) { fill = `rgba(${r},${g},${b},0.55)`; stroke = `rgba(${r},${g},${b},0.95)`; strokeW = 2 }
                else if (hov) { fill = 'rgba(241,196,15,0.35)'; stroke = 'rgba(241,196,15,0.85)'; strokeW = 1.5 }

                return (
                  <g key={def.id}>
                    <polygon
                      points={pts} fill={fill} stroke={stroke} strokeWidth={strokeW}
                      style={{ cursor: noCard ? 'not-allowed' : 'pointer', transition: 'fill 0.1s' }}
                      onMouseEnter={() => setHoveredTerrId(def.id)}
                      onMouseLeave={() => setHoveredTerrId(prev => prev === def.id ? null : prev)}
                      onClick={() => locateCard(def.id)}
                    />
                    {(hov || isSelectedTerr || (hoveredTerrId === def.id && noCard)) && (
                      <text x={def.labelX} y={def.labelY} textAnchor="middle" dominantBaseline="central"
                        fontSize="9" fontFamily="Georgia, serif" fontWeight="bold"
                        fill={noCard ? 'rgba(255,140,130,0.95)' : 'white'} stroke="rgba(0,0,0,0.85)" strokeWidth="2.5" paintOrder="stroke"
                        style={{ pointerEvents: 'none' }}>
                        {def.name}{noCard ? ' — card destroyed' : ''}
                      </text>
                    )}
                  </g>
                )
              })}
            </svg>
          </div>
          <div style={{ display: 'flex', gap: 14, fontSize: 9, color: '#7a6040', justifyContent: 'center' }}>
            <span><span style={{ display: 'inline-block', width: 9, height: 9, background: 'rgba(241,196,15,0.45)', border: '1px solid rgba(241,196,15,0.85)', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />click to find its card</span>
            <span><span style={{ display: 'inline-block', width: 9, height: 9, background: 'rgba(200,40,30,0.40)', border: '1px solid rgba(220,60,50,0.65)', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />card destroyed — no longer in the deck</span>
          </div>
        </div>

        {/* Card panel — off to the side of the map */}
        <div style={{ width: 360, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '7px 11px', borderRadius: 7, background: `rgba(${r},${g},${b},0.08)`, border: `1px solid rgba(${r},${g},${b},0.35)` }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: pColor, flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: '#E8DCC8', fontWeight: 'bold' }}>{player.name}</div>
            <div style={{ fontSize: 10, color: '#7a6040', marginLeft: 'auto' }}>Any card from the full deck</div>
          </div>

          {selectedCard && (
            <div style={{ padding: '8px 12px', borderRadius: 7, marginBottom: 10, background: `rgba(${r},${g},${b},0.10)`, border: `1.5px solid rgba(${r},${g},${b},0.50)`, fontSize: 12, color: '#E8DCC8' }}>
              <span style={{ fontWeight: 'bold' }}>{selectedDef?.name ?? cardId}</span>
              <span style={{ color: '#C8940A', marginLeft: 8 }}>🪙×{currentCoins} → {Math.min(6, currentCoins + 1)}</span>
              {currentCoins >= 6 && <span style={{ color: '#e74c3c', marginLeft: 8, fontSize: 10 }}>AT MAX</span>}
            </div>
          )}

          {/* Face-up sideboard cards — quick picks from the board */}
          {faceUpCards.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(200,148,10,0.65)', marginBottom: 5 }}>
                Face-up on the sideboard
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                {faceUpCards.map(c => renderCardButton(c, { faceUp: true }))}
              </div>
            </div>
          )}

          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search territories…"
            style={{ width: '100%', padding: '7px 11px', borderRadius: 6, border: '1px solid rgba(200,148,10,0.25)', background: 'rgba(0,0,0,0.35)', color: '#E8DCC8', fontSize: 12, fontFamily: 'Georgia, serif', boxSizing: 'border-box', marginBottom: 8 }} />

          <div style={{ flex: 1, minHeight: 160, maxHeight: 300, overflowY: 'auto', marginBottom: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
              {filtered.map(c => renderCardButton(c))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setCardId(null); onNext() }}
              style={{ ...skipBtn, flex: 1 }}>Skip →</button>
            <button onClick={onNext} disabled={saving || !cardId || currentCoins >= 6}
              style={(cardId && currentCoins < 6 && !saving) ? { ...primaryBtn(pColor), flex: 2 } : { ...primaryBtn('#555'), flex: 2, cursor: 'not-allowed', opacity: 0.4 }}>
              {saving ? 'Saving…' : cardId ? `Upgrade ${selectedDef?.name ?? ''} →` : 'Select a card'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── City Map Picker ──────────────────────────────────────────────────────────

function CityMapPicker({ playerId, legacyState, cityType, factionId, selectedId, onSelect }: {
  playerId: string; territories?: Record<string, Territory>; legacyState: LegacyState
  cityType: 'major' | 'minor'; factionId: string
  selectedId: string | null; onSelect: (id: string) => void
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const hex = FACTION_COLORS[factionId as keyof typeof FACTION_COLORS] ?? 0x888888
  const fr = (hex >> 16) & 0xff, fg = (hex >> 8) & 0xff, fb = hex & 0xff
  // A readable version of the faction colour for use ON the dark panel. Die
  // Mechaniker and Marshal Krieg are near-black; drawn straight they vanish.
  const lift = (v: number) => Math.round(v + (255 - v) * 0.45)
  const dark = (fr * 0.299 + fg * 0.587 + fb * 0.114) < 90
  const lr = dark ? lift(fr) : fr, lg = dark ? lift(fg) : fg, lb = dark ? lift(fb) : fb

  function isEligible(id: string) {
    // The Fallout Zone is destroyed ground — no city may be built there
    if (id === legacyState.falloutZoneTerritoryId) return false
    // The World Capital already IS the city on its territory — nothing may be
    // founded under it. (A city it replaced still has its sticker here, so that
    // case is covered by the check below too; this catches a Capital placed on
    // open ground.)
    if (id === legacyState.worldCapitalTerritoryId) return false
    return !legacyState.stickers.some(s => s.targetId === id && s.description.startsWith('city:'))
  }

  // City ownership — green = placed by the choosing player, red = someone else's.
  // Founder resolution mirrors HQMapPicker: placedByPlayerId field, victoryLog
  // fallback for old major cities, then the "-p1"-style id suffix.
  const winnerPlayerByGame = new Map<number, string>()
  for (const v of (legacyState.victoryLog ?? [])) {
    const id = victoryWinnerId(legacyState, v) ?? MOCK_PLAYERS.find(pl => pl.name === v.winnerName)?.id
    if (id) winnerPlayerByGame.set(v.gameNumber, id)
  }
  function cityPlacedBy(sticker: { id: string; description: string; appliedInGame: number; placedByPlayerId?: string }): string | null {
    if (sticker.placedByPlayerId) return sticker.placedByPlayerId
    if (sticker.description === 'city:major') return winnerPlayerByGame.get(sticker.appliedInGame) ?? null
    const parts = sticker.id.split('-')
    const embedded = parts[parts.length - 1]
    return MOCK_PLAYERS.some(pl => pl.id === embedded) ? embedded : null
  }
  const destroyedCityIds = new Set((legacyState.destroyedCities ?? []).map(d => d.cityId))
  function getCityInfo(id: string): { icon: string; mine: boolean; name: string } | null {
    const sticker = legacyState.stickers.find(s =>
      s.targetId === id && s.description.startsWith('city:') && !destroyedCityIds.has(s.id))
    if (!sticker) return null
    return {
      icon: sticker.description === 'city:major' ? '🏙' : '🏘',
      mine: cityPlacedBy(sticker) === playerId,
      name: sticker.name,
    }
  }

  void cityType

  // The board rides as a BACKGROUND, not an <img>: this picker remounts on
  // every step of the ceremony, and an image request cancelled by a remount
  // leaves a broken-image element showing its alt text — a literal "map"
  // label over an empty panel, which is what the reward steps were doing.
  // A background-image simply paints when it arrives.
  return (
    <div style={{
      position: 'relative', width: '100%', height: 280, borderRadius: 6, overflow: 'hidden',
      border: '1px solid rgba(200,148,10,0.25)',
      backgroundImage: 'url(/Risk_board.svg.png)',
      backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
      backgroundColor: 'rgba(0,0,0,0.35)',
    }}>
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        {TERRITORY_DEFINITIONS.map(def => {
          const poly = def.polygon as number[][]
          const pts = poly.map(([x, y]) => `${x},${y}`).join(' ')
          const eligible = isEligible(def.id)
          const sel = selectedId === def.id
          const hov = hoveredId === def.id && eligible
          const city = getCityInfo(def.id)
          const isFallout = def.id === legacyState.falloutZoneTerritoryId

          let fill = 'rgba(0,0,0,0)'
          let stroke = 'rgba(255,255,255,0.06)'
          let strokeW = 0.5
          if (isFallout) { fill = 'rgba(241,196,15,0.20)'; stroke = 'rgba(241,196,15,0.75)'; strokeW = 1.5 }
          // Selection uses the faction's own colour, LIGHTENED when the faction
          // is a dark one. Eligibility does not use it at all: painting "you
          // may click here" in Die Mechaniker's near-black on a near-black
          // panel made the whole picker look empty and unresponsive — the step
          // read as a soft-lock until you clicked blind and hit something.
          else if (sel) { fill = `rgba(${lr},${lg},${lb},0.55)`; stroke = `rgba(${lr},${lg},${lb},0.95)`; strokeW = 2 }
          else if (hov) { fill = 'rgba(80,200,80,0.35)'; stroke = 'rgba(80,220,80,0.85)'; strokeW = 1.5 }
          else if (eligible) { fill = 'rgba(255,255,255,0.10)'; stroke = 'rgba(200,148,10,0.55)'; strokeW = 1 }

          return (
            <g key={def.id}>
              <polygon
                points={pts} fill={fill} stroke={stroke} strokeWidth={strokeW}
                style={{ cursor: eligible ? 'pointer' : 'default', transition: 'fill 0.1s', pointerEvents: eligible ? 'all' : 'none' }}
                onMouseEnter={() => setHoveredId(def.id)}
                onMouseLeave={() => setHoveredId(prev => prev === def.id ? null : prev)}
                onClick={() => onSelect(def.id)}
              />
              {/* Fallout Zone — cannot build a city here */}
              {isFallout && (
                <text x={def.labelX} y={def.labelY - 10} textAnchor="middle" dominantBaseline="central"
                  fontSize="16" style={{ pointerEvents: 'none' }}>☢</text>
              )}
              {/* Existing city: green ring/name = yours, red = another faction's */}
              {city && (
                <circle
                  cx={def.labelX} cy={def.labelY - 11} r={7}
                  fill={city.mine ? 'rgba(80,220,80,0.14)' : 'rgba(255,90,80,0.14)'}
                  stroke={city.mine ? 'rgba(80,220,80,0.95)' : 'rgba(255,90,80,0.95)'}
                  strokeWidth="1.6"
                  style={{ pointerEvents: 'none' }}
                />
              )}
              {(sel || hov || city) && (
                <text x={def.labelX} y={def.labelY} textAnchor="middle" dominantBaseline="central"
                  fontSize="9" fontFamily="Georgia, serif" fontWeight="bold"
                  fill={city ? (city.mine ? 'rgba(140,240,140,0.95)' : 'rgba(255,140,130,0.95)') : 'white'}
                  stroke="rgba(0,0,0,0.85)" strokeWidth="2.5" paintOrder="stroke"
                  style={{ pointerEvents: 'none' }}>
                  {city ? `${city.icon} ${city.name}` : def.name}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {/* City ownership legend */}
      <div style={{
        position: 'absolute', top: 6, right: 6,
        background: 'rgba(5,3,0,0.82)', borderRadius: 6,
        border: '1px solid rgba(200,148,10,0.25)',
        padding: '4px 8px', fontSize: 9, color: '#9a8060',
        display: 'flex', flexDirection: 'column', gap: 3, pointerEvents: 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 9, height: 9, borderRadius: '50%', border: '1.5px solid rgba(80,220,80,0.95)', boxSizing: 'border-box' }} />
          <span>City you placed</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 9, height: 9, borderRadius: '50%', border: '1.5px solid rgba(255,90,80,0.95)', boxSizing: 'border-box' }} />
          <span>Another faction's city</span>
        </div>
        {legacyState.falloutZoneTerritoryId && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 11 }}>☢</span>
            <span>Fallout Zone — no build</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'linear-gradient(155deg,#1A0E02 0%,#0A0600 100%)', border: '2px solid rgba(200,148,10,0.55)', borderRadius: 13, padding: '24px 28px 20px', width: 520, maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto', color: '#E8DCC8', boxShadow: '0 12px 50px rgba(0,0,0,0.85)' }}>
      <div style={{ marginBottom: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 'bold', color: '#C8940A', letterSpacing: 1, marginBottom: 4 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 10, color: 'rgba(200,180,140,0.50)', letterSpacing: 0.5 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  )
}

function LargeCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'linear-gradient(155deg,#1A0E02 0%,#0A0600 100%)', border: '2px solid rgba(200,148,10,0.55)', borderRadius: 13, padding: '20px 22px 18px', width: 660, maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto', color: '#E8DCC8', boxShadow: '0 12px 50px rgba(0,0,0,0.85)' }}>
      <div style={{ marginBottom: 14, textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 'bold', color: '#C8940A', letterSpacing: 1, marginBottom: 3 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 10, color: 'rgba(200,180,140,0.50)', letterSpacing: 0.5 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  )
}
