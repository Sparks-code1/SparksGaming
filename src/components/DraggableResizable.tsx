import { useCallback, useRef, useState, type CSSProperties, type ReactNode } from 'react'

interface Geo { x: number; y: number; w: number; h: number | null }

interface Props {
  /** Title shown in the drag handle. */
  title?: ReactNode
  accentColor?: string
  /** Initial width in px. */
  width?: number
  /** Initial height in px, or null for content-sized (auto) until first resize. */
  height?: number | null
  minWidth?: number
  minHeight?: number
  /** localStorage key — remembers position + size between opens. */
  storageKey?: string
  zIndex?: number
  onClose?: () => void
  /** Default distance from the top of the window (px) on first open. Falls back to vertical centering. */
  initialTop?: number
  /** Default distance from the right edge of the window (px) on first open. Falls back to horizontal centering. */
  initialRight?: number
  children: ReactNode
}

/**
 * A free-floating panel the player can drag anywhere and stretch by the corner.
 * No backdrop — it floats over the board so you can see the map underneath.
 * Position/size persist per `storageKey`.
 */
export default function DraggableResizable({
  title,
  accentColor = '#C8940A',
  width = 460,
  height = null,
  minWidth = 240,
  minHeight = 150,
  storageKey,
  zIndex = 1050,
  onClose,
  initialTop,
  initialRight,
  children,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  const [geo, setGeo] = useState<Geo>(() => {
    if (storageKey) {
      try {
        const s = localStorage.getItem('dr:' + storageKey)
        if (s) {
          const g = JSON.parse(s) as Geo
          // Clamp a stale saved position back on-screen (window may have shrunk).
          g.x = Math.min(Math.max(-g.w + 80, g.x), window.innerWidth - 80)
          g.y = Math.min(Math.max(0, g.y), window.innerHeight - 40)
          return g
        }
      } catch { /* ignore corrupt entry */ }
    }
    const w = Math.min(width, window.innerWidth - 24)
    return {
      x: initialRight != null
        ? Math.max(12, window.innerWidth - w - initialRight)
        : Math.max(12, (window.innerWidth - w) / 2),
      y: initialTop != null
        ? Math.max(12, initialTop)
        : Math.max(12, (window.innerHeight - (height ?? 400)) / 2),
      w,
      h: height,
    }
  })

  const geoRef = useRef(geo)
  geoRef.current = geo
  const gesture = useRef<null | { mode: 'move' | 'resize'; sx: number; sy: number; g: Geo; startH: number }>(null)
  const [active, setActive] = useState(false)

  const onPointerMove = useCallback((e: PointerEvent) => {
    const gs = gesture.current
    if (!gs) return
    const dx = e.clientX - gs.sx
    const dy = e.clientY - gs.sy
    if (gs.mode === 'move') {
      const nx = Math.min(Math.max(-gs.g.w + 80, gs.g.x + dx), window.innerWidth - 80)
      const ny = Math.min(Math.max(0, gs.g.y + dy), window.innerHeight - 40)
      setGeo(prev => ({ ...prev, x: nx, y: ny }))
    } else {
      const nw = Math.max(minWidth, Math.min(gs.g.w + dx, window.innerWidth - gs.g.x - 8))
      const nh = Math.max(minHeight, Math.min(gs.startH + dy, window.innerHeight - gs.g.y - 8))
      setGeo(prev => ({ ...prev, w: nw, h: nh }))
    }
  }, [minWidth, minHeight])

  const endGesture = useCallback(() => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', endGesture)
    gesture.current = null
    setActive(false)
    // Persist from a functional update so we always read the latest committed
    // geometry (a render may not have flushed since the final pointermove).
    setGeo(g => {
      if (storageKey) {
        try { localStorage.setItem('dr:' + storageKey, JSON.stringify(g)) } catch { /* ignore */ }
      }
      return g
    })
  }, [onPointerMove, storageKey])

  const begin = (mode: 'move' | 'resize', e: React.PointerEvent) => {
    e.preventDefault()
    gesture.current = { mode, sx: e.clientX, sy: e.clientY, g: geoRef.current, startH: panelRef.current?.offsetHeight ?? minHeight }
    setActive(true)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', endGesture)
  }

  const startMove = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return
    begin('move', e)
  }
  const startResize = (e: React.PointerEvent) => { e.stopPropagation(); begin('resize', e) }

  const style: CSSProperties = {
    position: 'fixed', left: geo.x, top: geo.y, width: geo.w,
    height: geo.h ?? undefined, maxHeight: '92vh',
    zIndex, display: 'flex', flexDirection: 'column',
    background: 'linear-gradient(155deg, #1A0E02 0%, #0A0600 100%)',
    border: `2px solid ${accentColor}${active ? 'cc' : '88'}`,
    borderRadius: 12,
    boxShadow: `0 0 40px ${accentColor}18, 0 12px 50px rgba(0,0,0,0.85)`,
    color: '#E8DCC8', fontFamily: 'Georgia, serif', overflow: 'hidden',
    userSelect: active ? 'none' : undefined,
  }

  return (
    <div ref={panelRef} style={style}>
      {/* Drag handle */}
      <div
        onPointerDown={startMove}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 8px 8px 12px', cursor: 'move',
          background: `${accentColor}14`, borderBottom: `1px solid ${accentColor}30`,
          touchAction: 'none', flexShrink: 0,
        }}
      >
        <span style={{ color: `${accentColor}99`, fontSize: 13, lineHeight: 1 }}>⠿</span>
        <div style={{
          flex: 1, fontSize: 13, fontWeight: 'bold', color: accentColor,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: 0.5,
        }}>
          {title}
        </div>
        {onClose && (
          <button
            data-no-drag
            onClick={onClose}
            title="Close"
            style={{ background: 'none', border: 'none', color: '#8a7050', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: '0 6px' }}
          >
            ×
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '14px 16px 16px' }}>
        {children}
      </div>

      {/* Resize handle (bottom-right corner) */}
      <div
        onPointerDown={startResize}
        title="Drag to resize"
        style={{
          position: 'absolute', right: 0, bottom: 0, width: 20, height: 20,
          cursor: 'nwse-resize', touchAction: 'none',
          background: `linear-gradient(135deg, transparent 45%, ${accentColor}66 45%, ${accentColor}66 55%, transparent 55%, transparent 70%, ${accentColor}66 70%, ${accentColor}66 80%, transparent 80%)`,
        }}
      />
    </div>
  )
}
