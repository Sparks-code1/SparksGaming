import { useState } from 'react'
import type { LegacyState } from '@/types/legacy'
import type { AuthUser } from '@/lib/auth'
import { getRoster, nextRosterId, MAX_ROSTER, MAX_ROSTER_NAME, MIN_ROSTER } from '@/lib/roster'

interface Props {
  legacy: LegacyState
  user: AuthUser | null
  /** Add a name to the roster. Resolves to an error message, or null on success. */
  onAdd: (name: string) => Promise<string | null>
}

const GOLD = '#C8940A'

/**
 * Who is in this campaign, and room to add someone.
 *
 * Names are permanent, but the roster SIZE is not — somebody joining the group
 * at game four is completely normal, and before this there was no way to let
 * them in: every name was taken, so a joiner with the code had nothing to claim
 * and no way to add themselves. A campaign could get stuck closed.
 *
 * Adding here creates an UNCLAIMED entry, which is exactly what the join-by-code
 * flow needs to hand out. The new member's `joinedInGame` is the game the
 * campaign is on now, so the history shows when they actually arrived rather
 * than pretending they were there from the start.
 */
export default function CampaignRosterPanel({ legacy, user, onAdd }: Props) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState<string | null>(null)

  const roster = getRoster(legacy)
  const hasRoom = nextRosterId(roster) !== null
  const open = roster.filter(m => !m.userId)

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true); setError(null); setAdded(null)
    const failure = await onAdd(trimmed)
    setBusy(false)
    if (failure) { setError(failure); return }
    setName('')
    setAdded(trimmed)
  }

  return (
    <div style={{
      border: '1px solid rgba(200,148,10,0.28)', borderRadius: 9,
      background: 'rgba(0,0,0,0.22)', padding: '13px 15px', marginBottom: 18,
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        fontSize: 10, color: '#6a5030', letterSpacing: 1.5, textTransform: 'uppercase',
        marginBottom: 10, borderBottom: '1px solid rgba(200,148,10,0.15)', paddingBottom: 5,
      }}>
        <span>Campaign Roster</span>
        <span style={{ letterSpacing: 0.5 }}>{roster.length} of {MAX_ROSTER}</span>
      </div>

      {roster.length === 0 ? (
        <div style={{ fontSize: 11.5, color: '#7a6040', fontStyle: 'italic', marginBottom: 10 }}>
          Nobody on the roster yet — this campaign names its players during the first game.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 11 }}>
          {roster.map(m => {
            const mine = !!user && m.userId === user.id
            return (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                <span style={{ width: 12, textAlign: 'center', color: m.userId ? '#8fbf9a' : '#6a5030' }}>
                  {m.userId ? '✓' : '○'}
                </span>
                <span style={{ color: '#E8DCC8', fontWeight: m.userId ? 'bold' : 'normal' }}>{m.name}</span>
                {mine && <span style={{ fontSize: 10, color: '#6a5030' }}>(you)</span>}
                <span style={{
                  fontSize: 10, color: '#5a4526', minWidth: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {m.userId ? (m.userEmail ?? 'account linked') : 'open — claimable with the join code'}
                </span>
                {m.joinedInGame > 1 && (
                  <span style={{ fontSize: 9.5, color: '#5a4526', marginLeft: 'auto', flexShrink: 0 }}>
                    joined game {m.joinedInGame}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* The stuck state this panel exists to get out of: every name taken and
          nothing for a joiner to claim. Say so plainly rather than letting them
          type a code into a campaign that cannot accept them. */}
      {roster.length > 0 && open.length === 0 && hasRoom && (
        <div style={{ fontSize: 10.5, color: '#a07850', marginBottom: 10, lineHeight: 1.5 }}>
          Every name here is already linked to an account. Add one below before sharing the
          code, or the person you send it to will have nothing to claim.
        </div>
      )}
      {roster.length > 0 && roster.length < MIN_ROSTER && (
        <div style={{
          fontSize: 10.5, color: '#e08070', marginBottom: 10, lineHeight: 1.5,
          padding: '7px 10px', borderRadius: 6,
          background: 'rgba(231,76,60,0.10)', border: '1px solid rgba(231,76,60,0.35)',
        }}>
          A game needs at least {MIN_ROSTER} players. Add someone before starting one.
        </div>
      )}

      {hasRoom ? (
        <>
          <div style={{ display: 'flex', gap: 7 }}>
            <input
              value={name}
              onChange={e => { setName(e.target.value); setError(null); setAdded(null) }}
              onKeyDown={e => { if (e.key === 'Enter') submit() }}
              maxLength={MAX_ROSTER_NAME}
              placeholder="Add someone to the campaign"
              aria-label="New roster member name"
              style={{
                flex: 1, minWidth: 0, padding: '8px 12px', borderRadius: 6,
                border: '1.5px solid rgba(200,148,10,0.35)',
                background: 'rgba(0,0,0,0.40)', color: '#E8DCC8',
                fontSize: 13, fontFamily: 'Georgia, serif', boxSizing: 'border-box',
              }}
            />
            <button
              onClick={submit}
              disabled={busy || !name.trim()}
              style={{
                padding: '8px 16px', borderRadius: 7, fontSize: 12, flexShrink: 0,
                fontFamily: 'Georgia, serif',
                cursor: busy || !name.trim() ? 'not-allowed' : 'pointer',
                border: `1px solid ${busy || !name.trim() ? 'rgba(200,148,10,0.20)' : 'rgba(200,148,10,0.55)'}`,
                background: busy || !name.trim() ? 'transparent' : 'rgba(200,148,10,0.14)',
                color: busy || !name.trim() ? '#5a4020' : GOLD,
              }}>
              {busy ? 'Adding…' : 'Add'}
            </button>
          </div>
          <div style={{ fontSize: 9.5, color: '#5a4526', marginTop: 6, lineHeight: 1.5 }}>
            Permanent once added, like every other name. They claim it by signing in and
            entering the join code.
          </div>
        </>
      ) : (
        <div style={{ fontSize: 10.5, color: '#6a5030', fontStyle: 'italic' }}>
          Full — {MAX_ROSTER} players is the most a campaign can hold.
        </div>
      )}

      {added && (
        <div style={{ fontSize: 11, color: '#7fc79a', marginTop: 8 }}>
          {added} added — send them the join code and they can claim that name.
        </div>
      )}
      {error && (
        <div style={{
          padding: '7px 10px', borderRadius: 6, marginTop: 8, fontSize: 11,
          background: 'rgba(231,76,60,0.10)', border: '1px solid rgba(231,76,60,0.40)', color: '#e08070',
        }}>
          {error}
        </div>
      )}
    </div>
  )
}
