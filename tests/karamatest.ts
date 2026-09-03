// Karama, the proactive half. The menu is the rule here: which options a faction
// is offered IS the rules statement, and the effects mostly land in phases that
// do not exist yet.
import { readFileSync } from 'node:fs'
import { devourTerritory } from '@/lib/dune/spiceBlow'
import { stormLosses } from '@/lib/dune/storm'
import { bgFollowsShip, bgAdvancedFollow, judgeBgFlip, movementRange,
} from '@/lib/dune/shipment'
import { charityGrant, isEligibleForCharity } from '@/lib/dune/charity'
import { pendingBattles } from '@/lib/dune/battle'
import { DUNE_PHASES } from '@/types/Dune/Game'
import type { GamePhase } from '@/types/Dune/Game'
import { karamaOptions, playKarama, isKaramaFor, mayStopIn, stoppablePhases, stopTurnFor,
} from '@/lib/dune/karama'
import { TREACHERY_CARDS } from '@/data/dune/treachery'
import { FACTIONS, FACTION_IDS, canKaramaStop, factionRuleText } from '@/data/dune/factions'
import { DUNE_TERRITORIES } from '@/data/dune/boardData'
import type { FactionId } from '@/types/Dune/Faction'
import type { Force, TerritoryId } from '@/types/Dune/Game'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}
const threw = (fn: () => unknown) => { try { fn(); return false } catch { return true } }
const ids = (f: FactionId, mode: 'basic' | 'advanced') => karamaOptions(f, mode).map(o => o.id)

// ── the basic game offers the same two to everybody ─────────────────────────
for (const f of FACTION_IDS) {
  check(`basic: ${f} is offered the two on the card`,
    ids(f, 'basic'), ['guild-rate-shipment', 'free-treachery-card'])
}

// ── the advanced game adds a faction's own, and only its own ────────────────
check('advanced: Atreides gain theirs',
  ids('atreides', 'advanced'), ['guild-rate-shipment', 'free-treachery-card', 'atreides-see-battle-plan'])
check('advanced: Emperor gain theirs',
  ids('emperor', 'advanced'), ['guild-rate-shipment', 'free-treachery-card', 'emperor-free-revival'])
check('advanced: Fremen gain theirs',
  ids('fremen', 'advanced'), ['guild-rate-shipment', 'free-treachery-card', 'fremen-place-worm'])
check('advanced: the Guild gain theirs',
  ids('spacing-guild', 'advanced'), ['guild-rate-shipment', 'free-treachery-card', 'guild-stop-shipment'])
check('advanced: Harkonnen gain theirs',
  ids('harkonnen', 'advanced'), ['guild-rate-shipment', 'free-treachery-card', 'harkonnen-take-cards'])

// Two rather than three because they have nothing of their own to SPEND a Karama
// on. That is a narrower statement than "the card does nothing for them", and
// reading it the wide way was a mistake — see the worthless-card block below.
check('advanced: the Bene Gesserit still have only the two',
  ids('bene-gesserit', 'advanced'), ['guild-rate-shipment', 'free-treachery-card'])

// Stated structurally as well, so a sixth power appearing fails rather than
// quietly making the Bene Gesserit ordinary.
check('five factions gain a third option in the advanced game',
  FACTION_IDS.filter(f => ids(f, 'advanced').length === 3).sort(),
  ['atreides', 'emperor', 'fremen', 'harkonnen', 'spacing-guild'])
check('...and every faction power is offered to exactly one faction',
  FACTION_IDS.flatMap(f => ids(f, 'advanced').slice(2)).sort(),
  ['atreides-see-battle-plan', 'emperor-free-revival', 'fremen-place-worm',
    'guild-stop-shipment', 'harkonnen-take-cards'])

// ── the menu quotes the rules rather than paraphrasing them ─────────────────
// One source: the option's text comes off the faction, so a menu cannot describe
// a power differently from the data that grants it.
for (const f of ['atreides', 'emperor', 'fremen', 'spacing-guild', 'harkonnen'] as FactionId[]) {
  const own = karamaOptions(f, 'advanced')[2]
  check(`${f}: the option quotes the faction data`, own.text, FACTIONS[f]?.advanced.karama)
}
check('every option says whether it can be carried out yet — and all of them can now',
  karamaOptions('fremen', 'advanced').map(o => [o.id, o.resolvable]),
  [['guild-rate-shipment', true], ['free-treachery-card', true], ['fremen-place-worm', true]])

// ── playing one you may not ─────────────────────────────────────────────────
check('a faction cannot play another faction\'s power',
  threw(() => playKarama({ faction: 'atreides', mode: 'advanced', use: { id: 'fremen-place-worm', territoryId: 'territory-07' as TerritoryId } })), true)
check('a faction power is refused in the basic game',
  threw(() => playKarama({ faction: 'fremen', mode: 'basic', use: { id: 'fremen-place-worm', territoryId: 'territory-07' as TerritoryId } })), true)
check('the Bene Gesserit have no power to play',
  threw(() => playKarama({ faction: 'bene-gesserit', mode: 'advanced', use: { id: 'harkonnen-take-cards', target: 'atreides', count: 1 } })), true)

// ── the one effect that resolves ────────────────────────────────────────────
// The worm eats by the spice blow's own rule rather than a second copy of it,
// which is why the Fremen are spared without this file saying so.
{
  const sand = DUNE_TERRITORIES.find(t => t.terrain === 'sand' && t.id !== 'territory-05')!
  const at = (faction: string, count: number): Force =>
    ({ faction: faction as Force['faction'], territoryId: sand.id as TerritoryId,
      sector: sand.sectors[0] as Force['sector'], count })

  const out = playKarama({
    faction: 'fremen', mode: 'advanced',
    use: { id: 'fremen-place-worm', territoryId: sand.id as TerritoryId },
    forces: [at('harkonnen', 4), at('fremen', 3), at('emperor', 2)],
    spiceOnBoard: { [sand.id]: 9, 'territory-09': 6 },
  })
  check('the card is spent', out.discarded, true)
  check('nothing is owed — it happened here', out.pending, null)
  check('the worm ate where it was put', out.resolved?.devoured.territoryId, sand.id)
  check('...taking everyone but the Fremen',
    out.resolved?.devoured.forcesKilled.map(f => f.faction), ['harkonnen', 'emperor'])
  check('...and sparing them', out.resolved?.devoured.forcesSpared.map(f => f.faction), ['fremen'])
  check('the spice there goes to the bank', out.resolved?.devoured.spiceRemoved, 9)
  check('...and off the board, leaving the rest', out.resolved?.spiceOnBoard, { 'territory-09': 6 })
  check('the dead are handed over for the tanks',
    out.resolved?.toTanks.reduce((n, f) => n + f.count, 0), 6)
}

// "any sand territory that you wish" — sand, and nowhere else.
{
  const rock = DUNE_TERRITORIES.find(t => t.terrain === 'rock')!
  const hold = DUNE_TERRITORIES.find(t => t.terrain === 'stronghold')!
  const play = (id: string) => playKarama({
    faction: 'fremen', mode: 'advanced', use: { id: 'fremen-place-worm', territoryId: id as TerritoryId },
  })
  check('a worm cannot be placed on rock', threw(() => play(rock.id)), true)
  check('...nor in a stronghold', threw(() => play(hold.id)), true)
  check('...nor in a territory that does not exist', threw(() => play('territory-99')), true)
}

// ── the six that cannot happen yet ──────────────────────────────────────────
// The card is still spent. A Karama played into an unbuilt phase is a Karama
// played, and the alternative — refusing it — would be inventing a rule.
{
  const cases: [FactionId, Parameters<typeof playKarama>[0]['use']][] = [
    ['atreides', { id: 'guild-rate-shipment' }],
    ['atreides', { id: 'free-treachery-card' }],
    ['atreides', { id: 'atreides-see-battle-plan', target: 'harkonnen' }],
    ['emperor', { id: 'emperor-free-revival', revive: 'leader' }],
    ['spacing-guild', { id: 'guild-stop-shipment', target: 'fremen' }],
    ['harkonnen', { id: 'harkonnen-take-cards', target: 'atreides', count: 2 }],
  ]
  for (const [faction, use] of cases) {
    const out = playKarama({ faction, mode: 'advanced', use })
    check(`${use.id}: the card is spent anyway`, out.discarded, true)
    check(`${use.id}: nothing resolved`, out.resolved, null)
    check(`${use.id}: what is owed is recorded`, typeof out.pending === 'string' && out.pending.length > 0, true)
  }
}

// ── what counts AS a Karama ─────────────────────────────────────────────────
// A different question from what a Karama buys, and the one the Bene Gesserit
// changed. Their advanced power makes worthless cards Karamas; everyone else has
// only the two Karama cards in the deck.
{
  const karama = TREACHERY_CARDS.find(c => c.id === 'karama')!
  const lalala = TREACHERY_CARDS.find(c => c.kind === 'worthless')!
  const shield = TREACHERY_CARDS.find(c => c.id === 'shield')!

  for (const f of FACTION_IDS) {
    check(`${f}: the Karama card is a Karama`, isKaramaFor(f, 'advanced', karama), true)
  }
  check('advanced: a worthless card is a Karama for the Bene Gesserit',
    isKaramaFor('bene-gesserit', 'advanced', lalala), true)
  check('...and for nobody else',
    FACTION_IDS.filter(f => f !== 'bene-gesserit' && isKaramaFor(f, 'advanced', lalala)), [])
  check('...and not in the basic game, where the power does not exist',
    isKaramaFor('bene-gesserit', 'basic', lalala), false)
  check('a Shield is never a Karama for anyone',
    FACTION_IDS.filter(f => isKaramaFor(f, 'advanced', shield)), [])

  // The size of the power, which the rules text does not say out loud: two
  // Karama cards exist and five worthless ones, so the faction that can play
  // worthless as Karama can hold more than everyone else put together.
  const karamas = TREACHERY_CARDS.filter(c => c.id === 'karama').reduce((n, c) => n + c.copies, 0)
  const worthless = TREACHERY_CARDS.filter(c => c.kind === 'worthless').reduce((n, c) => n + c.copies, 0)
  check('two Karamas in the deck against five worthless', [karamas, worthless], [2, 5])
  check('so the Bene Gesserit can play more Karamas than exist as Karama cards',
    worthless > karamas, true)

  // Playing one gets the ordinary menu: what it counts as changed, what it buys
  // did not.
  check('a worthless card played as a Karama buys the same two things',
    karamaOptions('bene-gesserit', 'advanced').map(o => o.id),
    ['guild-rate-shipment', 'free-treachery-card'])
}

// The rule has to stay written down as well as implemented, since the mechanic
// and the prose can be edited apart.
check('the Bene Gesserit rules say worthless cards are Karamas',
  /Worthless Card as though it were a Karama/i.test(
    FACTIONS['bene-gesserit']?.advanced.treachery ?? ''), true)

// ── the reactive half, and the doors ──────────────────────────────────────
{
  const { isSuppressed, suppressibleRefs, karamaAllowed, isKaramaCardId,
    KARAMA_GIVE_SECONDS } = await import('@/lib/dune/karama')
  check('the give-back clock is a minute', KARAMA_GIVE_SECONDS, 60)

  check('the stop menu offers what resolves, never a win condition',
    [suppressibleRefs('fremen', 'advanced').some(r => r.ref === 'specialVictory'),
      suppressibleRefs('spacing-guild', 'advanced').some(r => r.ref === 'specialVictory'),
      suppressibleRefs('bene-gesserit', 'advanced').some(r => r.ref === 'abilities.beforeGame'),
      suppressibleRefs('atreides', 'advanced').some(r => r.ref === 'abilities.bidding'),
      suppressibleRefs('harkonnen', 'advanced').some(r => r.ref === 'abilities.treachery')],
    [false, false, false, true, true])
  // ── what a Karama can and cannot interrupt ──────────────────────────────
  // The menu used to be every rule with prose minus the win conditions, which
  // offered things no card can stop. A Karama interrupts something HAPPENING,
  // so three kinds are absent by decision rather than by oversight, and these
  // checks are what stop them drifting back in.

  // NOTHING FROM THE START OF THE GAME. It has already happened, and in the
  // Harkonnen case the card says so itself.
  check('what a faction was dealt at the start cannot be stopped',
    [suppressibleRefs('harkonnen', 'advanced').some(r => r.ref === 'abilities.traitors'),
      suppressibleRefs('bene-gesserit', 'advanced').some(r => r.ref === 'advanced.beforeGame')],
    [false, false])

  // NOR A STANDING PROPERTY OF A HAND. Holding eight cards is not a moment.
  // What CAN be stopped is the extra card, which happens during the bidding.
  check('a hand size cannot be stopped, but the extra card can',
    suppressibleRefs('harkonnen', 'advanced').find(r => r.ref === 'abilities.treachery')?.text,
    'The extra Treachery Card they draw whenever they buy one.')

  // NOR ANOTHER FACTION'S OWN KARAMA — a card cannot cancel the thing it is.
  check('no Karama use is offered, for any faction',
    FACTION_IDS.flatMap(id => suppressibleRefs(id, 'advanced'))
      .filter(r => r.ref === 'advanced.karama').length,
    0)
  check('...and the Bene Gesserit worthless-as-Karama goes with them',
    suppressibleRefs('bene-gesserit', 'advanced').some(r => r.ref === 'advanced.treachery'), false)

  // WHAT IS OFFERED IS SHORT, and its own line rather than the rules card.
  // The card stays whole — it is what a player reads about themselves — and a
  // paragraph in a stop menu is a paragraph nobody reads.
  check('every offer is one short line',
    FACTION_IDS.flatMap(id => suppressibleRefs(id, 'advanced'))
      .filter(r => r.text.length > 110).map(r => r.ref),
    [])
  check('...and no offer is just the rules card paragraph',
    FACTION_IDS.flatMap(id => suppressibleRefs(id, 'advanced')
      .filter(r => r.text === factionRuleText(FACTIONS[id]!, r.ref))
      .map(r => `${id}.${r.ref}`)),
    [])

  // AND THE CURATED LIST IS THE SOURCE. A rule missing from karamaStops is
  // not offered however much prose it has.
  // ── every offer bites, and the source is what says so ──────────────────
  // THE INCREMENTAL RULE FAILED TWICE. "A check arrives with its ability" is
  // the right rule and nobody kept it: the Fremen desert ride shipped without
  // one, and so did eighteen more, and the only way anybody found out was by
  // reading the list. A rule that depends on remembering is a rule that is
  // already broken, so it is enforced here instead.
  //
  // HOW A CHECK IS FOUND. Most call sites name their faction and rule as
  // literals, but two name them through a variable — `myFaction`, and the
  // BONUS_FACTION constant that exists to be the single answer to who gets
  // the bonus card — so the pair cannot always be read off the call. Each
  // check therefore carries a marker naming what it guards, AND the marker
  // must be followed by a real isSuppressed call: a comment on its own proves
  // nothing, which is exactly the failure mode a comment-only scheme would
  // have.
  {
    const endpoint = readFileSync('supabase/functions/dune-action/index.ts', 'utf8')
    const lines = endpoint.split(/\r?\n/)
    const guarded = new Set<string>()
    const hollow: string[] = []
    lines.forEach((line, i) => {
      const m = /\/\/ KARAMA-STOP: ([a-z-]+) ((?:abilities|advanced)\.[a-zA-Z]+(?:#[a-zA-Z]+)?)/.exec(line)
      if (!m) return
      // the check itself, within a few lines of the marker that claims it
      const near = lines.slice(i, i + 6).join(' ')
      if (/isSuppressed\(/.test(near)) guarded.add(`${m[1]}|${m[2]}`)
      else hollow.push(`${m[1]}.${m[2]}`)
    })
    check('no marker stands without a check under it', hollow, [])

    const declared = FACTION_IDS.flatMap(id =>
      Object.entries(FACTIONS[id]!.karamaStops)
        .filter(([, stop]) => stop!.enforced)
        .map(([ref]) => `${id}|${ref}`))

    // BOTH DIRECTIONS. A flag with no check is a promise the game cannot
    // keep; a check with no flag is enforcement nobody is allowed to buy.
    check('every enforced flag has a check where the rule fires',
      declared.filter(k => !guarded.has(k)), [])
    check('...and every check belongs to an enforced flag',
      [...guarded].filter(k => !declared.includes(k)), [])

    // AND THE MENU IS EXACTLY THE ENFORCED SET — an unenforced stop takes the
    // card, discards it publicly, announces itself, and changes nothing.
    check('the menu offers exactly what is enforced',
      FACTION_IDS.flatMap(id => suppressibleRefs(id, 'advanced').map(r => `${id}|${r.ref}`)).sort(),
      [...declared].sort())
  }

  // ── a stop may be played ahead of the moment ───────────────────────────
  // "BEFORE YOU SHIP, KARAMA" is how the card is actually played at a table,
  // and it has to be: some advantages fire in the same breath as their phase
  // begins, with nothing between the two for anybody to answer in. The Guild
  // naming its place in the shipping order is the plainest case — the window
  // opens in the very write that sets the phase, so a stop stamped with the
  // phase already running could never once have fired.
  {
    check('silence still means this phase',
      mayStopIn('Bidding', 'Bidding'), true)
    check('...and any phase still to come this turn may be named',
      ['Revival', 'Shipment and Movement', 'Battles', 'Mentat Pause']
        .map(ph => mayStopIn('Bidding', ph as never)),
      [true, true, true, true])

    // NOT BACKWARDS. A phase already past is a moment that cannot be
    // interrupted, and offering it would be selling a stop that lands on
    // nothing.
    check('a phase already gone cannot be named',
      ['Storm', 'Spice Blow and Nexus', 'CHOAM Charity']
        .map(ph => mayStopIn('Bidding', ph as never)),
      [false, false, false])

    // ── AND THE COMING STORM, from the Pause ─────────────────────────────
    // The Storm is the FIRST phase of a turn, so nothing earlier in that turn
    // can name it — and since the storm rolls, moves and tells the Fremen
    // their next distance in one press, there is no moment inside the phase to
    // answer either. Two stops sat on the menu that could not once have fired.
    //
    // The Pause is the moment immediately before the next storm, which is the
    // same reasoning that moved Family Atomics and Weather Control there.
    check('the last phase of a turn offers itself and the coming storm',
      stoppablePhases('Mentat Pause'), ['Mentat Pause', 'Storm'])
    check('...and that Storm is next turn\'s, not the one long past',
      [stopTurnFor('Mentat Pause', 'Storm', 7),
        stopTurnFor('Mentat Pause', 'Mentat Pause', 7)],
      [8, 7])
    check('...while nowhere else reaches across the turn',
      ['Bidding', 'Battles', 'Spice Collection']
        .map(ph => stopTurnFor(ph as never, 'Battles' as never, 7)),
      [7, 7, 7])

    // NOBODY ELSE MAY NAME THE STORM. From mid-turn this turn's storm has
    // blown and next turn's is two phases past the card's reach.
    check('only the Pause reaches the storm',
      ['Bidding', 'Revival', 'Battles', 'Spice Collection']
        .map(ph => mayStopIn(ph as never, 'Storm')),
      [false, false, false, false])

    // AND THE TWO STOPS THAT NEEDED IT ARE REACHABLE NOW. Both are checked
    // against the Storm phase, and before this there was no phase a player
    // could be in that could name it.
    check('the Fremen storm stops can actually be bought',
      [mayStopIn('Mentat Pause', 'Storm'),
        suppressibleRefs('fremen', 'advanced').some(r => r.ref === 'advanced.storm'),
        suppressibleRefs('fremen', 'advanced').some(r => r.ref === 'advanced.spiceBlow')],
      [true, true, true])
    check('the first offers the whole turn', stoppablePhases('Storm').length, 9)
    check('...beginning with the one being played in',
      stoppablePhases('Revival')[0], 'Revival')

    // ONE PHASE, NAMED — not a turn-long shadow. Every offer is a real phase
    // and no two are the same, or a picker would show a duplicate and a stamp
    // could match a moment nobody meant.
    check('the offers are real phases, each once',
      (() => {
        const all = stoppablePhases('CHOAM Charity')
        return [new Set(all).size === all.length,
          all.every(ph => (DUNE_PHASES as readonly string[]).includes(ph))]
      })(), [true, true])

    // ── the endpoint takes the name, and refuses a past one ──────────────
    const ep2 = readFileSync('supabase/functions/dune-action/index.ts', 'utf8')
    const stopCase = (() => {
      const at = ep2.indexOf("case 'KARAMA_STOP': {")
      const rest = ep2.slice(at + 1)
      const end = rest.search(/\n {4}case '/)
      return end < 0 ? ep2.slice(at) : ep2.slice(at, at + 1 + end)
    })()
    check('the action takes a phase, defaulting to the live one',
      [stopCase.includes('const sPhase = action.phase == null'),
        stopCase.includes('? String(state.phase)')], [true, true])
    check('...judged by the rule rather than by a test written twice',
      stopCase.includes('if (!mayStopIn(state.phase as never, sPhase as never)) {'), true)
    check('...on the turn the rule names, not always the live one',
    [stopCase.includes('const sTurn = stopTurnFor('),
      stopCase.includes('turn: sTurn, phase: sPhase,'),
      stopCase.includes('turn: Number(state.turn ?? 0), phase: sPhase,')],
    [true, true, false])
  check('...and the suppression is stamped with the phase that was named',
      [stopCase.includes('phase: sPhase,'),
        stopCase.includes('phase: state.phase,')], [true, false])

    // AND THE PICKER DRAWS ON THE SAME RULE, so nothing is offered that the
    // server would refuse.
    const panel = readFileSync('src/components/dune/KaramaPanel.tsx', 'utf8')
    check('the panel asks when, out of the same list',
      [panel.includes('const whenChoices = stoppablePhases(phase)'),
        panel.includes('data-karama-stop-when')], [true, true])
    check('...and hands the answer to the caller',
      panel.includes('onStop(cardId, stopTarget, stopRef, stopWhen)'), true)
  }

  // ── and the two that could never fire, can ─────────────────────────────
  // Both fire at a PHASE ENTRY, which is the one moment no card can be played
  // into: the window and the phase arrive in the same write. Naming the phase
  // from the one before it is the whole of the fix.
  {
    check('the Guild\'s turn order can be stopped from an earlier phase',
      ['Bidding', 'Revival'].map(ph =>
        mayStopIn(ph as never, 'Shipment and Movement')), [true, true])
    check('...and their menu still offers it',
      suppressibleRefs('spacing-guild', 'advanced').some(r => r.ref === 'advanced.shipment'), true)

    // THE FREMEN STORM IS ONLY HALF REACHED BY THIS, and the suite says so
    // rather than implying otherwise: their foreknowledge is delivered at the
    // END of the Storm phase, and Storm is the FIRST phase of a turn — so
    // there is no earlier phase of that turn to name it from. It is reachable
    // when the Storm phase has a beat somebody can act in (turn one, and any
    // turn where the Family Atomics window opens) and not otherwise.
    check('no earlier phase of the same turn exists to name Storm from',
      stoppablePhases('Storm')[0], 'Storm')
  }

  // ── a stop reaches the thing it was played against ─────────────────────
  // A KARAMA IS PLAYED IN ANSWER TO SOMETHING. The Voice and the Atreides
  // question both open with the battle, so a stop that read only at the open
  // could never reach the battle it was spent on — the card was good against
  // the NEXT fight and useless against this one, which is not what anybody
  // spends a Karama for. Both are asked again where they are used.
  {
    const ep = readFileSync('supabase/functions/dune-action/index.ts', 'utf8')
    // THE CASE, TO ITS END, rather than a fixed number of characters after it.
    // A window has to be re-tuned every time a comment grows inside the block
    // it is watching, and a pin that needs re-tuning to keep passing is a pin
    // that will one day be re-tuned into agreeing with a bug — this one had
    // already been widened once. The next case label is where this one stops.
    const inCase = (name: string) => {
      const at = ep.indexOf(`case '${name}': {`)
      if (at < 0) return ''
      const rest = ep.slice(at + 1)
      const end = rest.search(/\n {4}case '/)
      return end < 0 ? ep.slice(at) : ep.slice(at, at + 1 + end)
    }

    const voice = inCase('BATTLE_VOICE')
    check('the Voice is refused while it is stopped',
      [voice.includes("'bene-gesserit' as never, 'abilities.battle' as never"),
        voice.includes("code: 'karama-stopped'")], [true, true])

    const pres = inCase('BATTLE_PRESCIENCE')
    check('the question is refused while it is stopped',
      [pres.includes("'atreides' as never, 'abilities.battle' as never"),
        pres.includes("code: 'karama-stopped'")], [true, true])

    // AND A STOP TAKES BACK WHAT IS STILL BEING LOOKED AT. The Atreides
    // bidding reveal sits in their own row from the moment a card opens, so
    // stopping the advantage without clearing it left the card actually up for
    // bid readable for the rest of its auction — a card spent on the next one.
    const stop = inCase('KARAMA_STOP')
    check('stopping the Atreides sight clears the card they are holding',
      [stop.includes("sTarget === 'atreides' && sRef === 'abilities.bidding'"),
        stop.includes('delete seen[REVEAL_KEY]'),
        stop.includes('p_secrets: { ...sTakeBack,')], [true, true, true])
    // AND ONLY WHEN IT BITES NOW. A card naming a later phase has not happened
    // yet, so the reveal in their tray is still theirs to read until it does.
    check('...but not when the stop is named for a later phase',
      stop.includes('&& sPhase === String(state.phase)'), true)

    // AND STILL AT THE OPEN. Refusing the use without also declining to open
    // the window would leave a battle stalled on a beat nobody may answer.
    check('...and the windows still decline to open',
      [ep.includes("if (isSuppressed((state.suppressed ?? []) as never,"),
        ep.includes('const presWanted = (hasAtreides || !!presProxy)')],
      [true, true])
  }

  // ── the menu is the game being played ──────────────────────────────────
  // HALF THESE ADVANTAGES ARE NOT IN A BASIC GAME. Sardaukar counting double,
  // the Fremen storm foreknowledge, the Guild going out of turn — all live on
  // the advanced side of the sheet and do nothing whatever without it. The
  // menu offered them anyway, so a basic game could sell a stop against
  // something that was never going to happen: the same broken promise as an
  // unenforced stop, and the same card spent to find out.
  {
    const basic = FACTION_IDS.flatMap(id => suppressibleRefs(id, 'basic').map(r => r.ref))
    const advanced = FACTION_IDS.flatMap(id => suppressibleRefs(id, 'advanced').map(r => r.ref))

    check('a basic game offers no advanced rule',
      basic.filter(r => r.startsWith('advanced.')), [])
    check('...and the advanced game offers several',
      advanced.filter(r => r.startsWith('advanced.')).length > 0, true)

    // THE BASIC LIST IS THE ADVANCED ONE MINUS THE ADVANCED RULES, not a
    // separately curated thing that could drift.
    check('everything a basic game offers, an advanced one offers too',
      basic.filter(r => !advanced.includes(r)), [])
    check('...and what it drops is exactly the advanced entries',
      advanced.filter(r => !basic.includes(r)).sort(),
      advanced.filter(r => r.startsWith('advanced.')).sort())

    // AND THE ABILITIES SURVIVE, or a basic game would offer nothing at all.
    check('the basic game still has stops worth buying', basic.length > 0, true)
  }

  // ── the six Bene Gesserit stops ────────────────────────────────────────
  // THEIR WHOLE ADVANCED GAME IS THE ADVISOR, and it was the largest cluster
  // of built-but-unguarded rules left. Taken as one piece because they are one
  // idea: a faction that sits in everybody's ground without fighting, follows
  // every shipment, and is never short of spice.
  //
  // EACH IN BOTH DIRECTIONS. That stopping it changes the outcome, and that
  // stopping it leaves everybody else exactly where they were — the second is
  // what catches a check written against the wrong seat.
  {
    // 1. the free force into the Polar Sink, basic game
    check('a stopped Sisterhood sends nobody to the Polar Sink',
      [bgFollowsShip('atreides' as never, 'off-planet' as never, 'basic' as never),
        bgFollowsShip('atreides' as never, 'off-planet' as never, 'basic' as never, true)],
      [true, false])

    // 2. the advisor that follows a shipment, advanced game
    check('...and no advisor follows a shipment either',
      [bgAdvancedFollow('atreides' as never, 'off-planet' as never, 'advanced' as never),
        bgAdvancedFollow('atreides' as never, 'off-planet' as never, 'advanced' as never, true)],
      [true, false])

    // 3. the flat two at charity
    // THE THRESHOLD COMES BACK, they are not barred outright: a poor
    // Sisterhood still qualifies the way anybody poor does.
    const rich = { spice: 10 } as never
    const poor = { spice: 1 } as never
    check('a stopped Sisterhood is topped up like anybody else',
      [charityGrant(rich, 'bene-gesserit' as never, 'advanced'),
        charityGrant(rich, 'bene-gesserit' as never, 'advanced', true)],
      [2, 0])
    check('...and a poor one still qualifies on the ordinary rule',
      [charityGrant(poor, 'bene-gesserit' as never, 'advanced', true),
        isEligibleForCharity(poor, 'bene-gesserit' as never, 'advanced', true)],
      [1, true])
    check('...while nobody else\'s charity moves with it',
      [charityGrant(rich, 'atreides' as never, 'advanced'),
        charityGrant(rich, 'atreides' as never, 'advanced', true)],
      [0, 0])

    // 4. advisors sharing ground without a fight
    const watched = [
      { faction: 'bene-gesserit', territoryId: 'territory-13', sector: 'sector-10',
        count: 2, posture: 'advisor' },
      { faction: 'atreides', territoryId: 'territory-13', sector: 'sector-10', count: 3 },
    ] as never[]
    check('a stopped advisor is just a force standing where it should not be',
      [pendingBattles(watched, 'sector-1' as never).length,
        pendingBattles(watched, 'sector-1' as never, true).length],
      [0, 1])
    check('...and the fight it opens is the two of them',
      pendingBattles(watched, 'sector-1' as never, true)[0]?.factions.slice().sort(),
      ['atreides', 'bene-gesserit'])

    // 5 & 6. the two flips
    const ground = [
      { faction: 'bene-gesserit', territoryId: 'territory-13', sector: 'sector-10',
        count: 2, posture: 'advisor' },
      { faction: 'atreides', territoryId: 'territory-13', sector: 'sector-10', count: 3 },
    ] as never[]
    check('standing advisors up can be stopped',
      [judgeBgFlip({
        direction: 'to-fighter', territoryId: 'territory-13',
        forces: ground, phase: 'Bidding', turn: 4,
      }), judgeBgFlip({
        direction: 'to-fighter', territoryId: 'territory-13',
        forces: ground, phase: 'Bidding', turn: 4, suppressed: true,
      })],
      [null, 'karama-stopped'])

    const standing = [
      { faction: 'bene-gesserit', territoryId: 'territory-13', sector: 'sector-10', count: 2 },
      { faction: 'atreides', territoryId: 'territory-13', sector: 'sector-10', count: 3 },
    ] as never[]
    check('...and so can going to ground',
      [judgeBgFlip({
        direction: 'to-advisor', territoryId: 'territory-13',
        forces: standing, phase: 'Shipment and Movement', turn: 4,
      }), judgeBgFlip({
        direction: 'to-advisor', territoryId: 'territory-13',
        forces: standing, phase: 'Shipment and Movement', turn: 4, suppressed: true,
      })],
      [null, 'karama-stopped'])

    // AND THE TWO DIRECTIONS ARE TWO STOPS. One Karama does not buy both.
    const ep6 = readFileSync('supabase/functions/dune-action/index.ts', 'utf8')
    const bgf = ep6.slice(ep6.indexOf("case 'BG_FLIP'"), ep6.indexOf("case 'BG_POLICY'"))
    check('the flip asks about the direction being attempted',
      /direction === 'to-fighter' \? 'advanced\.battle' : 'advanced\.fighters'/.test(bgf),
      true)
    check('...scoped to the phase it is played in, since the window spans three',
      /Number\(state\.turn \?\? 0\), state\.phase as never\)/.test(bgf), true)

    // ALL SIX ARE OFFERED NOW, and the structural guard above has already
    // insisted each has a marker and a real check behind it.
    check('the Sisterhood\'s six are on the menu',
      suppressibleRefs('bene-gesserit', 'advanced').map(r => r.ref).sort(),
      ['abilities.battle', 'abilities.shipment', 'advanced.advisors',
        'advanced.battle', 'advanced.charity', 'advanced.fighters',
        'advanced.shipment'])
  }

  // ── the desert's second step ────────────────────────────────────────────
  // Two territories instead of one, and only the second step: flying three
  // out of Arrakeen or Carthag belongs to whoever holds the city and is
  // nobody's faction advantage, so a stopped Fremen holding one still flies.
  {
    check('a stopped Fremen walks one like anybody else',
      [movementRange('fremen' as never, []), movementRange('fremen' as never, [], true)],
      [2, 1])
    check('...and nobody else\'s walk moves with it',
      [movementRange('atreides' as never, []),
        movementRange('atreides' as never, [], true)],
      [1, 1])

    // THE CITIES ARE NOT THEIRS TO LOSE. Ornithopters carry the faction that
    // holds Arrakeen or Carthag, whoever that is, and no Karama aimed at the
    // Fremen takes them away.
    const inCarthag = [
      { faction: 'fremen', territoryId: 'territory-26', sector: 'sector-10', count: 1 },
    ] as never[]
    check('a stopped Fremen holding a city still flies three',
      [movementRange('fremen' as never, inCarthag),
        movementRange('fremen' as never, inCarthag, true)],
      [3, 3])

    // ── the board and the server agree ────────────────────────────────────
    // moveTargets draws the rings and judgeMove judges them; the suite sweeps
    // the two against each other cell by cell elsewhere. A stop the endpoint
    // knows about and the board does not would put a ring on a refusal.
    const ep7 = readFileSync('supabase/functions/dune-action/index.ts', 'utf8')
    const screen7 = readFileSync('src/components/dune/DuneGameScreen.tsx', 'utf8')
    check('the endpoint asks before it judges a move',
      [/const stepStopped = isSuppressed\(/.test(ep7),
        /suppressed: stepStopped,/.test(ep7)], [true, true])
    check('...and the board asks the same thing before it rings',
      /suppressed: isSuppressed\(state\.suppressed \?\? \[\], seat,/.test(screen7), true)
  }

  // ── the last five ──────────────────────────────────────────────────────
  {
    // 1. THE WORM EATS THEM. Their immunity is the advantage, and the ally's
    // shield is that immunity lent out — stopped, there is nothing to lend,
    // so sparing the ally while the Fremen burn would be a protection the
    // sheet never grants on its own.
    const inWormGround = [
      { faction: 'fremen', territoryId: 'territory-13', sector: 'sector-10', count: 3 },
      { faction: 'atreides', territoryId: 'territory-13', sector: 'sector-10', count: 2 },
    ] as never[]
    check('a stopped Fremen is devoured with everybody else',
      [devourTerritory(
        'territory-13' as never, inWormGround, {}, 'atreides' as never,
      ).forcesKilled.length,
      devourTerritory(
        'territory-13' as never, inWormGround, {}, 'atreides' as never, true,
      ).forcesKilled.length],
      [0, 2])
    check('...and the ally they were shielding goes with them',
      devourTerritory(
        'territory-13' as never, inWormGround, {}, 'atreides' as never, true,
      ).forcesSpared, [])

    // 2. HALF LOSSES IN A STORM. Same sheet entry as the worm placement,
    // different phase — so a stop aimed at the storm and one aimed at the
    // blow are two different cards.
    const burning = { faction: 'fremen', territoryId: 'territory-13',
      sector: 'sector-10', count: 5 } as never
    check('a stopped Fremen burns whole in a storm',
      [stormLosses(burning, 'advanced'), stormLosses(burning, 'advanced', true)],
      [3, 5])
    check('...and nobody else\'s storm losses move with it',
      (() => {
        const other = { faction: 'atreides', territoryId: 'territory-13',
          sector: 'sector-10', count: 5 } as never
        return [stormLosses(other, 'advanced'), stormLosses(other, 'advanced', true)]
      })(), [5, 5])
    check('...and the basic game was never halving anyway',
      [stormLosses(burning, 'basic'), stormLosses(burning, 'basic', true)],
      [5, 5])

    // 3, 4, 5 fire in the endpoint, which is where they are pinned.
    const ep8 = readFileSync('supabase/functions/dune-action/index.ts', 'utf8')

    check('the Atreides glimpse writes nothing at all when stopped',
      [/const glimpseStopped = isSuppressed\(/.test(ep8),
        /if \(seerSeat && !glimpseStopped\)/.test(ep8)], [true, true])

    check('the sleeper stays asleep',
      /available: !isSuppressed\([\s\S]{0,200}?&& kwisatzHaderachAvailable\(/.test(ep8),
      true)

    check('the prisoner is never offered, so the beat never opens',
      [/const captureStopped = isSuppressed\(/.test(ep8),
        /const pool = captiveFrom && !captureStopped/.test(ep8)], [true, true])

    // THE RIDE AND THE PLACEMENT are refusals rather than silent no-ops: the
    // Fremen are looking at a control and pressing it, and a control that
    // answers with nothing is worse than one that says why.
    check('the ride and the placement refuse out loud',
      (ep8.match(/code: 'karama-stopped',/g) ?? []).length >= 2, true)
    check('...the ride against abilities.shaiHulud, in the blow',
      /'fremen' as never, 'abilities\.shaiHulud' as never,[\s\S]{0,80}?Spice Blow and Nexus/
        .test(ep8), true)
    check('...and the placement against advanced.spiceBlow, in the same phase',
      /'fremen' as never, 'advanced\.spiceBlow' as never,[\s\S]{0,80}?Spice Blow and Nexus/
        .test(ep8), true)
    check('...while the half-loss stop names the Storm instead',
      /'fremen' as never, 'advanced\.spiceBlow' as never,[\s\S]{0,80}?'Storm' as never/
        .test(ep8), true)
  }

  // ── and that is all of them ────────────────────────────────────────────
  check('every curated stop is enforced, and the menu is the whole list',
    FACTION_IDS.flatMap(id => Object.entries(FACTIONS[id]!.karamaStops)
      .filter(([, st]) => !st!.enforced)
      .map(([ref]) => `${id}.${ref}`)),
    [])

  // ── every stop can be reached by somebody ──────────────────────────────
  // THE GUARD ABOVE PROVES A CHECK EXISTS. It does not prove any player can
  // ever be in a position to buy it, and for two stops the answer was no: the
  // Fremen storm foreknowledge and their half share of a storm are both
  // checked against the Storm phase, and the Storm is the FIRST phase of a
  // turn. Nothing earlier in that turn could name it. They sat on the menu
  // taking cards and doing nothing, and were found by being asked about twice
  // rather than by anything failing.
  //
  // WHAT MAKES A PHASE REACHABLE. A rule that fires on a player ACTION is
  // reachable from its own phase: the action has to be sent, and a Karama can
  // be sent first. A rule that fires as the phase is ENTERED cannot be — the
  // entry happens in the same write that sets the phase, so there is no
  // moment inside it to act in, and something EARLIER must be able to name it.
  //
  // Which is which is read off where the marker sits: inside advancePhase is
  // an entry, anywhere else is an action.
  {
    const ep = readFileSync('supabase/functions/dune-action/index.ts', 'utf8')
    const entryFrom = ep.indexOf('async function advancePhase(')
    const entryTo = ep.indexOf('const answer = await (async (): Promise<Response> => {')
    check('advancePhase was found, and the action switch after it',
      [entryFrom > 0, entryTo > entryFrom], [true, true])

    const unreachable: string[] = []
    const lines = ep.split(/\r?\n/)
    let at = 0
    for (const line of lines) {
      const here = at
      at += line.length + 1
      const m = /\/\/ KARAMA-STOP: ([a-z-]+) ([a-zA-Z.#]+)/.exec(line)
      if (!m) continue
      // the phase the check beneath this marker names
      const near = ep.slice(here, here + 420)
      // SCOPED TO THE LIVE PHASE is its own answer. A check written against
      // `state.phase` bites in whatever phase the action arrived in, which
      // means it fires on an action by construction — the Bene Gesserit flips
      // are the case, since their stand-up window spans three phases.
      if (/Number\(state\.turn \?\? 0\), state\.phase as never\)/.test(near)) continue
      const ph = /'([A-Z][^']*)' as never\)/.exec(near)?.[1] as GamePhase | undefined
      if (!ph || !(DUNE_PHASES as readonly string[]).includes(ph)) {
        unreachable.push(`${m[1]}.${m[2]} — no phase named under the marker`)
        continue
      }
      const firesAtEntry = here > entryFrom && here < entryTo
      if (!firesAtEntry) continue
      // SOMETHING EARLIER MUST BE ABLE TO NAME IT.
      const namers = (DUNE_PHASES as readonly GamePhase[])
        .filter(c => c !== ph && mayStopIn(c, ph))
      if (namers.length === 0) {
        unreachable.push(
          `${m[1]}.${m[2]} — fires as ${ph} is entered, and no other phase can name ${ph}`)
      }
    }
    check('no stop fires in a phase nobody could have named', unreachable, [])

    // AND THE ONE THAT NEEDED THE CROSSING still needs it: if the Pause ever
    // stops reaching the coming storm, the scan above must go red rather than
    // the two Fremen stops quietly going dead again.
    check('the Storm is nameable from somewhere that is not the Storm',
      (DUNE_PHASES as readonly GamePhase[])
        .filter(c => c !== 'Storm' && mayStopIn(c, 'Storm')),
      ['Mentat Pause'])
  }

  // COUNTED OUT, not recomputed. A check that derived the expected number the
  // same way the code does would agree with any change, including a wrong one;
  // these are literals so adding or dropping an offer is a decision somebody
  // has to make twice.
  // THE CURATED LIST is what a Karama could stop if every check existed; the
  // OFFER is what it can stop today. They are different numbers while the
  // eighteen are open, and the guard above is what keeps the second honest.
  // TWENTY-SIX OFFERS ACROSS TWENTY-FIVE SHEET ENTRIES: the Guild shipment
  // paragraph is two of them, because it is four advantages in one sentence
  // and one card taking all four is not a reading a table would accept. See
  // FactionRuleRef, where the # qualifier names a part without splitting the
  // prose a player actually reads.
  check('the curated list is twenty-six, faction by faction',
    FACTION_IDS.map(id => Object.keys(FACTIONS[id]!.karamaStops).length),
    [4, 2, 3, 8, 2, 7])
  check('...twenty-six in all',
    FACTION_IDS.reduce((n, id) => n + Object.keys(FACTIONS[id]!.karamaStops).length, 0), 26)
  check('...over twenty-five entries, one of them offered twice',
    new Set(FACTION_IDS.flatMap(id =>
      Object.keys(FACTIONS[id]!.karamaStops).map(r => `${id}|${r.split('#')[0]}`))).size, 25)
  check('...and every one of them is stoppable in the first place',
    FACTION_IDS.flatMap(id => suppressibleRefs(id, 'advanced')
      .filter(r => !canKaramaStop(FACTIONS[id]!, r.ref))
      .map(r => `${id}.${r.ref}`)),
    [])

  check('...and every offered ref carries its own rules text',
    suppressibleRefs('atreides', 'advanced').every(r => r.text.length > 0), true)

  const sup = [{ faction: 'atreides', ref: 'abilities.bidding', by: 'emperor', turn: 4, phase: 'Bidding' }]
  check('a stop bites exactly its (faction, ref, turn, phase)',
    [isSuppressed(sup as never, 'atreides' as never, 'abilities.bidding' as never, 4, 'Bidding' as never),
      isSuppressed(sup as never, 'atreides' as never, 'abilities.bidding' as never, 4, 'Battles' as never),
      isSuppressed(sup as never, 'atreides' as never, 'abilities.bidding' as never, 5, 'Bidding' as never),
      isSuppressed(sup as never, 'atreides' as never, 'abilities.battle' as never, 4, 'Bidding' as never),
      isSuppressed(sup as never, 'harkonnen' as never, 'abilities.bidding' as never, 4, 'Bidding' as never)],
    [true, false, false, false, false])

  check('a use is judged at the door: yours, theirs, or the wrong game',
    [karamaAllowed('fremen', 'advanced', 'fremen-place-worm'),
      karamaAllowed('atreides', 'advanced', 'fremen-place-worm'),
      karamaAllowed('fremen', 'basic', 'fremen-place-worm'),
      karamaAllowed('fremen', 'basic', 'guild-rate-shipment')],
    [null, 'not-your-power', 'advanced-only', null])

  check('what counts as a Karama: the card for anyone, worthless for the Sisterhood',
    [isKaramaCardId('atreides', 'advanced', 'karama'),
      isKaramaCardId('bene-gesserit', 'advanced', 'baliset'),
      isKaramaCardId('bene-gesserit', 'basic', 'baliset'),
      isKaramaCardId('atreides', 'advanced', 'baliset'),
      isKaramaCardId('atreides', 'advanced', 'crysknife')],
    [true, true, false, false, false])

  // the worm spares whom the Fremen protect — the karama worm is a normal worm
  const spared = playKarama({
    faction: 'fremen', mode: 'advanced',
    use: { id: 'fremen-place-worm', territoryId: 'territory-07' as TerritoryId },
    forces: [
      { faction: 'fremen', territoryId: 'territory-07', sector: 'sector-1', count: 2 },
      { faction: 'atreides', territoryId: 'territory-07', sector: 'sector-1', count: 3 },
      { faction: 'harkonnen', territoryId: 'territory-07', sector: 'sector-2', count: 4 },
    ] as never,
    spiceOnBoard: {},
    spared: 'atreides' as never,
  })
  check('the karama worm spares the shielded ally like the Fremen themselves',
    spared.resolved!.devoured.forcesKilled.map(f => f.faction), ['harkonnen'])

  // ── the server's slices ─────────────────────────────────────────────────
  const fn = readFileSync('supabase/functions/dune-action/index.ts', 'utf8')
  const kc = fn.slice(fn.indexOf("case 'KARAMA'"), fn.indexOf("case 'KARAMA_STOP'"))
  check('the KARAMA case holds all seven uses behind the id door',
    [/isKaramaCardId\(myFaction as never, kMode as never, kCard\)/.test(kc),
      /karamaAllowed\(myFaction as never, kMode as never, kUse\.id as never\)/.test(kc),
      ...['guild-rate-shipment', 'free-treachery-card', 'atreides-see-battle-plan',
        'emperor-free-revival', 'fremen-place-worm', 'guild-stop-shipment']
        .map(id => kc.includes(`'${id}'`)),
      /cap: 3,/.test(kc),
      /shuffleWithSeed\(\s*[\r\n]+\s*Number\(match\.rng_seed\) \+ match\.action_seq, \[\.\.\.\(victim\.cards \?\? \[\]\)\]\)/.test(kc)],
    [true, true, true, true, true, true, true, true, true, true])
  const ks = fn.slice(fn.indexOf("case 'KARAMA_STOP'"), fn.indexOf("case 'KARAMA_GIVE_BACK'"))
  // BY THE SHARED MENU, AND FOR THIS GAME. The menu takes the mode now, so a
  // basic match refuses an advanced stop even if something contrives to ask
  // for one — the panel would never offer it, and the panel is not the guard.
  check('the stop validates by the shared menu and publishes by name',
    [/suppressibleRefs\(sTarget as never,/.test(ks),
      /\.some\(\(r\) => r\.ref === sRef\)/.test(ks),
      /state\.mode === 'advanced' \? 'advanced' : 'basic'/.test(ks),
      /code: 'not-stoppable'/.test(ks),
      /faction: sTarget, ref: sRef, by: myFaction,/.test(ks)],
    [true, true, true, true, true])
  const kg = fn.slice(fn.indexOf("case 'KARAMA_GIVE_BACK'"), fn.indexOf("case 'WEATHER_CONTROL'"))
  check('the give-back is the debtor\'s to choose and anyone\'s to push past the clock',
    [/code: 'not-your-debt'/.test(kg),
      /\(debtor\.cards \?\? \[\]\)\.slice\(0, g\.count\)/.test(kg),
      /karamaGiveBack: undefined,/.test(kg)],
    [true, true, true])

  // the six stops, checked where the advantages fire
  check('the stopped advantages: the seer, the seer at war, the Voice, the broker, the collector, the carrier',
    [(fn.match(/'abilities\.bidding' as never/g) ?? []).length >= 3,
      /'abilities\.treachery' as never/.test(fn),
      /'abilities\.battle' as never,\s*[\r\n]+\s*Number\(state\.turn \?\? 0\), 'Battles' as never/.test(fn),
      /'abilities\.shipment' as never/.test(fn)],
    [true, true, true, true])
  check('the free card settles free, is consumed, and lapses with the auction',
    [/freeFor: \(\(\(state\.karamaFreeCard \?\? \[\]\) as string\[\]\)/.test(fn),
      /\.filter\(\(f\) => f !== justClosed\.winner\)/.test(fn),
      /if \(state\.phase === 'Bidding'\) delete base\.karamaFreeCard/.test(fn)],
    [true, true, true])
  check('the karama rate is half the shipper\'s own, to the bank, affordability at the real price',
    [/const karamaRated = !!w\.done\.karamaRate/.test(fn),
      /code: 'karama-stopped'/.test(fn),
      /guildSeated: false, guildAllied: true,/.test(fn)],
    [true, true, true])
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
