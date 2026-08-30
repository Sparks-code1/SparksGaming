import type { FactionId } from './Faction'

/**
 * Dune game state — the beginnings of it.
 *
 * Deliberately small. The shape that matters most is not in here yet (see the
 * note on hidden state at the foot), and inventing fields before the rules that
 * read them is how a type ends up describing a game nobody is building.
 */

/**
 * A storm sector, as `DUNE_SECTORS` in @/data/dune/boardData exports it.
 *
 * A template literal rather than a bare `string` so 'sectr-1' is a compile
 * error, and rather than a bare `number` so it can be compared directly against
 * `TERRITORIES_BY_SECTOR` and every territory's `spiceSector`. The board data
 * keys everything on these ids; a second encoding here would mean converting at
 * each boundary, which is where the two would drift apart.
 */
export type SectorId = `sector-${number}`

/** A territory, as `DUNE_TERRITORIES` exports it. */
export type TerritoryId = `territory-${string}`

/**
 * Which game is being played.
 *
 * NOT a set of extras bolted onto the basic game. The advanced game changes core
 * rules — spice flow, combat, the storm's own range — so a phase cannot resolve
 * correctly without knowing which it is in. That is why mode is a parameter to
 * the phase functions rather than a filter applied to their output: by the time
 * you have an outcome, the wrong rules have already run.
 */
export type GameMode = 'basic' | 'advanced'

/**
 * A stack of forces: whose they are, where they stand, how many.
 *
 * The count is not decoration. Fremen lose HALF their forces to a storm, rounded
 * up, and half of an anonymous list is not a thing you can take — the rule needs
 * a number to halve. Forces were previously `{ territoryId, sector }` with one
 * entry per unit and no owner, which made that rule, worm immunity and worm
 * placement all unsayable rather than merely unimplemented.
 */
/**
 * Whether pieces fight, or merely watch.
 *
 * THE BENE GESSERIT'S, and in the advanced game only. Their opening force is a
 * spiritual advisor: it stands in a territory without fighting for it and
 * without holding it. Alone in a territory it has nothing to advise, so it
 * flips to a fighter — which is why their placement is made AFTER the Fremen's,
 * the last thing at setup that can put somebody else on the board beside them.
 *
 * ABSENT MEANS FIGHTER. Every force in the game up to now is one, and an
 * optional field means no state already written has to be rewritten to say so.
 */
export type ForcePosture = 'fighter' | 'advisor'

export interface Force {
  faction: FactionId
  territoryId: TerritoryId
  /** The sector of that territory — the actual unit of occupancy. */
  sector: SectorId
  count: number
  /**
   * How many of `count` are elite — Fedaykin or Sardaukar. Absent is none.
   *
   * REAL PIECES, not a note on the faction card. The star tokens stand on the
   * board beside the plain ones and the whole table can see which stack the
   * Fedaykin are in, so the board model has to say it too — a count kept only
   * in the faction data cannot answer "where are they", which is a question
   * with battle consequences the moment a storm or a worm picks a sector.
   * Advanced game only; the basic game treats every force as plain and never
   * sets this.
   */
  starred?: number
  /**
   * Fighting, or watching. Absent is fighting.
   *
   * WHAT IS AND IS NOT WIRED. The posture is set at setup and read by
   * strongholdsHeld, which does not count an advisor as holding anything. The
   * rest of the advisor rules — that they take no part in a battle, that they
   * flip when somebody else arrives or leaves, that the Bene Gesserit may send
   * more of them — are not implemented, and a force will keep whatever posture
   * it was given until something is written that changes it.
   */
  posture?: ForcePosture
}

/**
 * The nine phases of a turn, in order.
 *
 * Matches the nine the board draws — see PHASE_SYMBOLS in
 * scripts/build-dune-board.mjs. An 'End of Turn' tenth was dropped: the Mentat
 * Pause IS the end of the turn, and a phase the board has no circle for would
 * eventually be mapped to one anyway, off by one.
 *
 * Strings rather than an enum or an index: they read in logs, survive a JSON
 * round trip, and cannot silently renumber.
 */
export const DUNE_PHASES = [
  'Storm',
  'Spice Blow and Nexus',
  'CHOAM Charity',
  'Bidding',
  'Revival',
  'Shipment and Movement',
  'Battles',
  'Spice Collection',
  'Mentat Pause',
] as const

/**
 * A LIST, with the union read off it, rather than a union and a list beside it.
 *
 * Anything showing all nine in order — the phase strip across the top of the
 * game screen, the board's own nine medallions — needs the sequence, not just
 * the set. Two declarations of one sequence is two places to add the tenth
 * phase, and the one that gets forgotten is always the one nobody imports.
 */
export type GamePhase = typeof DUNE_PHASES[number]

/** In turn order, so `PHASES[0]` starts a turn and the last one ends it. */
export const PHASES: readonly GamePhase[] = [
  'Storm',
  'Spice Blow and Nexus',
  'CHOAM Charity',
  'Bidding',
  'Revival',
  'Shipment and Movement',
  'Battles',
  'Spice Collection',
  'Mentat Pause',
] as const

/**
 * The Shield Wall, which either stands or does not.
 *
 * Public: a treachery card destroys it in front of everybody, and it stays
 * destroyed for the rest of the game. Not a property of the board — the board is
 * generated once and is the same in every match, and this changes mid-game.
 */
export type ShieldWall = 'intact' | 'destroyed'

/**
 * A card in the spice deck.
 *
 * HERE rather than in lib/dune/spiceBlow, which is where it was and where it is
 * still imported from. The public game state has to name it — a discard pile is
 * face up, so it is state everyone can see — and a types module reaching into a
 * lib module for the shape of its own field is backwards. spiceBlow re-exports
 * it, so every existing import still reads the same.
 */
export type SpiceCard =
  | { kind: 'territory'; territoryId: TerritoryId; name: string; spice: number; sector: SectorId }
  | { kind: 'shai-hulud' }

/**
 * The spice deck as everyone may see it.
 *
 * THE COUNT IS PUBLISHED, NOT DERIVED. The deck's ORDER is a secret — it lives
 * in match_decks, which has RLS on and no policy at all, so no client can read
 * it — and `remaining` is the one fact about it that is safe to share. It is
 * written into the shared row by whoever last touched the deck.
 *
 * It must not be reconstructed from the piles either. Cards leave the deck
 * without landing on a discard: worms drawn on turn one are set aside, and an
 * exhausted deck is rebuilt from the discard, which resets both numbers at once.
 * `deckSize - discarded` is wrong on the first turn of the game and wrong again
 * after every reshuffle.
 *
 * The piles themselves are carried whole because they are face up, and because
 * the TOP CARD of each is load-bearing: Shai-Hulud devours the territory showing
 * on the pile it was drawn into. See `showing` in lib/dune/spiceBlow.
 */
export interface SpiceDeckPublic {
  /** Cards still face down. Published by the server; never derived by a client. */
  remaining: number
  /** The discard pile. The only one there is in the basic game. */
  discardA: SpiceCard[]
  /** The second pile. Advanced only — empty, and not drawn, in the basic game. */
  discardB: SpiceCard[]
  /** Which turn the blow was last turned for. Stamped by the server when it
   *  commits a blow; how "has this turn's blow happened" is asked, since the
   *  count alone cannot say. Absent before the first blow. */
  turn?: number
}

/**
 * One seat, as the whole table may see it.
 *
 * EVERY FIELD HERE IS PUBLIC BY RULE, which is the only reason this can sit in
 * the shared row at all. Worth saying field by field, because the neighbouring
 * facts are not:
 *
 *   Forces on the board are pieces standing on Arrakis in front of everybody.
 *   Reserves are counted out in the open too. Both public.
 *
 *   The NUMBER of treachery cards a faction holds is public — you can see the
 *   cards in their hand — and it is load-bearing in bidding, where a faction at
 *   its limit must pass. WHICH cards they are is not, and is not here.
 *
 *   Spice is NOT public and is not here. It is per-seat in match_secrets, and a
 *   count of it in this object would put every purse in the shared row.
 *
 *   Alliances are announced at a Nexus, so who is allied with whom is public.
 */
export interface DunePlayerPublic {
  faction: FactionId
  /** Which of the six printed circles they sit at — 'player-position-N'. */
  seat: string
  /** Off-board forces still to ship. On-planet for the Fremen, but still theirs. */
  reserves: number
  /**
   * How many elite forces — Sardaukar, Fedaykin — wait in reserve, beside the
   * plain `reserves` rather than inside it.
   *
   * PUBLIC, like reserves: at a table the star tokens sit in the open next to
   * the plain ones, and how many elites the Emperor has left to ship is a fact
   * everyone prices shipments against. Advanced game only — the basic game
   * plays every token plain and this key is absent.
   */
  reservesStarred?: number
  /**
   * How many treachery cards they hold. NOT the cards.
   *
   * Published rather than derived, for the same reason the spice deck's count
   * is: the cards live in match_secrets and nothing on this side can count a
   * row it cannot read.
   */
  handCount: number
  /** Their ally, or null. Both halves of a pair name each other. */
  ally: FactionId | null
  /**
   * Atreides forces lost IN BATTLE, for the Kwisatz Haderach.
   *
   * Only meaningful for the Atreides in the advanced game, and absent
   * otherwise. The count is stored; whether he is AVAILABLE is derived from it
   * by `kwisatzHaderachAvailable` — a stored flag is a second copy of the same
   * fact and the two drift.
   */
  battleLosses?: number
}

/** Battle losses that unlock the Kwisatz Haderach. */
export const KWISATZ_HADERACH_AT = 7

/** The token's name where a leader's would stand — in the tanks, in a plan. */
export const KWISATZ_HADERACH = 'Kwisatz Haderach'
/** What it adds to the leader it accompanies, and its revival price. */
export const KWISATZ_STRENGTH = 2

/** Derived, never stored beside the count it comes from. */
export function kwisatzHaderachAvailable(battleLosses: number | undefined): boolean {
  return (battleLosses ?? 0) >= KWISATZ_HADERACH_AT
}

export interface DuneGameState {
  /**
   * Where the storm sits now. `number`, not `18` — a bare literal in a type
   * position IS the type, so `storm: 18` would make 18 the only value the field
   * could ever hold and fail at the first assignment rather than here.
   */
  storm: SectorId
  /** 1–10. A game is ten turns. */
  turn: number
  phase: GamePhase
  /**
   * Whether the Shield Wall still stands.
   *
   * Storm exposure reads this, not the board: while it stands it shelters the
   * Imperial Basin, Arrakeen and Carthag, and once Family Atomics brings it down
   * all three burn — including the two that are strongholds. See
   * SHIELD_WALL_PROTECTS in lib/dune/storm.ts.
   */
  shieldWall: ShieldWall
  /**
   * Which game is being played. Public, and read by nearly every phase — see
   * GameMode. The screen needs it too: the Kwisatz Haderach tracker is an
   * advanced-game thing and must not appear in a basic one.
   */
  mode: GameMode
  /**
   * The spice deck: how much is left, and what is showing on the pile(s).
   *
   * Public on purpose, and safe: no card order, only a count and the face-up
   * discards. See SpiceDeckPublic.
   */
  spiceDeck: SpiceDeckPublic
  /** Everyone at the table, in seat order. */
  players: DunePlayerPublic[]
  /**
   * Forces standing on Arrakis. Public: they are pieces on a board.
   *
   * The board draws them, and the HUD's force and stronghold counts are summed
   * from this rather than stored per seat — a stored total is a second copy of
   * what the board is already showing, and the two disagree the first time a
   * worm eats a stack.
   */
  forces: Force[]
  /** Spice lying in territories, keyed by territory id. Face up on the board. */
  spiceOnBoard: Record<string, number>
  /**
   * Whose table this is, by faction.
   *
   * THE ONE ASYMMETRY IN AN OTHERWISE FLAT GAME. Dune has no first player and
   * no owner — turn order is the storm's and every seat is equal — so this is
   * not a rule of the game. It is a rule about running one: somebody has to
   * decide when the phase moves on, and six people all able to press it is the
   * same standoff as none of them able to.
   *
   * IN THE STATE RATHER THAN ONLY ON THE ROW. matches.created_by already gates
   * writes to the row itself, which is what makes the lobby's mode toggle safe,
   * but the phases will need to know too — and a phase control asking the
   * database who created the match, per press, would be asking a question the
   * board already has the answer to.
   *
   * BY FACTION, because that is how everything else in this state names a seat.
   * Absent for a match dealt before this existed, which is a table with no host
   * rather than a broken one: nothing that reads it may assume it is there.
   */
  host?: FactionId

  /**
   * Which turn the storm last moved for.
   *
   * The same idiom as spiceDeck.turn: the phase's work is stamped with the
   * turn it was done for, because the phase POINTER cannot say whether the
   * work happened — a match dealt into Storm has not rolled, and a match
   * advanced into Storm has. Absent before the first roll.
   */
  stormMoved?: number
  /**
   * What the last storm did, for the table to read. Public — the dials are
   * rolled in the open at a table. Replaced each turn, so it is always the
   * CURRENT turn's weather or last turn's, never a history.
   */
  stormReport?: {
    turn: number
    roll: number
    from: SectorId
    to: SectorId
    swept: SectorId[]
    killed: Force[]
    spiceCleared: { territoryId: string; amount: number }[]
  }
  /**
   * The Tleilaxu Tanks: the dead, waiting on revival.
   *
   * PUBLIC, because at a table the Tanks sit in the open — everyone can count
   * the forces in them and read the leader discs. Fed by every killer (the
   * storm, the worms; battles when they land) and drained by the Revival
   * phase. See lib/dune/revival for the shape and every rule.
   */
  tanks?: {
    forces: Record<string, { plain: number; starred: number }>
    leaders: Record<string, { name: string; faceDown?: boolean }[]>
    leaderRevivalOpen?: string[]
  }
  /**
   * What each faction has revived THIS turn, for the caps: three forces, one
   * starred, one leader. Stamped with the turn the way charity's window is,
   * so last turn's revivals never count against this turn's allowance.
   */
  revival?: {
    turn: number
    done: Record<string, { forces: number; starred: number; leader?: string }>
  }
  /**
   * The shipment-and-movement rotation, while the phase runs.
   *
   * Seats act one at a time in storm order, each with a window; `done` is
   * what the acting seat has spent. Deleted when the last seat finishes,
   * which is how the phase says it is over. See lib/dune/shipment.
   */
  shipping?: {
    turn: number
    order: FactionId[]
    at: number
    done: { shipped?: boolean; moved?: boolean }
    closesAt: number
  }
  /**
   * The Battles phase, while it runs. Where battles are PENDING is derived
   * from `forces` by everyone (pendingBattles in lib/dune/battle) — only the
   * rotation and the current battle need carrying. A committed plan lives in
   * the committing seat's match_secrets row and reaches this object ONLY at
   * the reveal, both plans in one write. See lib/dune/battle.
   */
  battles?: {
    turn: number
    /** Storm order; the aggressor walks it. */
    order: FactionId[]
    at: number
    /** The battle being fought, or null while the aggressor picks. */
    current: {
      territoryId: string
      sectors: string[]
      aggressor: FactionId
      defender: FactionId
      /** Who has a plan in. The plan itself is secret until the reveal. */
      committed: FactionId[]
      closesAt: number
      /** The Bene Gesserit's window to speak, when they fight here. The
       *  COMMAND is public — the opponent must hear it to obey it. */
      voice?: {
        by: FactionId
        closesAt: number
        done: boolean
        command?: { mode: 'play' | 'not-play'; target: string } | null
      }
      /** The Atreides' question: opened when their opponent commits, and
       *  the reveal waits on it. Which element was asked is public; the
       *  ANSWER goes to their own row alone. */
      prescience?: { by: FactionId; closesAt: number; done: boolean; asked?: string }
      /** Both plans, published together, and the traitor beat's state. */
      revealed?: {
        plans: Record<string, {
          dial: number
          leader?: string
          cheapHero?: boolean
          /** ADVANCED: spice the plan spent — public from the reveal on. */
          spice?: number
          /** ADVANCED: the Kwisatz Haderach rode this plan's leader. */
          kwisatz?: boolean
          weapon?: string
          defence?: string
        }>
        traitor: { answered: FactionId[]; calls: FactionId[]; closesAt: number }
        /** ADVANCED: the winner's open choice of which pieces die. The
         *  choice itself stays with the winner until it settles. */
        allocate?: { by: FactionId; closesAt: number }
      }
    } | null
    /** ADVANCED, Atreides: the one territory the Kwisatz Haderach has
     *  ridden into this turn. */
    kwisatzUsed?: string
    /** ADVANCED: the Harkonnen's open window over a prisoner from the
     *  battle they just won. The prisoner is drawn when they choose. */
    capture?: { from: FactionId; closesAt: number }
    /** Set when the rotation is finished but the capture still holds the
     *  phase: the window's answer clears the battles object itself. */
    spent?: boolean
    /** The public record of what this phase settled. */
    fought: {
      territoryId: string
      aggressor: FactionId
      defender: FactionId
      winner: FactionId | null
      explosion?: boolean
      traitors?: FactionId[]
    }[]
    /** Leaders revealed this phase, standing where they fought. */
    usedLeaders: Record<string, string>
    /** The aggressor's pick deadline, while `current` is null. */
    closesAt: number
  }
  /**
   * Every leader ever revived, across the whole game. Public — a revival is
   * made at the table — and read when a leader dies AGAIN: a once-revived
   * leader returns to the tanks face down and waits out the rotation. See
   * returnLeaderToTanks.
   */
  revivedLeaders?: string[]
  /**
   * The Fremen's ride, while it is on offer: Shai-Hulud struck these
   * territories, their forces survived (the basic advantage), and until the
   * deadline they may move some or all of each territory's forces anywhere
   * on the board. One ride per territory; the advance past the deadline
   * clears what was not ridden. See lib/dune/spiceBlow.
   */
  wormRide?: { turn: number; territories: string[]; closesAt: number }
  /** The Mentat Pause: a winnerless pause gives the table one minute to
   *  ready up, and the turn marker waits on it. */
  mentat?: { closesAt: number; ready?: FactionId[] }
  /**
   * The current phase's look-at-it window — see PHASE_SECONDS in
   * lib/dune/phaseAdvance. Before it shuts only the host advances; after it,
   * anyone. Carries its own (turn, phase) so a clock outliving its phase
   * reads as expired rather than as fresh.
   */
  phaseClock?: { turn: number; phase: GamePhase; closesAt: number }
  /**
   * Set once, at the Mentat Pause that ends the game, and never cleared.
   * Everything that reads the match — the screen, the advance loop — treats
   * its presence as the game being over.
   */
  winner?: {
    factions: FactionId[]
    reason: 'strongholds' | 'prediction' | 'fremen-default' | 'guild-default'
      | 'most-strongholds' | 'most-spice'
    turn: number
  }
  /**
   * Every purse, by faction, published in the same write as the winner.
   *
   * SCREENS COME DOWN. At a table the game ending is the moment the shields
   * lift and everything hidden is counted in the open — and a shared victory
   * or a spice-broken one is legible only against the numbers. Written ONCE,
   * beside `winner`, and never before: while the game runs, a purse reaches
   * exactly one browser, and the suite that proves it keeps proving it.
   */
  spiceRevealed?: Record<string, number>
  /**
   * The seat the game is waiting on, or null.
   *
   * PUBLIC ON PURPOSE. Six people round a table can all see who is thinking;
   * six people in six browsers cannot, and the commonest failure of a play-by-
   * network game is everybody waiting on everybody. It says WHO, never what
   * they are deciding.
   */
  awaiting: FactionId | null
}

// ── Not here yet, and the reason ─────────────────────────────────────────────
//
// Everything above is public: the storm's position, the turn, the phase. That
// is why it can be one flat object.
//
// Traitors, spice holdings, committed bids and battle plans are not public, and
// they must NOT be added to this interface. Anything inside the state broadcast
// to clients reaches every seat — the realtime subscription is a Postgres
// changefeed and delivers the whole row. Risk learned this the expensive way:
// its card hands sit in the shared state and are visible to everyone who opens
// devtools. See docs/hidden-state-and-simultaneity.md.
//
// When the first secret arrives, it goes in a DuneSecrets type read from
// match_secrets, not here.
