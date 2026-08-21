// Karama, the proactive half. The menu is the rule here: which options a faction
// is offered IS the rules statement, and the effects mostly land in phases that
// do not exist yet.
import { karamaOptions, playKarama, isKaramaFor } from '@/lib/dune/karama'
import { TREACHERY_CARDS } from '@/data/dune/treachery'
import { FACTIONS, FACTION_IDS } from '@/data/dune/factions'
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
check('every option says whether it can be carried out yet',
  karamaOptions('fremen', 'advanced').map(o => [o.id, o.resolvable]),
  [['guild-rate-shipment', false], ['free-treachery-card', false], ['fremen-place-worm', true]])

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

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
