import { applyEndOfTurnScarEffects } from '@/lib/gameReducer'
import type { Territory } from '@/types/territory'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

const T = (id: string, owner: string | null, troops: number, scars: Territory['scars'] = []): Territory => ({
  id, name: id, continentId: 'africa', shape: '', labelX: 0, labelY: 0,
  adjacentIds: [], occupyingPlayerId: owner, troops, scars, cities: [],
} as unknown as Territory)

const board = (...ts: Territory[]) => Object.fromEntries(ts.map(t => [t.id, t]))

console.log('\n— Fallout Zone bleeds, then drives you off —')
{
  // 3 troops → 2
  let r = applyEndOfTurnScarEffects(board(T('fz', 'p1', 3), T('home', 'p1', 5)), 'p1', false, 'fz')
  check('3 troops loses one → 2', r.territories.fz.troops === 2, String(r.territories.fz.troops))
  check('still held', r.territories.fz.occupyingPlayerId === 'p1')
  check('nothing reported vacated', r.vacatedNames.length === 0)

  // 2 troops → 1
  r = applyEndOfTurnScarEffects(board(T('fz', 'p1', 2), T('home', 'p1', 5)), 'p1', false, 'fz')
  check('2 troops loses one → 1', r.territories.fz.troops === 1)
  check('still held at 1', r.territories.fz.occupyingPlayerId === 'p1')

  // 1 troop → VACATED (the change)
  r = applyEndOfTurnScarEffects(board(T('fz', 'p1', 1), T('home', 'p1', 5)), 'p1', false, 'fz')
  check('1 troop VACATES', r.territories.fz.occupyingPlayerId === null, String(r.territories.fz.occupyingPlayerId))
  check('and is emptied', r.territories.fz.troops === 0, String(r.territories.fz.troops))
  check('reported so the board can announce it', r.vacatedNames.includes('fz'), JSON.stringify(r.vacatedNames))
}

console.log('\n— but never your last territory —')
{
  const r = applyEndOfTurnScarEffects(board(T('fz', 'p1', 1)), 'p1', false, 'fz')
  check('sole territory is not taken', r.territories.fz.occupyingPlayerId === 'p1')
  check('troops left at 1', r.territories.fz.troops === 1)
  check('nothing vacated', r.vacatedNames.length === 0)
}

console.log('\n— Mutants are immune and gain instead —')
{
  let r = applyEndOfTurnScarEffects(board(T('fz', 'p1', 1), T('home', 'p1', 5)), 'p1', true, 'fz')
  check('1 troop becomes 2', r.territories.fz.troops === 2, String(r.territories.fz.troops))
  check('never vacates for Mutants', r.territories.fz.occupyingPlayerId === 'p1')

  r = applyEndOfTurnScarEffects(board(T('fz', 'p1', 6)), 'p1', true, 'fz')
  check('gains even as their only territory', r.territories.fz.troops === 7)
}

console.log('\n— only the ending player is affected —')
{
  const r = applyEndOfTurnScarEffects(board(T('fz', 'p2', 1), T('home', 'p1', 5)), 'p1', false, 'fz')
  check("someone else's Fallout Zone is untouched", r.territories.fz.troops === 1 && r.territories.fz.occupyingPlayerId === 'p2')
}

console.log('\n— no Fallout Zone designated —')
{
  const r = applyEndOfTurnScarEffects(board(T('a', 'p1', 1), T('b', 'p1', 3)), 'p1', false, null)
  check('nothing happens without one', r.territories.a.troops === 1 && r.territories.b.troops === 3)
  check('nothing vacated', r.vacatedNames.length === 0)
}

console.log('\n— unaffected alongside other scars —')
{
  // A Bio-hazard territory and the Fallout Zone both bleed the same turn.
  const r = applyEndOfTurnScarEffects(
    board(
      T('fz', 'p1', 1),
      T('bio', 'p1', 1, [{ type: 'biological', appliedInGame: 1 }]),
      T('home', 'p1', 9),
      T('merc', 'p1', 2, [{ type: 'mercenary', appliedInGame: 1 }]),
    ),
    'p1', false, 'fz',
  )
  check('bio territory at 1 vacates', r.territories.bio.occupyingPlayerId === null)
  check('fallout zone at 1 vacates too', r.territories.fz.occupyingPlayerId === null)
  check('mercenary still pays out', r.territories.merc.troops === 3, String(r.territories.merc.troops))
  check('both losses reported', r.vacatedNames.length === 2, JSON.stringify(r.vacatedNames))
  check('home untouched', r.territories.home.troops === 9)
}

console.log('\n— attrition cannot wipe a player out —')
{
  // Everything they own bleeds; the last one standing must survive.
  const r = applyEndOfTurnScarEffects(
    board(
      T('fz', 'p1', 1),
      T('bio1', 'p1', 1, [{ type: 'biological', appliedInGame: 1 }]),
      T('bio2', 'p1', 1, [{ type: 'biological', appliedInGame: 1 }]),
    ),
    'p1', false, 'fz',
  )
  const held = Object.values(r.territories).filter(t => t.occupyingPlayerId === 'p1')
  check('at least one territory survives', held.length >= 1, `held ${held.length}`)
  check('exactly two were given up', r.vacatedNames.length === 2, JSON.stringify(r.vacatedNames))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
