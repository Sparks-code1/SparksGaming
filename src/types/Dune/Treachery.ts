/**
 * What a treachery card is.
 *
 * The deck players bid for. Most of it is battle equipment — a weapon, a defence
 * — committed face down in a battle plan and revealed together; the rest are one
 * -off effects that fire in a named phase or at any moment.
 *
 * Rules text is kept verbatim, as with the factions. This file decides the
 * fields, not the wording.
 */

/**
 * The four groups, which are also what decides a card's header colour.
 *
 * `worthless` is its own kind rather than a special with a subtype: LA, LA, LA
 * is played in the SLOT of a weapon or defence and does nothing, which is a
 * different thing from a card with an effect, and battle resolution has to be
 * able to tell them apart without reading prose.
 */
export type TreacheryKind = 'weapon' | 'defense' | 'special' | 'worthless'

/**
 * How a weapon kills and what a defence stops.
 *
 * The pairing IS the rule: a defence saves the leader when its class matches the
 * weapon's. Held as a field so battle resolution compares two values instead of
 * matching card names.
 *
 * `lasgun` is deliberately a class of its own with no defence to match it. That
 * asymmetry is the card — nothing protects a leader from it, and a Shield played
 * in the same battle destroys the territory rather than saving anyone.
 */
export type BattleClass = 'projectile' | 'poison' | 'lasgun'

/**
 * When a card may be played.
 *
 * Not decoration: it says which phase has to offer a window for it, and two of
 * these want windows that do not exist yet. See the notes in the data file.
 */
export type TreacheryTiming =
  /** Committed face down in a battle plan and revealed with it. */
  | 'battle-plan'
  /** Any moment, including in the middle of another player's phase. */
  | 'any-time'
  /** During the Storm Phase, BEFORE the storm's movement is rolled — it replaces
   *  the roll rather than reacting to it. */
  /**
   * THE TWO STORM CARDS, at the Mentat Pause, for the storm of the turn
   * AFTER. A DELIBERATE DEPARTURE from the printed timing — see the note on
   * each card — kept as one value because both now sit in the same moment.
   */
  | 'mentat-storm'
  | 'storm-before-roll'
  /** After the storm's movement is known and before the storm moves: the seam
   *  `beginStorm` already opens. */
  | 'storm-after-roll'
  /** During the owner's movement. */
  | 'movement'

export interface TreacheryCard {
  id: string
  name: string
  kind: TreacheryKind
  /**
   * For weapons and defences this is the class that decides the pairing. For
   * everything else it is a loose label for what the card is about, and nothing
   * branches on it.
   */
  subtype: BattleClass | string
  timing: TreacheryTiming
  /** How many of this card are in the deck. */
  copies: number
  /** Verbatim. */
  text: string
  /**
   * Artwork, when there is any.
   *
   * Optional because none exists yet. Absent means "no art yet" and the card
   * falls back to text — which is NOT the same as `textOnly`, below.
   */
  image?: string
  /**
   * A card that is text by design rather than by omission.
   *
   * Karama carries more rules than a picture would leave room for, so it is
   * never getting art. Without this, "no image" would mean both "not drawn yet"
   * and "never will be", and a later pass adding artwork would have no way to
   * tell which cards it had finished.
   */
  textOnly?: true
}

/**
 * The colour a card's header takes, by kind.
 *
 * Derived from the kind rather than stored on each card: a colour written out
 * thirty-three times is thirty-three chances for one of them to disagree with
 * its own kind, and nothing would catch it.
 *
 * Four colours for four kinds. Worthless was green for a while, borrowed from
 * the specials because it is neither a weapon nor a defence; it has its own
 * yellow now, which is the right answer — a worthless card is its own thing and
 * the header is how you tell at a glance.
 *
 * The header carries BLACK text, which is why the green is the darker shade.
 * Worth knowing what each buys against black: yellow 8.8:1, red 4.8:1, blue
 * 4.2:1, green 2.9:1. The green is the weak one and the yellow is far and away
 * the strongest, so the worthless cards will read as the loudest of the four.
 * That is a consequence of the colours chosen rather than a decision in itself.
 */
export const TREACHERY_HEADER: Record<TreacheryKind, string> = {
  weapon: '#a33a32',
  defense: '#2f6fb5',
  special: '#1e5c34',
  worthless: '#d4a017',
}

/**
 * The word for each kind, as it is printed under a card's name.
 *
 * `defense` prints as DEFENSE, which is what the printed cards say: the
 * physical Shield reads "Defense - Projectile" and the Snooper "Defense -
 * Poison". It said SHIELD for a while, on the argument that the card answering
 * a projectile is what a table calls the whole class — but a player holding the
 * Snooper would then be told they hold a Shield, and matching the card in their
 * other hand beats matching the slang.
 *
 * Changing it again is this one line, and thirty-three cards follow. treacherytest
 * pins the seven labels the deck may carry, so it fails the moment one moves —
 * which is the point of pinning them: a wording change should be a decision,
 * not a diff nobody noticed.
 */
export const TREACHERY_KIND_WORD: Record<TreacheryKind, string> = {
  weapon: 'Weapon',
  defense: 'Defense',
  special: 'Special',
  worthless: 'Worthless Card',
}

/**
 * What a card calls itself under its name.
 *
 * DERIVED, NEVER TYPED PER CARD — the same argument as TREACHERY_HEADER above,
 * and it matters more here because this one is words. A subtitle written out
 * thirty-three times is thirty-three chances to label a poison weapon
 * "Projectile", and a player reading that label would play a Shield against
 * it: battle resolution branches on `subtype`, so the label and the rule would
 * disagree with nothing to catch it. Coming off the same two fields the rules
 * read, it cannot.
 *
 * The class is capitalised from the value rather than mapped, so a new
 * BattleClass gets a label without anybody having to remember this file.
 *
 * A CLASS ONLY WHERE A CLASS DECIDES SOMETHING. Weapons and defences pair up
 * by it, so theirs is named. Nothing branches on a special's subtype — see
 * TreacheryCard.subtype — and "Special — Storm" would promise a pairing that
 * does not exist; the worthless cards carry 'none', and "Worthless — None"
 * says nothing twice. Both print the bare word.
 */
export function cardSubtitle(card: Pick<TreacheryCard, 'kind' | 'subtype'>): string {
  const word = TREACHERY_KIND_WORD[card.kind]
  if (card.kind !== 'weapon' && card.kind !== 'defense') return word
  const cls = card.subtype
  if (!cls || cls === 'none') return word
  return `${word} — ${cls.charAt(0).toUpperCase()}${cls.slice(1)}`
}
