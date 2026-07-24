import { WEAKNESS_POWERS } from '@/data/weaknessPowers'

interface Props {
  playerName: string
  factionName: string
  /** Power IDs already claimed by other factions (this game or a prior one) */
  takenPowerIds: Set<string>
  onPick: (powerId: string) => void
}

/**
 * Weakness power selection — shown after a faction pick when the Alien
 * Invasion milestone has fired. Each of the 5 powers can only be claimed
 * by one faction across the campaign.
 */
export default function WeaknessPowerPicker({ playerName, factionName, takenPowerIds, onPick }: Props) {
  return (
    <div>
      <div style={{
        padding: '10px 14px', borderRadius: 8, marginBottom: 14,
        background: 'rgba(240,192,0,0.07)', border: '1px solid rgba(240,192,0,0.35)',
      }}>
        <div style={{ fontSize: 12, color: '#f0c000', fontWeight: 'bold', letterSpacing: 1, marginBottom: 3 }}>
          ⚠ WEAKNESS POWER
        </div>
        <div style={{ fontSize: 11, color: '#9a8060', lineHeight: 1.5 }}>
          The alien invasion has weakened humanity. <strong style={{ color: '#c0a060' }}>{playerName}</strong> ({factionName}) must
          choose a permanent weakness power. Each power may only be claimed by one faction.
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {WEAKNESS_POWERS.map(power => {
          const taken = takenPowerIds.has(power.id)
          return (
            <button
              key={power.id}
              disabled={taken}
              onClick={() => !taken && onPick(power.id)}
              style={{
                padding: '10px 14px', borderRadius: 8, textAlign: 'left',
                border: `1.5px solid ${taken ? 'rgba(100,75,25,0.15)' : `${power.color}60`}`,
                background: taken ? 'rgba(20,10,0,0.30)' : `${power.color}10`,
                color: taken ? '#3a2810' : '#e8dcc8',
                cursor: taken ? 'not-allowed' : 'pointer',
                fontFamily: 'Georgia, serif',
                opacity: taken ? 0.45 : 1,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: taken ? '#333' : power.color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 'bold', color: taken ? '#4a3020' : power.color }}>{power.name}</span>
                {taken && <span style={{ fontSize: 9, color: '#3a2810', marginLeft: 4 }}>(taken)</span>}
              </div>
              <div style={{ fontSize: 11, color: taken ? '#3a2010' : '#9a8060', lineHeight: 1.4, marginLeft: 18 }}>
                {power.description}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
