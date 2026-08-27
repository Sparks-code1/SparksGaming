/**
 * The setup decisions, as controls for the seat that owes them.
 *
 * Until this existed, all four were answered by the clock. The window opened,
 * the table looked at a board with no Fremen on it, and three minutes later the
 * server applied a default to everybody — which is a legal opening position and
 * nobody's opening position. This is the other half: the same four answers,
 * made by the people whose answers they are.
 *
 * ONLY WHAT THIS SEAT OWES. `outstanding` is public — six people round a table
 * can see that the Fremen are still placing — but a control is not a status:
 * offering the Bene Gesserit a Fremen distribution would be offering a choice
 * the server is going to refuse, and doing it in the one place a player expects
 * a button to mean something. So the list is filtered to this seat and the
 * panel disappears entirely when it owes nothing.
 *
 * NO CLOCK OF ITS OWN. The deadline is on the board, in the band between the
 * Tleilaxu Tanks and the spice deck, where the whole table reads the same one —
 * see PhaseTimer, and CharityModal, which declines to draw a second countdown
 * for the same reason. What this says instead is what SILENCE MEANS, per
 * decision, because that is the part the board cannot show: a player deciding
 * whether to answer needs to know what gets answered for them.
 *
 * IT DOES NOT SCRIM THE BOARD, unlike the auction. The Bene Gesserit's advisor
 * is placed on the strength of where the Fremen just went — that is the entire
 * reason it waits on them — so a panel that hid the map would take away the
 * information the decision is made from. It floats along the foot of the board
 * area and can be shut to its header, like the auction's bar.
 *
 * WHAT IT MAY SEE. The four traitors come in as `dealt`, from this browser's
 * own secrets row and from nowhere else: the public ask says only "keep one of
 * the four you hold" — see lib/dune/setup — and this component cannot look a
 * deal up, derive one, or fetch one. Same rule as the prescience card in
 * BiddingPanel, and the same shape: a prop, or nothing.
 */
import { useState } from 'react'
import { DUNE_TERRITORIES, DUNE_SECTORS } from '@/data/dune/boardData'
import { findLeader, factionById } from '@/data/dune/factions'
import { FACTION_LOOK } from './SeatLayer'
import {
  distributeAmong, defaultSector, postureFor, PREDICTION_TURNS,
} from '@/lib/dune/setup'
import type { SetupDecision } from '@/lib/dune/setup'
import type { Force } from '@/types/Dune/Game'
import type { FactionId } from '@/types/Dune/Faction'

const PALE = '#f0e2bb'
const SERIF = "Georgia, 'Times New Roman', serif"

/** One entry of a Fremen distribution, as the server takes it. */
export interface PlacedForce {
  territoryId: string
  sector?: string
  count: number
}

export interface SetupPanelProps {
  /** Which seat this browser holds. */
  seat: FactionId
  /**
   * Every decision setup is still waiting on, from public state.
   *
   * The whole list, not this seat's share of it: whether the advisor placement
   * may be answered yet is a question about whether ANY Fremen placement is
   * still outstanding, which cannot be answered from one seat's own rows.
   */
  outstanding: readonly SetupDecision[]
  /**
   * The four traitors this seat was dealt.
   *
   * From its own secrets row. Empty while that channel is still opening, which
   * is said out loud rather than drawn as four blanks.
   */
  dealt?: readonly string[]
  /** Who is at the table. Public, and what a prediction may name. */
  seated: readonly FactionId[]
  /**
   * The board as it stands, from public state.
   *
   * Read for one thing: whether a force placed in a given territory would be an
   * advisor or a fighter. That is not a choice anybody makes — it is read off
   * who else is standing there — so showing it is showing the player the rule,
   * not offering them an option.
   */
  forces: readonly Force[]
  onFremenPlacement(at: readonly PlacedForce[]): void
  onPrediction(faction: FactionId, turn: number): void
  onTraitor(keep: string): void
  onAdvisorPlacement(territoryId: string, sector?: string): void
  /** A request is in flight. Every button waits rather than queueing. */
  busy?: boolean
  /** The server's own refusal code, if it refused. */
  refused?: string | null
}

/** What a refusal means, in words the seat can act on. */
const REFUSAL_TEXT: Record<string, string> = {
  'not-outstanding': 'You do not owe that answer.',
  blocked: 'The Fremen have not placed yet.',
  'wrong-total': 'That does not place all of them.',
  'not-among': 'That is not somewhere you may place.',
  negative: 'A stack cannot be negative.',
  'unknown-faction': 'That faction is not at this table.',
  'predicting-yourself': 'You may not predict your own victory.',
  'turn-out-of-range': `A prediction names a turn from ${PREDICTION_TURNS.min} to ${PREDICTION_TURNS.max}.`,
  'not-dealt': 'That is not one of the four you hold.',
  'no-setup': 'Setup is over.',
  stale: 'The table moved while you were deciding. Try again.',
}

const territory = (id: string) => DUNE_TERRITORIES.find(t => t.id === id) ?? null
const territoryName = (id: string) => territory(id)?.displayName ?? id
const sectorNumber = (id: string) => DUNE_SECTORS.find(s => s.id === id)?.number ?? id

const button = (primary: boolean) => ({
  font: `${primary ? '600 ' : ''}12.5px ${SERIF}`,
  padding: primary ? '8px 16px' : '5px 10px',
  borderRadius: 5,
  cursor: 'pointer',
  border: primary ? '1px solid #c9542a' : '1px solid #ffffff33',
  background: primary ? '#c9542a' : 'transparent',
  color: primary ? '#fff' : PALE,
})

const block = {
  border: '1px solid #ffffff1c', borderRadius: 7, padding: '9px 10px', marginTop: 8,
}
const legend = {
  font: `600 12px ${SERIF}`, letterSpacing: 0.8, textTransform: 'uppercase' as const,
  margin: '0 0 6px', display: 'block',
}
const quiet = { margin: '6px 0 0', fontSize: 11.5, opacity: 0.62, lineHeight: 1.45 }

/**
 * Which sector a stack stands in, where the territory spans more than one.
 *
 * A FORCE OCCUPIES A SECTOR, not a territory — that is what the storm reads and
 * what a worm eats. Sietch Tabr is one sector and there is nothing to ask;
 * False Wall South and False Wall West are not, and the difference is the
 * difference between losing ten forces to the first storm and losing none.
 */
function SectorPicker(
  { territoryId, value, onChange, disabled }:
  { territoryId: string; value: string; onChange(s: string): void; disabled?: boolean },
) {
  const sectors = territory(territoryId)?.sectors ?? []
  if (sectors.length < 2) return null
  return (
    <label style={{ fontSize: 11.5, opacity: 0.85 }}>
      {' '}sector{' '}
      <select value={value} disabled={disabled} onChange={e => onChange(e.target.value)}
        aria-label={`Sector in ${territoryName(territoryId)}`}
        style={{ font: `11.5px ${SERIF}` }}>
        {sectors.map(s => <option key={s} value={s}>{sectorNumber(s)}</option>)}
      </select>
    </label>
  )
}

/**
 * The Fremen's ten, across the three territories their card names.
 *
 * THE THREE COME FROM THE FACTION DATA, like everything else about a starting
 * position here, and so does the ten. A list written into this component would
 * be a second copy of the rules card, and the one on screen would be the one
 * that drifted.
 *
 * IT WILL NOT SUBMIT A DISTRIBUTION THAT IS NOT TEN. The server refuses those
 * — `wrong-total` — and there is no reason to spend a round trip finding out
 * what the client already knows. What it will not do is guess the rest for you.
 */
function FremenPlacement(
  { faction, busy, onAnswer }:
  { faction: FactionId; busy?: boolean; onAnswer: SetupPanelProps['onFremenPlacement'] },
) {
  const among = distributeAmong(faction)
  // OFF THE FACTION'S OWN CARD, both of them — the territories and the count.
  // A ten written here would be a second copy of the rules, and this is the
  // copy the player is looking at.
  const total = factionById(faction)?.forces.onPlanet ?? 0
  const [counts, setCounts] = useState<Record<string, number>>(
    () => Object.fromEntries(among.map(id => [id, 0])))
  const [sectors, setSectors] = useState<Record<string, string>>(
    () => Object.fromEntries(among.map(id => [id, defaultSector(id)])))

  const placed = among.reduce((n, id) => n + (counts[id] ?? 0), 0)
  const left = total - placed

  // FROM THE PREVIOUS COUNTS, not from this render's. Ten forces is ten presses
  // of a button, and presses that land inside one React batch all read the same
  // closure — so a player tapping quickly places three of their ten and cannot
  // see why. Both bounds are worked out in here for the same reason: the room
  // left is a fact about the whole distribution, and the distribution being
  // clamped against is the one this update is applied to.
  const nudge = (id: string, delta: number) => setCounts(c => {
    const room = total - among.reduce((n, t) => n + (c[t] ?? 0), 0)
    return { ...c, [id]: Math.max(0, (c[id] ?? 0) + Math.min(delta, room)) }
  })

  return (
    <div style={block}>
      <b style={legend}>Your {total} forces</b>
      {among.map(id => (
        <div key={id} style={{
          display: 'flex', alignItems: 'center', gap: 6, margin: '5px 0', flexWrap: 'wrap',
        }}>
          <span style={{ flex: '1 1 120px', fontSize: 12.5 }}>{territoryName(id)}</span>
          <button type="button" style={button(false)} disabled={busy || (counts[id] ?? 0) <= 0}
            aria-label={`One fewer in ${territoryName(id)}`}
            onClick={() => nudge(id, -1)}>−</button>
          <span data-territory={id} data-count={counts[id] ?? 0}
            style={{ minWidth: 22, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
            {counts[id] ?? 0}
          </span>
          <button type="button" style={button(false)} disabled={busy || left <= 0}
            aria-label={`One more in ${territoryName(id)}`}
            onClick={() => nudge(id, 1)}>+</button>
          <SectorPicker territoryId={id} value={sectors[id] ?? defaultSector(id)}
            disabled={busy} onChange={s => setSectors(x => ({ ...x, [id]: s }))} />
        </div>
      ))}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
        <button type="button" style={button(true)} disabled={busy || left !== 0}
          onClick={() => onAnswer(among
            .filter(id => (counts[id] ?? 0) > 0)
            .map(id => ({ territoryId: id, sector: sectors[id], count: counts[id] })))}>
          Place them
        </button>
        <span style={{ fontSize: 12, opacity: 0.8 }}>
          {left === 0 ? `all ${total} placed` : `${left} still to place`}
        </span>
      </div>
      <p style={quiet}>
        Silence puts all {total} in {territoryName(among[0] ?? '')} when the clock runs out.
      </p>
    </div>
  )
}

/**
 * The one traitor kept, of the four dealt.
 *
 * TWO STEPS, and deliberately. This binds the single most valuable secret in
 * the game for the whole match — a known traitor is a battle that cannot be
 * lost — and it cannot be taken back. A one-click list would make a misclick
 * permanent, and the four are shown at a size where two of them can look alike.
 *
 * THE OTHER THREE GO BACK. Saying so matters: a player who thinks they are
 * choosing which to reveal first will pick differently from one who knows they
 * are keeping one and losing three.
 */
function TraitorChoice(
  { dealt, busy, onAnswer }:
  { dealt: readonly string[]; busy?: boolean; onAnswer: SetupPanelProps['onTraitor'] },
) {
  const [keep, setKeep] = useState<string | null>(null)

  return (
    <div style={block}>
      <b style={legend}>Keep one traitor</b>
      {dealt.length === 0 ? (
        // NOT FOUR BLANKS. The four live in this seat's own row and arrive on
        // their own channel; drawing placeholders for them would be a panel
        // that looks dealt before it is.
        <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>
          Your four have not reached this browser yet.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {dealt.map(name => {
              const found = findLeader(name)
              const chosen = keep === name
              return (
                <button key={name} type="button" disabled={busy}
                  aria-pressed={chosen} data-leader={name}
                  onClick={() => setKeep(chosen ? null : name)}
                  style={{
                    ...button(false), textAlign: 'left', flex: '1 1 46%',
                    borderColor: chosen ? '#c9542a' : '#ffffff33',
                    background: chosen ? '#c9542a2e' : 'transparent',
                  }}>
                  <b style={{ display: 'block', fontSize: 12.5 }}>{name}</b>
                  <span style={{ fontSize: 11, opacity: 0.75 }}>
                    {found ? `${FACTION_LOOK[found.faction].name} · strength ${found.leader.strength}` : 'unknown leader'}
                  </span>
                </button>
              )
            })}
          </div>
          <div style={{ marginTop: 8 }}>
            <button type="button" style={button(true)} disabled={busy || !keep}
              onClick={() => keep && onAnswer(keep)}>
              {keep ? `Keep ${keep}` : 'Keep one'}
            </button>
          </div>
          <p style={quiet}>
            The other three go back to the deck. Silence keeps the first of the four.
          </p>
        </>
      )}
    </div>
  )
}

/**
 * The Bene Gesserit's prediction: who wins, and on which turn.
 *
 * THEY ARE NOT IN THE LIST. Predicting your own victory is just playing the
 * game, and the server refuses it — so the option is absent rather than offered
 * and rejected.
 *
 * IT NEVER TOUCHES PUBLIC STATE. What is chosen here goes to the server and
 * into one row, theirs; the power is worthless the moment anybody else knows
 * it, and a prediction in the shared row would be a secret published in the one
 * place everybody reads.
 */
function Prediction(
  { seat, seated, busy, onAnswer }:
  {
    seat: FactionId; seated: readonly FactionId[]; busy?: boolean
    onAnswer: SetupPanelProps['onPrediction']
  },
) {
  const others = seated.filter(f => f !== seat)
  const turns = Array.from(
    { length: PREDICTION_TURNS.max - PREDICTION_TURNS.min + 1 },
    (_, i) => PREDICTION_TURNS.min + i)
  const [who, setWho] = useState<string>('')
  const [turn, setTurn] = useState<string>('')

  return (
    <div style={block}>
      <b style={legend}>Your prediction</b>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontSize: 12 }}>
          who{' '}
          <select value={who} disabled={busy} aria-label="Faction you predict will win"
            onChange={e => setWho(e.target.value)} style={{ font: `12px ${SERIF}` }}>
            <option value="">—</option>
            {others.map(f => (
              <option key={f} value={f}>{FACTION_LOOK[f].name}</option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 12 }}>
          on turn{' '}
          <select value={turn} disabled={busy} aria-label="Turn they win on"
            onChange={e => setTurn(e.target.value)} style={{ font: `12px ${SERIF}` }}>
            <option value="">—</option>
            {turns.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <button type="button" style={button(true)} disabled={busy || !who || !turn}
          onClick={() => onAnswer(who as FactionId, Number(turn))}>
          Predict
        </button>
      </div>
      <p style={quiet}>
        Sealed until the game ends, and binding. Silence is no prediction — it costs
        you that route to victory and nothing else.
      </p>
    </div>
  )
}

/**
 * The Bene Gesserit's one force, anywhere on the board.
 *
 * BLOCKED UNTIL THE FREMEN HAVE PLACED, and blocked in the sense of not being
 * offered: the controls are absent, not disabled-with-a-shrug, and the reason
 * is written where the controls would be. The rule is theirs to benefit from —
 * whether that force is an advisor or a fighter depends on who is standing in
 * the territory, and the Fremen's ten are the last thing at setup that can put
 * somebody there.
 *
 * WHICH IT WOULD BE IS SHOWN, not asked. Posture is read off the board — see
 * postureFor — so this is the rule being displayed rather than a choice being
 * offered, and it changes as the selection changes.
 */
function AdvisorPlacement(
  { seat, forces, blocked, busy, onAnswer }:
  {
    seat: FactionId; forces: readonly Force[]; blocked: boolean; busy?: boolean
    onAnswer: SetupPanelProps['onAdvisorPlacement']
  },
) {
  const [where, setWhere] = useState<string>('')
  const [sector, setSector] = useState<string>('')

  const posture = where ? postureFor(forces, where, seat) : null
  const places = [...DUNE_TERRITORIES].sort((a, b) => a.displayName.localeCompare(b.displayName))

  return (
    <div style={block}>
      <b style={legend}>Your advisor</b>
      {blocked ? (
        <p data-blocked="advisor-placement" style={{ margin: 0, fontSize: 12, opacity: 0.75 }}>
          The Fremen have not placed yet. You choose knowing where their ten went,
          so this opens when they answer.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ fontSize: 12 }}>
              in{' '}
              <select value={where} disabled={busy} aria-label="Territory for your advisor"
                onChange={e => { setWhere(e.target.value); setSector(defaultSector(e.target.value)) }}
                style={{ font: `12px ${SERIF}`, maxWidth: 190 }}>
                <option value="">—</option>
                {places.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.displayName}{t.stronghold ? ' ★' : ''}
                  </option>
                ))}
              </select>
            </label>
            {where && (
              <SectorPicker territoryId={where} value={sector || defaultSector(where)}
                disabled={busy} onChange={setSector} />
            )}
            <button type="button" style={button(true)} disabled={busy || !where}
              onClick={() => onAnswer(where, sector || defaultSector(where))}>
              Place it
            </button>
          </div>
          {posture && (
            <p data-posture={posture} style={{ margin: '7px 0 0', fontSize: 12, opacity: 0.85 }}>
              {posture === 'advisor'
                ? 'Somebody else is standing there, so it goes in as an advisor — peaceful, and holding nothing.'
                : 'Nobody else is there, so an advisor would have nobody to advise: it takes the field as a fighter.'}
            </p>
          )}
          <p style={quiet}>
            Silence puts it in the Polar Sink, where the basic game puts it.
          </p>
        </>
      )}
    </div>
  )
}

export function SetupPanel({
  seat, outstanding, dealt = [], seated, forces,
  onFremenPlacement, onPrediction, onTraitor, onAdvisorPlacement,
  busy, refused,
}: SetupPanelProps) {
  const [shut, setShut] = useState(false)

  // ONLY THIS SEAT'S. See the note at the top: the list is public, the controls
  // are not — a button that can only be refused is worse than no button.
  const owed = outstanding.filter(d => d.faction === seat)
  if (owed.length === 0) return null

  const owes = (kind: SetupDecision['kind']) => owed.some(d => d.kind === kind)
  // ANSWERABLE, NOT MERELY OWED. The advisor is owed from the moment the game
  // is dealt; it becomes answerable when no Fremen placement is left anywhere
  // on the list — which is why the whole list is passed in and not this seat's
  // share of it.
  const advisorBlocked = outstanding.some(d => d.kind === 'fremen-placement')

  return (
    <section data-layer="setup-panel" aria-label="Your setup decisions"
      style={{
        position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 10,
        zIndex: 22, width: 'min(560px, calc(100% - 16px))', maxHeight: '74%',
        overflowY: 'auto', color: PALE, font: `12.5px ${SERIF}`,
        background: '#151d30f5', border: '1px solid #ffffff26', borderRadius: 10,
        padding: '10px 12px 12px', boxShadow: '0 14px 40px #00000066',
      }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <b style={{ font: `600 14px ${SERIF}`, letterSpacing: 0.5 }}>Setting up</b>
        <span data-owed={owed.length} style={{ flex: 1, fontSize: 12, opacity: 0.75 }}>
          {owed.length === 1 ? 'one answer from you' : `${owed.length} answers from you`}
        </span>
        {/* SHUT TO THE HEADER, not closed. The clock does not stop for a player
            who wanted to look at the board, and the advisor decision is made by
            looking at the board — so it folds away and comes back rather than
            being dismissed. */}
        <button type="button" style={button(false)} aria-expanded={!shut}
          onClick={() => setShut(s => !s)}>
          {shut ? 'Show' : 'Hide'}
        </button>
      </header>

      {!shut && (
        <>
          {owes('fremen-placement') && (
            <FremenPlacement faction={seat} busy={busy} onAnswer={onFremenPlacement} />
          )}
          {owes('traitor') && (
            <TraitorChoice dealt={dealt} busy={busy} onAnswer={onTraitor} />
          )}
          {owes('prediction') && (
            <Prediction seat={seat} seated={seated} busy={busy} onAnswer={onPrediction} />
          )}
          {owes('advisor-placement') && (
            <AdvisorPlacement seat={seat} forces={forces} blocked={advisorBlocked}
              busy={busy} onAnswer={onAdvisorPlacement} />
          )}

          <p style={{ margin: '9px 0 0', minHeight: '1.3em', fontSize: 12, opacity: 0.8 }}>
            {busy ? 'asking…'
              : refused ? `The server refused it: ${REFUSAL_TEXT[refused] ?? refused}`
              : 'Answer in any order. The others are not waiting on you.'}
          </p>
        </>
      )}
    </section>
  )
}

export default SetupPanel
