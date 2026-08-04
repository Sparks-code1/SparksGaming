import { useEffect, useState } from 'react'
import type { LegacyState } from '@/types/legacy'
import { type CampaignOutcome, championLabel, CAMPAIGN_GAMES } from '@/lib/campaign'
import ConfettiBurst from './ConfettiBurst'
import Fireworks from './Fireworks'

interface Props {
  legacy: LegacyState
  outcome: CampaignOutcome
  /** Dismiss the celebration and leave the finished world on screen. */
  onViewWorld: () => void
}

const GOLD = '#C8940A'

/** End of a 15-game campaign: fireworks, confetti, and the champion crowned.
 *  Dismissing it reveals the board underneath, so the table can look back over
 *  everything the campaign left behind. */
export default function CampaignCompleteScreen({ legacy, outcome, onViewWorld }: Props) {
  const [shown, setShown] = useState(false)
  // Re-fire confetti periodically so the celebration keeps going while they read.
  const [burst, setBurst] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setShown(true), 60)
    const i = setInterval(() => setBurst(b => b + 1), 2800)
    return () => { clearTimeout(t); clearInterval(i) }
  }, [])

  const champions = championLabel(outcome)
  const shared = outcome.championIds.length > 1

  return (
    <>
      <Fireworks />
      <ConfettiBurst key={burst} count={120} originY={30} duration={3000} />

      <div style={{
        position: 'fixed', inset: 0, zIndex: 6100,
        background: 'radial-gradient(ellipse at center, rgba(200,148,10,0.16) 0%, rgba(4,2,0,0.94) 62%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Georgia, serif', padding: 20, overflowY: 'auto',
      }}>
        <div style={{
          textAlign: 'center', maxWidth: 640, width: '100%',
          opacity: shown ? 1 : 0,
          transform: shown ? 'scale(1)' : 'scale(0.94)',
          transition: 'opacity 900ms ease, transform 900ms cubic-bezier(0.2,0.9,0.3,1)',
        }}>
          <div style={{ fontSize: 11, letterSpacing: 6, color: GOLD, textTransform: 'uppercase', marginBottom: 18 }}>
            ✦ The Campaign Is Over ✦
          </div>

          <div style={{ fontSize: 76, marginBottom: 4, filter: `drop-shadow(0 0 34px ${GOLD})` }}>🌍</div>

          <div style={{
            fontSize: 15, letterSpacing: 3, color: '#9a8060',
            textTransform: 'uppercase', marginBottom: 10,
          }}>
            The World Belongs To
          </div>

          <div style={{
            fontSize: shared ? 40 : 54, fontWeight: 'bold', color: GOLD,
            letterSpacing: 1, lineHeight: 1.15, marginBottom: 18,
            textShadow: `0 0 40px rgba(200,148,10,0.75), 0 0 90px rgba(200,148,10,0.35)`,
          }}>
            {champions}
          </div>

          <div style={{ fontSize: 13, color: '#9a8060', marginBottom: 6 }}>
            {legacy.worldName} · {outcome.gamesPlayed} of {CAMPAIGN_GAMES} games played
          </div>
          {outcome.clinchedEarly && (
            <div style={{ fontSize: 12, color: '#7a6040', fontStyle: 'italic', marginBottom: 6 }}>
              Clinched with {outcome.gamesRemaining} game{outcome.gamesRemaining === 1 ? '' : 's'} still
              on the calendar — no one left could catch them.
            </div>
          )}
          {shared && (
            <div style={{ fontSize: 12, color: '#7a6040', fontStyle: 'italic', marginBottom: 6 }}>
              The lead was shared after the final game — the world is held jointly.
            </div>
          )}

          {/* Final standings */}
          <div style={{
            marginTop: 26, marginBottom: 26, textAlign: 'left',
            border: '1px solid rgba(200,148,10,0.28)', borderRadius: 10,
            background: 'rgba(0,0,0,0.42)', padding: '14px 18px',
          }}>
            <div style={{
              fontSize: 10, letterSpacing: 2, color: '#6a5030',
              textTransform: 'uppercase', marginBottom: 10,
              borderBottom: '1px solid rgba(200,148,10,0.15)', paddingBottom: 6,
            }}>
              Final Standings — games won
            </div>
            {outcome.standings.map((s, i) => {
              const isChampion = outcome.championIds.includes(s.playerId)
              return (
                <div key={s.playerId} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '7px 8px', borderRadius: 6,
                  background: isChampion ? 'rgba(200,148,10,0.12)' : 'transparent',
                }}>
                  <span style={{ fontSize: 11, color: '#5a4020', width: 20 }}>#{i + 1}</span>
                  <span style={{
                    flex: 1, fontSize: 14,
                    color: isChampion ? GOLD : '#B8A880',
                    fontWeight: isChampion ? 'bold' : 'normal',
                  }}>
                    {isChampion ? '👑 ' : ''}{s.name}
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 'bold', color: isChampion ? GOLD : '#7a6040' }}>
                    {s.signatures}
                  </span>
                </div>
              )
            })}
          </div>

          <button
            onClick={onViewWorld}
            style={{
              padding: '14px 34px', borderRadius: 9, fontSize: 15, fontWeight: 'bold',
              border: `2px solid rgba(200,148,10,0.75)`, background: 'rgba(200,148,10,0.18)',
              color: '#E8DCC8', cursor: 'pointer', fontFamily: 'Georgia, serif', letterSpacing: 1,
            }}
          >
            🗺 View the World They Fought Over
          </button>
          <div style={{ fontSize: 10.5, color: '#5a4020', marginTop: 12 }}>
            No further games can be started in this campaign.
          </div>
        </div>
      </div>
    </>
  )
}
