// What card an AI takes when it earns a draw.
//
// Reported as "the AI doesn't seem to be taking any face-up cards". It does —
// when it is eligible. The rule is narrow: you may take a face-up territory
// card only for a territory you OCCUPY, or (once homelands exist) any card in
// your homeland continent. An AI penned into four territories on a continent
// none of the face-up cards belong to is not misbehaving by taking a coin; it
// has nothing else it is allowed to take.
//
// These pin the decision so the next report can be answered by running this
// rather than by reading the driver.
import { canClaimTerritoryCard, homelandContinentFor } from '@/lib/missionLogic'
import type { Territory } from '@/types/territory'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

const T = (id: string, continentId: string, owner: string | null): Territory => ({
  id, name: id, continentId, occupyingPlayerId: owner, troops: 3,
  cities: [], adjacentIds: [], scars: [], shape: '', labelX: 0, labelY: 0,
} as unknown as Territory)

/** The face-up row, as territory ids. */
const SIDEBOARD = ['western-us', 'eastern-us', 'kamchatka', 'indonesia']
const territories: Record<string, Territory> = {
  // ai-owner HOLDS a face-up territory; everything else on the row belongs to
  // someone else, which is the situation the report came from.
  'western-us':  T('western-us', 'north-america', 'ai-owner'),
  'eastern-us':  T('eastern-us', 'north-america', 'human1'),
  'kamchatka':   T('kamchatka', 'asia', 'human2'),
  'indonesia':   T('indonesia', 'australia', 'human2'),
  'congo':       T('congo', 'africa', 'ai-africa'),
  'brazil':      T('brazil', 'south-america', 'ai-samerica'),
}

/**
 * The AI's choice, reproducing the branch in GameBoard: the first face-up card
 * it may claim, else the top resource card, else skip. `cardDrawBlockReason` is
 * folded in — a coin is ILLEGAL while a face-up card is claimable, which is
 * what makes the preference a rule rather than a heuristic.
 */
function aiPick(
  playerId: string,
  homeland: string | null,
  opts: { resourceLeft?: number; coinsHeld?: number; purist?: boolean } = {},
): { picks: 'face-up' | 'resource' | 'skip'; card?: string } {
  const { resourceLeft = 5, coinsHeld = 0, purist = false } = opts
  const claimable = (tid: string) => canClaimTerritoryCard(playerId, tid, territories, homeland)
  const faceUp = SIDEBOARD.find(claimable)
  const coinBlocked = SIDEBOARD.some(claimable) || (purist && coinsHeld >= 2)
  if (faceUp) return { picks: 'face-up', card: faceUp }
  if (resourceLeft > 0 && !coinBlocked) return { picks: 'resource' }
  return { picks: 'skip' }
}

console.log('\n— it takes a face-up card for a territory it holds —')
{
  const r = aiPick('ai-owner', null)
  check('picks face-up', r.picks === 'face-up', JSON.stringify(r))
  check('and the one it controls', r.card === 'western-us', String(r.card))
  check('a card it does not hold stays out of reach',
    !canClaimTerritoryCard('ai-owner', 'kamchatka', territories, null))
}

console.log('\n— homeland widens it to a whole continent —')
{
  // The live case: Khan Industries, homeland North America, holding NONE of the
  // face-up territories — an enemy holds both US cards — and still eligible.
  const r = aiPick('ai-khan', 'north-america')
  check('a homeland card is claimable', r.picks === 'face-up', JSON.stringify(r))
  check('even the one a HUMAN holds',
    canClaimTerritoryCard('ai-khan', 'eastern-us', territories, 'north-america'))
  check('but not one outside the homeland',
    !canClaimTerritoryCard('ai-khan', 'kamchatka', territories, 'north-america'))
  check('without a homeland the same AI gets nothing', aiPick('ai-khan', null).picks === 'resource')
}

console.log('\n— no claim means a coin, and that is correct —')
{
  // Die Mechaniker (Africa) and Enclave (South America): no face-up card is in
  // their homeland and they hold none of them.
  const africa = aiPick('ai-africa', 'africa')
  const samerica = aiPick('ai-samerica', 'south-america')
  check('the Africa AI takes a resource', africa.picks === 'resource', JSON.stringify(africa))
  check('the South America AI takes a resource', samerica.picks === 'resource')
  check('neither is a bug — nothing on the row is theirs',
    !SIDEBOARD.some(t => canClaimTerritoryCard('ai-africa', t, territories, 'africa')))
}

console.log('\n— a coin is ILLEGAL while a face-up card is claimable —')
{
  // Not a preference. The AI must not be able to duck a face-up card it owns by
  // taking a coin, and neither may a human.
  const claimable = SIDEBOARD.some(t => canClaimTerritoryCard('ai-owner', t, territories, null))
  check('the owner has a claimable card', claimable)
  check('so the AI never reaches the resource branch', aiPick('ai-owner', null).picks === 'face-up')
  check('while a player with no claim may take one', aiPick('ai-africa', 'africa').picks === 'resource')
}

console.log('\n— nothing legal at all means skip, not a stall —')
{
  // The queue must advance even when no pick is legal, or the AI driver waits
  // on a draw that can never happen and the game stops.
  const stuck = aiPick('ai-africa', 'africa', { resourceLeft: 0 })
  check('empty pile and no claim skips', stuck.picks === 'skip', JSON.stringify(stuck))
  const purist = aiPick('ai-africa', 'africa', { coinsHeld: 2, purist: true })
  check('a Purist holding 2 coins skips rather than stalling', purist.picks === 'skip')
  check('...but a Purist WITH a claim still takes the card',
    aiPick('ai-owner', null, { coinsHeld: 2, purist: true }).picks === 'face-up')
}

console.log('\n— the homeland rule needs the milestone —')
{
  const before = { doubleWinnerMilestoneTriggered: false, factionHomelands: { 'khan-industries': 'north-america' } }
  const after = { doubleWinnerMilestoneTriggered: true, factionHomelands: { 'khan-industries': 'north-america' } }
  check('no homeland before the double-winner milestone',
    homelandContinentFor(before, 'khan-industries') === null)
  check('and one after', homelandContinentFor(after, 'khan-industries') === 'north-america')
  check('a faction with no homeland recorded gets null',
    homelandContinentFor(after, 'imperial-balkania') === null)
  check('so eligibility follows the milestone',
    aiPick('ai-khan', homelandContinentFor(before, 'khan-industries')).picks === 'resource' &&
    aiPick('ai-khan', homelandContinentFor(after, 'khan-industries')).picks === 'face-up')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
