import type { LiveStatus } from '@/lib/matchSync'
import { buildMismatches, type SeatBuild } from '@/lib/buildPresence'

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
  status, onRetry, expectedOnline = false, build, seat = null, peers = [],
}: {
  status: LiveStatus
  onRetry?: () => void
  /** This GAME is supposed to be online. Idle then stops meaning "hotseat,
   *  nothing to report" and starts meaning "your moves are going nowhere". */
  expectedOnline?: boolean
  /** This client's build — `<version>+<commit>`. Shown beside the marker. */
  build?: string
  /** This client's seat, so its own presence entry is not reported as a peer. */
  seat?: string | null
  /**
   * Every connected client's build, this one included, from presence. A table
   * on more than one build is called out by name — the thing that was
   * invisible until it produced a symptom.
   */
  peers?: readonly SeatBuild[]
}) {
  // The state that cost a whole evening of testing: an online game whose sync
  // never attached, playing perfectly — locally. Every click looked fine on
  // this screen and reached nobody. That must never again be SILENT.
  if (status.state === 'idle' && expectedOnline) {
    return (
      <div style={{
        position: 'fixed', top: 8, left: 8, zIndex: 9000,
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 14px', borderRadius: 20,
        background: 'rgba(224,60,40,0.20)', border: '1.5px solid rgba(224,60,40,0.85)',
        backdropFilter: 'blur(6px)',
        fontFamily: 'Georgia, serif', fontSize: 11.5, color: '#ff9a86', fontWeight: 'bold',
      }}>
        <span style={{
          width: 9, height: 9, borderRadius: '50%', background: '#ff5a3c', flexShrink: 0,
          animation: 'pulse 1.4s ease-in-out infinite',
        }} />
        <span>⚠ NOT CONNECTED — moves are staying on this machine</span>
      </div>
    )
  }
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

  // ── THE TABLE'S BUILDS ─────────────────────────────────────────────────
  // `peers` is every connected client including this one; the others are
  // whoever is not at this seat. A mismatch is anyone on a different build,
  // named — and it is LOUD, like a dropped connection, because it is the same
  // kind of fact: the two screens are not looking at the same game.
  const others = peers.filter(p => p.seat !== seat)
  const differing = build ? buildMismatches(build, others) : []
  const mismatch = differing.length > 0
  const here = peers.length
  const loud = degraded || mismatch
  const table = peers.length
    ? ` · at the table: ${peers.map(p => `${p.name} ${p.build}`).join(', ')}`
    : ''

  return (
    <div
      title={degraded
        ? `${status.message ?? 'Not receiving updates'}${secondsAgo !== null ? ` · last update ${secondsAgo}s ago` : ''}`
        : `Receiving live updates · version ${status.version}${build ? ` · this build ${build}` : ''}${table}`}
      style={{
        position: 'fixed', top: 8, left: 8, zIndex: 9000,
        display: 'flex', alignItems: 'center', gap: 7,
        padding: loud ? '7px 12px' : '5px 10px',
        borderRadius: 20,
        background: mismatch && !degraded ? 'rgba(224,160,112,0.14)' : look.bg,
        border: `1px solid ${mismatch && !degraded ? '#e0a070' : look.color}${loud ? '99' : '44'}`,
        backdropFilter: 'blur(6px)',
        fontFamily: 'Georgia, serif', fontSize: 11, color: look.color,
        // Healthy is a marker, not a message — it must not compete with the board.
        opacity: loud ? 1 : 0.75,
        pointerEvents: loud ? 'auto' : 'none',
      }}
    >
      <span style={{
        width: 8, height: 8, borderRadius: '50%', background: look.dot, flexShrink: 0,
        animation: status.state === 'live' ? undefined : 'pulse 1.4s ease-in-out infinite',
      }} />
      <span>{look.label}</span>
      {/* This build, always; then the table — same build and how many, or who
          is on what. The separators live inside the spans so the badge reads
          as one sentence to anything that reads its text. */}
      {build && <span style={{ opacity: 0.85 }}> · v{build}</span>}
      {build && mismatch && (
        <span style={{ color: '#e0a070', fontWeight: 'bold' }}>
          {' '}· ⚠ {differing.map(d => `${d.name} on ${d.build}`).join(', ')}
        </span>
      )}
      {build && !mismatch && here > 1 && (
        <span style={{ opacity: 0.7 }}> · {here} here, same build</span>
      )}

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
