import type { LegacyState } from '@/types/legacy'
import { FACTION_COLORS } from '@/data/mockGameState'
import { getRoster, rosterName, playerSignatureCount, victoryWinnerId } from '@/lib/roster'
import { campaignOutcome, championLabel } from '@/lib/campaign'
import { MOCK_PLAYERS } from '@/data/mockGameState'

const FACTION_NAMES: Record<string, string> = {
  'enclave-of-the-bear': 'Enclave of the Bear',
  'imperial-balkania': 'Imperial Balkania',
  'khan-industries': 'Khan Industries',
  'saharan-republic': 'Saharan Republic',
  'die-mechaniker': 'Die Mechaniker',
}

const ALL_CONTINENTS = [
  { id: 'north-america', name: 'North America' },
  { id: 'south-america', name: 'South America' },
  { id: 'europe',        name: 'Europe' },
  { id: 'africa',        name: 'Africa' },
  { id: 'asia',          name: 'Asia' },
  { id: 'australia',     name: 'Australia' },
]

function factionRgb(factionId: string) {
  const hex = FACTION_COLORS[factionId] ?? 0x888888
  return { r: (hex >> 16) & 0xff, g: (hex >> 8) & 0xff, b: hex & 0xff }
}

interface Props {
  legacy: LegacyState
  onNewCampaign: () => void
}

export default function CampaignVictoryScreen({ legacy, onNewCampaign }: Props) {
  const winnerId = legacy.campaignWinnerId ?? ''
  const winnerPlayer = MOCK_PLAYERS.find(p => p.id === winnerId)
  // The faction they last won under — a person plays different factions across
  // a campaign, so this comes from the victory log, not a fixed seat mapping.
  const winnerFaction = [...(legacy.victoryLog ?? [])]
    .reverse()
    .find(v => victoryWinnerId(legacy, v) === winnerId)?.factionId
    ?? winnerPlayer?.factionId ?? ''
  const winnerName = rosterName(legacy, winnerId, winnerPlayer?.name ?? 'Unknown')
  // A 15th-game tie leaves the world shared, so name everyone who holds it.
  const outcome = campaignOutcome(legacy)
  const championNames = outcome.championIds.length > 1 ? championLabel(outcome) : winnerName
  const { r, g, b } = factionRgb(winnerFaction)
  const factionColor = `rgb(${r},${g},${b})`
  const factionName = FACTION_NAMES[winnerFaction] ?? winnerFaction

  const playerRedStars = legacy.playerRedStars ?? {}

  // The campaign roster is the hall of fame — wins and stars belong to the
  // person, counted by roster id, not to whichever faction they happened to
  // play in a given game.
  const hallOfFame = getRoster(legacy)
    .map(m => {
      const lastFaction = [...(legacy.victoryLog ?? [])]
        .reverse()
        .find(v => victoryWinnerId(legacy, v) === m.id)?.factionId
        ?? MOCK_PLAYERS.find(p => p.id === m.id)?.factionId ?? ''
      const { r, g, b } = factionRgb(lastFaction)
      return {
        id: m.id,
        name: m.name,
        factionId: lastFaction,
        wins: playerSignatureCount(legacy, m.id),
        stars: playerRedStars[m.id] ?? 0,
        color: `rgb(${r},${g},${b})`,
      }
    })
    // Ranked by games won — that is what decides the campaign. Red stars are a
    // per-game tally and reset, so they only break ties here.
    .sort((a, b) => b.wins - a.wins || b.stars - a.stars)

  const namedContinents = legacy.namedContinents ?? {}
  const bonusMods = legacy.continentBonusModifiers ?? []
  const cities = legacy.stickers.filter(s => s.description.startsWith('city:'))
  const scars = legacy.scars ?? []
  const historyLog = [...(legacy.historyLog ?? [])].reverse()

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 3000, overflowY: 'auto',
      background: `radial-gradient(ellipse at center, rgba(${r},${g},${b},0.20) 0%, rgba(3,1,0,0.98) 65%)`,
      fontFamily: 'Georgia, serif', color: '#E8DCC8',
    }}>
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '40px 24px 60px' }}>

        {/* ── Campaign Complete Banner ── */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontSize: 11, letterSpacing: 5, color: '#C8940A', textTransform: 'uppercase', marginBottom: 16 }}>
            ✦ Risk Legacy Campaign ✦
          </div>
          <div style={{ fontSize: 64, marginBottom: 8, filter: `drop-shadow(0 0 28px rgb(${r},${g},${b}))` }}>🏆</div>
          <div style={{ fontSize: 44, fontWeight: 'bold', color: '#C8940A', letterSpacing: 2, marginBottom: 6 }}>
            CAMPAIGN COMPLETE
          </div>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: factionColor, textShadow: `0 0 30px rgba(${r},${g},${b},0.7)`, marginBottom: 4 }}>
            {championNames}
          </div>
          <div style={{ fontSize: 14, color: `rgba(${r},${g},${b},0.75)`, marginBottom: 20 }}>{factionName}</div>
          {/* The campaign is won on games won, not red stars — stars decide a
              single game and reset between them. */}
          <div style={{ display: 'inline-block', padding: '10px 28px', borderRadius: 24, border: `2px solid rgba(${r},${g},${b},0.55)`, background: `rgba(${r},${g},${b},0.12)`, fontSize: 15, color: '#E8DCC8' }}>
            {outcome.standings.find(s => s.playerId === winnerId)?.signatures ?? 0} of {outcome.gamesPlayed} games won — Campaign Champion
          </div>
        </div>

        {/* ── Hall of Fame ── */}
        <Section title="⚑ HALL OF FAME">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {hallOfFame.map((p, i) => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '12px 16px', borderRadius: 9,
                background: p.id === winnerId ? `rgba(${r},${g},${b},0.12)` : 'rgba(0,0,0,0.28)',
                border: `1px solid ${p.id === winnerId ? `rgba(${r},${g},${b},0.55)` : 'rgba(200,148,10,0.18)'}`,
              }}>
                <div style={{ fontSize: 13, color: '#6a5030', width: 22, textAlign: 'center' }}>#{i + 1}</div>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, color: '#E8DCC8', fontWeight: p.id === winnerId ? 'bold' : 'normal' }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: '#6a5030' }}>{FACTION_NAMES[p.factionId] ?? p.factionId}</div>
                </div>
                <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 'bold', color: '#c0392b' }}>
                      {'★'.repeat(Math.min(p.stars, 6))}{p.stars > 6 ? `+${p.stars - 6}` : ''}
                    </div>
                    <div style={{ fontSize: 9, color: '#5a4020', letterSpacing: 1 }}>RED STARS</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 'bold', color: p.color }}>{p.wins}</div>
                    <div style={{ fontSize: 9, color: '#5a4020', letterSpacing: 1 }}>WINS</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Game History ── */}
        <Section title="📜 GAME HISTORY">
          {(legacy.victoryLog ?? []).length === 0 ? (
            <div style={{ fontSize: 12, color: '#4a3820', fontStyle: 'italic' }}>No games recorded.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {(legacy.victoryLog ?? []).map((v, i) => {
                const { r, g, b } = factionRgb(v.factionId)
                const condLabel = v.winCondition === 'mission' ? '🎯 Mission' : v.winCondition === 'stars' ? '★ Stars' : '⚔ Elimination'
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px', borderRadius: 7, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(200,148,10,0.14)' }}>
                    <div style={{ fontSize: 11, color: '#5a4020', width: 52, flexShrink: 0 }}>Game #{v.gameNumber}</div>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: `rgb(${r},${g},${b})`, flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: 13, color: '#C8940A' }}>{v.winnerName}</div>
                    <div style={{ fontSize: 11, color: `rgba(${r},${g},${b},0.80)` }}>{FACTION_NAMES[v.factionId] ?? v.factionId}</div>
                    <div style={{ fontSize: 10, color: '#6a5030' }}>{condLabel}</div>
                  </div>
                )
              })}
            </div>
          )}
        </Section>

        {/* ── World at Rest ── */}
        <Section title="🌍 WORLD AT REST">
          {/* Named continents */}
          {Object.keys(namedContinents).length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <SubHead>Continent Names</SubHead>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {ALL_CONTINENTS.map(c => {
                  const named = namedContinents[c.id]
                  if (!named) return null
                  return (
                    <div key={c.id} style={{ padding: '6px 12px', borderRadius: 7, background: 'rgba(200,148,10,0.07)', border: '1px solid rgba(200,148,10,0.22)', fontSize: 12 }}>
                      <span style={{ color: '#C8940A', fontWeight: 'bold' }}>{named.customName}</span>
                      <span style={{ color: '#5a4020', fontSize: 10, marginLeft: 6 }}>({c.name})</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Continent bonus mods */}
          {bonusMods.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <SubHead>Modified Continent Bonuses</SubHead>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {bonusMods.map((m, i) => {
                  const c = ALL_CONTINENTS.find(c => c.id === m.continentId)
                  return (
                    <div key={i} style={{ padding: '5px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(200,148,10,0.18)', fontSize: 11 }}>
                      <span style={{ color: '#E8DCC8' }}>{c?.name ?? m.continentId}</span>
                      <span style={{ color: m.bonusDelta > 0 ? '#27AE60' : '#E74C3C', marginLeft: 6 }}>{m.bonusDelta > 0 ? '+' : ''}{m.bonusDelta}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Cities */}
          {cities.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <SubHead>Cities ({cities.length})</SubHead>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {cities.map(s => (
                  <div key={s.id} style={{ padding: '5px 10px', borderRadius: 6, background: s.description === 'city:major' ? 'rgba(200,148,10,0.10)' : 'rgba(41,128,185,0.08)', border: `1px solid ${s.description === 'city:major' ? 'rgba(200,148,10,0.30)' : 'rgba(41,128,185,0.28)'}`, fontSize: 11, color: '#b09060' }}>
                    {s.description === 'city:major' ? '🏙' : '🏘'} {s.name}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Scars */}
          {scars.length > 0 && (
            <div>
              <SubHead>Permanent Scars ({scars.length})</SubHead>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {scars.map((s, i) => (
                  <div key={i} style={{ padding: '5px 10px', borderRadius: 6, background: 'rgba(231,76,60,0.06)', border: '1px solid rgba(231,76,60,0.20)', fontSize: 11, color: '#9a6050' }}>
                    ☣ {s.type} — game {s.appliedInGame}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* ── Campaign History Log ── */}
        <Section title="📖 CAMPAIGN CHRONICLES">
          <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {historyLog.length === 0 ? (
              <div style={{ fontSize: 12, color: '#4a3820', fontStyle: 'italic' }}>No history recorded.</div>
            ) : historyLog.map((h, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '6px 10px', borderRadius: 5, background: h.entry.startsWith('🏆') ? 'rgba(200,148,10,0.08)' : 'transparent', border: h.entry.startsWith('🏆') ? '1px solid rgba(200,148,10,0.22)' : 'none' }}>
                <div style={{ fontSize: 10, color: '#4a3010', flexShrink: 0, paddingTop: 1 }}>G{h.gameNumber}</div>
                <div style={{ fontSize: 12, color: h.entry.startsWith('🏆') ? '#C8940A' : '#7a6040', lineHeight: 1.4 }}>{h.entry}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── New Campaign ── */}
        <div style={{ textAlign: 'center', marginTop: 40 }}>
          <div style={{ fontSize: 12, color: '#4a3020', marginBottom: 20 }}>
            The campaign is sealed. The legacy of {legacy.worldName} lives on forever.
          </div>
          <button
            onClick={onNewCampaign}
            style={{
              padding: '13px 36px', borderRadius: 9, fontSize: 14, fontWeight: 'bold',
              border: '2px solid rgba(200,148,10,0.40)', background: 'rgba(200,148,10,0.08)',
              color: '#7a6030', cursor: 'pointer', fontFamily: 'Georgia, serif',
            }}
          >
            Begin a New Campaign World
          </button>
        </div>

      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ fontSize: 12, letterSpacing: 2.5, color: '#C8940A', textTransform: 'uppercase', marginBottom: 14, paddingBottom: 7, borderBottom: '1px solid rgba(200,148,10,0.25)' }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function SubHead({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, color: '#5a4020', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
      {children}
    </div>
  )
}
