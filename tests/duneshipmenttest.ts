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
  // THE DESERT PAYS NOTHING.
  check('the Fremen ship free',
    shipCost({ ...base, faction: 'fremen', territoryId: 'territory-22', count: 9 }).cost, 0)
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
  check('the Fremen land free on the Flat',
    judgeShipment({ ...base, faction: 'fremen', to: { territoryId: GREAT_FLAT, sector: 'sector-15' } }).ok && true, true)
  check('...and nowhere beyond it',
    (judgeShipment({ ...base, faction: 'fremen', to: { territoryId: 'territory-26' } }) as { refusal: string }).refusal,
    'outside-the-desert')

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
  const w: ShippingWindow = {
    turn: 3, order: ['atreides', 'harkonnen'] as FactionId[], at: 0,
    done: { shipped: true, moved: true }, closesAt: 1000,
  }
  const next = nextSeat(w, 2000)
  check('the rotation steps with a fresh slate',
    next && [next.at, next.done, next.closesAt], [1, {}, 2000])
  check('...and walking off the end ends the phase', nextSeat(next!, 3000), null)
  check('the acting window is a minute', SHIPMENT_SECONDS, 60)
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
    /await plainly\(\{ shipping \}, undefined, seer\)/.test(entry), true)

  const shipCase = fn.slice(fn.indexOf("case 'SHIP'"), fn.indexOf("case 'MOVE'"))
  check('shipping is the acting seat\'s alone', /'not-your-turn'/.test(shipCase), true)
  check('...one per turn', /'already-shipped'/.test(shipCase), true)
  check('...and before the move, never after', /'already-moved'/.test(shipCase), true)
  // THE MONOPOLY IS TWO ROWS IN ONE WRITE: payer down, Guild up, and the
  // Guild never paid by themselves.
  check('the Guild are paid on their own row',
    /purses\[guildSeat\] = readSpice\(guildRow as never\)/.test(shipCase), true)
  check('...never by themselves', /guildSeat !== playerId/.test(shipCase), true)
  check('...through the ledger', /reason: 'shipment'/.test(shipCase), true)

  const moveCase = fn.slice(fn.indexOf("case 'MOVE'"), fn.indexOf("case 'PASS_TURN'"))
  check('the move steps the rotation in its own write',
    /nextSeat\(/.test(moveCase), true)
  const passCase = fn.slice(fn.indexOf("case 'PASS_TURN'"), fn.indexOf("case 'REVIVE'"))
  // THE GUARD, NOT THE EXPRESSION: a false-&& prefix left the substring
  // intact once before.
  check('before the deadline only the acting seat passes',
    /if \(!expired && w\.order\[w\.at\] !== myFaction\)/.test(passCase), true)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
