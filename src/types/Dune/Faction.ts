/**
 * What a Dune faction is.
 *
 * The shape the six factions are filled in against. Rules text is kept verbatim
 * as description strings — this file decides the fields, not the wording.
 */
import type { TerritoryId } from './Game'

export type FactionId =
  | 'atreides'
  | 'emperor'
  | 'spacing-guild'
  | 'fremen'
  | 'harkonnen'
  | 'bene-gesserit'

export interface Leader {
  name: string
  /** Battle strength. A number, so it can be added to a battle plan. */
  strength: number
}

/**
 * Where a faction's on-planet forces begin.
 *
 * Discriminated because the three cases are genuinely different jobs for setup:
 * one places pieces, one asks the player a question, one does nothing. Collapsing
 * them into an optional territory plus an optional list would leave every reader
 * working out which combination means what.
 */
export type StartingPlacement =
  /** All of them in one named territory — Atreides in Arrakeen. */
  | { kind: 'fixed'; territoryId: TerritoryId }
  /**
   * The player distributes `onPlanet` freely across these, in whatever split
   * they choose. A SETUP CHOICE, not a fixed division: the Fremen's ten may go
   * ten-nil-nil or four-three-three.
   */
  | { kind: 'distribute'; among: readonly TerritoryId[] }
  /** Nothing on the board at setup. */
  | { kind: 'reserve-only' }

export interface StartingForces {
  /** Already on the board at setup. Zero for factions that start in reserve. */
  onPlanet: number
  /** How those forces get onto the board. */
  placement: StartingPlacement
  /** Off-board, available to ship. */
  reserves: number
  /**
   * Elite forces — the Emperor's Sardaukar, the Fremen's Fedaykin.
   *
   * Counted as a SUBSET of the totals above, not in addition to them: five
   * starred out of twenty reserves means twenty forces, of which five are elite.
   * Still worth confirming against the rulebook before setup deals pieces from
   * it, because the alternative reading is equally sayable in English.
   */
  starred: number
}

/**
 * Faction powers, keyed by the phase they apply in.
 *
 * All optional: most factions do not have one in every phase, and an absent key
 * says so more plainly than an empty string.
 */
export interface FactionAbilities {
  /** Applies before play begins — a prediction made at faction selection, or a
   *  placement that happens during setup rather than in a phase. */
  beforeGame?: string
  storm?: string
  spiceBlow?: string
  /** Shai-Hulud specifically, which is part of the spice blow but reads as its
   *  own rule for the factions that care about worms. */
  shaiHulud?: string
  charity?: string
  bidding?: string
  revival?: string
  shipment?: string
  movement?: string
  battle?: string
  spiceCollection?: string
  /** Powers over the traitor deck, which is dealt outside the phase sequence. */
  traitors?: string
  /** Powers over the treachery deck and hand limits, distinct from bidding. */
  treachery?: string
}

/**
 * Advanced-game rules.
 *
 * Extends the phase keys because some factions present theirs that way — the
 * Fremen have separate storm, spice blow and shipment entries — while others are
 * a single paragraph, which goes in `general`. Both shapes are the rulebook's,
 * not a choice made here.
 */
export interface AdvancedRules extends FactionAbilities {
  /** For factions whose advanced rules are one block of prose. */
  general?: string
  /**
   * The Kwisatz Haderach, which is the Atreides' whole advanced game.
   *
   * ITS OWN KEY rather than a paragraph in `general`, because the card that
   * shows these labels each entry with the key it came from, and GENERAL says
   * nothing. A named rule labels itself.
   */
  kwisatzHaderach?: string
  /** Rules about the forces themselves, such as what an elite force is worth. */
  forces?: string
  /** Bene Gesserit forces have two modes; each needs its own rules text. */
  advisors?: string
  fighters?: string
  /** Harkonnen keep or sell the leaders they defeat. */
  capturedLeaders?: string
  /**
   * This faction's own Karama power, in the advanced game.
   *
   * A Karama card can already stop an opponent using one of their advantages.
   * The advanced game adds a second, alternative use: spend it instead on your
   * OWN faction's one-time power. Either, not both, and the card is discarded.
   *
   * Absent for the Bene Gesserit, who have nothing to SPEND a Karama on. Not a
   * statement that the card does nothing for them: their worthless cards are
   * playable AS Karamas, which is a different rule and lives in
   * `advanced.treachery`.
   */
  karama?: string
}

/**
 * Where a faction's reserves sit when they are not on the board.
 *
 * Five factions keep theirs off planet and ship them in. The Fremen's are
 * already on Arrakis, and that single difference drives two separate rules in
 * the shipment phase:
 *
 *   Cost. Shipping from off planet is paid for; the Fremen are not shipping, so
 *   they pay nothing. Their ability text carries the restriction that comes with
 *   it — the Great Flat, or within two territories of it — which is a limit on
 *   WHERE, not a discount on what it costs.
 *
 *   Income. The Guild is paid by factions shipping "from their off-planet
 *   reserves", in the rulebook's own words. The Fremen therefore never pay the
 *   Guild, and the Guild's income is smaller in any game they are in.
 *
 * Held as data rather than read out of the ability prose because the shipment
 * phase has to branch on it twice, and inferring it from wording is the kind of
 * thing that works until someone rephrases a sentence.
 */
export type ReserveLocation = 'off-planet' | 'on-planet'

/**
 * A pointer at one of a faction's own rules.
 *
 * The group has to be named, not just the key. The Bene Gesserit carry TWO
 * `beforeGame` entries — the secret prediction under `abilities`, the advisor
 * placement under `advanced` — so a bare key identifies neither of them.
 *
 * These are the closest thing to ability ids the data has. When abilities stop
 * being prose keyed by phase, this is what becomes a real id.
 */
export type FactionRuleRef =
  | 'specialVictory'
  | `abilities.${keyof FactionAbilities & string}`
  | `advanced.${keyof AdvancedRules & string}`

/** One thing a Karama may stop: what it reads as, and whether it bites. */
export interface KaramaStop {
  stops: string
  /** A check exists where this rule fires. False means it cannot be offered. */
  enforced: boolean
}

export interface Faction {
  id: FactionId
  /** As shown to players. */
  name: string
  /** Spice held at setup. Hidden from other players once the game starts. */
  startingSpice: number
  forces: StartingForces
  /**
   * Where the reserves are held. See ReserveLocation — it decides both what
   * shipment costs this faction and whether the Guild is paid for it.
   *
   * Not optional. A faction added without it should fail to compile rather than
   * default to the common case and quietly ship the Fremen for money.
   */
  reservesHeld: ReserveLocation
  /**
   * How many treachery cards this faction may hold.
   *
   * Four for everyone, eight for the Harkonnen. DATA, not prose: the rule is
   * load-bearing in bidding — a faction at its limit MUST pass, which changes
   * who opens a card and who may raise — and reading it out of
   * `abilities.treachery` at that point would mean parsing an English sentence
   * inside an auction. Same argument as reservesHeld above.
   *
   * Not optional, for the same reason: a faction added without one should fail
   * to compile rather than default to four and quietly cap the Harkonnen.
   */
  handLimit: number
  /**
   * Treachery cards dealt to this faction at setup, and kept.
   *
   * One for everyone, TWO for the Harkonnen — their own card says so, in the
   * same sentence as their hand limit. DATA for the same reason handLimit is:
   * the first auction is played by six people who are already holding a card,
   * so the number decides who can afford to pass and who is one card off their
   * limit before a single bid. Deriving it from `abilities.treachery` would
   * mean reading an English sentence while dealing.
   *
   * Not optional: a faction added without one should fail to compile rather
   * than default to one and quietly deal the Harkonnen short.
   */
  startingTreachery: number
  /** Forces revived free each Revival phase, before paying for more. */
  freeRevivals: number
  abilities: FactionAbilities
  /** What this faction can do for an ally. */
  alliance: string
  advanced: AdvancedRules
  /** Only some factions have one — the Fremen and the Guild. */
  specialVictory?: string
  /**
   * What a Karama card can never switch off.
   *
   * Karama stops a faction using one of its advantages, with one exception: it
   * cannot stop a win condition. Rather than that exception living as a list
   * beside the suppression check — where it would be a second place to forget —
   * each faction states which of its own rules are out of reach, and the check
   * reads it. See canKaramaStop.
   *
   * Not optional. A faction added without it should fail to compile rather than
   * default to "everything I do can be stopped", which is the wrong answer for
   * any faction that wins its own way.
   *
   * Three entries exist across the six, and they are the three win conditions.
   * Two are `specialVictory`; the Bene Gesserit's is their prediction, which
   * sits in `abilities.beforeGame` rather than in the field named for victories.
   * That asymmetry is in the prose, not here: their paragraph describes making
   * the prediction AND winning by it, and splitting it would be a rules edit
   * rather than a tidy-up.
   */
  unsuppressable: readonly FactionRuleRef[]
  /**
   * WHAT A KARAMA MAY STOP, and how it reads when somebody is choosing.
   *
   * A CURATED LIST, not a by-product. The offer used to be "every rule with
   * prose, minus the win conditions", which produced a menu full of things
   * that cannot be stopped at all: what a faction was dealt at the start of
   * the game, how many cards their hand may hold, another faction's own
   * Karama. A Karama interrupts something happening, so the list is the
   * things that HAPPEN, chosen one at a time.
   *
   * AND IT IS NOT THE RULES CARD. The prose in `abilities` and `advanced` is
   * what a player reads on their own card and it stays whole; these are the
   * short lines the Karama panel offers, naming the moment being cancelled
   * and nothing else. A rule missing from here cannot be Karama'd, which is
   * the point — absence is the decision.
   * `enforced` says whether a check actually exists at the moment the rule
   * fires. It is NOT decoration: an entry that is offered without one takes
   * the card, discards it publicly, announces the stop to the table — and
   * the advantage goes on working, which is worse than refusing, because a
   * refusal at least leaves the player holding their card. So the menu shows
   * only what is enforced, and karamatest holds every flag to the source: a
   * true with no check fails, and a check with no true fails.
   */
  karamaStops: Readonly<Partial<Record<FactionRuleRef, KaramaStop>>>
  leaders: Leader[]
}
