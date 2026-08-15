import { useEffect, useState } from 'react'
import { onMissileStrike, dieKey, type MissileStrike } from '@/lib/missileFx'

/**
 * The missile strike: a projectile arcing in, an impact, and a name.
 *
 * Mounted ONCE over the whole board, above every battle screen, and drawing
 * nothing until a strike is announced. It finds the die it is aimed at by the
 * `data-die` attribute the dice carry, so it hits the right one when five are
 * on screen, and it keeps a list rather than a single strike, so two missiles
 * at two dice fly at once without either cutting the other short.
 *
 * Pure CSS keyframes and transforms — no canvas, no animation library — and
 * `pointer-events: none` throughout: this runs in the middle of a live round
 * and must never take a click, block a dispatch, or hold the round open. Every
 * strike removes itself when its time is up, whatever else is happening.
 */

/** Total life of one strike. Deliberately shorter than the missile sound. */
const FLIGHT_MS = 520
const IMPACT_MS = 620
const TOTAL_MS = FLIGHT_MS + IMPACT_MS

interface Live extends MissileStrike {
  /** Where the die is, in viewport pixels, captured when the strike lands. */
  x: number
  y: number
  /** Where it flies in from — an edge, chosen by which half of the screen. */
  fromX: number
  fromY: number
  angle: number
}

export default function MissileStrikeLayer() {
  const [strikes, setStrikes] = useState<Live[]>([])

  useEffect(() => onMissileStrike(s => {
    // Resolve the target NOW: the die is on screen at the moment of the
    // strike, and a rect read later would chase a modal that has since moved.
    const el = document.querySelector(`[data-die="${dieKey(s.side, s.dieIndex)}"]`)
    const r = el?.getBoundingClientRect()
    if (!r || r.width === 0) return          // nothing to aim at — skip silently
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2

    // Fly in from the nearest vertical edge, angled down, so the projectile
    // crosses open screen rather than the dice it is not aimed at.
    const fromLeft = x > window.innerWidth / 2
    const fromX = fromLeft ? -140 : window.innerWidth + 140
    const fromY = Math.max(-120, y - 260)
    const angle = Math.atan2(y - fromY, x - fromX) * (180 / Math.PI)

    const live: Live = { ...s, x, y, fromX, fromY, angle }
    setStrikes(prev => [...prev, live])

    // The die's own flourish: it has already become a 6 in state, so this is
    // the snap that says so. Web Animations, on the element we just found —
    // no re-render of anyone else's component, and it cleans itself up.
    window.setTimeout(() => {
      try {
        (el as HTMLElement).animate?.([
          { transform: 'scale(1) rotate(0deg)' },
          { transform: 'scale(1.4) rotate(-14deg)', offset: 0.35 },
          { transform: 'scale(1) rotate(0deg)' },
        ], { duration: 320, easing: 'cubic-bezier(.2,.8,.3,1)' })
      } catch { /* animation is optional, the 6 is not */ }
    }, FLIGHT_MS)

    window.setTimeout(() => {
      setStrikes(prev => prev.filter(p => p.id !== live.id))
    }, TOTAL_MS + 400)
  }), [])

  if (strikes.length === 0) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 4000, pointerEvents: 'none', overflow: 'hidden',
    }}>
      <style>{KEYFRAMES}</style>
      {strikes.map(s => (
        <div key={s.id}>
          {/* The projectile: travels from the edge to the die, nose first. */}
          <div
            style={{
              position: 'absolute', left: 0, top: 0, willChange: 'transform',
              animation: `missile-fly ${FLIGHT_MS}ms cubic-bezier(.55,.06,.9,.55) forwards`,
              ['--fx' as string]: `${s.fromX}px`,
              ['--fy' as string]: `${s.fromY}px`,
              ['--tx' as string]: `${s.x}px`,
              ['--ty' as string]: `${s.y}px`,
            }}
          >
            <div style={{
              transform: `rotate(${s.angle}deg)`,
              fontSize: 26, lineHeight: 1, filter: 'drop-shadow(0 0 6px rgba(255,180,60,0.9))',
            }}>
              🚀
              <div style={{
                position: 'absolute', right: '100%', top: '50%', width: 90, height: 3,
                marginTop: -1.5, borderRadius: 2,
                background: 'linear-gradient(to left, rgba(255,190,80,0.85), rgba(255,120,0,0))',
                animation: `missile-trail ${FLIGHT_MS}ms linear forwards`,
              }} />
            </div>
          </div>

          {/* Impact: a flash, then two rings pushing out from the die. */}
          <div style={{ position: 'absolute', left: s.x, top: s.y, transform: 'translate(-50%,-50%)' }}>
            <div style={{
              position: 'absolute', left: '50%', top: '50%', width: 90, height: 90,
              marginLeft: -45, marginTop: -45, borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255,255,220,0.95) 0%, rgba(255,170,40,0.55) 40%, rgba(255,120,0,0) 70%)',
              opacity: 0,
              animation: `missile-flash 260ms ease-out ${FLIGHT_MS}ms forwards`,
            }} />
            <div style={{
              position: 'absolute', left: '50%', top: '50%', width: 40, height: 40,
              marginLeft: -20, marginTop: -20, borderRadius: '50%',
              border: '2px solid rgba(255,200,90,0.9)', opacity: 0,
              animation: `missile-ring 520ms ease-out ${FLIGHT_MS}ms forwards`,
            }} />
            <div style={{
              position: 'absolute', left: '50%', top: '50%', width: 40, height: 40,
              marginLeft: -20, marginTop: -20, borderRadius: '50%',
              border: '2px solid rgba(255,120,40,0.7)', opacity: 0,
              animation: `missile-ring 620ms ease-out ${FLIGHT_MS + 90}ms forwards`,
            }} />
          </div>

          {/* Who fired it — rises off the die and fades. */}
          <div style={{
            position: 'absolute', left: s.x, top: s.y - 34,
            transform: 'translate(-50%,-50%)', opacity: 0, whiteSpace: 'nowrap',
            animation: `missile-label 1100ms ease-out ${FLIGHT_MS}ms forwards`,
            fontFamily: 'Georgia, serif', fontSize: 13, fontWeight: 'bold',
            color: '#FFD97A', textShadow: '0 2px 6px rgba(0,0,0,0.95)',
          }}>
            🚀 {s.who}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * One <style> for every strike on screen. The per-strike geometry rides in as
 * custom properties, so the keyframes themselves never change and the browser
 * can keep them compiled.
 */
const KEYFRAMES = `
@keyframes missile-fly {
  from { transform: translate(var(--fx), var(--fy)); }
  to   { transform: translate(var(--tx), var(--ty)); }
}
@keyframes missile-trail {
  from { opacity: 0; width: 30px; }
  30%  { opacity: 1; width: 90px; }
  to   { opacity: 0.25; width: 40px; }
}
@keyframes missile-flash {
  from { opacity: 0; transform: scale(0.35); }
  35%  { opacity: 1; transform: scale(1.05); }
  to   { opacity: 0; transform: scale(1.5); }
}
@keyframes missile-ring {
  from { opacity: 0.95; transform: scale(0.4); }
  to   { opacity: 0; transform: scale(3.4); }
}
@keyframes missile-label {
  from { opacity: 0; transform: translate(-50%, -20%); }
  25%  { opacity: 1; transform: translate(-50%, -60%); }
  75%  { opacity: 1; transform: translate(-50%, -80%); }
  to   { opacity: 0; transform: translate(-50%, -130%); }
}
@media (prefers-reduced-motion: reduce) {
  @keyframes missile-fly { from, to { transform: translate(var(--tx), var(--ty)); } }
}
`
