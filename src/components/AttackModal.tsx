import { useState, useEffect, useRef, type CSSProperties } from 'react'
import type { Territory } from '@/types/territory'
import type { Player } from '@/types/player'
import { playDice } from '@/lib/sounds'
import { resolveCombat, createMathRng, singleDieDelta, singleDieBonus, defenderDieSteps, type CombatModifiers, type CombatOutcome, type CombatRoundLog } from '@/lib/gameReducer'
import type { ActiveCombat } from '@/types/game'
import { troopsAfterEntry, minTroopsToEnter, battleMissileControls, type EntryCost } from '@/lib/gameLogic'
import { dieKey } from '@/lib/missileFx'

// ─── Types ───────────────────────────────────────────────────────────────────

type Phase = 'setup' | 'awaiting-consent' | 'waiting-defense' | 'rolling' | 'modifiers' | 'missile-phase' | 'spectator-window' | 'results' | 'auto-animating' | 'auto-results'

/** One animated die-modifier application (Bunker, Ammo Shortage, Bear Trap…) */
interface ModStep {
  label: string
  side: 'atk' | 'def'
  indices: number[]      // dice positions that change in this step
  atk: number[]          // both dice arrays AFTER this step is applied
  def: number[]
}

/** Synthesized gunshot — noise burst with a fast decay through a lowpass. */
function playGunshot() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const dur = 0.22
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.5)
    }
    const src = ctx.createBufferSource()
    src.buffer = buf
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 900
    const gain = ctx.createGain()
    gain.gain.value = 0.55
    src.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    src.start()
    src.onended = () => { ctx.close().catch(() => {}) }
  } catch { /* audio unavailable — animation still runs */ }
}

export interface CombatResolution {
  totalAtkLoss: number
  totalDefLoss: number
  captured: boolean
  troopsToAdvance: number
  /** True when Bear Berserker Rage triggered (three-of-a-kind + kill) */
  tripleKill?: boolean
  /** Max attacker dice used in any round (for fortification charge depletion) */
  atkDiceUsed: number
  atkMissileUsed?: boolean
  defMissileUsed?: boolean
  /** Rounds where the defender rolled natural doubles (Mutant Unstable Cloning) */
  defNaturalDoublesRounds?: number
  /** Total dice rolls fought this battle (fortification charge depletion — 1 per roll) */
  roundsFought?: number
  /** Every round's final dice (post-modifier), in order — carried on the online
   *  action so SPECTATORS watch the same battle the attacker saw. */
  rounds?: CombatRoundLog[]
}

interface Props {
  attacker: Territory
  defender: Territory
  attackerPlayer: Player
  defenderPlayer: Player | null
  /** Extra dice cap added on top of base 2 */
  defenderBonusDiceCap?: number
  /** Add to (or subtract from) defender's highest and/or lowest die value after rolling.
   *  Positive = bonus (fortified scar, DM Armored Command, fortification sticker).
   *  Negative = penalty (wasteland scar). Values clamped 1–6. */
  defenderDieBonus?: { highest: number; lowest: number }
  /** Named breakdown of defenderDieBonus — one animated step per entry so the
   *  player sees each modifier (Bunker, Ammo Shortage…) change the dice. Must
   *  sum to defenderDieBonus; falls back to a single aggregate step if omitted. */
  defenderDieBonusParts?: Array<{ label: string; highest?: number; lowest?: number }>
  /** Cap attacker dice to this maximum (wasteland scar on territory, ammo-shortage event) */
  attackerMaxDiceOverride?: number
  /** Nuclear-fallout penalty: both sides lose +1 extra troop per round */
  nuclearFallout?: boolean
  /** Add this value to every attacker die after rolling (Aggressive comeback power vs HQ) */
  attackerBonusAllDice?: number
  /** Subtract 1 from attacker's lowest die (Enclave of the Bear, Bear Trap — defender ability) */
  attackerSubtractLowest?: boolean
  /** Three-of-a-kind attack + ≥1 kill eliminates all defenders (Enclave, Berserker Rage) */
  tripleKillEnabled?: boolean
  /** Called when defender rolls all-6s with ≥2 dice (Die Mechaniker, Iron Shield) */
  onDefenseDoubleMax?: () => void
  /** Missile tokens available to spending player this battle */
  attackerMissiles?: number
  defenderMissiles?: number
  /** Called when a missile is consumed (GameBoard decrements legacyState) */
  onAttackerUsedMissile?: () => void
  onDefenderUsedMissile?: () => void
  /** Called after every missile placement with the running total for THIS roll
   *  (both sides combined) — the Nuclear Milestone fires at 3. */
  onMissilePlaced?: (side: 'attacker' | 'defender', totalThisRoll: number) => void
  /** EMP missile power: dice in this territory can't be modified this turn.
   *  When active, GameBoard passes zeroed modifiers and 0 missiles. */
  empActive?: boolean
  attackerCanEmp?: boolean
  defenderCanEmp?: boolean
  onActivateEmp?: (side: 'attacker' | 'defender') => void
  /** Mutant Unnatural Strength: attacker's 6's beat the defender's 6's */
  attackerSixesWin?: boolean
  /** Mutant comeback power vs the Bringer of Nuclear Fire: attack dice re-roll 1's */
  attackerRerollOnes?: boolean
  /** Troops lost on capture (cities, fortification, milestone modifiers) —
   *  shown up front so the attacker isn't surprised */
  entryCost?: EntryCost
  /** AI mode: auto-resolve the whole battle and confirm, with short delays so
   *  humans can follow it. Uses the identical combat math as manual play. */
  autoPlay?: boolean
  /** Fast-forward: shrink all autoPlay delays so AI turns fly by */
  autoPlayFast?: boolean
  /**
   * Authority-owned combat resolver (multiplayer refactor). When provided, the
   * auto-resolve outcome is produced by this callback — GameBoard runs the pure
   * `resolveCombat` with its owned RNG — and this modal only ANIMATES the
   * returned rounds. Falls back to a local roll when absent. This is the seam
   * where a server will later supply the resolved outcome.
   */
  resolveAuto?: (atkTroops: number, defTroops: number, mods: CombatModifiers) => CombatOutcome
  /**
   * Online only: hold each round's final dice open for SPECTATOR missiles.
   *
   * `open` publishes the dice (returns the round key), `peekFlips` reads the
   * flips delivered so far, `close` re-reads the server's authoritative window,
   * dispatches the CLOSE, and returns the final flips to fold into the round.
   * Absent in hotseat and ignored during auto-resolve — the window only exists
   * where a remote audience does.
   */
  spectatorWindow?: {
    windowMs: number
    open: (dice: { atk: number[]; def: number[] }) => string
    peekFlips: (roundKey: string) => Array<{ side: 'atk' | 'def'; dieIndex: number; playerName: string }>
    close: (roundKey: string) => Promise<Array<{ side: 'atk' | 'def'; dieIndex: number }>>
    /** The shared deadline for this round's window; every missile pushes it out. */
    expiryOf: (roundKey: string) => number
    /** Fire one of MY missiles into the window — the attacker fires here too. */
    fire: (side: 'atk' | 'def', dieIndex: number) => Promise<boolean>
  }
  /**
   * Does anyone in the audience actually hold a missile to spend on this
   * battle? When nobody does, the window is a pause with no button behind it
   * — five dead seconds every round, most visibly when two AIs fight and the
   * humans are all watching ("a good delay for the spectators").
   */
  audienceCanMissile?: boolean
  /**
   * Online battle against a HUMAN defender: the fight is a shared session.
   * Auto-resolve needs the defender's consent; manual rounds use the RAW dice
   * the defender's own machine posts (the attacker never waits to roll their
   * own). Absent for hotseat and any battle involving an AI.
   */
  interactiveDefense?: {
    offer: (defDiceMax: number) => string
    getCombat: () => ActiveCombat | null
    proposeAuto: () => void
    postDice: (round: number, side: 'atk' | 'def', dice: number[], by?: 'attacker-idle' | 'ai') => void
    postMissiles: (round: number, flips: Array<{ side: 'atk' | 'def'; dieIndex: number }>) => void
    nextRound: (round: number) => void
    defenderName: string
    /** False when the defending seat is an AI: no consent to wait for, and
     *  this machine throws the defense itself — the session still carries
     *  every roll so SPECTATORS watch the same animated battle. */
    defenderIsHuman: boolean
  }
  onClose: () => void
  onApplyResult: (r: CombatResolution) => void
}

// ─── Dice pip positions (% of die face) ──────────────────────────────────────

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 22], [72, 22], [28, 50], [72, 50], [28, 78], [72, 78]],
}

// Standard die layout — opposite faces sum to 7:
// front=1, back=6, right=3, left=4, top=2, bottom=5
const FACE_TRANSFORMS: Array<{ value: number; rotate: string }> = [
  { value: 1, rotate: 'rotateY(0deg)' },
  { value: 6, rotate: 'rotateY(180deg)' },
  { value: 3, rotate: 'rotateY(90deg)' },
  { value: 4, rotate: 'rotateY(-90deg)' },
  { value: 2, rotate: 'rotateX(90deg)' },
  { value: 5, rotate: 'rotateX(-90deg)' },
]

// Cube orientation that brings each value to the front
const SHOW_FACE: Record<number, string> = {
  1: 'rotateX(0deg) rotateY(0deg)',
  2: 'rotateX(-90deg) rotateY(0deg)',
  3: 'rotateX(0deg) rotateY(-90deg)',
  4: 'rotateX(0deg) rotateY(90deg)',
  5: 'rotateX(90deg) rotateY(0deg)',
  6: 'rotateX(0deg) rotateY(180deg)',
}

// Exported: the defender's battle screen renders the same dice, so both
// players watch the same fight in the same visual language.
export function DieFace({
  value,
  borderColor,
  size = 54,
  glow,
  dim,
  spinning,
  clickable,
  onClick,
  dataDie,
}: {
  value: number
  borderColor: string
  size?: number
  glow?: string
  dim?: boolean
  spinning?: boolean
  clickable?: boolean
  onClick?: () => void
  /** Identifies this die to the missile strike layer — see missileFx. */
  dataDie?: string
}) {
  // Settle bounce the moment the roll lands
  const wasSpinning = useRef(false)
  const [landed, setLanded] = useState(false)
  useEffect(() => {
    const was = wasSpinning.current
    wasSpinning.current = !!spinning
    if (was && !spinning) {
      setLanded(true)
      const t = setTimeout(() => setLanded(false), 450)
      return () => clearTimeout(t)
    }
  }, [spinning])

  const half = size / 2
  const showValue = Math.max(1, Math.min(6, value))

  return (
    <div
      onClick={clickable ? onClick : undefined}
      data-die={dataDie}
      className={`die3d-scene${spinning ? ' spinning' : landed ? ' die-land' : ''}`}
      style={{
        width: size,
        height: size,
        perspective: size * 4.5,
        filter: clickable
          ? 'drop-shadow(0 0 10px #F1C40F) drop-shadow(0 3px 6px rgba(0,0,0,0.4))'
          : glow
          ? `drop-shadow(0 0 9px ${glow}) drop-shadow(0 3px 6px rgba(0,0,0,0.4))`
          : 'drop-shadow(0 3px 6px rgba(0,0,0,0.35))',
        opacity: dim ? 0.65 : 1,
        cursor: clickable ? 'pointer' : 'default',
        transition: 'filter 0.25s, opacity 0.25s',
      }}
    >
      <div
        className={`die3d-cube${spinning ? ' spinning' : ''}`}
        style={{ transform: spinning ? undefined : SHOW_FACE[showValue] }}
      >
        {FACE_TRANSFORMS.map(({ value: faceValue, rotate }) => {
          const pips = PIPS[faceValue] ?? []
          return (
            <div
              key={faceValue}
              className="die3d-face"
              style={{
                transform: `${rotate} translateZ(${half}px)`,
                background: dim
                  ? 'linear-gradient(145deg, #ece4d4 0%, #d8cfba 100%)'
                  : 'linear-gradient(145deg, #ffffff 0%, #ece7dc 100%)',
                borderRadius: size * 0.14,
                border: `2.5px solid ${clickable ? '#F1C40F' : borderColor}`,
                boxShadow: 'inset 0 0 6px rgba(0,0,0,0.10)',
              }}
            >
              {pips.map(([x, y], i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    width: size * 0.17,
                    height: size * 0.17,
                    borderRadius: '50%',
                    background: clickable
                      ? '#F1C40F'
                      : `radial-gradient(circle at 35% 35%, ${borderColor}, ${borderColor})`,
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.35)',
                    left: `${x}%`,
                    top: `${y}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Combat logic ─────────────────────────────────────────────────────────────

function rollDie(rerollOnes = false): number {
  let v = Math.floor(Math.random() * 6) + 1
  // Mutant comeback power vs the Bringer: re-roll 1's until they are no longer 1's
  while (rerollOnes && v === 1) v = Math.floor(Math.random() * 6) + 1
  return v
}

function rollN(n: number, rerollOnes = false): number[] {
  return Array.from({ length: n }, () => rollDie(rerollOnes)).sort((a, b) => b - a)
}

/** True when 2+ dice contain a repeated value (natural doubles) */
function hasDoubles(dice: number[]): boolean {
  return dice.length >= 2 && new Set(dice).size < dice.length
}

function compareRolls(atk: number[], def: number[], atkSixesWin = false): { aLoss: number; dLoss: number } {
  const pairs = Math.min(atk.length, def.length)
  let aLoss = 0, dLoss = 0
  for (let i = 0; i < pairs; i++) {
    // Tie goes to defender — except Mutant Unnatural Strength: attacker 6's beat defender 6's
    if (atk[i] > def[i] || (atkSixesWin && atk[i] === 6 && def[i] === 6)) dLoss++
    else aLoss++
  }
  return { aLoss, dLoss }
}

/** Pair winner for display, matching compareRolls semantics */
function pairWonByAttacker(a: number, d: number, atkSixesWin: boolean): boolean {
  return a > d || (atkSixesWin && a === 6 && d === 6)
}

// ─── Auto-resolve types ───────────────────────────────────────────────────────

interface AutoRound {
  atkDice: number[]
  defDice: number[]
  aLoss: number
  dLoss: number
  tripleKill: boolean
  defDoubleMax: boolean
}

interface AutoResult {
  rounds: AutoRound[]
  totalAtkLoss: number
  totalDefLoss: number
  captured: boolean
  atkTroopsAfter: number
  defTroopsAfter: number
  maxAtkDiceUsed: number
  defDoublesRounds: number
}

// Combat math now lives in the pure, rng-injected `resolveCombat` (gameReducer).
// This thin wrapper preserves the existing call sites and result shape while the
// dice engine is shared with the reducer / future server. AutoResult and
// AutoRound are structurally identical to CombatOutcome / CombatRound.
function simulateAutoResolve(
  atkTroopsStart: number,
  defTroopsStart: number,
  opts: {
    attackerMaxDiceOverride?: number
    attackerBonusAllDice: number
    attackerSubtractLowest: boolean
    tripleKillEnabled: boolean
    defenderDieBonus?: { highest: number; lowest: number }
    defenderBonusDiceCap: number
    nuclearFallout: boolean
    attackerSixesWin: boolean
    attackerRerollOnes: boolean
  },
): AutoResult {
  return resolveCombat(atkTroopsStart, defTroopsStart, opts, createMathRng())
}

// ─── Main component ───────────────────────────────────────────────────────────

const ATK_COLOR = '#c0392b'
const DEF_COLOR = '#2471a3'
const WIN_GLOW  = '#2ecc71'

export default function AttackModal({
  attacker,
  defender,
  attackerPlayer,
  defenderPlayer,
  defenderBonusDiceCap = 0,
  attackerBonusAllDice = 0,
  defenderDieBonus,
  defenderDieBonusParts,
  attackerMaxDiceOverride,
  nuclearFallout = false,
  attackerSubtractLowest = false,
  tripleKillEnabled = false,
  onDefenseDoubleMax,
  attackerMissiles = 0,
  defenderMissiles = 0,
  onAttackerUsedMissile,
  onDefenderUsedMissile,
  onMissilePlaced,
  empActive = false,
  attackerCanEmp = false,
  defenderCanEmp = false,
  onActivateEmp,
  attackerSixesWin = false,
  attackerRerollOnes = false,
  entryCost,
  autoPlay = false,
  autoPlayFast = false,
  resolveAuto,
  spectatorWindow,
  audienceCanMissile = true,
  interactiveDefense,
  onClose,
  onApplyResult,
}: Props) {
  // Troops that survive entry after capture penalties (and Fallout Zone halving).
  // Shared with the uncontested Advance panel and the reducer, so the cost is
  // charged identically however the territory is taken.
  const arriveAfterEntry = (n: number) => troopsAfterEntry(n, entryCost)
  /** Fewest troops that can be sent in and still pay the entry cost. */
  const minAdvance = minTroopsToEnter(entryCost)
  const hasEntryCost = !!entryCost && (entryCost.total > 0 || !!entryCost.falloutHalf)
  // Cumulative losses across multi-round attacks
  const [cumulAtkLoss, setCumulAtkLoss] = useState(0)
  const [cumulDefLoss, setCumulDefLoss] = useState(0)

  // Current effective troop counts
  const atkTroops = attacker.troops - cumulAtkLoss
  const defTroops = defender.troops - cumulDefLoss

  const maxAtkDice = Math.min(
    attackerMaxDiceOverride ?? 3,
    Math.min(3, Math.max(1, atkTroops - 1)),
  )
  const maxDefDice = Math.min(
    2 + defenderBonusDiceCap,
    Math.max(1, defTroops),
  )

  const [phase, setPhase]         = useState<Phase>('setup')
  const [atkDiceCount, setAtkDiceCount] = useState(() => Math.min(attackerMaxDiceOverride ?? 3, Math.min(3, Math.max(1, attacker.troops - 1))))

  // Final rolled values (shown after animation settles)
  const [atkDice, setAtkDice] = useState<number[]>([])
  const [defDice, setDefDice] = useState<number[]>([])

  // Values shown during animation (rapidly cycling)
  const [animAtk, setAnimAtk] = useState<number[]>([])
  const [animDef, setAnimDef] = useState<number[]>([])

  // Round result
  const [roundResult, setRoundResult] = useState<{ aLoss: number; dLoss: number } | null>(null)

  // Modifier animation state — raw roll shown first, then one step per modifier
  const [modSteps, setModSteps] = useState<ModStep[]>([])
  const [modStepIdx, setModStepIdx] = useState(-1)
  const [flashInfo, setFlashInfo] = useState<{ side: 'atk' | 'def'; indices: Set<number>; label: string } | null>(null)

  // Missile state
  /**
   * The defender's missiles, as far as THIS screen may spend them.
   *
   * At one keyboard both players are here, and each clicks their own dice —
   * that is the whole missile phase. Online against a HUMAN defender they are
   * not here, and this modal belongs to the attacker: offering their dice
   * meant the attacker choosing whether to spend the defender's stockpile, on
   * the defender's behalf, without them ever seeing it. Test spent Ryan's
   * missiles for him.
   *
   * A remote human defender spends their own, on their own screen, in the
   * missile window that opens the moment this phase ends — the same
   * server-arbitrated window spectators fire through, which is already offered
   * to them and already counts them when deciding whether to open it at all.
   */
  const defenderMissilesHere = battleMissileControls({
    attackerMissiles, defenderMissiles,
    remoteHumanDefender: !!interactiveDefense?.defenderIsHuman,
  }).defender
  // Battle-cumulative flags (reported in CombatResolution)
  const [mslAtkUsed, setMslAtkUsed] = useState(false)
  const [mslDefUsed, setMslDefUsed] = useState(false)
  // Per-roll converted die indices — each die may be converted once; multiple
  // missiles may be placed on a single roll (3 on one roll = Nuclear Milestone)
  const [atkConverted, setAtkConverted] = useState<Set<number>>(new Set())
  const [defConverted, setDefConverted] = useState<Set<number>>(new Set())
  const rollMissileCountRef = useRef(0)
  const [pendingAtkDice, setPendingAtkDice] = useState<number[]>([])
  const [pendingDefDice, setPendingDefDice] = useState<number[]>([])

  const finalAtkRef = useRef<number[]>([])
  const finalDefRef = useRef<number[]>([])
  const resolvedRef = useRef(false)
  const maxAtkDiceUsedRef = useRef(0)
  // Rounds where the defender rolled natural doubles (Mutant Unstable Cloning)
  const defDoublesRef = useRef(0)
  // Total dice rolls fought this battle (fortification depletes 1 charge per roll)
  const roundsFoughtRef = useRef(0)
  // Every round's FINAL dice + losses, in order — the spectator log carried on
  // the online action so other machines can replay the battle they never saw.
  const roundHistoryRef = useRef<CombatRoundLog[]>([])

  // ── Spectator missile window (online interactive rounds only) ────────────
  const windowKeyRef  = useRef<string | null>(null)
  /** Earliest this round's window may close, set when it opens — see the
   *  countdown: the shared deadline arrives a beat after the window does. */
  const windowFloorRef = useRef(0)
  const windowDiceRef = useRef<{ fa: number[]; fd: number[] }>({ fa: [], fd: [] })
  /** Whether the current round marked resolvedRef when it settles (the two
   *  resolution paths differ on this and the window must preserve each). */
  const windowMarkResolvedRef = useRef(false)
  const windowClosingRef = useRef(false)
  const [windowSecondsLeft, setWindowSecondsLeft] = useState(0)
  /** Flips shown live while the window is open (names for the banner). */
  const [windowFlips, setWindowFlips] = useState<Array<{ side: 'atk' | 'def'; dieIndex: number; playerName: string }>>([])
  /** A missile of ours is in flight to the server — one click, one missile. */
  const [windowFiring, setWindowFiring] = useState(false)

  /**
   * The shared round tail: fold in any spectator flips, re-sort for pairing
   * (a flipped 6 re-pairs exactly as rearranging physical dice would), compute
   * losses, and land on the results phase. Both resolution paths and the
   * window all end here, so they can never disagree.
   */
  function finishRound(fa0: number[], fd0: number[], flips: Array<{ side: 'atk' | 'def'; dieIndex: number }>, markResolved: boolean) {
    let fa = [...fa0], fd = [...fd0]
    for (const f of flips) {
      if (f.side === 'atk' && f.dieIndex >= 0 && f.dieIndex < fa.length) fa[f.dieIndex] = 6
      if (f.side === 'def' && f.dieIndex >= 0 && f.dieIndex < fd.length) fd[f.dieIndex] = 6
    }
    if (flips.length > 0) {
      fa = [...fa].sort((a, b) => b - a)
      fd = [...fd].sort((a, b) => b - a)
    }
    const baseResult = compareRolls(fa, fd, attackerSixesWin)
    const r = nuclearFallout
      ? { aLoss: baseResult.aLoss + 1, dLoss: baseResult.dLoss + 1 }
      : baseResult
    setAtkDice(fa)
    setDefDice(fd)
    setRoundResult(r)
    setCumulAtkLoss(prev => prev + r.aLoss)
    setCumulDefLoss(prev => prev + r.dLoss)
    roundHistoryRef.current.push({ atkDice: [...fa], defDice: [...fd], aLoss: r.aLoss, dLoss: r.dLoss })
    if (markResolved) resolvedRef.current = true
    if (fd.length >= 2 && fd.every(d => d === 6)) onDefenseDoubleMax?.()
    // Interactive battles: clear the session's dice slots so a next round can
    // be rolled by either side.
    if (interactiveDefense) {
      const c = interactiveDefense.getCombat()
      if (c) interactiveDefense.nextRound(c.round)
    }
    setPhase('results')
  }

  /** Route a settled roll through the spectator window when one applies.
   *  PUBLIC AI rounds hold the window open too — the audience may missile the
   *  computer's dice; it closes itself on the timer with nobody to click
   *  Skip. Only fast-forwarded/one-shot battles bypass it. */
  function windowThenFinish(fa: number[], fd: number[], markResolved: boolean) {
    // No window when there is no audience, when the battle is a one-shot
    // auto-resolve, or when nobody at all holds a missile — an un-clickable
    // pause is just a delay wearing a countdown. The ATTACKER counts as
    // somebody: their missiles are spent here now, in the same window as
    // everyone else's.
    if (!spectatorWindow || (autoPlay && !publicAiRounds)
      || (!audienceCanMissile && attackerMissiles < 1)) {
      finishRound(fa, fd, [], markResolved); return
    }
    if (markResolved) resolvedRef.current = true
    windowKeyRef.current = spectatorWindow.open({ atk: fa, def: fd })
    // A floor under the shared deadline. The countdown reads the window out of
    // game state so that a missile fired anywhere extends it everywhere — but
    // that state arrives a beat later than this call, and a countdown that
    // reads "no deadline" as "expired" slams the window shut in its first
    // tick. Nobody could reach a die.
    windowFloorRef.current = Date.now() + spectatorWindow.windowMs
    windowDiceRef.current = { fa: [...fa], fd: [...fd] }
    windowMarkResolvedRef.current = markResolved
    windowClosingRef.current = false
    setWindowFlips([])
    setWindowSecondsLeft(Math.ceil(spectatorWindow.windowMs / 1000))
    setAtkDice(fa)
    setDefDice(fd)
    setPhase('spectator-window')
  }

  /** Close the window (timer or Skip): take the server's final word on which
   *  flips landed, fold them in, resume the battle. */
  async function endSpectatorWindow() {
    if (windowClosingRef.current) return
    windowClosingRef.current = true
    const key = windowKeyRef.current
    windowKeyRef.current = null
    const { fa, fd } = windowDiceRef.current
    let flips: Array<{ side: 'atk' | 'def'; dieIndex: number }> = []
    if (key && spectatorWindow) {
      try { flips = await spectatorWindow.close(key) }
      catch { flips = spectatorWindow.peekFlips(key) }
    }
    finishRound(fa, fd, flips, false)   // resolvedRef already set on entry
  }

  /**
   * Window countdown, read from the SHARED deadline rather than counted down
   * locally — every missile fired by anyone pushes that deadline out, and the
   * other side must see the same clock they are answering against. Reaching
   * zero closes the window exactly as the button does.
   */
  useEffect(() => {
    if (phase !== 'spectator-window') return
    const t = setInterval(() => {
      const key = windowKeyRef.current
      // The shared deadline once it has arrived, never earlier than the floor
      // set when the window opened.
      const shared = key && spectatorWindow ? spectatorWindow.expiryOf(key) : 0
      const endsAt = Math.max(shared, windowFloorRef.current)
      const left = Math.ceil((endsAt - Date.now()) / 1000)
      setWindowSecondsLeft(Math.max(0, left))
      if (left <= 0) { clearInterval(t); void endSpectatorWindow() }
    }, 250)
    return () => clearInterval(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // ── Interactive defense (online human-vs-human) ───────────────────────────
  /** Dice already rolled elsewhere (the attacker's early roll, the defender's
   *  posted roll) that the next 'rolling' pass must USE instead of rolling. */
  const providedRollRef = useRef<{ atk: number[] | null; def: number[] | null }>({ atk: null, def: null })
  const [defenseWaitSeconds, setDefenseWaitSeconds] = useState(0)
  const [manualForced, setManualForced] = useState(false)
  const offeredRef = useRef(false)
  /** ONLINE at normal speed the AI fights IN PUBLIC: real session rounds on
   *  every screen. Fast-forward keeps the old one-shot auto-resolve. */
  const publicAiRounds = autoPlay && !!interactiveDefense && !autoPlayFast

  // Open the shared session the moment the battle modal opens, so the
  // defender's machine can already see who is attacking what. Fast-forwarded
  // AI battles skip it — they one-shot auto-resolve and the replay covers them.
  useEffect(() => {
    if (!interactiveDefense || (autoPlay && autoPlayFast) || offeredRef.current) return
    offeredRef.current = true
    interactiveDefense.offer(maxDefDice)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactiveDefense, autoPlay, autoPlayFast])

  // Awaiting the defender's answer to "auto-resolve?".
  useEffect(() => {
    if (phase !== 'awaiting-consent' || !interactiveDefense) return
    const t = setInterval(() => {
      const c = interactiveDefense.getCombat()
      if (!c) return
      if (c.defenderAuto === true) { clearInterval(t); doAutoResolve() }
      else if (c.defenderAuto === false) {
        clearInterval(t)
        setManualForced(true)
        setPhase('setup')
      }
    }, 300)
    return () => clearInterval(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, interactiveDefense])

  // Waiting for the defender's dice. The attacker has already rolled and
  // posted; the round continues the instant the defense lands. After a long
  // idle the attacker may roll for them — marked as such in the session. On
  // an AI's turn nobody is watching this modal to click the fallback, so it
  // fires by itself: an away defender never stalls the computer's turn.
  useEffect(() => {
    if (phase !== 'waiting-defense' || !interactiveDefense) return
    const started = Date.now()
    const t = setInterval(() => {
      const elapsed = Math.floor((Date.now() - started) / 1000)
      setDefenseWaitSeconds(elapsed)
      const c = interactiveDefense.getCombat()
      if (c?.defDice) {
        clearInterval(t)
        providedRollRef.current.def = [...c.defDice]
        setAnimAtk(providedRollRef.current.atk ?? [])
        setAnimDef(c.defDice)
        setPhase('rolling')
        return
      }
      if (autoPlay && elapsed >= 20 && c && !c.defDice) {
        interactiveDefense.postDice(c.round, 'def', rollN(maxDefDice), 'attacker-idle')
      }
    }, 300)
    return () => clearInterval(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, interactiveDefense])

  // Live flips: show a die turning to 6 the moment the server confirms it.
  useEffect(() => {
    if (phase !== 'spectator-window' || !spectatorWindow) return
    const t = setInterval(() => {
      const key = windowKeyRef.current
      if (!key) return
      const flips = spectatorWindow.peekFlips(key)
      setWindowFlips(prev => (flips.length !== prev.length ? flips : prev))
      if (flips.length > 0) {
        setAtkDice(windowDiceRef.current.fa.map((d, i) => flips.some(f => f.side === 'atk' && f.dieIndex === i) ? 6 : d))
        setDefDice(windowDiceRef.current.fd.map((d, i) => flips.some(f => f.side === 'def' && f.dieIndex === i) ? 6 : d))
      }
    }, 300)
    return () => clearInterval(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, spectatorWindow])

  // Auto-resolve state
  const [autoResult, setAutoResult] = useState<AutoResult | null>(null)
  const [autoAnimIdx, setAutoAnimIdx] = useState(0)
  const [autoTroopsToAdvance, setAutoTroopsToAdvance] = useState(0)

  // Advance troops slider (normal combat capture)
  const [advanceTroops, setAdvanceTroops] = useState(0)

  // Set when an outside click is refused mid-battle, so the refusal is visible
  // rather than the click seeming to do nothing at all.
  const [dismissBlocked, setDismissBlocked] = useState(false)

  // Keep dice count clamped to valid range when troops change
  const safeAtkDice = Math.min(atkDiceCount, maxAtkDice)

  // ── Proceed after all modifiers applied: missile phase or resolution ─────
  function proceedToResolution(fa: number[], fd: number[]) {
    // Public AI rounds skip the interactive missile phase — nobody is at this
    // modal to click it, and stalling here froze the computer's turn the
    // moment either side held a missile.
    //
    // Online, this phase is skipped for a different reason: there is ONE
    // missile step now and it is the window, where the attacker, the defender
    // and every spectator fire into the same round and a contested die is
    // settled by priority. A private phase here would decide dice before the
    // defender had seen them.
    const hasMissiles = !publicAiRounds && !spectatorWindow
      && (attackerMissiles > 0 || defenderMissilesHere > 0)
    if (hasMissiles) {
      // Enter missile phase — players may convert dice to 6s before resolution
      setPendingAtkDice([...fa])
      setPendingDefDice([...fd])
      setAtkConverted(new Set())
      setDefConverted(new Set())
      rollMissileCountRef.current = 0
      setPhase('missile-phase')
    } else {
      // No battle-side missiles: the round is final — offer it to spectators,
      // then resolve. Hotseat and auto-resolve skip straight through.
      windowThenFinish(fa, fd, true)
    }
  }

  // ── Animate and resolve roll ──────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'rolling') return
    resolvedRef.current = false
    maxAtkDiceUsedRef.current = Math.max(maxAtkDiceUsedRef.current, safeAtkDice)

    // Interactive defense provides both rolls (the attacker's early one and
    // the defender's posted one); everything else rolls here as always.
    const provided = providedRollRef.current
    providedRollRef.current = { atk: null, def: null }
    const rawAtk = provided.atk ?? rollN(safeAtkDice, attackerRerollOnes)
    const rawDef = (provided.def ? [...provided.def] : rollN(maxDefDice)).sort((a, b) => b - a)
    // Natural doubles counted before any bonuses (Mutant Unstable Cloning)
    if (hasDoubles(rawDef)) defDoublesRef.current += 1
    roundsFoughtRef.current += 1

    // Build the modifier steps: the raw roll is shown first, then each named
    // modifier changes the dice one at a time (gunshot + gold flash per step).
    // Arrays stay sorted-desc-at-roll; changing the min/max in place matches
    // the resolution math exactly.
    const steps: ModStep[] = []
    let curAtk = [...rawAtk]
    let curDef = [...rawDef]
    const pushStep = (label: string, side: 'atk' | 'def', nextAtk: number[], nextDef: number[]) => {
      const indices = side === 'atk'
        ? nextAtk.map((v, i) => (v !== curAtk[i] ? i : -1)).filter(i => i >= 0)
        : nextDef.map((v, i) => (v !== curDef[i] ? i : -1)).filter(i => i >= 0)
      curAtk = nextAtk
      curDef = nextDef
      // Clamping can make a modifier a visual no-op (e.g. −1 on a 1) — still
      // show the step so the player knows the modifier fired
      steps.push({ label, side, indices, atk: nextAtk, def: nextDef })
    }
    // Bear Trap (defender-ability variant): attacker's lowest die −1
    if (attackerSubtractLowest && curAtk.length > 0) {
      const next = [...curAtk]
      const li = next.length - 1
      next[li] = Math.max(1, next[li] - 1)
      pushStep('🐻 Bear Trap — attacker lowest −1', 'atk', next, curDef)
    }
    // Aggressive comeback power: +1 to every attacker die vs HQ territory
    if (attackerBonusAllDice !== 0) {
      const next = curAtk.map(d => Math.max(1, Math.min(6, d + attackerBonusAllDice)))
      pushStep(`⚔ Aggressive — all attack dice ${attackerBonusAllDice > 0 ? '+' : ''}${attackerBonusAllDice}`, 'atk', next, curDef)
    }
    // Defender die modifiers — one step per named source (Bunker, Ammo Shortage,
    // Fortification, Armored Command…); aggregate fallback for older callers
    const defParts = defenderDieBonusParts ?? (
      defenderDieBonus && (defenderDieBonus.highest !== 0 || defenderDieBonus.lowest !== 0)
        ? [{ label: 'Defense modifiers', highest: defenderDieBonus.highest, lowest: defenderDieBonus.lowest }]
        : []
    )
    // Shared with the engine: the last snapshot equals what `resolveCombat`
    // computes from the summed modifiers, so the animation cannot drift from
    // the maths the battle resolves on.
    const defSnapshots = defenderDieSteps(rawDef, defParts)
    defSnapshots.forEach((snapshot, i) => pushStep(defParts[i].label, 'def', curAtk, snapshot))

    finalAtkRef.current = curAtk
    finalDefRef.current = curDef

    const interval = setInterval(() => {
      setAnimAtk(rollN(safeAtkDice))
      setAnimDef(rollN(maxDefDice))
    }, 90)

    // Rolling phase lasts ~2 tumble cycles of the 3D cube — matched with the
    // defender's screen so the whole table feels one tempo.
    const timeout = setTimeout(() => {
      clearInterval(interval)
      if (steps.length > 0) {
        // Settle on the RAW roll, then animate each modifier into effect
        setAnimAtk(rawAtk)
        setAnimDef(rawDef)
        setModSteps(steps)
        setModStepIdx(-1)
        setFlashInfo(null)
        setPhase('modifiers')
      } else {
        setAnimAtk(curAtk)
        setAnimDef(curDef)
        proceedToResolution(curAtk, curDef)
      }
    }, 2100)

    return () => { clearInterval(interval); clearTimeout(timeout) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // ── Modifier animation: apply one step at a time with a gunshot ──────────
  useEffect(() => {
    if (phase !== 'modifiers') return
    const next = modStepIdx + 1
    if (next >= modSteps.length) {
      // Hold the final values briefly, then continue to missiles/results
      const t = setTimeout(() => {
        setFlashInfo(null)
        proceedToResolution(finalAtkRef.current, finalDefRef.current)
      }, 950)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => {
      const step = modSteps[next]
      playGunshot()
      setAnimAtk(step.atk)
      setAnimDef(step.def)
      setFlashInfo({ side: step.side, indices: new Set(step.indices), label: step.label })
      setModStepIdx(next)
    }, next === 0 ? 850 : 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, modStepIdx, modSteps])

  // ── Auto-resolve animation: step through rounds one by one ───────────────
  useEffect(() => {
    if (phase !== 'auto-animating' || !autoResult) return
    if (autoAnimIdx >= autoResult.rounds.length) {
      setPhase('auto-results')
      return
    }
    const timer = setTimeout(() => setAutoAnimIdx(i => i + 1), autoPlay && autoPlayFast ? 320 : 1260)
    return () => clearTimeout(timer)
  }, [phase, autoAnimIdx, autoResult, autoPlay, autoPlayFast])

  function handleAutoResolve() {
    // Against a human defender, auto-resolve is an OFFER, not a decision —
    // both players must want it. A declined offer forces dice. An AI defender
    // has no opinion to wait for.
    if (interactiveDefense && interactiveDefense.defenderIsHuman && !autoPlay) {
      const c = interactiveDefense.getCombat()
      if (c?.defenderAuto !== true) {
        if (c?.defenderAuto === false) { setManualForced(true); return }
        interactiveDefense.proposeAuto()
        setPhase('awaiting-consent')
        return
      }
    }
    doAutoResolve()
  }

  function doAutoResolve() {
    playDice()
    const mods: CombatModifiers = {
      attackerMaxDiceOverride,
      attackerBonusAllDice,
      attackerSubtractLowest,
      tripleKillEnabled,
      defenderDieBonus,
      // Derived from the named parts so a lone defender die gets every
      // modifier (notably Bear Trap's lowest −1) exactly once.
      defenderDieBonusSingle: defenderDieBonusParts
        ? singleDieBonus(defenderDieBonusParts)
        : defenderDieBonus && singleDieDelta(defenderDieBonus),
      defenderBonusDiceCap,
      nuclearFallout,
      attackerSixesWin,
      attackerRerollOnes,
    }
    // Prefer the authority-owned resolver (its RNG); fall back to a local roll.
    // Either way the outcome is produced by the pure `resolveCombat` and this
    // modal only animates the returned rounds.
    const result = resolveAuto
      ? resolveAuto(atkTroops, defTroops, mods)
      : simulateAutoResolve(atkTroops, defTroops, mods)
    maxAtkDiceUsedRef.current = result.maxAtkDiceUsed
    // Call onDefenseDoubleMax if any round triggered it (shields territory after this battle)
    if (result.rounds.some(r => r.defDoubleMax)) onDefenseDoubleMax?.()
    setAutoResult(result)
    setAutoAnimIdx(0)
    setAutoTroopsToAdvance(result.captured ? Math.max(1, result.atkTroopsAfter - 1) : 0)
    setPhase('auto-animating')
  }

  function handleAutoClose() {
    if (!autoResult) return
    onApplyResult({
      totalAtkLoss: autoResult.totalAtkLoss,
      totalDefLoss: autoResult.totalDefLoss,
      captured: autoResult.captured,
      troopsToAdvance: autoResult.captured ? autoTroopsToAdvance : 0,
      tripleKill: autoResult.rounds.some(r => r.tripleKill),
      atkDiceUsed: autoResult.maxAtkDiceUsed,
      defNaturalDoublesRounds: autoResult.defDoublesRounds,
      roundsFought: autoResult.rounds.length,
      rounds: autoResult.rounds.map(r => ({ atkDice: r.atkDice, defDice: r.defDice, aLoss: r.aLoss, dLoss: r.dLoss })),
    })
    onClose()
  }

  // ── AI autoplay ────────────────────────────────────────────────────────────
  // ONLINE at normal speed the AI fights IN PUBLIC (publicAiRounds, declared
  // with the interactive-defense state above): real rounds through the shared
  // session, so every human watches the same spinning dice. A human defender
  // rolls their own defense (auto idle fallback below); an AI defender's dice
  // post instantly. Fast-forward keeps the old one-shot auto-resolve — the
  // host's pacing lever. Hotseat AI is unchanged (no session exists there).
  useEffect(() => {
    if (!autoPlay) return
    if (publicAiRounds) {
      if (phase === 'setup') {
        const t = setTimeout(() => handleRoll(), 600)
        return () => clearTimeout(t)
      }
      if (phase === 'results') {
        // The same fight-to-the-finish resolveCombat runs internally: press on
        // while a capture is still possible, otherwise close with the result.
        // Paced for a WATCHER: the dice reached them the moment they were
        // rolled, so this gap is the only thing between one round's result and
        // the next round's dice.
        const t = setTimeout(() => {
          if (canContinue) handleAttackAgain()
          else handleClose(captured)
        }, 1000)
        return () => clearTimeout(t)
      }
      return
    }
    if (phase === 'setup') {
      const t = setTimeout(() => handleAutoResolve(), autoPlayFast ? 250 : 1100)
      return () => clearTimeout(t)
    }
    if (phase === 'auto-results') {
      const t = setTimeout(() => handleAutoClose(), autoPlayFast ? 450 : 2000)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, autoPlayFast, phase, publicAiRounds])

  // ── Resolve missile phase → spectator window → results ───────────────────
  // The battle players' own missiles land first; the dice they leave behind
  // are what the spectator window shows.
  function resolveMissilePhase() {
    // Interactive battles: post which dice were missile-converted, so the
    // defender's and spectators' replays show the same unmodifiable 6s.
    if (interactiveDefense && (atkConverted.size > 0 || defConverted.size > 0)) {
      const c = interactiveDefense.getCombat()
      if (c) {
        interactiveDefense.postMissiles(c.round, [
          ...[...atkConverted].map(dieIndex => ({ side: 'atk' as const, dieIndex })),
          ...[...defConverted].map(dieIndex => ({ side: 'def' as const, dieIndex })),
        ])
      }
    }
    windowThenFinish(pendingAtkDice, pendingDefDice, false)
  }

  // ── Pair comparison helper ────────────────────────────────────────────────
  function getPairWinners(): Array<'atk' | 'def'> {
    const pairs = Math.min(atkDice.length, defDice.length)
    return Array.from({ length: pairs }, (_, i) => (pairWonByAttacker(atkDice[i], defDice[i], attackerSixesWin) ? 'atk' : 'def'))
  }

  // ── Berserker Rage: three-of-a-kind attack + at least 1 kill ────────────────
  const isTripleKill = tripleKillEnabled
    && atkDice.length === 3
    && atkDice[0] === atkDice[1] && atkDice[1] === atkDice[2]
    && (roundResult?.dLoss ?? 0) > 0

  // ── Post-roll captured state ──────────────────────────────────────────────
  const captured = isTripleKill || defTroops - (roundResult?.dLoss ?? 0) <= 0
  const atkTroopsAfter = atkTroops - (roundResult?.aLoss ?? 0)
  const defTroopsAfter = Math.max(0, defTroops - (roundResult?.dLoss ?? 0))
  const canContinue = !captured && atkTroopsAfter > 1 && defTroopsAfter > 0

  function handleRoll() {
    playDice()
    setRoundResult(null)
    setAtkDice([])
    setDefDice([])
    // Against a human defender the attacker rolls NOW — their dice post to
    // the shared session immediately — and the round resolves whenever the
    // defense lands. Nobody's roll waits on anybody's click. An AI defender's
    // dice are thrown right here, posted so spectators watch the same battle.
    // Public AI rounds route through here too — the session is the show.
    if (interactiveDefense) {
      const c = interactiveDefense.getCombat()
      const myAtk = rollN(safeAtkDice, attackerRerollOnes)
      providedRollRef.current.atk = myAtk
      if (c && !c.atkDice) interactiveDefense.postDice(c.round, 'atk', myAtk)
      setAnimAtk(myAtk)
      if (!interactiveDefense.defenderIsHuman) {
        const aiDef = rollN(maxDefDice)
        if (c && !c.defDice) interactiveDefense.postDice(c.round, 'def', aiDef, 'ai')
        providedRollRef.current.def = aiDef
        setAnimDef(aiDef)
        setPhase('rolling')
        return
      }
      const def = interactiveDefense.getCombat()?.defDice ?? null
      if (def) {
        providedRollRef.current.def = [...def]
        setAnimDef(def)
        setPhase('rolling')
      } else {
        setDefenseWaitSeconds(0)
        setAnimDef([])
        setPhase('waiting-defense')
      }
      return
    }
    setAnimAtk(rollN(safeAtkDice))
    setAnimDef(rollN(maxDefDice))
    setPhase('rolling')
  }

  function handleAttackAgain() {
    setRoundResult(null)
    handleRoll()
  }

  // Initialize advance slider when capture is detected
  useEffect(() => {
    if (phase === 'results' && captured) {
      const max = Math.max(1, atkTroopsAfter - 1)
      setAdvanceTroops(max)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, captured])

  function handleClose(advance: boolean) {
    const totalAtkLoss = cumulAtkLoss
    const isCaptured = isTripleKill || defTroops <= 0
    const totalDefLoss = isTripleKill ? defTroops : cumulDefLoss
    const troopsToAdvance = advance && isCaptured ? advanceTroops : 0
    onApplyResult({
      totalAtkLoss,
      totalDefLoss,
      captured: isCaptured,
      troopsToAdvance,
      tripleKill: isTripleKill,
      atkDiceUsed: maxAtkDiceUsedRef.current,
      atkMissileUsed: mslAtkUsed,
      defMissileUsed: mslDefUsed,
      defNaturalDoublesRounds: defDoublesRef.current,
      roundsFought: roundsFoughtRef.current,
      rounds: roundHistoryRef.current,
    })
    onClose()
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  const pairWinners = phase === 'results' ? getPairWinners() : []

  // Build badge list for setup-phase indicators
  const defBadges: string[] = []
  if (defenderDieBonus) {
    if (defenderDieBonus.highest > 0) defBadges.push(`+${defenderDieBonus.highest} hi`)
    if (defenderDieBonus.lowest > 0) defBadges.push(`+${defenderDieBonus.lowest} lo`)
    if (defenderDieBonus.highest < 0) defBadges.push(`${defenderDieBonus.highest} hi`)
    if (defenderDieBonus.lowest < 0) defBadges.push(`${defenderDieBonus.lowest} lo`)
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(5,2,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
        fontFamily: 'Georgia, serif',
      }}
      // Dismissing by clicking outside is only safe BEFORE anything is rolled.
      // Once dice are thrown the losses live in this component (cumulAtkLoss /
      // cumulDefLoss) and ONLY handleClose hands them to the board — so an
      // outside click used to throw away a fought battle and leave the
      // territory looking untouched. A battle in progress can only be ended
      // through the buttons that actually report the result.
      onClick={e => {
        if (e.target !== e.currentTarget) return
        if (phase === 'setup' && roundsFoughtRef.current === 0) { onClose(); return }
        setDismissBlocked(true)
        setTimeout(() => setDismissBlocked(false), 2200)
      }}
    >
      <div
        style={{
          background: 'linear-gradient(155deg, #2C1A08 0%, #160C02 100%)',
          border: '2px solid rgba(200,148,10,0.65)',
          borderRadius: 14,
          padding: '28px 30px 24px',
          width: 480,
          maxWidth: '92vw',
          color: '#E8DCC8',
          boxShadow: '0 12px 50px rgba(0,0,0,0.85)',
        }}
      >
        {/* ── Header ── */}
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 22, fontWeight: 'bold', color: '#C8940A', letterSpacing: 1.5 }}>
            ⚔ BATTLE
          </div>
          <div style={{ fontSize: 13, color: '#b09870', marginTop: 5 }}>
            <span style={{ color: '#e74c3c', fontWeight: 'bold' }}>{attacker.name}</span>
            <span style={{ color: '#7a6a50' }}> attacks </span>
            <span style={{ color: '#7fb3d3', fontWeight: 'bold' }}>{defender.name}</span>
          </div>
          <div style={{ fontSize: 11, color: '#6a5a40', marginTop: 2 }}>
            {attackerPlayer.name} vs {defenderPlayer ? defenderPlayer.name : 'neutral'}
          </div>
          {/* Active modifiers summary */}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', marginTop: 8 }}>
            {hasEntryCost && (
              <span style={{ fontSize: 10, color: '#e8a838', background: 'rgba(232,168,56,0.13)', border: '1px solid rgba(232,168,56,0.45)', borderRadius: 4, padding: '2px 7px' }}>
                🏙 Capture cost{entryCost!.total > 0 ? ` −${entryCost!.total} troop${entryCost!.total !== 1 ? 's' : ''}` : ''} on entry
                {entryCost!.parts.length > 0 ? ` (${entryCost!.parts.join(', ')})` : ''}
              </span>
            )}
            {empActive && (
              <span style={{ fontSize: 10, color: '#a06a2a', background: 'rgba(160,106,42,0.15)', border: '1px solid rgba(160,106,42,0.50)', borderRadius: 4, padding: '2px 7px' }}>
                ⚡ EMP — dice cannot be modified this turn
              </span>
            )}
            {nuclearFallout && (
              <span style={{ fontSize: 10, color: '#F1C40F', background: 'rgba(241,196,15,0.15)', border: '1px solid rgba(241,196,15,0.40)', borderRadius: 4, padding: '2px 7px' }}>
                ☢ Nuclear Fallout +1 loss each
              </span>
            )}
            {attackerMaxDiceOverride && (
              <span style={{ fontSize: 10, color: '#E67E22', background: 'rgba(230,126,34,0.15)', border: '1px solid rgba(230,126,34,0.40)', borderRadius: 4, padding: '2px 7px' }}>
                ⚠ Wasteland Scar — max {attackerMaxDiceOverride} atk dice
              </span>
            )}
            {attackerMissiles > 0 && (
              <span style={{ fontSize: 10, color: '#3498DB', background: 'rgba(52,152,219,0.15)', border: '1px solid rgba(52,152,219,0.40)', borderRadius: 4, padding: '2px 7px' }}>
                🚀 Attacker has {attackerMissiles} missile{attackerMissiles !== 1 ? 's' : ''}
              </span>
            )}
            {defenderMissiles > 0 && (
              <span style={{ fontSize: 10, color: '#9B59B6', background: 'rgba(155,89,182,0.15)', border: '1px solid rgba(155,89,182,0.40)', borderRadius: 4, padding: '2px 7px' }}>
                🚀 Defender has {defenderMissiles} missile{defenderMissiles !== 1 ? 's' : ''}
                {defenderMissilesHere === 0 && ' — theirs to spend'}
              </span>
            )}
          </div>
        </div>

        {/* Why an outside click did nothing — see the backdrop handler above. */}
        {dismissBlocked && (
          <div style={{
            marginBottom: 14, padding: '8px 12px', borderRadius: 7,
            background: 'rgba(231,76,60,0.12)', border: '1px solid rgba(231,76,60,0.45)',
            color: '#e8a090', fontSize: 11.5, textAlign: 'center', lineHeight: 1.45,
          }}>
            This battle has already been fought — troops have been lost. Finish it
            with the buttons below so the result is recorded.
          </div>
        )}

        {/* ── Troop counts ── */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <TroopBadge label="ATTACKER" troops={atkTroops} color={ATK_COLOR} />
          <div style={{ color: '#C8940A', fontSize: 18, alignSelf: 'center', fontWeight: 'bold' }}>vs</div>
          <TroopBadge label="DEFENDER" troops={defTroops} color={DEF_COLOR} />
        </div>

        {/* ── Setup phase ── */}
        {phase === 'setup' && (
          <>
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, color: '#a09070', marginBottom: 10, letterSpacing: 1 }}>
                SELECT ATTACKING DICE {attackerMaxDiceOverride ? `(MAX ${attackerMaxDiceOverride})` : ''}
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                {Array.from({ length: maxAtkDice }, (_, i) => i + 1).map(n => (
                  <button
                    key={n}
                    onClick={() => setAtkDiceCount(n)}
                    style={{
                      width: 44, height: 44, borderRadius: 8,
                      border: safeAtkDice === n
                        ? '2px solid #C8940A'
                        : '1px solid rgba(200,148,10,0.25)',
                      background: safeAtkDice === n
                        ? 'rgba(200,148,10,0.22)'
                        : 'rgba(255,255,255,0.04)',
                      color: safeAtkDice === n ? '#C8940A' : '#7a6a50',
                      fontSize: 17, fontWeight: 'bold', cursor: 'pointer',
                      fontFamily: 'Georgia, serif',
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>

              <div style={{ fontSize: 11, color: '#7fb3d3', marginBottom: 6, letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                DEFENDER ROLLS {maxDefDice} {maxDefDice === 1 ? 'DIE' : 'DICE'} (AUTO)
                {defBadges.length > 0 && (
                  <span style={{ fontSize: 10, color: '#C8940A', background: 'rgba(200,148,10,0.15)', border: '1px solid rgba(200,148,10,0.40)', borderRadius: 4, padding: '1px 6px', letterSpacing: 0.5 }}>
                    ♛ {defBadges.join(' / ')}
                  </span>
                )}
                {!defenderDieBonus && defenderBonusDiceCap > 0 && (
                  <span style={{ fontSize: 10, color: '#C8940A', background: 'rgba(200,148,10,0.15)', border: '1px solid rgba(200,148,10,0.40)', borderRadius: 4, padding: '1px 6px', letterSpacing: 0.5 }}>
                    ♛ +{defenderBonusDiceCap} dice cap
                  </span>
                )}
                {attackerSubtractLowest && (
                  <span style={{ fontSize: 10, color: '#8E44AD', background: 'rgba(142,68,173,0.15)', border: '1px solid rgba(142,68,173,0.40)', borderRadius: 4, padding: '1px 6px', letterSpacing: 0.5 }}>
                    🐻 Bear Trap −1 lowest
                  </span>
                )}
                {attackerBonusAllDice > 0 && (
                  <span style={{ fontSize: 10, color: '#3498DB', background: 'rgba(41,128,185,0.15)', border: '1px solid rgba(41,128,185,0.40)', borderRadius: 4, padding: '1px 6px', letterSpacing: 0.5 }}>
                    ⚔️ Aggressive +{attackerBonusAllDice} all dice
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {Array.from({ length: maxDefDice }, (_, i) => (
                  <div
                    key={i}
                    style={{
                      width: 44, height: 44, borderRadius: 8,
                      border: '1.5px solid rgba(41,128,185,0.40)',
                      background: 'rgba(41,128,185,0.10)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#4a90c0', fontSize: 20, fontWeight: 'bold',
                    }}
                  >?</div>
                ))}
              </div>
            </div>

            {/* EMP missile power activation (before any dice are rolled) */}
            {!empActive && (attackerCanEmp || defenderCanEmp) && (
              <div style={{
                display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14,
                padding: '8px 12px', borderRadius: 8,
                background: 'rgba(160,106,42,0.08)', border: '1px solid rgba(160,106,42,0.35)',
              }}>
                <span style={{ fontSize: 10, color: '#a06a2a', flex: 1, lineHeight: 1.4 }}>
                  ⚡ <strong>EMP</strong> — discard a missile: combat dice in this territory
                  can't be modified for the rest of the turn
                </span>
                {attackerCanEmp && (
                  <button
                    onClick={() => onActivateEmp?.('attacker')}
                    style={{
                      padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 'bold',
                      border: '1.5px solid rgba(160,106,42,0.60)', background: 'rgba(160,106,42,0.16)',
                      color: '#d0a060', cursor: 'pointer', fontFamily: 'Georgia, serif', whiteSpace: 'nowrap',
                    }}
                  >
                    ⚡ Attacker EMP
                  </button>
                )}
                {defenderCanEmp && (
                  <button
                    onClick={() => onActivateEmp?.('defender')}
                    style={{
                      padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 'bold',
                      border: '1.5px solid rgba(160,106,42,0.60)', background: 'rgba(160,106,42,0.16)',
                      color: '#d0a060', cursor: 'pointer', fontFamily: 'Georgia, serif', whiteSpace: 'nowrap',
                    }}
                  >
                    ⚡ Defender EMP
                  </button>
                )}
              </div>
            )}

            {manualForced && (
              <div style={{ fontSize: 11, color: '#F1C40F', textAlign: 'center', marginBottom: 8 }}>
                🎲 {interactiveDefense?.defenderName ?? 'The defender'} wants to roll — this battle is fought with dice.
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={onClose} style={btnStyle('ghost')}>Cancel</button>
              {!manualForced && (
                <button onClick={handleAutoResolve} style={btnStyle('secondary')}>⚡ Auto Resolve</button>
              )}
              <button onClick={handleRoll} style={btnStyle('primary')}>⚔ Roll Dice</button>
            </div>
          </>
        )}

        {/* ── Auto-resolve: animation and results ── */}
        {(phase === 'auto-animating' || phase === 'auto-results') && autoResult && (() => {
          const displayRound = phase === 'auto-animating'
            ? autoResult.rounds[Math.max(0, autoAnimIdx - 1)]
            : autoResult.rounds[autoResult.rounds.length - 1]
          const roundNum = phase === 'auto-animating' ? Math.max(1, autoAnimIdx) : autoResult.rounds.length

          return (
            <>
              {/* Round counter */}
              <div style={{ textAlign: 'center', marginBottom: 10 }}>
                {phase === 'auto-animating' ? (
                  <div style={{ fontSize: 11, color: '#C8940A', letterSpacing: 2 }}>
                    ROUND {roundNum} / {autoResult.rounds.length}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: '#7a6a50', letterSpacing: 2 }}>
                    {autoResult.rounds.length} ROUND{autoResult.rounds.length !== 1 ? 'S' : ''} FOUGHT
                  </div>
                )}
              </div>

              {/* Dice display for current/final round */}
              {displayRound && (
                <div style={{ display: 'flex', gap: 20, justifyContent: 'center', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: ATK_COLOR, letterSpacing: 1.5, marginBottom: 8 }}>ATTACKER</div>
                    <div style={{ display: 'flex', gap: 7, justifyContent: 'center' }}>
                      {displayRound.atkDice.map((v, i) => {
                        const pairs = Math.min(displayRound.atkDice.length, displayRound.defDice.length)
                        const won = i < pairs && pairWonByAttacker(displayRound.atkDice[i], displayRound.defDice[i], attackerSixesWin)
                        const lost = i < pairs && !pairWonByAttacker(displayRound.atkDice[i], displayRound.defDice[i], attackerSixesWin)
                        return (
                          <DieFace key={i} value={v} borderColor={ATK_COLOR} size={48}
                            glow={won && phase === 'auto-results' ? WIN_GLOW : undefined}
                            dim={lost && phase === 'auto-results'}
                          />
                        )
                      })}
                    </div>
                  </div>
                  <div style={{ color: '#6a5a40', fontSize: 22, alignSelf: 'center', paddingTop: 22 }}>│</div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: DEF_COLOR, letterSpacing: 1.5, marginBottom: 8 }}>DEFENDER</div>
                    <div style={{ display: 'flex', gap: 7, justifyContent: 'center' }}>
                      {displayRound.defDice.map((v, i) => {
                        const pairs = Math.min(displayRound.atkDice.length, displayRound.defDice.length)
                        const won = i < pairs && !pairWonByAttacker(displayRound.atkDice[i], displayRound.defDice[i], attackerSixesWin)
                        const lost = i < pairs && pairWonByAttacker(displayRound.atkDice[i], displayRound.defDice[i], attackerSixesWin)
                        return (
                          <DieFace key={i} value={v} borderColor={DEF_COLOR} size={48}
                            glow={won && phase === 'auto-results' ? '#2980b9' : undefined}
                            dim={lost && phase === 'auto-results'}
                          />
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Animating: skip button */}
              {phase === 'auto-animating' && (
                <div style={{ textAlign: 'center', marginBottom: 10 }}>
                  <button
                    onClick={() => { setAutoAnimIdx(autoResult.rounds.length); setPhase('auto-results') }}
                    style={{ padding: '4px 16px', borderRadius: 5, fontSize: 11, border: '1px solid rgba(200,148,10,0.35)', background: 'transparent', color: '#7a6a50', cursor: 'pointer', fontFamily: 'Georgia, serif' }}
                  >
                    Skip →
                  </button>
                </div>
              )}

              {/* Results summary */}
              {phase === 'auto-results' && (
                <>
                  <div style={{ background: 'rgba(0,0,0,0.28)', borderRadius: 8, padding: '12px 16px', marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 10 }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 22, fontWeight: 'bold', color: ATK_COLOR }}>−{autoResult.totalAtkLoss}</div>
                        <div style={{ fontSize: 10, color: '#7a5040', letterSpacing: 1 }}>ATK LOSSES</div>
                        <div style={{ fontSize: 13, color: '#E8DCC8', marginTop: 3 }}>{autoResult.atkTroopsAfter} left</div>
                      </div>
                      <div style={{ width: 1, background: 'rgba(200,148,10,0.20)' }} />
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 22, fontWeight: 'bold', color: DEF_COLOR }}>−{autoResult.totalDefLoss}</div>
                        <div style={{ fontSize: 10, color: '#405a7a', letterSpacing: 1 }}>DEF LOSSES</div>
                        <div style={{ fontSize: 13, color: '#E8DCC8', marginTop: 3 }}>{autoResult.defTroopsAfter} left</div>
                      </div>
                    </div>
                    {nuclearFallout && (
                      <div style={{ fontSize: 10, color: '#F1C40F', textAlign: 'center', borderTop: '1px solid rgba(241,196,15,0.20)', paddingTop: 6 }}>
                        ☢ Nuclear Fallout applied each round
                      </div>
                    )}
                  </div>

                  {autoResult.captured ? (
                    <div style={{ background: 'rgba(39,174,96,0.15)', border: '1px solid rgba(39,174,96,0.50)', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
                      <div style={{ fontSize: 16, fontWeight: 'bold', color: '#2ecc71', textAlign: 'center', marginBottom: 10 }}>
                        {autoResult.rounds.some(r => r.tripleKill) ? '💀 Berserker Rage — Army Eliminated!' : '⚑ Territory Captured!'}
                      </div>
                      {autoResult.atkTroopsAfter > 1 && (
                        <>
                          <div style={{ fontSize: 11, color: '#7a9a7a', marginBottom: 8, textAlign: 'center' }}>
                            Advance troops into {defender.name}
                          </div>
                          {(() => {
                            const maxAdv = Math.max(1, autoResult.atkTroopsAfter - 1)
                            // Whichever floor is higher: the dice-used rule, or
                            // enough to pay the entry cost — capped by what is
                            // actually available to move.
                            const minAdv = Math.min(maxAdv, Math.max(Math.min(autoResult.maxAtkDiceUsed, maxAdv), minAdvance))
                            return (
                              <>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <span style={{ fontSize: 11, color: '#6a8060', whiteSpace: 'nowrap' }}>{minAdv}</span>
                                  <input
                                    type="range"
                                    min={minAdv}
                                    max={maxAdv}
                                    value={autoTroopsToAdvance}
                                    onChange={e => setAutoTroopsToAdvance(Number(e.target.value))}
                                    style={{ flex: 1, accentColor: '#2ecc71' }}
                                  />
                                  <span style={{ fontSize: 11, color: '#6a8060', whiteSpace: 'nowrap' }}>{maxAdv}</span>
                                </div>
                                {minAdv > 1 && (
                                  <div style={{ textAlign: 'center', fontSize: 10, color: 'rgba(200,148,10,0.7)', marginTop: 4 }}>
                                    Minimum {minAdv} — must match dice rolled
                                  </div>
                                )}
                              </>
                            )
                          })()}
                          <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 'bold', color: '#2ecc71', marginTop: 6 }}>
                            {autoTroopsToAdvance} troop{autoTroopsToAdvance !== 1 ? 's' : ''} advancing
                          </div>
                          {hasEntryCost && (
                            <div style={{ textAlign: 'center', fontSize: 11, color: '#e8a838', marginTop: 3 }}>
                              🏙 {arriveAfterEntry(autoTroopsToAdvance)} will survive entry ({entryCost!.parts.join(', ')})
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    <div style={{ background: 'rgba(41,128,185,0.12)', border: '1px solid rgba(41,128,185,0.40)', borderRadius: 8, padding: '10px', textAlign: 'center', marginBottom: 14 }}>
                      <div style={{ fontSize: 15, fontWeight: 'bold', color: '#7fb3d3' }}>⛊ Defense Held</div>
                      <div style={{ fontSize: 11, color: '#4a6a8a', marginTop: 4 }}>{defender.name} was not captured</div>
                    </div>
                  )}

                  <button onClick={handleAutoClose} style={btnStyle(autoResult.captured ? 'capture' : 'primary')}>
                    {autoResult.captured ? '⚑ Confirm Advance' : 'Confirm Retreat'}
                  </button>
                </>
              )}
            </>
          )
        })()}

        {/* ── Awaiting the defender's consent to auto-resolve ── */}
        {phase === 'awaiting-consent' && (
          <div style={{ textAlign: 'center', margin: '18px 0' }}>
            <div style={{ fontSize: 14, color: '#F1C40F', fontWeight: 'bold', letterSpacing: 1, marginBottom: 8 }}>
              ⏳ AUTO-RESOLVE OFFERED
            </div>
            <div style={{ fontSize: 12, color: '#a09070', marginBottom: 14 }}>
              Waiting for {interactiveDefense?.defenderName ?? 'the defender'} to accept — declining means dice.
            </div>
            <button onClick={() => setPhase('setup')} style={btnStyle('secondary')}>
              Never mind — roll dice instead
            </button>
          </div>
        )}

        {/* ── Rolling / Modifiers / Missile-phase / Spectator-window / Results ── */}
        {(phase === 'waiting-defense' || phase === 'rolling' || phase === 'modifiers' || phase === 'missile-phase' || phase === 'spectator-window' || phase === 'results') && (
          <>
            {/* Dice arena */}
            <div
              style={{
                display: 'flex', gap: 20, justifyContent: 'center',
                alignItems: 'flex-start', marginBottom: 18,
              }}
            >
              {/* Attacker dice */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#e74c3c', letterSpacing: 1.5, marginBottom: 8 }}>
                  ATTACKER
                </div>
                <div style={{ display: 'flex', gap: 7, justifyContent: 'center' }}>
                  {(phase === 'rolling' || phase === 'modifiers' || phase === 'waiting-defense' ? animAtk : phase === 'missile-phase' ? pendingAtkDice : atkDice).map((v, i) => {
                    const won  = phase === 'results' && i < pairWinners.length && pairWinners[i] === 'atk'
                    const lost = phase === 'results' && i < pairWinners.length && pairWinners[i] === 'def'
                    const modFlash = phase === 'modifiers' && flashInfo?.side === 'atk' && flashInfo.indices.has(i)
                    // Two ways a die of ours becomes a 6: the hotseat missile
                    // phase, and the shared window online. Both are a click on
                    // THIS die — there is no second row of the same dice.
                    const windowTaken = windowFlips.some(f => f.side === 'atk' && f.dieIndex === i)
                    const canClickPhase = phase === 'missile-phase' && attackerMissiles > 0 && !atkConverted.has(i)
                    const canClickWindow = phase === 'spectator-window' && attackerMissiles > 0
                      && !windowTaken && !windowFiring && !!spectatorWindow
                    const canClick = canClickPhase || canClickWindow
                    return (
                      <DieFace
                        key={i}
                        dataDie={dieKey('atk', i)}
                        value={windowTaken ? 6 : v}
                        borderColor={ATK_COLOR}
                        spinning={phase === 'rolling'}
                        glow={won ? WIN_GLOW : (modFlash || windowTaken) ? '#F1C40F' : undefined}
                        dim={lost}
                        clickable={canClick}
                        onClick={!canClick ? undefined : canClickWindow ? () => {
                          setWindowFiring(true)
                          void spectatorWindow!.fire('atk', i).finally(() => setWindowFiring(false))
                        } : () => {
                          const next = [...pendingAtkDice]
                          next[i] = 6
                          setPendingAtkDice(next)
                          setAtkConverted(prev => new Set(prev).add(i))
                          setMslAtkUsed(true)
                          onAttackerUsedMissile?.()
                          rollMissileCountRef.current += 1
                          onMissilePlaced?.('attacker', rollMissileCountRef.current)
                        }}
                      />
                    )
                  })}
                </div>
                {phase === 'missile-phase' && attackerMissiles > 0 && atkConverted.size < pendingAtkDice.length && (
                  <div style={{ fontSize: 10, color: '#F1C40F', marginTop: 6 }}>
                    🚀 Click a die to set it to 6 ({attackerMissiles} left)
                  </div>
                )}
                {phase === 'missile-phase' && atkConverted.size > 0 && (
                  <div style={{ fontSize: 10, color: '#2ecc71', marginTop: 6 }}>
                    ✓ {atkConverted.size} missile{atkConverted.size !== 1 ? 's' : ''} used
                  </div>
                )}
              </div>

              <div style={{ color: '#6a5a40', fontSize: 22, alignSelf: 'center', paddingTop: 22 }}>│</div>

              {/* Defender dice */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#7fb3d3', letterSpacing: 1.5, marginBottom: 8 }}>
                  DEFENDER
                </div>
                <div style={{ display: 'flex', gap: 7, justifyContent: 'center' }}>
                  {(phase === 'rolling' || phase === 'modifiers' || phase === 'waiting-defense' ? animDef : phase === 'missile-phase' ? pendingDefDice : defDice).map((v, i) => {
                    const won  = phase === 'results' && i < pairWinners.length && pairWinners[i] === 'def'
                    const lost = phase === 'results' && i < pairWinners.length && pairWinners[i] === 'atk'
                    const modFlash = phase === 'modifiers' && flashInfo?.side === 'def' && flashInfo.indices.has(i)
                    const canClick = phase === 'missile-phase' && defenderMissilesHere > 0 && !defConverted.has(i)
                    return (
                      <DieFace
                        key={i}
                        dataDie={dieKey('def', i)}
                        value={v}
                        borderColor={DEF_COLOR}
                        spinning={phase === 'rolling'}
                        glow={won ? '#2980b9' : modFlash ? '#F1C40F' : undefined}
                        dim={lost}
                        clickable={canClick}
                        onClick={canClick ? () => {
                          const next = [...pendingDefDice]
                          next[i] = 6
                          setPendingDefDice(next)
                          setDefConverted(prev => new Set(prev).add(i))
                          setMslDefUsed(true)
                          onDefenderUsedMissile?.()
                          rollMissileCountRef.current += 1
                          onMissilePlaced?.('defender', rollMissileCountRef.current)
                        } : undefined}
                      />
                    )
                  })}
                </div>
                {phase === 'missile-phase' && defenderMissilesHere > 0 && defConverted.size < pendingDefDice.length && (
                  <div style={{ fontSize: 10, color: '#F1C40F', marginTop: 6 }}>
                    🚀 Click a die to set it to 6 ({defenderMissilesHere} left)
                  </div>
                )}
                {phase === 'missile-phase' && defConverted.size > 0 && (
                  <div style={{ fontSize: 10, color: '#2ecc71', marginTop: 6 }}>
                    ✓ {defConverted.size} missile{defConverted.size !== 1 ? 's' : ''} used
                  </div>
                )}
              </div>
            </div>

            {phase === 'rolling' && (
              <div style={{ textAlign: 'center', color: '#7a6a50', fontSize: 13, letterSpacing: 3, marginBottom: 4 }}>
                Rolling…
              </div>
            )}

            {/* ── Modifier animation banner ── */}
            {phase === 'modifiers' && (
              <div style={{ textAlign: 'center', marginBottom: 10, minHeight: 30 }}>
                {flashInfo ? (
                  <div style={{
                    display: 'inline-block', padding: '5px 16px', borderRadius: 6,
                    background: 'rgba(241,196,15,0.14)', border: '1px solid rgba(241,196,15,0.55)',
                    color: '#F1C40F', fontSize: 12, fontWeight: 'bold', letterSpacing: 1,
                    boxShadow: '0 0 12px rgba(241,196,15,0.25)',
                  }}>
                    💥 {flashInfo.label}
                  </div>
                ) : (
                  <div style={{ color: '#7a6a50', fontSize: 12, letterSpacing: 2 }}>
                    Applying modifiers…
                  </div>
                )}
              </div>
            )}

            {/* ── Missile phase UI ── */}
            {phase === 'missile-phase' && (
              <div style={{ textAlign: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: '#F1C40F', fontWeight: 'bold', marginBottom: 8, letterSpacing: 1 }}>
                  🚀 MISSILE PHASE
                </div>
                <div style={{ fontSize: 11, color: '#a09070', marginBottom: 14 }}>
                  Players with missiles may click their dice to convert them to unmodifiable 6s —
                  one missile per die, as many as you can pay for.
                </div>
                <button onClick={resolveMissilePhase} style={btnStyle('primary')}>
                  ⚔ Resolve Battle
                </button>
              </div>
            )}

            {/* ── Waiting for the defender's own dice ── */}
            {phase === 'waiting-defense' && (
              <div style={{ textAlign: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: '#7fb3d3', fontWeight: 'bold', letterSpacing: 1, marginBottom: 6 }}>
                  🎲 YOUR DICE ARE IN — {interactiveDefense?.defenderName ?? 'the defender'} rolls the defense
                </div>
                <div style={{ fontSize: 11, color: '#a09070', marginBottom: 8 }}>
                  waiting {defenseWaitSeconds}s…
                </div>
                {defenseWaitSeconds >= 20 && (
                  <button
                    onClick={() => {
                      const c = interactiveDefense?.getCombat()
                      if (!c || c.defDice) return
                      // Marked in the session as an idle roll — honest at the table.
                      interactiveDefense!.postDice(c.round, 'def', rollN(maxDefDice), 'attacker-idle')
                    }}
                    style={btnStyle('secondary')}
                  >
                    🎲 Defender idle — roll for them
                  </button>
                )}
              </div>
            )}

            {/* ── The missile window: everyone fires into this one ── */}
            {phase === 'spectator-window' && (
              <div style={{ textAlign: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: '#F1C40F', fontWeight: 'bold', marginBottom: 6, letterSpacing: 1 }}>
                  🚀 MISSILE WINDOW — {windowSecondsLeft}s
                </div>
                <div style={{ fontSize: 11, color: '#a09070', marginBottom: 8 }}>
                  {attackerMissiles > 0
                    ? 'Click one of your own dice above to force it to a 6. The defender and the watching table may answer — every missile buys everyone another 7 seconds.'
                    : 'The defender and the watching table may fire a missile at one die. Every missile buys another 7 seconds.'}
                </div>
                {windowFlips.map((f, i) => (
                  <div key={i} style={{ fontSize: 11, color: '#2ecc71', marginBottom: 4 }}>
                    🚀 {f.playerName} turned {f.side === 'atk' ? "an attacker's" : "a defender's"} die into a 6
                  </div>
                ))}
                <button onClick={() => { void endSpectatorWindow() }} style={btnStyle('secondary')}>
                  Resolve battle ▸
                </button>
              </div>
            )}

            {phase === 'results' && roundResult && (
              <>
                {/* Pair-by-pair breakdown */}
                <div
                  style={{
                    background: 'rgba(0,0,0,0.25)',
                    borderRadius: 8, padding: '10px 14px',
                    marginBottom: 14,
                  }}
                >
                  {pairWinners.map((winner, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex', alignItems: 'center',
                        gap: 10, fontSize: 12,
                        marginBottom: i < pairWinners.length - 1 ? 7 : 0,
                      }}
                    >
                      <span style={{ color: ATK_COLOR, fontWeight: 'bold', width: 14, textAlign: 'center' }}>
                        {atkDice[i]}
                      </span>
                      <span style={{ color: winner === 'atk' ? '#2ecc71' : '#c0392b', fontSize: 13, minWidth: 16, textAlign: 'center' }}>
                        {winner === 'atk' ? '>' : '≤'}
                      </span>
                      <span style={{ color: DEF_COLOR, fontWeight: 'bold', width: 14, textAlign: 'center' }}>
                        {defDice[i]}
                      </span>
                      <span style={{ color: winner === 'atk' ? '#2ecc71' : '#c0392b', fontSize: 11, marginLeft: 4 }}>
                        {winner === 'atk' ? '→ Defender −1 troop' : '→ Attacker −1 troop'}
                      </span>
                    </div>
                  ))}
                  {nuclearFallout && (
                    <div style={{ fontSize: 11, color: '#F1C40F', marginTop: 8, borderTop: '1px solid rgba(241,196,15,0.25)', paddingTop: 6 }}>
                      ☢ Nuclear Fallout — +1 troop loss each side
                    </div>
                  )}
                </div>

                {/* Outcome banner */}
                {captured ? (
                  <div
                    style={{
                      background: isTripleKill ? 'rgba(192,57,43,0.20)' : 'rgba(39,174,96,0.18)',
                      border: `1px solid ${isTripleKill ? 'rgba(192,57,43,0.60)' : 'rgba(39,174,96,0.55)'}`,
                      borderRadius: 8, padding: '12px', textAlign: 'center',
                      marginBottom: 14,
                    }}
                  >
                    {isTripleKill && (
                      <div style={{ fontSize: 11, color: '#e08070', letterSpacing: 1, marginBottom: 4 }}>
                        ★ BERSERKER RAGE — THREE OF A KIND
                      </div>
                    )}
                    <div style={{ fontSize: 17, fontWeight: 'bold', color: isTripleKill ? '#e74c3c' : '#2ecc71' }}>
                      {isTripleKill ? '💀 Army Eliminated!' : '⚑ Territory Captured!'}
                    </div>
                    <div style={{ fontSize: 11, color: isTripleKill ? '#a07070' : '#7a9a7a', marginTop: 4 }}>
                      {attacker.name} now controls {defender.name}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      background: 'rgba(0,0,0,0.20)',
                      border: '1px solid rgba(200,148,10,0.2)',
                      borderRadius: 8, padding: '10px', textAlign: 'center',
                      marginBottom: 14, fontSize: 12, color: '#b09870',
                    }}
                  >
                    {roundResult.aLoss > 0 && (
                      <span style={{ color: '#e74c3c' }}>
                        Attacker −{roundResult.aLoss}
                      </span>
                    )}
                    {roundResult.aLoss > 0 && roundResult.dLoss > 0 && (
                      <span style={{ color: '#6a5a40' }}> &nbsp;·&nbsp; </span>
                    )}
                    {roundResult.dLoss > 0 && (
                      <span style={{ color: '#7fb3d3' }}>
                        Defender −{roundResult.dLoss}
                      </span>
                    )}
                    <div style={{ fontSize: 10, color: '#5a4a30', marginTop: 5 }}>
                      Remaining — Attacker: {atkTroopsAfter} &nbsp;·&nbsp; Defender: {defTroopsAfter}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                {captured ? (
                  <div style={{ background: 'rgba(39,174,96,0.12)', border: '1px solid rgba(39,174,96,0.40)', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ fontSize: 13, fontWeight: 'bold', color: '#2ecc71', textAlign: 'center', marginBottom: 8 }}>
                      ⚑ Advance Troops
                    </div>
                    {atkTroopsAfter > 1 && (() => {
                      const maxAdv = Math.max(1, atkTroopsAfter - 1)
                      // Whichever floor is higher: the dice-used rule, or enough
                      // to pay the entry cost — capped by what is available.
                      const minAdv = Math.min(maxAdv, Math.max(Math.min(maxAtkDiceUsedRef.current, maxAdv), minAdvance))
                      return (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                            <span style={{ fontSize: 11, color: '#6a8060', whiteSpace: 'nowrap' }}>{minAdv}</span>
                            <input
                              type="range"
                              min={minAdv}
                              max={maxAdv}
                              value={advanceTroops}
                              onChange={e => setAdvanceTroops(Number(e.target.value))}
                              style={{ flex: 1, accentColor: '#2ecc71' }}
                            />
                            <span style={{ fontSize: 11, color: '#6a8060', whiteSpace: 'nowrap' }}>{maxAdv}</span>
                          </div>
                          <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 'bold', color: '#2ecc71', marginBottom: hasEntryCost ? 2 : 8 }}>
                            {advanceTroops} troop{advanceTroops !== 1 ? 's' : ''} advancing
                          </div>
                          {hasEntryCost && (
                            <div style={{ textAlign: 'center', fontSize: 11, color: '#e8a838', marginBottom: 8 }}>
                              🏙 {arriveAfterEntry(advanceTroops)} will survive entry ({entryCost!.parts.join(', ')})
                            </div>
                          )}
                          {minAdv > 1 && (
                            <div style={{ textAlign: 'center', fontSize: 10, color: 'rgba(200,148,10,0.7)', marginBottom: 8 }}>
                              Minimum {minAdv} — must match dice rolled
                            </div>
                          )}
                        </>
                      )
                    })()}
                    <button onClick={() => handleClose(true)} style={btnStyle('capture')}>
                      Confirm Advance
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 10 }}>
                    {canContinue && (
                      <button onClick={handleAttackAgain} style={btnStyle('secondary')}>
                        ⚔ Attack Again
                      </button>
                    )}
                    <button
                      onClick={() => handleClose(false)}
                      style={btnStyle('primary')}
                    >
                      Retreat
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TroopBadge({ label, troops, color }: { label: string; troops: number; color: string }) {
  return (
    <div
      style={{
        flex: 1, textAlign: 'center',
        background: `${color}18`,
        border: `1px solid ${color}55`,
        borderRadius: 8, padding: '9px 6px',
      }}
    >
      <div style={{ fontSize: 10, color, letterSpacing: 1.5, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 'bold', lineHeight: 1 }}>{troops}</div>
      <div style={{ fontSize: 10, color: '#6a5a40', marginTop: 3 }}>troops</div>
    </div>
  )
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'capture'

function btnStyle(variant: BtnVariant): CSSProperties {
  const base: CSSProperties = {
    flex: 1, padding: '11px 8px', borderRadius: 7,
    cursor: 'pointer', fontSize: 13, fontFamily: 'Georgia, serif',
    fontWeight: 'bold', letterSpacing: 0.5,
    transition: 'background 0.15s',
  }
  switch (variant) {
    case 'primary':
      return { ...base, background: 'rgba(200,148,10,0.22)', border: '2px solid rgba(200,148,10,0.70)', color: '#E8DCC8' }
    case 'secondary':
      return { ...base, background: 'rgba(192,57,43,0.18)', border: '1.5px solid rgba(192,57,43,0.55)', color: '#e08070' }
    case 'ghost':
      return { ...base, background: 'transparent', border: '1px solid rgba(200,148,10,0.25)', color: '#7a6a50' }
    case 'capture':
      return { ...base, background: 'rgba(39,174,96,0.22)', border: '2px solid rgba(39,174,96,0.65)', color: '#2ecc71' }
  }
}
