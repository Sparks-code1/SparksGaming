import { useEffect, useState } from 'react'
import { onLegacyConnection, retryLastSave, type ConnectionStatus as Status } from '@/lib/legacyApi'

/**
 * Supabase connection indicator.
 *
 * A legacy campaign has no local persistence — no localStorage, no file on
 * disk. If the database is unreachable the session runs entirely in memory and
 * every scar, city and result is lost on reload. That makes a silent failure
 * the worst outcome, so a failed write raises a banner that stays up until a
 * write succeeds, and the healthy case still shows a quiet "Saved" marker so
 * the table can tell the difference between working and merely idle.
 *
 * Mounted once at the app root, so it covers the lobby and setup screens too —
 * those write to Supabase as well (roster creation, scar dealing, new campaign).
 */
export default function ConnectionStatus() {
  const [status, setStatus] = useState<Status>({ state: 'unknown', failures: 0 })
  const [retrying, setRetrying] = useState(false)

  useEffect(() => onLegacyConnection(setStatus), [])

  const failed = status.state === 'error'

  async function retry() {
    setRetrying(true)
    // A success flips the status to 'ok' and this banner unmounts itself;
    // a failure re-fires the listener with a fresh message.
    try { await retryLastSave() } catch { /* status already reflects it */ }
    setRetrying(false)
  }

  if (failed) {
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9000,
        background: 'rgba(120,20,15,0.97)', borderBottom: '2px solid #e74c3c',
        padding: '10px 18px', fontFamily: 'Georgia, serif', color: '#FFE8E0',
        display: 'flex', alignItems: 'center', gap: 14, fontSize: 12.5,
        boxShadow: '0 4px 18px rgba(0,0,0,0.55)',
      }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>⚠</span>
        <div style={{ flex: 1, lineHeight: 1.45, minWidth: 0 }}>
          <strong>Not connected — your progress is not being saved.</strong>{' '}
          Everything from this session is only in memory; reloading or closing the
          game now loses it. Check your connection, then retry.
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {status.message}
            {status.failures > 1 ? ` · ${status.failures} failed attempts` : ''}
            {status.lastSavedAt
              ? ` · last saved ${new Date(status.lastSavedAt).toLocaleTimeString()}`
              : ' · nothing has been saved this session'}
          </div>
        </div>
        <button
          onClick={retry}
          disabled={retrying}
          style={{
            padding: '6px 14px', borderRadius: 6, flexShrink: 0,
            cursor: retrying ? 'default' : 'pointer',
            border: '1.5px solid rgba(255,235,225,0.6)',
            background: retrying ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.25)',
            color: '#FFE8E0', fontFamily: 'Georgia, serif', fontSize: 12,
          }}>
          {retrying ? 'Retrying…' : 'Retry save'}
        </button>
      </div>
    )
  }

  // Healthy: a quiet marker, so "no banner" is not the only signal that saving
  // works. Nothing is shown before the first write — there is nothing to report.
  if (status.state === 'unknown') return null

  const saving = status.state === 'saving'
  const accent = saving ? '#2980B9' : '#27AE60'

  return (
    <div
      title={status.lastSavedAt ? `Last saved ${new Date(status.lastSavedAt).toLocaleTimeString()}` : 'Connected'}
      style={{
        position: 'fixed', right: 10, bottom: 10, zIndex: 4000,
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '5px 11px', borderRadius: 20,
        background: 'rgba(10,6,2,0.85)', border: `1px solid ${accent}55`,
        color: '#8a7a5a', fontFamily: 'Georgia, serif', fontSize: 10.5,
        pointerEvents: 'none',
      }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%', background: accent,
        boxShadow: `0 0 6px ${accent}`, flexShrink: 0,
      }} />
      {saving ? 'Saving…' : 'Saved'}
    </div>
  )
}
