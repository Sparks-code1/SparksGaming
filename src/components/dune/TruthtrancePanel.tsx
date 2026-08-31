/**
 * The Truthtrance ask: name a player, build a question, hear the truth.
 *
 * The card the printed game trusts a player to answer honestly is answered
 * by the SERVER out of the secret store — see lib/dune/truthtrance for the
 * whole design. What this panel owns is only the choosing: a target, a
 * template from the fixed bank, its parameter, and a live preview of the
 * exact public wording — because the question is public too, and a player
 * should read what the table will read before they spend the card on it.
 *
 * The battle-plan questions are always offered, in or out of a battle: a
 * menu that hid them would leave a player unable to see what the card can
 * do until the moment they need it. Asking one at the wrong time refuses
 * with its reason, and the reason is shown here.
 */
import { useState } from 'react'
import { FACTION_LOOK } from './SeatLayer'
import { TREACHERY_CARDS } from '@/data/dune/treachery'
import { FACTIONS, FACTION_IDS } from '@/data/dune/factions'
import { phraseQuestion } from '@/lib/dune/truthtrance'
import type { TruthtranceQuestion } from '@/lib/dune/truthtrance'
import type { FactionId } from '@/types/Dune/Faction'

export interface TruthtrancePanelProps {
  seat: FactionId
  players: readonly { faction: FactionId }[]
  onAsk: (target: FactionId, question: TruthtranceQuestion) => void
  onClose: () => void
  busy?: boolean
  refusal?: string | null
}

const REFUSAL_TEXT: Record<string, string> = {
  'target-is-self': 'The card cannot be turned on its own holder.',
  'no-such-card': 'No such card.',
  'no-such-leader': 'No such leader.',
  'no-such-faction': 'No such faction.',
  'amount-out-of-range': 'That amount cannot be asked.',
  'turn-out-of-range': 'Turns run one to ten.',
  'not-the-bene-gesserit': 'Only the Bene Gesserit can be asked that.',
  'no-prediction-made': 'No prediction has been made yet.',
  'no-secret-for-seat': 'That seat has no record to answer from.',
  'no-battle-in-progress': 'No battle is open.',
  'plans-not-all-committed': 'Not every plan is in yet — the question waits.',
  'plans-already-revealed': 'The plans are on the table; there is nothing left to ask.',
  'not-in-this-battle': 'They are not in this battle.',
  'card-not-held': 'You do not hold Truthtrance.',
  'stale': 'The table moved first — try again.',
}

type TemplateId = TruthtranceQuestion['ask']

const TEMPLATES: { id: TemplateId; label: string }[] = [
  { id: 'holds-card', label: 'Do they hold a named card?' },
  { id: 'holds-kind', label: 'Do they hold a kind of card?' },
  { id: 'holds-weapon-of-class', label: 'Do they hold a weapon of a class?' },
  { id: 'holds-defence-of-class', label: 'Do they hold a defence against a class?' },
  { id: 'traitor-is', label: 'Is a named leader their traitor?' },
  { id: 'traitor-in-faction', label: 'Do they hold a traitor from a faction?' },
  { id: 'spice-at-least', label: 'Do they have at least N spice?' },
  { id: 'predicted-faction', label: 'Did they predict a faction? (Bene Gesserit)' },
  { id: 'predicted-turn', label: 'Did they predict a turn? (Bene Gesserit)' },
  { id: 'plan-leader-is', label: 'Battle: is a named leader their plan’s?' },
  { id: 'plan-uses-cheap-hero', label: 'Battle: are they using a Cheap Hero?' },
  { id: 'plan-has-weapon', label: 'Battle: are they playing a weapon?' },
  { id: 'plan-has-defence', label: 'Battle: are they playing a defence?' },
  { id: 'plan-weapon-of-class', label: 'Battle: a weapon of a class?' },
  { id: 'plan-defence-of-class', label: 'Battle: a defence against a class?' },
  { id: 'plan-dialled-at-least', label: 'Battle: dialled at least N?' },
]

const ALL_LEADERS = FACTION_IDS.flatMap(id => FACTIONS[id]?.leaders.map(l => l.name) ?? [])

const field = {
  background: '#ffffff12', color: '#f0e2bb', border: '1px solid #f0e2bb44',
  borderRadius: 4, padding: '4px 6px', font: '13px Georgia, serif',
} as const

export function TruthtrancePanel({
  seat, players, onAsk, onClose, busy = false, refusal = null,
}: TruthtrancePanelProps) {
  const [target, setTarget] = useState<FactionId | null>(null)
  const [template, setTemplate] = useState<TemplateId>('holds-card')
  const [cardId, setCardId] = useState(TREACHERY_CARDS[0]?.id ?? '')
  const [kind, setKind] = useState('weapon')
  const [battleClass, setBattleClass] = useState('projectile')
  const [leader, setLeader] = useState(ALL_LEADERS[0] ?? '')
  const [faction, setFaction] = useState<string>(FACTION_IDS[0])
  const [amount, setAmount] = useState(5)
  const [turn, setTurn] = useState(5)

  // The chosen question, built from the template and its parameter — the
  // same object the server will judge, previewed in its public wording.
  const question: TruthtranceQuestion =
    template === 'holds-card' ? { ask: template, cardId }
      : template === 'holds-kind' ? { ask: template, kind: kind as never }
      : template === 'holds-weapon-of-class' || template === 'holds-defence-of-class'
        || template === 'plan-weapon-of-class' || template === 'plan-defence-of-class'
        ? { ask: template, battleClass: battleClass as never }
      : template === 'traitor-is' || template === 'plan-leader-is'
        ? { ask: template, leader }
      : template === 'traitor-in-faction' || template === 'predicted-faction'
        ? { ask: template, faction: faction as never }
      : template === 'spice-at-least' || template === 'plan-dialled-at-least'
        ? { ask: template, amount }
      : template === 'predicted-turn' ? { ask: template, turn }
      : { ask: template } as TruthtranceQuestion

  const param = () => {
    switch (template) {
      case 'holds-card':
        return (
          <select data-tt-card="" value={cardId} onChange={e => setCardId(e.target.value)} style={field}>
            {TREACHERY_CARDS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )
      case 'holds-kind':
        return (
          <select data-tt-kind="" value={kind} onChange={e => setKind(e.target.value)} style={field}>
            <option value="weapon">weapon</option>
            <option value="defense">defence</option>
            <option value="special">special</option>
            <option value="worthless">worthless</option>
          </select>
        )
      case 'holds-weapon-of-class':
      case 'holds-defence-of-class':
      case 'plan-weapon-of-class':
      case 'plan-defence-of-class':
        return (
          <select data-tt-class="" value={battleClass} onChange={e => setBattleClass(e.target.value)} style={field}>
            <option value="projectile">projectile</option>
            <option value="poison">poison</option>
          </select>
        )
      case 'traitor-is':
      case 'plan-leader-is':
        return (
          <select data-tt-leader="" value={leader} onChange={e => setLeader(e.target.value)} style={field}>
            {ALL_LEADERS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        )
      case 'traitor-in-faction':
      case 'predicted-faction':
        return (
          <select data-tt-faction="" value={faction} onChange={e => setFaction(e.target.value)} style={field}>
            {FACTION_IDS.map(f => <option key={f} value={f}>{FACTION_LOOK[f]?.name ?? f}</option>)}
          </select>
        )
      case 'spice-at-least':
      case 'plan-dialled-at-least':
        return (
          <input data-tt-amount="" type="number" min={1} max={30} value={amount}
            onChange={e => setAmount(Number(e.target.value))} style={{ ...field, width: 64 }} />
        )
      case 'predicted-turn':
        return (
          <input data-tt-turn="" type="number" min={1} max={10} value={turn}
            onChange={e => setTurn(Number(e.target.value))} style={{ ...field, width: 64 }} />
        )
      default:
        return null
    }
  }

  return (
    <div data-layer="truthtrance-panel" style={{
      position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
      background: '#000000a0', zIndex: 30,
    }}>
      <div style={{
        width: 480, maxWidth: '92%', maxHeight: '86%', overflowY: 'auto',
        background: '#131c2e', color: '#f0e2bb', borderRadius: 8,
        border: '1px solid #f0e2bb44', padding: '14px 16px',
        font: '14px Georgia, serif',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <b style={{ fontSize: 16 }}>Truthtrance</b>
          <span style={{ opacity: 0.7, fontSize: 12 }}>
            one question, answered by the table itself — question and answer
            are public
          </span>
          <span style={{ flex: 1 }} />
          <button type="button" data-tt-close="" onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#f0e2bb', cursor: 'pointer', fontSize: 15 }}>
            ✕
          </button>
        </div>

        <div style={{ marginTop: 10 }}>
          <span style={{ fontSize: 12, opacity: 0.75 }}>Ask of:</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
            {players.filter(p => p.faction !== seat).map(p => (
              <button key={p.faction} type="button" data-tt-target={p.faction}
                onClick={() => setTarget(p.faction)}
                style={{
                  padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
                  border: `1px solid ${target === p.faction ? FACTION_LOOK[p.faction].colour : '#f0e2bb33'}`,
                  background: target === p.faction ? '#ffffff1d' : '#ffffff0a',
                  color: '#f0e2bb',
                }}>
                {FACTION_LOOK[p.faction]?.name ?? p.faction}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select data-tt-template="" value={template}
            onChange={e => setTemplate(e.target.value as TemplateId)} style={field}>
            {TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          {param()}
        </div>

        {/* THE PUBLIC WORDING, previewed before the card is spent on it:
            asking says what you are afraid of, and that price should be
            readable in advance. */}
        <p data-tt-preview="" style={{
          marginTop: 12, padding: '8px 10px', background: '#0d1220',
          borderRadius: 5, fontStyle: 'italic',
        }}>
          {'“'}{phraseQuestion(question)}{'”'}
        </p>

        {refusal && (
          <p data-tt-refusal={refusal} style={{ color: '#e8b04b', marginTop: 6 }}>
            {REFUSAL_TEXT[refusal] ?? `Refused: ${refusal}`}
          </p>
        )}

        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button type="button" data-tt-ask="" disabled={busy || !target}
            onClick={() => target && onAsk(target, question)}
            style={{
              padding: '6px 16px', borderRadius: 4, border: 'none',
              cursor: target ? 'pointer' : 'default', opacity: target ? 1 : 0.5,
            }}>
            Ask — the card is spent
          </button>
        </div>
      </div>
    </div>
  )
}
