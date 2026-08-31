/**
 * The player's own strip, along the bottom.
 *
 * THE LINE THIS COMPONENT SITS ON. Everything above it — the board, the HUD
 * down the right — is public by rule. This is the one part of the screen that
 * shows things only this seat may see, and the split is carried in the props:
 * `own` is the seat's match_secrets row and holds spice, the cards themselves
 * and the traitors; `player` is that seat's line out of the shared row and
 * holds only what the whole table can see anyway.
 *
 * The cards are FACE DOWN until asked for. Not decoration: people play this
 * over a shared screen, or with somebody watching, and a hand permanently
 * spread along the bottom edge is a hand everyone at the table has read. Click
 * to look, click again to put it back — the same thing you do with a real hand.
 *
 * The Kwisatz Haderach tracker is Atreides-only AND advanced-only. Two
 * conditions, and the second is the one that gets forgotten: he does not exist
 * in the basic game, so a tracker there is a promise the rules will not keep.
 *
 * THE TWO CARDS ARE PANELS, NOT PANES. The faction card and the ally's card are
 * paragraphs of rules text, and a paragraph squeezed into a strip is a paragraph
 * nobody reads — it was a 190px column with its own scrollbar. They open from
 * buttons into DraggableResizable, the same floating panel Risk's card views
 * use: draggable anywhere, resizable, position remembered per player, and
 * closable. A player can park their faction card at the side and leave it up all
 * game, which is what you do with the real one.
 *
 * THE STRATEGY CARD IS THE ONE THAT COVERS. It hangs off the same panel, under
 * the faction card, and opens over everything instead of into a corner: it is
 * several hundred words you read once between turns, where the faction card is
 * a reference you keep beside you. Read in a 420px panel it is a column five
 * words wide. See StrategyCard.
 *
 * The room that frees goes to the leader discs, which now render large enough
 * to read a strength off. Every battle in Dune is a leader plus a number, and a
 * disc too small to read the number on is a decoration.
 */
import { useState } from 'react'
import DraggableResizable from '@/components/DraggableResizable'
import type { Faction, FactionId } from '@/types/Dune/Faction'
import type { GameMode } from '@/types/Dune/Game'
import { kwisatzHaderachAvailable, KWISATZ_HADERACH_AT } from '@/types/Dune/Game'
import type { DuneSecrets } from '@/lib/dune/charity'
import type { HudRow } from '@/lib/dune/hud'
import { factionById, findLeader } from '@/data/dune/factions'
import { TREACHERY_CARDS } from '@/data/dune/treachery'
import type { TreacheryCard } from '@/types/Dune/Treachery'
import { FACTION_LOOK, SeatMark, SeatFilters } from './SeatLayer'
import { LeaderDisc } from './LeaderDisc'
import { TraitorCard } from './TraitorCard'
import { TreacheryCardFace, TreacheryCardBack } from './TreacheryCardFace'
import { StrategyOverlay } from './StrategyCard'

const PALE = '#f0e2bb'
const SERIF = "Georgia, 'Times New Roman', serif"

/**
 * How wide a treachery card is drawn in the hand, and how wide it opens.
 *
 * The pair is exported because the RATIO is the claim. Cards are laid out
 * against CARD_W — see TreacheryCardFace — and their rules text is sized
 * against that. The hand now draws them AT the design width, so the text
 * reads in the drawer itself; the zoom still opens one at better than
 * double, because a "zoom" that opens a card near the size it already was
 * is a thing that looks implemented and does nothing, and nothing about
 * the markup would say so.
 */
export const CARD_THUMB = 168
export const CARD_ZOOM = 360

/** A button that opens one of the floating cards. */
const cardButton = (colour: string, open: boolean): React.CSSProperties => ({
  display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
  background: open ? '#ffffff1a' : 'transparent', color: PALE,
  border: `1px solid ${colour}`, borderLeftWidth: 4, borderRadius: 4,
  padding: '4px 8px', fontFamily: SERIF, fontSize: 12,
})

/** The faction who may hold the Kwisatz Haderach, named once. */
const KWISATZ_FACTION: FactionId = 'atreides'

export interface OwnStripProps {
  seat: FactionId
  mode: GameMode
  /**
   * This seat's secrets row, straight off the secrets channel.
   *
   * Never from shared state — every field here reaches exactly one browser.
   * Null while the channel is still opening, which is a real state and reads as
   * "not loaded", not as "you have nothing".
   */
  own: DuneSecrets | null
  /** This seat's own public line, for the facts that are public anyway. */
  player: HudRow
  /** Resolved ally, or null. Both seats must agree — see allyOf. */
  ally: FactionId | null
  /**
   * This faction's STANDING GRANTS, when it owns any: set once and held
   * until changed. Only the Fremen (shield, free revivals) and the Emperor
   * (funded extras) ever have these to offer.
   */
  grants?: { shield?: boolean; revivals?: boolean } | null
  onGrant?: (grant: 'shield' | 'revivals', on: boolean) => void
  /** The specials with a play flow open right now — the card itself is the
   *  button in the drawer. See PrivateView.playable. */
  playableCards?: readonly string[]
  onPlayCard?: (cardId: string) => void
}

/** A titled block along the strip. */
function Panel(
  { label, children }: { label: string; children: React.ReactNode },
) {
  return (
    <section style={{
      borderTop: '1px solid #ffffff14', padding: '7px 10px',
      display: 'flex', flexDirection: 'column', gap: 5,
    }}>
      <h3 style={{
        margin: 0, fontSize: 9.5, letterSpacing: 1.4, opacity: 0.55,
        fontFamily: SERIF, fontWeight: 400,
      }}>{label}</h3>
      {children}
    </section>
  )
}

/** A big number with a word under it. */
function Tally({ value, word, title }: { value: number | string; word: string; title?: string }) {
  return (
    <div title={title} style={{ textAlign: 'center', minWidth: 42 }}>
      <b style={{ fontSize: 19, fontFamily: SERIF, display: 'block', lineHeight: 1 }}>{value}</b>
      <span style={{ fontSize: 9, opacity: 0.55, letterSpacing: 0.6 }}>{word}</span>
    </div>
  )
}

/**
 * A data key as a label a person can read.
 *
 * The keys are camelCase and were printed with toUpperCase alone, which ran the
 * words together: KWISATZHADERACH, SPICEBLOW, SHAIHULUD, CAPTUREDLEADERS. The
 * labels are the only thing telling a player which rule they are looking at, so
 * a label that has to be decoded is worse than no label.
 */
export function ruleLabel(key: string) {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase()
}

/**
 * The card has a back, and everything the advanced game adds is on it.
 *
 * Two entries used to be dropped outright: the Karama power, because it is
 * what you may spend a Karama CARD on rather than a standing advantage, and
 * `advanced.general`, the prose bucket a faction gets when its advanced rules
 * are one lump of rulebook — the Atreides' runs to 854 characters about the
 * Kwisatz Haderach. Both are worth having and neither belonged in front of a
 * player reading their basic advantages mid-turn. The back is where they go.
 */

/**
 * The faction card: who you are and what that lets you do.
 *
 * The advantages come out of the faction data keyed by the phase they apply in,
 * and the phase is shown beside each one — 'BIDDING: you may look at each card'
 * is a rule you can act on, where the same sentence without its phase is a
 * rule you have to remember to look for.
 */
/**
 * The faction card, which turns over.
 *
 * FRONT: the advantages every game has, plus the two numbers a player asks for
 * every turn — free revivals, and what this faction brings to an alliance.
 *
 * BACK: the advanced game's advantages, behind a control that says so. That is
 * where the Karama power and the long Kwisatz Haderach passage went: both are
 * advanced-game rules, both are worth having, and neither belongs in front of a
 * player reading their basic advantages mid-turn. A card with a back is how a
 * real reference card holds twice as much without being twice as much to read.
 */
export function FactionCard({ faction }: { faction: Faction }) {
  const [back, setBack] = useState(false)
  const look = FACTION_LOOK[faction.id]
  const rules = Object.entries(faction.abilities) as [string, string][]
  // EVERY advanced entry, including the two the front deliberately leaves out.
  // On this side they are the subject rather than an interruption.
  const advanced = Object.entries(faction.advanced) as [string, string][]
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', minWidth: 0,
      borderLeft: `4px solid ${look.colour}`, paddingLeft: 9,
    }}>
      {/* The faction's own mark beside its name — the same one on its seat on
          the board and on its bubble in the HUD, so a card is identifiable
          without reading it. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <svg width={30} height={30} viewBox="-15 -15 30 30" style={{ display: 'block' }}>
          <SeatFilters />
          <SeatMark faction={faction.id} x={0} y={0} r={14} />
        </svg>
        <b style={{ fontFamily: SERIF, fontSize: 16, letterSpacing: 0.5 }}>{look.name}</b>
      </div>
      {/* In a panel now, so it takes the room the panel has rather than fighting
          a strip for it. The player sizes that panel themselves.

          SELECTABLE, against the tray's blanket rule. This and the ally's card
          are the only prose on the screen — a paragraph of rules somebody might
          reasonably want to quote — and they sit in panels opened deliberately
          rather than under a cursor reaching for the board. */}
      <div data-face={back ? 'advanced' : 'front'}
        style={{ fontSize: 13, lineHeight: 1.45, userSelect: 'text', WebkitUserSelect: 'text' }}>
        {back ? (
          advanced.length === 0
            ? <p style={{ margin: 0, opacity: 0.6 }}>
                This faction has no separate advanced advantages.
              </p>
            : advanced.map(([key, text]) => (
                <p key={key + text.slice(0, 12)} style={{ margin: '0 0 6px' }}>
                  <span style={{ opacity: 0.5, letterSpacing: 0.6 }}>{ruleLabel(key)} </span>
                  <span style={{ opacity: 0.9 }}>{text}</span>
                </p>
              ))
        ) : (<>
        {/* First, and a quantity rather than a sentence: this is the one thing
            on the card that is looked up rather than read, once every Revival
            phase, and at the foot of four paragraphs it was the hardest line
            here to find. */}
        <p style={{ margin: '0 0 6px' }} data-free-revivals={faction.freeRevivals}>
          <span style={{ opacity: 0.5, letterSpacing: 0.6 }}>FREE REVIVAL </span>
          <span style={{ opacity: 0.9 }}>
            {faction.freeRevivals} Force{faction.freeRevivals === 1 ? '' : 's'}
          </span>
        </p>

        {[...rules].map(([phase, text]) => (
          <p key={phase + text.slice(0, 12)} style={{ margin: '0 0 5px' }}>
            <span style={{ opacity: 0.5, letterSpacing: 0.6 }}>{ruleLabel(phase)} </span>
            <span style={{ opacity: 0.9 }}>{text}</span>
          </p>
        ))}

        {/* What you bring to an alliance, which comes up whenever one is
            proposed and was previously only readable from your ALLY's side of
            the table. */}
        <p style={{ margin: '7px 0 5px' }} data-alliance-gift="">
          <span style={{ opacity: 0.5, letterSpacing: 0.6 }}>ALLIANCE </span>
          <span style={{ opacity: 0.9 }}>{faction.alliance}</span>
        </p>
        </>)}
      </div>

      {/* The turn. Named for what is on the other side rather than for the
          gesture, so it says what you get rather than what it does. */}
      <button type="button" onClick={() => setBack(v => !v)} aria-pressed={back}
        aria-label={back ? 'Back to the faction advantages' : `${look.name} advanced game advantages`}
        style={{
          marginTop: 8, alignSelf: 'flex-start', cursor: 'pointer',
          background: 'transparent', color: PALE, border: `1px solid ${look.colour}`,
          borderRadius: 4, padding: '4px 9px', fontFamily: SERIF, fontSize: 11.5,
        }}>
        {back ? '↩ Faction advantages' : 'See advanced game advantages ↪'}
      </button>
    </div>
  )
}

/**
 * Forces lost, and whether he is available yet.
 *
 * The count is what the state holds; availability is derived from it, so the
 * pips and the verdict cannot say different things.
 */
function KwisatzTracker({ battleLosses }: { battleLosses: number }) {
  const ready = kwisatzHaderachAvailable(battleLosses)
  return (
    <div data-layer="kwisatz-haderach" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 3 }}>
        {Array.from({ length: KWISATZ_HADERACH_AT }, (_, i) => (
          <span key={i} data-pip={i < battleLosses ? 'lit' : 'dark'} style={{
            width: 9, height: 9, borderRadius: '50%',
            background: i < battleLosses ? '#c9542a' : 'transparent',
            border: `1px solid ${i < battleLosses ? '#c9542a' : '#ffffff44'}`,
          }} />
        ))}
      </div>
      <span style={{ fontSize: 10, opacity: ready ? 1 : 0.55, color: ready ? '#f2c14e' : PALE }}>
        {ready
          ? 'Kwisatz Haderach available'
          : `${battleLosses} of ${KWISATZ_HADERACH_AT} forces lost`}
      </span>
    </div>
  )
}

/** The face-down stack a player clicks to look at. */
function HiddenStack(
  { count, open, onToggle, label }:
  { count: number; open: boolean; onToggle(): void; label: string },
) {
  return (
    <button onClick={onToggle} aria-expanded={open} aria-label={`${label}: ${count}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
        background: open ? '#ffffff1a' : 'transparent', color: PALE,
        border: '1px solid #ffffff33', borderRadius: 4, padding: '4px 8px',
      }}>
      <span style={{ display: 'flex' }}>
        {/* Three backs at most, fanned. A stack, not an inventory — the number
            beside it is what says how many. */}
        {Array.from({ length: Math.min(count, 3) }, (_, i) => (
          <span key={i} style={{ marginLeft: i ? -13 : 0, display: 'block' }}>
            <TreacheryCardBack width={20} />
          </span>
        ))}
        {count === 0 && <span style={{ fontSize: 10, opacity: 0.5 }}>none</span>}
      </span>
      <b style={{ fontFamily: SERIF, fontSize: 15 }}>{count}</b>
      <span style={{ fontSize: 9.5, opacity: 0.6 }}>{open ? 'hide' : 'view'}</span>
    </button>
  )
}

/**
 * The cards, face up, when the player has asked to see them.
 *
 * ITS OWN COMPONENT so that both states can be tested. The claim that matters
 * is the CLOSED one — that a hand is not in the markup until it is asked for —
 * and a claim about absence is only worth something if the presence it denies
 * can also be shown. With the drawer inline there was no way to render the open
 * state at all, so "the cards are hidden" was true of a component that could
 * not show cards.
 */
export function PrivateView(
  { kind, hand, traitors, onOpenCard, playable = [], onPlay }:
  {
    kind: 'treachery' | 'traitors'
    hand: readonly TreacheryCard[]
    traitors: readonly string[]
    /** Clicking a card asks for it enlarged. Absent means the cards are inert. */
    onOpenCard?: (card: TreacheryCard) => void
    /**
     * Cards with a PLAY FLOW of their own, right now: clicking one of these
     * opens that flow instead of the zoom — the card itself is the button,
     * and the flow's panel shows the card's face so nothing is lost. Which
     * cards qualify is the CALLER's list: it knows which specials have a
     * window open, and this component only draws the ribbon.
     */
    playable?: readonly string[]
    onPlay?: (cardId: string) => void
  },
) {
  return (
    <div data-layer="private-view" role="dialog"
      aria-label={kind === 'treachery' ? 'Your treachery cards' : 'Your traitor cards'}
      style={{
        display: 'flex', gap: 10, padding: '10px 12px', overflowX: 'auto',
        background: '#0b1020', borderBottom: '1px solid #ffffff1f',
      }}>
      {/* Drawn at the DESIGN width, so the rules text reads in the drawer
          itself. Clicking still opens one bigger — or, for a card with a
          play flow, plays it. */}
      {kind === 'treachery' && (hand.length
        ? hand.map(c => {
            const plays = !!onPlay && playable.includes(c.id)
            return (
              <button key={c.id} type="button"
                onClick={() => (plays ? onPlay!(c.id) : onOpenCard?.(c))}
                aria-label={plays ? `Play ${c.name}` : `Open ${c.name}`}
                {...(plays ? { 'data-play-card': c.id } : null)}
                title={plays ? `Play ${c.name}` : undefined}
                style={{
                  background: 'none', padding: 0, lineHeight: 0,
                  // No label riding the art — the gold edge is the whole
                  // signal that this one PLAYS where the others open.
                  border: plays ? '2px solid #e8b04b' : 'none',
                  borderRadius: plays ? 6 : 0,
                  cursor: plays ? 'pointer' : onOpenCard ? 'zoom-in' : 'default',
                }}>
                <TreacheryCardFace card={c} width={CARD_THUMB} />
              </button>
            )
          })
        : <p style={{ opacity: 0.6, margin: 0, fontSize: 12 }}>No treachery cards.</p>)}
      {/* CARDS, not discs. A disc is what a leader is on the BOARD — a counter
          you move and put in the tanks. A traitor is a card in your hand, and it
          has to carry four sentences of rules that decide a battle, which do not
          go on a counter. */}
      {kind === 'traitors' && (traitors.length
        ? traitors.map(name => {
            const found = findLeader(name)
            if (!found) return <span key={name} style={{ fontSize: 12 }}>{name}</span>
            return <TraitorCard key={name} leader={found.leader} faction={found.faction} />
          })
        : <p style={{ opacity: 0.6, margin: 0, fontSize: 12 }}>No traitors dealt.</p>)}
    </div>
  )
}

export function OwnStrip({
  seat, mode, own, player, ally, grants, onGrant, playableCards, onPlayCard,
}: OwnStripProps) {
  const [open, setOpen] = useState<'treachery' | 'traitors' | null>(null)
  // The two floating panels, and the one card blown up to be readable. All
  // three are the player's own view of their own things; none of them changes
  // any state anybody else can see.
  const [showFaction, setShowFaction] = useState(false)
  const [showAlliance, setShowAlliance] = useState(false)
  const [showStrategy, setShowStrategy] = useState(false)
  const [zoom, setZoom] = useState<TreacheryCard | null>(null)
  const faction = factionById(seat)
  const allyFaction = ally ? factionById(ally) : null
  const look = FACTION_LOOK[seat]
  if (!faction) return null

  // The hand and the traitors come from the secrets row and from nowhere else.
  // An unopened channel is `own === null`, which is not the same as an empty
  // hand and must not render as one.
  const hand = (own?.cards ?? [])
    .map(id => TREACHERY_CARDS.find(c => c.id === id))
    .filter((c): c is TreacheryCard => !!c)
  const traitors = own?.traitors ?? []
  const loading = own === null

  return (
    <footer data-layer="own-strip" data-seat={seat}
      style={{
        flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
        background: '#131c2e', color: PALE, borderTop: '1px solid #ffffff1f',
        // Labels, tallies, card faces and leader discs. The two exceptions are
        // re-enabled where they are drawn: the faction card and the ally's card
        // are the only prose on this screen anybody would want to copy, and they
        // open in panels you have to ask for.
        userSelect: 'none', WebkitUserSelect: 'none',
      }}>

      {/* MOVABLE, like the faction card. A hand you can only see in a drawer
          pinned to the bottom of a column is a hand you cannot hold next to the
          territory you are thinking about — and these two are what a player
          reads WHILE looking at the board, not instead of it.

          Only ever RENDERED when asked for. A hand hidden with CSS is still in
          the markup, and the markup is what a screenshot over somebody's
          shoulder has in it. */}
      {open === 'treachery' && (
        <DraggableResizable title="Your treachery cards" accentColor={look.colour}
          // Wide enough for three cards at the DESIGN width — the drawer's
          // size and position persist per key, so the key steps when the
          // default grows or nobody with an old saved size would see it.
          width={610} storageKey={`dune-hand2-${seat}`} initialTop={70} initialRight={330}
          onClose={() => setOpen(null)}>
          <PrivateView kind="treachery" hand={hand} traitors={traitors}
            onOpenCard={setZoom}
            playable={playableCards} onPlay={onPlayCard} />
        </DraggableResizable>
      )}
      {open === 'traitors' && (
        <DraggableResizable title="Your traitor cards" accentColor={look.colour}
          // Wide enough for two cards side by side, which is the common hand.
          width={500} storageKey={`dune-traitors-${seat}`} initialTop={120} initialRight={420}
          onClose={() => setOpen(null)}>
          <PrivateView kind="traitors" hand={hand} traitors={traitors}
            onOpenCard={setZoom} />
        </DraggableResizable>
      )}

      {/* A COLUMN, not a strip. It moved out from under the board and into the
          right-hand column, because the board is bound by height and everything
          laid across the bottom of the window came straight off it. Stacked, it
          costs the board nothing at all. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div>
        <Panel label="CARDS">
          <button type="button" onClick={() => setShowFaction(v => !v)}
            aria-expanded={showFaction} aria-label="Faction card"
            style={cardButton(look.colour, showFaction)}>{look.name}</button>
          {/* UNDER THE FACTION CARD, because it is the second thing you want
              about your own faction and the first thing a new player does. */}
          <button type="button" onClick={() => setShowStrategy(v => !v)}
            aria-expanded={showStrategy} aria-label="Strategy card"
            style={cardButton(look.colour, showStrategy)}>Strategy</button>
          {allyFaction && (
            <button type="button" onClick={() => setShowAlliance(v => !v)}
              aria-expanded={showAlliance} aria-label="Alliance card"
              style={cardButton(FACTION_LOOK[allyFaction.id].colour, showAlliance)}>
              Alliance
            </button>
          )}
        </Panel>

        <Panel label="HELD">
          <div style={{ display: 'flex', gap: 6 }}>
            {/* Spice is SECRET. It is the one number on this strip that is not
                on the HUD, and the reason the HUD has no column for it. */}
            <Tally value={loading ? '–' : own?.spice ?? 0} word="spice"
              title="Your spice. Nobody else can see this." />
            <Tally value={player.reserves} word="reserves" title="Forces still to ship" />
            {/* THE ELITES, BESIDE THE PLAIN. Advanced game only — the row has
                no starred count in basic — and the word is the faction's own:
                a Fremen player thinks in Fedaykin, not in "starred". */}
            {(player.reservesStarred ?? 0) > 0 && (
              <Tally value={`${player.reservesStarred}★`}
                word={seat === 'emperor' ? 'Sardaukar' : seat === 'fremen' ? 'Fedaykin' : 'elite'}
                title="Elite forces in reserve — worth two in battle" />
            )}
          </div>
        </Panel>

        {/* BIG ENOUGH TO READ. Every battle is a leader and a number, and the
            number is on the disc — at 28px across it was a smudge. This is the
            room the faction card gave back by becoming a panel. */}
        <Panel label="LEADERS">
          <svg viewBox={`0 0 ${faction.leaders.length * 62} 62`}
            style={{ display: 'block', width: '100%',
                     maxWidth: faction.leaders.length * 62 }}
            preserveAspectRatio="xMidYMid meet">
            {faction.leaders.map((l, i) => (
              <g key={l.name} transform={`translate(${31 + i * 62} 31)`}>
                <LeaderDisc leader={l} faction={faction.id} r={29} />
              </g>
            ))}
          </svg>
        </Panel>

        <Panel label="TREACHERY">
          <HiddenStack label="Treachery cards" count={hand.length}
            open={open === 'treachery'}
            onToggle={() => setOpen(o => (o === 'treachery' ? null : 'treachery'))} />
        </Panel>

        <Panel label="TRAITORS">
          <HiddenStack label="Traitor cards" count={traitors.length}
            open={open === 'traitors'}
            onToggle={() => setOpen(o => (o === 'traitors' ? null : 'traitors'))} />
        </Panel>

        {mode === 'advanced' && seat === KWISATZ_FACTION && (
          <Panel label="KWISATZ HADERACH">
            <KwisatzTracker battleLosses={player.battleLosses ?? 0} />
          </Panel>
        )}
        {/* THE STANDING GRANTS: a policy, not a prompt — flipped here once
            and read wherever the rule bites, only while the pair stands.
            The shield reads ON when unset; the revival grants read OFF. */}
        {ally && onGrant && (seat === 'fremen' || seat === 'emperor') && (
          <Panel label="ALLIANCE GRANTS">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              {seat === 'fremen' && (
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" data-grant-shield=""
                    checked={grants?.shield !== false}
                    onChange={e => onGrant('shield', e.target.checked)} />
                  Shield ally from Shai-Hulud
                </label>
              )}
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" data-grant-revivals=""
                  checked={grants?.revivals === true}
                  onChange={e => onGrant('revivals', e.target.checked)} />
                {seat === 'fremen'
                  ? 'Their three revivals free'
                  : 'Fund three extra revivals'}
              </label>
            </div>
          </Panel>
        )}
        {mode === 'advanced' && seat === 'harkonnen'
          && (own?.capturedLeaders ?? []).length > 0 && (
          <Panel label="PRISONERS">
            <div data-captured-leaders="" style={{ fontSize: 12, lineHeight: 1.5 }}>
              {(own?.capturedLeaders ?? []).map(x => (
                <div key={x.name}>{x.name} <span style={{ opacity: 0.6 }}>
                  ({x.from})</span></div>
              ))}
            </div>
          </Panel>
        )}
        </div>
      </div>

      {/* Floating, and outside the strip's flow — DraggableResizable positions
          itself fixed. Parked wherever the player last left them. */}
      {showFaction && (
        <DraggableResizable title={`${look.name} — faction card`} accentColor={look.colour}
          width={420} storageKey={`dune-faction-${seat}`} initialTop={90} initialRight={280}
          onClose={() => setShowFaction(false)}>
          <FactionCard faction={faction} />
        </DraggableResizable>
      )}

      {/* OVER EVERYTHING, unlike the two panels above — see the note at the
          top of this file. Only ever rendered when asked for, like them. */}
      {showStrategy && (
        <StrategyOverlay faction={seat} onClose={() => setShowStrategy(false)} />
      )}

      {showAlliance && allyFaction && (
        <DraggableResizable title={`${FACTION_LOOK[allyFaction.id].name} — alliance`}
          accentColor={FACTION_LOOK[allyFaction.id].colour}
          width={380} storageKey={`dune-alliance-${seat}`} initialTop={150} initialRight={60}
          onClose={() => setShowAlliance(false)}>
          {/* The ally's own mark, the same one on their seat and their HUD
              bubble, so whose card this is reads before the words do. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <svg width={28} height={28} viewBox="-14 -14 28 28" style={{ display: 'block' }}>
              <SeatFilters />
              <SeatMark faction={allyFaction.id} x={0} y={0} r={13} />
            </svg>
            <b style={{ fontFamily: SERIF, fontSize: 15, letterSpacing: 0.4 }}>
              {FACTION_LOOK[allyFaction.id].name}
            </b>
          </div>
          <p style={{
            margin: 0, fontSize: 13, lineHeight: 1.45,
            userSelect: 'text', WebkitUserSelect: 'text',
          }}>{allyFaction.alliance}</p>
        </DraggableResizable>
      )}

      {/* One card, at a size its own rules text was drawn for. */}
      {zoom && (
        <DraggableResizable title={zoom.name} accentColor={look.colour}
          width={CARD_ZOOM + 34} storageKey={`dune-card-${seat}`}
          onClose={() => setZoom(null)}>
          <div data-layer="card-zoom" style={{ display: 'flex', justifyContent: 'center' }}>
            <TreacheryCardFace card={zoom} width={CARD_ZOOM} />
          </div>
        </DraggableResizable>
      )}
    </footer>
  )
}

export default OwnStrip
