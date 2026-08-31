// The opening position: what each faction starts with, and the four decisions.
//
// WHY THIS EXISTS. A match is dealt ONCE. Everything after it — every purse,
// every battle, every traitor call — is built on top of a position nobody
// re-derives, so a mistake here is a mistake that never surfaces as itself. A
// faction short two forces just loses more battles than it should.
//
// The starting numbers are checked against factions.ts rather than against
// numbers written here, because a second copy of a starting position is a
// starting position that disagrees with the card the player is holding.
import { readFileSync } from 'node:fs'
import {
  openingPosition, answerFremenPlacement, answerPrediction, answerTraitor,
  defaultFremenPlacement, defaultTraitor, settle, isOutstanding,
  distributeAmong, traitorDeck, treacheryDeck, defaultSector, startingTreachery, starredOf, allReady,
  answerAdvisorPlacement, defaultAdvisorPlacement, postureFor, answerable, defaultOrder,
  shipAdvisor,
  TRAITORS_DEALT, KEEPS_ALL_TRAITORS, ADVISOR_FACTION, SETUP_SECONDS, PREDICTION_TURNS,
} from '@/lib/dune/setup'
import { strongholdsHeld } from '@/lib/dune/hud'
import type { Force } from '@/types/Dune/Game'
import type { SetupSeat } from '@/lib/dune/setup'
import { FACTION_IDS, factionById } from '@/data/dune/factions'
import { DUNE_TERRITORIES } from '@/data/dune/boardData'
import { TREACHERY_CARDS } from '@/data/dune/treachery'
import { STORM_START } from '@/lib/dune/storm'
import type { FactionId } from '@/types/Dune/Faction'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}
const code = (path: string) => readFileSync(path, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** A deterministic rng, so a deal can be compared with itself. */
const counter = (start = 0) => { let n = start; return () => ((n = (n * 1103515245 + 12345) % 2147483648) / 2147483648) }

const seats: SetupSeat[] = FACTION_IDS.map((faction, i) => ({
  faction, playerId: `p${i + 1}`, seat: `player-position-${i + 1}`,
}))

const deal = (over: Partial<Parameters<typeof openingPosition>[0]> = {}) =>
  openingPosition({ seats, mode: 'advanced', rng: counter(7), ...over })

// ── every faction starts with what its own card says ──────────────────────
{
  const opening = deal()

  const wrongSpice = seats.filter(s =>
    opening.secrets[s.playerId].spice !== factionById(s.faction)!.startingSpice)
  check('every seat starts with its faction\'s spice', wrongSpice.map(s => s.faction), [])
  // NOT ZERO, and not all the same. The Fremen start on 3 and the Atreides on
  // 10; a deal that gave everyone the same number would pass a check that only
  // asked whether spice existed.
  check('...which is not one number for everybody',
    new Set(seats.map(s => opening.secrets[s.playerId].spice)).size > 1, true)

  // RESERVES SPLIT ELITE FROM PLAIN in the advanced game — the two numbers
  // must still sum to the faction card's total, or a Sardaukar was minted or
  // melted on the way in.
  const wrongReserves = opening.state.players.filter(p =>
    p.reserves + (p.reservesStarred ?? 0) !== factionById(p.faction)!.forces.reserves)
  check('every seat starts with its faction\'s reserves', wrongReserves.map(p => p.faction), [])

  // EVERYBODY STARTS HOLDING ONE. It is dealt, not chosen, and it is the
  // reason the first auction is not six empty hands bidding — a seat that
  // started with nothing would price the first card differently from one
  // already a quarter of the way to its limit.
  const wrongHand = seats.filter(s =>
    opening.secrets[s.playerId].cards.length !== factionById(s.faction)!.startingTreachery)
  check('every seat is dealt the cards its faction\'s card says', wrongHand.map(s => s.faction), [])
  check('...which is one each', seats.filter(s => s.faction !== KEEPS_ALL_TRAITORS)
    .map(s => opening.secrets[s.playerId].cards.length),
    seats.filter(s => s.faction !== KEEPS_ALL_TRAITORS).map(() => 1))
  // THE HARKONNEN CARD SAYS TWO, in the same sentence as their hand limit.
  const harkonnen = seats.find(s => s.faction === KEEPS_ALL_TRAITORS)!
  check('...and two for the Harkonnen', opening.secrets[harkonnen.playerId].cards.length, 2)
  // NO CARD IN TWO HANDS. One deck, cut in turn.
  const opening_hands = seats.flatMap(s => opening.secrets[s.playerId].cards)
  check('...off one deck, with nothing dealt twice',
    opening_hands.length - new Set(opening_hands).size,
    // Duplicates by ID are legitimate — the deck has two Truthtrances — so what
    // is checked is that no more copies are in hands than the deck prints.
    opening_hands.filter(id =>
      opening_hands.filter(x => x === id).length
        > (TREACHERY_CARDS.find(c => c.id === id)?.copies ?? 0)).length)
  // HOW MANY IS PUBLIC. What they are is not: the ids live in one row each.
  const wrongCount = opening.state.players.filter(p =>
    p.handCount !== factionById(p.faction)!.startingTreachery)
  check('the public row says how many everyone holds', wrongCount.map(p => p.faction), [])
  check('...and never which cards they are',
    opening_hands.filter(id => JSON.stringify(opening.state).includes(`"${id}"`)), [])
}

// ── the forces the rules place ────────────────────────────────────────────
{
  const opening = deal()
  const placed = Object.fromEntries(opening.state.forces.map(f => [f.faction, f]))

  // FROM THE FACTION DATA, both sides. Checking the placement against a list
  // written here would be checking one copy of the rules against another.
  for (const id of FACTION_IDS) {
    const f = factionById(id)!
    const { placement, onPlanet } = f.forces
    // THE BENE GESSERIT ARE THE EXCEPTION IN THE ADVANCED GAME. Their card says
    // the Polar Sink, and that is the BASIC rule; in the advanced game the same
    // one force is an advisor placed wherever they choose, so nothing is placed
    // for them here. Checked on its own below, in both modes.
    if (id === ADVISOR_FACTION) continue
    if (placement.kind === 'fixed' && onPlanet > 0) {
      check(`${id} stands in the territory its card names`,
        placed[id]?.territoryId, placement.territoryId)
      check(`...with all ${onPlanet} of them`, placed[id]?.count, onPlanet)
      // A FORCE OCCUPIES A SECTOR, which is what the storm reads. A placement
      // in a sector its territory does not have would stand outside the game.
      check('...in a sector that territory has',
        (DUNE_TERRITORIES.find(t => t.id === placement.territoryId)?.sectors ?? [])
          .includes(placed[id]?.sector ?? ''), true)
    } else {
      check(`${id} has nothing placed for it`, placed[id] ?? null, null)
    }
  }

  // THE EMPEROR SHIPS EVERYTHING IN, which is their whole opening problem.
  check('the Emperor starts with nothing on the planet',
    opening.state.forces.some(f => f.faction === 'emperor'), false)
  const emperor = opening.state.players.find(p => p.faction === 'emperor')
  check('...and all twenty in reserve, five of them Sardaukar',
    [emperor?.reserves, emperor?.reservesStarred], [15, 5])
  // THE FREMEN'S FEDAYKIN ARE IN THE PLACEMENT POOL, not the reserve — where
  // they stand is the decision. Their reserve deals plain.
  const fremen = opening.state.players.find(p => p.faction === 'fremen')
  check('the Fremen reserve deals plain',
    [fremen?.reserves, fremen?.reservesStarred ?? 0], [10, 0])
  // THE BASIC GAME HAS NO ELITES ANYWHERE: every reserve is one plain number.
  const basic = openingPosition({ seats, mode: 'basic', rng: counter(7) })
  check('a basic deal splits nobody\'s reserve',
    basic.state.players.filter(p => p.reservesStarred != null).map(p => p.faction), [])
  check('...and the Emperor\'s twenty stay one number',
    basic.state.players.find(p => p.faction === 'emperor')?.reserves, 20)

  // The Fremen's are a decision, so they are absent until answered.
  check('the Fremen have not been placed yet',
    opening.state.forces.some(f => f.faction === 'fremen'), false)
}

// ── the board it starts on ────────────────────────────────────────────────
{
  const opening = deal()
  check('the storm starts where the storm starts', opening.state.storm, STORM_START)
  check('it is turn one', opening.state.turn, 1)
  // THE PHASE IT IS ABOUT TO PLAY, not a tenth phase called setup. The board
  // prints nine and setup is not one of them.
  check('...at the first phase of it', opening.state.phase, 'Storm')
  check('the Shield Wall is standing', opening.state.shieldWall, 'intact')
  check('no spice is lying about', opening.state.spiceOnBoard, {})
  check('the mode is the one asked for', deal({ mode: 'basic' }).state.mode, 'basic')
}

// ── the three decks ───────────────────────────────────────────────────────
{
  const opening = deal()

  // THE TREACHERY DECK IS THE DECK AS PRINTED — one entry per copy, not one per
  // card. Truthtrance has two, and a deck built from the card list alone would
  // be two cards short of the game.
  const printed = TREACHERY_CARDS.reduce((n, c) => n + c.copies, 0)
  check('the treachery deck is every copy of every card', treacheryDeck().length, printed)
  check('...which is thirty-three', printed, 33)
  // WHAT GOES TO match_decks IS THE REST OF IT. Everyone was dealt one at
  // setup, so the deck the game draws from afterwards is short by exactly what
  // the table is holding — a deck still holding all thirty-three would be
  // dealing the same card twice within the first auction.
  const inHands = seats.reduce((n, s) => n + startingTreachery(s.faction), 0)
  check('...and the deal takes the opening hands out of it',
    opening.decks.treachery.length, printed - inHands)
  check('...losing none of the rest',
    [...opening.decks.treachery, ...seats.flatMap(s => opening.secrets[s.playerId].cards)].sort(),
    [...treacheryDeck()].sort())

  // THE TRAITOR DECK IS EVERY LEADER AT THE TABLE. Five each.
  const leaders = FACTION_IDS.flatMap(id => factionById(id)!.leaders.map(l => l.name))
  check('the traitor deck is every leader in the game',
    traitorDeck(FACTION_IDS).length, leaders.length)
  check('...which is thirty at a full table', leaders.length, 30)
  check('...and every name is distinct', new Set(leaders).size, leaders.length)
  // AND ONLY THE FACTIONS PLAYING. A deck carrying the absent two would deal
  // most seats traitors who can never take the field — four dead cards in a
  // hand of four, and the best secret in the game reduced to a coin toss.
  const four = FACTION_IDS.slice(0, 4)
  check('a four-player deck is twenty cards, not thirty', traitorDeck(four).length, 20)
  check('...with nobody in it who is not at the table',
    traitorDeck(four).filter(n => !four.some(f =>
      factionById(f)!.leaders.some(l => l.name === n))), [])

  check('the spice deck is shuffled and counted',
    opening.state.spiceDeck.remaining, opening.decks.spice.length)
  check('...with nothing showing yet',
    [opening.state.spiceDeck.discardA, opening.state.spiceDeck.discardB], [[], []])

  // SHUFFLED, not merely copied. Two deals from different rng must differ, or
  // the shuffle is decoration and every match on the planet plays the same one.
  const other = deal({ rng: counter(999) })
  check('a different seed deals a different treachery order',
    opening.decks.treachery.join() === other.decks.treachery.join(), false)
  check('...and a different traitor deal',
    opening.secrets.p1.traitors.join() + (opening.secrets.p1.traitorsDealt ?? []).join()
      === other.secrets.p1.traitors.join() + (other.secrets.p1.traitorsDealt ?? []).join(), false)
  // AND REPLAYABLE. The server seeds this from the match's own row so a deal
  // can be replayed; an rng it could not reproduce would make that a lie.
  check('the same seed deals the same game',
    deal().decks.treachery.join(), deal().decks.treachery.join())
}

// ── the traitor deal ──────────────────────────────────────────────────────
{
  const opening = deal()

  const dealtTo = (playerId: string) => {
    const row = opening.secrets[playerId]
    return [...row.traitors, ...(row.traitorsDealt ?? [])]
  }
  const everyone = seats.flatMap(s => dealtTo(s.playerId))
  check('every seat is dealt four', seats.map(s => dealtTo(s.playerId).length),
    seats.map(() => TRAITORS_DEALT))
  // NOBODY IS DEALT THE SAME LEADER TWICE, and no two seats share one. The
  // deck is cut, not sampled.
  check('...off one deck, with no card in two hands',
    new Set(everyone).size, everyone.length)
  check('...all of them real leaders',
    everyone.filter(n => !traitorDeck(FACTION_IDS).includes(n)), [])
  // AND THE REST OF THE DECK IS STILL THERE.
  check('what is left is the rest of the deck',
    opening.decks.traitor.length, traitorDeck(FACTION_IDS).length - seats.length * TRAITORS_DEALT)
  check('...with none of the dealt cards in it',
    opening.decks.traitor.filter(n => everyone.includes(n)), [])

  // THE HARKONNEN KEEP ALL FOUR and have nothing to decide — that is the
  // faction power, and it is why they are the one seat with no traitor
  // decision outstanding.
  const hark = seats.find(s => s.faction === KEEPS_ALL_TRAITORS)!
  check('the Harkonnen keep all four', opening.secrets[hark.playerId].traitors.length, 4)
  check('...with nothing left to choose',
    opening.secrets[hark.playerId].traitorsDealt ?? null, null)

  const atreides = seats.find(s => s.faction === 'atreides')!
  check('everybody else keeps none until they choose',
    opening.secrets[atreides.playerId].traitors, [])
  check('...holding four to choose from',
    opening.secrets[atreides.playerId].traitorsDealt?.length, 4)
}

// ── what setup is waiting on ──────────────────────────────────────────────
{
  const opening = deal()
  const out = opening.state.setup.outstanding

  check('the Fremen owe a placement',
    isOutstanding(out, 'fremen-placement', 'fremen' as FactionId), true)
  check('the Bene Gesserit owe a prediction',
    isOutstanding(out, 'prediction', 'bene-gesserit' as FactionId), true)
  // ONE PER SEAT EXCEPT THE HARKONNEN, whose power is keeping all four.
  check('everybody but the Harkonnen owes a traitor choice',
    out.filter(d => d.kind === 'traitor').map(d => d.faction).sort(),
    FACTION_IDS.filter(f => f !== KEEPS_ALL_TRAITORS).slice().sort())
  check('...and the Harkonnen owe none', out.filter(d =>
    d.kind === 'traitor' && d.faction === KEEPS_ALL_TRAITORS), [])

  // ONLY THE FACTIONS IN THE GAME. A four-player match must not be waiting on
  // a Bene Gesserit who is not at the table — that is a match that can never
  // finish setting up.
  const four = openingPosition({
    seats: seats.slice(0, 4), mode: 'advanced', rng: counter(3),
  })
  check('a smaller table waits on nobody who is not at it',
    four.state.setup.outstanding.filter(d =>
      !seats.slice(0, 4).some(s => s.faction === d.faction)), [])
  const factions4 = seats.slice(0, 4).map(s => s.faction)
  check('...and a table without the Fremen waits on no placement',
    four.state.setup.outstanding.some(d => d.kind === 'fremen-placement'),
    factions4.includes('fremen' as FactionId))

  // THE TABLE IS TOLD WHO, which is public: six people round a table can see
  // who is still placing.
  check('the row names a seat the table is waiting on',
    out.some(d => d.faction === opening.state.awaiting), true)
  // AND NOT WHAT. The four traitors a seat was dealt are in that seat's own
  // row; a public ask that named them would publish every hand at setup.
  const published = JSON.stringify(opening.state)
  const dealtNames = seats.flatMap(s => opening.secrets[s.playerId].traitorsDealt ?? [])
  check('...and never which cards anybody was dealt',
    dealtNames.filter(n => published.includes(n)), [])
  check('...nor anybody\'s spice',
    /"spice"/.test(published), false)

  // A DEADLINE IS THE CALLER'S TO STAMP, like every window here.
  check('no deadline unless one is given', opening.state.setup.closesAt ?? null, null)
  check('...and the one given is the one carried',
    deal({ closesAt: 1234 }).state.setup.closesAt, 1234)
  check('the window is long enough to think and short enough to end',
    SETUP_SECONDS >= 60 && SETUP_SECONDS <= 600, true)
}

// ── the Fremen's ten ──────────────────────────────────────────────────────
{
  const among = distributeAmong('fremen' as FactionId)
  const total = factionById('fremen')!.forces.onPlanet
  check('the Fremen may use three territories', among.length, 3)
  check('...and place ten', total, 10)

  const ok = answerFremenPlacement('fremen' as FactionId, [
    { territoryId: among[0], count: 6 },
    { territoryId: among[1], count: 4 },
  ], 'advanced')
  check('a legal split is taken', ok.ok, true)
  check('...as forces on the board',
    ok.ok ? ok.value.map(f => [f.territoryId, f.count]) : [],
    [[among[0], 6], [among[1], 4]])
  check('...in a sector each territory has',
    ok.ok ? ok.value.filter(f =>
      !(DUNE_TERRITORIES.find(t => t.id === f.territoryId)?.sectors ?? []).includes(f.sector)) : [], [])

  // ALL TEN, NOT SOME. Nine placed is a force left in a box.
  const short = answerFremenPlacement('fremen' as FactionId,
    [{ territoryId: among[0], count: 9 }], 'advanced')
  check('nine is refused', short.ok ? 'taken' : short.refusal, 'wrong-total')
  const over = answerFremenPlacement('fremen' as FactionId,
    [{ territoryId: among[0], count: 11 }], 'advanced')
  check('eleven is refused', over.ok ? 'taken' : over.refusal, 'wrong-total')
  // AND ONLY WHERE THE RULES SAY. Arrakeen is not one of the three.
  const elsewhere = answerFremenPlacement('fremen' as FactionId, [
    { territoryId: 'territory-13', count: 10 },
  ], 'advanced')
  check('a territory they may not use is refused',
    elsewhere.ok ? 'taken' : elsewhere.refusal, 'not-among')
  const negative = answerFremenPlacement('fremen' as FactionId, [
    { territoryId: among[0], count: 12 }, { territoryId: among[1], count: -2 },
  ], 'advanced')
  check('a negative stack is refused', negative.ok ? 'taken' : negative.refusal, 'negative')
  // A SECTOR THE TERRITORY DOES NOT HAVE is forces standing outside the storm's
  // reach, which is a way of standing outside the game.
  const badSector = answerFremenPlacement('fremen' as FactionId, [
    { territoryId: among[0], sector: 'sector-2', count: 10 },
  ], 'advanced')
  check('a sector that territory does not have is refused',
    badSector.ok ? 'taken' : badSector.refusal, 'not-among')

  // Empty stacks are dropped rather than written as zeroes on the board.
  const withZero = answerFremenPlacement('fremen' as FactionId, [
    { territoryId: among[0], count: 10 }, { territoryId: among[1], count: 0 },
  ], 'advanced')
  check('a territory given nothing gets no stack', withZero.ok ? withZero.value.length : -1, 1)

  // A FACTION THAT DOES NOT DISTRIBUTE HAS NOTHING TO ANSWER.
  const notThem = answerFremenPlacement('atreides' as FactionId, [
    { territoryId: among[0], count: 10 },
  ], 'advanced')
  check('a faction with a fixed start cannot place freely',
    notThem.ok ? 'taken' : notThem.refusal, 'not-outstanding')

  // ── the Fedaykin ────────────────────────────────────────────────────────
  // THREE OF THE TEN ARE ELITE, in the advanced game, and WHERE they stand is
  // part of the answer — real pieces in the board model, not a note on the
  // faction card.
  check('the Fremen have three Fedaykin', starredOf('fremen' as FactionId), 3)
  const starredOk = answerFremenPlacement('fremen' as FactionId, [
    { territoryId: among[0], count: 6, starred: 2 },
    { territoryId: among[1], count: 4, starred: 1 },
  ], 'advanced')
  check('a split with Fedaykin is taken', starredOk.ok, true)
  check('...and the stars ride on the forces',
    starredOk.ok ? starredOk.value.map(f => f.starred ?? 0) : [], [2, 1])
  // FEWER THAN THREE IS LEGAL — an unplaced Fedaykin waits in reserve.
  check('holding Fedaykin back is legal',
    answerFremenPlacement('fremen' as FactionId,
      [{ territoryId: among[0], count: 10, starred: 1 }], 'advanced').ok, true)
  // MORE THAN THREE IS NOT, and neither is a stack more elite than it is big.
  const fourStars = answerFremenPlacement('fremen' as FactionId, [
    { territoryId: among[0], count: 10, starred: 4 },
  ], 'advanced')
  check('a fourth Fedaykin is refused',
    fourStars.ok ? 'taken' : fourStars.refusal, 'too-many-starred')
  const denseStars = answerFremenPlacement('fremen' as FactionId, [
    { territoryId: among[0], count: 2, starred: 3 },
    { territoryId: among[1], count: 8 },
  ], 'advanced')
  check('a stack more elite than it is big is refused',
    denseStars.ok ? 'taken' : denseStars.refusal, 'too-many-starred')
  // THE BASIC GAME HAS NO ELITES: every token is plain, and a starred
  // placement is refused rather than quietly stripped.
  const basicStars = answerFremenPlacement('fremen' as FactionId, [
    { territoryId: among[0], count: 10, starred: 1 },
  ], 'basic')
  check('the basic game refuses a starred placement',
    basicStars.ok ? 'taken' : basicStars.refusal, 'too-many-starred')
  check('...but takes the same split plain',
    answerFremenPlacement('fremen' as FactionId,
      [{ territoryId: among[0], count: 10 }], 'basic').ok, true)

  // ── silence ─────────────────────────────────────────────────────────────
  const silent = defaultFremenPlacement('fremen' as FactionId, 'advanced')
  check('silence places all ten', silent.reduce((n, f) => n + f.count, 0), total)
  check('...in the first territory they may use', silent[0]?.territoryId, among[0])
  check('...Fedaykin included', silent[0]?.starred, 3)
  check('...which is a legal answer',
    answerFremenPlacement('fremen' as FactionId,
      silent.map(f => ({ territoryId: f.territoryId, count: f.count, starred: f.starred })),
      'advanced').ok, true)
  check('...in a sector that territory has', silent[0]?.sector, defaultSector(among[0]))
  check('a basic-game silence places ten plain tokens',
    defaultFremenPlacement('fremen' as FactionId, 'basic')[0]?.starred ?? 0, 0)
}

// ── the prediction ────────────────────────────────────────────────────────
{
  const seated = FACTION_IDS
  const ok = answerPrediction(seated, 'atreides' as FactionId, 7)
  check('a prediction names a faction and a turn',
    ok.ok ? ok.value : null, { faction: 'atreides', turn: 7 })

  // THEY MAY NOT PREDICT THEMSELVES. The power is calling somebody else's
  // victory; predicting your own is just playing the game.
  const self = answerPrediction(seated, 'bene-gesserit' as FactionId, 5)
  check('they cannot predict themselves', self.ok ? 'taken' : self.refusal, 'predicting-yourself')
  // NOR SOMEBODY WHO IS NOT PLAYING, which would be a prediction that cannot
  // come true and cannot be checked.
  const absent = answerPrediction(
    seated.filter(f => f !== 'emperor'), 'emperor' as FactionId, 5)
  check('...nor a faction not at the table', absent.ok ? 'taken' : absent.refusal, 'unknown-faction')

  check('turn zero is refused',
    answerPrediction(seated, 'atreides' as FactionId, 0).ok, false)
  check('turn eleven is refused',
    answerPrediction(seated, 'atreides' as FactionId, 11).ok, false)
  check('...the range being the ten turns of a game',
    [PREDICTION_TURNS.min, PREDICTION_TURNS.max], [1, 10])
  check('half a turn is refused',
    answerPrediction(seated, 'atreides' as FactionId, 3.5).ok, false)
}

// ── the traitor kept ──────────────────────────────────────────────────────
{
  const dealt = ['Lady Jessica', 'Piter De Vries', 'Alia', 'Burseg']
  const kept = answerTraitor(dealt, 'Alia')
  check('a card they hold is kept', kept.ok ? kept.value : [], ['Alia'])
  check('...one of them, not all four', kept.ok ? kept.value.length : -1, 1)
  // NAMING A CARD THEY WERE NOT DEALT is naming a card they cannot have seen.
  const notTheirs = answerTraitor(dealt, 'Stilgar')
  check('a card they were not dealt is refused',
    notTheirs.ok ? 'taken' : notTheirs.refusal, 'not-dealt')
  check('silence keeps the first dealt', defaultTraitor(dealt), ['Lady Jessica'])
  check('...and an empty deal keeps nothing', defaultTraitor([]), [])
}

// ── answers come off the outstanding list ─────────────────────────────────
{
  const opening = deal()
  let out = opening.state.setup.outstanding
  const before = out.length

  out = settle(out, 'fremen-placement', 'fremen' as FactionId)
  check('an answered decision is gone', isOutstanding(out, 'fremen-placement', 'fremen' as FactionId), false)
  check('...and only that one', out.length, before - 1)
  // NOT EVERYBODY'S. Settling by kind alone would take every seat's traitor
  // choice off the list the moment one of them answered.
  out = settle(out, 'traitor', 'atreides' as FactionId)
  check('one seat answering leaves the others outstanding',
    isOutstanding(out, 'traitor', 'emperor' as FactionId), true)
  check('...and takes that seat off it',
    isOutstanding(out, 'traitor', 'atreides' as FactionId), false)
  // Settling something nobody owes changes nothing rather than throwing.
  check('settling what nobody owes is a no-op',
    settle(out, 'prediction', 'fremen' as FactionId).length, out.length)
}

// ── the server deals it, and only the server ──────────────────────────────
{
  const fn = code('supabase/functions/dune-action/index.ts')

  check('the endpoint deals an opening position', /openingPosition\(\{/.test(fn), true)
  // SERVICE-SIDE, which is the whole reason it is an action rather than a
  // client write: match_secrets has no client write policy and match_decks has
  // no client policy at all.
  check('...writing the secrets it dealt', /p_secrets: opening\.secrets/.test(fn), true)
  check('...and the decks nobody may read', /p_decks: opening\.decks/.test(fn), true)
  check('...and the public row', /p_state: opening\.state/.test(fn), true)

  // ONCE. A second deal reshuffles every deck under six people already holding
  // their cards.
  check('a match that is already dealt is refused', /'already-started'/.test(fn), true)
  check('...on either sign of having been dealt',
    /state\.setup \|\| \(Array\.isArray\(state\.players\)/.test(fn), true)

  // SEEDED FROM THE ROW, so a deal can be replayed — and is never the same deal
  // in every match.
  check('the shuffle is seeded from the match',
    /seededRng\(Number\(match\.rng_seed\) \+ match\.action_seq\)/.test(fn), true)

  // SEAT ORDER IS THE PRINTED CIRCLE, which decides turn order and is what the
  // storm reads. The rows come back in whatever order they come back in.
  check('seats are ordered by the circle they sit at',
    /\.sort\(\(a: \{ seat: number \}, b: \{ seat: number \}\)/.test(fn), true)
  // BY THE COLUMNS IT NEEDS, not the exact list — the same lesson the match
  // row's select taught. `user_id` joined it so the deal can work out which
  // seat the host holds, and pinning the whole string made that read as a
  // broken ordering.
  // MATCHED ON 'seat', which only the roster read asks for. Matching on
  // 'faction_id' found the seat-resolution query at the top of the endpoint
  // instead — a different select, for a different job, missing the column this
  // check is about.
  const rosterSelect = (/\.select\('([^']*seat[^']*)'\)/.exec(fn) ?? [])[1] ?? ''
  check('...read off the roster',
    ['player_id', 'faction_id', 'seat'].filter(c => !rosterSelect.includes(c)), [])

  // THE CALLER IS NOT SHOWN THE DEAL. Dealing it does not make it theirs to
  // read; their own row reaches them by the secrets channel like everyone's.
  const startCase = fn.slice(fn.indexOf("case 'START_DUNE'"), fn.indexOf("case 'SETUP_ANSWER'"))
  check('the deal is there to check', startCase.length > 400, true)

  // ── AND ONE PERSON DEALS IT ──────────────────────────────────────────────
  // Six people all able to press Start is the same standoff as none of them
  // able to: the first press wins, and the other five find out the game began
  // in the mode they were still arguing about. SCOPED TO THE CASE, because
  // 'created_by' appears in the match row's select too, and a check that found
  // it there would pass with the refusal deleted.
  check('a deal is refused to anybody but the host',
    /match\.created_by !== user\.id/.test(startCase), true)
  check('...with a code saying so', /'not-the-host'/.test(startCase), true)
  // AS A REFUSAL, not as a silent no-deal: 403 is a sentence the screen can
  // show, and a table waiting on a button that did nothing is the bug this
  // whole turn started from.
  check('...and a status that is a refusal',
    /code: 'not-the-host' \}, 403\)/.test(startCase), true)
  // BY THE SEAT, not by the account. The state names factions, so the account
  // has to be turned into the seat that holds one before it goes in.
  check('the host reaches the deal as a seat',
    /host: hostSeat\?\.player_id/.test(startCase), true)
  check('...resolved off the roster by account',
    /r\.user_id === match\.created_by/.test(startCase), true)
  check('...and nothing private comes back in the response',
    /return json\(\{ setup: opening\.state\.setup, version/.test(startCase), true)
  check('...not the secrets', /json\([^)]*opening\.secrets/.test(startCase), false)
  check('...and not the decks', /json\([^)]*opening\.decks/.test(startCase), false)
}

// ── the server answers them ───────────────────────────────────────────────
{
  const fn = code('supabase/functions/dune-action/index.ts')
  const answerCase = fn.slice(fn.indexOf("case 'SETUP_ANSWER'"), fn.indexOf("case 'CLAIM_CHARITY'"))
  check('the answer case is there to check', answerCase.length > 400, true)

  // ONLY WHAT THIS SEAT OWES. myFaction comes from match_players keyed on the
  // caller's token — never from the payload, which would let a seat answer for
  // somebody else's faction.
  // ANSWERABLE, not merely owed — the advisor placement is owed from the deal
  // and cannot be answered until the Fremen have placed.
  check('an answer must be answerable by the seat that sent it',
    /answerable\(outstanding, action\.answer, myFaction\)/.test(answerCase), true)
  check('...and being blocked is said differently from owing nothing',
    /code: 'blocked'/.test(answerCase), true)
  check('...and the faction is the server\'s idea of who is asking',
    /answerFremenPlacement\(myFaction/.test(answerCase), true)

  // THE PREDICTION GOES TO ONE ROW. In public state it would be a secret
  // published in the one place everybody reads.
  check('a prediction is written to that seat\'s own row',
    /nextSecrets\[playerId\] = \{ \.\.\.\(rows\[playerId\] \?\? \{\}\), prediction/.test(answerCase), true)
  check('...and never into the public state',
    /nextState[^\n]*prediction/.test(answerCase), false)

  // THE TRAITOR IS CHECKED AGAINST WHAT THE SERVER DEALT.
  check('a kept traitor is checked against that seat\'s own deal',
    /answerTraitor\(row\.traitorsDealt \?\? \[\], String\(action\.keep\)\)/.test(answerCase), true)
  // AND THE OTHER THREE STOP BEING READABLE once one is kept, or the seat is
  // holding a record of three cards it did not keep.
  // BOTH PATHS, counted. The answered path and the timed-out path each keep
  // one card and drop three, and a check that merely found the destructure
  // somewhere passed while the answered path had lost it — the timed-out one
  // still had it, a few lines up.
  check('...and the other three are dropped from the row, on both paths',
    (answerCase.match(/traitorsDealt: _dealt, \.\.\.rest/g) ?? []).length, 2)

  // PAST THE DEADLINE, THE DEFAULTS APPLY — to everything outstanding, whoever
  // asked. A player who has walked away leaves nobody able to push it along.
  check('an expired window takes the defaults',
    /const expired = typeof setup\.closesAt === 'number' && now >= setup\.closesAt/.test(answerCase), true)
  check('...placing the Fremen where silence says, in the game\'s own mode',
    /defaultFremenPlacement\(decision\.faction, mode\)/.test(answerCase), true)
  check('...and keeping the first traitor dealt',
    /defaultTraitor\(row\.traitorsDealt \?\? \[\]\)/.test(answerCase), true)

  // READY IS THE OTHER WAY THE WINDOW SHUTS, and it is the same event: the
  // last Ready and the clock running out both close on the defaults path.
  check('the last Ready closes exactly as expiry does',
    /if \(expired \|\| everyoneReady\)/.test(answerCase), true)
  check('...judged against every seated faction',
    /allReady\(ready, seated\)/.test(answerCase), true)
  check('...and a Ready that is not the last records itself and stops',
    /action\.answer === 'ready'/.test(answerCase), true)
  // A FEDAYKIN HELD BACK WALKS INTO RESERVE, elite and plain both adjusted so
  // the sum stays what the card says.
  check('an unplaced Fedaykin moves to the starred reserve',
    /reserves: p\.reserves - held, reservesStarred: held/.test(answerCase), true)

  // SETUP ENDS BY THE KEY GOING, not by an empty list staying.
  check('the window is removed when the last answer lands',
    /delete nextState\.setup/.test(answerCase), true)
  check('...and the table stops waiting on anybody',
    /nextState\.awaiting = null/.test(answerCase), true)
}

// ── ready, as the lib carries it ──────────────────────────────────────────
{
  const four = FACTION_IDS.slice(0, 4)
  check('nobody ready is not all ready', allReady([], four), false)
  check('some ready is not all ready', allReady(four.slice(0, 3), four), false)
  check('every seat ready is all ready', allReady([...four], four), true)
  // A GHOST'S READY DOES NOT COUNT FOR A SEAT. Only the seated factions are
  // polled — a stray name in the list neither helps nor blocks.
  check('a faction not at the table cannot make it ready',
    allReady(['bene-gesserit' as FactionId], four), false)
  check('...nor stop it being ready',
    allReady([...four, 'bene-gesserit' as FactionId], four), true)
  // AN EMPTY TABLE IS NEVER READY — vacuous truth would close setup on a
  // match with nobody in it.
  check('an empty table is never ready', allReady([], []), false)
}

// ── the Bene Gesserit's one force ─────────────────────────────────────────
// ADVANCED ONLY, AND A CHOICE. In the basic game their card places them in the
// Polar Sink and there is nothing to decide. In the advanced game the same
// force is a spiritual advisor placed in any territory they like — and whether
// it IS an advisor depends on who else is standing there, which is why this is
// the one setup decision that waits on another.
{
  const advanced = deal()
  const basic = deal({ mode: 'basic' })

  const bgIn = (o: ReturnType<typeof deal>) =>
    o.state.forces.find(f => f.faction === ADVISOR_FACTION) ?? null

  // BASIC: placed by the rules, and a plain force.
  const placement = factionById(ADVISOR_FACTION)!.forces.placement
  check('in the basic game they start where their card says',
    bgIn(basic)?.territoryId, placement.kind === 'fixed' ? placement.territoryId : null)
  check('...with the one force it names', bgIn(basic)?.count, 1)
  check('...which is an ordinary fighter', bgIn(basic)?.posture ?? 'fighter', 'fighter')
  check('...and nothing to decide about it',
    basic.state.setup.outstanding.some(d => d.kind === 'advisor-placement'), false)

  // ADVANCED: the same Polar Sink force, AND a decision on top of it.
  //
  // THE ADVISOR IS A SECOND FORCE. This block used to assert the opposite —
  // that the advanced game placed nothing and the advisor was their one force
  // — which left them off the Polar Sink and a token short on the planet. The
  // basic placement is not replaced by the advanced game; it is added to.
  check('in the advanced game they hold the Polar Sink too',
    bgIn(advanced)?.territoryId, placement.kind === 'fixed' ? placement.territoryId : null)
  check('...with the same one force', bgIn(advanced)?.count, 1)
  check('...standing as a fighter', bgIn(advanced)?.posture ?? 'fighter', 'fighter')
  check('...and they owe a placement',
    isOutstanding(advanced.state.setup.outstanding, 'advisor-placement', ADVISOR_FACTION), true)

  // WHICH WAITS ON THE FREMEN, because where those ten go decides whether this
  // force is an advisor at all.
  check('...which they cannot answer yet',
    answerable(advanced.state.setup.outstanding, 'advisor-placement', ADVISOR_FACTION), false)
  check('...while everything else can be answered straight away',
    answerable(advanced.state.setup.outstanding, 'prediction', ADVISOR_FACTION), true)
  const afterFremen = settle(advanced.state.setup.outstanding, 'fremen-placement', 'fremen' as FactionId)
  check('...and can be, once the Fremen have placed',
    answerable(afterFremen, 'advisor-placement', ADVISOR_FACTION), true)

  // ── AND THE ADVISOR IS ONE OF THEIR TWENTY ──────────────────────────────
  // Not a free piece conjured for the advanced game. The reserve it leaves has
  // to go down by the one the board goes up by, or the Bene Gesserit play the
  // whole game a token richer than everybody else — the sort of edge nobody
  // notices because it never appears as an event, only as a number.
  {
    const bg = advanced.state.players.find(p => p.faction === ADVISOR_FACTION)!
    const card = factionById(ADVISOR_FACTION)!.forces
    check('before the advisor goes out they hold their full reserve',
      bg.reserves, card.reserves)
    check('...and one token on the planet', bgIn(advanced)?.count, 1)

    const sent = answerAdvisorPlacement(
      ADVISOR_FACTION, { territoryId: 'territory-20' }, advanced.state.forces)
    check('the advisor is placeable', sent.ok, true)
    const after = sent.ok ? shipAdvisor(advanced.state.players, ADVISOR_FACTION, sent.value) : []
    const bgAfter = after.find(p => p.faction === ADVISOR_FACTION)!
    check('...and comes out of the reserve', bgAfter.reserves, card.reserves - 1)
    // TWENTY, BEFORE AND AFTER. The one number that must not move.
    const onPlanet = (fs: readonly { faction: string; count: number }[]) =>
      fs.filter(f => f.faction === ADVISOR_FACTION).reduce((n, f) => n + f.count, 0)
    check('...leaving the twenty they own still twenty',
      bgAfter.reserves + onPlanet([...advanced.state.forces, ...(sent.ok ? sent.value : [])]),
      card.reserves + card.onPlanet)

    // NOBODY ELSE IS TOUCHED by a Bene Gesserit token moving.
    check('...and no other seat loses anything',
      after.filter(p => p.faction !== ADVISOR_FACTION)
        .map(p => p.reserves),
      advanced.state.players.filter(p => p.faction !== ADVISOR_FACTION)
        .map(p => p.reserves))
    // A RESERVE NEVER GOES NEGATIVE, whatever it is handed.
    check('...and a reserve is never spent past empty',
      shipAdvisor([{ faction: ADVISOR_FACTION, reserves: 0 }], ADVISOR_FACTION,
        [{ faction: ADVISOR_FACTION, territoryId: 'territory-03', sector: 'sector-1', count: 3 }])[0].reserves,
      0)
  }

  // NO FREMEN, NOTHING TO WAIT FOR. A table without them must not leave the
  // Bene Gesserit blocked on an answer nobody is going to give.
  const noFremen = openingPosition({
    seats: seats.filter(s => s.faction !== 'fremen'), mode: 'advanced', rng: counter(5),
  })
  check('with no Fremen at the table it is answerable at once',
    answerable(noFremen.state.setup.outstanding, 'advisor-placement', ADVISOR_FACTION), true)
  check('...and carries nothing to wait for',
    noFremen.state.setup.outstanding.find(d => d.kind === 'advisor-placement')?.after ?? null, null)

  // THE DEFAULTS RUN IN THAT ORDER TOO. An advisor placed before the Fremen
  // would be alone in a territory they were about to walk into.
  const order = defaultOrder(advanced.state.setup.outstanding).map(d => d.kind)
  check('the blocked decision defaults last', order[order.length - 1], 'advisor-placement')
  check('...and nothing else moved',
    [...order].sort(), advanced.state.setup.outstanding.map(d => d.kind).sort())
}

// ── advisor or fighter ────────────────────────────────────────────────────
// ALONE MEANS NOBODY ELSE'S PIECES ARE IN THE TERRITORY. An advisor with
// nobody to advise is a contradiction, and the rules resolve it by making it a
// fighter. Read off the board, never asked for.
{
  const other = (territoryId: string): Force => ({
    faction: 'atreides' as FactionId, territoryId: territoryId as Force['territoryId'],
    sector: defaultSector(territoryId), count: 3,
  })
  const SIETCH = 'territory-40'

  check('alone in a territory, they fight',
    postureFor([], SIETCH, ADVISOR_FACTION), 'fighter')
  check('with somebody else there, they advise',
    postureFor([other(SIETCH)], SIETCH, ADVISOR_FACTION), 'advisor')
  // SOMEBODY ELSE SOMEWHERE ELSE IS NOT SOMEBODY ELSE HERE.
  check('...but only somebody in the same territory',
    postureFor([other('territory-13')], SIETCH, ADVISOR_FACTION), 'fighter')
  // A STACK OF ZERO IS NOT AN OCCUPATION — the same rule the HUD follows for
  // territories emptied by a battle.
  check('an emptied stack is nobody',
    postureFor([{ ...other(SIETCH), count: 0 }], SIETCH, ADVISOR_FACTION), 'fighter')
  // AND THEIR OWN FORCES ARE NOT COMPANY.
  check('their own pieces do not make them an advisor',
    postureFor([{ ...other(SIETCH), faction: ADVISOR_FACTION }], SIETCH, ADVISOR_FACTION), 'fighter')

  // ── the answer ──────────────────────────────────────────────────────────
  // ANY TERRITORY ON THE BOARD, which is what separates this from the Fremen's
  // three. Arrakeen included, which is why the HUD has to know about advisors.
  const intoArrakeen = answerAdvisorPlacement(
    ADVISOR_FACTION, { territoryId: 'territory-13' }, [other('territory-13')])
  check('they may place anywhere', intoArrakeen.ok, true)
  check('...as one force', intoArrakeen.ok ? intoArrakeen.value[0].count : -1, 1)
  check('...advising, because somebody else is there',
    intoArrakeen.ok ? intoArrakeen.value[0].posture : null, 'advisor')

  const empty = answerAdvisorPlacement(ADVISOR_FACTION, { territoryId: SIETCH }, [])
  check('...and fighting when nobody is',
    empty.ok ? empty.value[0].posture : null, 'fighter')

  // THE FREMEN'S TEN ARE ON THE BOARD BY NOW, which is the whole point of the
  // ordering: the same territory is an advisor's or a fighter's depending on
  // whether they have already placed there.
  const fremenThere = defaultFremenPlacement('fremen' as FactionId, 'advanced')
  const afterThem = answerAdvisorPlacement(ADVISOR_FACTION, { territoryId: SIETCH }, fremenThere)
  check('placing where the Fremen just went makes an advisor',
    afterThem.ok ? afterThem.value[0].posture : null, 'advisor')

  const nowhere = answerAdvisorPlacement(ADVISOR_FACTION, { territoryId: 'territory-999' }, [])
  check('a territory the board does not have is refused',
    nowhere.ok ? 'taken' : nowhere.refusal, 'not-among')
  const badSector = answerAdvisorPlacement(
    ADVISOR_FACTION, { territoryId: SIETCH, sector: 'sector-1' }, [])
  check('a sector that territory does not have is refused',
    badSector.ok ? 'taken' : badSector.refusal, 'not-among')

  // ── silence ─────────────────────────────────────────────────────────────
  const silent = defaultAdvisorPlacement(ADVISOR_FACTION, [])
  check('silence puts them in the Polar Sink', silent[0]?.territoryId, 'territory-03')
  check('...as one force', silent[0]?.count, 1)
  check('...with its posture worked out the same way', silent[0]?.posture, 'fighter')
  check('...which is an advisor when somebody else is there',
    defaultAdvisorPlacement(ADVISOR_FACTION, [other('territory-03')])[0]?.posture, 'advisor')
}

// ── an advisor holds nothing ──────────────────────────────────────────────
// THE ONE RULE ABOUT ADVISORS THAT IS WIRED, and it had to be: their opening
// force may go into Arrakeen, and the stronghold count is the column that says
// who is winning.
{
  const inArrakeen = (posture?: Force['posture']): Force[] => [{
    faction: ADVISOR_FACTION, territoryId: 'territory-13' as Force['territoryId'],
    sector: 'sector-10' as Force['sector'], count: 1, ...(posture ? { posture } : null),
  }]
  check('a fighter in a stronghold holds it',
    strongholdsHeld(inArrakeen('fighter'), ADVISOR_FACTION), 1)
  check('...and so does a force that says nothing about it',
    strongholdsHeld(inArrakeen(), ADVISOR_FACTION), 1)
  check('an advisor in the same place holds nothing',
    strongholdsHeld(inArrakeen('advisor'), ADVISOR_FACTION), 0)
}

// ── whose table it is ─────────────────────────────────────────────────────
//
// IN THE STATE, NOT ONLY ON THE ROW. `matches.created_by` is an account id, and
// every rule that will want the host — who calls a phase on, whose clock the
// table waits for — is written in factions. Resolving it once at the deal means
// the rest of the game asks the position rather than joining back to the roster
// and hoping the account is still there.
{
  const dealt = deal({ host: seats[2].playerId })
  check('the position records whose table it is', dealt.state.host, seats[2].faction)

  // A HOST WHO IS NOT SEATED NAMES NOBODY. An id matching no seat is capable of
  // putting `undefined` in the field, which reads as a faction right up until
  // something indexes by it.
  const stray = deal({ host: 'not-at-this-table' })
  check('...and an unseated host names nobody', 'host' in stray.state, false)
  const none = deal()
  check('...as does no host at all', 'host' in none.state, false)

  // NOTHING ELSE MOVES. The host is a label on the table, not a head start:
  // the same seats, the same forces, the same purses, the same shuffle.
  //
  // The key is DELETED rather than blanked on both sides, because a spread
  // keeps insertion order and `host: null` lands mid-object on one side and
  // last on the other — which JSON.stringify reports as a difference in a deal
  // that is identical.
  const without = (s: typeof dealt.state) => {
    const copy = { ...s }
    delete copy.host
    return JSON.stringify(copy)
  }
  check('naming a host deals the same game otherwise',
    without(dealt.state), without(none.state))
}

// ── the server's fourth answer ────────────────────────────────────────────
{
  const fn = code('supabase/functions/dune-action/index.ts')
  const answerCase = fn.slice(fn.indexOf("case 'SETUP_ANSWER'"), fn.indexOf("case 'CLAIM_CHARITY'"))

  check('the endpoint takes an advisor placement',
    /action\.answer === 'advisor-placement'/.test(answerCase), true)
  // AGAINST THE BOARD AS IT STANDS, which by now has the Fremen on it. Passing
  // an empty board would make every advisor a fighter.
  check('...judged against the board as it stands',
    /answerAdvisorPlacement\([\s\S]{0,200}state\.forces/.test(answerCase), true)
  check('...as the seat the server says is asking',
    /answerAdvisorPlacement\(\s*myFaction/.test(answerCase), true)
  // AND THE TOKEN COMES OFF THE PILE. shipAdvisor holds the rule; what is
  // checked here is that the endpoint actually calls it on BOTH routes onto
  // the board. Miss either and the Bene Gesserit play a token up — silently,
  // because it never appears as an event, only as a number nobody recounts.
  check('an answered advisor comes out of reserves too',
    /players: shipAdvisor\(/.test(answerCase), true)
  check('the clock pays for the advisor out of reserves too',
    /players = shipAdvisor\(players, decision\.faction, silent\)/.test(answerCase), true)
  // AND THE TIMED-OUT PATH RESOLVES IN ORDER.
  check('the defaults run in dependency order',
    /for \(const decision of defaultOrder\(outstanding\)\)/.test(answerCase), true)
  check('...with the advisor among them',
    /defaultAdvisorPlacement\(decision\.faction, forces\)/.test(answerCase), true)
}

// ── the roster is judged before it is dealt ───────────────────────────────
// The deal is one destructive write over every hand: an undealt table can be
// fixed in the lobby, a mis-dealt one cannot be fixed at all. Two faults in
// particular produce a board that looks finished and is not, and both cost a
// real game before this existed.
{
  const { judgeSeats } = await import('@/lib/dune/setup')
  const { UNASSIGNED_FACTION } = await import('@/lib/lobby')
  const s = (faction: string, playerId: string) => ({ faction, playerId })

  check('a whole roster passes',
    judgeSeats([s('atreides', 'a'), s('harkonnen', 'h')]), null)

  // THE SENTINEL IS TRUTHY, which is exactly how it got through a !!faction_id
  // filter and into the deal, where every lookup missed: no treachery card, no
  // spice, no forces, no rules card.
  check('the unchosen sentinel is truthy — a filter on it alone lets it past',
    !!UNASSIGNED_FACTION, true)
  check('a seat that never chose is refused',
    judgeSeats([s('atreides', 'a'), s(UNASSIGNED_FACTION, 'h')]), 'seat-without-faction')
  check('...and so is an empty one', judgeSeats([s('', 'a')]), 'seat-without-faction')
  check('a faction this game does not have is refused',
    judgeSeats([s('atreides', 'a'), s('tleilaxu', 'h')]), 'unknown-faction')
  check('two seats holding one faction are refused',
    judgeSeats([s('atreides', 'a'), s('atreides', 'h')]), 'duplicate-faction')

  // THE COLLISION THAT COST THE GAME. Secrets are an object keyed by playerId,
  // so two seats sharing a key write ONE row: the later seat overwrites the
  // earlier, one player holds nothing of their own, and the public row goes on
  // advertising the hand they were dealt.
  check('two seats sharing a key are refused',
    judgeSeats([s('atreides', 'ryan'), s('harkonnen', 'ryan')]), 'duplicate-seat-key')

  // ...which is worth showing, since the refusal is the only thing standing
  // between that roster and a silent mis-deal.
  const collided = openingPosition({
    seats: [
      { faction: 'atreides', playerId: 'ryan', seat: 'player-position-1' },
      { faction: 'harkonnen', playerId: 'ryan', seat: 'player-position-2' },
    ] as never,
    mode: 'advanced', rng: counter(7), closesAt: 90_000,
  })
  check('...because the deal would write one row for the two of them',
    [Object.keys(collided.secrets).length, collided.state.players.length],
    [1, 2])

  // AND THE SERVER ACTUALLY ASKS, before it deals.
  const start = code('supabase/functions/dune-action/index.ts')
  // FROM THE CASE TO ITS OWN WRITE — apply_match_write appears six times
  // before this case, so the end of the slice is searched FROM the start of
  // it. A backwards slice is the empty string, and every claim about an empty
  // string that asks "is this absent" passes.
  const startAt = start.indexOf("case 'START_DUNE'")
  const startCase = start.slice(startAt, start.indexOf('apply_match_write', startAt))
  check('the slice actually holds the case', startCase.length > 200, true)
  check('START judges the roster before dealing',
    [/judgeSeats\(seats\)/.test(startCase),
      startCase.indexOf('judgeSeats') < startCase.indexOf('openingPosition')],
    [true, true])
  check('...and refuses rather than dealing anyway',
    /return json\(\{ error: said\[seatFault\][^)]*code: seatFault \}, 409\)/.test(startCase),
    true)
}

// ── a seat with no private row is told, not drawn empty ───────────────────
// Every route to it looks the same on screen: no treachery card, no traitors,
// and a public row still saying you hold one. The worst of them was a heal
// that blanked what it meant to restore.
{
  const match = code('src/components/dune/DuneMatchScreen.tsx')

  // ONE READ PATH. readOwnSecrets returns the secrets THEMSELVES — reaching
  // for .data on the result read undefined off a Record<string, unknown>,
  // which typechecks, and the cast swallowed the rest. Two call sites is what
  // let them drift, so there is one.
  check('nothing unwraps the read result a second time',
    /readOwnSecrets\([^)]*\)[\s\S]{0,120}?fresh\.data/.test(match), false)
  check('the heal goes through the one read path',
    /void rereadRef\.current\(\)/.test(match), true)
  check('...and that path hands setOwn what it was given',
    /const fresh = await readOwnSecrets\(matchId, seat\.playerId\)[\s\S]{0,300}setOwn\(fresh as DuneSecrets\)/
      .test(match),
    true)

  // A MISSED READ IS NOT A MISSING ROW. Only never-arrived raises the alarm.
  check('a hiccup keeps the hand rather than alarming',
    /if \(!everSeenOwn\.current\) setOwnMissing\(true\)/.test(match), true)
  check('...and anything arriving clears it',
    (match.match(/setOwnMissing\(false\)/g) ?? []).length >= 2, true)

  // SAID OUT LOUD, and only where it means something.
  check('the alarm is drawn for a seated player in a dealt game',
    /const handLost = !!seat && !spectating && ownMissing/.test(match), true)
  check('...and shows the notices strip on its own account',
    match.includes('|| handLost ||'), true)
  check('...naming what is missing rather than showing an empty tray',
    [/data-layer="hand-lost"/.test(match),
      match.includes('Your cards have not reached this browser')],
    [true, true])
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
