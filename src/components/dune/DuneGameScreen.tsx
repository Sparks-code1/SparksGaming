/**
 * The game screen.
 *
 * Chat down the left, board in the middle, and a right-hand column holding the
 * other players above your own things. The board is the biggest thing on the
 * screen because it is the game.
 *
 * THE BOARD IS BOUND BY HEIGHT, NOT WIDTH — it is taller than it is wide, so
 * the only thing that makes it bigger is more height, and anything laid across
 * the bottom of the window comes straight off it. The tray used to sit there
 * and cost it 153px: 818x927 in a column that had 616px of width going spare.
 *
 * Moved into the right-hand column, the board gets the whole window height and
 * draws 953x1080 at 1920x1080 — a third more area, and the ceiling, since it
 * now fills the taller axis exactly. Widening the side panels instead was the
 * other option and would have changed the board by nothing at all: it would
 * have taken width the board could not use anyway. The panels DO flex, but for
 * the leftover, not for the board's sake.
 *
 * THE PHASE IS ON THE BOARD. There was a strip of nine across the top saying
 * which phase it was; the board already prints those nine, in order, along its
 * own upper edge. Two lists of one thing is one list too many, and the printed
 * one is better — it has the symbols on it. The current one is ringed there
 * instead, and the strip is gone.
 *
 * THE ONE RULE THIS FILE ENFORCES. Everything above the bottom strip is public
 * by rule — pieces on the board, strongholds held, how many cards a hand holds,
 * who is allied with whom, whose decision the table is waiting on. The bottom
 * strip is the only place that shows what one seat alone may see, and it gets
 * it from `own`, which is the secrets channel. There is no path from `own` into
 * the HUD or the board: they take different props, and neither takes a spice
 * count, a card list or a traitor.
 *
 * WHY THE BOARD STAYS UNDER THE AUCTION. When bidding is running the panel
 * floats over a dimmed board rather than replacing it, because what a card is
 * worth is a question about the map — whether you can reach Arrakeen this turn,
 * who is standing next to your spice. A player who cannot see the territory
 * cannot price the card they are bidding on.
 */
import { useEffect, useState } from 'react'
import type { FactionId } from '@/types/Dune/Faction'
import type { DuneGameState } from '@/types/Dune/Game'
import type { DuneSecrets } from '@/lib/dune/charity'
import { hudRows, allyOf } from '@/lib/dune/hud'
import { ChatPanel } from './ChatPanel'
import type { ChatMessage, ChatSendScope } from './ChatPanel'
import { PlayerHud } from './PlayerHud'
import { OwnStrip } from './OwnStrip'
import { DuneBoard } from './DuneBoard'
import { CHARITY_WINDOW_MS } from '@/lib/dune/charity'
import { WORM_SECONDS } from '@/lib/dune/spiceBlow'
import { BiddingPanel } from './BiddingPanel'
import { CharityModal } from './CharityModal'
import { SetupWindow, SetupBoardTargets } from './SetupWindow'
import { ShipRail } from './ShipRail'
import { inStorm, moveTargets } from '@/lib/dune/shipment'
import { RevivalRail } from './RevivalRail'
import { REVIVAL_CAP, STARRED_REVIVALS_PER_TURN, revivableLeaders } from '@/lib/dune/revival'
import type { GuildShipKind } from '@/lib/dune/shipment'
import { DUNE_TERRITORIES } from '@/data/dune/boardData'
import { FACTION_LOOK } from './SeatLayer'
import { cellAt } from './DuneBoard'
import { SETUP_SECONDS, postureFor, starredOf } from '@/lib/dune/setup'
import { factionById } from '@/data/dune/factions'
import type { SetupWindow as SetupWindowState } from '@/lib/dune/setup'
import type { PlacedForce, PendingPlacement } from './SetupWindow'
import type { BiddingPanelProps } from './BiddingPanel'
import { TREACHERY_CARDS } from '@/data/dune/treachery'
import type { TreacheryCard } from '@/types/Dune/Treachery'

/**
 * The right-hand column: the HUD and the player's own tray, stacked.
 *
 * A RANGE, not a number. The board is bound by the window's height and cannot
 * grow into spare width however much there is, so on a wide screen the column
 * takes the surplus rather than leaving it as bare navy either side of the map.
 * The floor is what the tray needs to stay legible; the ceiling stops a very
 * wide window turning the column into the main event.
 */
const SIDE_WIDTH = 320
const SIDE_MIN = 268
const SIDE_MAX = 430

export interface DuneGameScreenProps {
  /** The shared row, as everyone receives it. */
  state: DuneGameState
  /** Which seat this browser holds. Null for a spectator. */
  seat: FactionId | null
  /**
   * This seat's own secrets row. Null for a spectator, and null while the
   * channel is still opening.
   *
   * NEVER from `state`. If this ever comes out of the shared row the whole
   * hidden-state design is gone, and nothing here would look any different —
   * which is exactly why it is a separate prop rather than a field.
   */
  own: DuneSecrets | null
  chat: readonly ChatMessage[]
  /**
   * Say something, and who to.
   *
   * PASSED STRAIGHT THROUGH. Which audience a line reaches is decided by the
   * row it is written to and the policy that reads it back — see
   * lib/dune/duneChat — so this screen has no opinion about it and should not
   * acquire one.
   */
  onSend?: (text: string, scope: ChatSendScope) => void
  /** Who else is at the table, for addressing a line to one of them. */
  talkingTo?: readonly { playerId: string; name: string }[]
  /** What each seat's player is called, so a line names a person as well as a
   *  power. Passed straight through — see ChatPanel.seatNames. */
  seatNames?: Readonly<Record<string, string>>
  /**
   * The caller's notice board — setup progress, the storm report, the advance
   * button — rendered at the TOP OF THE HUD COLUMN, in flow.
   *
   * A prop rather than a floating layer of the caller's own, and that is the
   * point: the caller cannot know what the column holds or where its controls
   * sit, so anything it pins over the corner will eventually sit on one. In
   * flow it pushes; it cannot cover. The Ready button spent a day under an
   * overlay for exactly this.
   */
  notices?: React.ReactNode
  /**
   * Ship the staged forces from reserves: the rail's bubbles stage them, the
   * board click lands them, and this posts the shipment. Absent for a
   * spectator or a screen with no transport behind it.
   */
  onShipReserves?: (a: {
    to: { territoryId: string; sector: string }
    count: number
    starred: number
  }) => void
  /**
   * Move a whole stack: the board's two-click movement. The stack was picked
   * by clicking it; the destination click posts the move.
   */
  onMoveStack?: (a: {
    from: string
    gather: { sector: string; count: number; starred?: number }[]
    to: { territoryId: string; sector: string }
  }) => void
  /**
   * The Guild's cross-ship and back-to-reserves, posted whole once the
   * gathered forces have somewhere to go. Only the Guild's screen sends it;
   * the server refuses anyone else regardless.
   */
  onShipSpecial?: (a: {
    kind: 'cross' | 'to-reserves'
    from: { territoryId: string; sector: string }
    to?: { territoryId: string; sector: string }
    count: number
  }) => void
  /**
   * Claim revivals: forces staged on the revival rail posted whole, or one
   * leader by name. The server judges caps, allowance and price.
   */
  onRevive?: (a: { plain?: number; starred?: number } | { leader: string }) => void
  /**
   * The live auction, or null.
   *
   * Everything about it except `revealed` is public. `revealed` is the Atreides
   * prescience card and reaches this component through `own`, not through here
   * — see the assembly below.
   */
  bidding?: Omit<BiddingPanelProps, 'seat' | 'spice' | 'hand' | 'revealed' | 'now'> | null
  /**
   * The charity decision, when this seat has one to make.
   *
   * HANDLERS ONLY. Whether a window is open comes from public state, and what
   * this seat may claim comes from its own secrets — neither is passed in.
   * What the caller supplies is what to DO, because dispatching belongs to
   * whoever owns the session, not to a component that draws a board.
   *
   * Absent means no modal, which is what the preview and any spectator get.
   */
  charity?: {
    onClaim(): void
    onPass(): void
    busy?: boolean
    refused?: string | null
  } | null
  /**
   * The setup answers, when this seat has any to make.
   *
   * HANDLERS ONLY, like charity and for the same reason. WHICH decisions are
   * outstanding is public and comes off `state.setup`; the four traitors a seat
   * may keep are private and come off `own`. Neither is passed in — a caller
   * holding a list of somebody's traitors is the leak this design exists to
   * make impossible.
   *
   * Absent means no panel, which is what a spectator and the preview get.
   */
  setup?: {
    onFremenPlacement(at: readonly PlacedForce[]): void
    onPrediction(faction: FactionId, turn: number): void
    onTraitor(keep: string): void
    onAdvisorPlacement(territoryId: string, sector?: string): void
    /** Declare this seat done. Setup closes when every seat has. */
    onReady(): void
    busy?: boolean
    refused?: string | null
  } | null
  /** Injected, like every clock in this codebase. */
  now: number
}

export function DuneGameScreen({
  state, seat, own, chat, onSend, talkingTo, seatNames, notices, onShipReserves, onMoveStack,
  onShipSpecial, onRevive,
  bidding = null, charity = null, setup = null, now,
}: DuneGameScreenProps) {
  const [chatShut, setChatShut] = useState(false)
  /** Forces staged on the rail, waiting for a landing click on the board. */
  const [staged, setStaged] = useState({ plain: 0, starred: 0 })
  const rows = hudRows(state)
  const mine = state.players.find(p => p.faction === seat) ?? null
  /** Whether the rail's bubbles are live: this seat's turn, shipment not
   *  yet made and movement not yet made — shipment comes first. */
  const myShipWindow = !!(state.shipping
    && state.shipping.order[state.shipping.at] === seat
    && !state.shipping.done.shipped
    && !state.shipping.done.moved)
  /** Whether a stack click starts a move: this seat's turn, move unspent. */
  const myMoveWindow = !!(state.shipping
    && state.shipping.order[state.shipping.at] === seat
    && !state.shipping.done.moved)
  /** The stack picked as a move's source, waiting for its destination. */
  // ONE MOVE, BUILT CLICK BY CLICK. from is the picked stack; each click on
  // a ring adds one force to count; to re-aims freely until ✓ commits the
  // whole plan in a single MOVE. Nothing reaches the server before the ✓.
  const [movePlan, setMovePlan] = useState<{
    from: { territoryId: string; sector: string }
    to: { territoryId: string; sector: string } | null
    count: number
  } | null>(null)
  // THE GUILD'S SHIPMENT KIND, picked before the board is touched — with a
  // kind armed, a stack click gathers rather than starting a move. The
  // gathered pile is one cell's forces, counted up click by click.
  /** Dead staged on the revival rail, cleared when the phase moves on. */
  const [revStaged, setRevStaged] = useState({ plain: 0, starred: 0 })
  const [guildKind, setGuildKind] = useState<GuildShipKind>('off-planet')
  const [gather, setGather] = useState<{
    territoryId: string; sector: string; count: number
  } | null>(null)
  /** A special Guild shipment underway: stack clicks gather, never move. */
  const guildArmed = seat === 'spacing-guild' && myShipWindow && guildKind !== 'off-planet'
  useEffect(() => { if (!myShipWindow) setGather(null) }, [myShipWindow])
  useEffect(() => {
    if (state.phase !== 'Revival') setRevStaged({ plain: 0, starred: 0 })
  }, [state.phase])
  const myRow = rows.find(r => r.faction === seat) ?? null

  // Stacks are per faction so the board can colour them. Summed by cell rather
  // than drawn one per Force: two Fremen entries in one sector are one stack of
  // pieces on the table, and drawing them as two markers on the same point puts
  // one exactly on top of the other. Starred counts sum with them, and an
  // advisor entry marks the whole cell's stack — a faction cannot have an
  // advisor and a fighter standing as one pile.
  const stacks = Object.values(
    state.forces.reduce<Record<string, {
      territoryId: string; sector: string; faction: FactionId; count: number
      starred?: number; posture?: 'fighter' | 'advisor'
    }>>((acc, f) => {
      const key = `${f.territoryId}|${f.sector}|${f.faction}`
      const starred = (acc[key]?.starred ?? 0) + (f.starred ?? 0)
      const posture = acc[key]?.posture === 'advisor' || f.posture === 'advisor'
        ? 'advisor' as const : undefined
      acc[key] = {
        territoryId: f.territoryId, sector: f.sector, faction: f.faction,
        count: (acc[key]?.count ?? 0) + f.count,
        ...(starred > 0 ? { starred } : null),
        ...(posture ? { posture } : null),
      }
      return acc
    }, {}),
  )

  const seating = Object.fromEntries(state.players.map(p => [p.seat, p.faction]))

  /**
   * Whichever phase is holding a window open, if any.
   *
   * ONE CLOCK AT A TIME, because only one phase runs at a time. Charity's
   * window and the spice blow's pause cannot both be open — they are different
   * phases — so this picks whichever exists rather than trying to show both.
   *
   * Both deadlines are stamped by the server and read from public state, never
   * computed here: a client that worked out its own would drift from the other
   * five the moment a tab was backgrounded.
   */
  const timed = state as DuneGameState & {
    charity?: { expiresAt: number }
    spiceBlow?: { closesAt?: number }
    phaseClock?: { closesAt?: number }
    shipping?: { closesAt?: number }
    setup?: SetupWindowState
  }
  // SETUP IS THE FOURTH ONE, and it cannot overlap the other three: nothing has
  // been played yet. It goes on the same board clock rather than into the setup
  // panel because the deadline belongs to the TABLE — everybody is waiting on
  // it, including the seats that owe nothing and have no panel to read.
  // The phase's own look-window comes LAST: any real window outranks it,
  // since while charity is open the phase clock has already served its turn.
  const closesAt = timed.charity?.expiresAt ?? timed.spiceBlow?.closesAt
    ?? timed.shipping?.closesAt
    ?? timed.setup?.closesAt ?? timed.phaseClock?.closesAt ?? null
  const windowMs = timed.charity ? CHARITY_WINDOW_MS
    : timed.spiceBlow ? WORM_SECONDS * 1000
    : timed.setup ? SETUP_SECONDS * 1000
    : undefined

  // ── setup, answered on the board ──────────────────────────────────────────
  // The half-made answer lives HERE, because two components render it: the
  // window column narrates it and the board draws it, and a copy in either
  // would be a second answer to what has been clicked so far. It is thrown
  // away the moment the server settles the decision — the settled version
  // arrives in state.forces like everybody else's.
  const setupWin = timed.setup ?? null
  const setupActive = !!(setupWin && setup && seat)
  const owesSetup = (kind: string) =>
    !!setupWin && !!seat && setupWin.outstanding.some(d => d.kind === kind && d.faction === seat)
  const owesFremen = owesSetup('fremen-placement')
  const advisorOpen = owesSetup('advisor-placement')
    && !setupWin!.outstanding.some(d => d.kind === 'fremen-placement')

  const [fremenPending, setFremenPending] = useState<PendingPlacement[]>([])
  /** Forces staged on the setup bubbles, waiting for a territory click —
   *  the same grammar shipping uses. */
  const [setupStaged, setSetupStaged] = useState({ plain: 0, starred: 0 })
  const [advisorPending, setAdvisorPending] = useState<{ territoryId: string; sector: string } | null>(null)

  // Settled — or setup over — means the preview is done with. Without this a
  // placement kept locally would draw ten phantom forces on top of the ten
  // real ones the row just delivered.
  useEffect(() => {
    if (!owesFremen) { setFremenPending([]); setSetupStaged({ plain: 0, starred: 0 }) }
  }, [owesFremen])
  useEffect(() => {
    if (!advisorOpen) setAdvisorPending(null)
  }, [advisorOpen])

  const fremenTotal = seat ? factionById(seat)?.forces.onPlanet ?? 0 : 0
  const fremenStars = seat && state.mode === 'advanced' ? starredOf(seat) : 0
  const fremenPlaced = fremenPending.reduce((n, e) => n + e.count, 0)
  const fremenStarsPlaced = fremenPending.reduce((n, e) => n + e.starred, 0)


  /**
   * The staged group lands on this cell — or one plain force when nothing is
   * staged, so a bare click still means something. The bubbles cap what can
   * be staged, so the drop needs no second guard beyond the total.
   */
  const placeAt = (territoryId: string, sector: string) => {
    const count = Math.max(1, setupStaged.plain + setupStaged.starred)
    const starred = setupStaged.starred
    if (fremenPlaced + count > fremenTotal) return
    setFremenPending(p => {
      const i = p.findIndex(e => e.territoryId === territoryId && e.sector === sector)
      if (i < 0) return [...p, { territoryId, sector, count, starred }]
      return p.map((e, j) => j === i
        ? { ...e, count: e.count + count, starred: e.starred + starred }
        : e)
    })
    setSetupStaged({ plain: 0, starred: 0 })
  }

  /** One back off this cell — the plain ones first, so a star is kept longest. */
  const unplaceAt = (territoryId: string, sector: string) => {
    setFremenPending(p => p.flatMap(e => {
      if (e.territoryId !== territoryId || e.sector !== sector) return [e]
      const plain = e.count - e.starred
      const next = plain > 0
        ? { ...e, count: e.count - 1 }
        : { ...e, count: e.count - 1, starred: e.starred - 1 }
      return next.count > 0 ? [next] : []
    }))
  }

  // WHAT THE CLICKS HAVE PUT DOWN SO FAR, drawn as the real stacks will be —
  // same bubbles, same star badges, same checker — so confirming changes
  // nothing visually. The advisor's posture is read off the real board, which
  // by now includes the Fremen: that is the whole reason it waited on them.
  //
  // GATED ON THE DECISION STILL BEING OWED, not on the local state alone: the
  // render that delivers the settled forces is the render the decision leaves
  // `outstanding`, so the preview stands down in the same frame the real
  // pieces arrive — never both, which drew one stack twice under one key.
  // The state itself is cleared a beat later by the effects above.
  const previewStacks = setupActive ? [
    ...(owesFremen ? fremenPending.map(e => ({
      territoryId: e.territoryId, sector: e.sector, faction: seat as FactionId,
      count: e.count, ...(e.starred > 0 ? { starred: e.starred } : null),
    })) : []),
    ...(advisorOpen && advisorPending && seat ? [{
      territoryId: advisorPending.territoryId, sector: advisorPending.sector,
      faction: seat, count: 1,
      posture: postureFor(state.forces, advisorPending.territoryId, seat),
    }] : []),
  ] : []

  return (
    <div data-layer="dune-game" style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: '#0d1220', color: '#f0e2bb', overflow: 'hidden',
    }}>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* WHO IS READING, so a line meant for one seat is not shown to the
            table. See ChatMessage.to — a refusal says something about a seat's
            spice, and the chat is the one place a sentence like that would sit
            in front of everybody. */}
        <ChatPanel messages={chat} seat={seat} collapsed={chatShut} onSend={onSend}
          talkingTo={talkingTo} seatNames={seatNames}
          onToggle={() => setChatShut(c => !c)} />

        {/* THE RAIL, between the chat and the board: the reserves being spent
            sit beside the board that spends them. Always there for a seated
            player — it is the counter — with the bubbles live only in their
            own shipment window. See ShipRail. */}
        {/* ONE RAIL AT A TIME. During the Fremen's placement the setup
            rail below takes this slot — two bubble sets for one seat reads
            as two different controls for one action, which is the opposite
            of the shared grammar's point. */}
        {/* THE RAIL IS THE PHASE'S. Setup places, Revival raises, Shipment
            ships — and the phases with no rail business get no rail at all:
            a counter with dead bubbles was furniture, and furniture that
            looks like controls reads as a bug. Setup sits in phase Storm,
            so the phase gate alone keeps this rail clear of the Fremen's
            placement. */}
        {seat && mine && onShipReserves && state.phase === 'Shipment and Movement' && (
          <ShipRail
            faction={seat}
            reserves={mine.reserves}
            reservesStarred={mine.reservesStarred ?? 0}
            spice={own?.spice ?? null}
            pending={staged}
            active={myShipWindow}
            // THE FARE AS THIS SEAT PAYS IT, not the general rule: the Guild
            // rides at half, the Fremen ride the desert free and owe the bank
            // beyond it, and everyone else's fare goes to the Guild only while
            // the Guild is at the table.
            note={seat === 'fremen'
              ? 'Fremen ride the desert: any or all of your reserves, free, onto the Great Flat or any territory within two of it. Beyond that, full fare to the bank — 1 spice per force into a stronghold, 2 anywhere else.'
              : seat === 'spacing-guild'
                ? 'Fares: 1 spice per force into a stronghold, 2 anywhere else — you pay half, rounded up, to the bank.'
                : `Fares: 1 spice per force into a stronghold, 2 anywhere else — paid to ${state.players.some(p => p.faction === 'spacing-guild') ? 'the Spacing Guild' : 'the bank'}.`}
            onStage={kind => {
              setMovePlan(null)
              setGather(null)
              setStaged(s => ({ ...s, [kind]: s[kind] + 1 }))
            }}
            onReset={() => setStaged({ plain: 0, starred: 0 })}
            guildKind={seat === 'spacing-guild' ? guildKind : undefined}
            onGuildKind={seat === 'spacing-guild' ? k => {
              // a fresh kind is a fresh start: nothing staged, gathered or
              // half-picked survives the switch
              setGuildKind(k)
              setGather(null)
              setStaged({ plain: 0, starred: 0 })
              setMovePlan(null)
            } : undefined}
            gathered={gather?.count ?? 0}
            onGatherBack={() => setGather(g =>
              g && g.count > 1 ? { ...g, count: g.count - 1 } : null)}
            onSendToReserves={onShipSpecial && gather ? () => {
              onShipSpecial({
                kind: 'to-reserves',
                from: { territoryId: gather.territoryId, sector: gather.sector },
                count: gather.count,
              })
              setGather(null)
            } : undefined} />
        )}

        {/* PHASE FIVE'S RAIL: the tanks pay out. Rendered for a seat with
            anything to raise — dead forces or an offered leader — with the
            elites on their own bubble, because one Fedaykin or Sardaukar may
            return a turn and the claim has to say which kind it stages. */}
        {state.phase === 'Revival' && seat && mine && onRevive && (() => {
          const held = state.tanks?.forces?.[seat] ?? { plain: 0, starred: 0 }
          const ledger = state.revival?.turn === state.turn ? state.revival.done : {}
          const done = ledger[seat] ?? { forces: 0, starred: 0 }
          const sheet = factionById(seat)
          const leaders = state.tanks ? revivableLeaders(state.tanks as never, seat) : []
          if (held.plain + held.starred === 0 && leaders.length === 0) return null
          return (
            <RevivalRail
              faction={seat}
              dead={held}
              spice={own?.spice ?? null}
              pending={revStaged}
              room={Math.max(0, REVIVAL_CAP - done.forces)}
              freeLeft={Math.max(0, (sheet?.freeRevivals ?? 0) - done.forces)}
              starredOpen={done.starred < STARRED_REVIVALS_PER_TURN}
              leaders={leaders.map(l => ({
                name: l.name,
                strength: sheet?.leaders.find(x => x.name === l.name)?.strength ?? 0,
              }))}
              leaderTaken={!!done.leader}
              onStage={kind => setRevStaged(s => ({ ...s, [kind]: s[kind] + 1 }))}
              onReset={() => setRevStaged({ plain: 0, starred: 0 })}
              onRevive={a => {
                onRevive(a)
                setRevStaged({ plain: 0, starred: 0 })
              }}
              onLeader={name => onRevive({ leader: name })} />
          )
        })()}

        {/* THE SAME RAIL AT SETUP: the Fremen stage their ten — Fedaykin on
            the starred bubble — and click their ringed territories to place,
            exactly the grammar their shipments will use for the rest of the
            game. One action, one look. */}
        {setupActive && owesFremen && seat === 'fremen' && (
          <ShipRail
            faction={seat}
            // THE RAIL SUBTRACTS THE STAGED ITSELF — these figures are the
            // pool BEFORE staging, or every click would be counted twice: a
            // bubble showing 1 while the pool dropped 2 is exactly the bug
            // that shipped. The ten are one pool, so a staged Fedaykin
            // shrinks the plain figure too.
            reserves={fremenTotal - fremenPlaced - setupStaged.starred}
            reservesStarred={fremenStars - fremenStarsPlaced}
            spice={null}
            pending={setupStaged}
            poolLabel="Starting troops"
            active
            onStage={kind => setSetupStaged(s => ({ ...s, [kind]: s[kind] + 1 }))}
            onReset={() => setSetupStaged({ plain: 0, starred: 0 })} />
        )}

        {/* SETUP'S OWN COLUMN, between the chat and the board: it says what to
            do, and the doing happens on the map. Assembled here because
            `dealt` is the four traitors out of this seat's own row — reading
            it off `own` at the point of use means no caller ever holds it. A
            spectator gets no column, and neither does a seat once setup
            closes. */}
        {setupActive && seat && setupWin && (
          <SetupWindow
            seat={seat} mode={state.mode}
            outstanding={setupWin.outstanding}
            ready={setupWin.ready ?? []}
            seated={state.players.map(p => p.faction)}
            dealt={dealtTraitors(own)}
            pending={fremenPending}
            onRemove={unplaceAt}
            onConfirmPlacement={() => setup!.onFremenPlacement(
              fremenPending.map(e => ({
                territoryId: e.territoryId, sector: e.sector, count: e.count,
                ...(e.starred > 0 ? { starred: e.starred } : null),
              })))}
            advisorPending={advisorPending}
            advisorPosture={advisorPending
              ? postureFor(state.forces, advisorPending.territoryId, seat)
              : null}
            onConfirmAdvisor={() => advisorPending && setup!.onAdvisorPlacement(
              advisorPending.territoryId, advisorPending.sector)}
            onPrediction={setup!.onPrediction}
            onTraitor={setup!.onTraitor}
            busy={setup!.busy} refused={setup!.refused} />
        )}

        <main style={{
          // ITS BASIS IS THE BOARD'S IDEAL WIDTH — the width a board as tall as
          // the window would need. Without it the side columns' flex-grow took
          // width the board still wanted: at 1280x720 they ran to their maxima
          // and left the board 510x578, which is SMALLER than before any of this.
          // With it, they only ever divide up what is genuinely surplus.
          flex: `1 1 calc(100vh * ${970 / 1099})`, minHeight: 0, minWidth: 0,
          position: 'relative',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          overflow: 'hidden', padding: 4,
        }}>
          {/* The board pins itself to this column and scales to the largest
              size that fits, centred; the overlay letterboxes to the same
              rectangle. Sizing a box to the board's aspect ratio instead was
              what left the column's height unused. */}
          <DuneBoard
            storm={state.storm} stacks={[...stacks, ...previewStacks]}
            spice={state.spiceOnBoard}
            seating={seating} deck={state.spiceDeck} mode={state.mode}
            awaiting={state.awaiting} phase={state.phase} turn={state.turn}
            closesAt={closesAt} windowMs={windowMs} now={now}
            tanks={state.tanks?.forces ?? null}
            interactive={(setupActive && (owesFremen || advisorOpen))
              || (myShipWindow && staged.plain + staged.starred > 0)
              || myMoveWindow}>
            {/* DURING SETUP THE MAP TAKES THE ANSWER. Rings on the cells a
                click means something at — the Fremen's three territories, or
                the whole board for the advisor — with the pending pieces drawn
                as the real stacks above. Clicks add; the window column takes
                them back. */}
            {/* THE GUILD'S SPECIAL SHIPMENTS, kind already chosen on the
                rail: stack clicks pick forces up — one per click, capped at
                the stack, another stack starts the pile over — and a
                cross-shipment lands on any clear cell OUTSIDE the source
                territory. Back-to-reserves commits from the rail's send
                button instead; there is no cell to click for a pile. */}
            {guildArmed && onShipSpecial && (
              <g data-layer="guild-gather">
                {state.forces
                  .filter(f => f.faction === seat && f.count > 0)
                  .map(f => {
                    const at = cellAt(f.territoryId, f.sector)
                    if (!at) return null
                    const picked = gather
                      && gather.territoryId === f.territoryId && gather.sector === f.sector
                    return (
                      <g key={`gat|${f.territoryId}|${f.sector}`}
                        data-guild-source={`${f.territoryId}|${f.sector}`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setGather(g =>
                          g && g.territoryId === f.territoryId && g.sector === f.sector
                            ? { ...g, count: Math.min(f.count, g.count + 1) }
                            : { territoryId: f.territoryId, sector: f.sector, count: 1 })}>
                        <title>{picked ? `Picked up ${gather!.count} — click for one more` : 'Pick up forces here'}</title>
                        <circle cx={at.x} cy={at.y} r="13" fill="transparent" />
                        <circle cx={at.x} cy={at.y} r="13" fill="none"
                          stroke={FACTION_LOOK[seat!].colour}
                          strokeWidth={picked ? 3 : 1.6}
                          strokeDasharray={picked ? undefined : '4 3'} />
                      </g>
                    )
                  })}
                {guildKind === 'cross' && gather && gather.count > 0
                  && DUNE_TERRITORIES.flatMap(t => t.cells
                    .filter(c => !inStorm(t.id, c.sector, state.storm))
                    .filter(() => t.id !== gather.territoryId)
                    .map(c => (
                      <g key={`x|${t.id}|${c.sector}`} data-cross-target={`${t.id}|${c.sector}`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => {
                          onShipSpecial({
                            kind: 'cross',
                            from: { territoryId: gather.territoryId, sector: gather.sector },
                            to: { territoryId: t.id, sector: c.sector },
                            count: gather.count,
                          })
                          setGather(null)
                        }}>
                        <title>{`${t.displayName} — ${c.sector}`}</title>
                        <circle cx={c.at.x} cy={c.at.y} r="11" fill="#dd7a1c22"
                          stroke="#dd7a1c" strokeWidth="1.2" strokeDasharray="3 3" />
                      </g>
                    )))}
              </g>
            )}

            {/* THE MOVE, click by click and no forms: your own stack first —
                ringed in your colour — then the ground, once per force. The
                clicks pile into ONE staged move (same source, same ground;
                a click on other ground re-aims the whole group), − takes a
                click back, and ✓ posts the single MOVE. Rings appear only
                where the server's own law reaches — moveTargets IS the
                judge's reachability, imported, not a client rewrite of it.
                Landing rings for a staged shipment take priority: staging
                cancels a half-picked move. */}
            {myMoveWindow && staged.plain + staged.starred === 0 && !guildArmed && onMoveStack && (
              <g data-layer="move-controls">
                {state.forces
                  .filter(f => f.faction === seat && f.count > 0)
                  .map(f => {
                    const at = cellAt(f.territoryId, f.sector)
                    if (!at) return null
                    const picked = movePlan
                      && movePlan.from.territoryId === f.territoryId
                      && movePlan.from.sector === f.sector
                    return (
                      <g key={`src|${f.territoryId}|${f.sector}`}
                        data-move-source={`${f.territoryId}|${f.sector}`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setMovePlan(picked
                          ? null
                          : {
                            from: { territoryId: f.territoryId, sector: f.sector },
                            to: null, count: 0,
                          })}>
                        <title>{picked ? 'Click again to cancel' : 'Move this stack'}</title>
                        {/* THE HIT AREA. A fill-none circle takes clicks on
                            its stroke alone — a dashed 1.6px thread — which
                            is why "I still can't click my stack" was true:
                            the ring was there and all but unhittable. The
                            transparent body makes the whole disc the target. */}
                        <circle cx={at.x} cy={at.y} r="13" fill="transparent" />
                        <circle cx={at.x} cy={at.y} r="13" fill="none"
                          stroke={FACTION_LOOK[seat!].colour}
                          strokeWidth={picked ? 3 : 1.6}
                          strokeDasharray={picked ? undefined : '4 3'} />
                      </g>
                    )
                  })}
                {movePlan && (() => {
                  const stack = state.forces.find(f =>
                    f.faction === seat && f.territoryId === movePlan.from.territoryId
                    && f.sector === movePlan.from.sector)
                  const stackTotal = stack?.count ?? 0
                  const stackStarred = Math.min(stackTotal, stack?.starred ?? 0)
                  // PLAIN FORCES BOARD FIRST, elites last — so − hands the
                  // Fedaykin back before the rank and file.
                  const starredStaged = movePlan
                    ? Math.max(0, movePlan.count - (stackTotal - stackStarred))
                    : 0
                  const reach = moveTargets({
                    faction: seat!, from: movePlan.from,
                    forces: state.forces, storm: state.storm,
                  })
                  return (
                    <>
                      {DUNE_TERRITORIES.flatMap(t => t.cells
                        .filter(c => reach.has(`${t.id}|${c.sector}`))
                        .map(c => {
                          const chosen = movePlan.to
                            && movePlan.to.territoryId === t.id
                            && movePlan.to.sector === c.sector
                          return (
                            <g key={`dst|${t.id}|${c.sector}`}
                              data-move-target={`${t.id}|${c.sector}`}
                              style={{ cursor: 'pointer' }}
                              onClick={() => setMovePlan(m => m && ({
                                ...m,
                                to: { territoryId: t.id, sector: c.sector },
                                count: (!m.to
                                  || (m.to.territoryId === t.id && m.to.sector === c.sector))
                                  ? Math.min(stackTotal, m.count + 1)
                                  : m.count,
                              }))}>
                              <title>{`${t.displayName} — ${c.sector}`}</title>
                              <circle cx={c.at.x} cy={c.at.y} r="11"
                                fill={chosen ? '#2f6fb54d' : '#2f6fb52a'}
                                stroke="#2f6fb5" strokeWidth={chosen ? 2 : 1.2}
                                strokeDasharray={chosen ? undefined : '3 3'} />
                              {chosen && movePlan.count > 0 && (
                                <text x={c.at.x} y={c.at.y} fontSize="10" fill="#f0e2bb"
                                  textAnchor="middle" dominantBaseline="central"
                                  fontFamily='Georgia, "Times New Roman", serif'
                                  fontWeight="bold" pointerEvents="none">
                                  {movePlan.count}
                                </text>
                              )}
                            </g>
                          )
                        }))}
                      {movePlan.to && movePlan.count > 0 && (() => {
                        const at = cellAt(movePlan.to.territoryId, movePlan.to.sector)
                        if (!at) return null
                        return (
                          <g data-move-commit="">
                            <g data-move-undo="" style={{ cursor: 'pointer' }}
                              onClick={() => setMovePlan(m => m && (m.count <= 1
                                ? { ...m, to: null, count: 0 }
                                : { ...m, count: m.count - 1 }))}>
                              <title>Take one back</title>
                              <circle cx={at.x - 11} cy={at.y + 21} r="8"
                                fill="#111a2c" stroke="#f0e2bb" strokeWidth="1.2" />
                              <text x={at.x - 11} y={at.y + 21} fontSize="11" fill="#f0e2bb"
                                textAnchor="middle" dominantBaseline="central"
                                pointerEvents="none">−</text>
                            </g>
                            <g data-move-go="" style={{ cursor: 'pointer' }}
                              onClick={() => {
                                onMoveStack({
                                  from: movePlan.from.territoryId,
                                  gather: [{
                                    sector: movePlan.from.sector, count: movePlan.count,
                                    ...(starredStaged > 0 ? { starred: starredStaged } : null),
                                  }],
                                  to: movePlan.to!,
                                })
                                setMovePlan(null)
                              }}>
                              <title>{`Send ${movePlan.count}${starredStaged > 0 ? ` (${starredStaged}★)` : ''}`}</title>
                              <circle cx={at.x + 11} cy={at.y + 21} r="8"
                                fill="#2f6fb5" stroke="#f0e2bb" strokeWidth="1.2" />
                              <text x={at.x + 11} y={at.y + 21} fontSize="10" fill="#f0e2bb"
                                textAnchor="middle" dominantBaseline="central"
                                pointerEvents="none">✓</text>
                            </g>
                          </g>
                        )
                      })()}
                    </>
                  )
                })()}
              </g>
            )}

            {/* THE LANDING. Staged forces make every clear cell a target;
                the click is the shipment. Stormed cells are not offered —
                the server would refuse them anyway, but a ring on a cell the
                rules forbid is an invitation to a refusal. */}
            {myShipWindow && staged.plain + staged.starred > 0 && onShipReserves && (
              <g data-layer="ship-targets">
                {DUNE_TERRITORIES.flatMap(t => t.cells
                  .filter(c => !inStorm(t.id, c.sector, state.storm))
                  .map(c => (
                    <g key={`${t.id}|${c.sector}`} data-ship-target={`${t.id}|${c.sector}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        onShipReserves({
                          to: { territoryId: t.id, sector: c.sector },
                          count: staged.plain + staged.starred,
                          starred: staged.starred,
                        })
                        setStaged({ plain: 0, starred: 0 })
                      }}>
                      <title>{`${t.displayName} — ${c.sector}`}</title>
                      <circle cx={c.at.x} cy={c.at.y} r="11" fill="#dd7a1c22"
                        stroke="#dd7a1c" strokeWidth="1.2" strokeDasharray="3 3" />
                    </g>
                  )))}
              </g>
            )}

            {setupActive && seat && (owesFremen || advisorOpen) && (
              <SetupBoardTargets seat={seat}
                fremen={owesFremen} advisor={advisorOpen}
                onPlaceCell={placeAt}
                onAdvisorCell={(territoryId, sector) => setAdvisorPending({ territoryId, sector })} />
            )}
          </DuneBoard>

          {/* The auction, over the WHOLE middle column rather than over the
              board's own box. The box is only as wide as the board is tall —
              the board is taller than it is wide — and a panel scrimmed to that
              spilled out of it across the chat. What is being dimmed is the
              board AREA, which is this column.

              Assembled here rather than passed in whole, because three of its
              props are this seat's own secrets and one of them — the prescience
              reveal — is a card no other seat may see. Reading them off `own`
              at the point of use means the caller never holds them, and there
              is no other route in. */}
          {bidding && seat && (
            <BiddingPanel {...bidding} seat={seat} now={now}
              spice={own?.spice ?? 0}
              hand={handOf(own)}
              revealed={revealedFor(own)} />
          )}

          {/* CHARITY COVERS THE BOARD rather than dimming it, unlike the
              auction. An auction is about a card you are spending real spice
              on, with the board still worth reading; charity is two words and
              a number for fifteen seconds, and the board says nothing about it.

              Only while the window is actually open, and only for a seat that
              has not already answered — `charity` is withdrawn by the caller
              once this seat has claimed or passed. */}
          {charity && seat && timed.charity && (
            <CharityModal
              faction={seat} own={own}
              onClaim={charity.onClaim} onPass={charity.onPass}
              busy={charity.busy} refused={charity.refused} />
          )}

        </main>

        {/* THE RIGHT-HAND COLUMN: everyone else above, then you. Both are about
            who is at the table, so they read as one column rather than two
            edges — and putting the tray here rather than across the bottom is
            what gives the board the full height of the window.

            It FLEXES. The board cannot use width beyond what its height allows,
            so past that point the leftover may as well go to the column that
            can: more of a faction card visible, more chat, fewer scrollbars. */}
        <div style={{
          flex: '1 1 auto', width: SIDE_WIDTH, minWidth: SIDE_MIN, maxWidth: SIDE_MAX,
          display: 'flex', flexDirection: 'column', minHeight: 0,
          borderLeft: '1px solid #ffffff1f', background: '#131c2e',
        }}>
          {/* THE NOTICE BOARD FIRST: transient, and gone entirely most of
              the game, so the players keep the top the rest of the time. */}
          {notices}

          {/* READY LIVES WITH THE PLAYERS, because it is a statement about the
              list: when every bubble says READY, the game starts. Wired only
              while setup runs and this client holds a seat. */}
          <PlayerHud rows={rows} awaiting={state.awaiting} seat={seat}
            ready={setupWin?.ready ?? []}
            onReady={setupActive ? setup!.onReady : null} />

          {/* A spectator has no tray: there is nothing private to show them, and
              an empty one implies a hand they might be holding. */}
          {seat && mine && myRow && (
            <OwnStrip seat={seat} mode={state.mode} own={own} player={myRow}
              ally={allyOf(state.players, mine)} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── the two lookups that turn a secrets row into cards ──────────────────────
// Out of the component body so the suite can call them directly and prove a
// card cannot reach the panel without being in this seat's own row.
export function handOf(own: DuneSecrets | null): TreacheryCard[] {
  return (own?.cards ?? [])
    .map(id => TREACHERY_CARDS.find(c => c.id === id))
    .filter((c): c is TreacheryCard => !!c)
}

/**
 * The card the Atreides may see, or null.
 *
 * Read off THIS SEAT'S secrets row and nowhere else. The server writes it only
 * into the entitled seat's row (see lib/dune/prescience), so a seat without the
 * power has no key to read and gets null without this having to know which
 * faction the power belongs to.
 */
export function revealedFor(own: DuneSecrets | null): TreacheryCard | null {
  const id = own?.prescience
  return (id && TREACHERY_CARDS.find(c => c.id === id)) || null
}

/**
 * The four traitors this seat may keep one of, or none.
 *
 * THE SAME RULE AS PRESCIENCE, and it matters more. The four are written into
 * one row at the deal and cleared the moment one is kept — the public ask names
 * none of them, so a seat that has answered, a seat that keeps all four, and a
 * spectator all read the same empty list here without this having to know which
 * of the three they are.
 */
export function dealtTraitors(own: DuneSecrets | null): string[] {
  return own?.traitorsDealt ?? []
}

export default DuneGameScreen
