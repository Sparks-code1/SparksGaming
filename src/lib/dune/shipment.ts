/**
 * Shipment and Movement — phase six, basic rules.
 *
 * THE TURN WITHIN THE TURN. Seats act one at a time, counter-clockwise from
 * the storm-relative first player, and each completes its shipment and then
 * its movement before the next seat begins. That rotation is data — see
 * ShippingWindow — driven by the same deadline discipline as bidding: the
 * acting seat has a window, silence forfeits what was not used, and any seat
 * may push an expired turn along.
 *
 * SHIPMENT, one per seat per turn: off-planet reserves to any one territory,
 * one spice per force into a stronghold, two into anything else. Shipping
 * into the sector the storm sits on is refused. A stronghold holding two
 * other factions is closed (a faction already inside may reinforce). Nobody
 * ships back to reserves except the Guild. The FREMEN's shipment is their
 * on-planet reserve arriving free — onto the Great Flat or any territory
 * within two of it, and nowhere else. The GUILD ship at half price, choose
 * one of three shipments a turn (off-planet in, territory to territory, or
 * territory back to reserves at one spice per two forces, rounded up), and
 * are PAID everyone else's off-planet shipping fees; their own payments go
 * to the bank — nobody pays themselves.
 *
 * MOVEMENT, one per seat per turn: any number of forces as a group from one
 * territory to one other. One adjacent territory on foot; three when the
 * mover holds forces in Arrakeen or Carthag as the move begins — ornithopters
 * carry the faction, not the city's neighbours. The Fremen walk two, and fly
 * three like everyone else. Sectors do not restrict movement EXCEPT the
 * storm: no force moves into, out of, or through the stormed sector, so a
 * path through a partly-stormed territory is legal on its clear side. The
 * Polar Sink is never in storm. Stronghold closing applies as to shipment.
 *
 * Wherever a territory spans sectors, the sector must be named.
 */
import type { Force, GamePhase, SectorId } from '@/types/Dune/Game'
import type { FactionId } from '@/types/Dune/Faction'
import { DUNE_TERRITORIES } from '@/data/dune/boardData'

/** The acting seat's window, in seconds: three minutes to ship AND move —
 *  one turn, both halves, then the next faction. */
export const SHIPMENT_SECONDS = 180

export const SHIP_STRONGHOLD_SPICE = 1
export const SHIP_OPEN_SPICE = 2
/** The Guild's return rate: one spice per two forces, rounded up. */
export const GUILD_RETURN_PER = 2

export const GREAT_FLAT = 'territory-22'

/** Where the watchers watch from. */
export const POLAR_SINK = 'territory-03'
export const POLAR_SINK_SECTOR = 'sector-1'

/**
 * THE WATCHERS FOLLOW THE SHIPS — the Bene Gesserit's basic rule: whenever
 * any other faction ships forces onto Dune from off-planet, one BG force
 * ships free from their reserves into the Polar Sink, beside their own
 * normal shipment. AUTOMATIC, because in the basic game there is no decision
 * in it. The FREMEN never trigger it: their reserves are on the planet, so
 * their shipping is not "from off-planet" — the sheet's "any other faction
 * ships... from off-planet" excludes them by construction. The Guild's own
 * off-planet shipments trigger it like anyone's. Advanced sends an advisor
 * to the shipper's territory instead and is NOT built — so in an advanced
 * match NOTHING follows: firing the basic rule there hands the Bene
 * Gesserit free Polar Sink forces the advanced game never grants.
 */
export function bgFollowsShip(
  shipper: FactionId, kind: GuildShipKind, mode: 'basic' | 'advanced',
): boolean {
  return mode === 'basic' && kind === 'off-planet'
    && shipper !== 'bene-gesserit' && shipper !== 'fremen'
}
/** How far from the Great Flat the desert's own shipment reaches. */
export const FREMEN_SHIP_RADIUS = 2

const ARRAKEEN = 'territory-13'
const CARTHAG = 'territory-26'

/** Two factions may share a stronghold; a third is turned away. */
export const STRONGHOLD_CAP = 2

const territory = (id: string) => DUNE_TERRITORIES.find(t => t.id === id)

/**
 * The seat-by-seat rotation, in public state while the phase runs.
 *
 * ONE ROTATION: each faction ships and then moves within its own turn, and
 * only then does the next faction go — the two-round shape was a
 * misreading, since corrected. Shipment comes before movement inside the
 * turn; the MOVE is what ends it (or a pass, or the clock).
 *
 * `done` records what the acting seat has used. Walking off the end of the
 * order deletes the window, which is how the phase says it is over.
 */
export interface ShippingWindow {
  turn: number
  order: FactionId[]
  at: number
  done: { shipped?: boolean; moved?: boolean }
  closesAt: number
}

export type ShipRefusal =
  | 'not-your-turn' | 'already-shipped' | 'already-moved' | 'nothing-asked'
  | 'no-such-territory' | 'sector-needed' | 'no-such-sector' | 'stormed'
  | 'stronghold-full' | 'cannot-pay' | 'not-enough-reserves' | 'not-yours-to-ship'
  | 'guild-only' | 'nothing-there' | 'out-of-range'
  | 'no-path'

/** Resolve the sector a shipment or move ends in, or refuse. */
export function settleSector(
  territoryId: string, sector: string | undefined,
): { ok: true; sector: SectorId } | { ok: false; refusal: ShipRefusal } {
  const t = territory(territoryId)
  if (!t) return { ok: false, refusal: 'no-such-territory' }
  if (t.sectors.length === 1) return { ok: true, sector: t.sectors[0] as SectorId }
  if (!sector) return { ok: false, refusal: 'sector-needed' }
  if (!t.sectors.includes(sector)) return { ok: false, refusal: 'no-such-sector' }
  return { ok: true, sector: sector as SectorId }
}

/** Whether this cell sits under the storm. The Polar Sink never does — the
 *  storm ring passes over the map's rim, not its centre. */
export function inStorm(territoryId: string, sector: string, storm: SectorId): boolean {
  const t = territory(territoryId)
  if (t?.terrain === 'polar-sink') return false
  return sector === storm
}

/**
 * Whether a stronghold is closed to this faction.
 *
 * TWO FACTIONS AND NO MORE, counted over the whole territory — a stronghold
 * is one gate however many sectors its walls span. A faction already inside
 * may always reinforce; the cap turns away the third arrival, not the
 * returning first or second.
 */
export function strongholdClosed(
  forces: readonly Force[], faction: FactionId, territoryId: string,
): boolean {
  const t = territory(territoryId)
  if (!t?.stronghold) return false
  const inside = new Set(
    forces.filter(f => f.territoryId === territoryId && f.count > 0).map(f => f.faction))
  return !inside.has(faction) && inside.size >= STRONGHOLD_CAP
}

/** The territories the Fremen ship into FREE: the Great Flat and everything
 *  within two territories of it, walked on adjacency. Beyond it they pay the
 *  full rate, to the bank alone — see shipCost. */
export function fremenShipTargets(): Set<string> {
  const reach = new Set<string>([GREAT_FLAT])
  let edge = [GREAT_FLAT]
  for (let step = 0; step < FREMEN_SHIP_RADIUS; step++) {
    const next: string[] = []
    for (const id of edge) {
      for (const adj of territory(id)?.adjacent ?? []) {
        if (!reach.has(adj)) { reach.add(adj); next.push(adj) }
      }
    }
    edge = next
  }
  return reach
}

export type GuildShipKind = 'off-planet' | 'cross' | 'to-reserves'

/**
 * What a shipment costs, and who is paid.
 *
 * The rate is the DESTINATION's: strongholds are cheap to reinforce because
 * the card says so, not because of anything about the route. The Guild pay
 * half, rounded up, on both inbound kinds, and one per two rounded up going
 * home. Everyone else's off-planet fee goes to the Guild when they are
 * seated — their shipping monopoly is a basic power — and to the bank
 * otherwise. The Guild's own fees go to the bank: nobody pays themselves.
 * The FREMEN pay nothing into their own radius — the Great Flat and
 * everything within two — and the FULL rate anywhere beyond it, ONLY to the
 * bank: the monopoly is the Guild's grip on off-planet freight, and the
 * desert's own coin never feeds it.
 */
export function shipCost(input: {
  faction: FactionId
  kind: GuildShipKind
  territoryId: string
  count: number
  guildSeated: boolean
}): { cost: number; payee: 'bank' | 'guild' } {
  const { faction, kind, territoryId, count, guildSeated } = input
  if (kind === 'to-reserves') {
    return { cost: Math.ceil(count / GUILD_RETURN_PER), payee: 'bank' }
  }
  const rate = territory(territoryId)?.stronghold ? SHIP_STRONGHOLD_SPICE : SHIP_OPEN_SPICE
  const full = rate * count
  if (faction === 'fremen') {
    return { cost: fremenShipTargets().has(territoryId) ? 0 : full, payee: 'bank' }
  }
  if (faction === 'spacing-guild') return { cost: Math.ceil(full / 2), payee: 'bank' }
  return { cost: full, payee: guildSeated ? 'guild' : 'bank' }
}

/**
 * Judge one shipment against the board, without touching it.
 *
 * The board changes and the spice moves are the caller's to apply — this
 * answers only whether the shipment is legal and what it costs. `kind` other
 * than 'off-planet' is the Guild's alone; the Fremen's destination is held to
 * their radius; and every kind that puts forces ON the board is held to the
 * storm and the stronghold gate.
 */
export function judgeShipment(input: {
  faction: FactionId
  kind: GuildShipKind
  to?: { territoryId: string; sector?: string }
  from?: { territoryId: string; sector: string }
  count: number
  starred?: number
  forces: readonly Force[]
  reserves: number
  reservesStarred: number
  spice: number
  storm: SectorId
  guildSeated: boolean
}): { ok: true; cost: number; payee: 'bank' | 'guild'; sector?: SectorId }
  | { ok: false; refusal: ShipRefusal } {
  const { faction, kind, count, forces, storm } = input
  const starred = input.starred ?? 0
  if (count <= 0 || starred < 0 || starred > count) return { ok: false, refusal: 'nothing-asked' }
  if (kind !== 'off-planet' && faction !== 'spacing-guild') {
    return { ok: false, refusal: 'guild-only' }
  }

  // ── leaving the board: no destination to judge, only the pile ───────────
  if (kind === 'to-reserves') {
    const from = input.from
    if (!from) return { ok: false, refusal: 'no-such-territory' }
    const held = forces.find(f =>
      f.faction === faction && f.territoryId === from.territoryId && f.sector === from.sector)
    const heldStarred = Math.min(held?.count ?? 0, held?.starred ?? 0)
    if (!held || held.count < count || heldStarred < starred) {
      return { ok: false, refusal: 'nothing-there' }
    }
    const { cost, payee } = shipCost({
      faction, kind, territoryId: from.territoryId, count, guildSeated: input.guildSeated,
    })
    if (cost > input.spice) return { ok: false, refusal: 'cannot-pay' }
    return { ok: true, cost, payee }
  }

  // ── arriving on the board ───────────────────────────────────────────────
  if (!input.to) return { ok: false, refusal: 'no-such-territory' }
  const settled = settleSector(input.to.territoryId, input.to.sector)
  if (!settled.ok) return settled
  if (inStorm(input.to.territoryId, settled.sector, storm)) {
    return { ok: false, refusal: 'stormed' }
  }
  if (strongholdClosed(forces, faction, input.to.territoryId)) {
    return { ok: false, refusal: 'stronghold-full' }
  }

  if (kind === 'cross') {
    const from = input.from
    if (!from) return { ok: false, refusal: 'no-such-territory' }
    const held = forces.find(f =>
      f.faction === faction && f.territoryId === from.territoryId && f.sector === from.sector)
    const heldStarred = Math.min(held?.count ?? 0, held?.starred ?? 0)
    if (!held || held.count < count || heldStarred < starred) {
      return { ok: false, refusal: 'nothing-there' }
    }
  } else {
    if (input.reserves + input.reservesStarred < count || input.reservesStarred < starred
      || count - starred > input.reserves) {
      return { ok: false, refusal: 'not-enough-reserves' }
    }
  }

  const { cost, payee } = shipCost({
    faction, kind, territoryId: input.to.territoryId, count, guildSeated: input.guildSeated,
  })
  if (cost > input.spice) return { ok: false, refusal: 'cannot-pay' }
  return { ok: true, cost, payee, sector: settled.sector }
}

// ── movement ──────────────────────────────────────────────────────────────

const num = (s: string) => Number(s.slice('sector-'.length))
const ringAdjacent = (a: string, b: string) => {
  const d = Math.abs(num(a) - num(b))
  return d === 1 || d === 17
}

/**
 * How far this faction may move, judged as the move begins.
 *
 * ORNITHOPTERS CARRY THE FACTION: holding forces in Arrakeen or Carthag when
 * the move starts grants the range wherever the moving group stands. The
 * Fremen walk two where everyone else walks one, and fly the same three.
 */
export function movementRange(faction: FactionId, forces: readonly Force[]): number {
  const flies = forces.some(f =>
    f.faction === faction && f.count > 0
    && (f.territoryId === ARRAKEEN || f.territoryId === CARTHAG))
  if (flies) return 3
  return faction === 'fremen' ? 2 : 1
}

/**
 * The territory distance from one cell to another, walked on the board.
 *
 * CELLS, NOT TERRITORIES, because the storm cuts territories in half: a step
 * within a territory between adjacent sectors is free — distance is counted
 * in territories entered — while a stormed sector is no cell at all. Edges
 * cross between adjacent territories where their sectors meet (the same
 * sector, or neighbouring wedges), and every crossing costs one.
 *
 * Returns Infinity when no lawful path exists.
 */
export function territoryDistance(
  from: { territoryId: string; sector: string },
  to: { territoryId: string; sector: string },
  storm: SectorId,
): number {
  const key = (t: string, s: string) => `${t}|${s}`
  const blocked = (t: string, s: string) => inStorm(t, s, storm)
  if (blocked(from.territoryId, from.sector) || blocked(to.territoryId, to.sector)) {
    return Infinity
  }
  // 0-1 BFS: intra-territory steps are free, crossings cost one.
  const dist = new Map<string, number>([[key(from.territoryId, from.sector), 0]])
  const queue: { t: string; s: string }[] = [{ t: from.territoryId, s: from.sector }]
  while (queue.length) {
    // smallest distance first; the frontier is tiny, a scan is fine
    let bi = 0
    for (let i = 1; i < queue.length; i++) {
      if ((dist.get(key(queue[i].t, queue[i].s)) ?? 0) < (dist.get(key(queue[bi].t, queue[bi].s)) ?? 0)) bi = i
    }
    const [{ t, s }] = queue.splice(bi, 1)
    const d = dist.get(key(t, s)) ?? 0
    const here = territory(t)
    if (!here) continue
    const step = (nt: string, ns: string, cost: number) => {
      if (blocked(nt, ns)) return
      const k = key(nt, ns)
      if ((dist.get(k) ?? Infinity) > d + cost) {
        dist.set(k, d + cost)
        queue.push({ t: nt, s: ns })
      }
    }
    // along the territory, sector to adjacent sector — free
    for (const s2 of here.sectors) {
      if (s2 !== s && ringAdjacent(s, s2)) step(t, s2, 0)
    }
    // across a border, where the wedges meet — one territory entered
    for (const adj of here.adjacent) {
      const there = territory(adj)
      if (!there) continue
      for (const s2 of there.sectors) {
        if (s2 === s || ringAdjacent(s, s2)) step(adj, s2, 1)
      }
    }
  }
  return dist.get(key(to.territoryId, to.sector)) ?? Infinity
}

/**
 * Every cell one stack may lawfully reach this move — THE JUDGE'S OWN LAW,
 * exported so the board offers rings only where a move would be accepted.
 * Composed of exactly the rules judgeMove applies to a gathered stack —
 * movementRange, territoryDistance around the storm, the closed-stronghold
 * gate, never its own territory — and the agreement is swept cell by cell
 * in the tests, so the rings the client draws and the moves the server
 * takes cannot drift apart.
 */
export function moveTargets(input: {
  faction: FactionId
  from: { territoryId: string; sector: string }
  forces: readonly Force[]
  storm: SectorId
}): Set<string> {
  const { faction, from, forces, storm } = input
  const range = movementRange(faction, forces)
  const reach = new Set<string>()
  for (const t of DUNE_TERRITORIES) {
    if (t.id === from.territoryId) continue
    if (strongholdClosed(forces, faction, t.id)) continue
    for (const s of t.sectors) {
      // no storm check here ON PURPOSE: territoryDistance is the storm's law
      // — a stormed destination is Infinity — and writing it twice would
      // leave a second copy to drift.
      const d = territoryDistance(from, { territoryId: t.id, sector: s }, storm)
      if (d <= range) reach.add(`${t.id}|${s}`)
    }
  }
  return reach
}

/**
 * Judge one move: a group from one territory to one other, within range,
 * around the storm, through no closed gate.
 *
 * The group may gather from several sectors of the from-territory — they are
 * one group by territory — and EVERY gathered stack must have its own lawful
 * path: a stack on the stormed side of a split territory does not get to
 * teleport across because its neighbours could walk.
 */
export function judgeMove(input: {
  faction: FactionId
  from: string
  gather: readonly { sector: string; count: number; starred?: number }[]
  to: { territoryId: string; sector?: string }
  forces: readonly Force[]
  storm: SectorId
}): { ok: true; sector: SectorId; moving: number } | { ok: false; refusal: ShipRefusal } {
  const { faction, from, gather, to, forces, storm } = input
  if (!territory(from)) return { ok: false, refusal: 'no-such-territory' }
  if (gather.length === 0 || gather.some(g => g.count <= 0)) {
    return { ok: false, refusal: 'nothing-asked' }
  }
  if (from === to.territoryId) return { ok: false, refusal: 'nothing-asked' }
  const settled = settleSector(to.territoryId, to.sector)
  if (!settled.ok) return settled
  if (inStorm(to.territoryId, settled.sector, storm)) return { ok: false, refusal: 'stormed' }
  if (strongholdClosed(forces, faction, to.territoryId)) {
    return { ok: false, refusal: 'stronghold-full' }
  }

  const range = movementRange(faction, forces)
  let moving = 0
  for (const g of gather) {
    const held = forces.find(f =>
      f.faction === faction && f.territoryId === from && f.sector === g.sector)
    const heldStarred = Math.min(held?.count ?? 0, held?.starred ?? 0)
    if (!held || held.count < g.count || heldStarred < (g.starred ?? 0)) {
      return { ok: false, refusal: 'nothing-there' }
    }
    const d = territoryDistance(
      { territoryId: from, sector: g.sector },
      { territoryId: to.territoryId, sector: settled.sector }, storm)
    if (d === Infinity) return { ok: false, refusal: 'no-path' }
    if (d > range) return { ok: false, refusal: 'out-of-range' }
    moving += g.count
  }
  return { ok: true, sector: settled.sector, moving }
}

// ── applying either to the board ──────────────────────────────────────────

/** Add arrivals to a cell, merging with a stack already standing there. */
export function landForces(
  forces: readonly Force[], faction: FactionId,
  territoryId: string, sector: SectorId, count: number, starred: number,
): Force[] {
  const at = forces.findIndex(f =>
    f.faction === faction && f.territoryId === territoryId && f.sector === sector)
  if (at >= 0) {
    const f = forces[at]
    return forces.map((x, i) => i === at
      ? { ...f, count: f.count + count, starred: (f.starred ?? 0) + starred }
      : x)
  }
  return [...forces, {
    faction, territoryId, sector, count,
    ...(starred > 0 ? { starred } : null),
  } as Force]
}

/**
 * Take a detachment off a cell, dropping a stack when it empties.
 *
 * ACROSS EVERY MATCHING ROW, until the asked-for lift is satisfied. Two rows
 * CAN share one key — setup pushes placements raw beside the deal's rows —
 * and the old form subtracted the whole count from EACH match: lifting two
 * from rows of [2, 1] dropped both, and the Bene Gesserit's third Polar Sink
 * force was annihilated exactly that way. A row is never charged more than
 * it holds, and never more than is still owed.
 */
export function liftForces(
  forces: readonly Force[], faction: FactionId,
  territoryId: string, sector: string, count: number, starred: number,
): Force[] {
  let owed = count
  let starsOwed = starred
  const out: Force[] = []
  for (const f of forces) {
    if (f.faction !== faction || f.territoryId !== territoryId
      || f.sector !== sector || owed <= 0) {
      out.push(f)
      continue
    }
    const take = Math.min(f.count, owed)
    const stars = Math.min(Math.min(f.count, f.starred ?? 0), starsOwed, take)
    owed -= take
    starsOwed -= stars
    const left = f.count - take
    if (left > 0) {
      out.push({ ...f, count: left, starred: Math.max(0, (f.starred ?? 0) - stars) })
    }
  }
  return out
}

/** The rotation moved along: the seat's move made, a pass, or the clock.
 *  Off the end of the order, null — the phase is over. */
export function nextSeat(w: ShippingWindow, closesAt: number): ShippingWindow | null {
  const at = w.at + 1
  if (at < w.order.length) return { ...w, at, done: {}, closesAt }
  return null
}

/** The nine-phase name this module serves, for guards. */
export const SHIPMENT_PHASE: GamePhase = 'Shipment and Movement'
