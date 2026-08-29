/**
 * Battles — the basic game's combat, phase seven.
 *
 * WHAT THIS PASS BUILDS: the plain battle. Two sides in one territory, hidden
 * plans, a simultaneous reveal, a traitor beat, and a resolution in spice,
 * tanks and discards. Voice and the Atreides battle prescience are basic
 * rules but need an interrogation window around plan commitment, so they
 * come in a second pass; advanced combat, the Harkonnen capture and the
 * Kwisatz Haderach are later passes entirely.
 *
 * WHAT IS HIDDEN AND WHERE. A battle plan is the game's sharpest secret and
 * it lives in match_secrets until the reveal — the public row carries WHO has
 * committed, never what. On the second commit the server reads both rows and
 * publishes both plans in the same write: simultaneous because one write
 * cannot be read half-done. After the reveal comes the TRAITOR BEAT, and it
 * opens for BOTH combatants every time, whether or not either could call —
 * a beat that only opened when a call was possible would announce who holds
 * a traitor by opening at all.
 *
 * DELIBERATE SIMPLIFICATIONS OF THIS PASS, each a rules call to revisit:
 *  - Elites dial and die as one force each; the Fedaykin/Sardaukar two-for-one
 *    is advanced-adjacent text and comes with advanced combat.
 *  - The winner keeps their played weapon and defence (the cards say "keep if
 *    won"); the discard option matters only with hand limits pressing, and a
 *    choice window for it is not worth a stall. The Cheap Hero is always
 *    discarded — it is spent by being played.
 *  - The winner's dialled losses come off their stacks plain-first, cells in
 *    sector order — at the table the winner chooses; a deterministic default
 *    beats another window.
 */
import { DUNE_TERRITORIES } from '@/data/dune/boardData'
import { TREACHERY_CARDS } from '@/data/dune/treachery'
import { factionById } from '@/data/dune/factions'
import type { FactionId } from '@/types/Dune/Faction'
import type { Force, SectorId } from '@/types/Dune/Game'

/** How long the aggressor has to pick a battle before anyone may push one. */
export const BATTLE_PICK_SECONDS = 120
/**
 * How long both sides have to commit plans: five minutes a battle.
 *
 * A battle plan is the deepest decision in the game — the wheel, the leader,
 * two cards, a bluff — and the first cut's two minutes rushed it. EACH battle
 * stamps its own fresh window at the pick, so an aggressor fighting three
 * battles gets five minutes at each wheel, not five for the afternoon.
 * Silence still dials zero when the window shuts.
 */
export const BATTLE_PLAN_SECONDS = 300
/** The traitor beat after the reveal. Silence declines. */
export const BATTLE_TRAITOR_SECONDS = 60

export const CHEAP_HERO_ID = 'cheaphero'

const card = (id: string) => TREACHERY_CARDS.find(c => c.id === id)

const num = (s: string) => Number(s.slice('sector-'.length))
const ringAdjacent = (a: string, b: string) => {
  const d = Math.abs(num(a) - num(b))
  return d === 1 || d === 17
}

// ── where battles are ─────────────────────────────────────────────────────

/** One place two or more factions must fight over. `sectors` is the
 *  storm-connected slice of the territory the combatants actually share. */
export interface PendingBattle {
  territoryId: string
  sectors: SectorId[]
  factions: FactionId[]
}

/**
 * Every battle the board demands, from the forces as they stand.
 *
 * BY TERRITORY, except the Polar Sink, and except across the storm: a
 * stormed sector is no ground at all, so a territory it splits becomes two
 * pieces that cannot reach each other, and forces in different pieces do
 * not fight. Computed fresh from the forces every time it is needed —
 * resolution changes the board, and a stored list would have to chase it.
 */
export function pendingBattles(
  forces: readonly Force[], storm: SectorId,
): PendingBattle[] {
  const out: PendingBattle[] = []
  for (const t of DUNE_TERRITORIES) {
    if (t.terrain === 'polar-sink') continue
    const occupied = forces.filter(f => f.territoryId === t.id && f.count > 0)
    if (occupied.length === 0) continue

    // The territory's sectors, chained by ring adjacency, cut at the storm.
    const open = t.sectors.filter(s => s !== storm)
    const seen = new Set<string>()
    for (const start of open) {
      if (seen.has(start)) continue
      const component: string[] = []
      const queue = [start]
      seen.add(start)
      while (queue.length) {
        const s = queue.pop()!
        component.push(s)
        for (const s2 of open) {
          if (!seen.has(s2) && ringAdjacent(s, s2)) { seen.add(s2); queue.push(s2) }
        }
      }
      const inside = occupied.filter(f => component.includes(f.sector))
      const factions = [...new Set(inside.map(f => f.faction))]
      if (factions.length >= 2) {
        out.push({
          territoryId: t.id,
          sectors: [...component].sort((a, b) => num(a) - num(b)) as SectorId[],
          factions: factions.sort(),
        })
      }
    }
  }
  return out
}

/** The battles one faction must fight, from the full pending list. */
export const battlesFor = (pending: readonly PendingBattle[], faction: FactionId) =>
  pending.filter(b => b.factions.includes(faction))

/**
 * Who is aggressor now: the first seat from `at` onward, in storm order,
 * with a battle still to fight. Null when the phase is fought out.
 */
export function nextAggressor(
  order: readonly FactionId[], pending: readonly PendingBattle[], at: number,
): { at: number; faction: FactionId } | null {
  for (let i = Math.max(0, at); i < order.length; i++) {
    if (battlesFor(pending, order[i]).length > 0) return { at: i, faction: order[i] }
  }
  return null
}

// ── the plan ──────────────────────────────────────────────────────────────

/** A battle plan as committed — and, after the reveal, as published. */
export interface BattlePlan {
  dial: number
  /** A leader's name, or absent. */
  leader?: string
  /** The Cheap Hero played in the leader's place. */
  cheapHero?: boolean
  /** Card ids out of the hand. */
  weapon?: string
  defence?: string
}

export type PlanRefusal =
  | 'not-in-this-battle' | 'dial-out-of-range' | 'no-such-leader'
  | 'leader-in-the-tanks' | 'leader-fights-elsewhere' | 'two-leaders'
  | 'card-not-held' | 'not-a-weapon' | 'not-a-defence'
  | 'no-leader-no-cards' | 'one-card-twice'

/** How many forces a faction has standing in the battle's slice. */
export function forcesInBattle(
  forces: readonly Force[], faction: FactionId,
  territoryId: string, sectors: readonly string[],
): number {
  return forces
    .filter(f => f.faction === faction && f.territoryId === territoryId
      && sectors.includes(f.sector))
    .reduce((n, f) => n + f.count, 0)
}

/**
 * Judge one plan. `deadLeaders` are this faction's leaders in the tanks;
 * `usedLeaders` maps a leader already revealed this phase to the territory
 * it fights in — a leader is one disc, and it is standing somewhere.
 */
export function judgePlan(input: {
  faction: FactionId
  battle: Pick<PendingBattle, 'territoryId' | 'sectors'>
  forces: readonly Force[]
  hand: readonly string[]
  deadLeaders: readonly string[]
  usedLeaders: Readonly<Record<string, string>>
  plan: BattlePlan
}): { ok: true } | { ok: false; refusal: PlanRefusal } {
  const { faction, battle, forces, hand, deadLeaders, usedLeaders, plan } = input

  const strength = forcesInBattle(forces, faction, battle.territoryId, battle.sectors)
  if (strength <= 0) return { ok: false, refusal: 'not-in-this-battle' }
  if (!Number.isInteger(plan.dial) || plan.dial < 0 || plan.dial > strength) {
    return { ok: false, refusal: 'dial-out-of-range' }
  }

  if (plan.leader && plan.cheapHero) return { ok: false, refusal: 'two-leaders' }
  if (plan.leader) {
    const sheet = factionById(faction)
    if (!sheet?.leaders.some(l => l.name === plan.leader)) {
      return { ok: false, refusal: 'no-such-leader' }
    }
    if (deadLeaders.includes(plan.leader)) return { ok: false, refusal: 'leader-in-the-tanks' }
    const standing = usedLeaders[plan.leader]
    if (standing && standing !== battle.territoryId) {
      return { ok: false, refusal: 'leader-fights-elsewhere' }
    }
  }
  if (plan.cheapHero && !hand.includes(CHEAP_HERO_ID)) {
    return { ok: false, refusal: 'card-not-held' }
  }

  // No leader and no hero: the side still fights, but plays nothing.
  if (!plan.leader && !plan.cheapHero && (plan.weapon || plan.defence)) {
    return { ok: false, refusal: 'no-leader-no-cards' }
  }

  const played: string[] = []
  if (plan.cheapHero) played.push(CHEAP_HERO_ID)
  if (plan.weapon) {
    if (!hand.includes(plan.weapon)) return { ok: false, refusal: 'card-not-held' }
    if (card(plan.weapon)?.kind !== 'weapon') return { ok: false, refusal: 'not-a-weapon' }
    played.push(plan.weapon)
  }
  if (plan.defence) {
    if (!hand.includes(plan.defence)) return { ok: false, refusal: 'card-not-held' }
    if (card(plan.defence)?.kind !== 'defense') return { ok: false, refusal: 'not-a-defence' }
    played.push(plan.defence)
  }
  if (new Set(played).size !== played.length) return { ok: false, refusal: 'one-card-twice' }

  return { ok: true }
}

// ── the resolution ────────────────────────────────────────────────────────

/** What one side did, once everything is on the table. */
export interface SideInput {
  faction: FactionId
  plan: BattlePlan
  /** Whether this side called the OTHER side's leader as a traitor. */
  calledTraitor: boolean
}

export interface SideOutcome {
  faction: FactionId
  /** Every force this side loses in the battle's slice — the dial, or all. */
  losesAll: boolean
  losses: number
  /** The committed leader dies to the tanks (never set for a Cheap Hero). */
  leaderDies: boolean
  /** Cards leaving the hand for the discard, by id. */
  discards: string[]
  /** Spice this side takes from the bank, and what for. */
  spice: { amount: number; for: string }[]
}

export interface BattleOutcome {
  /** Null on mutual destruction — both-traitors or the lasgun explosion. */
  winner: FactionId | null
  explosion: boolean
  traitors: FactionId[]
  sides: [SideOutcome, SideOutcome]
  /** Spice lying on the territory is destroyed by the explosion. */
  clearSpice: boolean
}

const leaderStrength = (faction: FactionId, name: string) =>
  factionById(faction)?.leaders.find(l => l.name === name)?.strength ?? 0

const playedCards = (p: BattlePlan): string[] => [
  ...(p.cheapHero ? [CHEAP_HERO_ID] : []),
  ...(p.weapon ? [p.weapon] : []),
  ...(p.defence ? [p.defence] : []),
]

/**
 * Resolve one battle from two revealed plans and the traitor beat's answers.
 *
 * PURE — money, tanks and hands move in the caller's write; this only says
 * what moves. The rules, in the order they cut:
 *
 *  1. Both traitors: mutual destruction. Forces, leaders and cards on both
 *     sides are lost, and NOBODY takes spice.
 *  2. One traitor: the caller wins outright and loses NOTHING — not even the
 *     dial, and no explosion can touch them. The named leader dies, the
 *     caller takes its strength from the bank, the betrayed side loses all
 *     forces in the slice and discards what it played.
 *  3. Lasgun and shield: the explosion. Both sides lose everything standing
 *     there, both leaders die, all played cards discard, no spice is taken,
 *     and the spice lying on the territory burns with them.
 *  4. Otherwise weapons kill leaders (unless the matching defence was
 *     played), a dead leader counts nothing, highest dial-plus-leader wins,
 *     ties to the aggressor. The loser loses every force in the slice; the
 *     winner loses the dial. Killed leaders pay the WINNER their strength
 *     from the bank — their own included.
 */
export function resolveBattle(input: {
  aggressor: SideInput
  defender: SideInput
}): BattleOutcome {
  const { aggressor, defender } = input

  const side = (me: SideInput): SideOutcome => ({
    faction: me.faction, losesAll: false, losses: 0, leaderDies: false,
    discards: [], spice: [],
  })
  const a = side(aggressor)
  const d = side(defender)

  const finish = (winner: FactionId | null, explosion: boolean, traitors: FactionId[],
    clearSpice = false): BattleOutcome =>
    ({ winner, explosion, traitors, sides: [a, d], clearSpice })

  // ── traitors cut before everything ──────────────────────────────────────
  const traitors: FactionId[] = [
    ...(aggressor.calledTraitor ? [aggressor.faction] : []),
    ...(defender.calledTraitor ? [defender.faction] : []),
  ]
  if (traitors.length === 2) {
    for (const [me, mine] of [[aggressor, a], [defender, d]] as const) {
      mine.losesAll = true
      mine.leaderDies = !!me.plan.leader
      mine.discards = playedCards(me.plan)
    }
    return finish(null, false, traitors)
  }
  if (traitors.length === 1) {
    const [caller, callerOut, betrayed, betrayedOut] = aggressor.calledTraitor
      ? [aggressor, a, defender, d] as const
      : [defender, d, aggressor, a] as const
    betrayedOut.losesAll = true
    betrayedOut.leaderDies = !!betrayed.plan.leader
    betrayedOut.discards = playedCards(betrayed.plan)
    if (betrayed.plan.leader) {
      callerOut.spice.push({
        amount: leaderStrength(betrayed.faction, betrayed.plan.leader),
        for: `the traitor ${betrayed.plan.leader}`,
      })
    }
    void caller
    return finish(callerOut.faction, false, traitors)
  }

  // ── the lasgun and the shield ───────────────────────────────────────────
  const plans = [aggressor.plan, defender.plan]
  const lasgun = plans.some(p => p.weapon && card(p.weapon)?.subtype === 'lasgun')
  const shield = plans.some(p => p.defence && card(p.defence)?.subtype === 'projectile')
  if (lasgun && shield) {
    for (const [me, mine] of [[aggressor, a], [defender, d]] as const) {
      mine.losesAll = true
      mine.leaderDies = !!me.plan.leader
      mine.discards = playedCards(me.plan)
    }
    return finish(null, true, [], true)
  }

  // ── weapons against defences ────────────────────────────────────────────
  const killedBy = (attacker: BattlePlan, target: BattlePlan): boolean => {
    if (!attacker.weapon) return false
    if (!target.leader && !target.cheapHero) return false
    const kind = card(attacker.weapon)?.subtype
    const guarded = target.defence && card(target.defence)?.subtype === kind
    return !guarded
  }
  const aLeaderDead = killedBy(defender.plan, aggressor.plan)
  const dLeaderDead = killedBy(aggressor.plan, defender.plan)

  const total = (me: SideInput, dead: boolean) => me.plan.dial
    + (!dead && me.plan.leader ? leaderStrength(me.faction, me.plan.leader) : 0)
  const aTotal = total(aggressor, aLeaderDead)
  const dTotal = total(defender, dLeaderDead)

  // Ties to the aggressor.
  const aggressorWins = aTotal >= dTotal
  const [winSide, winOut, winDead, loseSide, loseOut, loseDead] = aggressorWins
    ? [aggressor, a, aLeaderDead, defender, d, dLeaderDead] as const
    : [defender, d, dLeaderDead, aggressor, a, aLeaderDead] as const

  loseOut.losesAll = true
  loseOut.leaderDies = loseDead && !!loseSide.plan.leader
  loseOut.discards = playedCards(loseSide.plan)

  winOut.losses = winSide.plan.dial
  winOut.leaderDies = winDead && !!winSide.plan.leader
  // The Cheap Hero is spent by being played; weapon and defence are kept —
  // the cards themselves say "keep if won".
  winOut.discards = winSide.plan.cheapHero ? [CHEAP_HERO_ID] : []

  // Killed leaders pay the winner, their own included.
  if (loseDead && loseSide.plan.leader) {
    winOut.spice.push({
      amount: leaderStrength(loseSide.faction, loseSide.plan.leader),
      for: loseSide.plan.leader,
    })
  }
  if (winDead && winSide.plan.leader) {
    winOut.spice.push({
      amount: leaderStrength(winSide.faction, winSide.plan.leader),
      for: winSide.plan.leader,
    })
  }

  return finish(winSide.faction, false, [])
}

/**
 * Which of a side's forces leave for the tanks: everything in the slice for a
 * loser, the dial for a winner — plain before starred, cells in sector order.
 * Returns per-cell lifts the caller applies with liftForces/bankDead.
 */
export function battleLosses(
  forces: readonly Force[], faction: FactionId,
  territoryId: string, sectors: readonly string[],
  outcome: Pick<SideOutcome, 'losesAll' | 'losses'>,
): { sector: SectorId; count: number; starred: number }[] {
  const mine = forces
    .filter(f => f.faction === faction && f.territoryId === territoryId
      && sectors.includes(f.sector) && f.count > 0)
    .sort((x, y) => num(x.sector) - num(y.sector))
  if (outcome.losesAll) {
    return mine.map(f => ({
      sector: f.sector as SectorId, count: f.count,
      starred: Math.min(f.count, f.starred ?? 0),
    }))
  }
  let left = outcome.losses
  const out: { sector: SectorId; count: number; starred: number }[] = []
  // plain first, then the elites, cell by cell
  for (const pass of ['plain', 'starred'] as const) {
    for (const f of mine) {
      if (left <= 0) break
      const starredHere = Math.min(f.count, f.starred ?? 0)
      const pool = pass === 'plain' ? f.count - starredHere : starredHere
      const take = Math.min(pool, left)
      if (take <= 0) continue
      left -= take
      const prior = out.find(o => o.sector === f.sector)
      if (prior) {
        prior.count += take
        if (pass === 'starred') prior.starred += take
      } else {
        out.push({ sector: f.sector as SectorId, count: take, starred: pass === 'starred' ? take : 0 })
      }
    }
  }
  return out
}
