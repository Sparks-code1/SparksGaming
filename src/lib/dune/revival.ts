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
  | 'no-such-leader' | 'nothing-asked'

export interface ForceRevival {
  ok: true
  /** Spice owed, to the BANK. Zero while the sheet's free ones last. */
  cost: number
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
}): ForceRevival | { ok: false; refusal: RevivalRefusal } {
  const { faction, tanks, plain, starred, soFar, spice } = input
  const want = plain + starred
  if (want <= 0 || plain < 0 || starred < 0) return { ok: false, refusal: 'nothing-asked' }
  if (soFar.forces + want > REVIVAL_CAP) return { ok: false, refusal: 'over-the-cap' }
  if (soFar.starred + starred > STARRED_REVIVALS_PER_TURN) {
    return { ok: false, refusal: 'starred-limit' }
  }
  const held = tanks.forces[faction] ?? { plain: 0, starred: 0 }
  if (held.plain < plain || held.starred < starred) return { ok: false, refusal: 'nothing-there' }

  const free = factionById(faction)?.freeRevivals ?? 0
  const paidBefore = Math.max(0, soFar.forces - free)
  const paidAfter = Math.max(0, soFar.forces + want - free)
  const cost = REVIVAL_SPICE * (paidAfter - paidBefore)
  if (cost > spice) return { ok: false, refusal: 'cannot-pay' }

  return {
    ok: true,
    cost,
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
  const sheet = factionById(faction)?.leaders.find(l => l.name === leader)
  if (!sheet) return { ok: false, refusal: 'no-such-leader' }
  if (sheet.strength > spice) return { ok: false, refusal: 'cannot-pay' }

  return {
    ok: true,
    cost: sheet.strength,
    tanks: {
      ...tanks,
      leaders: { ...tanks.leaders, [faction]: dead.filter(l => l.name !== leader) },
    },
    leader,
    done: { ...soFar, leader },
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

  const five = factionById(faction)?.leaders.length ?? 5
  const open = new Set(tanks.leaderRevivalOpen ?? [])
  if (dead.length >= five) open.add(faction)

  const everyoneFaceDown = dead.length >= five && dead.every(l => l.faceDown)
  return {
    ...tanks,
    leaders: {
      ...tanks.leaders,
      [faction]: everyoneFaceDown ? dead.map(l => ({ name: l.name })) : dead,
    },
    leaderRevivalOpen: [...open],
  }
}
