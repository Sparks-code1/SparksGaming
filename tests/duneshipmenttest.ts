// Shipment and Movement: one shipment, one move, in storm order.
//
// WHY THIS EXISTS. Phase six is where the board finally changes by choice
// rather than by weather, and every rule in it is a price or a wall: the
// stronghold rates, the Guild's monopoly and half fare, the desert's free
// radius, the two-faction gate, and a storm that no force may enter, leave
// or cross. Each is checked as behaviour on the real board data — the
// distances below were computed from the generated geometry, not guessed.
import { readFileSync } from 'node:fs'
import {
  settleSector, inStorm, strongholdClosed, fremenShipTargets, shipCost,
  judgeShipment, judgeMove, movementRange, territoryDistance,
  landForces, liftForces, nextSeat,
  SHIP_STRONGHOLD_SPICE, SHIP_OPEN_SPICE, GREAT_FLAT, STRONGHOLD_CAP, SHIPMENT_SECONDS,
} from '@/lib/dune/shipment'
import type { ShippingWindow } from '@/lib/dune/shipment'
import { stormOrder } from '@/lib/dune/phaseAdvance'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import { DuneGameScreen } from '@/components/dune/DuneGameScreen'
import type { DuneGameState } from '@/types/Dune/Game'
import { DUNE_TERRITORIES } from '@/data/dune/boardData'
import type { Force, SectorId } from '@/types/Dune/Game'
import type { FactionId } from '@/types/Dune/Faction'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}
const code = (path: string) => readFileSync(path, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const f = (faction: string, territoryId: string, sector: string, count = 5,
  over: Partial<Force> = {}): Force =>
  ({ faction, territoryId, sector, count, ...over } as Force)

const CALM: SectorId = 'sector-12'    // storms nothing the tests below stand on

// ── naming the sector ─────────────────────────────────────────────────────
{
  check('a one-sector territory answers for itself',
    settleSector('territory-13', undefined), { ok: true, sector: 'sector-10' })
  check('a spanning territory must be told',
    (settleSector('territory-01', undefined) as { refusal: string }).refusal, 'sector-needed')
  check('...and told a sector it has',
    (settleSector('territory-01', 'sector-1') as { refusal: string }).refusal, 'no-such-sector')
  check('a territory that does not exist refuses',
    (settleSector('territory-99', 'sector-1') as { refusal: string }).refusal, 'no-such-territory')
}

// ── the storm and the sink ────────────────────────────────────────────────
{
  check('a stormed cell is stormed', inStorm('territory-02', 'sector-4', 'sector-4'), true)
  check('...and a clear one is not', inStorm('territory-02', 'sector-5', 'sector-4'), false)
  // THE POLAR SINK IS NEVER IN STORM: the ring passes the rim, not the pole.
  check('the Polar Sink is never in storm',
    DUNE_TERRITORIES.find(t => t.terrain === 'polar-sink')!.sectors
      .some(s => inStorm('territory-03', s, s as SectorId)), false)
}

// ── the two-faction gate ──────────────────────────────────────────────────
{
  const two = [f('atreides', 'territory-13', 'sector-10'), f('harkonnen', 'territory-13', 'sector-10')]
  check('a stronghold holding two others is closed',
    strongholdClosed(two, 'fremen', 'territory-13'), true)
  check('...but open to a faction already inside',
    strongholdClosed(two, 'atreides', 'territory-13'), false)
  check('...and one occupant leaves the gate open',
    strongholdClosed(two.slice(0, 1), 'fremen', 'territory-13'), false)
  check('open ground has no gate',
    strongholdClosed([f('atreides', 'territory-22', 'sector-15'), f('harkonnen', 'territory-22', 'sector-15')],
      'fremen', 'territory-22'), false)
  check('the cap is the named constant', STRONGHOLD_CAP, 2)
}

// ── the desert's radius ───────────────────────────────────────────────────
{
  const reach = fremenShipTargets()
  check('the Great Flat is its own centre', reach.has(GREAT_FLAT), true)
  check('Funeral Plain is within two', reach.has('territory-23'), true)
  // ARRAKEEN IS NOT: the desert does not deliver to the city.
  check('Arrakeen is beyond the desert', reach.has('territory-13'), false)
  check('the radius reaches sixteen territories', reach.size, 16)

  // THE GREAT FLAT SITS IN SECTOR 15 ALONE. Measured, not assumed: the
  // artwork put 97.9% of it in 15 and a 2.1% sliver over the 15/16 line —
  // tracing bleed, the smallest share on the board by a wide margin — and
  // the generator's overlap floor was raised to drop exactly that sliver.
  check('the Great Flat sits in sector 15 alone',
    DUNE_TERRITORIES.find(t => t.id === GREAT_FLAT)?.sectors, ['sector-15'])
  // MEASURED THE SAME WAY, on the raw samples before any threshold:
  // Rim Wall West is 100.00% in sector 9 — not a stray point outside it —
  // and Carthag is 98.67% in 11 with a 1.33% bleed into 12, below even the
  // old 2% floor, so the filter has always dropped it. Pinned so a redrawn
  // board that moves either boundary is caught here, not at a stronghold
  // gate miscounting Carthag.
  check('Rim Wall West sits in sector 9 alone',
    DUNE_TERRITORIES.find(t => t.id === 'territory-14')?.sectors, ['sector-9'])
  check('Carthag sits in sector 11 alone',
    DUNE_TERRITORIES.find(t => t.id === 'territory-26')?.sectors, ['sector-11'])
}

// ── the fares ─────────────────────────────────────────────────────────────
{
  const base = { kind: 'off-planet' as const, guildSeated: true }
  check('a stronghold costs one per force',
    shipCost({ ...base, faction: 'atreides', territoryId: 'territory-13', count: 4 }),
    { cost: 4 * SHIP_STRONGHOLD_SPICE, payee: 'guild' })
  check('open ground costs two per force',
    shipCost({ ...base, faction: 'atreides', territoryId: 'territory-22', count: 4 }),
    { cost: 4 * SHIP_OPEN_SPICE, payee: 'guild' })
  // THE MONOPOLY: everyone else's fee goes to the Guild when they are seated,
  // to the bank when they are not.
  check('...to the bank with no Guild at the table',
    shipCost({ ...base, guildSeated: false, faction: 'atreides', territoryId: 'territory-22', count: 4 }).payee,
    'bank')
  // HALF PRICE, ROUNDED UP, AND NEVER TO THEMSELVES.
  check('the Guild pay half, rounded up',
    shipCost({ ...base, faction: 'spacing-guild', territoryId: 'territory-13', count: 3 }),
    { cost: 2, payee: 'bank' })
  check('...on open ground too',
    shipCost({ ...base, faction: 'spacing-guild', territoryId: 'territory-22', count: 5 }).cost, 5)
  check('the trip home is one per two, rounded up',
    shipCost({ kind: 'to-reserves', guildSeated: true, faction: 'spacing-guild', territoryId: 'territory-22', count: 5 }),
    { cost: 3, payee: 'bank' })
  // THE DESERT PAYS NOTHING INTO ITS OWN RADIUS — and the full rate beyond
  // it, to the BANK alone: the monopoly is the Guild's grip on off-planet
  // freight, and the desert's coin never feeds it, seated or not.
  check('the Fremen ship free',
    shipCost({ ...base, faction: 'fremen', territoryId: 'territory-22', count: 9 }).cost, 0)
  check('...and pay the full rate beyond the radius',
    shipCost({ ...base, faction: 'fremen', territoryId: 'territory-26', count: 3 }),
    { cost: 3, payee: 'bank' })
  check('...open ground beyond it too',
    shipCost({ ...base, faction: 'fremen', territoryId: 'territory-12', count: 2 }),
    { cost: 4, payee: 'bank' })
}

// ── judging a shipment ────────────────────────────────────────────────────
{
  const board = [f('atreides', 'territory-13', 'sector-10'), f('harkonnen', 'territory-13', 'sector-10')]
  const base = {
    kind: 'off-planet' as const, forces: board, reserves: 10, reservesStarred: 0,
    spice: 20, storm: CALM, guildSeated: true, count: 3,
  }
  const ok = judgeShipment({ ...base, faction: 'emperor', to: { territoryId: 'territory-26' } })
  check('a lawful shipment prices and lands', ok.ok && [ok.cost, ok.payee, ok.sector],
    [3, 'guild', 'sector-11'])

  check('shipping into the storm is refused',
    (judgeShipment({ ...base, faction: 'emperor', storm: 'sector-11', to: { territoryId: 'territory-26' } }) as { refusal: string }).refusal,
    'stormed')
  check('a full stronghold is refused',
    (judgeShipment({ ...base, faction: 'emperor', to: { territoryId: 'territory-13' } }) as { refusal: string }).refusal,
    'stronghold-full')
  check('...but an occupant may reinforce',
    judgeShipment({ ...base, faction: 'atreides', to: { territoryId: 'territory-13' } }).ok, true)
  check('poverty is refused',
    (judgeShipment({ ...base, spice: 2, faction: 'emperor', to: { territoryId: 'territory-26' } }) as { refusal: string }).refusal,
    'cannot-pay')
  check('an empty reserve is refused',
    (judgeShipment({ ...base, reserves: 2, faction: 'emperor', to: { territoryId: 'territory-26' } }) as { refusal: string }).refusal,
    'not-enough-reserves')

  // THE DESERT'S SHIPMENT: free inside the radius, nothing outside it.
  // FREE, NOT MERELY LEGAL: ok alone stayed green while an affordable bill
  // was quietly charged on the Flat.
  const flat = judgeShipment({ ...base, faction: 'fremen', to: { territoryId: GREAT_FLAT, sector: 'sector-15' } })
  check('the Fremen land free on the Flat', flat.ok && flat.cost, 0)
  // BEYOND THE RADIUS IS A PRICE NOW, not a wall: Carthag at the stronghold
  // rate, to the bank, with the Guild seated and unpaid.
  const far = judgeShipment({ ...base, faction: 'fremen', to: { territoryId: 'territory-26' } })
  check('...and pay their way beyond it',
    far.ok && [far.cost, far.payee], [3, 'bank'])
  check('...refused only by an empty purse',
    (judgeShipment({ ...base, spice: 2, faction: 'fremen', to: { territoryId: 'territory-26' } }) as { refusal: string }).refusal,
    'cannot-pay')

  // THE GUILD'S OTHER TWO SHIPMENTS are theirs alone.
  check('a cross-ship by anyone else is refused',
    (judgeShipment({
      ...base, faction: 'emperor', kind: 'cross',
      from: { territoryId: 'territory-13', sector: 'sector-10' }, to: { territoryId: 'territory-26' },
    }) as { refusal: string }).refusal, 'guild-only')
  check('...and so is shipping home',
    (judgeShipment({
      ...base, faction: 'emperor', kind: 'to-reserves',
      from: { territoryId: 'territory-13', sector: 'sector-10' },
    }) as { refusal: string }).refusal, 'guild-only')
  const home = judgeShipment({
    ...base, faction: 'spacing-guild', kind: 'to-reserves', count: 5,
    forces: [f('spacing-guild', 'territory-22', 'sector-15', 5)],
    from: { territoryId: 'territory-22', sector: 'sector-15' },
  })
  check('the Guild go home at one per two', home.ok && home.cost, 3)
  check('...but only with forces they have there',
    (judgeShipment({
      ...base, faction: 'spacing-guild', kind: 'to-reserves', count: 5,
      from: { territoryId: 'territory-22', sector: 'sector-15' },
    }) as { refusal: string }).refusal, 'nothing-there')
}

// ── how far a faction moves ───────────────────────────────────────────────
{
  const afoot: Force[] = [f('emperor', 'territory-22', 'sector-15')]
  check('one territory on foot', movementRange('emperor', afoot), 1)
  check('the Fremen walk two', movementRange('fremen', afoot), 2)
  // ORNITHOPTERS CARRY THE FACTION, wherever the moving forces are.
  const flying = [...afoot, f('emperor', 'territory-13', 'sector-10', 1)]
  check('Arrakeen grants three', movementRange('emperor', flying), 3)
  check('...and the Fremen fly three, not five',
    movementRange('fremen', [f('fremen', 'territory-26', 'sector-11', 1)]), 3)
  // SOMEBODY ELSE'S CITY GRANTS NOTHING.
  check('another faction\'s ornithopters carry nobody else',
    movementRange('emperor', [f('atreides', 'territory-13', 'sector-10')]), 1)
}

// ── the board's distances, storm and all ──────────────────────────────────
// Computed from the generated geometry and pinned: Harg Pass touches False
// Wall East, the storm re-routes rather than merely forbidding, and a split
// territory is walked around at the cost of the walk.
{
  const d = (a: [string, string], b: [string, string], storm: SectorId) =>
    territoryDistance({ territoryId: a[0], sector: a[1] }, { territoryId: b[0], sector: b[1] }, storm)

  check('adjacent territories are one crossing',
    d(['territory-02', 'sector-4'], ['territory-01', 'sector-9'], CALM), 1)
  check('a storm between them forces the long way round',
    d(['territory-02', 'sector-4'], ['territory-01', 'sector-9'], 'sector-6'), 2)
  check('walking within a territory is free',
    d(['territory-01', 'sector-5'], ['territory-01', 'sector-9'], CALM), 0)
  check('...unless the storm splits it, and then the walk is real',
    d(['territory-01', 'sector-5'], ['territory-01', 'sector-9'], 'sector-7'), 2)
  check('a stormed destination is unreachable',
    d(['territory-02', 'sector-5'], ['territory-02', 'sector-4'], 'sector-4'), Infinity)
  check('Arrakeen to Carthag is two',
    d(['territory-13', 'sector-10'], ['territory-26', 'sector-11'], CALM), 2)
  check("Arrakeen to Tuek's is four",
    d(['territory-13', 'sector-10'], ['territory-33', 'sector-5'], CALM), 4)
  // THE POLE IS ALWAYS OPEN: storm on its notional sector changes nothing.
  check('the Polar Sink is reachable under any storm',
    d(['territory-13', 'sector-10'], ['territory-03', 'sector-1'], 'sector-1'), 2)
}

// ── judging a move ────────────────────────────────────────────────────────
{
  const board: Force[] = [
    f('emperor', 'territory-02', 'sector-4', 6),
    f('emperor', 'territory-02', 'sector-5', 2),
    f('atreides', 'territory-13', 'sector-10'),
    f('harkonnen', 'territory-13', 'sector-10'),
  ]
  const ok = judgeMove({
    faction: 'emperor', from: 'territory-02',
    gather: [{ sector: 'sector-4', count: 4 }],
    to: { territoryId: 'territory-01', sector: 'sector-9' },
    forces: board, storm: CALM,
  })
  check('a lawful move lands where it says', ok.ok && [ok.sector, ok.moving], ['sector-9', 4])

  // THE GROUP IS ONE GROUP BY TERRITORY — gathered across sectors, every
  // stack walking its own lawful path.
  const both = judgeMove({
    faction: 'emperor', from: 'territory-02',
    gather: [{ sector: 'sector-4', count: 6 }, { sector: 'sector-5', count: 2 }],
    to: { territoryId: 'territory-01', sector: 'sector-9' },
    forces: board, storm: CALM,
  })
  check('a group gathers across its territory', both.ok && both.moving, 8)
  // A STACK BEHIND THE STORM DOES NOT TELEPORT with its neighbours: under a
  // storm on its own sector it cannot leave at all.
  check('...and a stormed stack cannot ride along',
    (judgeMove({
      faction: 'emperor', from: 'territory-02',
      gather: [{ sector: 'sector-4', count: 6 }],
      to: { territoryId: 'territory-01', sector: 'sector-9' },
      forces: board, storm: 'sector-4',
    }) as { refusal: string }).refusal, 'no-path')

  check('out of range is refused',
    (judgeMove({
      faction: 'emperor', from: 'territory-02',
      gather: [{ sector: 'sector-4', count: 1 }],
      to: { territoryId: 'territory-33', sector: 'sector-5' },
      forces: board, storm: CALM,
    }) as { refusal: string }).refusal, 'out-of-range')
  check('a full stronghold turns the move away',
    (judgeMove({
      faction: 'emperor', from: 'territory-02',
      gather: [{ sector: 'sector-4', count: 1 }],
      to: { territoryId: 'territory-13' },
      forces: board, storm: CALM,
    }) as { refusal: string }).refusal, 'stronghold-full')
  check('a spanning destination must name its sector',
    (judgeMove({
      faction: 'emperor', from: 'territory-02',
      gather: [{ sector: 'sector-4', count: 1 }],
      to: { territoryId: 'territory-01' },
      forces: board, storm: CALM,
    }) as { refusal: string }).refusal, 'sector-needed')
  check('moving nothing is refused',
    (judgeMove({
      faction: 'emperor', from: 'territory-02', gather: [],
      to: { territoryId: 'territory-01', sector: 'sector-9' },
      forces: board, storm: CALM,
    }) as { refusal: string }).refusal, 'nothing-asked')
}

// ── the board arithmetic ──────────────────────────────────────────────────
{
  const board = [f('emperor', 'territory-22', 'sector-15', 4, { starred: 1 })]
  const landed = landForces(board, 'emperor', 'territory-22', 'sector-15' as SectorId, 3, 1)
  check('arrivals merge with the stack standing there',
    landed, [f('emperor', 'territory-22', 'sector-15', 7, { starred: 2 })])
  const fresh = landForces(board, 'harkonnen', 'territory-22', 'sector-15' as SectorId, 2, 0)
  check('...or found a new one', fresh.length, 2)
  const lifted = liftForces(landed, 'emperor', 'territory-22', 'sector-15', 7, 2)
  check('a lift that empties the stack removes it', lifted, [])
  const part = liftForces(landed, 'emperor', 'territory-22', 'sector-15', 3, 1)
  check('...and a partial lift leaves the rest',
    part, [f('emperor', 'territory-22', 'sector-15', 4, { starred: 1 })])
}

// ── the rotation ──────────────────────────────────────────────────────────
{
  // ONE ROTATION: each seat ships then moves in its own turn, then the
  // next faction — the two-round shape was a misreading, since corrected.
  const w: ShippingWindow = {
    turn: 3, order: ['atreides', 'harkonnen'] as FactionId[], at: 0,
    done: { shipped: true, moved: true }, closesAt: 1000,
  }
  const next = nextSeat(w, 2000)
  check('the rotation steps with a fresh slate',
    next && [next.at, next.done, next.closesAt], [1, {}, 2000])
  check('...and walking off the end ends the phase', nextSeat(next!, 3000), null)
  check('a turn is three minutes for both halves', SHIPMENT_SECONDS, 180)
  // THE ORDER IS THE STORM'S — the same walk bidding uses.
  check('the order is the storm walk', stormOrder('sector-7', [
    { faction: 'atreides', seat: 'player-position-1' },
    { faction: 'harkonnen', seat: 'player-position-3' },
  ] as never), ['atreides', 'harkonnen'])
}

// ── the endpoint and the entry ────────────────────────────────────────────
{
  const fn = code('supabase/functions/dune-action/index.ts')
  const entry = fn.slice(fn.indexOf("case 'Shipment and Movement'"), fn.indexOf('Battles: not built'))
  check('the phase entry opens the rotation', /order = stormOrder\(/.test(entry), true)
  check('...with the acting seat on the clock',
    /closesAt: now \+ SHIPMENT_SECONDS \* 1000/.test(entry), true)

  // THE GLIMPSE: the Atreides see the top of the spice deck, written into
  // their row alone, stamped with the turn — and never into public state.
  check('the Atreides glimpse is written at entry',
    /spiceReveal: \{ turn, card: top \}/.test(entry), true)
  check('...into their own row alone', /seatOfFaction\['atreides'\]/.test(entry), true)
  check('...merged, not replacing', /\{ \.\.\.\(theirs\?\.data \?\? \{\}\), spiceReveal/.test(entry), true)
  // THE PUBLIC EXTRA IS EXACTLY THE ROTATION. A grep for the field name
  // cannot catch it smuggled under another one, so what is pinned is the
  // write itself: shipping, and nothing beside it.
  check('...and never into the shared row',
    /await plainly\(\{ shipping, awaiting: order\[0\] \}, undefined, seer\)/.test(entry), true)

  const shipCase = fn.slice(fn.indexOf("case 'SHIP'"), fn.indexOf("case 'MOVE'"))
  check('shipping is the acting seat\'s alone', /'not-your-turn'/.test(shipCase), true)
  check('...one per turn', /'already-shipped'/.test(shipCase), true)
  // SHIPMENT THEN MOVEMENT, inside one turn: a seat that has moved has
  // closed its shipping half — and shipping does NOT end the turn, so the
  // rotation must not step here; the move is still to make.
  check('...and before the move, never after', /'already-moved'/.test(shipCase), true)
  check('...and the seat keeps its turn', /nextSeat\(/.test(shipCase), false)
  // THE MONOPOLY IS TWO ROWS IN ONE WRITE: payer down, Guild up, and the
  // Guild never paid by themselves.
  check('the Guild are paid on their own row',
    /purses\[guildSeat\] = readSpice\(guildRow as never\)/.test(shipCase), true)
  check('...never by themselves', /guildSeat !== playerId/.test(shipCase), true)
  check('...through the ledger', /reason: 'shipment'/.test(shipCase), true)

  const moveCase = fn.slice(fn.indexOf("case 'MOVE'"), fn.indexOf("case 'PASS_TURN'"))
  check('the move steps the rotation in its own write',
    /nextSeat\(/.test(moveCase), true)

  check('the entry opens the rotation at the first seat',
    /turn, order, at: 0, done: \{\}/.test(entry), true)
  // THE RING FOLLOWS THE CLOCK, like the worm pause's: the entry lights the
  // first seat. Every step hands it on — checked below, where the cases are
  // sliced. Without this a timer ran while no circle was lit.
  check('the entry rings the first seat',
    /\{ shipping, awaiting: order\[0\] \}/.test(entry), true)
  const passCase = fn.slice(fn.indexOf("case 'PASS_TURN'"), fn.indexOf("case 'REVIVE'"))
  // THE GUARD, NOT THE EXPRESSION: a false-&& prefix left the substring
  // intact once before.
  check('before the deadline only the acting seat passes',
    /if \(!expired && w\.order\[w\.at\] !== myFaction\)/.test(passCase), true)
  // The ring hands on with every step, and goes out with the window.
  // A SHIPMENT KEEPS THE RING: the seat still has its move. Only the move
  // and the pass hand it on.
  check('a shipment keeps the ring where it is', /awaiting:/.test(shipCase), false)
  check('...and so does a move',
    /awaiting: stepped \? stepped\.order\[stepped\.at\] : null/.test(moveCase), true)
  check('...and a pass',
    /awaiting: stepped \? stepped\.order\[stepped\.at\] : null/.test(passCase), true)
}

// ── the rail: the counter beside the board that spends it ────────────────
//
// WHY THIS EXISTS. The first cut of this phase had a timer and a panel in the
// notice board, and the report that came back was "nothing to press". The
// rail is controls that cannot be missed: reserves and spice between the chat
// and the board, a faction bubble that stages a force per click, and the
// board itself as the landing. Redundant with the panel ON PURPOSE.
{
  const state = {
    storm: CALM, turn: 4, phase: 'Shipment and Movement', shieldWall: 'intact',
    mode: 'basic',
    spiceDeck: { remaining: 10, discardA: [], discardB: [] },
    players: [
      { faction: 'emperor', seat: 'player-position-1', reserves: 12, reservesStarred: 5, handCount: 0, battleLosses: 0 },
      { faction: 'atreides', seat: 'player-position-3', reserves: 8, handCount: 0, battleLosses: 0 },
    ],
    forces: [], spiceOnBoard: {}, awaiting: null,
    shipping: {
      turn: 4, order: ['emperor', 'atreides'], stage: 'ship', at: 0,
      done: {}, closesAt: 9_999_999_999_999,
    },
  } as unknown as DuneGameState

  const screen = (seat: string, over: Record<string, unknown> = {}) =>
    renderToStaticMarkup(createElement(DuneGameScreen, {
      state, seat: seat as never, own: { spice: 7 } as never, chat: [],
      now: 1, onShipReserves: () => {}, ...over,
    } as never))

  const mine = screen('emperor')
  // BETWEEN THE CHAT AND THE BOARD, in that order — the whole of the ask.
  const chatAt = mine.indexOf('data-layer="chat"')
  const railAt = mine.indexOf('data-layer="ship-rail"')
  const boardAt = mine.indexOf('data-layer="board"')
  check('the rail is on the screen', railAt > 0, true)
  check('...between the chat and the board', chatAt < railAt && railAt < boardAt, true)
  // THE COUNTER: reserves and elite, straight off the row.
  check('it counts the reserves', /data-rail-reserves="12"/.test(mine), true)
  check('...and the elite apart', /data-rail-starred="5"/.test(mine), true)
  check('...and the purse', mine.includes('>7</b>'), true)
  // TWO BUBBLES for a faction with elite reserves, one for anyone else.
  check('the Emperor gets both bubbles',
    [/data-ship-bubble="plain"/.test(mine), /data-ship-bubble="starred"/.test(mine)],
    [true, true])
  const plainOnly = screen('atreides', {
    state: {
      ...state,
      shipping: { ...(state.shipping as object), order: ['atreides', 'emperor'] },
    },
  })
  check('...the Atreides only the plain one',
    [/data-ship-bubble="plain"/.test(plainOnly), /data-ship-bubble="starred"/.test(plainOnly)],
    [true, false])
  // NOT THE ACTING SEAT: the rail still counts, the bubbles are dead.
  const waiting = screen('atreides')
  check('a waiting seat keeps the counter',
    /data-layer="ship-rail"/.test(waiting), true)
  check('...with its bubbles disabled', /disabled=""[^>]*data-ship-bubble="plain"/.test(waiting), true)
  // NO SPECTATOR RAIL: no seat, no reserves to count.
  check('a spectator has no rail',
    /data-layer="ship-rail"/.test(screen('emperor', { seat: null })), false)

  // ── THE SOURCE OF THE CLICKS ────────────────────────────────────────────
  const rail = code('src/components/dune/ShipRail.tsx')
  const game = code('src/components/dune/DuneGameScreen.tssx'.replace('tssx', 'tsx'))
  // The glyph gives way to the count — click once and the bubble says 1.
  check('a staged bubble shows the count, not the glyph',
    /count > 0\s*\?\s*<text/.test(rail), true)
  // The reserve preview falls as forces stage; the fare is a range until the
  // landing picks the ground, priced by the same rule the server runs.
  // PINNED TO THE DISPLAY: the same subtraction guards the bubble, so a
  // bare substring survived a counter that stopped falling.
  check('the reserve preview falls as you stage',
    /data-rail-reserves=\{reserves - pending\.plain\}/.test(rail), true)
  // THE PURSE STANDS STILL while forces are merely staged: the fare is the
  // ground's to name, so the rail prices nothing at all — no shipCost, no
  // subtraction from spice, the raw figure and nothing else.
  check('the rail never prices the fare', /shipCost/.test(rail), false)
  check('...and shows the purse as it stands',
    /data-rail-spice=\{spice \?\? ''\}/.test(rail), true)
  // The landing: targets only in your window with something staged, never on
  // a stormed cell, and the click posts the staged counts and resets.
  check('the board offers the landing only with something staged',
    /myShipWindow && staged\.plain \+ staged\.starred > 0 && onShipReserves && \(/.test(game), true)
  check('...never on a stormed cell',
    /filter\(c => !inStorm\(t\.id, c\.sector, state\.storm\)\)/.test(game), true)
  check('...and the click is the shipment',
    /count: staged\.plain \+ staged\.starred,\s*[\r\n]+\s*starred: staged\.starred,/.test(game), true)
  // THE LANDING'S OWN RESET, not the rail button's: the same call sits on
  // "back", so a bare match survived a landing that kept the stage.
  check('...which clears the stage',
    /starred: staged\.starred,\s*[\r\n]+\s*\}\)\s*[\r\n]+\s*setStaged\(\{ plain: 0, starred: 0 \}\)/.test(game), true)

  // ── THE TWO-CLICK MOVE ──────────────────────────────────────────────────
  // Your own stack first, then the ground: no selects, no number fields. The
  // whole stack goes, the server judges range and storm, and staging a
  // shipment cancels a half-picked move so the two click grammars never
  // overlap on the same cells.
  check('a stack click starts the move',
    /myMoveWindow && staged\.plain \+ staged\.starred === 0 && onMoveStack && \(/.test(game), true)
  check('...and the destination click posts the whole stack',
    /sector: moveFrom\.sector, count: stack\.count,/.test(game), true)
  check('...the source is not its own destination',
    /!\(t\.id === moveFrom\.territoryId && c\.sector === moveFrom\.sector\)/.test(game), true)
  check('...and staging a shipment cancels the picked move',
    /setMoveFrom\(null\)\s*[\r\n]+\s*setStaged\(s => \(\{ \.\.\.s, \[kind\]: s\[kind\] \+ 1 \}\)\)/.test(game), true)

  // ── THE PANEL FOLLOWS THE ROUNDS ────────────────────────────────────────
  const panel = code('src/components/dune/ShipmentPanel.tsx')
  // THE DOING MOVED TO THE BOARD: the panel is a notice board again. Its
  // generic select forms survive only behind the harness flag, and the
  // Guild keep their two exceptions — special shipments have no bubble.
  check('the panel points at the board, not at forms',
    /Stage forces on the rail and click the board/.test(panel), true)
  check('...and at the two-click move',
    /Click one of your stacks, then where it goes/.test(panel), true)
  check('the generic forms are dev-only',
    /devForms && mayShip && \(/.test(panel) && /devForms && mayMove && \(/.test(panel), true)
  check('...the Guild keep their exceptions',
    /seat === 'spacing-guild' && mayShip && \(/.test(panel), true)
  check('...and the handoff ends the turn',
    /End turn — next player/.test(panel), true)

  // ── AND THE HARNESS HAS THE CONTROLS THE REPORT MISSED ──────────────────
  const harness = code('src/components/dune/DuneMultiSeatView.tsx')
  check('the six-seat harness carries the panel', /<ShipmentPanel/.test(harness), true)

  // THE EMBED IS FED THE WHOLE GRAMMAR. The harness has rendered the real
  // DuneGameScreen all along; what it lacked was these two props, and the
  // starved embed quietly rendered no rail and no click layers — which read,
  // three reports running, as a broken phase. Pinned so a prop added to the
  // real screen and forgotten here fails a named check instead of a play
  // session.
  check('the harness embed ships through the seat\'s own session',
    /onShipReserves=\{mine\s*[\r\n]+\s*\? a => void send\(mine, 'SHIP',/.test(harness), true)
  check('...and moves the same way',
    /onMoveStack=\{mine\s*[\r\n]+\s*\? a => void send\(mine, 'MOVE', a as never\)/.test(harness), true)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
