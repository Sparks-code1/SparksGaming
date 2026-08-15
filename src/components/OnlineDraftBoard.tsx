import type { LegacyState } from '@/types/legacy'
import {
  type SetupDoc, type DraftList,
  DRAFT_TROOP_SLOTS, DRAFT_COIN_SLOTS, draftClaimant, draftListOpen, draftPickCount,
} from '@/lib/setupFlow'
import { leadFactionId, factionWinCounts } from '@/lib/gameLogic'
import { FACTION_NAMES, factionRgb, availableFactions } from './FactionChoicePanels'

const GOLD = '#C8940A'

/**
 * The draft board, rendered from the shared setup document.
 *
 * The hotseat board is one machine's screen with every player's turn on it.
 * This is the same four lists, on everyone's screen at once: each player sees
 * the whole board — what is gone, who took it — and can only claim when it is
 * their turn, for a list they still owe. Claims travel as "list:value" through
 * the same declaration channel as every other setup pick, so nothing here
 * knows about the network.
 */
export default function OnlineDraftBoard({
  doc, legacy, actor, iAct, minePids, seatName, isAI, onClaim,
}: {
  doc: SetupDoc
  legacy: LegacyState
  /** Whose claim it is. */
  actor: string
  /** Does THIS machine speak for the actor? */
  iAct: boolean
  minePids: string[]
  seatName: (pid: string) => string
  isAI: (pid: string) => boolean
  onClaim: (value: string) => void
}) {
  const order = doc.order ?? []
  const n = order.length
  const troops = DRAFT_TROOP_SLOTS(n)
  const coins = DRAFT_COIN_SLOTS(n)
  const factions = availableFactions(legacy)
  const lead = leadFactionId(legacy.victoryLog)
  const wins = factionWinCounts(legacy.victoryLog)

  /** A list is claimable when it is our turn and the actor still owes it. */
  const open = (list: DraftList) => iAct && draftListOpen(doc, actor, list)

  function Chip({ list, value, label, sub }: {
    list: DraftList; value: string | number; label: string; sub?: string
  }) {
    const by = draftClaimant(doc, list, value)
    const claimable = !by && open(list)
    const byFaction = by ? doc.factions[by] : undefined
    const col = by ? factionRgb(byFaction ?? '') : null
    return (
      <button
        disabled={!claimable}
        onClick={() => claimable && onClaim(`${list}:${value}`)}
        style={{
          width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 11px', borderRadius: 7, marginBottom: 6,
          fontFamily: 'Georgia, serif', fontSize: 12,
          border: by ? `1.5px solid ${col}66`
            : claimable ? '1.5px solid rgba(200,148,10,0.55)' : '1px solid rgba(100,75,25,0.20)',
          background: by ? 'rgba(0,0,0,0.30)'
            : claimable ? 'rgba(200,148,10,0.10)' : 'rgba(0,0,0,0.20)',
          color: by ? '#7a6a50' : claimable ? '#E8DCC8' : '#5a4a30',
          cursor: claimable ? 'pointer' : 'default',
          opacity: by ? 0.75 : 1,
        }}
      >
        <span style={{ flex: 1 }}>
          {label}
          {sub && <span style={{ fontSize: 9.5, color: '#6a5030', marginLeft: 6 }}>{sub}</span>}
        </span>
        {by && (
          <span style={{ fontSize: 10, color: col ?? GOLD, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
            ✓ {seatName(by)}
          </span>
        )}
      </button>
    )
  }

  function Column({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
    return (
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{
          fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: 'rgba(200,148,10,0.65)',
          marginBottom: 8, paddingBottom: 5, borderBottom: '1px solid rgba(200,148,10,0.18)',
        }}>
          {icon} {label}
        </div>
        <div style={{ overflowY: 'auto', flex: 1, paddingRight: 2 }}>{children}</div>
      </div>
    )
  }

  return (
    <div style={{
      width: '100vw', height: '100vh', boxSizing: 'border-box',
      background: 'radial-gradient(ellipse at center, #1A0E04 0%, #080400 100%)',
      display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 16px',
      fontFamily: 'Georgia, serif', color: '#E8DCC8',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 'bold', color: GOLD, letterSpacing: 1.5 }}>⚑ THE DRAFT</div>
          <div style={{ fontSize: 11, color: '#7a6040', marginTop: 2 }}>
            One claim per turn, in dice order — each player ends with a faction,
            a troop slot, a coin slot and a turn position
          </div>
        </div>
        <div style={{
          marginLeft: 'auto', padding: '6px 16px', borderRadius: 8, fontSize: 13,
          background: 'rgba(200,148,10,0.10)',
          border: `1.5px solid ${factionRgb(doc.factions[actor] ?? '')}`,
        }}>
          <span style={{ color: factionRgb(doc.factions[actor] ?? ''), fontWeight: 'bold' }}>
            {seatName(actor)}
          </span>
          <span style={{ fontSize: 10, color: '#7a6040', marginLeft: 8 }}>
            {iAct
              ? (isAI(actor) ? 'the computer’s claim — pick for it' : 'your claim — take one')
              : 'is claiming…'}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
        {/* Who has what */}
        <div style={{
          width: 190, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6,
          overflowY: 'auto',
        }}>
          {order.map((pid, idx) => {
            const mine = minePids.includes(pid)
            const isActor = pid === actor
            const fid = doc.factions[pid]
            const t = (doc.troops ?? {})[pid]
            const c = (doc.coins ?? {})[pid]
            const o = (doc.orderSlots ?? {})[pid]
            return (
              <div key={pid} style={{
                padding: '8px 10px', borderRadius: 7,
                background: isActor ? 'rgba(200,148,10,0.08)' : 'rgba(0,0,0,0.25)',
                border: `1px solid ${isActor ? 'rgba(200,148,10,0.50)' : 'rgba(100,75,25,0.18)'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <span style={{
                    width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
                    background: fid ? factionRgb(fid) : 'rgb(100,80,50)',
                  }} />
                  <span style={{ flex: 1, color: isActor ? '#E8DCC8' : '#9a8060' }}>
                    {idx + 1}. {seatName(pid)}
                    {mine && <span style={{ fontSize: 9, color: '#6a5030' }}> (you)</span>}
                  </span>
                  <span style={{ fontSize: 9, color: '#6a5030' }}>{draftPickCount(doc, pid)}/4</span>
                </div>
                <div style={{ fontSize: 10, color: '#7a6040', marginTop: 4, lineHeight: 1.5 }}>
                  {fid ? <span style={{ color: factionRgb(fid) }}>{FACTION_NAMES[fid]}</span> : <span>—</span>}
                  {t !== undefined && <span> · ⚔{troops[t]}</span>}
                  {c !== undefined && <span> · 🪙{coins[c]}</span>}
                  {o !== undefined && <span> · ↻{o}</span>}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{
          flex: 1, minWidth: 0, display: 'flex', gap: 14,
          background: 'linear-gradient(155deg, #1A0E02 0%, #0A0600 100%)',
          border: '2px solid rgba(200,148,10,0.45)', borderRadius: 12, padding: '14px 16px',
        }}>
          <Column icon="⚑" label="Factions">
            {factions.map(f => (
              <Chip key={f} list="faction" value={f} label={FACTION_NAMES[f] ?? f}
                sub={lead === f ? `⌃ lead · ${wins[f] ?? 0} wins` : (wins[f] ? `${wins[f]} wins` : undefined)} />
            ))}
          </Column>
          <Column icon="⚔" label="Troops">
            {troops.map((v, i) => (
              <Chip key={i} list="troops" value={i} label={`${v} troops`} />
            ))}
          </Column>
          <Column icon="🪙" label="Coin Cards">
            {coins.map((v, i) => (
              <Chip key={i} list="coins" value={i} label={v === 0 ? 'No coin cards' : `${v} coin card${v > 1 ? 's' : ''}`} />
            ))}
          </Column>
          <Column icon="↻" label="Turn Order">
            {Array.from({ length: n }, (_, i) => i + 1).map(pos => (
              <Chip key={pos} list="order" value={pos} label={`${pos}${pos === 1 ? 'st' : pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th'} to play`} />
            ))}
          </Column>
        </div>
      </div>
    </div>
  )
}
