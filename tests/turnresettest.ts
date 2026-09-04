// The end-of-turn reset must clear EVERY per-turn field.
//
// It used to name them one by one and had fallen behind: `eligibleForRichCard`
// was never cleared, so once the World Capital mission was claimed the flag
// stayed true for the rest of the game — and that flag IS the mission's whole
// condition, so every later player would have satisfied it for free.
import { initialTurnState } from '@/types/game'
import { checkMission } from '@/lib/missionLogic'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

/**
 * What END_TURN applies at the turn hand-off.
 *
 * GameBoard used to apply this too, just before dispatching — two
 * implementations of one rule, of which the reducer's always landed last. The
 * component's copy is gone; this shape is now asserted in one place because it
 * exists in one place.
 */
const resetPatch = (continentsAtTurnStart: number) => ({
  ...initialTurnState(),
  continentsAtTurnStart,
})

console.log('\n— a dirty turn is fully cleared —')
{
  const dirty = {
    ...initialTurnState(),
    captured: true, captureCount: 4,
    conqueredIds: ['brazil', 'peru'], conqueredViaSeaIds: ['iceland'],
    bearTrapTerritoryId: 'congo',
    attackedTerritoryIds: ['egypt'], shieldedTerritoryIds: ['ukraine'],
    expandedIntoCity: true,
    richCardsTradedIn: 2, resourcesTradedIn: 11, knockedOutRichPlayer: true,
    continentsAtTurnStart: 3,
    eligibleForRichCard: true,
    richCardTerritoryIds: ['brazil'],
  }
  const next = { ...dirty, ...resetPatch(1) }
  const fresh = { ...initialTurnState(), continentsAtTurnStart: 1 }

  for (const key of Object.keys(fresh) as Array<keyof typeof fresh>) {
    check(`${key} is reset`,
      JSON.stringify(next[key]) === JSON.stringify(fresh[key]),
      `got ${JSON.stringify(next[key])} want ${JSON.stringify(fresh[key])}`)
  }
  check('no field survives the hand-off',
    JSON.stringify(next) === JSON.stringify(fresh),
    JSON.stringify(next))
}

console.log('\n— the incoming continent snapshot is kept —')
{
  check('continentsAtTurnStart carries the computed value', resetPatch(2).continentsAtTurnStart === 2)
  check('and is the ONLY field that differs from a fresh turn',
    Object.entries(resetPatch(2))
      .filter(([k, v]) => JSON.stringify((initialTurnState() as any)[k]) !== JSON.stringify(v))
      .map(([k]) => k).join(',') === 'continentsAtTurnStart')
}

console.log('\n— the World Capital flag no longer leaks across turns —')
{
  const owned: any = { a: { id: 'a', continentId: 'asia', occupyingPlayerId: 'p2',
    troops: 1, scars: [], cities: [], adjacentIds: [] } }
  const wc = (turn: any) => checkMission('mc-world-capital', 'p2', owned,
    { turn } as any, { conqueredIds: [], conqueredViaSeaIds: [] }, 0)

  const claimed = { ...initialTurnState(), eligibleForRichCard: true, richCardTerritoryIds: ['brazil'] }
  check('the claiming player did satisfy it', wc(claimed))
  check('the NEXT player does not', !wc({ ...claimed, ...resetPatch(0) }))
  check('and inherits no target territory',
    ({ ...claimed, ...resetPatch(0) }).richCardTerritoryIds.length === 0)
}

console.log('\n— rewards owed to OTHER players survive the hand-off —')
{
  // The turn reset is about the turn. Four event follow-ups belong to a player
  // the BOARD picked, not to whoever is playing, and clearing those at END_TURN
  // destroyed them before their owner could act — on an AI turn, within a
  // second or two. Fortify City is the one that genuinely belongs to the
  // current player, so it still expires.
  type Pickers = {
    fortifyEventPlayerId: string | null      // the DRAWER — expires with the turn
    resistancePlacement: any                 // fewest territories
    joinCausePlacement: any                  // largest population
    controlPeopleChoice: string | null       // largest population
    controlTroopsPlayerId: string | null     // largest population
    controlManeuver: any                     // largest population
    riotRemovalPlayerId: string | null       // lowest roll — a debt, not a prize
  }
  const mid: Pickers = {
    fortifyEventPlayerId: 'currentPlayer',
    resistancePlacement: { playerId: 'ryan', troopsLeft: 2 },
    joinCausePlacement: { playerId: 'ryan', troopsLeft: 3 },
    controlPeopleChoice: 'ryan',
    controlTroopsPlayerId: 'ryan',
    controlManeuver: { playerId: 'ryan', srcId: 'congo' },
    riotRemovalPlayerId: 'ryan',
  }

  const oldEndTurn = (_p: Pickers): Pickers => ({
    fortifyEventPlayerId: null, resistancePlacement: null, joinCausePlacement: null,
    controlPeopleChoice: null, controlTroopsPlayerId: null, controlManeuver: null,
    riotRemovalPlayerId: null,
  })
  const newEndTurn = (p: Pickers): Pickers => ({ ...p, fortifyEventPlayerId: null })

  const after = newEndTurn(mid)
  const boardPicked: Array<keyof Pickers> = [
    'resistancePlacement', 'joinCausePlacement', 'controlPeopleChoice',
    'controlTroopsPlayerId', 'controlManeuver', 'riotRemovalPlayerId',
  ]
  for (const key of boardPicked) {
    check(`${key} used to be destroyed`, oldEndTurn(mid)[key] === null)
    check(`${key} now survives`, JSON.stringify(after[key]) === JSON.stringify(mid[key]))
  }
  check("Fortify City still expires — it is the drawer's", after.fortifyEventPlayerId === null)
  check('nothing else is touched',
    JSON.stringify({ ...after, fortifyEventPlayerId: 'currentPlayer' }) === JSON.stringify(mid))

  // They must still be resolvable, or a survivor becomes a permanent hint bar.
  // Every one belongs to a named player and self-clears when it resolves.
  const owners = [after.resistancePlacement?.playerId, after.joinCausePlacement?.playerId,
    after.controlPeopleChoice, after.controlTroopsPlayerId,
    after.controlManeuver?.playerId, after.riotRemovalPlayerId]
  check('every survivor still names its owner', owners.every(o => o === 'ryan'), JSON.stringify(owners))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
