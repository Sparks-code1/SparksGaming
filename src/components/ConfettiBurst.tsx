import { useEffect, useMemo, useState } from 'react'

/** Full-screen celebratory particle burst — pure CSS, self-removing.
 *  Render with a changing `key` to re-fire. Sits above modals, never blocks clicks. */

const DEFAULT_COLORS = ['#C8940A', '#F1C40F', '#E74C3C', '#27AE60', '#2980B9', '#E8DCC8', '#E67E22', '#8E44AD']

interface Piece {
  left: number       // launch x (% of screen width)
  top: number        // launch y (% of screen height)
  dx: number         // drift x (px)
  dy: number         // fall y (px)
  rot: number        // total rotation (deg)
  dur: number        // seconds
  size: number
  color: string
  round: boolean
}

export default function ConfettiBurst({
  count = 90,
  colors = DEFAULT_COLORS,
  originY = 38,
  duration = 2600,
}: {
  count?: number
  colors?: string[]
  /** Vertical burst origin as % of screen height */
  originY?: number
  /** ms before the layer removes itself */
  duration?: number
}) {
  const [gone, setGone] = useState(false)

  const pieces = useMemo<Piece[]>(() =>
    Array.from({ length: count }, () => {
      const angle = Math.random() * Math.PI * 2
      const force = 120 + Math.random() * 320
      return {
        left: 50 + (Math.random() - 0.5) * 24,
        top: originY + (Math.random() - 0.5) * 10,
        dx: Math.cos(angle) * force,
        dy: Math.sin(angle) * force * 0.5 + 260 + Math.random() * 240,  // bias downward — gravity
        rot: (Math.random() - 0.5) * 1080,
        dur: 1.4 + Math.random() * 1.2,
        size: 5 + Math.random() * 7,
        color: colors[Math.floor(Math.random() * colors.length)],
        round: Math.random() < 0.35,
      }
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [])

  useEffect(() => {
    const t = setTimeout(() => setGone(true), duration)
    return () => clearTimeout(t)
  }, [duration])

  if (gone) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 6000,
      pointerEvents: 'none', overflow: 'hidden',
    }}>
      {pieces.map((p, i) => (
        <div
          key={i}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.round ? p.size : p.size * 0.45,
            borderRadius: p.round ? '50%' : 1,
            background: p.color,
            boxShadow: `0 0 4px ${p.color}66`,
            ['--cx' as string]: `${p.dx}px`,
            ['--cy' as string]: `${p.dy}px`,
            ['--cr' as string]: `${p.rot}deg`,
            ['--cd' as string]: `${p.dur}s`,
          }}
        />
      ))}
    </div>
  )
}
