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
 * Three colours were specified for four kinds. `worthless` takes the special
 * green, on the grounds that it is not a weapon and not a defence — but it is
 * the one that was not chosen deliberately, so it is the one to change.
 *
 * The header carries BLACK text, which is why the green is the darker one: at
 * the lighter shade it was 3.4:1 against cream and is 2.9:1 against black here.
 * Neither is generous; this is the shade that was asked for.
 */
export const TREACHERY_HEADER: Record<TreacheryKind, string> = {
  weapon: '#a33a32',
  defense: '#2f6fb5',
  special: '#1e5c34',
  worthless: '#1e5c34',
}
