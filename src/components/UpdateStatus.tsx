import { useEffect, useState } from 'react'
import type { UpdateStatus as Status } from '@/types/desktop'

/**
 * Desktop update indicator — a small pill in the bottom-left corner.
 *
 * Renders nothing at all in the browser: `window.desktop` only exists inside the
 * Electron shell, so the web build is untouched. Inside the app it stays a quiet
 * version label until something is actually happening, and carries the manual
 * "Check for updates" action so that option is always reachable.
 */
export default function UpdateStatus() {
  const bridge = typeof window !== 'undefined' ? window.desktop : undefined
  const [status, setStatus] = useState<Status | null>(null)
  const [appVersion, setAppVersion] = useState<string>('')
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!bridge) return
    // Catch up on whatever happened before this mounted, then subscribe.
    bridge.updates.getState().then(setStatus).catch(() => {})
    bridge.getAppVersion().then(setAppVersion).catch(() => {})
    return bridge.updates.onStatus(setStatus)
  }, [bridge])

  if (!bridge) return null

  const state = status?.state ?? 'idle'
  const version = status?.version
  const percent = status?.percent ?? 0
  const busy = state === 'checking' || state === 'downloading'
  const ready = state === 'ready'

  // Colour follows urgency: gold when a restart is waiting, blue while working,
  // muted otherwise so it never competes with the board.
  const accent = ready ? '#C8940A' : busy ? '#2980B9' : '#6a5030'

  const label = (() => {
    switch (state) {
      case 'checking':    return 'Checking for updates…'
      case 'downloading': return `Downloading update${version ? ` ${version}` : ''} — ${percent}%`
      case 'ready':       return `Update ${version ?? ''} ready — restart to install`.replace('  ', ' ')
      case 'current':     return 'Up to date'
      case 'error':       return 'Update check failed — you can keep playing'
      case 'disabled':    return status?.reason ?? 'Updates unavailable'
      default:            return appVersion ? `v${appVersion}` : 'Risk Legacy'
    }
  })()

  // The label is always visible — a bare dot in the corner gives no hint that
  // there is anything to click, and an error glyph with no words says nothing.
  // The actions stay tucked away until hovered, unless they are the point:
  // a waiting restart, or an error the player may want to retry.
  const showActions = expanded || ready || state === 'error'

  return (
    <div
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      style={{
        position: 'fixed', left: 10, bottom: 10, zIndex: 4000,
        display: 'flex', alignItems: 'center', gap: 9,
        padding: showActions ? '7px 12px' : '5px 10px',
        borderRadius: 20,
        background: 'rgba(10,6,2,0.88)',
        border: `1px solid ${accent}66`,
        color: '#B8A880', fontFamily: 'Georgia, serif', fontSize: 11,
        boxShadow: ready ? `0 0 14px ${accent}55` : 'none',
        transition: 'padding 140ms ease, border-color 140ms ease',
        maxWidth: '70vw',
      }}
    >
      <span style={{ color: accent, fontSize: 12, lineHeight: 1 }}>
        {ready ? '⭮' : busy ? '⟳' : state === 'error' ? '⚠' : '●'}
      </span>

      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </span>

      {/* Progress bar only while bytes are moving. */}
      {state === 'downloading' && (
        <span style={{
          width: 60, height: 4, borderRadius: 2,
          background: 'rgba(255,255,255,0.10)', overflow: 'hidden', flexShrink: 0,
        }}>
          <span style={{
            display: 'block', height: '100%', width: `${Math.min(100, Math.max(0, percent))}%`,
            background: accent, transition: 'width 200ms linear',
          }} />
        </span>
      )}

      {ready && (
        <button
          onClick={() => { bridge.updates.restart().catch(() => {}) }}
          style={{
            padding: '3px 10px', borderRadius: 11, cursor: 'pointer',
            border: `1px solid ${accent}`, background: 'rgba(200,148,10,0.18)',
            color: '#E8DCC8', fontFamily: 'Georgia, serif', fontSize: 10.5,
          }}>
          Restart now
        </button>
      )}

      {showActions && !ready && state !== 'disabled' && (
        <button
          onClick={() => { setStatus({ state: 'checking' }); bridge.updates.check().catch(() => {}) }}
          disabled={busy}
          title="Check for updates"
          style={{
            padding: '3px 10px', borderRadius: 11,
            cursor: busy ? 'default' : 'pointer',
            border: '1px solid rgba(200,148,10,0.40)', background: 'transparent',
            color: busy ? '#5a4020' : '#C8940A', fontFamily: 'Georgia, serif', fontSize: 10.5,
            whiteSpace: 'nowrap',
          }}>
          Check for updates
        </button>
      )}
    </div>
  )
}
