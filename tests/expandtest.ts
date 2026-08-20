// Expand comeback power: designate ONE unoccupied unmarked territory, then
// drop recruits into it. Replays the click sequence that used to dead-lock.
import { expandClickAction } from '@/lib/gameLogic'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

/** A tiny model of the click handler's Expand state across a turn. */
function runClicks(clicks: Array<{ id: string; isOwn: boolean; unoccupied: boolean; unmarked: boolean }>,
                   troopsStart = 3) {
  let target: string | null = null
  let used = false
  let troops = troopsStart
  const log: string[] = []
  const placedOn: string[] = []
  for (const c of clicks) {
    const action = expandClickAction({
      hasPower: true, troopsLeft: troops, alreadyPlaced: used,
      isOwn: c.isOwn, isUnoccupied: c.unoccupied, isUnmarked: c.unmarked,
      isCurrentTarget: c.id === target,
    })
    log.push(`${c.id}:${action}`)
    if (action === 'select') target = c.id
    if (action === 'place') { troops--; used = true; placedOn.push(c.id) }
  }
  return { log, target, troops, placedOn }
}

const OPEN = (id: string) => ({ id, isOwn: false, unoccupied: true, unmarked: true })
// After a troop lands, the territory becomes OWNED by the player.
const MINE = (id: string) => ({ id, isOwn: true, unoccupied: false, unmarked: true });   // ends the statement: see the note in tsconfig.json

// ── THE BUG: click an empty territory, then click it again ────────────────
// Old behaviour: select, then de-select — the troop could never be placed.
{
  const r = runClicks([OPEN('x'), OPEN('x')])
  check('click twice on an empty territory -> select then PLACE', r.log, ['x:select', 'x:place'])
  check('a troop actually landed', r.placedOn, ['x'])
  check('troop count decremented', r.troops, 2)
}

// ── placing the rest: the territory is now owned ──────────────────────────
{
  const r = runClicks([OPEN('x'), OPEN('x'), MINE('x'), MINE('x')])
  check('remaining recruits keep landing on the claimed territory',
    r.placedOn, ['x', 'x', 'x'])
  check('all 3 troops spent', r.troops, 0)
}

// ── switching target BEFORE committing is allowed ─────────────────────────
{
  const r = runClicks([OPEN('x'), OPEN('y'), OPEN('y')])
  check('may change your mind before any troop lands', r.log,
    ['x:select', 'y:select', 'y:place'])
  check('...and the troop lands on the NEW choice', r.placedOn, ['y'])
}

// ── ONE territory per turn: cannot claim a second after committing ────────
{
  const r = runClicks([OPEN('x'), OPEN('x'), OPEN('z'), OPEN('z')])
  check('a second empty territory cannot be claimed once committed',
    r.log, ['x:select', 'x:place', 'z:ignore', 'z:ignore'])
  check('only the first territory ever received troops', r.placedOn, ['x'])
}

// ── guards ────────────────────────────────────────────────────────────────
check('no troops left -> nothing happens',
  expandClickAction({ hasPower: true, troopsLeft: 0, alreadyPlaced: false,
    isOwn: false, isUnoccupied: true, isUnmarked: true, isCurrentTarget: false }), 'ignore')
check('without the power -> nothing happens',
  expandClickAction({ hasPower: false, troopsLeft: 3, alreadyPlaced: false,
    isOwn: false, isUnoccupied: true, isUnmarked: true, isCurrentTarget: false }), 'ignore')
check('scarred/city territory cannot be claimed',
  expandClickAction({ hasPower: true, troopsLeft: 3, alreadyPlaced: false,
    isOwn: false, isUnoccupied: true, isUnmarked: false, isCurrentTarget: false }), 'ignore')
check('an occupied enemy territory cannot be claimed',
  expandClickAction({ hasPower: true, troopsLeft: 3, alreadyPlaced: false,
    isOwn: false, isUnoccupied: false, isUnmarked: true, isCurrentTarget: false }), 'ignore')

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
