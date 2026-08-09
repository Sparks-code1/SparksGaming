/**
 * A battle someone ELSE is fighting, shown to everyone watching.
 *
 * Strictly an audience view: `pointer-events: none` end to end, no buttons,
 * no way to influence anything — spectating a battle must never let a
 * spectator touch it. It dismisses itself (GameBoard owns the timer) and a
 * newer battle simply replaces it.
 *
 * Short battles animate round by round with the exact dice the attacker saw.
 * Auto-resolved slogs collapse to one totals card — nobody watches twelve
 * consecutive dice reveals of a fight that is already over.
 */
import { useEffect, useState } from 'react'
import type { SpectatorCombatReport } from '@/lib/spectatorCombat'

const DIE_GLYPHS = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅']
const die = (v: number) => DIE_GLYPHS[Math.max(1, Math.min(6, v))]

const ATK_COLOR = '#e74c3c'
const DEF_COLOR = '#5dade2'

/** A combat round currently held open on the ACTOR's machine. */
export interface LiveRoundView {
  roundKey: string
  srcId: string
  tgtId: string
  atkDice: number[]
  defDice: number[]
  flips: Array<{ playerId: string; side: 'atk' | 'def'; dieIndex: number }>
  endsAt: number
}

export default function SpectatorCombatOverlay({ report }: { report: SpectatorCombatReport }) {
  // Rounds revealed so far; the interval walks forward until all are shown.
  const [shown, setShown] = useState(report.summary ? 0 : 1)

  useEffect(() => {
    setShown(report.summary ? 0 : 1)
    if (report.summary) return
    const t = setInterval(() => {
      setShown(prev => {
        if (prev >= report.rounds.length) { clearInterval(t); return prev }
        return prev + 1
      })
    }, 1_100)
    return () => clearInterval(t)
  }, [report])

  const outcomeLine = report.captured
    ? `⚑ ${report.tgtName} captured — ${report.troopsToAdvance} troop${report.troopsToAdvance === 1 ? '' : 's'} advance`
    : `🛡 Repelled — the defenders hold ${report.tgtName}`
  const done = report.summary || shown >= report.rounds.length

  return (
    <div
      style={{
        position: 'fixed', top: 74, left: '50%', transform: 'translateX(-50%)',
        zIndex: 900, pointerEvents: 'none',
        background: 'linear-gradient(155deg, rgba(44,26,8,0.96) 0%, rgba(22,12,2,0.96) 100%)',
        border: '2px solid rgba(200,148,10,0.65)', borderRadius: 12,
        padding: '14px 22px 12px', minWidth: 320, maxWidth: 460,
        color: '#E8DCC8', boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
        textAlign: 'center', fontFamily: 'Georgia, serif',
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 'bold', color: '#C8940A', letterSpacing: 1 }}>
        ⚔ {report.attackerName} attacks {report.tgtName}
      </div>
      <div style={{ fontSize: 11, color: '#b09870', marginTop: 2 }}>
        from {report.srcName}
        {report.defenderName ? <> · defended by {report.defenderName}</> : null}
      </div>

      {report.summary ? (
        <div style={{ marginTop: 10, fontSize: 13 }}>
          {report.rounds.length > 0 && (
            <div style={{ color: '#b09870', fontSize: 11, marginBottom: 4 }}>
              {report.rounds.length} rounds of dice
            </div>
          )}
          <span style={{ color: ATK_COLOR }}>attacker −{report.totalAtkLoss}</span>
          <span style={{ color: '#7a6a50', margin: '0 8px' }}>·</span>
          <span style={{ color: DEF_COLOR }}>defender −{report.totalDefLoss}</span>
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          {report.rounds.slice(0, shown).map((r, i) => (
            <div key={i} style={{ fontSize: 24, lineHeight: 1.35 }}>
              <span style={{ color: ATK_COLOR }}>{r.atkDice.map(die).join(' ')}</span>
              <span style={{ fontSize: 12, color: '#7a6a50', margin: '0 10px' }}>vs</span>
              <span style={{ color: DEF_COLOR }}>{r.defDice.map(die).join(' ')}</span>
              <span style={{ fontSize: 11, color: '#b09870', marginLeft: 10 }}>
                {r.aLoss > 0 ? `atk −${r.aLoss}` : ''}{r.aLoss > 0 && r.dLoss > 0 ? ' · ' : ''}{r.dLoss > 0 ? `def −${r.dLoss}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {done && (
        <div style={{
          marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(200,148,10,0.25)',
          fontSize: 13, fontWeight: 'bold',
          color: report.captured ? '#2ecc71' : '#b09870',
        }}>
          {outcomeLine}
        </div>
      )}
    </div>
  )
}

/**
 * A round LIVE on the actor's machine, waiting out the spectator window.
 *
 * The one sanctioned interaction a spectator has: fire a missile at a die.
 * Everything else stays inert — the card is the audience's seat, not a second
 * set of controls. With no missiles (or as a battle side), it is pure display.
 *
 * `missilesLeft: 0` hides the button entirely. `onFire` resolves true when the
 * server accepted the flip; a refusal means the missile was never charged and
 * the caller has already shown why.
 */
export function SpectatorLiveRound({ round, attackerName, srcName, tgtName, missilesLeft, onFire }: {
  round: LiveRoundView
  attackerName: string
  srcName: string
  tgtName: string
  missilesLeft: number
  onFire: (side: 'atk' | 'def', dieIndex: number) => Promise<boolean>
}) {
  /** Armed = the next die click spends the missile. */
  const [armed, setArmed] = useState(false)
  const [inFlight, setInFlight] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(0, Math.ceil((round.endsAt - Date.now()) / 1000)))

  useEffect(() => {
    setArmed(false)
    setInFlight(false)
    const t = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((round.endsAt - Date.now()) / 1000)))
    }, 500)
    return () => clearInterval(t)
  }, [round.roundKey, round.endsAt])

  const fire = async (side: 'atk' | 'def', dieIndex: number) => {
    if (!armed || inFlight) return
    setInFlight(true)
    try { await onFire(side, dieIndex) } finally {
      setInFlight(false)
      setArmed(false)
    }
  }

  const flipped = (side: 'atk' | 'def', i: number) =>
    round.flips.some(f => f.side === side && f.dieIndex === i)

  const diceRow = (side: 'atk' | 'def', dice: number[], color: string, label: string) => (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 10, color, letterSpacing: 1.5, marginBottom: 2 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
        {dice.map((v, i) => {
          const hit = flipped(side, i)
          const clickable = armed && !hit && !inFlight
          return (
            <button
              key={i}
              onClick={() => { void fire(side, i) }}
              disabled={!clickable}
              style={{
                fontSize: 30, lineHeight: 1, padding: '2px 4px',
                background: hit ? 'rgba(46,204,113,0.18)' : 'transparent',
                border: clickable ? '1px dashed #F1C40F' : '1px solid transparent',
                borderRadius: 6, color: hit ? '#2ecc71' : color,
                cursor: clickable ? 'pointer' : 'default',
                pointerEvents: clickable ? 'auto' : 'none',
              }}
              title={clickable ? 'Fire the missile at this die' : undefined}
            >
              {die(v)}
            </button>
          )
        })}
      </div>
    </div>
  )

  return (
    <div
      style={{
        position: 'fixed', top: 74, left: '50%', transform: 'translateX(-50%)',
        // Above the full battle screen (z 900): a spectator watching the
        // battle modal must still be able to fire a missile from here.
        zIndex: 960,
        background: 'linear-gradient(155deg, rgba(44,26,8,0.97) 0%, rgba(22,12,2,0.97) 100%)',
        border: '2px solid rgba(200,148,10,0.65)', borderRadius: 12,
        padding: '14px 22px 12px', minWidth: 340, maxWidth: 480,
        color: '#E8DCC8', boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
        textAlign: 'center', fontFamily: 'Georgia, serif',
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 'bold', color: '#C8940A', letterSpacing: 1 }}>
        ⚔ {attackerName} attacks {tgtName}
      </div>
      <div style={{ fontSize: 11, color: '#b09870', marginTop: 2 }}>
        from {srcName} · missile window {secondsLeft}s
      </div>

      <div style={{ display: 'flex', gap: 18, justifyContent: 'center', marginTop: 10 }}>
        {diceRow('atk', round.atkDice, ATK_COLOR, 'ATTACKER')}
        <div style={{ color: '#6a5a40', fontSize: 18, alignSelf: 'center' }}>│</div>
        {diceRow('def', round.defDice, DEF_COLOR, 'DEFENDER')}
      </div>

      {missilesLeft > 0 && (
        <div style={{ marginTop: 10 }}>
          {armed ? (
            <div style={{ fontSize: 11, color: '#F1C40F' }}>
              Click a die to turn it into an unmodifiable 6 — or{' '}
              <button
                onClick={() => setArmed(false)}
                style={{ background: 'none', border: 'none', color: '#b09870', cursor: 'pointer', fontSize: 11, textDecoration: 'underline' }}
              >
                stand down
              </button>
            </div>
          ) : (
            <button
              onClick={() => setArmed(true)}
              disabled={inFlight}
              style={{
                padding: '7px 16px', borderRadius: 7, fontSize: 12, fontWeight: 'bold',
                fontFamily: 'Georgia, serif', letterSpacing: 0.5, cursor: 'pointer',
                background: 'rgba(200,148,10,0.25)', border: '2px solid #C8940A', color: '#E8DCC8',
              }}
            >
              🚀 Play a Missile ({missilesLeft} left)
            </button>
          )}
        </div>
      )}
    </div>
  )
}
