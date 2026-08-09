/**
 * The shared battle screen for everyone who ISN'T the attacker.
 *
 * One component, two roles. The DEFENDER gets controls — the auto-resolve
 * answer and their own defense roll. A SPECTATOR gets the identical view with
 * no controls: the same fight, watched. Both replay the round locally from
 * synced inputs — raw dice and missile conversions ride the shared session;
 * scars, stickers and abilities ride game/legacy state — so no screen waits
 * on another to animate, and every screen settles on the same final dice.
 *
 * Battle-side missile conversions (a die forced to an unmodifiable 6 during
 * the attacker-machine missile phase) arrive via the session and are applied
 * AFTER the table modifiers, exactly as the attacker's pipeline orders it. If
 * they land a beat late, the settled round recomputes and the 🚀 callout
 * says why the die changed.
 */
import { useEffect, useRef, useState } from 'react'
import type { ActiveCombat } from '@/types/game'
import { DieFace } from './AttackModal'
import { playDice } from '@/lib/sounds'

const ATK_COLOR = '#c0392b'
const DEF_COLOR = '#2471a3'
const WIN_GLOW  = '#2ecc71'

/** Matched with the attacker modal's tumble (2.1s) — one battle, one tempo. */
const SPIN_MS = 2100
const SPIN_TICK_MS = 100

const rollN = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 6) + 1).sort((a, b) => b - a)
const clampDie = (v: number) => Math.max(1, Math.min(6, v))

export interface DefenderBattleMods {
  defHighest: number
  defLowest: number
  parts: Array<{ label: string }>
  atkBonusAllDice: number
  attackerSixesWin: boolean
  nuclearFallout: boolean
}

/** Apply the defender die bonus exactly as the attacker's pipeline does. */
function applyDefBonus(dice: number[], hi: number, lo: number): number[] {
  if (dice.length === 0 || (hi === 0 && lo === 0)) return dice
  const d = [...dice]
  if (d.length === 1) return [clampDie(d[0] + (hi !== 0 ? hi : lo))]
  d[0] = clampDie(d[0] + hi)
  d[d.length - 1] = clampDie(d[d.length - 1] + lo)
  return d
}

export default function DefenderBattlePrompt({ combat, role, attackerName, defenderName, srcName, tgtName, srcTroops, tgtTroops, mods, onConsent, onRollDefense, onDismiss }: {
  combat: ActiveCombat
  role: 'defender' | 'spectator'
  attackerName: string
  defenderName: string
  srcName: string
  tgtName: string
  srcTroops: number
  tgtTroops: number
  mods: DefenderBattleMods
  onConsent: (accept: boolean) => void
  onRollDefense: (dice: number[]) => void
  onDismiss?: () => void
}) {
  const [diceCount, setDiceCount] = useState(combat.defDiceMax)
  const [atkSpin, setAtkSpin] = useState(false)
  const [defSpin, setDefSpin] = useState(false)
  const [animAtk, setAnimAtk] = useState<number[]>([])
  const [animDef, setAnimDef] = useState<number[]>([])
  const [settled, setSettled] = useState<{ atk: number[]; def: number[]; winners: Array<'atk' | 'def'>; missiles: boolean } | null>(null)
  const prevRoundRef = useRef(combat.round)
  const seenAtkRef = useRef(false)
  const seenDefRef = useRef(false)
  const settleSigRef = useRef('')

  // New round (or a fresh battle): clean slate.
  useEffect(() => {
    if (prevRoundRef.current !== combat.round) {
      prevRoundRef.current = combat.round
      seenAtkRef.current = false
      seenDefRef.current = false
      settleSigRef.current = ''
      setSettled(null)
      setAnimAtk([])
      setAnimDef([])
    }
    setDiceCount(c => Math.min(c, combat.defDiceMax))
  }, [combat.round, combat.key, combat.defDiceMax])

  // A side's dice arrive: spin, then settle on the real values. On the
  // defender's own roll the spin starts in rollDefense instead (their click).
  useEffect(() => {
    if (!combat.atkDice || seenAtkRef.current) return
    seenAtkRef.current = true
    playDice()
    setAtkSpin(true)
    const spin = setInterval(() => setAnimAtk(rollN(combat.atkDice!.length)), SPIN_TICK_MS)
    const stop = setTimeout(() => {
      clearInterval(spin)
      setAnimAtk(combat.atkDice!)
      setAtkSpin(false)
    }, SPIN_MS)
    return () => { clearInterval(spin); clearTimeout(stop) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combat.atkDice])

  // The defense arriving from ELSEWHERE (spectator view; or the idle roll the
  // attacker made) — the defender's own click animates via rollDefense.
  useEffect(() => {
    if (!combat.defDice || seenDefRef.current) return
    seenDefRef.current = true
    setDefSpin(true)
    const spin = setInterval(() => setAnimDef(rollN(combat.defDice!.length)), SPIN_TICK_MS)
    const stop = setTimeout(() => {
      clearInterval(spin)
      setAnimDef(combat.defDice!)
      setDefSpin(false)
    }, SPIN_MS)
    return () => { clearInterval(spin); clearTimeout(stop) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combat.defDice])

  // Both rolls in, nothing spinning: apply the table's modifiers, then any
  // missile conversions, and light the pair winners. Recomputes if the
  // missile flips land after the first settle.
  useEffect(() => {
    if (!combat.atkDice || !combat.defDice || atkSpin || defSpin) return
    const flips = combat.missileFlips ?? []
    const sig = JSON.stringify([combat.atkDice, combat.defDice, flips])
    if (settleSigRef.current === sig) return
    const t = setTimeout(() => {
      settleSigRef.current = sig
      let atk = combat.atkDice!.map(d => clampDie(d + mods.atkBonusAllDice)).sort((a, b) => b - a)
      let def = applyDefBonus([...combat.defDice!].sort((a, b) => b - a), mods.defHighest, mods.defLowest)
      // Missiles land AFTER modifiers — an unmodifiable 6, same order as the
      // attacker's pipeline.
      for (const f of flips) {
        if (f.side === 'atk' && f.dieIndex < atk.length) atk = atk.map((d, i) => (i === f.dieIndex ? 6 : d))
        if (f.side === 'def' && f.dieIndex < def.length) def = def.map((d, i) => (i === f.dieIndex ? 6 : d))
      }
      const pairs = Math.min(atk.length, def.length)
      const winners = Array.from({ length: pairs }, (_, i) =>
        (atk[i] > def[i] || (mods.attackerSixesWin && atk[i] === 6 && def[i] === 6)) ? 'atk' as const : 'def' as const)
      setAnimAtk(atk)
      setAnimDef(def)
      setSettled({ atk, def, winners, missiles: flips.length > 0 })
    }, 500)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combat.atkDice, combat.defDice, combat.missileFlips, atkSpin, defSpin])

  const rollDefense = () => {
    const dice = rollN(diceCount)
    seenDefRef.current = true          // this IS the defense arriving
    playDice()
    setDefSpin(true)
    const spin = setInterval(() => setAnimDef(rollN(diceCount)), SPIN_TICK_MS)
    setTimeout(() => {
      clearInterval(spin)
      setAnimDef(dice)
      setDefSpin(false)
    }, SPIN_MS)
    onRollDefense(dice)
  }

  const isDefender = role === 'defender'
  const youOrName = isDefender ? 'you' : defenderName
  const needsConsent = isDefender && combat.autoProposed && combat.defenderAuto === null
  const manual = combat.defenderAuto !== true
  const aLoss = settled ? settled.winners.filter(w => w === 'def').length + (mods.nuclearFallout ? 1 : 0) : 0
  const dLoss = settled ? settled.winners.filter(w => w === 'atk').length + (mods.nuclearFallout ? 1 : 0) : 0

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(5,2,0,0.72)', zIndex: 900,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'linear-gradient(155deg, #2C1A08 0%, #160C02 100%)',
        border: '2px solid rgba(200,148,10,0.65)', borderRadius: 14,
        padding: '28px 30px 24px', width: 480, maxWidth: '92vw',
        color: '#E8DCC8', boxShadow: '0 12px 50px rgba(0,0,0,0.85)',
        fontFamily: 'Georgia, serif', position: 'relative',
      }}>
        {/* Spectators may step out to look at the board; the battle plays on. */}
        {onDismiss && (
          <button
            onClick={onDismiss}
            title="Watch from the board instead"
            style={{
              position: 'absolute', top: 8, right: 10, background: 'none', border: 'none',
              color: '#7a6a50', fontSize: 18, cursor: 'pointer',
            }}
          >
            ×
          </button>
        )}

        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 22, fontWeight: 'bold', color: '#C8940A', letterSpacing: 1.5 }}>
            ⚔ BATTLE — round {combat.round}
          </div>
          <div style={{ fontSize: 13, color: '#b09870', marginTop: 5 }}>
            {attackerName} attacks <strong>{tgtName}</strong>{isDefender ? '' : ` (${defenderName})`} from {srcName} · {srcTroops} vs {tgtTroops} troops
          </div>
        </div>

        <div style={{ display: 'flex', gap: 20, justifyContent: 'center', alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#e74c3c', letterSpacing: 1.5, marginBottom: 8 }}>ATTACKER</div>
            <div style={{ display: 'flex', gap: 7, justifyContent: 'center', minHeight: 54 }}>
              {animAtk.length === 0
                ? <div style={{ fontSize: 11, color: '#7a6a50', alignSelf: 'center' }}>waiting for the roll…</div>
                : animAtk.map((v, i) => (
                    <DieFace key={i} value={v} borderColor={ATK_COLOR} spinning={atkSpin}
                      glow={settled && settled.winners[i] === 'atk' ? WIN_GLOW : undefined}
                      dim={!!settled && i < settled.winners.length && settled.winners[i] === 'def'} />
                  ))}
            </div>
          </div>
          <div style={{ color: '#6a5a40', fontSize: 22, alignSelf: 'center', paddingTop: 22 }}>│</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#7fb3d3', letterSpacing: 1.5, marginBottom: 8 }}>
              DEFENDER{isDefender ? ' — YOU' : ` — ${defenderName.toUpperCase()}`}
            </div>
            <div style={{ display: 'flex', gap: 7, justifyContent: 'center', minHeight: 54 }}>
              {animDef.length === 0
                ? <div style={{ fontSize: 11, color: '#7a6a50', alignSelf: 'center' }}>
                    {isDefender ? 'your dice go here' : `${defenderName} rolls…`}
                  </div>
                : animDef.map((v, i) => (
                    <DieFace key={i} value={v} borderColor={DEF_COLOR} spinning={defSpin}
                      glow={settled && settled.winners[i] === 'def' ? WIN_GLOW : undefined}
                      dim={!!settled && i < settled.winners.length && settled.winners[i] === 'atk'} />
                  ))}
            </div>
          </div>
        </div>

        {settled && (mods.parts.length > 0 || settled.missiles) && (
          <div style={{ fontSize: 10, color: '#b09870', textAlign: 'center', marginBottom: 10 }}>
            {[...mods.parts.map(p => p.label), ...(settled.missiles ? ['🚀 Missile — die forced to an unmodifiable 6'] : [])].join(' · ')}
          </div>
        )}

        {settled && (
          <div style={{ textAlign: 'center', marginBottom: 14, fontSize: 14, fontWeight: 'bold' }}>
            <span style={{ color: ATK_COLOR }}>{attackerName} −{aLoss}</span>
            <span style={{ color: '#7a6a50', margin: '0 10px' }}>·</span>
            <span style={{ color: '#7fb3d3' }}>{youOrName} −{dLoss}</span>
            <div style={{ fontSize: 11, color: '#b09870', fontWeight: 'normal', marginTop: 4 }}>
              {attackerName} decides: press on or retreat.
            </div>
          </div>
        )}

        {needsConsent && (
          <div style={{ textAlign: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: 12, color: '#b09870', marginBottom: 10 }}>
              {attackerName} offers to <strong>auto-resolve</strong> the whole battle.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => onConsent(true)} style={btn('#2ecc71')}>⚡ Auto-resolve is fine</button>
              <button onClick={() => onConsent(false)} style={btn('#5dade2')}>🎲 I roll my own dice</button>
            </div>
          </div>
        )}

        {isDefender && !needsConsent && manual && !combat.defDice && !defSpin && (
          <div style={{ textAlign: 'center' }}>
            {combat.defDiceMax > 1 && (
              <div style={{ marginBottom: 10, fontSize: 11, color: '#b09870' }}>
                defend with{' '}
                {Array.from({ length: combat.defDiceMax }, (_, i) => i + 1).map(n => (
                  <button key={n} onClick={() => setDiceCount(n)}
                    style={{ ...btn(diceCount === n ? '#5dade2' : '#4a3a20'), padding: '4px 12px', marginLeft: 4, fontSize: 12 }}>
                    {n}
                  </button>
                ))}{' '}dice
              </div>
            )}
            <button onClick={rollDefense} style={{ ...btn('#5dade2'), width: '100%' }}>
              🎲 Roll Defense
            </button>
          </div>
        )}

        {isDefender && !needsConsent && manual && !!combat.defDice && !settled && !defSpin && (
          <div style={{ textAlign: 'center', fontSize: 11, color: '#b09870' }}>
            {combat.defDiceBy === 'attacker-idle'
              ? 'The attacker rolled this defense while you were away.'
              : combat.atkDice ? 'Dice are in — resolving…' : `Your dice are in — waiting for ${attackerName} to roll.`}
          </div>
        )}
        {!isDefender && combat.autoProposed && combat.defenderAuto === null && (
          <div style={{ textAlign: 'center', fontSize: 11, color: '#b09870' }}>
            {attackerName} offered auto-resolve — waiting on {defenderName}.
          </div>
        )}
        {combat.defenderAuto === true && (
          <div style={{ textAlign: 'center', fontSize: 11, color: '#b09870' }}>
            Auto-resolve agreed — the outcome arrives in a moment.
          </div>
        )}
      </div>
    </div>
  )
}

function btn(color: string): React.CSSProperties {
  return {
    flex: 1, padding: '11px 8px', borderRadius: 7, cursor: 'pointer',
    fontSize: 13, fontFamily: 'Georgia, serif', fontWeight: 'bold', letterSpacing: 0.5,
    background: 'rgba(0,0,0,0.3)', border: `2px solid ${color}`, color: '#E8DCC8',
  }
}
