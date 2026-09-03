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
  judgeShipment, judgeMove, moveTargets, movementRange, territoryDistance,
  landForces, liftForces, nextSeat,
  SHIP_STRONGHOLD_SPICE, SHIP_OPEN_SPICE, GREAT_FLAT, STRONGHOLD_CAP, SHIPMENT_SECONDS,
  guildMayChoose, guildReorder, guildHolding, GUILD_ORDER_SECONDS,
  mayShipIntoStorm, stormShipLosses,
} from '@/lib/dune/shipment'
import type { ShippingWindow } from '@/lib/dune/shipment'
import { stormOrder } from '@/lib/dune/phaseAdvance'
import { suppressibleRefs } from '@/lib/dune/karama'
import { canKaramaStop } from '@/data/dune/factions'
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

// ── the rings and the judge, cell by cell ─────────────────────────────────
// moveTargets is the reachability the BOARD draws rings from; judgeMove is
// the law the SERVER runs. Both live in one module, composed of the same
// four rules, and this sweep holds them to it: over every cell on the
// board, a ring is offered exactly where a one-force move would be taken.
{
  const sweep = (faction: FactionId, from: { territoryId: string; sector: string },
    forces: Force[], storm: SectorId) => {
    const reach = moveTargets({ faction, from, forces, storm })
    let disagree = 0
    for (const t of DUNE_TERRITORIES) {
      for (const s of t.sectors) {
        const verdict = judgeMove({
          faction, from: from.territoryId,
          gather: [{ sector: from.sector, count: 1 }],
          to: { territoryId: t.id, sector: s }, forces, storm,
        }).ok
        if (verdict !== reach.has(`${t.id}|${s}`)) disagree++
      }
    }
    return { reach, disagree }
  }

  const afoot = sweep('emperor',
    { territoryId: 'territory-02', sector: 'sector-4' },
    [f('emperor', 'territory-02', 'sector-4', 6)], CALM)
  check('afoot, every cell agrees with the judge', afoot.disagree, 0)
  check('...and the walk reaches somewhere', afoot.reach.size > 0, true)
  check('...never its own territory',
    [...afoot.reach].some(k => k.startsWith('territory-02|')), false)

  const flying = sweep('emperor',
    { territoryId: 'territory-02', sector: 'sector-4' },
    [f('emperor', 'territory-02', 'sector-4', 6), f('emperor', 'territory-13', 'sector-10', 1)],
    CALM)
  check('with ornithopters, the same perfect agreement', flying.disagree, 0)
  check('...and three territories reach farther than one',
    flying.reach.size > afoot.reach.size, true)

  const stormy = sweep('fremen',
    { territoryId: 'territory-02', sector: 'sector-4' },
    [f('fremen', 'territory-02', 'sector-4', 6)], 'sector-9')
  check('the Fremen under a storm agree too', stormy.disagree, 0)
  check('...with no ring standing in the storm',
    [...stormy.reach].some(k => {
      const [t, s] = k.split('|')
      return inStorm(t, s, 'sector-9')
    }), false)

  const gated = sweep('emperor',
    { territoryId: 'territory-26', sector: 'sector-11' },
    [
      f('emperor', 'territory-26', 'sector-11', 4),
      f('atreides', 'territory-13', 'sector-10'),
      f('harkonnen', 'territory-13', 'sector-10'),
    ], CALM)
  check('a full stronghold agrees with the judge', gated.disagree, 0)
  check('...and its cell is never offered', gated.reach.has('territory-13|sector-10'), false)
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

  // ── and it is drawn as a card, on the deck it came off ─────────────────
  // A SENTENCE SAYING WHICH CARD IT IS is a description of a card sitting six
  // inches away from where the card sits. The deck slot turns face up instead,
  // drawn exactly as a discard is drawn, for the one seat entitled to it.
  {
    const deckState = {
      storm: CALM, turn: 4, phase: 'Shipment and Movement', shieldWall: 'intact',
      mode: 'basic',
      spiceDeck: { remaining: 9, discardA: [], discardB: [] },
      players: [
        { faction: 'atreides', seat: 'player-position-1', reserves: 8, handCount: 0, battleLosses: 0 },
        { faction: 'harkonnen', seat: 'player-position-3', reserves: 8, handCount: 0, battleLosses: 0 },
      ],
      forces: [], spiceOnBoard: {}, awaiting: null,
      shipping: {
        turn: 4, order: ['atreides', 'harkonnen'], stage: 'ship', at: 0,
        done: {}, closesAt: 9_999_999_999_999,
      },
    } as unknown as DuneGameState
    const glimpse = { turn: 4, card: { kind: 'territory', name: 'Cielago North', spice: 8 } }
    const paint = (seat: string, over: Record<string, unknown> = {}) =>
      renderToStaticMarkup(createElement(DuneGameScreen, {
        state: deckState, seat: seat as never, chat: [], now: 1,
        own: { spice: 7, spiceReveal: glimpse } as never,
        onShipReserves: () => {}, ...over,
      } as never))

    const seer = paint('atreides')
    check('the deck turns face up for the Atreides',
      [seer.includes('data-foreseen'), seer.includes('CIELAGO')], [true, true])
    check('...and the deck still says how much of it is left',
      seer.includes('9 LEFT'), true)

    // NOBODY ELSE, EVER. The field is on their secrets row, so another seat
    // has nothing to draw — but the gate is checked rather than assumed,
    // because a screen handed the wrong `own` would otherwise paint it.
    const blind = paint('harkonnen')
    check('the deck stays face down for everybody else',
      [blind.includes('data-foreseen'), blind.includes('CIELAGO')], [false, false])

    // ONCE SHIPMENT STARTS, AND NOT AFTER. The stamp outlives the phase in
    // the secrets row, and a glimpse still showing in Battles is a card the
    // seat was not given a second look at.
    const later = renderToStaticMarkup(createElement(DuneGameScreen, {
      state: { ...deckState, phase: 'Battles', shipping: undefined } as never,
      seat: 'atreides', chat: [], now: 1,
      own: { spice: 7, spiceReveal: glimpse } as never,
    } as never))
    check('the deck turns back down when the phase moves on',
      later.includes('data-foreseen'), false)

    // A STALE STAMP IS NOT A GLIMPSE. Last turn's card is not on the deck any
    // more, and drawing it would be showing them a card that is gone.
    check('a glimpse from an older turn is not drawn',
      paint('atreides', {
        own: { spice: 7, spiceReveal: { ...glimpse, turn: 3 } } as never,
      }).includes('data-foreseen'), false)
  }

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
  // IN PLAY THE POOL IS CALLED RESERVES; the label is a prop now, because
  // the Fremen's setup borrows this rail for a pool that is not one yet.
  check('...under the name Reserves', mine.includes('Reserves</span>'), true)

  // ── THE FARE, AS THIS SEAT PAYS IT ──────────────────────────────────────
  // One rule, four renderings, each true for the seat reading it: no Guild
  // at this table and the fare goes to the bank; seat a Guild and the line
  // names them; the Guild themselves read half fare; the Fremen read the
  // free desert with full fare to the bank beyond it.
  check('the fare line names the bank when no Guild is seated',
    mine.includes('paid to the bank'), true)
  const withGuild = {
    ...state,
    players: [
      ...(state.players as unknown as object[]),
      { faction: 'spacing-guild', seat: 'player-position-5', reserves: 15, handCount: 0, battleLosses: 0 },
      { faction: 'fremen', seat: 'player-position-6', reserves: 10, reservesStarred: 3, handCount: 0, battleLosses: 0 },
    ],
  } as unknown as DuneGameState
  check('...and the Guild once they are seated',
    screen('emperor', { state: withGuild }).includes('paid to the Spacing Guild'), true)
  check('the Guild read their half fare',
    screen('spacing-guild', { state: withGuild }).includes('you pay half, rounded up'), true)
  // ── THE GUILD'S THREE WAYS, ON THE RAIL ─────────────────────────────────
  // Chosen BEFORE the board is touched: a stack click already means "start
  // a move", so the kind decides what the next click does. Each choice
  // carries its own rule text; nobody else sees them.
  const guildRail = screen('spacing-guild', {
    state: {
      ...withGuild,
      shipping: { ...(state.shipping as object), order: ['spacing-guild', 'emperor'] },
    },
  })
  check('the Guild are offered their three ways to ship',
    ['off-planet', 'cross', 'to-reserves'].every(k =>
      guildRail.includes(`data-guild-kind="${k}"`)), true)
  check('...with the rules on the choices',
    [/half fare, rounded up/.test(guildRail),
      /from any one territory to any other/.test(guildRail),
      /1 spice per 2 forces, rounded up/.test(guildRail)],
    [true, true, true])
  check('...off-planet pressed by default',
    /data-guild-kind="off-planet"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-guild-kind="off-planet"/.test(guildRail), true)
  check('...and nobody else sees them', /data-guild-kind/.test(mine), false)

  // ── THE HANDOFF LIVES ON THE RAIL ───────────────────────────────────────
  // End turn sat on the notice board (and the harness's dev box) — the wrong
  // side of the screen from every other shipment control. It rides the rail
  // now, for the acting seat alone: a waiting seat's rail has no turn to end.
  const acting = screen('emperor', { onPassTurn: () => {} } as never)
  check('the acting seat may end the turn from the rail',
    /data-end-turn/.test(acting), true)
  check('...a waiting seat may not',
    /data-end-turn/.test(screen('atreides', { onPassTurn: () => {} } as never)), false)

  const fremenRail = screen('fremen', { state: withGuild })
  check('the Fremen read their free desert',
    fremenRail.includes('free, onto the Great Flat or any territory within two of it'), true)
  check('...and the full fare to the bank beyond it',
    fremenRail.includes('full fare to the bank'), true)
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
    /myMoveWindow && staged\.plain \+ staged\.starred === 0 && !guildArmed && onMoveStack && \(/.test(game), true)
  check('...unless a Guild kind is armed, which is its own grammar',
    /const guildArmed = seat === 'spacing-guild' && myShipWindow && guildKind !== 'off-planet'/.test(game), true)
  check('...and each ground click stages one force, capped at the stack',
    /\? Math\.min\(stackTotal, m\.count \+ 1\)\s*[\r\n]+\s*: m\.count,/.test(game), true)
  check('...re-aiming keeps the staged and changes only the ground',
    /to: \{ territoryId: t\.id, sector: c\.sector \},\s*[\r\n]+\s*count: \(!m\.to/.test(game), true)
  check('...the rings are the judge\'s reachability, imported',
    /const reach = moveTargets\(\{\s*[\r\n]+\s*faction: seat!, from: movePlan\.from,/.test(game), true)
  check('...and only reached cells are offered',
    /\.filter\(c => reach\.has\(`\$\{t\.id\}\|\$\{c\.sector\}`\)\)/.test(game), true)
  check('...the elites board last, so − hands them back first',
    /Math\.max\(0, movePlan\.count - \(stackTotal - stackStarred\)\)/.test(game), true)
  check('...− takes one click back, and at zero the ground clears',
    /m\.count <= 1\s*[\r\n]+\s*\? \{ \.\.\.m, to: null, count: 0 \}\s*[\r\n]+\s*: \{ \.\.\.m, count: m\.count - 1 \}/.test(game), true)
  check('...and ✓ posts the one committed move, whole',
    /count: movePlan\.count,\s*[\r\n]+\s*\.\.\.\(starredStaged > 0 \? \{ starred: starredStaged \} : null\),/.test(game), true)
  check('...which clears the plan',
    /to: movePlan\.to!,\s*[\r\n]+\s*\}\)\s*[\r\n]+\s*setMovePlan\(null\)/.test(game), true)
  check('...and staging a shipment cancels the picked move and the pile',
    /setMovePlan\(null\)\s*[\r\n]+\s*setGather\(null\)\s*[\r\n]+\s*setStaged\(s => \(\{ \.\.\.s, \[kind\]: s\[kind\] \+ 1 \}\)\)/.test(game), true)

  // ── THE GUILD'S GATHER GRAMMAR ──────────────────────────────────────────
  // One force per stack click, capped at the stack; a different stack
  // starts the pile over; the second bubble hands one back per click. A
  // cross-shipment lands the pile whole on any clear cell OUTSIDE its own
  // territory; back-to-reserves commits from the rail's send button, priced
  // 1 spice per 2 on its face. Switching kind clears every staging, and the
  // reserve bubble sleeps while a special kind is armed.
  check('a gather click picks up one force, capped at the stack',
    /\? \{ \.\.\.g, count: Math\.min\(f\.count, g\.count \+ 1\) \}/.test(game), true)
  check('...a different stack starts the pile over',
    /: \{ territoryId: f\.territoryId, sector: f\.sector, count: 1 \}\)/.test(game), true)
  check('a cross-shipment never lands on its own territory',
    /\.filter\(\(\) => t\.id !== gather\.territoryId\)/.test(game), true)
  check('...and posts the pile whole, then clears it',
    /kind: 'cross',[\s\S]{0,300}count: gather\.count,\s*[\r\n]+\s*\}\)\s*[\r\n]+\s*setGather\(null\)/.test(game), true)
  check('back-to-reserves commits from the rail, not a cell',
    /kind: 'to-reserves',\s*[\r\n]+\s*from: \{ territoryId: gather\.territoryId, sector: gather\.sector \},\s*[\r\n]+\s*count: gather\.count,/.test(game), true)
  check('...at 1 spice per 2, said on the send button',
    /Send \{gathered\} back — \{Math\.ceil\(\(gathered \?\? 0\) \/ 2\)\} spice/.test(rail), true)
  check('the second bubble hands one back per click',
    /onGatherBack\?\.\(\)/.test(rail)
    && /g && g\.count > 1 \? \{ \.\.\.g, count: g\.count - 1 \} : null/.test(game), true)
  check('switching kind clears every staging',
    /setGuildKind\(k\)\s*[\r\n]+\s*setGather\(null\)\s*[\r\n]+\s*setStaged\(\{ plain: 0, starred: 0 \}\)\s*[\r\n]+\s*setMovePlan\(null\)/.test(game), true)
  check('the reserve bubble sleeps while a special kind is armed',
    /\|\| \(guildKind !== undefined && guildKind !== 'off-planet'\)\}/.test(rail), true)

  // ── THE STACK IS CLICKABLE, NOT JUST RINGED ─────────────────────────────
  // The first cut drew the source as a fill-none circle, and a fill-none
  // circle takes clicks on its stroke alone — a dashed 1.6px thread. "I
  // still can't click my stack" was the truth: the ring rendered and was
  // all but unhittable. The transparent disc under it is the hit area, so
  // it is pinned beside the ring it serves — moved apart, it serves nothing.
  const moving = screen('emperor', {
    onMoveStack: () => {},
    state: {
      ...state,
      forces: [{ faction: 'emperor', territoryId: 'territory-22', sector: 'sector-15', count: 3 }],
      shipping: { ...(state.shipping as object), done: { shipped: true } },
    },
  })
  check('the move window rings my stack', /data-move-source="territory-22\|sector-15"/.test(moving), true)
  check('...with a disc to hit, not a thread', /fill="transparent"/.test(moving), true)
  check('...the disc under the ring it serves',
    /fill="transparent" \/>\s*[\r\n]+\s*<circle cx=\{at\.x\} cy=\{at\.y\} r="13" fill="none"/.test(game), true)

  // ── THE PANEL FOLLOWS THE ROUNDS ────────────────────────────────────────
  const panel = code('src/components/dune/ShipmentPanel.tsx')
  // THE DOING MOVED TO THE BOARD: the panel is a notice board again. Its
  // generic select forms survive only behind the harness flag, and the
  // Guild keep their two exceptions — special shipments have no bubble.
  check('the panel points at the board, not at forms',
    /Stage forces on the rail and click the board/.test(panel), true)
  check('...and at the two-click move',
    /Click one of your stacks, then where it goes/.test(panel), true)
  check('...a click a force, said out loud',
    /a click a force/.test(panel), true)
  check('the generic forms are dev-only',
    /devForms && mayShip && \(/.test(panel) && /devForms && mayMove && \(/.test(panel), true)
  check('...the Guild are pointed at the rail\'s three kinds',
    /Pick the shipment kind on the rail/.test(panel), true)
  check('...their select forms are gone',
    /From one territory to another/.test(panel), false)
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
  check('...and carries the Guild\'s special shipments',
    /onShipSpecial=\{mine\s*[\r\n]+\s*\? a => void send\(mine, 'SHIP', a as never\)/.test(harness), true)
}

// ── a lift spans duplicate rows instead of annihilating them ──────────────
// Setup can seat two rows on one key. Lifting two from rows of [2, 1] used
// to subtract two from EACH — both rows dropped, three removed for a landing
// of two, and the third force simply ceased. The lift now charges each row
// no more than it holds and no more than is still owed.
{
  const twin = [
    { faction: 'bene-gesserit', territoryId: 'territory-03', sector: 'sector-1', count: 2 },
    { faction: 'bene-gesserit', territoryId: 'territory-03', sector: 'sector-1', count: 1 },
  ] as never[]
  check('lifting two from rows of [2,1] leaves exactly one standing',
    liftForces(twin as never, 'bene-gesserit' as never, 'territory-03', 'sector-1', 2, 0)
      .map(f => f.count), [1])
  check('...lifting three empties the cell without inventing a fourth',
    liftForces(twin as never, 'bene-gesserit' as never, 'territory-03', 'sector-1', 3, 0)
      .map(f => f.count), [])
  check('...and the starred owed are drawn where they stand',
    liftForces([
      { faction: 'emperor', territoryId: 'territory-22', sector: 'sector-15', count: 3, starred: 2 },
      { faction: 'emperor', territoryId: 'territory-22', sector: 'sector-15', count: 2 },
    ] as never, 'emperor' as never, 'territory-22', 'sector-15', 2, 2)
      .map(f => ({ count: f.count, starred: f.starred ?? 0 })),
    [{ count: 1, starred: 0 }, { count: 2, starred: 0 }])
}

// ── setup placements land through the merge ───────────────────────────────
{
  const { landPlacement } = await import('@/lib/dune/setup')
  const board = [
    { faction: 'bene-gesserit', territoryId: 'territory-03', sector: 'sector-1', count: 1 },
  ] as never[]
  check('a fighter placement merges with the row already standing',
    landPlacement(board as never, [
      { faction: 'bene-gesserit', territoryId: 'territory-03', sector: 'sector-1',
        count: 1, posture: 'fighter' },
    ] as never).map(f => f.count), [2])
  check('...an advisor keeps its own row, posture and all',
    landPlacement(board as never, [
      { faction: 'bene-gesserit', territoryId: 'territory-20', sector: 'sector-16',
        count: 1, posture: 'advisor' },
    ] as never).length, 2)
  const fn3 = readFileSync('supabase/functions/dune-action/index.ts', 'utf8')
  check('...and both setup landings go through it',
    (fn3.match(/landPlacement\(/g) ?? []).length >= 2, true)
}

// ── the alliance's ground rules ───────────────────────────────────────────
// Allies may not share a territory: landing on an ally is refused, the move
// rings never offer their ground, and the Polar Sink is neutral. Advisors
// are not forces and neither block nor share. The ally's purse stands
// behind the shipper's for the fee, own spice first.
{
  const { allyOccupies, coOccupied, judgeShipment: js2, judgeMove: jm2,
    moveTargets: mt2, POLAR_SINK: SINK } = await import('@/lib/dune/shipment')
  const R = (faction: string, territoryId: string, sector: string, count: number,
    posture?: string) => ({ faction, territoryId, sector, count,
    ...(posture ? { posture } : null) })
  const board = [
    R('fremen', 'territory-13', 'sector-10', 2),
    R('fremen', SINK, 'sector-10', 3),
    R('fremen', 'territory-40', 'sector-4', 1),
    R('atreides', 'territory-40', 'sector-4', 2),
    R('atreides', SINK, 'sector-10', 1),
    R('harkonnen', 'territory-26', 'sector-2', 4, 'advisor'),
    R('atreides', 'territory-26', 'sector-2', 1),
  ] as never

  check('an ally with fighters there occupies; nobody, no ally, no occupation',
    [allyOccupies(board, 'fremen' as never, 'territory-13'),
      allyOccupies(board, 'fremen' as never, 'territory-33'),
      allyOccupies(board, null, 'territory-13')],
    [true, false, false])
  check('...the Polar Sink is neutral ground',
    allyOccupies(board, 'fremen' as never, SINK), false)
  check('...and advisors are not an occupation',
    allyOccupies(board, 'harkonnen' as never, 'territory-26'), false)
  check('the shared ground names itself, sorted, Sink and advisors excluded',
    [coOccupied(board, 'atreides' as never, 'fremen' as never),
      coOccupied(board, 'atreides' as never, 'harkonnen' as never)],
    [['territory-40'], []])

  const shipTo = (over: object) => js2({
    faction: 'atreides' as never, kind: 'off-planet', count: 1,
    to: { territoryId: 'territory-13', sector: 'sector-10' },
    forces: board, reserves: 10, reservesStarred: 0, spice: 5,
    storm: 'sector-18' as never, guildSeated: false, ...over,
  } as never)
  check('shipping onto an ally is refused',
    (shipTo({ ally: 'fremen' }) as { refusal: string }).refusal, 'ally-occupies')
  check('...and the same landing beside a mere rival is taken',
    shipTo({ ally: 'harkonnen' }).ok, true)
  check('the ally purse stands behind the fee, own spice first',
    [shipTo({ ally: 'harkonnen', count: 4, spice: 1, allySpice: 3 }).ok,
      (shipTo({ ally: 'harkonnen', count: 4, spice: 1, allySpice: 2 }) as {
        refusal: string
      }).refusal],
    [true, 'cannot-pay'])

  check('moving onto an ally is refused before the path is even walked',
    (jm2({
      faction: 'atreides' as never, from: 'territory-01',
      gather: [{ sector: 'sector-1', count: 1 }],
      to: { territoryId: 'territory-13' }, forces: board,
      storm: 'sector-18' as never, ally: 'fremen' as never,
    }) as { refusal: string }).refusal, 'ally-occupies')

  // THE RINGS AND THE JUDGE, ally rule included: over every cell, a ring is
  // offered exactly where an allied one-force move would be taken — and the
  // only cells an ally's presence removes are that ally's territories.
  {
    const mover = [R('atreides', 'territory-13', 'sector-10', 3),
      R('fremen', 'territory-01', 'sector-1', 2)] as never
    const from = { territoryId: 'territory-13', sector: 'sector-10' }
    const noAlly = mt2({ faction: 'atreides' as never, from, forces: mover,
      storm: 'sector-18' as never })
    const withAlly = mt2({ faction: 'atreides' as never, from, forces: mover,
      storm: 'sector-18' as never, ally: 'fremen' as never })
    let disagree = 0
    for (const t of DUNE_TERRITORIES) {
      for (const s of t.sectors) {
        const verdict = jm2({
          faction: 'atreides' as never, from: from.territoryId,
          gather: [{ sector: from.sector, count: 1 }],
          to: { territoryId: t.id, sector: s }, forces: mover,
          storm: 'sector-18' as never, ally: 'fremen' as never,
        }).ok
        if (verdict !== withAlly.has(t.id + '|' + s)) disagree++
      }
    }
    check('the allied rings and the allied judge agree over every cell',
      disagree, 0)
    const dropped = [...noAlly].filter(k => !withAlly.has(k))
    check('...the fixture reaches the ally without them (not vacuous)',
      [...noAlly].some(k => k.startsWith('territory-01|')), true)
    check('...and the ally rule removes exactly the ally ground',
      dropped.every(k => k.startsWith('territory-01|')) && dropped.length > 0, true)
  }

  // ── the server slice ────────────────────────────────────────────────────
  const fn2 = readFileSync('supabase/functions/dune-action/index.ts', 'utf8')
  const shipCut = fn2.slice(fn2.indexOf("case 'SHIP'"), fn2.indexOf("case 'MOVE'"))
  check('SHIP reads the ally once and judges with ground and purse',
    [/ally: shipAlly as never,\s*[\r\n]+\s*allySpice: shipAllySpice,/.test(shipCut),
      /const share = allyShare\(shipFee, readSpice\(secrets\)\)/.test(shipCut)],
    [true, true])
  const moveCut = fn2.slice(fn2.indexOf("case 'MOVE'"), fn2.indexOf("case 'PASS_TURN'"))
  check('MOVE hands the judge the ally',
    /\.find\(\(p\) => p\.faction === myFaction\)\?\.ally \?\? null\) as never,/.test(moveCut),
    true)
  const passCut = fn2.slice(fn2.indexOf("case 'PASS_TURN'"), fn2.indexOf("case 'REVIVE'"))
  check('a live pass while sharing ground is refused — for the LATER ally only',
    [/code: 'separate-from-ally'/.test(passCut),
      /allyIdx !== -1 && allyIdx < w\.at/.test(passCut)],
    [true, true])
  check('and the phase\'s end separates whoever would not, later seat to the tanks',
    [/const later = order\.indexOf\(x as never\) > order\.indexOf\(y as never\) \? x : y/.test(fn2),
      /base\.tanks = bankDead\(/.test(fn2),
      /&& f\.posture !== 'advisor'\)/.test(fn2)],
    [true, true, true])
}

// ── the Guild ally's rates and ways ───────────────────────────────────────
// "Allies may ship from their off-planet reserves onto Dune or cross-ship
// ... at the half-price rate": half of the shipper's OWN rate, the fee
// still the Guild's; cross-shipping opens to the ally, returning to
// reserves does not.
{
  const { shipCost: sc, judgeShipment: js3, fremenShipTargets } =
    await import('@/lib/dune/shipment')
  const allied = { kind: 'off-planet', guildSeated: true, guildAllied: true }
  check('the Guild ally ships at the half rate, fees still to the Guild',
    [sc({ ...allied, faction: 'atreides', territoryId: 'territory-13', count: 3 } as never),
      sc({ ...allied, faction: 'atreides', territoryId: 'territory-22', count: 3 } as never)],
    [{ cost: 2, payee: 'guild' }, { cost: 3, payee: 'guild' }])
  const outR = DUNE_TERRITORIES.find(t => t.stronghold && !fremenShipTargets().has(t.id))!.id
  const inR = [...fremenShipTargets()][0]
  check('...a Fremen walk-in stays free, their outside rate halves',
    [sc({ ...allied, faction: 'fremen', territoryId: inR, count: 4 } as never).cost,
      sc({ ...allied, faction: 'fremen', territoryId: outR, count: 2 } as never).cost],
    [0, 1])
  const bare3 = {
    faction: 'atreides', count: 1, forces: [], reserves: 5, reservesStarred: 0,
    spice: 9, storm: 'sector-18', guildSeated: true,
  }
  check('cross-shipping opens to the Guild ally and to no one else',
    [(js3({ ...bare3, kind: 'cross' } as never) as { refusal: string }).refusal,
      (js3({ ...bare3, kind: 'cross', ally: 'spacing-guild' } as never) as { refusal: string }).refusal,
      (js3({ ...bare3, kind: 'to-reserves', ally: 'spacing-guild' } as never) as { refusal: string }).refusal],
    ['guild-only', 'no-such-territory', 'guild-only'])
  check('...and the judge prices the ally at the half rate',
    (js3({
      ...bare3, kind: 'off-planet', count: 2, spice: 1,
      to: { territoryId: 'territory-13', sector: 'sector-10' },
      ally: 'spacing-guild',
    } as never) as { cost: number }).cost, 1)
}

// ── Hajr ──────────────────────────────────────────────────────────────────
// An extra on-planet movement riding the SAME shipping turn: playable only
// while the holder's turn is open to a closing move, and the MOVE that
// would have closed the turn leaves it standing until the debt is paid.
{
  const { hajrMayPlay } = await import('@/lib/dune/shipment')
  const hw = (over: object = {}) =>
    ({ order: ['atreides', 'harkonnen'], at: 0, done: {}, ...over })
  check('Hajr rides the holder\'s own open turn and no other moment',
    [hajrMayPlay(hw() as never, 'atreides' as never),
      hajrMayPlay(hw({ done: { moved: true } }) as never, 'atreides' as never),
      hajrMayPlay(hw() as never, 'harkonnen' as never),
      hajrMayPlay(null, 'atreides' as never)],
    [true, false, false, false])

  const fnh = readFileSync('supabase/functions/dune-action/index.ts', 'utf8')
  const mv = fnh.slice(fnh.indexOf("case 'MOVE'"), fnh.indexOf("case 'PASS_TURN'"))
  check('the closing move stands down while Hajr owes a movement',
    [/const closes = w\.done\.moved \|\| !w\.done\.hajr/.test(mv),
      /if \(w\.done\.moved && !\(w\.done\.hajr && !w\.done\.hajrMoved\)\) \{/.test(mv),
      /\? \{ \.\.\.w\.done, hajrMoved: true \}/.test(mv),
      /: \{ \.\.\.rest, shipping: \{ \.\.\.w, done: done2 \} \}/.test(mv)],
    [true, true, true, true])
  const hj = fnh.slice(fnh.indexOf("case 'HAJR'"), fnh.indexOf("case 'TRUTHTRANCE'"))
  check('the HAJR case rides the law\'s own gate and spends the card once',
    [/if \(!hajrMayPlay\(hw as never, myFaction as never\)\) \{/.test(hj),
      /code: 'already-played'/.test(hj),
      /hjHand\.splice\(hjHand\.indexOf\('hajr'\), 1\)/.test(hj),
      /shipping: \{ \.\.\.hw, done: \{ \.\.\.hw\.done, hajr: true \} \}/.test(hj)],
    [true, true, true, true])
}

// ── the Bene Gesserit advanced advisor flow ───────────────────────────────
// The follow rides another faction's off-planet shipment — never the
// Fremen's walks — as ONE advisor into that same territory. Fighters flip
// to advisors where ground is shared; advisors flip to fighters in the open
// window, phases three to five — and never the turn they followed, unless
// they stand alone.
{
  const { bgAdvancedFollow, landAdvisor, judgeBgFlip, flipBgForces,
    bgFlippable, BG_FLIP_WINDOW, strongholdClosed: sc2 } =
    await import('@/lib/dune/shipment')
  check('the window is phases three to five',
    BG_FLIP_WINDOW, ['CHOAM Charity', 'Bidding', 'Revival'])
  check('the advanced follow: another faction\'s off-planet shipment, never the Fremen\'s',
    [bgAdvancedFollow('atreides' as never, 'off-planet', 'advanced'),
      bgAdvancedFollow('fremen' as never, 'off-planet', 'advanced'),
      bgAdvancedFollow('bene-gesserit' as never, 'off-planet', 'advanced'),
      bgAdvancedFollow('atreides' as never, 'cross', 'advanced'),
      bgAdvancedFollow('atreides' as never, 'off-planet', 'basic')],
    [true, false, false, false, false])

  const R2 = (faction: string, territoryId: string, sector: string, count: number,
    over: object = {}) => ({ faction, territoryId, sector, count, ...over })
  const landed = landAdvisor([
    R2('harkonnen', 'territory-11', 'sector-13', 4),
  ] as never, 'territory-11', 'sector-13' as never, 5)
  check('a followed advisor lands stamped with its turn',
    landed[1], {
      faction: 'bene-gesserit', territoryId: 'territory-11',
      sector: 'sector-13', count: 1, posture: 'advisor', freshTurn: 5,
    })
  check('...and merges into a standing advisor row, restamped',
    landAdvisor(landed as never, 'territory-11', 'sector-13' as never, 6)[1],
    {
      faction: 'bene-gesserit', territoryId: 'territory-11',
      sector: 'sector-13', count: 2, posture: 'advisor', freshTurn: 6,
    })

  const watchers = [
    R2('bene-gesserit', 'territory-11', 'sector-13', 2, { posture: 'advisor' }),
    R2('harkonnen', 'territory-11', 'sector-13', 4),
    R2('bene-gesserit', 'territory-20', 'sector-16', 3),
    R2('emperor', 'territory-20', 'sector-16', 2),
    R2('bene-gesserit', 'territory-27', 'sector-9', 1),
  ] as never
  check('advisors become fighters in the window, and only there',
    [judgeBgFlip({ direction: 'to-fighter', territoryId: 'territory-11',
      forces: watchers, phase: 'Bidding', turn: 4 }),
      judgeBgFlip({ direction: 'to-fighter', territoryId: 'territory-11',
        forces: watchers, phase: 'Shipment and Movement', turn: 4 }),
      judgeBgFlip({ direction: 'to-fighter', territoryId: 'territory-20',
        forces: watchers, phase: 'Bidding', turn: 4 })],
    [null, 'wrong-phase', 'nothing-there'])
  const fresh = [
    R2('bene-gesserit', 'territory-11', 'sector-13', 1,
      { posture: 'advisor', freshTurn: 4 }),
    R2('harkonnen', 'territory-11', 'sector-13', 4),
    R2('bene-gesserit', 'territory-12', 'sector-11', 1,
      { posture: 'advisor', freshTurn: 4 }),
  ] as never
  check('a follow-fresh advisor may not flip with company — alone it may',
    [judgeBgFlip({ direction: 'to-fighter', territoryId: 'territory-11',
      forces: fresh, phase: 'Bidding', turn: 4 }),
      judgeBgFlip({ direction: 'to-fighter', territoryId: 'territory-11',
        forces: fresh, phase: 'Bidding', turn: 5 }),
      judgeBgFlip({ direction: 'to-fighter', territoryId: 'territory-12',
        forces: fresh, phase: 'Bidding', turn: 4 })],
    ['fresh-advisors', null, null])
  check('fighters become advisors where ground is shared, during shipment',
    [judgeBgFlip({ direction: 'to-advisor', territoryId: 'territory-20',
      forces: watchers, phase: 'Shipment and Movement', turn: 4 }),
      judgeBgFlip({ direction: 'to-advisor', territoryId: 'territory-27',
        forces: watchers, phase: 'Shipment and Movement', turn: 4 }),
      judgeBgFlip({ direction: 'to-advisor', territoryId: 'territory-20',
        forces: watchers, phase: 'Bidding', turn: 4 })],
    [null, 'nobody-there', 'wrong-phase'])

  const turned = flipBgForces(fresh, 'territory-11', 'to-fighter')
  check('a flip swaps the robes and drops the freshness stamp',
    turned.find(f => f.faction === 'bene-gesserit' && f.territoryId === 'territory-11'),
    {
      faction: 'bene-gesserit', territoryId: 'territory-11',
      sector: 'sector-13', count: 1, posture: 'fighter',
    })
  const menu = bgFlippable(watchers, 'Bidding', 4)
  check('the menu is the judge\'s own answer',
    [menu.toFighter, menu.toAdvisor], [['territory-11'], []])

  // ── advisors do not occupy: the stronghold slot ─────────────────────────
  check('an advisor holds no stronghold slot against the cap',
    [sc2([
      R2('harkonnen', 'territory-13', 'sector-10', 2),
      R2('bene-gesserit', 'territory-13', 'sector-10', 1, { posture: 'advisor' }),
    ] as never, 'emperor' as never, 'territory-13'),
      sc2([
        R2('harkonnen', 'territory-13', 'sector-10', 2),
        R2('bene-gesserit', 'territory-13', 'sector-10', 1),
      ] as never, 'emperor' as never, 'territory-13')],
    [false, true])

  // ── the server slice ────────────────────────────────────────────────────
  const fnb = readFileSync('supabase/functions/dune-action/index.ts', 'utf8')
  check('the advanced follow rides the SHIP write, under the standing order',
    [/bgAdvancedFollow\(myFaction as never, kind, bgMode\)/.test(fnb),
      /&& bgHasReserves && state\.bgFollowShips !== false && judged\.sector/.test(fnb),
      /landAdvisor\(/.test(fnb)],
    [true, true, true])
  const bf = fnb.slice(fnb.indexOf("case 'BG_FLIP'"), fnb.indexOf("case 'BG_POLICY'"))
  check('the flip case is the Sisterhood\'s, advanced, judged by the law',
    [/code: 'not-your-power'/.test(bf), /code: 'advanced-only'/.test(bf),
      /judgeBgFlip\(\{/.test(bf), /flipBgForces\(/.test(bf)],
    [true, true, true, true])
  const bp2 = fnb.slice(fnb.indexOf("case 'BG_POLICY'"), fnb.indexOf("case 'KARAMA'"))
  check('the standing order is one public boolean',
    /bgFollowShips: action\.follow === true/.test(bp2), true)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// ── a Karama cancels the Fremen desert ────────────────────────────────────
// Their free radius is an ADVANTAGE and stoppable like any other. It shipped
// without a suppression check, against the rule in the suppression doc that an
// ability gets its check when the ability is built — so the one faction power
// that most changes who can reach where could not be cancelled at all.
{
  const desert = { kind: 'off-planet' as const, guildSeated: true }
  // territory-22 sits inside the radius: free normally, priced once stopped.
  const inside = {
    ...desert, faction: 'fremen' as FactionId, territoryId: 'territory-22', count: 3,
  }
  check('the desert is free while the advantage stands', shipCost(inside).cost, 0)
  check('...and costs the ordinary rate once a Karama has stopped it',
    shipCost({ ...inside, suppressed: true }).cost > 0, true)
  // THE PAYEE DOES NOT MOVE WITH IT. That the desert never feeds the Guild
  // follows from Fremen reserves being on planet — data, not an advantage —
  // so cancelling the radius must not hand the Guild an income they never had.
  check('...still paid to the bank, never the Guild',
    [shipCost(inside).payee, shipCost({ ...inside, suppressed: true }).payee],
    ['bank', 'bank'])
  // AND ONLY THEIRS: suppressing one seat must not reprice another.
  const other = {
    ...desert, faction: 'atreides' as FactionId, territoryId: 'territory-22', count: 3,
  }
  check('a suppressed Fremen leaves every other fare alone',
    shipCost({ ...other, suppressed: true }).cost, shipCost(other).cost)

  // WIRED WHERE IT FIRES, and to BOTH prices — the judge and the karama-rated
  // recompute — or the two disagree about what is owed.
  const endpoint = readFileSync('supabase/functions/dune-action/index.ts', 'utf8')
  const shipAt = endpoint.indexOf('const ownShipSuppressed')
  check('the endpoint asks whether the shipper own advantage is stopped',
    shipAt > 0, true)
  const nearShip = endpoint.slice(shipAt, shipAt + 3400)
  check('...against abilities.shipment, in Shipment and Movement',
    [/abilities.shipment/.test(nearShip), /Shipment and Movement/.test(nearShip)],
    [true, true])
  // COUNTED OVER THE WHOLE FILE rather than over a window after the first
  // mention: the window had to be widened twice as unrelated comments grew
  // between the two calls, and a pin that needs re-tuning to keep passing is
  // a pin that will one day be re-tuned into agreeing with a bug.
  check('...and hands it to both prices',
    (endpoint.match(/suppressed: ownShipSuppressed/g) ?? []).length, 2)
}

// ── the Guild goes when it likes ────────────────────────────────────────
// THE ADVANTAGE IS A SLOT, not a speed: they take their shipment and move
// out of turn, first or last or between, and everybody else keeps the order
// the storm dealt. Ten seconds to say so, and silence keeps the storm order —
// which is the half that has to be checked hardest, because it is the half
// that happens when nobody is watching.
{
  const six: FactionId[] = ['atreides', 'harkonnen', 'emperor', 'spacing-guild', 'fremen', 'bene-gesserit']
  const rest = six.filter(f => f !== 'spacing-guild')

  check('the choice is the advanced game\'s',
    [guildMayChoose('advanced', six), guildMayChoose('basic', six)], [true, false])
  check('...and nobody chooses for an absent Guild',
    guildMayChoose('advanced', rest), false)

  check('slot zero is first',
    guildReorder(six, 0), ['spacing-guild', ...rest])
  check('the last slot is last',
    guildReorder(six, 5), [...rest, 'spacing-guild'])
  check('and a middle slot is that gap',
    guildReorder(six, 2), ['atreides', 'harkonnen', 'spacing-guild', 'emperor', 'fremen', 'bene-gesserit'])

  // EVERYBODY ELSE KEEPS THE STORM'S ORDER. Whatever slot is asked for, the
  // other five come out in the sequence they went in — this card moves one
  // seat and no other.
  check('the rest keep their relative order at every slot',
    [0, 1, 2, 3, 4, 5].map(at =>
      JSON.stringify(guildReorder(six, at).filter(f => f !== 'spacing-guild'))),
    [0, 1, 2, 3, 4, 5].map(() => JSON.stringify(rest)))
  check('...and the table keeps its size',
    [0, 3, 5].map(at => guildReorder(six, at).length), [6, 6, 6])

  // A SEAT ASKING FOR SLOT NINE AT A TABLE OF SIX MEANS LAST, and a negative
  // one means first. There is nothing else either could mean, so they are
  // clamped rather than refused.
  check('out of range is clamped to the ends',
    [guildReorder(six, 99), guildReorder(six, -4)],
    [guildReorder(six, 5), guildReorder(six, 0)])
  check('a table without the Guild is returned untouched',
    guildReorder(rest, 0), rest)

  check('ten seconds, because five people are waiting on one', GUILD_ORDER_SECONDS, 10)

  // ── the window in the endpoint ─────────────────────────────────────────
  const endpoint = readFileSync('supabase/functions/dune-action/index.ts', 'utf8')
  check('the phase entry opens the window only when the Guild may choose',
    endpoint.includes('const guildPicks = !slotStopped && guildMayChoose(')
    && endpoint.includes('guildPick: { closesAt: now + GUILD_ORDER_SECONDS * 1000 }'), true)

  // NOBODY SHIPS INTO AN UNDECIDED ROTATION. Without this the first seat in
  // storm order could take a whole turn while the Guild was still deciding
  // whether to precede them, which is the one thing the ten seconds buys.
  //
  // THE RULE IS EXERCISED, THE WIRING IS PINNED. The first cut of this test
  // read the endpoint for the strings around the gate, and wrapping the gate
  // in `if (false &&` left every one of those strings in place — it passed a
  // sabotage it should have caught. So the boundaries are checked on the
  // function itself, and the endpoint is held to the exact guard rather than
  // to words near it.
  check('the window holds the rotation up to its deadline',
    [guildHolding({ guildPick: { closesAt: 1000 } }, 999),
      guildHolding({ guildPick: { closesAt: 1000 } }, 1000),
      guildHolding({ guildPick: { closesAt: 1000 } }, 1001)],
    [true, false, false])
  check('...and an unanswered window is not a permanent one', 
    guildHolding({ guildPick: { closesAt: 1000 } }, 9e12), false)
  check('a phase with no window holds nobody up',
    [guildHolding({}, 5), guildHolding(null, 5), guildHolding(undefined, 5),
      guildHolding({ guildPick: null }, 5)],
    [false, false, false, false])

  // ALL THREE OF THEM. Shipping, moving and passing are the whole of a turn
  // here, so gating one of the three leaves two ways round the wait.
  check('shipping, moving and passing all wait on the Guild',
    [(endpoint.match(/if \(guildHolding\(w as never, now\)\) \{/g) ?? []).length,
      (endpoint.match(/code: 'guild-choosing'/g) ?? []).length],
    [3, 3])

  const orderAt = endpoint.indexOf("case 'GUILD_ORDER':")
  check('the action exists', orderAt > 0, true)
  {
    const near = endpoint.slice(orderAt, orderAt + 1400)
    check('...refuses another faction, a shut window and a phase without one',
      [near.includes("code: 'not-your-choice'"), near.includes("code: 'window-closed'"),
        near.includes("code: 'no-guild-window'")], [true, true, true])
    check('...and answering takes the window away with it',
      near.includes('delete (nextShipping as Record<string, unknown>).guildPick'), true)
  }

  // ── the rail says it, to everybody ─────────────────────────────────────
  // THE GUILD GETS BUBBLES AND EVERYBODY ELSE GETS THE REASON. A table
  // watching a board do nothing for ten seconds and not being told why is how
  // a play-by-network game gets reloaded mid-turn.
  {
    const base = {
      storm: CALM, turn: 1, phase: 'Shipment and Movement', shieldWall: 'intact',
      mode: 'advanced',
      spiceDeck: { remaining: 10, discardA: [], discardB: [] },
      players: six.map((f, i) => ({
        faction: f, seat: `player-position-${i + 1}`,
        reserves: 10, handCount: 0, battleLosses: 0,
      })),
      forces: [] as Force[], spiceOnBoard: {}, awaiting: null,
      shipping: {
        turn: 1, order: six, stage: 'ship', at: 0, done: {},
        closesAt: 9e12, guildPick: { closesAt: 9e12 },
      },
    } as unknown as DuneGameState
    const draw = (seat: FactionId, when = 0) => renderToStaticMarkup(createElement(
      DuneGameScreen,
      { state: base, seat, now: when, chat: [], onGuildOrder: () => {} } as never))

    const screenSrc = readFileSync('src/components/dune/DuneGameScreen.tsx', 'utf8')
    const guild = draw('spacing-guild')
    check('the Guild is offered a slot for every seat, first through last',
      (guild.match(/data-guild-slot=/g) ?? []).length, 6)
    check('...and asked, not told', guild.includes('When do you go?'), true)
    check('...with the standing order named as the default',
      guild.includes('keep the slot the storm gave you'), true)

    const other = draw('atreides')
    check('another seat is told what the wait is',
      other.includes('The Guild is choosing'), true)
    check('...and is offered no slots at all',
      (other.match(/data-guild-slot=/g) ?? []).length, 0)

    // A SHUT WINDOW IS NO WINDOW. The rail is the phase's, and this phase
    // has ten seconds of it.
    // AND NOBODY ELSE IS HOLDING LIVE CONTROLS meanwhile. The server refuses
    // a shipment sent inside those ten seconds, so a first seat whose bubbles
    // were live would be pressing something that answers with a refusal.
    check('the first seat in the rotation has no live window yet',
      screenSrc.includes('const rotationOpen = !guildHolding(state.shipping as never, now)')
      && (screenSrc.match(/state\.shipping && rotationOpen/g) ?? []).length, 2)

    check('the rail is gone once the window has closed',
      draw('spacing-guild', 9e12 + 1).includes('data-layer="guild-order-rail"'), false)
  }
}

// ── the storm has one door, and it costs half ───────────────────────────
// THE SENTENCE IS "You may also bring your reserves into a storm at half
// losses." Reserves, so the off-planet shipment; half, so ceil of the count;
// and the advanced game, where their storm losses are halved everywhere else
// too. For everyone else the storm is still a wall.
{
  check('only the Fremen, and only in the advanced game',
    [mayShipIntoStorm('fremen', 'advanced'), mayShipIntoStorm('fremen', 'basic'),
      mayShipIntoStorm('atreides', 'advanced'), mayShipIntoStorm('spacing-guild', 'advanced')],
    [true, false, false, false])
  check('...and not through a Karama',
    mayShipIntoStorm('fremen', 'advanced', true), false)

  // ROUNDED UP, so an odd stack is never better off than an even one.
  check('half of them die, rounded up',
    [1, 2, 3, 4, 5, 6].map(n => stormShipLosses(n).lost), [1, 1, 2, 2, 3, 3])
  check('nothing shipped, nothing lost', stormShipLosses(0), { lost: 0, starredLost: 0 })

  // THE FEDAYKIN LAND LAST. Nobody chose these losses — there is no window
  // on an arrival — so the plain forces take them first.
  check('the plain forces burn before the elites',
    [stormShipLosses(4, 1), stormShipLosses(4, 4), stormShipLosses(3, 2)],
    [{ lost: 2, starredLost: 0 }, { lost: 2, starredLost: 2 },
      { lost: 2, starredLost: 1 }])

  // ── the judge lets them through, and nobody else ───────────────────────
  const storm = 'sector-1' as SectorId
  const stormed = DUNE_TERRITORIES.flatMap(t => t.cells.map(c => ({ t, c })))
    .find(({ t, c }) => inStorm(t.id, c.sector, storm) && t.terrain === 'sand')
  check('the board has a stormed sand cell to test with', !!stormed, true)
  const into = (faction: FactionId, over: Record<string, unknown> = {}) => judgeShipment({
    faction, kind: 'off-planet', count: 4, starred: 0,
    to: { territoryId: stormed!.t.id, sector: stormed!.c.sector },
    forces: [], reserves: 10, reservesStarred: 0, spice: 30,
    storm, guildSeated: false, ...over,
  })

  check('an ordinary shipper is still walled out',
    (into('atreides') as { refusal?: string }).refusal, 'stormed')
  check('...and so is a Fremen the caller has not cleared',
    (into('fremen') as { refusal?: string }).refusal, 'stormed')
  check('a cleared Fremen lands, and half of them do not',
    (() => { const v = into('fremen', { stormOk: true }) as
      { ok: boolean; stormLoss?: { lost: number; starredLost: number } }
      return [v.ok, v.stormLoss] })(),
    [true, { lost: 2, starredLost: 0 }])
  check('a shipment that misses the storm carries no toll',
    (() => { const v = judgeShipment({
      faction: 'fremen', kind: 'off-planet', count: 4, starred: 0,
      to: { territoryId: GREAT_FLAT }, forces: [], reserves: 10,
      reservesStarred: 0, spice: 30, storm, guildSeated: false, stormOk: true,
    }) as { ok: boolean; stormLoss?: unknown }
      return [v.ok, v.stormLoss ?? null] })(),
    [true, null])

  // THE DOOR IS FOR RESERVES. A cross-shipment is the Guild moving what is
  // already on Arrakis, which is a different sentence on a different card.
  check('the door does not open for a cross-shipment',
    (judgeShipment({
      faction: 'spacing-guild', kind: 'cross', count: 2, starred: 0,
      from: { territoryId: GREAT_FLAT, sector: DUNE_TERRITORIES
        .find(t => t.id === GREAT_FLAT)!.cells[0]!.sector },
      to: { territoryId: stormed!.t.id, sector: stormed!.c.sector },
      forces: [{ faction: 'spacing-guild', territoryId: GREAT_FLAT,
        sector: DUNE_TERRITORIES.find(t => t.id === GREAT_FLAT)!.cells[0]!.sector,
        count: 5, starred: 0 } as Force],
      reserves: 0, reservesStarred: 0, spice: 30, storm, guildSeated: true,
      stormOk: true,
    }) as { refusal?: string }).refusal, 'stormed')

  // ── wired where it fires ───────────────────────────────────────────────
  const ep = readFileSync('supabase/functions/dune-action/index.ts', 'utf8')
  check('the endpoint asks the rule and hands the answer to the judge',
    [ep.includes('const stormOk = mayShipIntoStorm('), ep.includes('stormOk,')],
    [true, true])
  check('...against advanced.shipment, which a Karama may stop',
    ep.slice(ep.indexOf('const stormDoorShut') - 120,
      ep.indexOf('const stormDoorShut') + 260)
      .includes('advanced.shipment'), true)
  check('...and the dead go to the tanks, not into thin air',
    ep.includes('const toll = judged.stormLoss ??')
    && ep.slice(ep.indexOf('const toll = judged.stormLoss'), ep.indexOf('const toll = judged.stormLoss') + 500)
      .includes('tanks = bankDead('), true)

  // THE BOARD OFFERS WHAT THE SERVER ACCEPTS. A ring on a stormed cell for a
  // seat that would be refused is an invitation to a refusal, and a wall on
  // one the rules allow is an advantage nobody can reach.
  const screenSrc = readFileSync('src/components/dune/DuneGameScreen.tsx', 'utf8')
  check('the board asks the same rule before it rings a stormed cell',
    screenSrc.includes('.filter(c => stormLanding || !inStorm(t.id, c.sector, state.storm))')
    && screenSrc.includes('const stormLanding = mayShipIntoStorm('), true)
}

// ── the Guild paragraph is two advantages, and two stops ────────────────
// FOUR THINGS IN ONE SENTENCE: they collect everybody else's off-planet fees,
// they pay half of their own, and they may make two kinds of shipment nobody
// else can — territory to territory, and territory back to reserves. One card
// taking all four is not a reading a table would accept, so the menu offers
// the money and the kinds separately and each bites on its own.
{
  const guildTo = (over: Record<string, unknown> = {}) => shipCost({
    faction: 'spacing-guild' as FactionId, kind: 'off-planet' as never,
    territoryId: 'territory-22', count: 4, guildSeated: true, ...over,
  })

  // THE MONEY. Their own rate goes back to what everybody else pays; the four
  // into the deep desert cost 2 each rather than 1 each.
  check('a suppressed Guild pays the full rate for its own shipment',
    [guildTo().cost, guildTo({ suppressed: true }).cost],
    [SHIP_OPEN_SPICE * 4 / 2, SHIP_OPEN_SPICE * 4])
  check('...and into a stronghold as well',
    [guildTo({ territoryId: 'territory-13' }).cost,
      guildTo({ territoryId: 'territory-13', suppressed: true }).cost],
    [2, 4])
  check('...while nobody else\'s rate moves with it',
    (() => {
      const other = { faction: 'atreides' as FactionId, kind: 'off-planet' as never,
        territoryId: 'territory-22', count: 4, guildSeated: true }
      return shipCost({ ...other, suppressed: true }).cost === shipCost(other).cost
    })(), true)

  // THE KINDS. Their two special shipments close, and their ordinary
  // off-planet one does not — that is the half the other card stops.
  const asGuild = (kind: string, over: Record<string, unknown> = {}) => judgeShipment({
    faction: 'spacing-guild' as FactionId, kind: kind as never, count: 2, starred: 0,
    from: { territoryId: GREAT_FLAT, sector: 'sector-14' },
    to: { territoryId: 'territory-13' },
    forces: [{ faction: 'spacing-guild', territoryId: GREAT_FLAT, sector: 'sector-14',
      count: 5, starred: 0 } as Force],
    reserves: 10, reservesStarred: 0, spice: 30,
    storm: 'sector-1' as SectorId, guildSeated: true, ...over,
  })

  check('unstopped, the Guild may cross-ship and go home',
    [asGuild('cross').ok, asGuild('to-reserves').ok], [true, true])
  check('a stopped paragraph closes both of them',
    [(asGuild('cross', { kindsStopped: true }) as { refusal?: string }).refusal,
      (asGuild('to-reserves', { kindsStopped: true }) as { refusal?: string }).refusal],
    ['karama-stopped', 'karama-stopped'])
  check('...and leaves the ordinary shipment alone, which is the other card',
    asGuild('off-planet', { kindsStopped: true, from: undefined }).ok, true)

  // NOT THE ALLY. An ally cross-ships under the ALLIANCE clause, which is a
  // different entry on the sheet and not what this card was spent on.
  check('an ally of the Guild still cross-ships',
    judgeShipment({
      faction: 'atreides' as FactionId, kind: 'cross' as never, count: 2, starred: 0,
      from: { territoryId: GREAT_FLAT, sector: 'sector-14' },
      to: { territoryId: 'territory-13' },
      forces: [{ faction: 'atreides', territoryId: GREAT_FLAT, sector: 'sector-14',
        count: 5, starred: 0 } as Force],
      reserves: 10, reservesStarred: 0, spice: 30,
      storm: 'sector-1' as SectorId, guildSeated: true,
      ally: 'spacing-guild' as FactionId, kindsStopped: true,
    }).ok, true)
  check('...and a refusal for not being the Guild still reads as that',
    (judgeShipment({
      faction: 'atreides' as FactionId, kind: 'to-reserves' as never, count: 2, starred: 0,
      from: { territoryId: GREAT_FLAT, sector: 'sector-14' },
      forces: [], reserves: 10, reservesStarred: 0, spice: 30,
      storm: 'sector-1' as SectorId, guildSeated: true,
    }) as { refusal?: string }).refusal, 'guild-only')

  // ── two offers, one paragraph ──────────────────────────────────────────
  check('the menu offers the money and the kinds separately',
    suppressibleRefs('spacing-guild', 'advanced').map(r => r.ref).sort(),
    ['abilities.shipment', 'abilities.shipment#kinds', 'advanced.shipment'])
  check('...and both point at the one paragraph a player reads',
    suppressibleRefs('spacing-guild', 'advanced')
      .filter(r => r.ref.startsWith('abilities.shipment'))
      .length, 2)

  // A FACTION THAT PUT THE WHOLE ENTRY BEYOND A KARAMA MEANT ITS PARTS.
  // Otherwise the qualifier is the way round the protection.
  check('an unsuppressable entry protects its parts too',
    canKaramaStop(
      { unsuppressable: ['abilities.shipment'] } as never,
      'abilities.shipment#kinds' as never), false)

  // ── wired where each fires ─────────────────────────────────────────────
  const src = readFileSync('supabase/functions/dune-action/index.ts', 'utf8')
  check('the endpoint asks the kinds stop and hands it down',
    [src.includes("'abilities.shipment#kinds' as never"),
      src.includes('stormOk, kindsStopped,')], [true, true])
  check('...and the money stop still redirects the fee',
    src.includes("shipFeeTo = 'bank'"), true)
}

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
