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
import { factionById, FACTION_IDS } from '@/data/dune/factions'
import type { FactionId } from '@/types/Dune/Faction'
import type { Force, SectorId } from '@/types/Dune/Game'
import { KWISATZ_STRENGTH } from '@/types/Dune/Game'
export { KWISATZ_HADERACH, KWISATZ_STRENGTH, kwisatzHaderachAvailable } from '@/types/Dune/Game'

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

/** The Bene Gesserit's window to speak, before their opponent may commit. */
export const BATTLE_VOICE_SECONDS = 60
/** The Atreides' question, after the opponent commits, before the reveal. */
export const BATTLE_PRESCIENCE_SECONDS = 60
/** ADVANCED: the winner's window to choose which pieces die. */
export const BATTLE_ALLOCATE_SECONDS = 120
/** ADVANCED: the Harkonnen's window to deal with their prisoner. */
export const BATTLE_CAPTURE_SECONDS = 60

// ── the Voice ─────────────────────────────────────────────────────────────

/** What the Voice may name: a weapon class, a defence, a worthless card, or
 *  the Cheap Hero — the sheet's own list, nothing else. */
export type VoiceTarget =
  | 'projectile' | 'poison' | 'lasgun' | 'shield' | 'snooper'
  | 'worthless' | 'cheap-hero'
export interface VoiceCommand { mode: 'play' | 'not-play'; target: VoiceTarget }

export const VOICE_TARGETS: readonly VoiceTarget[] = [
  'projectile', 'poison', 'lasgun', 'shield', 'snooper', 'worthless', 'cheap-hero',
]

/** Whether one card answers a Voice target. */
function cardMatches(id: string, target: VoiceTarget): boolean {
  const c = card(id)
  if (!c) return false
  if (target === 'worthless') return c.kind === 'worthless'
  if (target === 'shield') return c.kind === 'defense' && c.subtype === 'projectile'
  if (target === 'snooper') return c.kind === 'defense' && c.subtype === 'poison'
  return c.kind === 'weapon' && c.subtype === target
}

/** Whether a PLAN plays the named thing, in any slot it could ride. */
export function planPlaysTarget(plan: BattlePlan, target: VoiceTarget): boolean {
  if (target === 'cheap-hero') return !!plan.cheapHero
  return [plan.weapon, plan.defence].some(id => !!id && cardMatches(id, target))
}

/**
 * Whether this hand COULD obey a 'play' command at all. "If they can't
 * comply, they may do as they wish" — and playing any card needs a leader
 * or the Cheap Hero to carry it, so a seat with neither is beyond every
 * 'play' command's reach.
 */
export function canComplyWithVoice(
  command: VoiceCommand, hand: readonly string[], canFieldLeader: boolean,
): boolean {
  if (command.mode === 'not-play') return true   // refusing is always possible
  if (command.target === 'cheap-hero') return hand.includes(CHEAP_HERO_ID)
  if (!canFieldLeader) return false
  return hand.some(id => cardMatches(id, command.target))
}

/**
 * Whether a plan defies the Voice — ONE law, used by the judge to refuse
 * and by the plan form to guide, so the form can never bless what the
 * server will strike down. Null means the plan stands.
 */
export function voiceViolation(
  plan: BattlePlan, command: VoiceCommand,
  hand: readonly string[], canFieldLeader: boolean,
): 'voice-demands' | 'voice-forbids' | null {
  const plays = planPlaysTarget(plan, command.target)
  if (command.mode === 'not-play' && plays) return 'voice-forbids'
  if (command.mode === 'play' && !plays
    && canComplyWithVoice(command, hand, canFieldLeader)) return 'voice-demands'
  return null
}

/** Whether one held card answers the Voice's target — for a form greying
 *  out what a 'not-play' forbids. */
export function voiceCardMatches(id: string, target: VoiceTarget): boolean {
  return cardMatches(id, target)
}

/** A Voice command's own shape, judged before it is spoken. */
export function judgeVoiceCommand(input: unknown): input is VoiceCommand {
  const c = input as { mode?: unknown; target?: unknown }
  return (c?.mode === 'play' || c?.mode === 'not-play')
    && VOICE_TARGETS.includes(c?.target as VoiceTarget)
}

// ── the prescience ────────────────────────────────────────────────────────

/** The four things the Atreides may ask after the opponent commits. One
 *  question only — a "none is played" answer is the answer, never a
 *  do-over. */
export type PrescienceAsk = 'weapon' | 'defence' | 'leader' | 'dial'
export const PRESCIENCE_ASKS: readonly PrescienceAsk[] = [
  'weapon', 'defence', 'leader', 'dial',
]

/** The answer, read off the committed plan — truthful by construction. */
export function prescienceAnswer(
  plan: BattlePlan, ask: PrescienceAsk,
): string | number {
  if (ask === 'dial') return plan.dial
  if (ask === 'weapon') return plan.weapon ?? 'none'
  if (ask === 'defence') return plan.defence ?? 'none'
  return plan.leader ?? (plan.cheapHero ? 'cheap-hero' : 'none')
}

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
  forces: readonly Force[], storm: SectorId, advisorsFight = false,
): PendingBattle[] {
  const out: PendingBattle[] = []
  for (const t of DUNE_TERRITORIES) {
    if (t.terrain === 'polar-sink') continue
    // ADVISORS DO NOT FIGHT: no battle opens over a watcher, and a
    // territory of one advisor and one army holds no fight at all.
    //
    // UNLESS A KARAMA HAS SAID OTHERWISE. Sitting in somebody else's ground
    // without a fight is the advantage; stopped, the robes are no protection
    // and the watchers are just forces standing where they should not be.
    const occupied = forces.filter(f => f.territoryId === t.id && f.count > 0
      && (advisorsFight || f.posture !== 'advisor'))
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
  /**
   * ADVANCED: spice spent to support the dial — one per full-strength
   * piece. Hidden with the plan until the reveal; it leaves for the bank
   * win or lose, except a traitor-calling winner, who spends nothing.
   */
  spice?: number
  /** Card ids out of the hand. */
  weapon?: string
  defence?: string
  /**
   * ADVANCED, Atreides: the Kwisatz Haderach rides this plan's leader or
   * Cheap Hero for +2 — one territory per turn, powerless if its carrier
   * dies, killable only by the lasgun-shield explosion.
   */
  kwisatz?: boolean
}

export type PlanRefusal =
  | 'not-in-this-battle' | 'dial-out-of-range' | 'no-such-leader'
  | 'leader-in-the-tanks' | 'leader-fights-elsewhere' | 'two-leaders'
  | 'card-not-held' | 'not-a-weapon' | 'not-a-defence'
  | 'no-leader-no-cards' | 'one-card-twice'
  | 'voice-demands' | 'voice-forbids'
  | 'spice-out-of-range' | 'more-spice-than-you-hold' | 'spice-is-advanced'
  | 'fremen-need-no-spice' | 'dial-spice-mismatch'
  | 'kwisatz-not-yours' | 'kwisatz-is-advanced' | 'kwisatz-asleep'
  | 'kwisatz-in-the-tanks' | 'kwisatz-elsewhere' | 'kwisatz-alone'

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
  /** The Voice standing over this plan, when the Bene Gesserit spoke. */
  voiced?: VoiceCommand | null
  /** 'advanced' turns on spice-supported strength; absent means basic. */
  mode?: 'basic' | 'advanced'
  /** The other combatant — the Sardaukar's worth depends on who they face. */
  opponent?: FactionId
  /** The planner's purse, when the caller can see it: spice is capped by it. */
  purse?: number
  /** ADVANCED, Atreides: the Kwisatz Haderach's state, as the caller knows
   *  it — awake at seven losses, dead in the tanks, or already ridden into
   *  one territory this turn. */
  kwisatz?: { available: boolean; dead: boolean; usedTerritory?: string | null }
  /**
   * Faction advantages a Karama has stopped for this battle.
   *
   * PASSED IN, NOT LOOKED UP: this judges a plan and has no business
   * reading match state. The endpoint asks isSuppressed at the moment the
   * plan arrives and hands the answers down — see the KARAMA-STOP markers
   * in dune-action, which karamatest holds to these two flags.
   */
  stopped?: {
    /** Sardaukar and Fedaykin count as ordinary pieces. */
    elites?: boolean
    /** The Fremen must pay spice for full strength like anybody else. */
    freeFull?: boolean
  }
  /** ADVANCED, Harkonnen: captured leaders this seat may field once. */
  borrowed?: readonly string[]
}): { ok: true } | { ok: false; refusal: PlanRefusal } {
  const { faction, battle, forces, hand, deadLeaders, usedLeaders, plan, voiced, purse } = input

  const strength = forcesInBattle(forces, faction, battle.territoryId, battle.sectors)
  if (strength <= 0) return { ok: false, refusal: 'not-in-this-battle' }
  const spice = plan.spice ?? 0
  if (!Number.isInteger(spice) || spice < 0) {
    return { ok: false, refusal: 'spice-out-of-range' }
  }
  if ((input.mode ?? 'basic') === 'advanced') {
    // ── ADVANCED: the dial is STRENGTH and must be PAYABLE ────────────────
    // Spice sits on exactly the full-strength pieces, the rest count half;
    // elites are double (the Sardaukar single against the Fremen); the
    // Fremen count full for free. A dial-and-spice pair no set of pieces
    // can pay is refused here by the same law the winner's choice obeys.
    if (purse != null && spice > purse) {
      return { ok: false, refusal: 'more-spice-than-you-hold' }
    }
    if (fullWithoutSpice(faction, input.stopped?.freeFull) && spice > 0) {
      return { ok: false, refusal: 'fremen-need-no-spice' }
    }
    const pieces = piecesInBattle(forces, faction, battle.territoryId, battle.sectors)
    const worth = eliteWorth(faction, input.opponent ?? faction, input.stopped?.elites)
    if (plan.dial < 0 || plan.dial > battleStrengthCap(pieces, worth)
      || !Number.isInteger(plan.dial * 2)) {
      return { ok: false, refusal: 'dial-out-of-range' }
    }
    if (allocationsFor({
      pieces, dial: plan.dial, spice, worth,
      freeFull: fullWithoutSpice(faction, input.stopped?.freeFull),
    }).length === 0) {
      return { ok: false, refusal: 'dial-spice-mismatch' }
    }
  } else {
    if (spice > 0) return { ok: false, refusal: 'spice-is-advanced' }
    if (!Number.isInteger(plan.dial) || plan.dial < 0 || plan.dial > strength) {
      return { ok: false, refusal: 'dial-out-of-range' }
    }
  }

  // ── THE KWISATZ HADERACH: never alone, one territory a turn ─────────────
  if (plan.kwisatz) {
    if (faction !== 'atreides') return { ok: false, refusal: 'kwisatz-not-yours' }
    if ((input.mode ?? 'basic') !== 'advanced') {
      return { ok: false, refusal: 'kwisatz-is-advanced' }
    }
    if (!input.kwisatz?.available) return { ok: false, refusal: 'kwisatz-asleep' }
    if (input.kwisatz.dead) return { ok: false, refusal: 'kwisatz-in-the-tanks' }
    if (input.kwisatz.usedTerritory
      && input.kwisatz.usedTerritory !== battle.territoryId) {
      return { ok: false, refusal: 'kwisatz-elsewhere' }
    }
    if (!plan.leader && !plan.cheapHero) return { ok: false, refusal: 'kwisatz-alone' }
  }

  if (plan.leader && plan.cheapHero) return { ok: false, refusal: 'two-leaders' }
  if (plan.leader) {
    const sheet = factionById(faction)
    // A CAPTURED leader fights for the Harkonnen once — the borrowed list
    // is the caller's word that this seat holds the prisoner.
    if (!sheet?.leaders.some(l => l.name === plan.leader)
      && !(input.borrowed ?? []).includes(plan.leader)) {
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
    // A WORTHLESS CARD MAY RIDE EITHER SLOT — that is what worthless cards
    // are for, and the Voice can command one be played.
    const kind = card(plan.weapon)?.kind
    if (kind !== 'weapon' && kind !== 'worthless') return { ok: false, refusal: 'not-a-weapon' }
    played.push(plan.weapon)
  }
  if (plan.defence) {
    if (!hand.includes(plan.defence)) return { ok: false, refusal: 'card-not-held' }
    const kind = card(plan.defence)?.kind
    if (kind !== 'defense' && kind !== 'worthless') return { ok: false, refusal: 'not-a-defence' }
    played.push(plan.defence)
  }
  if (new Set(played).size !== played.length) return { ok: false, refusal: 'one-card-twice' }

  // ── the Voice stands over the plan ──────────────────────────────────────
  // A command that CAN be obeyed MUST be: forbidding is always obeyable, and
  // demanding binds exactly when the hand holds the named thing and a leader
  // or hero could carry it. Beyond compliance's reach, the plan is free.
  if (voiced) {
    const sheet = factionById(faction)
    const canFieldLeader = !!plan.leader || !!plan.cheapHero
      || (sheet?.leaders ?? []).some(l =>
        !deadLeaders.includes(l.name)
        && (!usedLeaders[l.name] || usedLeaders[l.name] === battle.territoryId))
      || (input.borrowed ?? []).length > 0
      || hand.includes(CHEAP_HERO_ID)
    const violation = voiceViolation(plan, voiced, hand, canFieldLeader)
    if (violation) return { ok: false, refusal: violation }
  }

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
  /** ADVANCED: the plan's spent spice, leaving for the bank — win or lose,
   *  except a traitor-calling winner, who spends nothing. */
  spends: number
  /** ADVANCED: the Kwisatz Haderach dies here — the lasgun-shield explosion
   *  is the ONLY thing that kills it. */
  kwisatzDies: boolean
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

// A CAPTURED leader fights under the Harkonnen banner at its own strength.
// Names are unique across the sheets, so a miss on the fielding faction's
// sheet falls back to the owner's — a lookup, never a guess.
const leaderStrength = (faction: FactionId, name: string) =>
  factionById(faction)?.leaders.find(l => l.name === name)?.strength
  ?? leaderOwnerStrength(name)

const leaderOwnerStrength = (name: string): number => {
  for (const id of FACTION_IDS) {
    const hit = factionById(id)?.leaders.find(l => l.name === name)
    if (hit) return hit.strength
  }
  return 0
}

/** Which faction's sheet a leader belongs to — where a captured leader's
 *  body goes when it dies fighting for somebody else. */
export function leaderOwner(name: string): FactionId | null {
  for (const id of FACTION_IDS) {
    if (factionById(id)?.leaders.some(l => l.name === name)) return id
  }
  return null
}

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
    discards: [], spice: [], spends: me.plan.spice ?? 0, kwisatzDies: false,
  })
  const a = side(aggressor)
  const d = side(defender)

  const finish = (winner: FactionId | null, explosion: boolean, traitors: FactionId[],
    clearSpice = false): BattleOutcome =>
    ({ winner, explosion, traitors, sides: [a, d], clearSpice })

  // ── traitors cut before everything ──────────────────────────────────────
  // "A leader accompanied by Kwisatz Haderach cannot turn traitor": a call
  // against the guarded plan is VOID here as well as refused at the door.
  const traitors: FactionId[] = [
    ...(aggressor.calledTraitor && !defender.plan.kwisatz ? [aggressor.faction] : []),
    ...(defender.calledTraitor && !aggressor.plan.kwisatz ? [defender.faction] : []),
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
    // "Except when a traitor is revealed, where the winner spends nothing."
    callerOut.spends = 0
    void caller
    return finish(callerOut.faction, false, traitors)
  }

  // ── the lasgun and the shield ───────────────────────────────────────────
  const plans = [aggressor.plan, defender.plan]
  const lasgun = plans.some(p => p.weapon
    && card(p.weapon)?.kind === 'weapon' && card(p.weapon)?.subtype === 'lasgun')
  const shield = plans.some(p => p.defence
    && card(p.defence)?.kind === 'defense' && card(p.defence)?.subtype === 'projectile')
  if (lasgun && shield) {
    for (const [me, mine] of [[aggressor, a], [defender, d]] as const) {
      mine.losesAll = true
      mine.leaderDies = !!me.plan.leader
      mine.discards = playedCards(me.plan)
      mine.kwisatzDies = !!me.plan.kwisatz
    }
    return finish(null, true, [], true)
  }

  // ── weapons against defences ────────────────────────────────────────────
  const killedBy = (attacker: BattlePlan, target: BattlePlan): boolean => {
    if (!attacker.weapon) return false
    // A worthless card in the weapon slot cuts nothing.
    if (card(attacker.weapon)?.kind !== 'weapon') return false
    if (!target.leader && !target.cheapHero) return false
    const kind = card(attacker.weapon)?.subtype
    const guarded = target.defence
      && card(target.defence)?.kind === 'defense'
      && card(target.defence)?.subtype === kind
    return !guarded
  }
  const aLeaderDead = killedBy(defender.plan, aggressor.plan)
  const dLeaderDead = killedBy(aggressor.plan, defender.plan)

  const total = (me: SideInput, dead: boolean) => me.plan.dial
    + (!dead && me.plan.leader ? leaderStrength(me.faction, me.plan.leader) : 0)
    // The Kwisatz Haderach's +2, powerless the moment its carrier dies.
    + (!dead && me.plan.kwisatz && (me.plan.leader || me.plan.cheapHero)
      ? KWISATZ_STRENGTH : 0)
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
  // The Cheap Hero is spent by being played, and so is a worthless card;
  // a real weapon or defence is kept — those cards say "keep if won".
  winOut.discards = [
    ...(winSide.plan.cheapHero ? [CHEAP_HERO_ID] : []),
    ...[winSide.plan.weapon, winSide.plan.defence]
      .filter((id): id is string => !!id && card(id)?.kind === 'worthless'),
  ]

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

// ── advanced combat: spice, elites, and the winner's choice ───────────────

/** The two classes a stack holds: ordinary pieces and starred elites. */
export interface BattlePieces { plain: number; elite: number }

/** A faction's pieces standing in the battle's slice, by class. */
export function piecesInBattle(
  forces: readonly Force[], faction: FactionId,
  territoryId: string, sectors: readonly string[],
): BattlePieces {
  const mine = forces.filter(f => f.faction === faction
    && f.territoryId === territoryId && sectors.includes(f.sector))
  const total = mine.reduce((n, f) => n + f.count, 0)
  const elite = mine.reduce((n, f) => n + Math.min(f.count, f.starred ?? 0), 0)
  return { plain: total - elite, elite }
}

/**
 * What one ELITE is worth in this battle: Fedaykin two against everyone,
 * Sardaukar two — except against the Fremen, where they count as one.
 */
/**
 * What one elite piece is worth, and whether a Karama has taken it.
 *
 * SUPPRESSED, THEY COUNT AS ORDINARY — worth one in battle and one in taking
 * losses, which is the whole of what the advantage gives. The Emperor being
 * worth one against the Fremen is NOT the advantage being stopped; it is the
 * rule that the advantage never applied there in the first place, so it
 * stands whatever a Karama says.
 */
export function eliteWorth(
  faction: FactionId, opponent: FactionId, suppressed = false,
): 1 | 2 {
  if (suppressed) return 1
  return faction === 'emperor' && opponent === 'fremen' ? 1 : 2
}

/** The Fremen never need spice: every piece of theirs counts at full. */
export const fullWithoutSpice = (faction: FactionId, suppressed = false): boolean =>
  faction === 'fremen' && !suppressed

/** One way to pay the dial in dead pieces: how many of each class die at
 *  full strength (a spice on each) and how many at half. */
export interface LossAllocation {
  plainFull: number
  plainHalf: number
  eliteFull: number
  eliteHalf: number
}

/**
 * Every legal allocation for a dial and spice against the pieces standing
 * there: the spent spice sits on exactly the full-strength dead, the rest
 * die at half, and the contributions sum to the dial. This is CONSTRAINT
 * SATISFACTION, not subtraction — the rulebook's Emperor with one Sardaukar
 * and five ordinary, dialling 3 on 1 spice, may lose the Sardaukar full
 * plus two ordinary at half, or one ordinary full plus four at half, and
 * nothing else. Strengths are half-exact, so the arithmetic runs in
 * HALF-UNITS. judgePlan admits a plan only when this is non-empty, and the
 * winner's choice must be a member.
 */
export function allocationsFor(input: {
  pieces: BattlePieces
  dial: number
  spice: number
  worth: 1 | 2
  freeFull: boolean
}): LossAllocation[] {
  const { pieces, dial, spice, worth, freeFull } = input
  const dial2 = Math.round(dial * 2)
  if (dial2 < 0 || Math.abs(dial * 2 - dial2) > 1e-9) return []
  const out: LossAllocation[] = []
  if (freeFull) {
    // Every piece counts full and no spice is spent: integer dials only.
    if (spice !== 0 || dial2 % 2 !== 0) return out
    for (let ef = 0; ef <= pieces.elite; ef++) {
      const pf = dial - ef * worth
      if (Number.isInteger(pf) && pf >= 0 && pf <= pieces.plain) {
        out.push({ plainFull: pf, plainHalf: 0, eliteFull: ef, eliteHalf: 0 })
      }
    }
    return out
  }
  for (let ef = 0; ef <= Math.min(pieces.elite, spice); ef++) {
    const pf = spice - ef
    if (pf > pieces.plain) continue
    for (let eh = 0; eh + ef <= pieces.elite; eh++) {
      // full plain 2, full elite 2·worth, half plain 1, half elite worth
      const ph = dial2 - pf * 2 - ef * 2 * worth - eh * worth
      if (ph < 0 || ph > pieces.plain - pf) continue
      out.push({ plainFull: pf, plainHalf: ph, eliteFull: ef, eliteHalf: eh })
    }
  }
  return out
}

/** Whether the winner's named choice is one of the legal allocations. */
export function judgeAllocation(
  choice: LossAllocation,
  input: Parameters<typeof allocationsFor>[0],
): boolean {
  const whole = (n: unknown) => Number.isInteger(n) && (n as number) >= 0
  if (![choice.plainFull, choice.plainHalf, choice.eliteFull, choice.eliteHalf]
    .every(whole)) return false
  return allocationsFor(input).some(a =>
    a.plainFull === choice.plainFull && a.plainHalf === choice.plainHalf
    && a.eliteFull === choice.eliteFull && a.eliteHalf === choice.eliteHalf)
}

/** The deterministic answer for a window that ran out: the enumeration's
 *  first. Null only for a plan no allocation supports, which judgePlan
 *  already refused. */
export const firstAllocation = (
  input: Parameters<typeof allocationsFor>[0],
): LossAllocation | null => allocationsFor(input)[0] ?? null

/** The wheel's ceiling: every piece counted at full strength. */
export function battleStrengthCap(pieces: BattlePieces, worth: 1 | 2): number {
  return pieces.plain + pieces.elite * worth
}

/** The pieces an allocation sends to the tanks — cells in sector order,
 *  each class drawn separately. */
export function allocationLosses(
  forces: readonly Force[], faction: FactionId,
  territoryId: string, sectors: readonly string[],
  choice: LossAllocation,
): { sector: SectorId; count: number; starred: number }[] {
  const mine = forces
    .filter(f => f.faction === faction && f.territoryId === territoryId
      && sectors.includes(f.sector) && f.count > 0)
    .sort((x, y) => num(x.sector) - num(y.sector))
  let plain = choice.plainFull + choice.plainHalf
  let starred = choice.eliteFull + choice.eliteHalf
  const lifts: { sector: SectorId; count: number; starred: number }[] = []
  for (const f of mine) {
    const cellElite = Math.min(f.count, f.starred ?? 0)
    const takePlain = Math.min(plain, f.count - cellElite)
    const takeElite = Math.min(starred, cellElite)
    plain -= takePlain
    starred -= takeElite
    if (takePlain + takeElite > 0) {
      lifts.push({
        sector: f.sector as SectorId,
        count: takePlain + takeElite, starred: takeElite,
      })
    }
  }
  return lifts
}

// ── the Harkonnen's prisoners ─────────────────────────────────────────────

/**
 * Who the Harkonnen may seize from the loser: every sheet leader still
 * alive, INCLUDING the one that just fought here if it survived, EXCLUDING
 * any used elsewhere this turn and any already in Harkonnen hands. The
 * Kwisatz Haderach is a token, not a leader, and never appears — the pool
 * is drawn from the sheet.
 */
/** "When all of your own leaders have been killed, you must return all
 *  captured leaders immediately": the whole sheet, in the tanks. */
export function allOwnLeadersDead(
  faction: FactionId, tanksLeaders: readonly { name: string }[],
): boolean {
  const dead = new Set(tanksLeaders.map(l => l.name))
  const sheet = factionById(faction)?.leaders ?? []
  return sheet.length > 0 && sheet.every(l => dead.has(l.name))
}

export function capturePool(input: {
  loser: FactionId
  /** The loser's tanks entries — the dead are beyond capture. */
  tanks: readonly { name: string }[]
  usedLeaders: Readonly<Record<string, string>>
  /** The battle just fought — its own survivor is still fair game. */
  territoryId: string
  alreadyCaptured: readonly string[]
}): string[] {
  const dead = new Set(input.tanks.map(l => l.name))
  return (factionById(input.loser)?.leaders ?? [])
    .map(l => l.name)
    .filter(n => !dead.has(n)
      && !input.alreadyCaptured.includes(n)
      && (!input.usedLeaders[n] || input.usedLeaders[n] === input.territoryId))
}

/**
 * The lasgun-and-shield's harvest: EVERY force in the territory, whoever it
 * belongs to. The card reads "all forces, leaders, and spice in this
 * battle's territory" — the TERRITORY, not the two sides — so a bystander
 * faction standing in another sector of it burns with the combatants.
 * Returned per stack for the caller to lift and bank.
 */
export function explosionLosses(
  forces: readonly Force[], territoryId: string,
): { faction: FactionId; sector: SectorId; count: number; starred: number }[] {
  return forces
    .filter(f => f.territoryId === territoryId && f.count > 0)
    .sort((x, y) => x.faction.localeCompare(y.faction) || num(x.sector) - num(y.sector))
    .map(f => ({
      faction: f.faction as FactionId, sector: f.sector as SectorId,
      count: f.count, starred: Math.min(f.count, f.starred ?? 0),
    }))
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

// ── the alliance's interrogators ──────────────────────────────────────────

/**
 * The third seat a battle admits, by alliance card: the Bene Gesserit may
 * Voice an ally's opponent, the Atreides may ask after one's plan, the
 * Harkonnen may turn their traitor cards on one. Named when the faction is
 * SEATED, NOT itself fighting here, and allied to a combatant — and what
 * comes back is the side the power lands on: the ally's opponent.
 */
/**
 * WHICH SEAT A VOICE COMMANDS.
 *
 * NOT "whoever is not the speaker". That reading is right exactly while the
 * Bene Gesserit are fighting the battle themselves — the only other seat IS
 * the target — and wrong the moment their ALLIANCE CARD reaches the Voice in
 * from outside: then the speaker is a third party, both combatants are "not
 * the speaker", and the command lands on the ally as well as the ally's
 * opponent. The panel read it that way and told an allied Spacing Guild it
 * had been commanded to play a Cheap Hero that was aimed at the Emperor.
 *
 * ONE FUNCTION FOR BOTH SIDES. The server judged this correctly off
 * voice.over while the client derived its own answer, which is two laws for
 * one rule and a guarantee they will disagree eventually.
 *
 * The fallback is for battles stamped before `over` was written: inside a
 * fight, the seat that is not the speaker is the one commanded.
 */
export function voiceBinds(
  voice: { by: FactionId; over?: FactionId | null } | null | undefined,
  aggressor: FactionId, defender: FactionId,
): FactionId | null {
  if (!voice) return null
  if (voice.over) return voice.over
  return [aggressor, defender].find(f => f !== voice.by) ?? null
}

export function allyInterrogator(input: {
  faction: FactionId
  aggressor: FactionId
  defender: FactionId
  players: readonly { faction: FactionId; ally?: FactionId | null }[]
}): { ally: FactionId; over: FactionId } | null {
  const { faction, aggressor, defender, players } = input
  if (faction === aggressor || faction === defender) return null
  const ally = players.find(p => p.faction === faction)?.ally ?? null
  if (ally === aggressor) return { ally: aggressor, over: defender }
  if (ally === defender) return { ally: defender, over: aggressor }
  return null
}
