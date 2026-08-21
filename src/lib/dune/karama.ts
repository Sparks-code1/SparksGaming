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
import { FACTIONS } from '@/data/dune/factions'
import { devourTerritory } from './spiceBlow'
import type { Devoured } from './spiceBlow'
import type { FactionId } from '@/types/Dune/Faction'
import type { Force, GameMode, TerritoryId } from '@/types/Dune/Game'

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

/** Only the worm has anywhere to happen yet. */
const RESOLVABLE: readonly KaramaUseId[] = ['fremen-place-worm']

/**
 * What this faction may spend a Karama on.
 *
 * The two basic uses always; its own power as well, in the advanced game. The
 * Bene Gesserit get two options rather than three, and that is the rule — they
 * are the one faction with no Karama power of their own.
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
    const devoured = devourTerritory(use.territoryId, input.forces ?? [], spice)
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
