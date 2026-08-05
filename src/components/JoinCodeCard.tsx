import { useState } from 'react'
import { formatJoinCode } from '@/lib/joinCode'

/**
 * The campaign's join code, shown large enough to read across a room.
 *
 * Copy is best-effort: the clipboard API is unavailable on insecure origins and
 * the Electron build's ephemeral-port origin is one, so the code is always
 * rendered as selectable text rather than hidden behind a button that may fail.
 *
 * Lives in its own file because it appears on both the campaign screen and the
 * player-setup screen. Those are the two places you are actually waiting for
 * people, and a code that only exists on one of them is a code nobody can find.
 */
export default function JoinCodeCard({ code, note }: { code: string; note?: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      border: '1px solid rgba(200,148,10,0.40)', borderRadius: 10,
      background: 'rgba(200,148,10,0.06)', padding: '12px 15px', marginBottom: 18,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 9.5, color: '#6a5030', letterSpacing: 1.5, textTransform: 'uppercase' }}>
          Join Code
        </div>
        <div style={{
          fontSize: 26, color: '#E8DCC8', letterSpacing: 6, marginTop: 3,
          fontFamily: 'Menlo, Consolas, monospace', userSelect: 'all',
        }}>
          {formatJoinCode(code)}
        </div>
        <div style={{ fontSize: 10.5, color: '#6a5030', marginTop: 3 }}>
          {note ?? 'Share this so others can join the campaign'}
        </div>
      </div>
      <button onClick={copy} style={{
        padding: '8px 14px', borderRadius: 7, fontSize: 11.5, flexShrink: 0,
        border: `1px solid ${copied ? 'rgba(39,174,96,0.6)' : 'rgba(200,148,10,0.45)'}`,
        background: copied ? 'rgba(39,174,96,0.15)' : 'rgba(200,148,10,0.10)',
        color: copied ? '#27AE60' : '#b09060',
        cursor: 'pointer', fontFamily: 'Georgia, serif',
      }}>
        {copied ? '✓ Copied' : 'Copy'}
      </button>
    </div>
  )
}
