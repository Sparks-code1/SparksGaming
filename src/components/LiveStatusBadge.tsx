import type { LiveStatus } from '@/lib/matchSync'

/**
 * Whether this client is still hearing from the match.
 *
 * A board that has stopped updating is indistinguishable from a board where
 * nobody is moving — you sit there thinking the other player is deliberating
 * while you have actually been disconnected for two minutes. That is the whole
 * reason this exists, so the disconnected states are loud and the healthy one
 * is quiet.
 *
 * Renders nothing in hotseat: there is no connection to report on.
 */
export default function LiveStatusBadge({
  status, onRetry,
}: {
  status: LiveStatus
  onRetry?: () => void
}) {
  if (status.state === 'idle') return null

  const look = {
    connecting:   { color: '#C8940A', bg: 'rgba(200,148,10,0.12)', dot: '#C8940A', label: 'Connecting…' },
    live:         { color: '#4a9a5a', bg: 'rgba(74,154,90,0.10)',  dot: '#5fd07a', label: 'Live' },
    reconnecting: { color: '#e0a070', bg: 'rgba(224,160,112,0.14)', dot: '#e0a070', label: 'Reconnecting…' },
    offline:      { color: '#e05a30', bg: 'rgba(224,90,48,0.16)',  dot: '#e05a30', label: 'Disconnected' },
    idle:         { color: '#6a5030', bg: 'transparent',            dot: '#6a5030', label: '' },
  }[status.state]

  const degraded = status.state === 'reconnecting' || status.state === 'offline'
  const secondsAgo = status.lastSyncAt ? Math.round((Date.now() - status.lastSyncAt) / 1000) : null

  return (
    <div
      title={degraded
        ? `${status.message ?? 'Not receiving updates'}${secondsAgo !== null ? ` · last update ${secondsAgo}s ago` : ''}`
        : `Receiving live updates · version ${status.version}`}
      style={{
        position: 'fixed', top: 8, left: 8, zIndex: 9000,
        display: 'flex', alignItems: 'center', gap: 7,
        padding: degraded ? '7px 12px' : '5px 10px',
        borderRadius: 20,
        background: look.bg,
        border: `1px solid ${look.color}${degraded ? '99' : '44'}`,
        backdropFilter: 'blur(6px)',
        fontFamily: 'Georgia, serif', fontSize: 11, color: look.color,
        // Healthy is a marker, not a message — it must not compete with the board.
        opacity: degraded ? 1 : 0.75,
        pointerEvents: degraded ? 'auto' : 'none',
      }}
    >
      <span style={{
        width: 8, height: 8, borderRadius: '50%', background: look.dot, flexShrink: 0,
        animation: status.state === 'live' ? undefined : 'pulse 1.4s ease-in-out infinite',
      }} />
      <span>{look.label}</span>

      {degraded && (
        <>
          {secondsAgo !== null && (
            <span style={{ fontSize: 10, opacity: 0.8 }}>· {secondsAgo}s behind</span>
          )}
          {onRetry && (
            <button
              onClick={onRetry}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                color: look.color, fontFamily: 'Georgia, serif', fontSize: 10.5,
                textDecoration: 'underline',
              }}>
              retry now
            </button>
          )}
        </>
      )}
    </div>
  )
}
