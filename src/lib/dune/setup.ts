/**
 * The opening position, and the four decisions that make it.
 *
 * Everything a Dune match needs before its first Storm phase: where each
 * faction's forces stand, what each holds, the storm's starting sector, and the
 * three decks in the order they will be drawn from. Built here, as data, so the
 * server can write it and a test can read it without either of them owning it.
 *
 * WHAT IS PUBLIC AND WHAT IS NOT, decided once here rather than at each write:
 *
 *   `state` is the shared row. Forces on the board, the storm, who is seated,
 *   how many cards each holds. Everything in it is a thing six people round a
 *   table can see.
 *
 *   `secrets` is one row per seat. Spice, treachery cards, traitors, the Bene
 *   Gesserit's prediction. Each reaches exactly one browser.
 *
 *   `decks` is nobody's. The treachery, traitor and spice decks in draw order
 *   go to match_decks, which has RLS on and NO POLICY AT ALL — no seat may read
 *   what the next card is, so there is no seat to scope a policy to.
 *
 * ── WHAT IS DEALT, AND NOT DECIDED ────────────────────────────────────────
 *
 * TRAITORS come off ONE deck, cut rather than sampled, so no two seats can hold
 * the same leader — and the deck holds only the leaders of the factions at this
 * table, so a four-player game deals from twenty cards and not thirty.
 *
 * ONE TREACHERY CARD EACH is dealt at the same time and kept — two for the
 * Harkonnen, whose card says so. Nobody chooses it and nobody may decline it,
 * which is why it is not among the decisions below; it is here because it is
 * part of the opening position and because the first auction is played by a
 * table already holding cards.
 *
 * ── FOUR DECISIONS, AND WHY THEY PAUSE SETUP ──────────────────────────────
 *
 * THE FREMEN DISTRIBUTE TEN FORCES across Sietch Tabr, False Wall South and
 * False Wall West. This has to be settled before the first phase resolves, and
 * not because of tidiness: the Storm phase kills forces in the sectors it
 * sweeps and a spice blow's worm devours whatever stands in its territory, and
 * both read state.forces. A match that started with those ten unplaced would
 * resolve its first turn against a board missing them, with no way to fit them
 * in afterwards.
 *
 * It is also read by another faction's setup. The Bene Gesserit's advanced
 * power places their opening force in the territory the Fremen chose — see
 * factions.ts — so the Fremen answer is an input to somebody else's position,
 * which settles the question on its own.
 *
 * THE BENE GESSERIT PREDICT who wins and when. This blocks nobody: it is
 * secret, it touches no board state, and no other seat can act on it. But it
 * must be BOUND before play begins, or they could watch a turn and predict
 * afterwards, which is the entire rule. Outstanding at setup, answered in
 * parallel with the Fremen rather than after them.
 *
 * THE BENE GESSERIT ALSO PLACE ONE ADVISOR, in the advanced game only, in any
 * territory they like. This is the one decision here that is NOT parallel: an
 * advisor alone in a territory has nobody to advise and flips to a fighter, so
 * whether their single force is an advisor at all depends on who else is
 * standing there — and the Fremen's ten are the last thing at setup that can
 * put somebody there. They choose knowing where the Fremen went, which is
 * information they are entitled to and cannot have until the Fremen answer.
 *
 * In the basic game there is no advisor and no decision: their force goes in
 * the Polar Sink, which is what factions.ts already says.
 *
 * EVERY SEAT KEEPS ONE TRAITOR of the four they are dealt — except the
 * Harkonnen, who keep all four and have nothing to decide. The four dealt are
 * secret, so the ask says only "choose one of the four you hold"; which four
 * they are lives in that seat's own row.
 *
 * They are answered INDEPENDENTLY. Setup is done when the last one is in — not
 * in sequence, because none of them is an input to another except the Fremen's,
 * and nothing waits on the Fremen but the board.
 *
 * ── WHAT SILENCE MEANS ────────────────────────────────────────────────────
 *
 * Every window in this codebase says what silence means rather than hanging.
 * Here:
 *
 *   Fremen — all ten in Sietch Tabr. Their stronghold, a legal distribution,
 *   and the least arbitrary of the three; a default that left them unplaced
 *   would be the one outcome the rules do not allow.
 *
 *   Bene Gesserit — no prediction. Declining costs them one route to victory
 *   and nothing else, where inventing one on their behalf could hand them a win
 *   they never chose.
 *
 *   Traitor — the first card dealt. Arbitrary, and harmless: the deal was
 *   random already, and the rules require keeping one.
 *
 *   Advisor — the Polar Sink, which is where the basic game puts them and the
 *   one territory the storm never touches. Its posture is worked out the same
 *   way a chosen one is.
 */
import { factionById } from '@/data/dune/factions'
import { TREACHERY_CARDS } from '@/data/dune/treachery'
import { DUNE_TERRITORIES } from '@/data/dune/boardData'
import { STORM_START } from '@/lib/dune/storm'
import { buildSpiceDeck, shuffle } from '@/lib/dune/spiceBlow'
import type { SpiceCard } from '@/types/Dune/Game'
import type { DuneGameState, Force, DunePlayerPublic, GameMode } from '@/types/Dune/Game'
import type { TerritoryId, SectorId, ForcePosture } from '@/types/Dune/Game'
import type { FactionId } from '@/types/Dune/Faction'

/** How many traitors each seat is dealt, before keeping. */
export const TRAITORS_DEALT = 4
/** The faction that keeps every one of them. */
export const KEEPS_ALL_TRAITORS: FactionId = 'harkonnen'
/** The faction whose forces can stand somewhere without holding it. */
export const ADVISOR_FACTION: FactionId = 'bene-gesserit'
/**
 * How long the setup window stays open before the defaults apply, in seconds.
 *
 * A BACKSTOP, not the way setup normally ends. Every seat has a Ready button
 * and the window closes the moment the last one presses it — see the `ready`
 * list below — so a table that is done in ninety seconds plays in ninety
 * seconds. The clock exists for the seat that walked away, and seven minutes
 * is long enough to read four traitor cards and think about ten forces without
 * ever being the thing the other five are waiting on.
 */
export const SETUP_SECONDS = 420

/** A seat, as the roster has it. */
export interface SetupSeat {
  faction: FactionId
  /** match_players.player_id — 'p1'..'p6'. What secrets rows are keyed by. */
  playerId: string
  /** Which printed circle they sit at — 'player-position-N'. */
  seat: string
}

/**
 * One outstanding setup decision, as the shared row carries it.
 *
 * PUBLIC, AND CONTENTLESS. It says who is being waited on and what kind of
 * answer is wanted — never the four traitors a seat was dealt, never what
 * anybody chose. Six people round a table can see that the Fremen are still
 * placing; they cannot see the cards in somebody's hand.
 */
export interface SetupDecision {
  kind: 'fremen-placement' | 'prediction' | 'traitor' | 'advisor-placement'
  faction: FactionId
  /**
   * A decision that cannot be answered until every one of THIS kind is settled.
   *
   * The advisor placement alone carries it, and only when the Fremen are at the
   * table. It is on the decision rather than implied by the order of the list,
   * because the list is public and a client showing "your turn" off position
   * would offer a choice the server is going to refuse.
   */
  after?: 'fremen-placement'
}

/** The setup window, as the shared row carries it. */
export interface SetupWindow {
  /** Stamped by the caller, like every deadline here. */
  closesAt?: number
  outstanding: SetupDecision[]
  /**
   * Seats that have declared themselves done.
   *
   * THE ORDINARY WAY SETUP ENDS: when every seated faction is here, the window
   * closes and anything still outstanding takes its default — the clock is
   * only the backstop for a seat that never presses anything. Public, because
   * "who are we waiting on" is the whole question; and a list of factions
   * rather than a count, so the table can see WHO.
   *
   * Ready does not lock a seat out. A seat may go on answering after pressing
   * it — ready means "close without waiting for me", not "refuse me".
   */
  ready?: FactionId[]
}

/** Whether every seated faction has pressed Ready. */
export function allReady(
  ready: readonly FactionId[] | undefined, seated: readonly FactionId[],
): boolean {
  return seated.length > 0 && seated.every(f => (ready ?? []).includes(f))
}

/** One seat's private opening holdings. */
export interface SetupSecrets {
  spice: number
  cards: string[]
  /** Kept traitors. Empty until the choice is answered. */
  traitors: string[]
  /** The four dealt, of which one is kept. Cleared once answered. */
  traitorsDealt?: string[]
  /** The Bene Gesserit's prediction, once made. Theirs alone. */
  prediction?: { faction: FactionId; turn: number }
}

export interface OpeningPosition {
  state: DuneGameState & { setup: SetupWindow }
  /** Keyed by player_id, which is what match_secrets rows are keyed by. */
  secrets: Record<string, SetupSecrets>
  decks: { treachery: string[]; traitor: string[]; spice: SpiceCard[] }
}

/**
 * The sector a territory's forces stand in, by default.
 *
 * A FORCE OCCUPIES A SECTOR, not a territory — that is what the storm reads.
 * Most starting territories are one sector and there is nothing to choose;
 * False Wall South and False Wall West are not, and the Fremen may name one.
 * Absent, the first is used, which is a real choice being made for somebody
 * rather than an absence of one, so it is written down here.
 */
export function defaultSector(territoryId: string): SectorId {
  const t = DUNE_TERRITORIES.find(x => x.id === territoryId)
  return (t?.sectors[0] ?? 'sector-1') as SectorId
}

/**
 * The traitor deck: one card per leader of every faction AT THIS TABLE.
 *
 * SEATED FACTIONS ONLY. The deck is built from who is playing, not from the
 * six that exist — a four-player game deals from twenty cards, not thirty.
 * Leaving the absent factions in would mean most seats holding traitors who can
 * never take the field, which is four dead cards in a hand of four and turns
 * the single most valuable secret in the game into a coin toss.
 *
 * ONE CARD PER LEADER, and it is dealt without replacement below, so no two
 * seats can hold the same traitor. That is not a nicety: two players each
 * believing they can call the same leader would both be right, and the first
 * battle it came up in would have no answer in the rules.
 */
export function traitorDeck(seated: readonly FactionId[]): string[] {
  return seated.flatMap(id => (factionById(id)?.leaders ?? []).map(l => l.name))
}

/**
 * How many treachery cards a faction is dealt at setup.
 *
 * Off the faction's own card — see Faction.startingTreachery. One each, two for
 * the Harkonnen.
 */
export function startingTreachery(faction: FactionId): number {
  return factionById(faction)?.startingTreachery ?? 0
}

/** Every treachery card, one entry per copy, which is the deck as printed. */
export function treacheryDeck(): string[] {
  return TREACHERY_CARDS.flatMap(c => Array.from({ length: c.copies }, () => c.id))
}

/**
 * Where a faction's forces start, when the rules place them.
 *
 * Null for a faction whose placement is a decision — the Fremen — and for one
 * with nothing on the planet at all. Reading `placement` off the faction data
 * rather than a second table here is the point: a starting position written
 * twice is a starting position that disagrees with the rules card the player is
 * holding.
 */
export function fixedPlacement(faction: FactionId): Force | null {
  const f = factionById(faction)
  if (!f) return null
  // THE ADVANCED GAME ADDS TO THEIRS, it does not replace it. The Bene
  // Gesserit hold the Polar Sink in both games — factions.ts says so and that
  // is the basic rule — and the advanced advisor is a SECOND force, sent out
  // to a territory of their choosing. This used to return null in the advanced
  // game on the reading that the advisor WAS their one force, which left them
  // off the Polar Sink entirely and a token short on the planet.
  //
  // Where the advisor's token comes from is answered by shipAdvisor: out of
  // reserves, so the twenty a faction owns stays twenty.
  const { placement, onPlanet } = f.forces
  if (placement.kind !== 'fixed' || onPlanet <= 0) return null
  return {
    faction,
    territoryId: placement.territoryId as TerritoryId,
    sector: defaultSector(placement.territoryId),
    count: onPlanet,
  }
}

/** The territories a faction may distribute across, or none. */
export function distributeAmong(faction: FactionId): string[] {
  const placement = factionById(faction)?.forces.placement
  return placement?.kind === 'distribute' ? [...placement.among] : []
}

/** How many of a faction's forces are elite — Sardaukar, Fedaykin. */
export function starredOf(faction: FactionId): number {
  return factionById(faction)?.forces.starred ?? 0
}

/**
 * Where a faction's elites START: with the placement pool, or in reserve.
 *
 * The Fremen's three Fedaykin are among the ten they distribute — choosing
 * where those three stand is the point of marking them — so at the deal their
 * reserve holds none, and whatever they do NOT place walks back into reserve.
 * The Emperor's five Sardaukar have nowhere to be but reserve, since he starts
 * with nothing on the planet. Read off the placement kind rather than the
 * faction name, so a new faction with elites lands on the right side of this
 * without editing it.
 */
export function starredInReserve(faction: FactionId, mode: GameMode): number {
  if (mode !== 'advanced') return 0
  const placement = factionById(faction)?.forces.placement
  return placement?.kind === 'distribute' ? 0 : starredOf(faction)
}

/**
 * The whole opening position.
 *
 * `rng` is injected, like every shuffle here: the server seeds it from the
 * match's own rng_seed so a setup can be replayed, and a test can hand it a
 * counter and get the same deal every time.
 */
export function openingPosition(input: {
  seats: readonly SetupSeat[]
  mode: GameMode
  rng: () => number
  /** When the setup window shuts. Stamped by the caller, never from a clock here. */
  closesAt?: number
  /**
   * Whose table this is, by seat id.
   *
   * Translated to a faction on the way into the state, because that is how
   * everything else there names a seat. A host who is not at the table leaves
   * the game hostless rather than naming somebody who is not playing.
   */
  host?: string
}): OpeningPosition {
  const { seats, mode, rng } = input
  const host = seats.find(s => s.playerId === input.host)?.faction ?? null

  const players: DunePlayerPublic[] = seats.map(s => {
    // ELITES OUT OF THE PLAIN COUNT, in the advanced game. The star tokens are
    // pieces beside the others, so twenty reserves of which five are Sardaukar
    // is published as 15 + 5 — one total split two ways would let the two
    // numbers disagree the first time only one of them was updated. The
    // Fremen's Fedaykin are in their placement pool, not their reserve; see
    // starredInReserve.
    const inReserve = starredInReserve(s.faction, mode)
    return {
      faction: s.faction,
      seat: s.seat,
      reserves: (factionById(s.faction)?.forces.reserves ?? 0) - inReserve,
      ...(inReserve > 0 ? { reservesStarred: inReserve } : null),
      // HOW MANY, WHICH IS PUBLIC — the cards themselves are dealt below into
      // that seat's own row. Everyone starts holding one, so everyone can see
      // that everyone starts holding one.
      handCount: startingTreachery(s.faction),
      ally: null,
    }
  })

  // The forces the rules place. The Fremen's are absent until answered — see
  // the note at the top of this file.
  const forces = seats
    .map(s => fixedPlacement(s.faction))
    .filter((f): f is Force => f !== null)

  // ── the decks ────────────────────────────────────────────────────────────
  // Shuffled once, here, and written to match_decks. Nobody may read them.
  const traitors = shuffle(traitorDeck(seats.map(s => s.faction)), rng)
  const treachery = shuffle(treacheryDeck(), rng)
  const spice = shuffle(buildSpiceDeck(), rng)

  // ── the deal ─────────────────────────────────────────────────────────────
  // Four traitors each, off the top of the shuffled deck, into that seat's own
  // row. The Harkonnen keep all four and have nothing to decide, so theirs are
  // kept rather than dealt-pending.
  //
  // AND ONE TREACHERY CARD EACH, off the top of that deck, kept. It is not a
  // decision and never appears in `outstanding` — nobody chooses it and nobody
  // can decline it — but it is dealt HERE rather than at the first auction,
  // because it changes that auction: everybody comes to the first card already
  // holding one, and the Harkonnen come holding two of a possible eight.
  //
  // BOTH DECKS ARE CUT, NOT SAMPLED. Each seat's slice is taken in turn and the
  // remainder is what goes to match_decks, so nothing is dealt twice and the
  // deck the game draws from afterwards is the deck minus what people hold.
  const secrets: Record<string, SetupSecrets> = {}
  let cut = 0
  let drawn = 0
  for (const s of seats) {
    const dealt = traitors.slice(cut, cut + TRAITORS_DEALT)
    cut += TRAITORS_DEALT
    const hand = treachery.slice(drawn, drawn + startingTreachery(s.faction))
    drawn += hand.length
    const keepsAll = s.faction === KEEPS_ALL_TRAITORS
    secrets[s.playerId] = {
      spice: factionById(s.faction)?.startingSpice ?? 0,
      cards: hand,
      traitors: keepsAll ? dealt : [],
      ...(keepsAll ? null : { traitorsDealt: dealt }),
    }
  }

  const outstanding: SetupDecision[] = []
  for (const s of seats) {
    if (distributeAmong(s.faction).length > 0) {
      outstanding.push({ kind: 'fremen-placement', faction: s.faction })
    }
    if (s.faction === 'bene-gesserit') {
      outstanding.push({ kind: 'prediction', faction: s.faction })
    }
    if (s.faction !== KEEPS_ALL_TRAITORS) {
      outstanding.push({ kind: 'traitor', faction: s.faction })
    }
    // ADVANCED ONLY, and last: see the note at the top of this file for why it
    // waits on the Fremen. With no Fremen at the table there is nothing to wait
    // for, and it is answerable straight away.
    if (s.faction === ADVISOR_FACTION && mode === 'advanced') {
      const fremenSeated = seats.some(x => distributeAmong(x.faction).length > 0)
      outstanding.push({
        kind: 'advisor-placement', faction: s.faction,
        ...(fremenSeated ? { after: 'fremen-placement' as const } : null),
      })
    }
  }

  return {
    state: {
      storm: STORM_START,
      turn: 1,
      // THE FIRST PHASE OF THE FIRST TURN, which has not run. Setup is not a
      // phase — the board prints nine and this is not one of them — so the
      // match sits at the phase it is about to play, with the setup window
      // saying why nothing has happened yet.
      phase: 'Storm',
      shieldWall: 'intact',
      mode,
      spiceDeck: { remaining: spice.length, discardA: [], discardB: [] },
      players,
      forces,
      spiceOnBoard: {},
      // WHO the table is waiting on. The first outstanding answer, so the HUD
      // has a seat to name; the full list is in `setup`.
      awaiting: outstanding[0]?.faction ?? null,
      ...(host ? { host } : null),
      setup: { outstanding, ...(input.closesAt != null ? { closesAt: input.closesAt } : null) },
    },
    secrets,
    decks: { treachery: treachery.slice(drawn), traitor: traitors.slice(cut), spice },
  }
}

// ── the answers ────────────────────────────────────────────────────────────

export type SetupRefusal =
  | 'not-outstanding'
  | 'wrong-total'
  | 'not-among'
  | 'negative'
  | 'too-many-starred'
  | 'unknown-faction'
  | 'predicting-yourself'
  | 'turn-out-of-range'
  | 'not-dealt'

export type SetupAnswer<T> = { ok: true; value: T } | { ok: false; refusal: SetupRefusal }

const refuse = <T>(refusal: SetupRefusal): SetupAnswer<T> => ({ ok: false, refusal })

/** A turn a prediction may name. A game is ten turns. */
export const PREDICTION_TURNS = { min: 1, max: 10 } as const

/**
 * The Fremen's ten, across the three territories they may use.
 *
 * VALIDATED AGAINST THE FACTION DATA, not against a list written here: the
 * three territories, the count and the Fedaykin all come from factions.ts, so
 * a rules change moves them in one place.
 *
 * STARRED IS WHICH OF THE COUNT ARE FEDAYKIN, per entry, and only the advanced
 * game has them — the basic game plays every token plain and refuses a starred
 * placement outright. Fewer than all three is legal: an unplaced Fedaykin
 * walks back into reserve, which the caller settles from what this returns.
 */
export function answerFremenPlacement(
  faction: FactionId,
  chosen: readonly { territoryId: string; sector?: string; count: number; starred?: number }[],
  mode: GameMode,
): SetupAnswer<Force[]> {
  const among = distributeAmong(faction)
  if (among.length === 0) return refuse('not-outstanding')
  const total = factionById(faction)?.forces.onPlanet ?? 0

  if (chosen.some(c => !among.includes(c.territoryId))) return refuse('not-among')
  if (chosen.some(c => !Number.isInteger(c.count) || c.count < 0)) return refuse('negative')
  if (chosen.some(c => c.starred != null && (!Number.isInteger(c.starred) || c.starred < 0))) {
    return refuse('negative')
  }
  // A SECTOR THE TERRITORY DOES NOT HAVE would put forces where the storm
  // cannot find them, which is a way of standing outside the game.
  if (chosen.some(c => c.sector
    && !(DUNE_TERRITORIES.find(t => t.id === c.territoryId)?.sectors ?? []).includes(c.sector))) {
    return refuse('not-among')
  }
  if (chosen.reduce((n, c) => n + c.count, 0) !== total) return refuse('wrong-total')
  // A STAR IS ONE OF THE COUNT, not on top of it: three forces of which four
  // are elite is not a stack anybody can put on a table.
  if (chosen.some(c => (c.starred ?? 0) > c.count)) return refuse('too-many-starred')
  const stars = chosen.reduce((n, c) => n + (c.starred ?? 0), 0)
  if (stars > (mode === 'advanced' ? starredOf(faction) : 0)) return refuse('too-many-starred')

  return {
    ok: true,
    value: chosen.filter(c => c.count > 0).map(c => ({
      faction,
      territoryId: c.territoryId as TerritoryId,
      sector: (c.sector ?? defaultSector(c.territoryId)) as SectorId,
      count: c.count,
      ...((c.starred ?? 0) > 0 ? { starred: c.starred } : null),
    })),
  }
}

/**
 * Silence: all of them in the first territory they may use — Sietch Tabr —
 * Fedaykin included, in the advanced game. A default that held the elites
 * back would be making a real decision on the silent player's behalf, where
 * "everything in the stronghold" is the least opinionated stack there is.
 */
export function defaultFremenPlacement(faction: FactionId, mode: GameMode): Force[] {
  const among = distributeAmong(faction)
  const total = factionById(faction)?.forces.onPlanet ?? 0
  if (among.length === 0 || total <= 0) return []
  const stars = mode === 'advanced' ? Math.min(starredOf(faction), total) : 0
  return [{
    faction,
    territoryId: among[0] as TerritoryId,
    sector: defaultSector(among[0]),
    count: total,
    ...(stars > 0 ? { starred: stars } : null),
  }]
}

/**
 * The Bene Gesserit's prediction.
 *
 * THEY MAY NOT PREDICT THEMSELVES. The power is winning by having called
 * somebody else's victory; predicting your own is just playing the game.
 */
export function answerPrediction(
  seated: readonly FactionId[], faction: FactionId, turn: number,
): SetupAnswer<{ faction: FactionId; turn: number }> {
  if (!seated.includes(faction)) return refuse('unknown-faction')
  if (faction === 'bene-gesserit') return refuse('predicting-yourself')
  if (!Number.isInteger(turn) || turn < PREDICTION_TURNS.min || turn > PREDICTION_TURNS.max) {
    return refuse('turn-out-of-range')
  }
  return { ok: true, value: { faction, turn } }
}

/**
 * The one traitor a seat keeps.
 *
 * CHECKED AGAINST WHAT THEY WERE DEALT, which only the server knows: the four
 * are in that seat's own row and the ask never names them. A client that sent
 * any other leader would be naming a card it was not given.
 */
export function answerTraitor(dealt: readonly string[], keep: string): SetupAnswer<string[]> {
  if (!dealt.includes(keep)) return refuse('not-dealt')
  return { ok: true, value: [keep] }
}

/**
 * Whether a force standing here fights or advises.
 *
 * ALONE MEANS NOBODY ELSE'S PIECES ARE IN THE TERRITORY. An advisor with
 * nobody to advise is a contradiction the rules resolve by making it a
 * fighter, and this is that rule — read off the board rather than asked for,
 * because it is not a choice anybody makes.
 *
 * By TERRITORY and not by sector: an advisor watches the people in the place,
 * and a stack two sectors over in the same territory is in the same place.
 */
export function postureFor(
  forces: readonly Force[], territoryId: string, faction: FactionId,
): ForcePosture {
  const others = forces.some(f =>
    f.faction !== faction && f.territoryId === territoryId && f.count > 0)
  return others ? 'advisor' : 'fighter'
}

/**
 * The Bene Gesserit's one force, wherever they choose to put it.
 *
 * ANY TERRITORY ON THE BOARD — there is no list to be among, which is what
 * separates this from the Fremen's three. What is checked is that the place
 * exists and that the sector belongs to it.
 *
 * The board AS IT STANDS is passed in, and by now that includes the Fremen: it
 * is the whole reason this answer comes after theirs.
 */
export function answerAdvisorPlacement(
  faction: FactionId,
  choice: { territoryId: string; sector?: string },
  forces: readonly Force[],
): SetupAnswer<Force[]> {
  const territory = DUNE_TERRITORIES.find(t => t.id === choice.territoryId)
  if (!territory) return refuse('not-among')
  if (choice.sector && !territory.sectors.includes(choice.sector)) return refuse('not-among')
  const count = factionById(faction)?.forces.onPlanet ?? 0
  if (count <= 0) return refuse('not-outstanding')
  return {
    ok: true,
    value: [{
      faction,
      territoryId: choice.territoryId as TerritoryId,
      sector: (choice.sector ?? defaultSector(choice.territoryId)) as SectorId,
      count,
      posture: postureFor(forces, choice.territoryId, faction),
    }],
  }
}

/**
 * The reserve the advisor came out of.
 *
 * A FACTION OWNS TWENTY TOKENS and no more. The advisor is not a free piece
 * conjured for the advanced game: it is one of the twenty, standing on the
 * board instead of waiting off it, so the reserve it left has to go down by
 * the same one it went up by. Miss this and the Bene Gesserit quietly play the
 * whole game a token richer than everybody else.
 *
 * Takes the placed forces rather than a bare number so it cannot disagree with
 * what was actually put on the board.
 */
export function shipAdvisor<P extends { faction: FactionId; reserves: number }>(
  players: readonly P[], faction: FactionId, placed: readonly Force[],
): P[] {
  const sent = placed
    .filter(f => f.faction === faction)
    .reduce((n, f) => n + f.count, 0)
  if (sent <= 0) return [...players]
  return players.map(p => p.faction === faction
    // NEVER BELOW EMPTY. A reserve that goes negative is a token that never
    // existed being spent, and it would be spent silently.
    ? { ...p, reserves: Math.max(0, p.reserves - sent) }
    : p)
}

/**
 * Silence: the Polar Sink, where the basic game puts them.
 *
 * The one territory the storm never touches, and the least committal place on
 * the board — a default that dropped their advisor into somebody's stronghold
 * would be making a move for them.
 */
export function defaultAdvisorPlacement(
  faction: FactionId, forces: readonly Force[],
): Force[] {
  const placement = factionById(faction)?.forces.placement
  const territoryId = placement?.kind === 'fixed' ? placement.territoryId : 'territory-03'
  const answer = answerAdvisorPlacement(faction, { territoryId }, forces)
  return answer.ok ? answer.value : []
}

/** Silence: the first they were dealt. The deal was random already. */
export function defaultTraitor(dealt: readonly string[]): string[] {
  return dealt.length ? [dealt[0]] : []
}

/** The same decision, gone from the outstanding list. */
export function settle(
  outstanding: readonly SetupDecision[], kind: SetupDecision['kind'], faction: FactionId,
): SetupDecision[] {
  return outstanding.filter(d => !(d.kind === kind && d.faction === faction))
}

/** Whether a seat still owes this answer. */
export function isOutstanding(
  outstanding: readonly SetupDecision[], kind: SetupDecision['kind'], faction: FactionId,
): boolean {
  return outstanding.some(d => d.kind === kind && d.faction === faction)
}

/**
 * Whether a seat may answer it NOW.
 *
 * Owed is not the same as answerable. The advisor placement is owed from the
 * moment the game is dealt and cannot be answered until the Fremen have placed
 * — the Bene Gesserit are entitled to see where those ten went before choosing,
 * because it decides whether their own force is an advisor or a fighter.
 */
export function answerable(
  outstanding: readonly SetupDecision[], kind: SetupDecision['kind'], faction: FactionId,
): boolean {
  const decision = outstanding.find(d => d.kind === kind && d.faction === faction)
  if (!decision) return false
  if (!decision.after) return true
  return !outstanding.some(d => d.kind === decision.after)
}

/**
 * The order the defaults have to be applied in when the clock runs out.
 *
 * Blocked decisions LAST, because their default reads the board the earlier
 * ones write: an advisor placed before the Fremen would be alone in a territory
 * the Fremen were about to walk into, and would take the field as a fighter on
 * the strength of a board that was still being laid out.
 */
export function defaultOrder(outstanding: readonly SetupDecision[]): SetupDecision[] {
  return [...outstanding].sort((a, b) => (a.after ? 1 : 0) - (b.after ? 1 : 0))
}
