// The four Mutant Evolve powers.
//
// Each is revealed by a stance × aptitude pairing, claimed once, and permanent.
// Two of them change the dice, which means they now also run on the server —
// so what they do is pinned here against the real combat engine rather than a
// description of it.
//
// The id strings matter more than they look: GameBoard tests them as string
// LITERALS (`mutantHasEvolvePower('me-unstable-cloning')`). A renamed id in the
// data would not fail to compile — the power would just silently stop working.
import { MUTANT_EVOLVE_POWERS } from '@/data/missilePowers'
import {
  gameReducer, createSeededRng, resolveCombat, compareRolls, hasDoubles,
  type Action, type CombatModifiers,
} from '@/lib/gameReducer'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

const MODS: CombatModifiers = {
  attackerBonusAllDice: 0, attackerSubtractLowest: false, tripleKillEnabled: false,
  defenderBonusDiceCap: 0, nuclearFallout: false, attackerSixesWin: false,
  attackerRerollOnes: false,
}
const T = (id: string, owner: string | null, troops: number, extra: any = {}) => ({
  id, name: id, continentId: 'nowhere', occupyingPlayerId: owner, troops,
  cities: [], adjacentIds: [], scars: [], shape: '', labelX: 0, labelY: 0, ...extra,
})
const board = (): any => ({
  players: [
    { id: 'atk', name: 'Attacker', factionId: 'khan-industries', isEliminated: false, cards: [] },
    { id: 'mut', name: 'Mutants', factionId: 'mutants', isEliminated: false, cards: [] },
  ],
  territories: {
    src: T('src', 'atk', 10, { adjacentIds: ['tgt'] }),
    tgt: T('tgt', 'mut', 5, { adjacentIds: ['src'] }),
    safe: T('safe', 'mut', 4, { adjacentIds: ['src'] }),
  },
  currentPlayerIndex: 0, phase: 'attack', turnNumber: 1,
  turn: { captured: false, conqueredIds: [], conqueredViaSeaIds: [], attackedTerritoryIds: [] },
  activeHqs: {},
})

console.log('\n— the four powers, and the ids GameBoard depends on —')
{
  check('there are exactly four', MUTANT_EVOLVE_POWERS.length === 4, String(MUTANT_EVOLVE_POWERS.length))
  const ids = MUTANT_EVOLVE_POWERS.map(p => p.id).sort()
  check('ids are unique', new Set(ids).size === 4)
  // Cross-check against the literals GameBoard tests. A rename here is silent.
  for (const id of ['me-mass-hypnosis', 'me-unstable-cloning', 'me-unnatural-strength', 'me-mindshackle']) {
    check(`${id} exists`, ids.includes(id))
  }
  check('every power has a name and description',
    MUTANT_EVOLVE_POWERS.every(p => !!p.name && p.description.length > 20))
}

console.log('\n— the reveal pairing covers all four corners —')
{
  // The modal finds a power by (stance, aptitude). A duplicate pairing would
  // make one power unreachable forever.
  const pairs = MUTANT_EVOLVE_POWERS.map(p => `${p.stance}/${p.aptitude}`)
  check('no two powers share a pairing', new Set(pairs).size === 4, pairs.join(', '))
  for (const stance of ['offensive', 'defensive']) {
    for (const aptitude of ['brains', 'brawn']) {
      const hit = MUTANT_EVOLVE_POWERS.find(p => p.stance === stance && p.aptitude === aptitude)
      check(`${stance}/${aptitude} reveals something`, !!hit, `${stance}/${aptitude}`)
    }
  }
}

console.log('\n— Unnatural Strength: attacker 6s beat defender 6s —')
{
  // The real comparison function, not a description of it.
  check('normally a tied 6 goes to the defender',
    compareRolls([6], [6], false).aLoss === 1 && compareRolls([6], [6], false).dLoss === 0)
  check('with the power the attacker wins it',
    compareRolls([6], [6], true).dLoss === 1 && compareRolls([6], [6], true).aLoss === 0)
  check('it only affects 6 vs 6 — a 5 still loses to a 6',
    compareRolls([5], [6], true).aLoss === 1)
  check('and does not change a win the attacker already had',
    compareRolls([6], [5], true).dLoss === 1 && compareRolls([6], [5], false).dLoss === 1)
  check('multiple tied 6s all flip',
    compareRolls([6, 6], [6, 6], true).dLoss === 2)

  // Over many battles it must actually help.
  let withPower = 0, without = 0
  for (let seed = 0; seed < 400; seed++) {
    if (resolveCombat(10, 5, { ...MODS, attackerSixesWin: true }, createSeededRng(seed)).captured) withPower++
    if (resolveCombat(10, 5, MODS, createSeededRng(seed)).captured) without++
  }
  check('it wins more battles than not having it', withPower > without, `${withPower} vs ${without}`)
  check('and never fewer', withPower >= without)
}

console.log('\n— Unstable Cloning: +1 defender on natural doubles —')
{
  check('two matching dice are doubles', hasDoubles([4, 4]))
  check('three matching are too', hasDoubles([2, 2, 2]))
  check('distinct dice are not', !hasDoubles([3, 5]))
  check('a single die cannot be doubles', !hasDoubles([6]))

  // The bonus is applied by the reducer on a REPELLED attack.
  const repelled: Action = {
    type: 'RESOLVE_COMBAT', srcId: 'src', tgtId: 'tgt',
    totalAtkLoss: 3, totalDefLoss: 1, captured: false, troopsToAdvance: 0,
    entryCostTotal: 0, entryCostFalloutHalf: false, defenderCloningBonus: 1,
  }
  const r = gameReducer(board(), repelled, createSeededRng(1))
  check('the defender loses its troops', r.state.territories.tgt.troops === 5 - 1 + 1)
  check('and gains the cloned one', r.state.territories.tgt.troops === 5)
  check('the attacker still takes its losses', r.state.territories.src.troops === 7)

  const noPower = gameReducer(board(), { ...repelled, defenderCloningBonus: 0 } as Action, createSeededRng(1))
  check('without the power the defender is down one', noPower.state.territories.tgt.troops === 4)

  // On a CAPTURE there is no defender left to clone.
  const captured: Action = {
    type: 'RESOLVE_COMBAT', srcId: 'src', tgtId: 'tgt',
    totalAtkLoss: 2, totalDefLoss: 5, captured: true, troopsToAdvance: 4,
    entryCostTotal: 0, entryCostFalloutHalf: false, defenderCloningBonus: 1,
  }
  const cap = gameReducer(board(), captured, createSeededRng(1))
  check('a captured territory does not clone', cap.state.territories.tgt.troops === 4)
  check('and changes hands', cap.state.territories.tgt.occupyingPlayerId === 'atk')
}

console.log('\n— the server only clones when the dice really rolled doubles —')
{
  // DECLARE_ATTACK rolls server-side, so it can CHECK rather than trust the
  // caller: the bonus is gated on the outcome, not on the payload.
  const declare = (): Action => ({
    type: 'DECLARE_ATTACK', playerId: 'atk', srcId: 'src', tgtId: 'tgt',
    troopsToAdvance: 3, mods: MODS,
    entryCostTotal: 0, entryCostFalloutHalf: false, defenderCloningBonus: 1,
  })
  let clonedWithDoubles = 0, clonedWithout = 0
  for (let seed = 0; seed < 150; seed++) {
    const res = gameReducer(board(), declare(), createSeededRng(seed))
    const outcome = resolveCombat(10, 5, MODS, createSeededRng(seed))
    if (outcome.captured) continue
    const expected = 5 - outcome.totalDefLoss + (outcome.defDoublesRounds > 0 ? 1 : 0)
    if (res.state.territories.tgt.troops !== expected) {
      if (outcome.defDoublesRounds > 0) clonedWithDoubles++
      else clonedWithout++
    }
  }
  check('the bonus matches the dice on every repelled attack',
    clonedWithDoubles === 0 && clonedWithout === 0, `${clonedWithDoubles}/${clonedWithout} mismatches`)

  // A forged claim cannot conjure the bonus when no doubles were rolled.
  const noDoublesSeed = Array.from({ length: 300 }, (_, s) => s)
    .find(s => { const o = resolveCombat(10, 5, MODS, createSeededRng(s)); return !o.captured && o.defDoublesRounds === 0 })
  if (noDoublesSeed === undefined) { check('found a no-doubles battle to test', false) }
  else {
    const o = resolveCombat(10, 5, MODS, createSeededRng(noDoublesSeed))
    const res = gameReducer(board(), declare(), createSeededRng(noDoublesSeed))
    check('no doubles means no clone even though the action asked for one',
      res.state.territories.tgt.troops === 5 - o.totalDefLoss, String(res.state.territories.tgt.troops))
  }
}

console.log('\n— Mass Hypnosis: the named territory cannot be attacked —')
{
  // Mirrors the attack-target filter in GameBoard.
  const targets = (protectedId: string | null) => {
    const st = board()
    const src = st.territories.src
    return src.adjacentIds
      .concat(['safe'])
      .filter((id: string) => id !== protectedId
        && st.territories[id]?.occupyingPlayerId !== 'atk')
  }
  check('unprotected, both enemy territories are attackable',
    targets(null).sort().join(',') === 'safe,tgt')
  check('the hypnotised one is removed', !targets('tgt').includes('tgt'))
  check('the other is still attackable', targets('tgt').includes('safe'))
  check('protecting one does not protect them all', targets('tgt').length === 1)
}

console.log('\n— Mindshackle: only from a player you conquered this turn —')
{
  // Mirrors the victim filter: someone you took a territory from THIS turn who
  // still holds at least one card.
  const victims = (conqueredFrom: string[], hands: Record<string, string[]>, me: string) =>
    conqueredFrom.filter(v => v !== me && (hands[v] ?? []).length > 0)
  const hands = { atk: ['c1'], mut: ['c2', 'c3'], bystander: ['c4'] }
  check('a conquered player with cards is a victim',
    victims(['bystander'], hands, 'mut').join(',') === 'bystander')
  check('someone you did not fight is not', !victims(['bystander'], hands, 'mut').includes('atk'))
  check('a conquered player with no cards is not',
    victims(['broke'], { ...hands, broke: [] }, 'mut').length === 0)
  check('you are never your own victim', !victims(['mut'], hands, 'mut').includes('mut'))
  check('nobody conquered means no trade', victims([], hands, 'mut').length === 0)
}

console.log('\n— claiming one is permanent and single-use —')
{
  // Mirrors handleMutantsEvolveReveal: the power is kept and the card is gone.
  const claim = (legacy: any, powerId: string, cardId: string) => ({
    ...legacy,
    mutantEvolvePowers: [...(legacy.mutantEvolvePowers ?? []), powerId],
    destroyedEventCardIds: [...(legacy.destroyedEventCardIds ?? []), cardId],
  })
  let ls: any = { mutantEvolvePowers: [], destroyedEventCardIds: [] }
  ls = claim(ls, 'me-unnatural-strength', 'ec-mutants-evolve-1')
  check('the power is kept', ls.mutantEvolvePowers.includes('me-unnatural-strength'))
  check('and the card destroyed', ls.destroyedEventCardIds.includes('ec-mutants-evolve-1'))
  check('a power not taken is not active', !ls.mutantEvolvePowers.includes('me-mindshackle'))

  // The modal refuses a pairing already revealed, so it cannot be taken twice.
  const revealed = new Set<string>(ls.mutantEvolvePowers)
  const pick = (stance: string, aptitude: string) =>
    MUTANT_EVOLVE_POWERS.find(p => p.stance === stance && p.aptitude === aptitude)
  const strength = pick('offensive', 'brawn')!
  check('re-picking that pairing is already revealed', revealed.has(strength.id))
  check('another pairing is still available', !revealed.has(pick('defensive', 'brains')!.id))

  ls = claim(ls, 'me-mass-hypnosis', 'ec-mutants-evolve-2')
  check('a second power stacks', ls.mutantEvolvePowers.length === 2)
  check('both cards are gone', ls.destroyedEventCardIds.length === 2)
  check('all four could eventually be held',
    MUTANT_EVOLVE_POWERS.every(p => claim(ls, p.id, 'x').mutantEvolvePowers.includes(p.id)))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
