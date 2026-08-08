/**
 * The DEFENDER's half of an online battle, on the defender's own machine.
 *
 * When another human attacks you, this is where you answer: accept their
 * auto-resolve offer, or roll your own defense dice. Your roll is raw — the
 * attacker's machine applies the modifier stack to it exactly as it would to
 * a roll it made itself; what changed is that the dice are YOURS. The
 * attacker never waits to roll their own dice, so theirs may already be on
 * the table when this opens.
 */
import { useEffect, useState } from 'react'
import type { ActiveCombat } from '@/types/game'

const DIE_GLYPHS = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅']
const die = (v: number) => DIE_GLYPHS[Math.max(1, Math.min(6, v))]
const ATK_COLOR = '#e74c3c'
const DEF_COLOR = '#5dade2'

const rollN = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 6) + 1).sort((a, b) => b - a)

export default function DefenderBattlePrompt({ combat, attackerName, srcName, tgtName, onConsent, onRollDefense }: {
  combat: ActiveCombat
  attackerName: string
  srcName: string
  tgtName: string
  onConsent: (accept: boolean) => void
  onRollDefense: (dice: number[]) => void
}) {
  const [diceCount, setDiceCount] = useState(combat.defDiceMax)
  useEffect(() => { setDiceCount(combat.defDiceMax) }, [combat.key, combat.defDiceMax])

  const needsConsent = combat.autoProposed && combat.defenderAuto === null
  const manual = combat.defenderAuto !== true
  const rolledThisRound = !!combat.defDice

  return (
    <div
      style={{
        position: 'fixed', top: 74, left: '50%', transform: 'translateX(-50%)',
        zIndex: 950,
        background: 'linear-gradient(155deg, rgba(20,30,44,0.97) 0%, rgba(8,14,24,0.97) 100%)',
        border: '2px solid rgba(93,173,226,0.7)', borderRadius: 12,
        padding: '14px 22px 14px', minWidth: 360, maxWidth: 480,
        color: '#dce8f2', boxShadow: '0 8px 40px rgba(0,0,0,0.75)',
        textAlign: 'center', fontFamily: 'Georgia, serif',
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 'bold', color: DEF_COLOR, letterSpacing: 1 }}>
        🛡 {attackerName} attacks your {tgtName}!
      </div>
      <div style={{ fontSize: 11, color: '#8aa4b8', marginTop: 2 }}>
        from {srcName} · round {combat.round}
      </div>

      {/* The attacker's raw dice, the moment they roll — no secrets. */}
      <div style={{ marginTop: 10, fontSize: 26, minHeight: 32 }}>
        <span style={{ color: ATK_COLOR }}>
          {combat.atkDice ? combat.atkDice.map(die).join(' ') : '· · ·'}
        </span>
        <span style={{ fontSize: 12, color: '#6a7f92', margin: '0 10px' }}>vs</span>
        <span style={{ color: DEF_COLOR }}>
          {combat.defDice ? combat.defDice.map(die).join(' ') : '· ·'}
        </span>
      </div>
      {combat.defDiceBy === 'attacker-idle' && (
        <div style={{ fontSize: 10, color: '#c0965a', marginTop: 2 }}>
          (the attacker rolled this defense while you were away)
        </div>
      )}

      {needsConsent && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: '#b8c9d6', marginBottom: 8 }}>
            {attackerName} offers to auto-resolve the whole battle.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button onClick={() => onConsent(true)} style={btn('#2ecc71')}>⚡ Auto-resolve is fine</button>
            <button onClick={() => onConsent(false)} style={btn(DEF_COLOR)}>🎲 I roll my own dice</button>
          </div>
        </div>
      )}

      {!needsConsent && manual && !rolledThisRound && (
        <div style={{ marginTop: 12 }}>
          {combat.defDiceMax > 1 && (
            <div style={{ marginBottom: 8, fontSize: 11, color: '#8aa4b8' }}>
              defend with{' '}
              {Array.from({ length: combat.defDiceMax }, (_, i) => i + 1).map(n => (
                <button
                  key={n}
                  onClick={() => setDiceCount(n)}
                  style={{
                    ...btn(diceCount === n ? DEF_COLOR : '#3a4a5a'),
                    padding: '3px 10px', marginLeft: 4, fontSize: 12,
                  }}
                >
                  {n}
                </button>
              ))}
              {' '}dice
            </div>
          )}
          <button onClick={() => onRollDefense(rollN(diceCount))} style={btn(DEF_COLOR)}>
            🎲 Roll Defense
          </button>
        </div>
      )}

      {!needsConsent && manual && rolledThisRound && (
        <div style={{ marginTop: 10, fontSize: 11, color: '#8aa4b8' }}>
          Dice are in — the attacker's machine resolves the round.
        </div>
      )}
      {combat.defenderAuto === true && (
        <div style={{ marginTop: 10, fontSize: 11, color: '#8aa4b8' }}>
          Auto-resolve accepted — the outcome arrives in a moment.
        </div>
      )}
    </div>
  )
}

function btn(color: string): React.CSSProperties {
  return {
    padding: '8px 14px', borderRadius: 7, fontSize: 13, fontWeight: 'bold',
    fontFamily: 'Georgia, serif', letterSpacing: 0.5, cursor: 'pointer',
    background: 'rgba(0,0,0,0.3)', border: `2px solid ${color}`, color: '#dce8f2',
  }
}
