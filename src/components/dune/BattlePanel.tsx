/**
 * The battle panel: pick, plan, reveal, and the traitor beat.
 *
 * BUILT IN THE BIDDING PANEL'S MOULD — a decision with a deadline floats over
 * the board, shuts out of the way, and never covers the chat or the HUD. It
 * renders from the PUBLIC battles object plus this seat's own secrets; where
 * battles are pending is derived from the forces by the same shared law the
 * server judges with (pendingBattles), so the pick list cannot disagree with
 * what the server will accept.
 *
 * WHAT THE PLAN FORM KNOWS: the seat's own hand and traitors, handed in as
 * props by the screen that holds the secrets. Nothing here fetches. The
 * committed plan leaves through onPlan and comes back only at the reveal,
 * public by then for everyone.
 *
 * THE TRAITOR BEAT OPENS FOR BOTH SIDES EVERY TIME — a beat that only opened
 * when a call was possible would announce who holds a traitor by opening at
 * all. The call button lights only for a seat whose own traitors match the
 * opposing leader; everyone else just continues.
 */
import { useState } from 'react'
import { FACTION_LOOK } from './SeatLayer'
import { LeaderDisc } from './LeaderDisc'
import { TreacheryCardFace } from './TreacheryCardFace'
import DraggableResizable from '@/components/DraggableResizable'
import { CARD_ZOOM } from './OwnStrip'
import { TREACHERY_CARDS } from '@/data/dune/treachery'
import { factionById } from '@/data/dune/factions'
import { DUNE_TERRITORIES } from '@/data/dune/boardData'
import {
  pendingBattles, battlesFor, forcesInBattle, CHEAP_HERO_ID,
} from '@/lib/dune/battle'
import type { DuneGameState } from '@/types/Dune/Game'
import type { FactionId, Leader } from '@/types/Dune/Faction'
import type { TreacheryCard } from '@/types/Dune/Treachery'

const INK = '#141b2d'
const SAND = '#f0e2bb'
const SERIF = 'Georgia, "Times New Roman", serif'

const cardName = (id: string) => TREACHERY_CARDS.find(c => c.id === id)?.name ?? id

/**
 * Every refusal, in words a player can act on. A bare "that plan is not
 * legal" on a legal-looking plan is unactionable — the code always named
 * the part, and now the panel says it. Unknown codes fall back to showing
 * themselves rather than to silence.
 */
export const PLAN_REFUSAL_TEXT: Record<string, string> = {
  'not-in-this-battle': 'You have no forces standing in this battle.',
  'dial-out-of-range': 'The dial is more than the forces you have standing here.',
  'no-such-leader': 'That leader is not on your sheet.',
  'leader-in-the-tanks': 'That leader is dead in the tanks.',
  'leader-fights-elsewhere': 'That leader already fought in another territory this phase.',
  'two-leaders': 'A leader or the Cheap Hero — not both.',
  'card-not-held': 'You do not hold that card.',
  'not-a-weapon': 'That card is not a weapon.',
  'not-a-defence': 'That card is not a defence.',
  'no-leader-no-cards': 'With no leader and no Cheap Hero, no treachery may be played.',
  'one-card-twice': 'The same card cannot be played twice.',
  'battle-moved-on': 'The table has moved to another battle — this form has refreshed; plan again.',
  'already-committed': 'Your plan is already in.',
  'already-revealed': 'Plans are on the table.',
  'no-battle': 'No battle is open.',
  'not-your-battle': 'You are not in this battle.',
  'stale': 'The match moved while you decided — try again.',
}
const territoryName = (id: string) =>
  DUNE_TERRITORIES.find(t => t.id === id)?.displayName ?? id

export interface BattlePanelProps {
  battles: NonNullable<DuneGameState['battles']>
  forces: NonNullable<DuneGameState['forces']>
  storm: DuneGameState['storm']
  tanks: DuneGameState['tanks'] | null
  seat: FactionId | null
  /** This seat's own hand and traitor names — secrets, handed in. */
  hand: readonly string[]
  traitors: readonly string[]
  now: number
  busy: boolean
  /** The last battle action's refusal code, this seat's own. Named below. */
  refusal?: string | null
  onPick: (territoryId: string, opponent: FactionId) => void
  onPlan: (plan: {
    territoryId: string
    dial: number; leader?: string; cheapHero?: boolean; weapon?: string; defence?: string
  }) => void
  onAnswer: (call: boolean) => void
}

/**
 * THE WHEEL, as the table knows it: numbers round the rim, a pointer at the
 * chosen one, and the leader's own face slotted into the hub — you see WHOSE
 * face you are committing, not a name in a list. A click on a number sets
 * the dial; the numbers run only as high as the forces actually standing in
 * the territory, because the wheel cannot promise what the ground does not
 * hold.
 */
export function BattleWheel({ faction, max, dial, onDial, leader, hero }: {
  faction: FactionId
  max: number
  dial: number
  onDial: (n: number) => void
  leader: Leader | null
  hero: boolean
}) {
  const R = 106
  const start = -225
  const step = max > 0 ? 270 / max : 0
  const at = (n: number) => {
    const a = (start + n * step) * Math.PI / 180
    return { x: Math.cos(a) * R, y: Math.sin(a) * R }
  }
  const p = at(dial)
  return (
    <svg data-layer="battle-wheel" data-wheel-dial={dial}
      data-wheel-leader={leader ? leader.name : hero ? 'cheap-hero' : ''}
      viewBox="-130 -130 260 260" width="252" height="252"
      style={{ display: 'block', margin: '10px auto' }}>
      <circle r="126" fill="#1d2a44" stroke={`${SAND}55`} strokeWidth="2" />
      <circle r="86" fill="#101726" stroke={`${SAND}33`} strokeWidth="1.5" />
      <line x1={p.x * 0.62} y1={p.y * 0.62} x2={p.x * 0.82} y2={p.y * 0.82}
        stroke="#c9542a" strokeWidth="5" strokeLinecap="round" />
      {Array.from({ length: max + 1 }, (_, n) => {
        const q = at(n)
        const on = n === dial
        return (
          <g key={n} data-dial-number={n} onClick={() => onDial(n)}
            style={{ cursor: 'pointer' }}>
            <title>{`Dial ${n}`}</title>
            <circle cx={q.x} cy={q.y} r="13" fill={on ? '#c9542a' : '#22304f'}
              stroke={on ? SAND : `${SAND}44`} strokeWidth={on ? 2 : 1} />
            <text x={q.x} y={q.y} fontSize="11" fill={SAND} textAnchor="middle"
              dominantBaseline="central" fontFamily={SERIF}>{n}</text>
          </g>
        )
      })}
      {/* THE HUB: the disc goes onto the wheel the way the real one slots in. */}
      {leader ? (
        <LeaderDisc leader={leader} faction={faction} r={52} />
      ) : hero ? (
        <g>
          <circle r="52" fill="#22304f" stroke={SAND} strokeWidth="1.5" />
          <text y="-7" fontSize="13" fill={SAND} textAnchor="middle"
            fontFamily={SERIF}>Cheap</text>
          <text y="11" fontSize="13" fill={SAND} textAnchor="middle"
            fontFamily={SERIF}>Hero</text>
        </g>
      ) : (
        <g>
          <circle r="52" fill="none" stroke={`${SAND}44`} strokeWidth="1.5"
            strokeDasharray="5 4" />
          <text fontSize="11" fill={SAND} opacity="0.6" textAnchor="middle"
            dominantBaseline="central" fontFamily={SERIF}>no leader</text>
        </g>
      )}
    </svg>
  )
}

const btn: React.CSSProperties = {
  display: 'block', width: '100%', margin: '4px 0', padding: '4px 8px',
  font: `12px ${SERIF}`, color: SAND, textAlign: 'left',
  background: 'transparent', border: `1px solid ${SAND}55`,
  borderRadius: 4, cursor: 'pointer',
}
const chosen: React.CSSProperties = { ...btn, background: '#2f6fb5', border: `1px solid ${SAND}` }

function PlanLine({ faction, plan }: {
  faction: FactionId
  plan: { dial: number; leader?: string; cheapHero?: boolean; weapon?: string; defence?: string }
}) {
  return (
    <div data-revealed-plan={faction} style={{ flex: 1, minWidth: 150 }}>
      <b style={{ color: FACTION_LOOK[faction].colour }}>{FACTION_LOOK[faction].name}</b>
      <div>Dialled <b>{plan.dial}</b></div>
      <div>{plan.leader ?? (plan.cheapHero ? 'Cheap Hero' : 'no leader')}</div>
      {plan.weapon && <div>Weapon: {cardName(plan.weapon)}</div>}
      {plan.defence && <div>Defence: {cardName(plan.defence)}</div>}
    </div>
  )
}

export function BattlePanel({
  battles, forces, storm, tanks, seat, hand, traitors, now, busy,
  refusal = null, onPick, onPlan, onAnswer,
}: BattlePanelProps) {
  const [dial, setDial] = useState(0)
  const [leader, setLeader] = useState<string | null>(null)
  const [hero, setHero] = useState(false)
  const [weapon, setWeapon] = useState<string | null>(null)
  const [defence, setDefence] = useState<string | null>(null)
  const [shut, setShut] = useState(false)
  /** One card opened at reading size — the tray's floating view. */
  const [zoomCard, setZoomCard] = useState<TreacheryCard | null>(null)

  const c = battles.current
  const aggressor = battles.order[battles.at]

  if (shut) {
    return (
      <div data-layer="battle-bar" style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
        background: INK, color: SAND, borderTop: `1px solid ${SAND}44`,
        font: `13px ${SERIF}`,
      }}>
        <button type="button" onClick={() => setShut(false)} aria-label="Open the battle panel"
          style={{ ...btn, display: 'inline', width: 'auto', margin: 0 }}>▲</button>
        <span>
          {c
            ? `Battle in ${territoryName(c.territoryId)} — ${FACTION_LOOK[c.aggressor].name} vs ${FACTION_LOOK[c.defender].name}`
            : `${FACTION_LOOK[aggressor].name} picks the next battle`}
        </span>
      </div>
    )
  }

  const frame = (children: React.ReactNode) => (
    <div data-layer="battle" style={{
      position: 'absolute', inset: 0, background: '#000000a8',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'auto', padding: 8,
    }}>
      <div role="dialog" aria-label="battle" style={{
        background: INK, color: SAND, border: `1px solid ${SAND}44`, borderRadius: 10,
        padding: 16, width: 'min(560px, 100%)', maxHeight: '100%', overflowY: 'auto',
        font: `14px ${SERIF}`, boxShadow: '0 18px 60px #000000cc',
      }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
          <button type="button" onClick={() => setShut(true)}
            aria-label="Shut the battle panel to see the board"
            style={{ ...btn, display: 'inline', width: 'auto', margin: 0, fontSize: 12 }}>
            ▼ board
          </button>
        </div>
        {children}
        {refusal && (
          <div role="alert" data-battle-refusal={refusal}
            style={{ marginTop: 10, fontSize: 12, color: '#e8a0a0' }}>
            {PLAN_REFUSAL_TEXT[refusal] ?? `Refused: ${refusal}`}
          </div>
        )}
      </div>
    </div>
  )

  // ── the pick ────────────────────────────────────────────────────────────
  if (!c) {
    const pending = pendingBattles(forces, storm)
    const mineToPick = seat === aggressor ? battlesFor(pending, aggressor) : []
    const expired = now >= battles.closesAt
    return frame(
      <>
        <b style={{ display: 'block', fontSize: 16 }}>
          {FACTION_LOOK[aggressor].name} {seat === aggressor ? '— your battles' : 'picks the next battle'}
        </b>
        {/* ONE GATE, in the list itself: mineToPick is empty for every seat
            but the aggressor, and a second seat-check here would be the dead
            copy a sabotage cannot reach. */}
        {mineToPick.map(b =>
          b.factions.filter(f => f !== aggressor).map(f => (
            <button key={`${b.territoryId}|${f}`} type="button" disabled={busy}
              data-pick={`${b.territoryId}|${f}`}
              onClick={() => onPick(b.territoryId, f)} style={btn}>
              Fight <span style={{ color: FACTION_LOOK[f].colour }}>{FACTION_LOOK[f].name}</span>
              {' '}in {territoryName(b.territoryId)}
            </button>
          )))}
        {seat !== aggressor && !expired && (
          <p style={{ opacity: 0.75 }}>The aggressor chooses where, and whom, to fight first.</p>
        )}
        {seat !== aggressor && expired && (
          <button type="button" disabled={busy} data-pick-push=""
            onClick={() => onPick('', '' as FactionId)} style={btn}>
            The clock has run out — open their first battle
          </button>
        )}
      </>,
    )
  }

  // ── the reveal and the traitor beat ─────────────────────────────────────
  if (c.revealed) {
    const beat = c.revealed.traitor
    const iAmIn = seat === c.aggressor || seat === c.defender
    const answered = !!seat && beat.answered.includes(seat)
    const other = seat === c.aggressor ? c.defender : c.aggressor
    const theirLeader = c.revealed.plans[other]?.leader
    const mayCall = iAmIn && !answered && !!theirLeader && traitors.includes(theirLeader)
    const expired = now >= beat.closesAt
    return frame(
      <>
        <b style={{ display: 'block', fontSize: 16 }}>
          Plans on the table — {territoryName(c.territoryId)}
        </b>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
          <PlanLine faction={c.aggressor} plan={c.revealed.plans[c.aggressor] as never} />
          <PlanLine faction={c.defender} plan={c.revealed.plans[c.defender] as never} />
        </div>
        {/* THE BEAT: both sides answer, every battle — and only then does the
            fight resolve, so a battle that resolves at once says nothing
            about who holds what. */}
        <div style={{ marginTop: 12 }}>
          {iAmIn && !answered && (
            <>
              {mayCall && (
                <button type="button" disabled={busy} data-call-traitor=""
                  onClick={() => onAnswer(true)} style={{ ...chosen, width: 'auto', display: 'inline-block', marginRight: 8 }}>
                  Reveal the traitor — {theirLeader}
                </button>
              )}
              <button type="button" disabled={busy} data-no-traitor=""
                onClick={() => onAnswer(false)}
                style={{ ...btn, width: 'auto', display: 'inline-block' }}>
                Continue — no traitor
              </button>
            </>
          )}
          {iAmIn && answered && beat.answered.length < 2 && (
            <span style={{ opacity: 0.75 }}>Waiting on the other side…</span>
          )}
          {!iAmIn && !expired && <span style={{ opacity: 0.75 }}>The traitor beat.</span>}
          {expired && beat.answered.length < 2 && (
            <button type="button" disabled={busy} data-beat-push=""
              onClick={() => onAnswer(false)} style={{ ...btn, width: 'auto', display: 'inline-block' }}>
              The clock has run out — resolve
            </button>
          )}
        </div>
      </>,
    )
  }

  // ── the plan ────────────────────────────────────────────────────────────
  const iAmIn = seat === c.aggressor || seat === c.defender
  const committed = !!seat && c.committed.includes(seat)
  const expired = now >= c.closesAt
  if (!iAmIn || committed) {
    return frame(
      <>
        <b style={{ display: 'block', fontSize: 16 }}>
          {FACTION_LOOK[c.aggressor].name} vs {FACTION_LOOK[c.defender].name} — {territoryName(c.territoryId)}
        </b>
        <p style={{ opacity: 0.8 }}>
          {committed ? 'Your plan is in. ' : ''}
          Plans commit in secret and reveal together
          ({c.committed.length} of 2 in).
        </p>
        {expired && (
          <button type="button" disabled={busy} data-plan-push=""
            onClick={() => onPlan({ territoryId: c.territoryId, dial: 0 })}
            style={{ ...btn, width: 'auto', display: 'inline-block' }}>
            The clock has run out — reveal what is in
          </button>
        )}
      </>,
    )
  }

  const maxDial = seat
    ? forcesInBattle(forces, seat, c.territoryId, c.sectors)
    : 0
  const sheet = seat ? factionById(seat) : null
  const dead = new Set((tanks?.leaders?.[seat ?? ''] ?? []).map(l => l.name))
  const usable = (sheet?.leaders ?? []).filter(l =>
    !dead.has(l.name)
    && (!battles.usedLeaders[l.name] || battles.usedLeaders[l.name] === c.territoryId))
  const heroHeld = hand.includes(CHEAP_HERO_ID)
  const weapons = hand.filter(id => TREACHERY_CARDS.find(x => x.id === id)?.kind === 'weapon')
  const defences = hand.filter(id => TREACHERY_CARDS.find(x => x.id === id)?.kind === 'defense')
  const mayPlayCards = !!leader || hero
  const leaderObj = usable.find(l => l.name === leader) ?? null
  const heroCard = TREACHERY_CARDS.find(x => x.id === CHEAP_HERO_ID)!

  /** Weapon or defence, drawn as the CARD it is — rules text on its face,
   *  a magnifier to the tray's floating view — dark until a leader or the
   *  hero can carry it. */
  const cardRow = (ids: string[], picked: string | null,
    set: (id: string | null) => void, tag: 'weapon' | 'defence') => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {ids.map(id => {
        const cardObj = TREACHERY_CARDS.find(x => x.id === id)!
        return (
          <div key={id} style={{ position: 'relative' }}>
            <button type="button" aria-pressed={picked === id}
              disabled={!mayPlayCards}
              {...(tag === 'weapon' ? { 'data-plan-weapon': id } : { 'data-plan-defence': id })}
              onClick={() => set(picked === id ? null : id)}
              style={{
                background: 'none', padding: 2, lineHeight: 0,
                cursor: mayPlayCards ? 'pointer' : 'default',
                border: picked === id ? '2px solid #c9542a' : `2px solid ${SAND}22`,
                borderRadius: 8, opacity: mayPlayCards ? 1 : 0.5,
              }}>
              <TreacheryCardFace card={cardObj} width={150} />
            </button>
            <button type="button" aria-label={`Read ${cardObj.name}`}
              onClick={() => setZoomCard(cardObj)}
              style={{
                position: 'absolute', top: 6, right: 6, padding: '1px 5px',
                background: '#000000aa', color: SAND, border: `1px solid ${SAND}55`,
                borderRadius: 4, cursor: 'zoom-in', fontSize: 12,
              }}>🔍</button>
          </div>
        )
      })}
    </div>
  )

  return frame(
    <>
      <b style={{ display: 'block', fontSize: 16 }}>
        Your battle plan — {territoryName(c.territoryId)} vs{' '}
        {FACTION_LOOK[seat === c.aggressor ? c.defender : c.aggressor].name}
      </b>
      <BattleWheel faction={seat!} max={maxDial} dial={dial} onDial={setDial}
        leader={leaderObj} hero={hero} />
      <div style={{ textAlign: 'center', fontSize: 12, opacity: 0.8, marginTop: -4 }}>
        The dial is lost win or lose
      </div>

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
        The disc for the hub
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {usable.map(l => (
          <button key={l.name} type="button" data-plan-leader={l.name}
            aria-pressed={leader === l.name}
            title={`${l.name} — strength ${l.strength}`}
            onClick={() => { setLeader(leader === l.name ? null : l.name); setHero(false) }}
            style={{
              background: 'none', padding: 2, lineHeight: 0, cursor: 'pointer',
              border: leader === l.name ? '2px solid #c9542a' : '2px solid transparent',
              borderRadius: '50%',
            }}>
            <svg viewBox="-34 -34 68 68" width="64" height="64">
              <LeaderDisc leader={l} faction={seat!} r={32} />
            </svg>
          </button>
        ))}
        {heroHeld && (
          <button type="button" data-plan-hero=""
            aria-pressed={hero}
            onClick={() => { setHero(!hero); setLeader(null) }}
            style={{
              background: 'none', padding: 2, lineHeight: 0, cursor: 'pointer',
              border: hero ? '2px solid #c9542a' : `2px solid ${SAND}22`,
              borderRadius: 6,
            }}>
            <TreacheryCardFace card={heroCard} width={56} />
          </button>
        )}
      </div>
      {usable.length === 0 && !heroHeld && (
        <p style={{ fontSize: 12, opacity: 0.75 }}>
          No leader and no Cheap Hero: you fight with forces alone and may
          play no treachery cards.
        </p>
      )}

      {(usable.length > 0 || heroHeld) && (weapons.length > 0 || defences.length > 0) && (
        <>
          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
            Weapon{mayPlayCards ? '' : ' — pick a leader first'}
          </div>
          {cardRow(weapons, weapon, setWeapon, 'weapon')}
          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>Defence</div>
          {cardRow(defences, defence, setDefence, 'defence')}
        </>
      )}
      <button type="button" disabled={busy} data-plan-commit=""
        onClick={() => onPlan({
          territoryId: c.territoryId,
          dial,
          ...(leader ? { leader } : null),
          ...(hero ? { cheapHero: true } : null),
          ...(mayPlayCards && weapon ? { weapon } : null),
          ...(mayPlayCards && defence ? { defence } : null),
        })}
        style={{ ...chosen, marginTop: 12 }}>
        Commit the plan — it reveals with theirs
      </button>

      {zoomCard && (
        <DraggableResizable title={zoomCard.name}
          accentColor={seat ? FACTION_LOOK[seat].colour : SAND}
          width={CARD_ZOOM + 34} storageKey={`dune-card-battle-${seat}`}
          onClose={() => setZoomCard(null)}>
          <div data-layer="card-zoom" style={{ display: 'flex', justifyContent: 'center' }}>
            <TreacheryCardFace card={zoomCard} width={CARD_ZOOM} />
          </div>
        </DraggableResizable>
      )}
    </>,
  )
}
