/**
 * Revival — phase five: the dead come back, at a price, to the reserves.
 *
 * WHY A TANKS STORE EXISTS AT ALL. Until this phase, the dead simply stopped
 * being: the storm dropped them from `forces` and reported them, the worm did
 * the same, and nothing kept a total. Revival is the phase that reads that
 * total, so the Tleilaxu Tanks become state — PUBLIC state, because at a table
 * the Tanks sit in the open and everybody can count what is in them. Both
 * killers now bank their dead here; a killer that forgets is a killer that
 * cremates, and the suite holds each of them to it.
 *
 * THE RULES, as ruled:
 *
 *   Forces — up to THREE per turn, each faction's sheet giving some free
 *   (freeRevivals), the rest at TWO SPICE EACH, to the BANK — the Emperor's
 *   treachery redirect does not apply to revival. At most ONE starred force
 *   (Sardaukar, Fedaykin) per turn. Revived forces go to RESERVES, never the
 *   board.
 *
 *   Leaders — gated: the option OPENS when all five of a faction's leaders
 *   have been in the Tanks, and once open it NEVER CLOSES, however many
 *   leaders are back on the board. One leader per turn, costing that leader's
 *   fighting strength in spice, to the bank. A revived leader plays normally
 *   and can still be a traitor. Killed again, it goes FACE DOWN and waits for
 *   the rest of the cycle — see returnLeaderToTanks.
 */
import type { Force } from '@/types/Dune/Game'
import type { FactionId } from '@/types/Dune/Faction'
import { factionById } from '@/data/dune/factions'
import { KWISATZ_HADERACH, KWISATZ_STRENGTH } from '@/types/Dune/Game'

/** The most forces one faction may revive in one turn. */
export const REVIVAL_CAP = 3
/** What a revival costs past the sheet's free ones. To the bank. */
export const REVIVAL_SPICE = 2
/** Sardaukar and Fedaykin come back one at a time. */
export const STARRED_REVIVALS_PER_TURN = 1

/** A dead leader as the Tanks hold it. Face down is the cycling rule's mark:
 *  revived once and killed again, waiting for the rest of the rotation. */
export interface DeadLeader { name: string; faceDown?: boolean }

/** The Tleilaxu Tanks. Public — they sit in the open at a table. */
export interface Tanks {
  /** Dead forces by faction, split the way revival needs them. */
  forces: Record<string, { plain: number; starred: number }>
  /** Dead leaders by faction, in the order they died. */
  leaders: Record<string, DeadLeader[]>
  /**
   * Factions whose leader revival has opened. A LIST THAT ONLY GROWS: the
   * all-five condition gates when the option becomes available, and once it
   * has, it stays available regardless of how many are back on the board.
   */
  leaderRevivalOpen?: string[]
}

export const emptyTanks = (): Tanks => ({ forces: {}, leaders: {} })

/**
 * Bank a killer's dead.
 *
 * Takes the `killed` list a storm or a worm produces — Force rows, whose
 * `starred` says how many of the count were elite — and adds them to the
 * Tanks. Posture is irrelevant here: a dead advisor is as dead as a fighter.
 */
export function bankDead(tanks: Tanks | undefined, killed: readonly Force[]): Tanks {
  const next: Tanks = {
    ...(tanks ?? emptyTanks()),
    forces: { ...(tanks?.forces ?? {}) },
  }
  for (const k of killed) {
    if (!k.faction || k.count <= 0) continue
    const held = next.forces[k.faction] ?? { plain: 0, starred: 0 }
    const starred = Math.min(k.count, k.starred ?? 0)
    next.forces[k.faction] = {
      plain: held.plain + (k.count - starred),
      starred: held.starred + starred,
    }
  }
  return next
}

/** What one faction has already revived this turn. */
export interface RevivedSoFar { forces: number; starred: number; leader?: string }

export type RevivalRefusal =
  | 'nothing-there' | 'over-the-cap' | 'starred-limit' | 'cannot-pay'
  | 'not-open' | 'leader-already-this-turn' | 'not-in-tanks' | 'face-down'
  | 'no-such-leader' | 'nothing-asked' | 'patron-cannot-pay'

/** The Emperor's alliance grant: three EXTRA forces a turn, at their expense. */
export const PATRON_EXTRA_REVIVALS = 3
/** The Fremen's alliance grant: the turn's standard three, free outright. */
export const GRANTED_FREE_REVIVALS = 3

export interface ForceRevival {
  ok: true
  /** Spice owed by the reviver, to the BANK. Zero while the free last. */
  cost: number
  /** Spice owed by the Emperor patron, to the BANK — the extras' price. */
  patronCost: number
  /** The Tanks with the revived removed. */
  tanks: Tanks
  /** What returns to reserves — never to the board. */
  toReserves: { plain: number; starred: number }
  done: RevivedSoFar
}

/**
 * Revive forces: up to three a turn, one starred among them, free ones first.
 *
 * The cost is MARGINAL: the sheet's free revivals cover the first of the
 * turn's three wherever they fall, so a second call in the same turn pays
 * only for what the free allowance no longer covers.
 */
export function reviveForces(input: {
  faction: FactionId
  tanks: Tanks
  plain: number
  starred: number
  soFar: RevivedSoFar
  spice: number
  /** The Fremen ally's standing grant: the standard three are free. */
  freeGrant?: boolean
  /** The Emperor ally's standing grant, with the Emperor's purse: three
   *  extra forces a turn, full rate, at the Emperor's expense — never free. */
  patron?: { spice: number } | null
}): ForceRevival | { ok: false; refusal: RevivalRefusal } {
  const { faction, tanks, plain, starred, soFar, spice } = input
  const want = plain + starred
  if (want <= 0 || plain < 0 || starred < 0) return { ok: false, refusal: 'nothing-asked' }
  const cap = input.patron ? REVIVAL_CAP + PATRON_EXTRA_REVIVALS : REVIVAL_CAP
  if (soFar.forces + want > cap) return { ok: false, refusal: 'over-the-cap' }
  if (soFar.starred + starred > STARRED_REVIVALS_PER_TURN) {
    return { ok: false, refusal: 'starred-limit' }
  }
  const held = tanks.forces[faction] ?? { plain: 0, starred: 0 }
  if (held.plain < plain || held.starred < starred) return { ok: false, refusal: 'nothing-there' }

  // THE STANDARD THREE by the reviver's own rules — the Fremen grant makes
  // them free outright, the sheet's allowance still applying when larger —
  // and THE EXTRAS at the patron's expense, full rate, wherever the turn's
  // count crosses three.
  const free = Math.max(
    factionById(faction)?.freeRevivals ?? 0,
    input.freeGrant ? GRANTED_FREE_REVIVALS : 0)
  const ownEnd = Math.min(soFar.forces + want, REVIVAL_CAP)
  const paidBefore = Math.max(0, Math.min(soFar.forces, REVIVAL_CAP) - free)
  const paidAfter = Math.max(0, ownEnd - free)
  const cost = REVIVAL_SPICE * (paidAfter - paidBefore)
  const patronCost = REVIVAL_SPICE
    * (soFar.forces + want - Math.max(ownEnd, soFar.forces))
  if (cost > spice) return { ok: false, refusal: 'cannot-pay' }
  if (patronCost > (input.patron?.spice ?? 0)) {
    return { ok: false, refusal: 'patron-cannot-pay' }
  }

  return {
    ok: true,
    cost,
    patronCost,
    tanks: {
      ...tanks,
      forces: {
        ...tanks.forces,
        [faction]: { plain: held.plain - plain, starred: held.starred - starred },
      },
    },
    toReserves: { plain, starred },
    done: { ...soFar, forces: soFar.forces + want, starred: soFar.starred + starred },
  }
}

/** The leaders a faction could revive right now: gate open, in the Tanks,
 *  face up. What a picker shows. */
export function revivableLeaders(tanks: Tanks, faction: FactionId): DeadLeader[] {
  if (!(tanks.leaderRevivalOpen ?? []).includes(faction)) return []
  return (tanks.leaders[faction] ?? []).filter(l => !l.faceDown)
}

export interface LeaderRevival {
  ok: true
  /** The leader's fighting strength, in spice, to the BANK. */
  cost: number
  tanks: Tanks
  leader: string
  done: RevivedSoFar
}

/**
 * Revive one leader: gate open, one a turn, at fighting strength.
 *
 * The revived leader leaves the Tanks and is simply alive again — nothing
 * tracks living leaders, five-minus-the-Tanks is the roster — and plays
 * normally, traitor calls included: the traitor list in a seat's secrets
 * names names, and a name that walked out of the Tanks still matches.
 */
export function reviveLeader(input: {
  faction: FactionId
  tanks: Tanks
  leader: string
  soFar: RevivedSoFar
  spice: number
}): LeaderRevival | { ok: false; refusal: RevivalRefusal } {
  const { faction, tanks, leader, soFar, spice } = input
  if (!(tanks.leaderRevivalOpen ?? []).includes(faction)) return { ok: false, refusal: 'not-open' }
  if (soFar.leader) return { ok: false, refusal: 'leader-already-this-turn' }
  const dead = tanks.leaders[faction] ?? []
  const found = dead.find(l => l.name === leader)
  if (!found) return { ok: false, refusal: 'not-in-tanks' }
  if (found.faceDown) return { ok: false, refusal: 'face-down' }
  // THE KWISATZ HADERACH "must be revived like any other leader": the same
  // gate, the same one-a-turn, at its own +2 — it is simply not on the sheet.
  const strength = faction === 'atreides' && leader === KWISATZ_HADERACH
    ? KWISATZ_STRENGTH
    : factionById(faction)?.leaders.find(l => l.name === leader)?.strength
  if (strength == null) return { ok: false, refusal: 'no-such-leader' }
  if (strength > spice) return { ok: false, refusal: 'cannot-pay' }

  return {
    ok: true,
    cost: strength,
    tanks: {
      ...tanks,
      leaders: { ...tanks.leaders, [faction]: dead.filter(l => l.name !== leader) },
    },
    leader,
    done: { ...soFar, leader },
  }
}

/** What the Tleilaxu Ghola may bring back at once. */
export const GHOLA_FORCES = 5

/**
 * The Tleilaxu Ghola: one free revival, played at any time.
 *
 * "Revive 1 of your leaders REGARDLESS of how many leaders you have in the
 * tanks" — the card waives the gate that normally waits for the roster to
 * die, and the one-a-turn ledger and every cost in spice go with it; the
 * revival phase's own limits are simply not consulted. It does NOT waive
 * the face-down cycle: a leader waiting out the rotation is a rule about
 * the rotation, not about how many are dead. Or up to five forces from the
 * Tanks to reserves, free, outside the turn's three.
 */
export function playGhola(input: {
  faction: FactionId
  tanks: Tanks
  choice: { leader: string } | { plain: number; starred: number }
  /** The free revival's reach — the Ghola's five, or the Emperor Karama's
   *  three. Same law either way: gate waived, cycle honoured, no cost. */
  cap?: number
}): {
  ok: true
  tanks: Tanks
  leader?: string
  toReserves?: { plain: number; starred: number }
} | { ok: false; refusal: RevivalRefusal } {
  const { faction, tanks, choice } = input
  if ('leader' in choice) {
    const dead = tanks.leaders[faction] ?? []
    const found = dead.find(l => l.name === choice.leader)
    if (!found) return { ok: false, refusal: 'not-in-tanks' }
    if (found.faceDown) return { ok: false, refusal: 'face-down' }
    return {
      ok: true,
      leader: choice.leader,
      tanks: {
        ...tanks,
        leaders: {
          ...tanks.leaders,
          [faction]: dead.filter(l => l.name !== choice.leader),
        },
      },
    }
  }
  const { plain, starred } = choice
  const want = plain + starred
  if (want <= 0 || plain < 0 || starred < 0) return { ok: false, refusal: 'nothing-asked' }
  if (want > (input.cap ?? GHOLA_FORCES)) return { ok: false, refusal: 'over-the-cap' }
  const held = tanks.forces[faction] ?? { plain: 0, starred: 0 }
  if (held.plain < plain || held.starred < starred) {
    return { ok: false, refusal: 'nothing-there' }
  }
  return {
    ok: true,
    toReserves: { plain, starred },
    tanks: {
      ...tanks,
      forces: {
        ...tanks.forces,
        [faction]: { plain: held.plain - plain, starred: held.starred - starred },
      },
    },
  }
}

/**
 * A leader dies — the killers' entry point, wired when battles land.
 *
 * Three rules meet here, and this is the one place they can agree:
 *
 *   THE GATE. When this death puts all five of the faction's leaders in the
 *   Tanks, leader revival opens for them — and the open list only grows;
 *   nothing ever removes a faction from it.
 *
 *   FACE DOWN. A leader that had been revived goes into the Tanks face down:
 *   it cannot come back until all the faction's other revivable leaders have
 *   been revived, killed and returned.
 *
 *   THE CYCLE TURNS. The moment every one of the five is in the Tanks face
 *   down, that condition is met for all of them at once, and they all flip
 *   face up — a fresh rotation.
 */
export function returnLeaderToTanks(
  tanks: Tanks, faction: FactionId, leader: string, opts: { wasRevived?: boolean } = {},
): Tanks {
  const dead = [...(tanks.leaders[faction] ?? [])]
  if (dead.some(l => l.name === leader)) return tanks     // already there; a double report changes nothing
  dead.push({ name: leader, ...(opts.wasRevived ? { faceDown: true } : null) })

  // THE GATE COUNTS THE SHEET, nothing else. "Alive or dead, the Kwisatz
  // Haderach has no effect on the rule governing revival of Atreides
  // leaders" — so the token in the tanks neither opens the gate early nor
  // holds the rotation's flip hostage.
  const sheetNames = new Set((factionById(faction)?.leaders ?? []).map(l => l.name))
  const own = dead.filter(l => sheetNames.has(l.name))
  const five = factionById(faction)?.leaders.length ?? 5
  const open = new Set(tanks.leaderRevivalOpen ?? [])
  if (own.length >= five) open.add(faction)

  const everyoneFaceDown = own.length >= five && own.every(l => l.faceDown)
  return {
    ...tanks,
    leaders: {
      ...tanks.leaders,
      [faction]: everyoneFaceDown ? dead.map(l => ({ name: l.name })) : dead,
    },
    leaderRevivalOpen: [...open],
  }
}
