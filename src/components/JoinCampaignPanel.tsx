import { useState } from 'react'
import { findCampaignByJoinCode, joinCampaign, type JoinLookup } from '@/lib/legacyApi'
import { normalizeJoinCode, isValidJoinCode, JOIN_CODE_LENGTH } from '@/lib/joinCode'
import { getRoster, nextRosterId, MAX_ROSTER } from '@/lib/roster'
import type { AuthUser } from '@/lib/auth'

interface Props {
  /** Signed-in account, if any. Guests join by picking an unclaimed name. */
  user: AuthUser | null
  /** The name this player already goes by — fills the form in for them. */
  defaultName?: string
  /** Joined successfully — the caller opens the campaign as `playerId`. */
  onJoined: (campaignId: string, playerId: string) => void
  /** A name they typed here becomes the one this device remembers. */
  onNameChosen?: (name: string) => void
  onCancel: () => void
}

const GOLD = '#C8940A'

/**
 * Join an existing campaign with a code.
 *
 * Two steps on purpose: look the code up first and show what it found, so a
 * player can confirm they are joining the right world — and see who is already
 * in it — before committing to a roster entry that is permanent.
 */
export default function JoinCampaignPanel({ user, defaultName = '', onJoined, onNameChosen, onCancel }: Props) {
  const [code, setCode] = useState('')
  const [found, setFound] = useState<JoinLookup | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Step 2 choices
  const [name, setName] = useState('')
  const [seatId, setSeatId] = useState<string | null>(null)

  const ready = isValidJoinCode(code)

  async function lookup() {
    setBusy(true)
    setError(null)
    try {
      const hit = await findCampaignByJoinCode(code)
      if (!hit) {
        setError('No campaign has that code. Check it and try again.')
      } else {
        setFound(hit)
        // Default the joiner toward whichever action the campaign allows.
        const free = getRoster(hit.legacy).filter(m => !m.userId)
        setSeatId(user ? null : (free[0]?.id ?? null))
        // The name they already go by, before falling back to their email.
        setName(defaultName.trim() || user?.email?.split('@')[0] || '')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the campaign server')
    } finally {
      setBusy(false)
    }
  }

  async function commit() {
    if (!found) return
    setBusy(true)
    setError(null)
    try {
      const result = await joinCampaign(
        found.campaignId,
        seatId
          ? { kind: 'existing', playerId: seatId, userId: user?.id, userEmail: user?.email }
          : { kind: 'new', name, userId: user?.id, userEmail: user?.email },
      )
      if (!seatId && name.trim()) onNameChosen?.(name.trim())
      onJoined(found.campaignId, result.playerId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join that campaign')
      setBusy(false)
    }
  }

  // ── Step 1: the code ──────────────────────────────────────────────────────
  if (!found) {
    return (
      <Frame title="Join a Campaign" onCancel={onCancel}>
        <p style={hint}>
          Ask the campaign host for their six-character code.
        </p>
        <input
          value={code}
          autoFocus
          onChange={e => { setCode(normalizeJoinCode(e.target.value)); setError(null) }}
          onKeyDown={e => { if (e.key === 'Enter' && ready && !busy) lookup() }}
          placeholder="ABC123"
          aria-label="Campaign join code"
          style={{
            width: '100%', padding: '13px 14px', borderRadius: 7,
            border: `1.5px solid ${ready ? 'rgba(200,148,10,0.8)' : 'rgba(200,148,10,0.40)'}`,
            background: 'rgba(0,0,0,0.45)', color: '#E8DCC8',
            fontSize: 24, letterSpacing: 8, textAlign: 'center',
            fontFamily: 'Menlo, Consolas, monospace', boxSizing: 'border-box',
          }}
        />
        <div style={{ fontSize: 10.5, color: '#5a4020', textAlign: 'center', marginTop: 6 }}>
          {code.length}/{JOIN_CODE_LENGTH} · letters and numbers, case doesn't matter
        </div>
        {error && <ErrorBox>{error}</ErrorBox>}
        <button onClick={lookup} disabled={!ready || busy} style={primary(!ready || busy)}>
          {busy ? 'Looking up…' : 'Find Campaign'}
        </button>
      </Frame>
    )
  }

  // ── Step 2: who you are in it ─────────────────────────────────────────────
  const roster = getRoster(found.legacy)
  const hasRoom = nextRosterId(roster) !== null
  // A guest has no account to link, so the only honest option is to take a name
  // already on the roster — otherwise two devices would silently be "Chris".
  const canAddNew = hasRoom && (!!user || roster.length === 0)
  /** The seat this account already holds, if it is in this campaign already. */
  const mySeat = user ? roster.find(m => m.userId === user.id) : undefined

  /**
   * Why joining is impossible from here, or null when it is possible.
   *
   * The commit button used to ignore all of this: `name` is prefilled from the
   * signed-in email during lookup, so on a FULL campaign — where the name field
   * is not even rendered — the button still read "Join as sparksjohnr" and was
   * enabled. Clicking it round-tripped to Supabase only to come back with
   * "This campaign is full". The refusal was always visible; it just arrived
   * after a click that never had a chance.
   */
  const blocked: string | null =
    mySeat ? `You are already in this campaign as ${mySeat.name}.`
    : !seatId && !canAddNew
      ? (hasRoom
          ? 'Every name here is taken. Sign in to join as someone new.'
          : `This campaign is full — ${MAX_ROSTER} players is the maximum.`)
    : null

  const commitDisabled = busy || !!blocked || (!seatId && !name.trim())

  return (
    <Frame title="Join a Campaign" onCancel={onCancel}>
      <div style={{
        border: '1px solid rgba(200,148,10,0.35)', borderRadius: 9,
        background: 'rgba(0,0,0,0.28)', padding: '12px 14px', marginBottom: 16,
      }}>
        <div style={{ fontSize: 16, color: '#E8DCC8', fontWeight: 'bold' }}>{found.worldName}</div>
        <div style={{ fontSize: 11, color: '#7a6040', marginTop: 3 }}>
          Game {found.legacy.currentGameNumber} of 15 · {roster.length}/{MAX_ROSTER} players
        </div>
        {roster.length > 0 && (
          <div style={{ fontSize: 10.5, color: '#5a4020', marginTop: 4 }}>
            {roster.map(m => m.name + (m.userId ? ' ✓' : '')).join(' · ')}
          </div>
        )}
      </div>

      {roster.length > 0 && (
        <>
          <Label>{user ? 'Already on the roster? Take that name' : 'Which player are you?'}</Label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {roster.map(m => {
              const claimed = !!m.userId
              const selected = seatId === m.id
              return (
                <button
                  key={m.id}
                  disabled={claimed}
                  title={claimed ? `${m.name} is linked to an account` : undefined}
                  onClick={() => { setSeatId(selected ? null : m.id); setError(null) }}
                  style={{
                    padding: '7px 13px', borderRadius: 18, fontSize: 12,
                    fontFamily: 'Georgia, serif', cursor: claimed ? 'not-allowed' : 'pointer',
                    border: `1.5px solid ${selected ? GOLD : 'rgba(200,148,10,0.25)'}`,
                    background: selected ? 'rgba(200,148,10,0.22)' : 'transparent',
                    color: claimed ? '#4a3820' : selected ? '#E8DCC8' : '#9a8060',
                    textDecoration: claimed ? 'line-through' : 'none',
                  }}>
                  {m.name}{claimed ? ' · taken' : ''}
                </button>
              )
            })}
          </div>
        </>
      )}

      {canAddNew && (
        <>
          <Label>{roster.length > 0 ? 'Or join as someone new' : 'Your name'}</Label>
          <input
            value={name}
            onChange={e => { setName(e.target.value); if (e.target.value) setSeatId(null); setError(null) }}
            maxLength={24}
            placeholder="Your name"
            style={{
              width: '100%', padding: '10px 13px', borderRadius: 6,
              border: '1.5px solid rgba(200,148,10,0.40)',
              background: 'rgba(0,0,0,0.40)', color: '#E8DCC8',
              fontSize: 14, fontFamily: 'Georgia, serif', boxSizing: 'border-box',
              opacity: seatId ? 0.45 : 1,
            }}
          />
          {!user && roster.length > 0 && (
            <div style={{ fontSize: 10.5, color: '#5a4020', marginTop: 5 }}>
              Sign in first if you want this campaign's history to follow your account.
            </div>
          )}
        </>
      )}

      {/* Say why joining is refused BEFORE the button rather than after the
          click. Every one of these was already reported by the server — the
          problem was only that you had to commit to find out. */}
      {blocked && (
        <div style={{
          padding: '9px 12px', borderRadius: 6, marginTop: 14, fontSize: 11.5, lineHeight: 1.5,
          background: 'rgba(224,160,112,0.10)', border: '1px solid rgba(224,160,112,0.40)', color: '#e0a070',
        }}>
          {blocked}
        </div>
      )}

      {error && <ErrorBox>{error}</ErrorBox>}

      {/* Already in it? Open it rather than dead-ending on a refusal. */}
      {mySeat ? (
        <button onClick={() => onJoined(found.campaignId, mySeat.id)} style={primary(false)}>
          Open {found.worldName} as {mySeat.name}
        </button>
      ) : (
        <button onClick={commit} disabled={commitDisabled} style={primary(commitDisabled)}>
          {busy ? 'Joining…' : blocked ? 'Cannot join this campaign' : seatId
            ? `Join as ${roster.find(m => m.id === seatId)?.name}`
            : `Join as ${name.trim() || '…'}`}
        </button>
      )}
      <button
        onClick={() => { setFound(null); setError(null) }}
        style={{
          width: '100%', marginTop: 8, padding: '8px', borderRadius: 7, fontSize: 11.5,
          border: '1px solid rgba(200,148,10,0.20)', background: 'transparent',
          color: '#6a5030', cursor: 'pointer', fontFamily: 'Georgia, serif',
        }}>
        ← Use a different code
      </button>
    </Frame>
  )
}

// ─── Tiny helpers ────────────────────────────────────────────────────────────

function Frame({ title, onCancel, children }: { title: string; onCancel: () => void; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12, borderBottom: '1px solid rgba(200,148,10,0.15)', paddingBottom: 5,
      }}>
        <span style={{ fontSize: 10, color: '#6a5030', letterSpacing: 1.5, textTransform: 'uppercase' }}>
          {title}
        </span>
        <button onClick={onCancel} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#6a5030', fontSize: 11, fontFamily: 'Georgia, serif', textDecoration: 'underline',
        }}>
          Cancel
        </button>
      </div>
      {children}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10.5, color: '#6a5030', letterSpacing: 1, marginBottom: 7 }}>
      {children}
    </div>
  )
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '8px 11px', borderRadius: 6, margin: '12px 0 0', fontSize: 11.5,
      background: 'rgba(231,76,60,0.10)', border: '1px solid rgba(231,76,60,0.40)', color: '#e08070',
    }}>
      {children}
    </div>
  )
}

const hint: React.CSSProperties = {
  fontSize: 11.5, color: '#7a6040', margin: '0 0 12px', lineHeight: 1.5,
}

const primary = (disabled: boolean): React.CSSProperties => ({
  width: '100%', marginTop: 16, padding: '12px', borderRadius: 8, fontSize: 13.5,
  border: `1.5px solid ${disabled ? 'rgba(200,148,10,0.20)' : 'rgba(200,148,10,0.65)'}`,
  background: disabled ? 'transparent' : 'rgba(200,148,10,0.15)',
  color: disabled ? '#5a4020' : '#E8DCC8',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontFamily: 'Georgia, serif', letterSpacing: 0.5,
})
