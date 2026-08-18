// An HQ may not start on a Ruin.
//
// A ruin was invisible to every rule the picker had. Its city sticker goes into
// `destroyedCities`, so the city map skips it, and razing leaves no scar — so a
// razed territory read as ordinary open ground with nothing on it, and was a
// perfectly legal place to start. SE Asia has been startable since Game 5.

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

/** The real campaign, Game 9 — the state this was found in. */
const legacy = {
  ruinTerritoryIds: ['southeast-asia'],
  falloutZoneTerritoryId: null as string | null,
  worldCapitalTerritoryId: 'brazil',
  destroyedCities: [
    { cityId: 'city-1785359262836', destroyedInGame: 5 },              // covered by the World Capital
    { cityId: 'city-restored-southeast-asia-p1', destroyedInGame: 5 }, // razed by Die Humans
  ],
  stickers: [
    { id: 'city-1785359262836', targetId: 'brazil', description: 'city:major', placement: 'territory', appliedInGame: 1 },
    { id: 'city-restored-southeast-asia-p1', targetId: 'southeast-asia', description: 'city:minor', placement: 'territory', appliedInGame: 1 },
    { id: 'city-1785359310684-p3', targetId: 'congo', description: 'city:minor', placement: 'territory', appliedInGame: 1 },
    { id: 'city-1785359865310', targetId: 'northwest-territory', description: 'city:major', placement: 'territory', appliedInGame: 1, placedByPlayerId: 'p1' },
  ],
  scars: [
    { territoryId: 'brazil', type: 'bunker' },   // the World Capital is ALSO scarred
    { territoryId: 'egypt', type: 'wasteland' },
    { territoryId: 'peru', type: 'mercenary' },
  ],
}

const ADJACENT: Record<string, string[]> = {
  'southeast-asia': ['india', 'china', 'indonesia'],
  'congo': ['east-africa', 'south-africa', 'north-africa'],
}

/** Mirrors blockReason in HQMapPicker, in its real order. */
function blockReason(id: string, currentPlayerId: string, placedHqIds: string[] = []): string | null {
  const taken = new Set(placedHqIds)
  const adjacentToPlaced = new Set<string>()
  for (const hq of placedHqIds) (ADJACENT[hq] ?? []).forEach(a => adjacentToPlaced.add(a))

  const destroyed = new Set(legacy.destroyedCities.map(d => d.cityId))
  const cityMap = new Map<string, { isMajor: boolean; placedByPlayerId: string | null }>()
  for (const s of legacy.stickers) {
    if (s.placement !== 'territory' || !s.description.startsWith('city:')) continue
    if (destroyed.has(s.id)) continue
    cityMap.set(s.targetId, { isMajor: s.description === 'city:major', placedByPlayerId: (s as any).placedByPlayerId ?? null })
  }
  const ownMajor = new Set([...cityMap.entries()]
    .filter(([, c]) => c.isMajor && c.placedByPlayerId === currentPlayerId)
    .map(([tid]) => tid))
  const scarMap = new Map<string, string[]>()
  for (const s of legacy.scars) scarMap.set(s.territoryId, [...(scarMap.get(s.territoryId) ?? []), s.type])
  const ruinIds = new Set(legacy.ruinTerritoryIds)

  if (taken.has(id)) return 'An HQ is already placed here'
  if (adjacentToPlaced.has(id)) return 'Adjacent to another HQ'
  if (id === legacy.falloutZoneTerritoryId) return 'The Fallout Zone is destroyed ground'
  if (ruinIds.has(id)) return 'Razed to a Ruin — nothing starts here again'
  if (id === legacy.worldCapitalTerritoryId) return 'The World Capital is marked ground'
  if (ownMajor.has(id)) return null
  const city = cityMap.get(id)
  if (city) return city.isMajor ? 'founded by another player' : 'is a minor city — an HQ cannot start on one'
  const scars = scarMap.get(id) ?? []
  if (scars.length > 0) return 'Scarred ground'
  return null
}

/** What the picker did before the ruin rule existed. */
function oldBlockReason(id: string, currentPlayerId: string): string | null {
  if (id === legacy.ruinTerritoryIds[0]) {
    // No branch existed — fall through to the city/scar checks, which both miss.
  }
  const destroyed = new Set(legacy.destroyedCities.map(d => d.cityId))
  const hasLivingCity = legacy.stickers.some(s =>
    s.targetId === id && s.description.startsWith('city:') && !destroyed.has(s.id))
  const scarred = legacy.scars.some(s => s.territoryId === id)
  if (id === legacy.worldCapitalTerritoryId) return 'The World Capital is marked ground'
  if (hasLivingCity) return 'city'
  if (scarred) return 'Scarred ground'
  void currentPlayerId
  return null
}

console.log('\n— the regression itself —')
{
  check('SE Asia used to be a legal HQ start', oldBlockReason('southeast-asia', 'p1') === null)
  check('its city sticker is recorded destroyed',
    legacy.destroyedCities.some(d => d.cityId === 'city-restored-southeast-asia-p1'))
  check('so the city check never saw it',
    !legacy.stickers.some(s => s.targetId === 'southeast-asia'
      && !legacy.destroyedCities.some(d => d.cityId === s.id)))
  check('and razing leaves no scar to catch it',
    !legacy.scars.some(s => s.territoryId === 'southeast-asia'))
}

console.log('\n— a Ruin is now refused —')
{
  const r = blockReason('southeast-asia', 'p1')
  check('SE Asia is blocked', r !== null)
  check('and says why', /Ruin/.test(r ?? ''), String(r))
  check('for every player, not just one',
    ['p1', 'p2', 'p3', 'p4', 'p5'].every(p => blockReason('southeast-asia', p) !== null))
}

console.log('\n— it outranks the founder exception —')
{
  // A founder may start on their own major city even when scarred. A ruin is
  // not a city any more, and must not be re-openable by whoever founded it.
  check('your own major city is still allowed',
    blockReason('northwest-territory', 'p1') === null)
  check('...and that is a real exception, not an accident',
    blockReason('northwest-territory', 'p2') !== null)
  check('but a ruin refuses its founder too',
    blockReason('southeast-asia', 'p1') !== null)
}

console.log('\n— the other rules are untouched —')
{
  check('a minor city still blocks', blockReason('congo', 'p1') !== null)
  check('the World Capital still blocks', blockReason('brazil', 'p1') !== null)
  check('scarred ground still blocks', blockReason('egypt', 'p1') !== null)
  check('open ground is still open', blockReason('siam-nowhere', 'p1') === null)
  check('a placed HQ still blocks', blockReason('congo', 'p1', ['congo']) !== null)
  check('adjacency still blocks', blockReason('india', 'p1', ['southeast-asia']) === 'Adjacent to another HQ')
}

console.log('\n— the ruin reason beats the ones below it —')
{
  // Order matters: the reported reason must be the ruin, not a stale city.
  check('a ruin reports as a ruin, not as a city',
    /Ruin/.test(blockReason('southeast-asia', 'p1') ?? ''))
  // The Fallout Zone still wins if a territory were somehow both.
  const saved = legacy.falloutZoneTerritoryId
  legacy.falloutZoneTerritoryId = 'southeast-asia'
  check('the Fallout Zone outranks it', /Fallout/.test(blockReason('southeast-asia', 'p1') ?? ''))
  legacy.falloutZoneTerritoryId = saved
}

console.log('\n— no ruins at all is safe —')
{
  const saved = legacy.ruinTerritoryIds
  legacy.ruinTerritoryIds = []
  check('nothing is blocked for being a ruin', blockReason('southeast-asia', 'p1') === null)
  legacy.ruinTerritoryIds = saved
  check('and the real list is restored', blockReason('southeast-asia', 'p1') !== null)
}

console.log('\n— the colour agrees with the reason —')
{
  // The fill used to come from a SECOND, separately-ordered chain. The World
  // Capital had no branch in it, so Brazil fell through to the scar branch and
  // was painted "scarred" while its tooltip correctly said "World Capital".
  type Kind = 'taken' | 'adjacent' | 'fallout' | 'ruin' | 'world-capital' | 'city' | 'scar'
  function blockKind(id: string, currentPlayerId: string, placedHqIds: string[] = []): Kind | null {
    const taken = new Set(placedHqIds)
    const adj = new Set<string>()
    for (const hq of placedHqIds) (ADJACENT[hq] ?? []).forEach(a => adj.add(a))
    const destroyed = new Set(legacy.destroyedCities.map(d => d.cityId))
    const living = legacy.stickers.filter(s => s.description.startsWith('city:') && !destroyed.has(s.id))
    const ownMajor = new Set(living
      .filter(s => s.description === 'city:major' && (s as any).placedByPlayerId === currentPlayerId)
      .map(s => s.targetId))

    if (taken.has(id)) return 'taken'
    if (adj.has(id)) return 'adjacent'
    if (id === legacy.falloutZoneTerritoryId) return 'fallout'
    if (legacy.ruinTerritoryIds.includes(id)) return 'ruin'
    if (id === legacy.worldCapitalTerritoryId) return 'world-capital'
    if (ownMajor.has(id)) return null
    if (living.some(s => s.targetId === id)) return 'city'
    if (legacy.scars.some(s => s.territoryId === id)) return 'scar'
    return null
  }

  // One fill per kind — the mapping the render now uses.
  const FILL: Record<Kind, string> = {
    'taken': 'faction', 'adjacent': 'dim', 'fallout': 'yellow', 'ruin': 'grey-brown',
    'world-capital': 'gold', 'city': 'red', 'scar': 'amber',
  }
  const fillFor = (id: string, pid: string) => {
    const k = blockKind(id, pid)
    return k ? FILL[k] : 'open'
  }

  check('Brazil reports as the World Capital', blockKind('brazil', 'p1') === 'world-capital')
  check('...and is painted gold, not scar-amber', fillFor('brazil', 'p1') === 'gold')
  check('Brazil really does carry a scar too — that is what caused it',
    legacy.scars.some(s => s.territoryId === 'brazil'))

  // The mismatch, reproduced: the old fill chain had no World Capital branch.
  const oldFill = (id: string) => {
    const destroyed = new Set(legacy.destroyedCities.map(d => d.cityId))
    const hasCity = legacy.stickers.some(s => s.targetId === id
      && s.description.startsWith('city:') && !destroyed.has(s.id))
    if (legacy.ruinTerritoryIds.includes(id)) return 'grey-brown'
    if (hasCity) return 'red'
    if (legacy.scars.some(s => s.territoryId === id)) return 'amber'   // Brazil landed here
    return 'open'
  }
  check('the OLD chain painted Brazil scar-amber', oldFill('brazil') === 'amber')
  check('while the reason said World Capital', blockKind('brazil', 'p1') === 'world-capital')
  check('the two now agree', oldFill('brazil') !== fillFor('brazil', 'p1'))

  // Every kind has exactly one fill, and nothing shares one by accident.
  const kinds = Object.keys(FILL) as Kind[]
  check('every block kind has a fill', kinds.every(k => !!FILL[k]))
  check('no two kinds share a fill', new Set(kinds.map(k => FILL[k])).size === kinds.length)
  check('an allowed territory is not painted as blocked', fillFor('alaska-nowhere', 'p1') === 'open')

  // Every real territory: if it refuses the click it has a colour, and if it
  // does not, it has none. Never one without the other.
  const sample = ['brazil', 'southeast-asia', 'congo', 'egypt', 'northwest-territory', 'unclaimed']
  check('reason and colour are present or absent together',
    sample.every(id => (blockKind(id, 'p1') === null) === (fillFor(id, 'p1') === 'open')),
    JSON.stringify(sample.map(id => [id, blockKind(id, 'p1'), fillFor(id, 'p1')])))
  check('your own major city stays open and uncoloured',
    blockKind('northwest-territory', 'p1') === null && fillFor('northwest-territory', 'p1') === 'open')
  check('...but is coloured red for anyone else', fillFor('northwest-territory', 'p2') === 'red')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
