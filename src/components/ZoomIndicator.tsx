import { useEffect, useState } from 'react'
import type { ZoomInfo } from '@/types/desktop'

/**
 * Transient readout of the UI scale.
 *
 * The shortcuts are bound in the Electron main process (they have to be, so
 * they still fire with focus inside the PixiJS canvas), which leaves the
 * renderer with no idea a keypress happened. Without this, Ctrl+Plus is a
 * silent change you can only judge by eye — and at the ladder's smaller steps
 * that is genuinely hard to tell from nothing having happened.
 *
 * Desktop-only: in a browser Ctrl+/- is the browser's own zoom and needs no
 * help from us, so this renders nothing there.
 */
export default function ZoomIndicator() {
  const [info, setInfo] = useState<ZoomInfo | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const desktop = window.desktop
    if (!desktop?.zoom) return
    return desktop.zoom.onChange(next => {
      setInfo(next)
      // 'initial' is the main process telling a fresh page what the scale is —
      // that is not a change the player made, so it should not flash at them.
      if (next.reason && next.reason !== 'initial') setVisible(true)
    })
  }, [])

  useEffect(() => {
    if (!visible) return
    const t = window.setTimeout(() => setVisible(false), 1400)
    return () => window.clearTimeout(t)
  }, [visible, info?.scale])

  if (!info || !visible) return null

  return (
    <div style={{
      position: 'fixed', top: 18, left: '50%', transform: 'translateX(-50%)',
      zIndex: 3000, pointerEvents: 'none',
      background: 'rgba(0,0,0,0.88)', border: '1px solid rgba(200,148,10,0.55)',
      borderRadius: 8, padding: '9px 18px',
      fontFamily: 'Georgia, serif', color: '#E8DCC8',
      display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 4px 18px rgba(0,0,0,0.7)',
    }}>
      <span style={{ fontSize: 11, color: '#8a7040', letterSpacing: 1.5, textTransform: 'uppercase' }}>
        UI Scale
      </span>
      <span style={{ fontSize: 19, fontWeight: 'bold', color: '#C8940A', minWidth: 56, textAlign: 'right' }}>
        {info.percent}
      </span>
      {info.scale !== 1 && (
        <span style={{ fontSize: 10, color: '#6a5030' }}>Ctrl+0 to reset</span>
      )}
    </div>
  )
}
