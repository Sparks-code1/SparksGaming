/**
 * The rules card: what the board is saying, and what everybody can do.
 *
 * A REFERENCE, NOT A TUTORIAL. Nothing here teaches the game — it answers the
 * questions that come up mid-turn with five other people waiting: what is that
 * ring round a medallion, which phase comes after Revival, and what exactly can
 * the Bene Gesserit do that I should be worrying about.
 *
 * EVERY WORD COMES FROM THE DATA. The phase list is DUNE_PHASES, the faction
 * text is the prose on the faction sheets, the hand limits and revival rates are
 * the same fields the rules read. A rules card that restated any of it would be
 * a second source for the rules, and the copy that drifts is always the one
 * nobody is running.
 *
 * THE BOARD MARKS ARE DRAWN, not described. "A tinted ring round the medallion"
 * is a sentence you have to translate back into what you are looking at; the
 * mark itself is the thing you are looking at. They are copied here as small
 * SVGs in the same colours the board uses.
 */
import { useState } from 'react'
import { DUNE_PHASES } from '@/types/Dune/Game'
import type { GamePhase } from '@/types/Dune/Game'
import type { FactionId } from '@/types/Dune/Faction'
import { FACTIONS, FACTION_IDS } from '@/data/dune/factions'
import { FACTION_LOOK } from './SeatLayer'
import { LeaderDisc } from './LeaderDisc'

const PALE = '#f0e2bb'
const SERIF = 'Georgia, "Times New Roman", serif'
/** The board's own "waiting on this" gold — see DuneBoard's WAITING. */
const WAITING = '#e8b04b'

type Page = 'board' | 'sequence' | 'factions'

/**
 * What each phase is FOR, in one line.
 *
 * The only prose in this file that is not read from the data, because the data
 * has no such field: DUNE_PHASES is a list of names. Kept to one sentence each
 * on purpose — a paragraph per phase is the rulebook, and the rulebook is not
 * what somebody mid-turn is short of.
 */
// Exported so a test can measure the STRINGS. Scanning the source for them
// only proves characters were typed near the key; a phase whose line went
// blank at the end of an edit still has a long line.
export const WHAT_HAPPENS: Record<GamePhase, string> = {
  'Storm': 'The storm marker moves counter-clockwise. Forces caught in open sand'
    + ' are killed; the Fremen lose only half.',
  'Spice Blow and Nexus': 'A spice card is turned. A territory blows spice; Shai-Hulud'
    + ' devours what stands there and calls a Nexus, where alliances are made and broken.',
  'CHOAM Charity': 'Any faction holding two spice or fewer may claim charity, bringing'
    + ' them up to two.',
  'Bidding': 'Treachery cards are auctioned one at a time, in storm order. Payment goes'
    + ' to the Emperor if he is at the table.',
  'Revival': 'Forces and leaders come back from the Tleilaxu Tanks — some free, the'
    + ' rest paid for, up to a limit each turn.',
  'Shipment and Movement': 'Each faction in turn ships forces onto the planet and then'
    + ' moves one group. Shipping is paid to the Spacing Guild.',
  'Battles': 'Wherever two factions share a territory, they fight. Both commit a plan at'
    + ' once — a leader, a dial, a weapon, a defence — and reveal together.',
  'Spice Collection': 'Forces standing on spice collect it. Holding Arrakeen or Carthag'
    + ' pays a better rate.',
  'Mentat Pause': 'The turn ends. Victory is checked, and the two storm cards may be'
    + ' played for the storm to come.',
}

/** One drawn mark, beside what it means. */
function Mark({ art, name, children }: {
  art: React.ReactNode
  name: string
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
      <div style={{
        flex: '0 0 auto', width: 64, height: 64, borderRadius: 6,
        background: '#0d1220', border: `1px solid ${PALE}22`,
        display: 'grid', placeItems: 'center',
      }}>{art}</div>
      <div style={{ minWidth: 0 }}>
        <b style={{ display: 'block', fontSize: 13 }}>{name}</b>
        <span style={{ opacity: 0.82, lineHeight: 1.45 }}>{children}</span>
      </div>
    </div>
  )
}

function BoardPage() {
  return (
    <div data-rules-page="board">
      <p style={{ margin: '0 0 14px', opacity: 0.75, lineHeight: 1.5 }}>
        The marks the board adds to itself. Everything else printed on it —
        territory names, sector numbers, the spice spiral — is part of the map
        and never changes.
      </p>

      <Mark name="The phase, on its medallion" art={
        <svg viewBox="-26 -26 52 52" width="52" height="52">
          <circle r={18.5} fill={WAITING} fillOpacity={0.28} />
          <circle r={21} fill="none" stroke={WAITING} strokeWidth={2.6} />
        </svg>
      }>
        A tinted ring round one of the nine medallions on the rim: the phase the
        turn is in. The symbol inside it is printed on the board and says which
        phase that is — the ring only points.
      </Mark>

      <Mark name="The turn, on the dial" art={
        <svg viewBox="-26 -26 52 52" width="52" height="52">
          <circle r={21} fill="none" stroke={PALE} strokeWidth={0.8} opacity={0.4} />
          <path d="M0 0 L0 -21 A21 21 0 0 1 12.3 -17 Z"
            fill={WAITING} fillOpacity={0.3} stroke={WAITING} strokeWidth={2}
            strokeLinejoin="round" />
        </svg>
      }>
        One wedge of ten, filled in. A game runs ten turns; if nobody has won by
        the end of the tenth, the Spacing Guild wins — or the Fremen, if their
        own condition is met.
      </Mark>

      <Mark name="Waiting on this seat" art={
        <svg viewBox="-26 -26 52 52" width="52" height="52">
          <circle r={15} fill="#8a2f2f" stroke={PALE} strokeWidth={1.4} />
          <circle r={20} fill="none" stroke={WAITING} strokeWidth={2.4}
            strokeDasharray="4 3" />
        </svg>
      }>
        A dashed gold ring round a seat: the game is waiting on that player to
        answer something. If it is round yours, look at the rail.
      </Mark>

      <Mark name="The storm" art={
        <svg viewBox="-26 -26 52 52" width="52" height="52">
          <path d="M-21 6 Q-6 -8 8 2 T 21 -2" fill="none" stroke={WAITING}
            strokeWidth={3} strokeLinecap="round" opacity={0.85} />
          <path d="M-21 13 Q-4 0 12 8" fill="none" stroke={WAITING}
            strokeWidth={2} strokeLinecap="round" opacity={0.5} />
        </svg>
      }>
        The marker sits on one sector of the rim and sweeps counter-clockwise
        each turn. Nothing ships into it, moves into it, out of it, or through
        it, and no battle is fought in it.
      </Mark>

      <Mark name="Spice on the ground" art={
        <svg viewBox="-26 -26 52 52" width="52" height="52">
          <circle r={13} fill="#f6ecd2" stroke="#3f2c1a" strokeWidth={1.2} />
          <text x={0} y={1} fontSize={13} fill="#3f2c1a" textAnchor="middle"
            dominantBaseline="central" fontFamily={SERIF} fontWeight="bold">6</text>
        </svg>
      }>
        A blow has left spice in that territory, and the number is how much.
        Forces standing on the marker collect it during Spice Collection.
      </Mark>

      <Mark name="Forces" art={
        <svg viewBox="-26 -26 52 52" width="52" height="52">
          <circle cx={-6} r={13} fill="#2f6b4f" stroke={PALE} strokeWidth={1.6} />
          <text x={-6} y={1} fontSize={13} fill={PALE} textAnchor="middle"
            dominantBaseline="central" fontFamily={SERIF} fontWeight="bold">5</text>
          <circle cx={11} cy={8} r={8} fill="#7a3b8a" stroke={PALE} strokeWidth={1.3} />
        </svg>
      }>
        A disc in the faction&rsquo;s colour with the count on it. A second disc
        behind means another faction stands in the same territory — which is a
        battle, once the Battles phase comes round.
      </Mark>

      <Mark name="Elite forces" art={
        <svg viewBox="-26 -26 52 52" width="52" height="52">
          <circle r={13} fill="#8a2f2f" stroke={PALE} strokeWidth={1.6} />
          <path d="M0 -9 L2.1 -2.9 L8.5 -2.8 L3.4 1.1 L5.3 7.3 L0 3.6 L-5.3 7.3 L-3.4 1.1 L-8.5 -2.8 L-2.1 -2.9 Z"
            fill="none" stroke={PALE} strokeWidth={1.2} />
        </svg>
      }>
        A star marks Sardaukar (Emperor) or Fedaykin (Fremen). In the advanced
        game they count as two ordinary forces in battle and in taking losses,
        and only one may be revived per turn.
      </Mark>

      <Mark name="The spice deck" art={
        <svg viewBox="-26 -26 52 52" width="52" height="52">
          <rect x={-15} y={-20} width={30} height={40} rx={4}
            fill="#111a30" stroke={PALE} strokeWidth={1.2} />
          <text x={0} y={-11} fontSize={7} fill={PALE} textAnchor="middle"
            dominantBaseline="central" fontFamily={SERIF}>SPICE</text>
        </svg>
      }>
        Face down in the box on the surround, with its discard pile beside it —
        two piles in the advanced game. The card showing on a pile matters: a
        worm devours the territory named on it.
      </Mark>

      <Mark name="The Tleilaxu Tanks" art={
        <svg viewBox="-26 -26 52 52" width="52" height="52">
          <rect x={-18} y={-14} width={36} height={28} rx={4}
            fill="none" stroke={PALE} strokeWidth={1.2} opacity={0.7} />
          <circle cx={-7} cy={0} r={6} fill="#8a2f2f" opacity={0.85} />
          <circle cx={7} cy={0} r={6} fill="#2f6b4f" opacity={0.85} />
        </svg>
      }>
        Where dead forces and leaders go. They are not gone — Revival brings
        them back, some free and the rest for spice.
      </Mark>
    </div>
  )
}

function SequencePage() {
  return (
    <div data-rules-page="sequence">
      <p style={{ margin: '0 0 14px', opacity: 0.75, lineHeight: 1.5 }}>
        Nine phases, in this order, every turn. The board&rsquo;s nine medallions
        are these, in the same order.
      </p>
      <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {DUNE_PHASES.map((phase, i) => (
          <li key={phase} data-rules-phase={phase}
            style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <span style={{
              flex: '0 0 auto', width: 26, height: 26, borderRadius: '50%',
              display: 'grid', placeItems: 'center',
              border: `2px solid ${WAITING}`, color: WAITING,
              font: `bold 13px ${SERIF}`,
            }}>{i + 1}</span>
            <div style={{ minWidth: 0 }}>
              <b style={{ display: 'block', fontSize: 13 }}>{phase}</b>
              <span style={{ opacity: 0.82, lineHeight: 1.45 }}>
                {WHAT_HAPPENS[phase]}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** One block of a faction sheet, skipped when the sheet has nothing to say. */
function Rule({ label, text }: { label: string; text?: string }) {
  if (!text) return null
  return (
    <div style={{ marginBottom: 10 }}>
      <b style={{
        display: 'block', fontSize: 11, letterSpacing: 1, opacity: 0.6,
        textTransform: 'uppercase',
      }}>{label}</b>
      <span style={{ opacity: 0.9, lineHeight: 1.5 }}>{text}</span>
    </div>
  )
}

function FactionsPage({ show, onShow }: {
  show: FactionId
  onShow: (f: FactionId) => void
}) {
  const f = FACTIONS[show]
  if (!f) return null
  const look = FACTION_LOOK[show]
  return (
    <div data-rules-page="factions">
      {/* WHOSE SHEET. Six buttons rather than six pages, because the thing a
          player is doing here is COMPARING — they are looking one faction up
          and then the one beside it. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {FACTION_IDS.map(id => (
          <button key={id} type="button" data-rules-faction={id}
            aria-pressed={id === show}
            onClick={() => onShow(id)}
            style={{
              padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
              font: `12px ${SERIF}`, color: PALE,
              background: id === show ? FACTION_LOOK[id].colour : '#ffffff0d',
              border: `1px solid ${id === show ? PALE : '#ffffff26'}`,
            }}>
            {FACTION_LOOK[id]?.name ?? id}
          </button>
        ))}
      </div>

      <div style={{
        borderLeft: `3px solid ${look?.colour ?? PALE}`, paddingLeft: 12,
      }}>
        <b style={{ display: 'block', fontSize: 17, marginBottom: 2 }}>{f.name}</b>

        {/* THE NUMBERS FIRST, because they are what a player is usually after:
            how much spice does that seat start on, how big can their hand get. */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '4px 16px',
          margin: '0 0 12px', opacity: 0.85, fontSize: 12,
        }}>
          <span>{f.startingSpice} starting spice</span>
          {/* THE TOTAL, then the split. `reserves` alone read as the whole
              force and is not: the Atreides have ten of those and ten more
              standing in Arrakeen before a card is turned. */}
          <span>{f.forces.onPlanet + f.forces.reserves} forces{f.forces.onPlanet
            ? ` — ${f.forces.onPlanet} placed at setup, ${f.forces.reserves} in reserve`
            : ''}</span>
          {f.forces.starred > 0 && (
            <span>{f.forces.starred} of them elite</span>
          )}
          <span>hand limit {f.handLimit}</span>
          <span>{f.startingTreachery} treachery card{f.startingTreachery === 1 ? '' : 's'} at setup</span>
          <span>{f.freeRevivals} free revival{f.freeRevivals === 1 ? '' : 's'}</span>
          <span>{f.reservesHeld === 'on-planet'
            ? 'reserves on Arrakis' : 'reserves off-planet'}</span>
        </div>

        <Rule label="Storm" text={f.abilities.storm} />
        <Rule label="Spice blow" text={f.abilities.spiceBlow} />
        <Rule label="Shai-Hulud" text={f.abilities.shaiHulud} />
        <Rule label="Charity" text={f.abilities.charity} />
        <Rule label="Bidding" text={f.abilities.bidding} />
        <Rule label="Revival" text={f.abilities.revival} />
        <Rule label="Shipment" text={f.abilities.shipment} />
        <Rule label="Movement" text={f.abilities.movement} />
        <Rule label="Battle" text={f.abilities.battle} />
        <Rule label="Spice collection" text={f.abilities.spiceCollection} />
        <Rule label="Traitors" text={f.abilities.traitors} />
        <Rule label="Treachery" text={f.abilities.treachery} />
        <Rule label="Before the game" text={f.abilities.beforeGame} />

        <Rule label="Alliance" text={f.alliance} />
        <Rule label="Victory" text={f.specialVictory} />

        {/* THE ADVANCED SIDE, marked as such — half of it does nothing in a
            basic game, and a sheet that ran the two together would have a
            player planning round a rule that is not in play. */}
        <div style={{
          marginTop: 12, paddingTop: 10, borderTop: `1px solid ${PALE}22`,
        }}>
          <b style={{
            display: 'block', fontSize: 11, letterSpacing: 1.4, opacity: 0.55,
            marginBottom: 8,
          }}>THE ADVANCED GAME</b>
          <Rule label="General" text={f.advanced.general} />
          {/* BOTH OF THESE ARE THE BENE GESSERIT, and both were missing until
              the guard in tests/rulescardtest counted them: the advisors they
              place before anyone ships, and the rule that makes their
              worthless cards playable as Karamas. A player looking up what the
              Bene Gesserit can do would have read a sheet that answered and
              left those two out. */}
          <Rule label="Before the game" text={f.advanced.beforeGame} />
          <Rule label="Storm" text={f.advanced.storm} />
          <Rule label="Spice blow" text={f.advanced.spiceBlow} />
          <Rule label="Charity" text={f.advanced.charity} />
          <Rule label="Bidding" text={f.advanced.bidding} />
          <Rule label="Revival" text={f.advanced.revival} />
          <Rule label="Shipment" text={f.advanced.shipment} />
          <Rule label="Movement" text={f.advanced.movement} />
          <Rule label="Battle" text={f.advanced.battle} />
          <Rule label="Forces" text={f.advanced.forces} />
          <Rule label="Advisors" text={f.advanced.advisors} />
          <Rule label="Fighters" text={f.advanced.fighters} />
          <Rule label="Captured leaders" text={f.advanced.capturedLeaders} />
          <Rule label="Kwisatz Haderach" text={f.advanced.kwisatzHaderach} />
          <Rule label="Treachery" text={f.advanced.treachery} />
          <Rule label="Karama" text={f.advanced.karama} />
        </div>

        {/* THE LEADERS, with their strengths — the numbers that decide a battle
            and the faces you will be shown when one is called a traitor. */}
        <div style={{
          marginTop: 12, paddingTop: 10, borderTop: `1px solid ${PALE}22`,
        }}>
          <b style={{
            display: 'block', fontSize: 11, letterSpacing: 1.4, opacity: 0.55,
            marginBottom: 8,
          }}>LEADERS</b>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {f.leaders.map(l => (
              <div key={l.name} data-rules-leader={l.name}
                style={{ width: 74, textAlign: 'center' }}>
                <svg viewBox="-34 -34 68 68" width="64" height="64">
                  <LeaderDisc leader={l} faction={show} r={32} />
                </svg>
                <span style={{ display: 'block', fontSize: 11, opacity: 0.8 }}>
                  {l.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * @param seat this client's own faction, if it has one. Only decides which
 * sheet the Factions page opens on — a player looking up a rule is most often
 * looking up their own, and a spectator gets the Atreides like everybody used
 * to. It grants nothing and hides nothing: every sheet is public, which is why
 * this card exists.
 */
export function RulesCard({ seat = null }: { seat?: FactionId | null }) {
  const [page, setPage] = useState<Page>('board')
  const [faction, setFaction] = useState<FactionId>(seat ?? 'atreides')

  const tabs: { id: Page; name: string }[] = [
    { id: 'board', name: 'The board' },
    { id: 'sequence', name: 'Sequence of play' },
    { id: 'factions', name: 'Factions' },
  ]

  return (
    <div data-layer="rules-card" style={{
      font: `12.5px ${SERIF}`, color: PALE,
    }}>
      {/* STUCK TO THE TOP. The faction sheet is several screens long and the
          way out of it is these three buttons; scrolled off, the only way back
          to the sequence of play is to scroll all the way up first. The
          negative margins are the window body's own padding, cancelled so the
          strip covers the full width as text passes under it. */}
      <div style={{
        display: 'flex', gap: 6, marginBottom: 12,
        borderBottom: `1px solid ${PALE}22`, paddingBottom: 10,
        position: 'sticky', top: -14, zIndex: 1, background: '#150B02',
        margin: '-14px -16px 12px', padding: '14px 16px 10px',
      }}>
        {tabs.map(t => (
          <button key={t.id} type="button" data-rules-tab={t.id}
            aria-pressed={page === t.id}
            onClick={() => setPage(t.id)}
            style={{
              padding: '5px 12px', borderRadius: 5, cursor: 'pointer',
              font: `12px ${SERIF}`, color: PALE,
              background: page === t.id ? '#ffffff1f' : 'transparent',
              border: `1px solid ${page === t.id ? PALE + '66' : '#ffffff1f'}`,
            }}>
            {t.name}
          </button>
        ))}
      </div>

      {page === 'board' && <BoardPage />}
      {page === 'sequence' && <SequencePage />}
      {page === 'factions' && (
        <FactionsPage show={faction} onShow={setFaction} />
      )}
    </div>
  )
}

export default RulesCard
