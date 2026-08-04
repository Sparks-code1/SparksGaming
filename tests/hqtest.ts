/**
 * HQ starting-placement rules.
 *
 * The predicate below mirrors `blockReason` in HQMapPicker. It is duplicated
 * here only because that logic is inline in the component; if the component's
 * rules change this must change with them.
 */

interface City { isMajor: boolean; placedByPlayerId: string | null; name: string }

interface World {
  me: string
  takenIds?: Set<string>
  adjacentToPlaced?: Set<string>
  falloutZoneId?: string | null
  worldCapitalId?: string | null
  cities?: Record<string, City>
  scars?: Record<string, string[]>
}

function blockReason(id: string, w: World): string | null {
  if (w.takenIds?.has(id)) return 'An HQ is already placed here'
  if (w.adjacentToPlaced?.has(id)) return 'Adjacent to another HQ'
  if (id === w.falloutZoneId) return 'The Fallout Zone is destroyed ground'
  if (id === w.worldCapitalId) return 'The World Capital is marked ground'

  const city = w.cities?.[id]
  const ownMajor = !!city && city.isMajor && city.placedByPlayerId === w.me
  if (ownMajor) return null

  if (city) {
    return city.isMajor
      ? `${city.name} was founded by another player`
      : `${city.name} is a minor city — an HQ cannot start on one`
  }
  const scars = w.scars?.[id] ?? []
  if (scars.length > 0) return `Scarred ground — ${scars.join(', ')}`
  return null
}

const allowed = (id: string, w: World) => blockReason(id, w) === null

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

const ME = 'p1', THEM = 'p2'

console.log('\n— the new restrictions —')
{
  const w: World = {
    me: ME,
    cities: {
      'my-minor':    { isMajor: false, placedByPlayerId: ME,   name: 'My Town' },
      'their-minor': { isMajor: false, placedByPlayerId: THEM, name: 'Their Town' },
      'their-major': { isMajor: true,  placedByPlayerId: THEM, name: 'Their Capital' },
    },
    scars: { scarred: ['Bunker'] },
  }
  check('open ground is allowed', allowed('empty', w))
  check('a MINOR city I founded is now blocked', !allowed('my-minor', w), String(blockReason('my-minor', w)))
  check('...for being minor, not for ownership',
    /minor city/.test(blockReason('my-minor', w) ?? ''), String(blockReason('my-minor', w)))
  check("someone else's minor city is blocked", !allowed('their-minor', w))
  check("someone else's major city is blocked", !allowed('their-major', w))
  check('a scarred territory is blocked', !allowed('scarred', w), String(blockReason('scarred', w)))
  check('...and says which scar', /Bunker/.test(blockReason('scarred', w) ?? ''))
}

console.log('\n— your own major city is the exception —')
{
  const w: World = {
    me: ME,
    cities: { seat: { isMajor: true, placedByPlayerId: ME, name: 'Ryanopolis' } },
  }
  check('allowed', allowed('seat', w))

  const scarred: World = { ...w, scars: { seat: ['Bunker'] } }
  check('STILL allowed when scarred', allowed('seat', scarred), String(blockReason('seat', scarred)))

  const multiScar: World = { ...w, scars: { seat: ['Bunker', 'Ammo Shortage'] } }
  check('allowed with several scars', allowed('seat', multiScar))
}

console.log('\n— but the hard blocks still win over it —')
{
  const base: World = { me: ME, cities: { seat: { isMajor: true, placedByPlayerId: ME, name: 'Ryanopolis' } } }
  check('an HQ already there blocks',
    !allowed('seat', { ...base, takenIds: new Set(['seat']) }))
  check('adjacency to another HQ blocks',
    !allowed('seat', { ...base, adjacentToPlaced: new Set(['seat']) }))
  check('the Fallout Zone blocks',
    !allowed('seat', { ...base, falloutZoneId: 'seat' }))
  check('the World Capital blocks',
    !allowed('seat', { ...base, worldCapitalId: 'seat' }))
}

console.log('\n— founder identity follows the PLAYER, not the faction —')
{
  // Same roster id, different faction this game — the claim still holds.
  const w: World = { me: ME, cities: { seat: { isMajor: true, placedByPlayerId: ME, name: 'Ryanopolis' } } }
  check('my major city is mine regardless of faction', allowed('seat', w))
  const asOther: World = { ...w, me: THEM }
  check("and is not the other player's", !allowed('seat', asOther))
}

console.log('\n— unknown founder is treated as not yours —')
{
  const w: World = { me: ME, cities: { old: { isMajor: true, placedByPlayerId: null, name: 'Ancient' } } }
  check('a major city with no recorded founder blocks', !allowed('old', w),
    String(blockReason('old', w)))
}

console.log('\n— reason precedence —')
{
  const w: World = {
    me: ME,
    takenIds: new Set(['both']),
    cities: { both: { isMajor: false, placedByPlayerId: THEM, name: 'Contested' } },
    scars: { both: ['Bunker'] },
  }
  check('the hardest block is reported first',
    blockReason('both', w) === 'An HQ is already placed here', String(blockReason('both', w)))

  const cityAndScar: World = {
    me: ME,
    cities: { x: { isMajor: false, placedByPlayerId: ME, name: 'Town' } },
    scars: { x: ['Bunker'] },
  }
  check('a city reason beats a scar reason',
    /minor city/.test(blockReason('x', cityAndScar) ?? ''), String(blockReason('x', cityAndScar)))
}

console.log('\n— every block has a human reason —')
{
  const w: World = {
    me: ME,
    takenIds: new Set(['a']), adjacentToPlaced: new Set(['b']),
    falloutZoneId: 'c', worldCapitalId: 'd',
    cities: { e: { isMajor: false, placedByPlayerId: ME, name: 'T' }, f: { isMajor: true, placedByPlayerId: THEM, name: 'U' } },
    scars: { g: ['Bunker'] },
  }
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
  check('all seven blocked', ids.every(id => !allowed(id, w)))
  check('none reports an empty reason', ids.every(id => (blockReason(id, w) ?? '').length > 8))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
