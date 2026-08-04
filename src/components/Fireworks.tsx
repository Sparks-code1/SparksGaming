import { useEffect, useRef } from 'react'

/** Canvas firework display — shells launch, arc, and burst into falling sparks.
 *  Runs until unmounted. Never blocks clicks. */

const COLORS = ['#C8940A', '#F1C40F', '#E74C3C', '#27AE60', '#2980B9', '#E8DCC8', '#E67E22', '#8E44AD']

interface Particle {
  x: number; y: number
  vx: number; vy: number
  life: number      // 1 → 0
  decay: number
  color: string
  size: number
  /** Shells trail upward and burst; sparks just fall. */
  isShell: boolean
  burstAt: number   // y coordinate a shell bursts at
}

const GRAVITY = 0.035
const DRAG = 0.985

export default function Fireworks({ launchEveryMs = 550 }: { launchEveryMs?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let particles: Particle[] = []
    let lastLaunch = 0

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const launch = () => {
      const x = canvas.width * (0.15 + Math.random() * 0.7)
      particles.push({
        x, y: canvas.height + 10,
        vx: (Math.random() - 0.5) * 1.2,
        vy: -(7.5 + Math.random() * 3),
        life: 1, decay: 0,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size: 2.4,
        isShell: true,
        burstAt: canvas.height * (0.12 + Math.random() * 0.3),
      })
    }

    const burst = (p: Particle) => {
      // Rings of sparks, slightly irregular so bursts don't look stamped.
      const count = 46 + Math.floor(Math.random() * 34)
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.14
        const speed = 1.4 + Math.random() * 3.4
        particles.push({
          x: p.x, y: p.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          decay: 0.008 + Math.random() * 0.012,
          color: Math.random() < 0.22 ? '#FFFFFF' : p.color,
          size: 1.4 + Math.random() * 1.8,
          isShell: false,
          burstAt: 0,
        })
      }
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)

      if (now - lastLaunch > launchEveryMs) {
        launch()
        // Occasional double launch, so the sky isn't metronomic.
        if (Math.random() < 0.35) launch()
        lastLaunch = now
      }

      // Fade rather than clear — leaves light trails behind everything.
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = 'rgba(6, 3, 0, 0.22)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.globalCompositeOperation = 'lighter'

      const next: Particle[] = []
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        p.vy += GRAVITY
        if (!p.isShell) {
          p.vx *= DRAG
          p.vy *= DRAG
          p.life -= p.decay
        }

        if (p.isShell) {
          // Burst at apex, or once the climb is spent.
          if (p.y <= p.burstAt || p.vy >= 0) { burst(p); continue }
        } else if (p.life <= 0 || p.y > canvas.height + 40) {
          continue
        }

        ctx.globalAlpha = p.isShell ? 0.95 : Math.max(0, p.life)
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
        next.push(p)
      }
      // Hard ceiling: a long celebration must not accumulate work forever.
      particles = next.length > 1400 ? next.slice(next.length - 1400) : next
      ctx.globalAlpha = 1
    }

    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [launchEveryMs])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, zIndex: 5990, pointerEvents: 'none' }}
    />
  )
}
