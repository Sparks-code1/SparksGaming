// Fortifications are a fixed campaign supply of 5, and a worn-out one is never
// recycled.
//
// A depleted sticker used to be deleted outright. With no cap that was
// invisible; with one it would hand the slot straight back, so a campaign could
// place far more than five over its lifetime.
import { FORTIFICATION_SUPPLY, fortificationsPlaced } from '@/lib/gameLogic'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

const fort = (id: string, target: string, charges: number) =>
  ({ id, name: 'Fortification', description: `fortification:${charges}`,
     placement: 'territory', targetId: target, appliedInGame: 1 })
const city = (id: string, target: string) =>
  ({ id, name: 'City', description: 'city:minor', placement: 'territory', targetId: target, appliedInGame: 1 })

/** Combat wearing a fortification down — mirrors the depletion in GameBoard. */
function deplete(stickers: any[], targetId: string, uses: number) {
  return stickers.map(s => {
    if (s.targetId === targetId && s.description.startsWith('fortification:')) {
      const charges = parseInt(s.description.split(':')[1] ?? '0')
      return { ...s, description: `fortification:${Math.max(0, charges - uses)}` }
    }
    return s
  })
}
/** Is this territory actually protected? Every reader tests remaining charges. */
const isFortified = (stickers: any[], targetId: string) =>
  stickers.some(s => s.targetId === targetId
    && s.description.startsWith('fortification:')
    && parseInt(s.description.split(':')[1] ?? '0', 10) > 0)

const canPlace = (stickers: any[]) => fortificationsPlaced(stickers) < FORTIFICATION_SUPPLY

console.log('\n— the supply is five —')
{
  check('the constant is 5', FORTIFICATION_SUPPLY === 5, String(FORTIFICATION_SUPPLY))
  let stickers: any[] = [city('c1', 'brazil')]
  check('cities do not count against it', fortificationsPlaced(stickers) === 0)
  for (let i = 0; i < 5; i++) {
    check(`fortification ${i + 1} can be placed`, canPlace(stickers))
    stickers = [...stickers, fort(`f${i}`, `t${i}`, 10)]
  }
  check('all five are counted', fortificationsPlaced(stickers) === 5)
  check('a sixth is refused', !canPlace(stickers))
}

console.log('\n— a worn-out fortification does not come back —')
{
  let stickers: any[] = [fort('f1', 'brazil', 10)]
  check('it starts protecting brazil', isFortified(stickers, 'brazil'))
  check('and uses one of the five', fortificationsPlaced(stickers) === 1)

  stickers = deplete(stickers, 'brazil', 4)
  check('after 4 rolls it still protects', isFortified(stickers, 'brazil'))

  stickers = deplete(stickers, 'brazil', 6)   // 10 total
  check('at 10 rolls it stops protecting', !isFortified(stickers, 'brazil'))
  check('the spent sticker STAYS on the board', stickers.length === 1)
  check('...at zero charges', stickers[0].description === 'fortification:0')
  check('and it still counts against the supply', fortificationsPlaced(stickers) === 1)

  // What the old code did.
  const oldWay = stickers.filter(s => s.description !== 'fortification:0')
  check('deleting it would have handed the slot back', fortificationsPlaced(oldWay) === 0)
}

console.log('\n— five placed then worn out means none left —')
{
  let stickers: any[] = Array.from({ length: 5 }, (_, i) => fort(`f${i}`, `t${i}`, 10))
  check('the supply is spent', !canPlace(stickers))
  for (let i = 0; i < 5; i++) stickers = deplete(stickers, `t${i}`, 10)
  check('every one is worn out', stickers.every(s => s.description === 'fortification:0'))
  check('none protects anything', [0, 1, 2, 3, 4].every(i => !isFortified(stickers, `t${i}`)))
  check('and there are STILL none left to place', !canPlace(stickers))
  check('the count is still five', fortificationsPlaced(stickers) === 5)
}

console.log('\n— over-depletion and odd inputs —')
{
  let stickers: any[] = [fort('f1', 'brazil', 3)]
  stickers = deplete(stickers, 'brazil', 9)     // more uses than charges left
  check('charges never go negative', stickers[0].description === 'fortification:0')
  check('it still counts once', fortificationsPlaced(stickers) === 1)

  stickers = deplete(stickers, 'brazil', 5)     // depleting a spent one again
  check('re-depleting a spent one is a no-op', stickers[0].description === 'fortification:0')

  check('an empty board has none placed', fortificationsPlaced([]) === 0)
  check('missing input is safe', fortificationsPlaced(null) === 0)
  check('a fresh campaign can place five', canPlace([]))
}

console.log('\n— a ruin destroys the fortification without freeing the slot —')
{
  // Die Humans wipes a territory. That destroys the fortification, but it is
  // still one of the five spent — mirrors the ruin handler in GameBoard.
  const stickers: any[] = [
    fort('f1', 'southeast-asia', 7),
    fort('f2', 'brazil', 10),
    { id: 'hq1', name: 'HQ', description: 'HQ:aliens', placement: 'territory', targetId: 'southeast-asia', appliedInGame: 1 },
  ]
  check('two fortifications are in use', fortificationsPlaced(stickers) === 2)

  const afterRuin = stickers
    .filter(s => !(s.targetId === 'southeast-asia' && s.description.startsWith('HQ:')))
    .map(s => (s.targetId === 'southeast-asia' && s.description.startsWith('fortification:'))
      ? { ...s, description: 'fortification:0' } : s)

  check('the ruined fortification stops protecting', !isFortified(afterRuin, 'southeast-asia'))
  check('but its sticker remains', afterRuin.some(s => s.targetId === 'southeast-asia' && s.description.startsWith('fortification:')))
  check('so the slot is NOT freed', fortificationsPlaced(afterRuin) === 2)
  check('the HQ sticker is still removed', !afterRuin.some(s => s.description.startsWith('HQ:')))
  check('the other fortification is untouched', isFortified(afterRuin, 'brazil'))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
