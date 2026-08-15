import { useEffect, useRef, useState } from 'react'
import { signOut, type AuthUser } from '@/lib/auth'
import type { LegacyState } from '@/types/legacy'
import { rosterMemberForUser } from '@/lib/roster'
import AuthPanel from './AuthPanel'

interface Props {
  user: AuthUser | null
  legacy: LegacyState | null
  /** What this player calls themself — used to fill in every join form. */
  playerName: string
  onNameChange: (name: string) => void
  onAuthed: (user: AuthUser) => void
  onSignedOut: () => void
  onClaimSeat: (playerId: string) => Promise<string | null>
}

const GOLD = '#C8940A'

/**
 * The account, folded into one small button.
 *
 * It used to be a permanent panel above the campaign — three buttons and a
 * paragraph explaining that accounts are optional, in the way every time the
 * app opened. Everything it did still lives here, one click further in:
 * sign in or out, link a roster seat, and set the name that fills in every
 * join form so it never has to be typed again.
 */
export default function AccountMenu({
  user, legacy, playerName, onNameChange, onAuthed, onSignedOut, onClaimSeat,
}: Props) {
  const [open, setOpen] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const [draftName, setDraftName] = useState(playerName)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => { setDraftName(playerName) }, [playerName])

  // Click anywhere else to dismiss — a menu that traps you is worse than the
  // panel it replaced.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) { setOpen(false); setSigningIn(false) }
    }
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setSigningIn(false) } }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onEsc)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onEsc) }
  }, [open])

  const claimed = rosterMemberForUser(legacy, user?.id)
  const label = playerName || claimed?.name || (user ? 'My Account' : 'My Account')

  function saveName() {
    const next = draftName.trim()
    if (!next) return
    onNameChange(next)
    setNotice(`Saved — games will join you as ${next}`)
    window.setTimeout(() => setNotice(null), 2500)
  }

  async function handleSignOut() {
    setBusy(true)
    const r = await signOut()
    setBusy(false)
    if (!r.ok) { setNotice(r.message ?? 'Could not sign out.'); return }
    onSignedOut()
    setOpen(false)
  }

  return (
    <div ref={boxRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          padding: '5px 13px', borderRadius: 14, fontSize: 11,
          border: '1px solid rgba(200,148,10,0.35)', background: 'rgba(200,148,10,0.08)',
          color: '#9a8060', cursor: 'pointer', fontFamily: 'Georgia, serif',
        }}>
        👤 {label}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '110%', right: 0, zIndex: 500, width: 300,
          background: 'linear-gradient(155deg, #1A0E02 0%, #0A0600 100%)',
          border: '1.5px solid rgba(200,148,10,0.45)', borderRadius: 10,
          padding: '14px 15px', boxShadow: '0 12px 40px rgba(0,0,0,0.85)',
          textAlign: 'left',
        }}>
          {signingIn ? (
            <AuthPanel
              user={user}
              legacy={legacy}
              onAuthed={u => { onAuthed(u); setSigningIn(false) }}
              onSignedOut={onSignedOut}
              onContinueWithout={() => setSigningIn(false)}
              onClaimSeat={onClaimSeat}
            />
          ) : (
            <>
              {/* ── Your name ── */}
              <div style={{ fontSize: 10, color: '#6a5030', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 7 }}>
                Your name
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                <input
                  value={draftName}
                  onChange={e => setDraftName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveName() }}
                  maxLength={24}
                  placeholder="Your name"
                  style={{
                    flex: 1, padding: '7px 10px', borderRadius: 6, minWidth: 0,
                    border: '1.5px solid rgba(200,148,10,0.35)', background: 'rgba(0,0,0,0.45)',
                    color: '#E8DCC8', fontSize: 13, fontFamily: 'Georgia, serif',
                  }}
                />
                <button
                  onClick={saveName}
                  disabled={!draftName.trim() || draftName.trim() === playerName}
                  style={{
                    padding: '7px 12px', borderRadius: 6, fontSize: 12, fontFamily: 'Georgia, serif',
                    border: '1.5px solid rgba(200,148,10,0.55)', background: 'rgba(200,148,10,0.14)',
                    color: draftName.trim() && draftName.trim() !== playerName ? '#E8DCC8' : '#5a4526',
                    cursor: draftName.trim() && draftName.trim() !== playerName ? 'pointer' : 'default',
                  }}>
                  Save
                </button>
              </div>
              <div style={{ fontSize: 10, color: '#6a5030', lineHeight: 1.5, marginBottom: 12 }}>
                Games you join use this name automatically.
              </div>

              {/* ── Account ── */}
              <div style={{
                borderTop: '1px solid rgba(200,148,10,0.15)', paddingTop: 10,
                fontSize: 11.5, color: '#9a8060', lineHeight: 1.5,
              }}>
                {user ? (
                  <>
                    <div style={{ marginBottom: 8 }}>
                      Signed in as <strong style={{ color: GOLD }}>{user.email}</strong>
                      {claimed && <><br />Linked to <strong style={{ color: GOLD }}>{claimed.name}</strong></>}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setSigningIn(true)} style={ghost}>Account options</button>
                      <button onClick={handleSignOut} disabled={busy} style={ghost}>Sign out</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ marginBottom: 8, color: '#7a6040' }}>
                      Playing as a guest. An account carries your campaign record to another machine — optional.
                    </div>
                    <button onClick={() => setSigningIn(true)} style={ghost}>Sign in or sign up</button>
                  </>
                )}
              </div>

              {notice && (
                <div style={{ marginTop: 10, fontSize: 11, color: '#7fc79a' }}>{notice}</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

const ghost: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 6, fontSize: 12, fontFamily: 'Georgia, serif',
  cursor: 'pointer', border: '1px solid rgba(200,148,10,0.30)',
  background: 'transparent', color: '#9a8060',
}
