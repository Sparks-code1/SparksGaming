// Deck order must not be knowable in advance.
//
// It used to be seeded from the game number alone, so game 5 dealt the same
// events, missions and face-up cards in every campaign and again on every
// restart. These check the deal is random per game but reproducible from its
// stored seed, and that reshuffles are unbiased.
import {
  buildInitialGameCards, buildEventDeck, buildMissionDeck, shuffle, newDealSeed,
} from '@/data/cards'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

const OPTS = {
  eventsUnlocked: true,
  ninthCityUnlocked: true,
  doubleWinnerMilestoneTriggered: true,
  alienMilestoneTriggered: true,
  destroyedEventCardIds: [] as string[],
  destroyedMissionIds: [] as string[],
}

console.log('\n— the same game number no longer deals the same cards —')
{
  const deals = Array.from({ length: 40 }, () => buildInitialGameCards(5, OPTS))

  const eventOrders = new Set(deals.map(d => d.eventDeck.join(',')))
  check('event order varies between deals of game 5', eventOrders.size > 1, `${eventOrders.size} distinct`)
  check('...and is near-always unique', eventOrders.size >= 35, `${eventOrders.size}/40`)

  const missionOrders = new Set(deals.map(d => d.missionDeck.join(',')))
  check('mission order varies', missionOrders.size > 1, `${missionOrders.size} distinct`)
  check('...and is near-always unique', missionOrders.size >= 35, `${missionOrders.size}/40`)

  const sideboards = new Set(deals.map(d => d.sideboard.join(',')))
  check('the four face-up cards vary', sideboards.size >= 35, `${sideboards.size}/40`)

  const firstEvents = new Set(deals.map(d => d.eventDeck[0]))
  check('the NEXT event to fire is not fixed', firstEvents.size > 1, `${firstEvents.size} distinct`)
  const firstMissions = new Set(deals.map(d => d.missionDeck[0]))
  check('nor is the next mission', firstMissions.size > 1, `${firstMissions.size} distinct`)
}

console.log('\n— different campaigns on the same game number differ too —')
{
  // Same inputs, two "campaigns" — the old seed made these identical.
  const a = buildInitialGameCards(3, OPTS)
  const b = buildInitialGameCards(3, OPTS)
  check('game 3 here != game 3 there',
    a.eventDeck.join(',') !== b.eventDeck.join(',') || a.sideboard.join(',') !== b.sideboard.join(','))
}

console.log('\n— but a stored seed reproduces its own deal exactly —')
{
  const dealt = buildInitialGameCards(5, OPTS)
  check('the seed is recorded', typeof dealt.dealSeed === 'number', String(dealt.dealSeed))
  const again = buildInitialGameCards(5, OPTS, dealt.dealSeed)
  check('same seed -> same event deck', again.eventDeck.join(',') === dealt.eventDeck.join(','))
  check('same seed -> same mission deck', again.missionDeck.join(',') === dealt.missionDeck.join(','))
  check('same seed -> same face-up cards', again.sideboard.join(',') === dealt.sideboard.join(','))
  check('same seed -> same draw pile', again.territoryDeck.join(',') === dealt.territoryDeck.join(','))
  check('the round trip keeps the seed', again.dealSeed === dealt.dealSeed)
}

console.log('\n— a deal is still a complete, legal deal —')
{
  const d = buildInitialGameCards(5, OPTS)
  check('4 cards face up', d.sideboard.length === 4, String(d.sideboard.length))
  check('the rest are in the draw pile', d.territoryDeck.length === 38, String(d.territoryDeck.length))
  check('no card is both face up and in the pile',
    d.sideboard.every(id => !d.territoryDeck.includes(id)))
  check('all 42 territory cards accounted for',
    new Set([...d.sideboard, ...d.territoryDeck]).size === 42)
  check('the event deck holds every unlocked event once',
    new Set(d.eventDeck).size === d.eventDeck.length && d.eventDeck.length > 0)
  check('the mission deck holds every mission once',
    new Set(d.missionDeck).size === d.missionDeck.length && d.missionDeck.length > 0)
  check('destroyed events stay out',
    !buildInitialGameCards(5, { ...OPTS, destroyedEventCardIds: buildEventDeck(1, OPTS).slice(0, 2) })
      .eventDeck.some(id => buildEventDeck(1, OPTS).slice(0, 2).includes(id)))
  check('destroyed missions stay out',
    !buildInitialGameCards(5, { ...OPTS, destroyedMissionIds: ['mc-world-capital'] })
      .missionDeck.includes('mc-world-capital'))
  check('locked missions deal nothing',
    buildMissionDeck(1, { doubleWinnerMilestoneTriggered: false }).length === 0)
}

console.log('\n— seeds themselves are spread out —')
{
  const seeds = new Set(Array.from({ length: 200 }, () => newDealSeed()))
  check('200 seeds, no collisions', seeds.size === 200, `${seeds.size}/200`)
  check('all are unsigned 32-bit',
    [...seeds].every(s => Number.isInteger(s) && s >= 0 && s <= 0xffffffff))
}

console.log('\n— the reshuffle is unbiased —')
{
  // `sort(() => Math.random() - 0.5)` leaves items near where they started.
  // Over many shuffles every card should reach position 0 about equally often.
  const cards = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
  const RUNS = 24000
  const firstCounts: Record<string, number> = {}
  let identity = 0
  for (let i = 0; i < RUNS; i++) {
    const s = shuffle(cards)
    firstCounts[s[0]] = (firstCounts[s[0]] ?? 0) + 1
    if (s.join('') === cards.join('')) identity++
  }
  const expected = RUNS / cards.length
  const worst = Math.max(...Object.values(firstCounts).map(n => Math.abs(n - expected) / expected))
  check('every card leads about equally often', worst < 0.12, `worst deviation ${(worst * 100).toFixed(1)}%`)
  check('the order actually changes', identity < RUNS / 100, `${identity} unchanged`)

  const biasedFirst: Record<string, number> = {}
  for (let i = 0; i < RUNS; i++) {
    const s = [...cards].sort(() => Math.random() - 0.5)
    biasedFirst[s[0]] = (biasedFirst[s[0]] ?? 0) + 1
  }
  const biasedWorst = Math.max(...Object.values(biasedFirst).map(n => Math.abs(n - expected) / expected))
  check('...and the old random-comparator sort really was skewed', biasedWorst > 0.2,
    `deviation ${(biasedWorst * 100).toFixed(1)}%`)

  check('shuffle keeps every element', shuffle(cards).sort().join('') === [...cards].sort().join(''))
  check('shuffle does not mutate its input', cards.join('') === 'abcdefgh')
  check('empty and single-element inputs are safe',
    shuffle([]).length === 0 && shuffle(['x']).join('') === 'x')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
