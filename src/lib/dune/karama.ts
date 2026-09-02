/**
 * Karama: the proactive half.
 *
 * A Karama card can be spent two ways. It can STOP an opponent using one of
 * their advantages, at the moment they try — that half is not built, and the
 * plan for it is docs/dune-karama-suppression.md. Or its owner can spend it on
 * something of their own choosing, which is this file.
 *
 * Playing it is one decision made once: the options are laid out, one is taken,
 * the effect happens, the card is discarded. There is no window and nobody to
 * wait for, so this is a plain function rather than a phase step — the pausing
 * machinery in ./phase.ts belongs to the half that interrupts.
 *
 * WHAT ACTUALLY RESOLVES HERE. One option of the seven: the Fremen worm, which
 * resolves because the spice blow already knows how a worm eats. The other six
 * need bidding, shipment, revival, battle plans or hands, none of which exist.
 * They are not silently dropped — playing one returns a `pending` description of
 * what is owed, and the card still leaves the hand, because a Karama spent on a
 * phase that has not been written is still spent. `resolvable` on the option
 * says which is which, so a menu can show it rather than a player discovering it
 * after the card is gone.
 */
import { DUNE_TERRITORIES } from '@/data/dune/boardData'
import { TREACHERY_CARDS } from '@/data/dune/treachery'
import { FACTIONS } from '@/data/dune/factions'
import { devourTerritory } from './spiceBlow'
import type { Devoured } from './spiceBlow'
import type { FactionId } from '@/types/Dune/Faction'
import type { TreacheryCard } from '@/types/Dune/Treachery'
import type { Force, GameMode, GamePhase, TerritoryId } from '@/types/Dune/Game'
import { DUNE_PHASES } from '@/types/Dune/Game'
import type { FactionRuleRef } from '@/types/Dune/Faction'
import { canKaramaStop } from '@/data/dune/factions'

/**
 * The seven things a Karama can buy.
 *
 * Two are open to everyone and print on the card itself. Five are a faction's
 * own, exist only in the advanced game, and are the alternative to cancelling —
 * either use, not both.
 */
export type KaramaUseId =
  | 'guild-rate-shipment'
  | 'free-treachery-card'
  | 'atreides-see-battle-plan'
  | 'emperor-free-revival'
  | 'fremen-place-worm'
  | 'guild-stop-shipment'
  | 'harkonnen-take-cards'

/** Which faction's own power each id belongs to. The two basic uses are open to
 *  anyone and are absent from this map. */
const OWNER: Partial<Record<KaramaUseId, FactionId>> = {
  'atreides-see-battle-plan': 'atreides',
  'emperor-free-revival': 'emperor',
  'fremen-place-worm': 'fremen',
  'guild-stop-shipment': 'spacing-guild',
  'harkonnen-take-cards': 'harkonnen',
}

export interface KaramaOption {
  id: KaramaUseId
  label: string
  /**
   * The rules text this option comes from, verbatim.
   *
   * Read from the faction data for a faction power rather than repeated here,
   * so a menu cannot show one thing while the rules say another.
   */
  text: string
  /**
   * Whether playing it finishes here.
   *
   * False means the phase that would carry it out is unbuilt, and playing it
   * records what is owed instead. A build-state fact rather than a rule, and it
   * turns true as phases land.
   */
  resolvable: boolean
}

/** The two on the card, open to every faction in both games. */
const BASIC: readonly Omit<KaramaOption, 'resolvable'>[] = [
  {
    id: 'guild-rate-shipment',
    label: 'Ship at Guild rates',
    text: 'Purchase a shipment of forces onto the planet at Guild rates (1/2 normal) not paid to'
      + ' the Spacing Guild.',
  },
  {
    id: 'free-treachery-card',
    label: 'Take a Treachery Card free',
    text: 'Purchase a Treachery Card without paying spice for it.',
  },
]

const LABELS: Record<string, string> = {
  'atreides-see-battle-plan': "Look at a player's Battle Plan",
  'emperor-free-revival': 'Revive free',
  'fremen-place-worm': 'Place a sandworm',
  'guild-stop-shipment': 'Stop an off-planet shipment',
  'harkonnen-take-cards': 'Take cards from a hand',
}

/** Every phase a use needs now exists — the whole menu resolves. */
const RESOLVABLE: readonly KaramaUseId[] = [
  'guild-rate-shipment', 'free-treachery-card', 'atreides-see-battle-plan',
  'emperor-free-revival', 'fremen-place-worm', 'guild-stop-shipment',
  'harkonnen-take-cards',
]

/**
 * What this faction may spend a Karama on.
 *
 * The two basic uses always; its own power as well, in the advanced game. The
 * Bene Gesserit get two rather than three because they have nothing of their own
 * to SPEND a Karama on — which is not the same as the card doing nothing for
 * them. See isKaramaFor: their worthless cards ARE Karamas.
 */
export function karamaOptions(faction: FactionId, mode: GameMode): KaramaOption[] {
  const options: KaramaOption[] = BASIC.map(o => ({ ...o, resolvable: RESOLVABLE.includes(o.id) }))

  if (mode !== 'advanced') return options
  const own = (Object.keys(OWNER) as KaramaUseId[]).find(id => OWNER[id] === faction)
  // The text comes from the faction, not from a copy here: one source, so a
  // menu cannot describe a power differently from the rules that grant it.
  const text = FACTIONS[faction]?.advanced.karama
  if (own && text) {
    options.push({ id: own, label: LABELS[own], text, resolvable: RESOLVABLE.includes(own) })
  }
  return options
}

/** The choice a player made, with whatever it needs to be carried out. */
export type KaramaUse =
  | { id: 'guild-rate-shipment' }
  | { id: 'free-treachery-card' }
  | { id: 'atreides-see-battle-plan'; target: FactionId }
  | { id: 'emperor-free-revival'; revive: 'leader' | 'forces'; forces?: number }
  | { id: 'fremen-place-worm'; territoryId: TerritoryId }
  | { id: 'guild-stop-shipment'; target: FactionId }
  | { id: 'harkonnen-take-cards'; target: FactionId; count: number }

/** What a resolved effect did. Only the worm has one so far. */
export interface WormPlaced {
  kind: 'worm-placed'
  devoured: Devoured
  spiceOnBoard: Record<string, number>
  toTanks: Force[]
}

export interface KaramaOutcome {
  use: KaramaUse
  /**
   * Always true. The card is spent whichever way it went, including on an
   * effect nothing can carry out yet — a Karama played into an unbuilt phase is
   * still a Karama played.
   */
  discarded: true
  /** Set when the effect happened here. */
  resolved: WormPlaced | null
  /** Set when it did not, describing what is owed and what is missing. */
  pending: string | null
}

const PENDING: Record<KaramaUseId, string> = {
  'guild-rate-shipment': 'a shipment at half rate, paid to the bank rather than the Guild — needs the shipment phase',
  'free-treachery-card': 'one treachery card at no cost — needs bidding',
  'atreides-see-battle-plan': "sight of one player's whole battle plan — needs battle plans",
  'emperor-free-revival': 'a free revival of up to three forces or one leader — needs the revival phase',
  'fremen-place-worm': '',
  'guild-stop-shipment': "one player's off-planet shipment stopped — needs the shipment phase",
  'harkonnen-take-cards': 'cards taken blind from a hand, one given back for each — needs hidden hands',
}

/**
 * Spend the card.
 *
 * Refuses a use the faction may not make rather than resolving it quietly: a
 * faction power belongs to one faction and exists only in the advanced game, and
 * a menu that offered otherwise would be a bug worth hearing about.
 */
export function playKarama(input: {
  faction: FactionId
  mode: GameMode
  use: KaramaUse
  /** For the worm. Ignored by every other use. */
  forces?: readonly Force[]
  spiceOnBoard?: Readonly<Record<string, number>>
  /** The Fremen's shielded ally — a Karama worm is a normal worm, and a
   *  normal worm spares whom the Fremen protect. */
  spared?: FactionId | null
}): KaramaOutcome {
  const { faction, mode, use } = input

  const allowed = karamaOptions(faction, mode).some(o => o.id === use.id)
  if (!allowed) {
    const owner = OWNER[use.id]
    throw new Error(
      owner && owner !== faction
        ? `${use.id} is the ${owner} power; ${faction} cannot play it`
        : owner
          ? `${use.id} is an advanced power and this is the ${mode} game`
          : `${faction} cannot play ${use.id}`,
    )
  }

  if (use.id === 'fremen-place-worm') {
    const t = DUNE_TERRITORIES.find(x => x.id === use.territoryId)
    if (!t) throw new Error(`no such territory to place a worm in: ${use.territoryId}`)
    // "any sand territory that you wish" — the card says sand, so rock, the
    // strongholds and the Polar Sink are not on offer.
    if (t.terrain !== 'sand') {
      throw new Error(`a Karama worm goes in sand; ${t.displayName} is ${t.terrain}`)
    }
    // "treated as a normal sandworm", so it eats by exactly the rule a worm off
    // the deck eats by — the Fremen's own forces included, which is to say
    // spared. Shared with the spice blow rather than restated.
    const spice = input.spiceOnBoard ?? {}
    const devoured = devourTerritory(
      use.territoryId, input.forces ?? [], spice, input.spared)
    const after = { ...spice }
    delete after[use.territoryId]
    return {
      use,
      discarded: true,
      resolved: { kind: 'worm-placed', devoured, spiceOnBoard: after, toTanks: devoured.forcesKilled },
      pending: null,
    }
  }

  return { use, discarded: true, resolved: null, pending: PENDING[use.id] }
}

/**
 * Whether this card can be played as a Karama by this faction.
 *
 * Normally the answer is "only the Karama card". The Bene Gesserit advanced
 * power is the exception: their worthless cards count as Karamas too.
 *
 * Which is a larger power than it first reads. There are two Karama cards in the
 * deck and five worthless ones, so the faction that can play worthless cards as
 * Karamas can hold more of them than everyone else combined — and they are the
 * cards nobody else wants, so they come cheap at auction.
 *
 * Kept apart from karamaOptions on purpose. That answers "what may I spend this
 * on"; this answers "is this a Karama at all". The Bene Gesserit changed the
 * second question and not the first, and collapsing the two is what led to their
 * empty options list being read as them gaining nothing from the card.
 */
export function isKaramaFor(faction: FactionId, mode: GameMode, card: TreacheryCard): boolean {
  if (card.id === 'karama') return true
  return mode === 'advanced' && faction === 'bene-gesserit' && card.kind === 'worthless'
}

// ── the reactive half: a named advantage, stopped for one phase ───────────

/** How long the Harkonnen have to hand cards back after taking. */
export const KARAMA_GIVE_SECONDS = 60

/**
 * One suppression: WHOSE advantage, WHICH one, stopped by whom, and the
 * (turn, phase) it is stopped for — "stops the use of that advantage
 * during one game phase", so an entry from any other moment is inert and
 * needs no cleanup write.
 */
export interface Suppression {
  faction: FactionId
  ref: FactionRuleRef
  by: FactionId
  turn: number
  phase: GamePhase
}

/**
 * WHICH PHASE A STOP MAY NAME: this one, or any still to come this turn.
 *
 * A CARD PLAYED AT A TABLE IS PLAYED AHEAD OF THE MOMENT. "Before you ship,
 * Karama" is how it is actually said, and it has to be — some advantages
 * fire in the same breath as the phase begins, with nothing between the two
 * for anybody to answer in. The Guild naming its place in the shipping order
 * is the plainest case: the window opens in the very write that sets the
 * phase, so a stop that could only ever be stamped with the phase already
 * running was a stop that could never once have fired.
 *
 * NOT BACKWARDS, and not into next turn. A phase already past is a moment
 * that cannot be interrupted, and the card stops an advantage "during one
 * game phase" — one, named, in the turn it is spent in.
 */
export function stoppablePhases(current: GamePhase): GamePhase[] {
  const i = DUNE_PHASES.indexOf(current)
  return i < 0 ? [] : DUNE_PHASES.slice(i) as GamePhase[]
}

/** Whether a stop played now may name that phase. */
export function mayStopIn(current: GamePhase, named: GamePhase): boolean {
  return stoppablePhases(current).includes(named)
}

/** Whether this advantage is stopped RIGHT NOW — this turn, this phase. */
export function isSuppressed(
  list: readonly Suppression[] | undefined,
  faction: FactionId, ref: FactionRuleRef,
  turn: number, phase: GamePhase,
): boolean {
  return (list ?? []).some(s => s.faction === faction && s.ref === ref
    && s.turn === turn && s.phase === phase)
}

/**
 * What a stop menu may offer against this faction: every rule of theirs
 * that resolves to text, minus the win conditions the card cannot touch.
 * Enumerated from the faction's own data, so a rule added later is
 * stoppable without touching this file.
 */
export function suppressibleRefs(
  faction: FactionId,
): { ref: FactionRuleRef; text: string }[] {
  const f = FACTIONS[faction]
  if (!f) return []
  // THE CURATED LIST, and nothing else. It used to be every rule with prose
  // minus the win conditions, which offered a menu of things no Karama can
  // touch: what a faction was dealt at the start of the game, how large a
  // hand it may hold, another faction's own Karama. A card that interrupts
  // can only interrupt something happening — see Faction.karamaStops, where
  // absence is the decision.
  //
  // canKaramaStop still guards the win conditions, so a rule has to be both
  // listed here AND stoppable: two independent reasons, and either one says
  // no on its own.
  // AND ONLY WHAT THE GAME CAN ACTUALLY DELIVER. An unenforced stop is not
  // a stop that quietly does nothing — it takes the card, discards it where
  // the table can see, announces itself in gold along the bottom of the
  // board, and then the advantage happens anyway. A player who is refused
  // keeps their card and knows where they stand; a player who is told it
  // worked has been lied to and paid for it. So an entry with no check at
  // its firing site is not offered at all until the check exists.
  return Object.entries(f.karamaStops).flatMap(([ref, stop]) =>
    stop && stop.enforced && stop.stops && canKaramaStop(f, ref as FactionRuleRef)
      ? [{ ref: ref as FactionRuleRef, text: stop.stops }]
      : [])
}

/** Whether this CARD ID may be spent as a Karama by this faction — the
 *  id-shaped door the server checks a payload against. */
export function isKaramaCardId(
  faction: FactionId, mode: GameMode, cardId: string,
): boolean {
  const card = TREACHERY_CARDS.find(c => c.id === cardId)
  return !!card && isKaramaFor(faction, mode, card)
}

/** A use's permission, as a refusal code rather than a throw — the server's
 *  door, where a bad payload is a response and never an exception. */
export function karamaAllowed(
  faction: FactionId, mode: GameMode, useId: KaramaUseId,
): 'not-your-power' | 'advanced-only' | null {
  if (karamaOptions(faction, mode).some(o => o.id === useId)) return null
  const owner = OWNER[useId]
  if (owner && owner !== faction) return 'not-your-power'
  return 'advanced-only'
}
