import { useState } from 'react'
import { signIn, signUp, signOut, type AuthUser } from '@/lib/auth'
import type { LegacyState } from '@/types/legacy'
import { getRoster, rosterMemberForUser } from '@/lib/roster'

type Mode = 'choose' | 'signin' | 'signup' | 'confirm'

interface Props {
  user: AuthUser | null
  legacy: LegacyState | null
  /** Called after a successful sign-in / sign-up so the host can refresh. */
  onAuthed: (user: AuthUser) => void
  onSignedOut: () => void
  /** Dismiss the panel and play without an account. */
  onContinueWithout: () => void
  /** Link the signed-in account to a roster seat. */
  onClaimSeat: (playerId: string) => Promise<string | null>
}

const GOLD = '#C8940A'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 13px', borderRadius: 6,
  border: '1.5px solid rgba(200,148,10,0.40)',
  background: 'rgba(0,0,0,0.40)', color: '#E8DCC8',
  fontSize: 14, fontFamily: 'Georgia, serif', boxSizing: 'border-box',
}

/**
 * Account options on the campaign screen.
 *
 * Accounts are OPTIONAL. Every state of this panel keeps a way through to the
 * game without one — including when the auth service is unreachable, which is
 * shown as an error beside a working "Continue Without Account" button rather
 * than as a dead end.
 */
export default function AuthPanel({
  user, legacy, onAuthed, onSignedOut, onContinueWithout, onClaimSeat,
}: Props) {
  const [mode, setMode] = useState<Mode>('choose')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const roster = getRoster(legacy)
  const claimed = rosterMemberForUser(legacy, user?.id)

  async function submit(kind: 'signin' | 'signup') {
    setBusy(true); setError(null); setNotice(null)
    const result = kind === 'signin' ? await signIn(email, password) : await signUp(email, password)
    setBusy(false)
    if (!result.ok) { setError(result.message); return }
    if (result.user === null) {   // signed up, awaiting email confirmation
      setMode('confirm')
      setNotice(`We sent a confirmation link to ${result.email}. Confirm it, then sign in.`)
      return
    }
    setPassword('')
    onAuthed(result.user)
  }

  async function handleSignOut() {
    setBusy(true)
    const r = await signOut()
    setBusy(false)
    if (!r.ok) { setError(r.message ?? 'Could not sign out.'); return }
    setMode('choose'); setEmail(''); setPassword('')
    onSignedOut()
  }

  async function claim(playerId: string) {
    setBusy(true); setError(null); setNotice(null)
    const failure = await onClaimSeat(playerId)
    setBusy(false)
    if (failure) setError(failure)
    else setNotice('Seat linked — your campaign record now follows this account.')
  }

  // ── Signed in ────────────────────────────────────────────────────────────
  if (user) {
    return (
      <Frame>
        <div style={{ fontSize: 12, color: '#9a8060', marginBottom: 10 }}>
          Signed in as <strong style={{ color: GOLD }}>{user.email}</strong>
        </div>

        {claimed ? (
          <div style={{ fontSize: 12, color: '#B8A880', marginBottom: 12, lineHeight: 1.5 }}>
            Linked to <strong style={{ color: GOLD }}>{claimed.name}</strong> — signatures, cities and
            faction choices for that player follow this account.
          </div>
        ) : roster.length > 0 ? (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11.5, color: '#9a8060', marginBottom: 7, lineHeight: 1.5 }}>
              Link this account to a player so their campaign record follows you to another machine.
              Optional — the campaign plays the same either way.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {roster.map(m => {
                const takenByOther = !!m.userId && m.userId !== user.id
                return (
                  <button
                    key={m.id}
                    onClick={() => claim(m.id)}
                    disabled={busy || takenByOther}
                    title={takenByOther ? 'Already linked to another account' : `Link to ${m.name}`}
                    style={{
                      padding: '5px 12px', borderRadius: 14, fontSize: 12,
                      fontFamily: 'Georgia, serif',
                      cursor: takenByOther || busy ? 'not-allowed' : 'pointer',
                      border: `1px solid ${takenByOther ? 'rgba(100,75,25,0.30)' : 'rgba(200,148,10,0.45)'}`,
                      background: 'transparent',
                      color: takenByOther ? '#4a3820' : '#C8940A',
                      opacity: takenByOther ? 0.5 : 1,
                    }}>
                    {m.name}{takenByOther ? ' ·  linked' : ''}
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 11.5, color: '#7a6040', marginBottom: 12, fontStyle: 'italic' }}>
            No roster yet — you can link this account to a player once the first game names them.
          </div>
        )}

        {notice && <Note tone="ok">{notice}</Note>}
        {error && <Note tone="bad">{error}</Note>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onContinueWithout} disabled={busy} style={primary}>Continue →</button>
          <button onClick={handleSignOut} disabled={busy} style={ghost}>Sign out</button>
        </div>
      </Frame>
    )
  }

  // ── Confirmation pending ─────────────────────────────────────────────────
  if (mode === 'confirm') {
    return (
      <Frame>
        <div style={{ fontSize: 14, color: GOLD, fontWeight: 'bold', marginBottom: 8 }}>Confirm your email</div>
        {notice && <Note tone="ok">{notice}</Note>}
        <div style={{ fontSize: 11.5, color: '#7a6040', lineHeight: 1.5, marginBottom: 12 }}>
          Your account exists but needs confirming before it can sign in. Nothing is blocked —
          you can play now and sign in later.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setMode('signin'); setNotice(null) }} style={primary}>Sign in</button>
          <button onClick={onContinueWithout} style={ghost}>Continue without account</button>
        </div>
      </Frame>
    )
  }

  // ── Choose ───────────────────────────────────────────────────────────────
  if (mode === 'choose') {
    return (
      <Frame>
        <div style={{ fontSize: 11.5, color: '#7a6040', lineHeight: 1.55, marginBottom: 14 }}>
          An account lets your campaign record — signatures, cities, faction choices — follow you to
          another machine. It is entirely optional; the game plays the same without one.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => { setMode('signin'); setError(null) }} style={primary}>Sign In</button>
          <button onClick={() => { setMode('signup'); setError(null) }} style={ghost}>Sign Up</button>
          <button onClick={onContinueWithout} style={ghost}>Continue Without Account</button>
        </div>
      </Frame>
    )
  }

  // ── Sign in / Sign up form ───────────────────────────────────────────────
  const signingUp = mode === 'signup'
  return (
    <Frame>
      <div style={{ fontSize: 14, color: GOLD, fontWeight: 'bold', marginBottom: 12 }}>
        {signingUp ? 'Create an account' : 'Sign in'}
      </div>
      <input
        type="email" value={email} placeholder="Email" autoComplete="email"
        onChange={e => setEmail(e.target.value)}
        style={{ ...inputStyle, marginBottom: 8 }}
      />
      <input
        type="password" value={password} placeholder="Password"
        autoComplete={signingUp ? 'new-password' : 'current-password'}
        onChange={e => setPassword(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !busy) submit(signingUp ? 'signup' : 'signin') }}
        style={{ ...inputStyle, marginBottom: 10 }}
      />
      {error && <Note tone="bad">{error}</Note>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => submit(signingUp ? 'signup' : 'signin')} disabled={busy} style={primary}>
          {busy ? 'Working…' : signingUp ? 'Create account' : 'Sign in'}
        </button>
        <button onClick={() => { setMode(signingUp ? 'signin' : 'signup'); setError(null) }} disabled={busy} style={ghost}>
          {signingUp ? 'I have an account' : 'Create one'}
        </button>
        <button onClick={onContinueWithout} disabled={busy} style={ghost}>Continue Without Account</button>
      </div>
    </Frame>
  )
}

// ─── Small presentational helpers ──────────────────────────────────────────

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      border: '1px solid rgba(200,148,10,0.28)', borderRadius: 9,
      background: 'rgba(0,0,0,0.28)', padding: '14px 16px', marginBottom: 20,
    }}>
      <div style={{
        fontSize: 10, color: '#6a5030', letterSpacing: 1.5, textTransform: 'uppercase',
        marginBottom: 10, borderBottom: '1px solid rgba(200,148,10,0.15)', paddingBottom: 5,
      }}>
        Account
      </div>
      {children}
    </div>
  )
}

function Note({ tone, children }: { tone: 'ok' | 'bad'; children: React.ReactNode }) {
  const bad = tone === 'bad'
  return (
    <div style={{
      padding: '7px 10px', borderRadius: 6, marginBottom: 10, fontSize: 11.5, lineHeight: 1.45,
      background: bad ? 'rgba(231,76,60,0.10)' : 'rgba(39,174,96,0.10)',
      border: `1px solid ${bad ? 'rgba(231,76,60,0.40)' : 'rgba(39,174,96,0.35)'}`,
      color: bad ? '#e08070' : '#7fc79a',
    }}>
      {children}
    </div>
  )
}

const primary: React.CSSProperties = {
  padding: '8px 18px', borderRadius: 7, fontSize: 13, fontFamily: 'Georgia, serif',
  cursor: 'pointer', border: '1.5px solid rgba(200,148,10,0.70)',
  background: 'rgba(200,148,10,0.16)', color: '#E8DCC8',
}

const ghost: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 7, fontSize: 13, fontFamily: 'Georgia, serif',
  cursor: 'pointer', border: '1px solid rgba(200,148,10,0.30)',
  background: 'transparent', color: '#9a8060',
}
