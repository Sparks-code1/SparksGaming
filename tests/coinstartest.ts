import { resolveResourceDepletion } from '@/lib/gameLogic'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

/** Board where each player id holds the given number of territories. */
function board(counts: Record<string, number>) {
  const t: Record<string, { occupyingPlayerId?: string | null }> = {}
  let n = 0
  for (const [id, c] of Object.entries(counts)) {
    for (let i = 0; i < c; i++) t[`t${n++}`] = { occupyingPlayerId: id }
  }
  return t
}

const lead = board({ p1: 20, p2: 12, p3: 10 })
const tied = board({ p1: 16, p2: 16, p3: 10 })

console.log('\n— first emptying —')
{
  const r = resolveResourceDepletion(true, [], false, lead)
  check('awards the star to the territory leader', r.kind === 'award' && r.depleted)
  check('names the right player', r.kind === 'award' && r.playerId === 'p1', JSON.stringify(r))
  check('reports the count', r.kind === 'award' && r.count === 20)
}
{
  const r = resolveResourceDepletion(true, [], false, tied)
  check('tie awards nobody', r.kind === 'tie')
  check('tie still counts as depleted', r.depleted)
  check('tie lists every leader', r.kind === 'tie' && r.playerIds.slice().sort().join(',') === 'p1,p2')
}

console.log('\n— second emptying in the same game —')
{
  const r = resolveResourceDepletion(true, [], true, lead)
  check('no second star after an award', r.kind === 'none')
  check('and reports not depleted', r.depleted === false)
}
{
  const r = resolveResourceDepletion(true, [], true, tied)
  check('no second chance after a tie', r.kind === 'none' && !r.depleted)
}

console.log('\n— non-triggering draws —')
{
  check('pile not empty', resolveResourceDepletion(true, ['coin-9'], false, lead).kind === 'none')
  check('territory-card draw never triggers', resolveResourceDepletion(false, [], false, lead).kind === 'none')
  check('empty board awards nobody', resolveResourceDepletion(true, [], false, {}).kind === 'none')
  check('empty board still marks depleted', resolveResourceDepletion(true, [], false, {}).depleted === true)
}

console.log('\n— the farming exploit —')
{
  // Draw the last coin, then trade-ins refill the pile and it empties again.
  let resolved = false
  const stars: string[] = []
  for (let round = 0; round < 3; round++) {
    const r = resolveResourceDepletion(true, [], resolved, lead)
    if (r.kind === 'award') stars.push(r.playerId)
    resolved = resolved || r.depleted
  }
  check('three emptyings yield exactly one star', stars.length === 1, `got ${stars.length}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
