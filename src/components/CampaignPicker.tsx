import { useEffect, useState } from 'react'
import { listCampaigns, type CampaignSummary } from '@/lib/legacyApi'
import { formatJoinCode } from '@/lib/joinCode'

interface Props {
  /** Resume an existing campaign. */
  onOpen: (campaignId: string) => void
  /** Begin a new one — the caller names it and generates its id. */
  onNew: () => void
  /** Enter someone else's campaign with a join code. */
  onJoin: () => void
}

const GOLD = '#C8940A'

function when(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const mins = Math.floor((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  return d.toLocaleDateString()
}

/**
 * Choose which campaign to play.
 *
 * Campaigns are keyed by their own id, so any number of them can sit side by
 * side — this is how you get back to one that is not simply the most recent.
 */
export default function CampaignPicker({ onOpen, onNew, onJoin }: Props) {
  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    setError(null)
    try {
      setCampaigns(await listCampaigns())
    } catch (e) {
      setCampaigns([])
      setError(e instanceof Error ? e.message : 'Could not load campaigns')
    }
  }

  useEffect(() => { refresh() }, [])


  return (
    <div>
      <div style={{
        fontSize: 10, color: '#6a5030', letterSpacing: 1.5, textTransform: 'uppercase',
        marginBottom: 10, borderBottom: '1px solid rgba(200,148,10,0.15)', paddingBottom: 5,
      }}>
        Your Campaigns
      </div>

      {campaigns === null && (
        <div style={{ fontSize: 12, color: '#6a5030', fontStyle: 'italic', padding: '10px 0' }}>Loading…</div>
      )}

      {error && (
        <div style={{
          padding: '8px 11px', borderRadius: 6, marginBottom: 10, fontSize: 11.5,
          background: 'rgba(231,76,60,0.10)', border: '1px solid rgba(231,76,60,0.40)', color: '#e08070',
        }}>
          {error}
        </div>
      )}

      {campaigns !== null && campaigns.length === 0 && !error && (
        <div style={{ fontSize: 12, color: '#6a5030', fontStyle: 'italic', padding: '6px 0 12px' }}>
          No campaigns yet — start your first world below.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {(campaigns ?? []).map(c => (
          <div key={c.id} style={{
            border: `1px solid ${c.gameInProgress ? 'rgba(200,148,10,0.50)' : 'rgba(200,148,10,0.20)'}`,
            borderRadius: 9, background: 'rgba(0,0,0,0.26)', padding: '11px 13px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: '#E8DCC8', fontWeight: 'bold' }}>
                  {c.worldName}
                  {c.campaignComplete && <span style={{ fontSize: 10, color: '#27AE60', marginLeft: 8 }}>✓ COMPLETE</span>}
                  {c.gameInProgress && <span style={{ fontSize: 10, color: GOLD, marginLeft: 8 }}>● IN PROGRESS</span>}
                </div>
                <div style={{ fontSize: 11, color: '#7a6040', marginTop: 3 }}>
                  Game {c.currentGameNumber} of 15 · {c.gamesWon} played · {when(c.updatedAt)}
                </div>
                {c.joinCode && (
                  <div style={{
                    fontSize: 10.5, color: '#8a7040', marginTop: 3,
                    fontFamily: 'Menlo, Consolas, monospace', letterSpacing: 1.5,
                  }}>
                    {formatJoinCode(c.joinCode)}
                  </div>
                )}
                {c.players.length > 0 && (
                  <div style={{ fontSize: 10.5, color: '#5a4020', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.players.join(' · ')}
                  </div>
                )}
              </div>
              <button
                onClick={() => onOpen(c.id)}
                style={{
                  padding: '7px 15px', borderRadius: 7, fontSize: 12.5, flexShrink: 0,
                  border: '1.5px solid rgba(200,148,10,0.65)', background: 'rgba(200,148,10,0.15)',
                  color: '#E8DCC8', cursor: 'pointer', fontFamily: 'Georgia, serif',
                }}>
                {c.gameInProgress ? 'Resume' : 'Open'}
              </button>
              {/* ── NO DELETE, AND SO NO BUTTON ──────────────────────────────
                  The campaigns table has no DELETE policy: a legacy campaign is
                  the one thing in this game that must not be destroyable by a
                  client, and that applies to its owner as much as to anyone
                  else. Nobody is entitled, so there is nobody to offer this to.

                  IT WAS WORSE THAN USELESS, not merely dead. An RLS-refused
                  DELETE returns success with zero rows, so the ✕ opened its
                  confirmation, took the press, refreshed the list, and left the
                  campaign sitting there — a control that appeared to do the one
                  irreversible thing in the app and did nothing.

                  deleteCampaign now raises on a zero count, so the API tells
                  the truth to whatever calls it. This is the other half: not
                  offering the press at all. See
                  supabase/migrations/20260904000000_campaigns_rls.sql. */}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 9 }}>
        <button
          onClick={onNew}
          style={{
            flex: 1, padding: '12px', borderRadius: 8, fontSize: 13.5,
            border: '1.5px solid rgba(200,148,10,0.55)', background: 'rgba(200,148,10,0.10)',
            color: '#E8DCC8', cursor: 'pointer', fontFamily: 'Georgia, serif', letterSpacing: 0.5,
          }}>
          ✦ Create Campaign
        </button>
        <button
          onClick={onJoin}
          style={{
            flex: 1, padding: '12px', borderRadius: 8, fontSize: 13.5,
            border: '1.5px solid rgba(200,148,10,0.30)', background: 'transparent',
            color: '#b09060', cursor: 'pointer', fontFamily: 'Georgia, serif', letterSpacing: 0.5,
          }}>
          ⤵ Join with a Code
        </button>
      </div>
    </div>
  )
}
