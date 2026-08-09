/**
 * The DEFENDER's battle screen — the same fight, the same visual language.
 *
 * When another human attacks you online, this full-screen modal mirrors the
 * attacker's AttackModal: their dice SPIN in the moment they roll, yours spin
 * when you do, the table modifiers apply, and the round's pair winners light
 * up — computed locally from the same synced inputs (raw dice ride the shared
 * session; scars, stickers and abilities ride game/legacy state), so both
 * screens show the same battle without waiting on each other.
 *
 * The attacker still owns the battle's DECISIONS (continue, retreat, advance,
 * missiles) — your half is the consent answer and your own defense dice.
 * Known seam, said out loud: a battle-side missile conversion made on the
 * attacker's machine is not replayed here yet; the authoritative outcome
 * always lands with the board either way.
 */
import { useEffect, useRef, useState } from 'react'
import type { ActiveCombat } from '@/types/game'
import { DieFace } from './AttackModal'
import { playDice } from '@/lib/sounds'

const ATK_COLOR = '#c0392b'
const DEF_COLOR = '#2471a3'
const WIN_GLOW  = '#2ecc71'

const rollN = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 6) + 1).sort((a, b) => b - a)
const clampDie = (v: number) => Math.max(1, Math.min(6, v))

export interface DefenderBattleMods {
  /** Net shift to the defender's highest / lowest die (Bunker, Fortification,
   *  Ammo Shortage, Bear Trap, Armored Command — the same sums the attacker's
   *  modal applies). */
  defHighest: number
  defLowest: number
  /** Named parts, shown so the defender sees WHY their dice moved. */
  parts: Array<{ label: string }>
  /** Aggressive comeback: +N to every attacker die. */
  atkBonusAllDice: number
  /** Mutant Unnatural Strength: attacker 6s beat defender 6s. */
  attackerSixesWin: boolean
  /** Nuclear fallout: both sides lose one extra troop per round. */
  nuclearFallout: boolean
}

/** Apply the defender die bonus exactly as the attacker's pipeline does:
 *  highest and lowest shifted, clamped once; a single die takes whichever
 *  shift applies to it, once. */
function applyDefBonus(dice: number[], hi: number, lo: number): number[] {
  if (dice.length === 0 || (hi === 0 && lo === 0)) return dice
  const d = [...dice]
  if (d.length === 1) return [clampDie(d[0] + (hi !== 0 ? hi : lo))]
  d[0] = clampDie(d[0] + hi)
  d[d.length - 1] = clampDie(d[d.length - 1] + lo)
  return d
}

export default function DefenderBattlePrompt({ combat, attackerName, srcName, tgtName, srcTroops, tgtTroops, mods, onConsent, onRollDefense }: {
  combat: ActiveCombat
  attackerName: string
  srcName: string
  tgtName: string
  srcTroops: number
  tgtTroops: number
  mods: DefenderBattleMods
  onConsent: (accept: boolean) => void
  onRollDefense: (dice: number[]) => void
}) {
  const [diceCount, setDiceCount] = useState(combat.defDiceMax)
  /** Animation: which sides are still spinning. */
  const [atkSpin, setAtkSpin] = useState(false)
  const [defSpin, setDefSpin] = useState(false)
  const [animAtk, setAnimAtk] = useState<number[]>([])
  const [animDef, setAnimDef] = useState<number[]>([])
  /** Round settled: final (modified) dice + pair winners are on display. */
  const [settled, setSettled] = useState<{ atk: number[]; def: number[]; winners: Array<'atk' | 'def'> } | null>(null)
  const prevRoundRef = useRef(combat.round)
  const seenAtkRef = useRef(false)

  // New round (or new battle): clean slate.
  useEffect(() => {
    if (prevRoundRef.current !== combat.round || !combat.atkDice) {
      prevRoundRef.current = combat.round
      if (!combat.atkDice) seenAtkRef.current = false
      if (!combat.atkDice && !combat.defDice) {
        setSettled(null)
        setAnimAtk([])
        setAnimDef([])
      }
    }
    setDiceCount(c => Math.min(c, combat.defDiceMax))
  }, [combat.round, combat.key, combat.atkDice, combat.defDice, combat.defDiceMax])

  // The attacker's dice arrive: spin, then settle on their real values.
  useEffect(() => {
    if (!combat.atkDice || seenAtkRef.current) return
    seenAtkRef.current = true
    playDice()
    setAtkSpin(true)
    const spin = setInterval(() => setAnimAtk(rollN(combat.atkDice!.length)), 90)
    const stop = setTimeout(() => {
      clearInterval(spin)
      setAnimAtk(combat.atkDice!)
      setAtkSpin(false)
    }, 750)
    return () => { clearInterval(spin); clearTimeout(stop) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combat.atkDice])

  // Both rolls are in and nothing is spinning: apply the table's modifiers and
  // light the pair winners — the same math the attacker's machine runs.
  useEffect(() => {
    if (!combat.atkDice || !combat.defDice || atkSpin || defSpin || settled) return
    const t = setTimeout(() => {
      const atk = combat.atkDice!.map(d => clampDie(d + mods.atkBonusAllDice)).sort((a, b) => b - a)
      const def = applyDefBonus([...combat.defDice!].sort((a, b) => b - a), mods.defHighest, mods.defLowest)
      const pairs = Math.min(atk.length, def.length)
      const winners = Array.from({ length: pairs }, (_, i) =>
        (atk[i] > def[i] || (mods.attackerSixesWin && atk[i] === 6 && def[i] === 6)) ? 'atk' as const : 'def' as const)
      setAnimAtk(atk)
      setAnimDef(def)
      setSettled({ atk, def, winners })
    }, 500)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combat.atkDice, combat.defDice, atkSpin, defSpin, settled])

  const rollDefense = () => {
    const dice = rollN(diceCount)
    playDice()
    setDefSpin(true)
    const spin = setInterval(() => setAnimDef(rollN(diceCount)), 90)
    setTimeout(() => {
      clearInterval(spin)
      setAnimDef(dice)
      setDefSpin(false)
    }, 750)
    onRollDefense(dice)
  }

  const needsConsent = combat.autoProposed && combat.defenderAuto === null
  const manual = combat.defenderAuto !== true
  const aLoss = settled ? settled.winners.filter(w => w === 'def').length + (mods.nuclearFallout ? 1 : 0) : 0
  const dLoss = settled ? settled.winners.filter(w => w === 'atk').length + (mods.nuclearFallout ? 1 : 0) : 0

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(5,2,0,0.72)', zIndex: 950,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'linear-gradient(155deg, #2C1A08 0%, #160C02 100%)',
        border: '2px solid rgba(200,148,10,0.65)', borderRadius: 14,
        padding: '28px 30px 24px', width: 480, maxWidth: '92vw',
        color: '#E8DCC8', boxShadow: '0 12px 50px rgba(0,0,0,0.85)',
        fontFamily: 'Georgia, serif',
      }}>
        {/* ── Header — the same battle banner the attacker sees ── */}
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 22, fontWeight: 'bold', color: '#C8940A', letterSpacing: 1.5 }}>
            ⚔ BATTLE — round {combat.round}
          </div>
          <div style={{ fontSize: 13, color: '#b09870', marginTop: 5 }}>
            {attackerName} attacks <strong>{tgtName}</strong> from {srcName} · {srcTroops} vs {tgtTroops} troops
          </div>
        </div>

        {/* ── Dice arena ── */}
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
            <div style={{ fontSize: 10, color: '#7fb3d3', letterSpacing: 1.5, marginBottom: 8 }}>DEFENDER — YOU</div>
            <div style={{ display: 'flex', gap: 7, justifyContent: 'center', minHeight: 54 }}>
              {animDef.length === 0
                ? <div style={{ fontSize: 11, color: '#7a6a50', alignSelf: 'center' }}>your dice go here</div>
                : animDef.map((v, i) => (
                    <DieFace key={i} value={v} borderColor={DEF_COLOR} spinning={defSpin}
                      glow={settled && settled.winners[i] === 'def' ? WIN_GLOW : undefined}
                      dim={!!settled && i < settled.winners.length && settled.winners[i] === 'atk'} />
                  ))}
            </div>
          </div>
        </div>

        {/* ── Modifier callouts, same wording as the attacker's screen ── */}
        {settled && mods.parts.length > 0 && (
          <div style={{ fontSize: 10, color: '#b09870', textAlign: 'center', marginBottom: 10 }}>
            {mods.parts.map(p => p.label).join(' · ')}
          </div>
        )}

        {/* ── Round outcome ── */}
        {settled && (
          <div style={{ textAlign: 'center', marginBottom: 14, fontSize: 14, fontWeight: 'bold' }}>
            <span style={{ color: ATK_COLOR }}>{attackerName} −{aLoss}</span>
            <span style={{ color: '#7a6a50', margin: '0 10px' }}>·</span>
            <span style={{ color: '#7fb3d3' }}>you −{dLoss}</span>
            <div style={{ fontSize: 11, color: '#b09870', fontWeight: 'normal', marginTop: 4 }}>
              {attackerName} decides: press on or retreat.
            </div>
          </div>
        )}

        {/* ── Your controls ── */}
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

        {!needsConsent && manual && !combat.defDice && !defSpin && (
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

        {!needsConsent && manual && !!combat.defDice && !settled && !defSpin && (
          <div style={{ textAlign: 'center', fontSize: 11, color: '#b09870' }}>
            {combat.defDiceBy === 'attacker-idle'
              ? 'The attacker rolled this defense while you were away.'
              : combat.atkDice ? 'Dice are in — resolving…' : `Your dice are in — waiting for ${attackerName} to roll.`}
          </div>
        )}
        {combat.defenderAuto === true && (
          <div style={{ textAlign: 'center', fontSize: 11, color: '#b09870' }}>
            Auto-resolve accepted — the outcome arrives in a moment.
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
