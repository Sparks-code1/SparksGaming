// Events must resolve on an AI turn, and must not leave the AI stuck.
//
// Most event kinds resolve when the card display is CLOSED, not when it is
// drawn. The AI driver used to close it with a bare setShowEventCard(false),
// skipping all of that — on an AI turn Riot, Fallout, Agent of Chaos, Fortify
// City, Control the People and the Mysterious Island draw never happened.
//
// The model below mirrors resolveEventCardDismiss plus the AI driver's
// follow-up branches in GameBoard.
import { EVENT_EFFECTS, EVENT_CARDS, NINTH_CITY_EVENT_CARD_IDS, CARD_LOOKUP } from '@/data/cards'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

/** Effects applied the moment the card is drawn (inside triggerEventCard). */
const APPLIED_AT_TRIGGER = new Set([
  'ceasefire', 'ammunition-shortage', 'nuclear-fallout-round', 'forced-march',
  'population-boom', 'arms-race', 'resistance', 'epidemic', 'famine',
])
/** Effects that only happen when the display is closed. */
const APPLIED_ON_DISMISS = new Set([
  'join-the-cause', 'die-humans', 'beam-down', 'mysterious-island',
  'fallout-event', 'fortify-city', 'control-the-people', 'riot',
  'agent-of-chaos', 'mutants-evolve',
])

/** What closing the card opens or does — mirrors resolveEventCardDismiss. */
function dismiss(kind: string, world: { aliens?: boolean; mutants?: boolean; ruinable?: boolean; beamTarget?: boolean; leader?: string | null }) {
  const opened: string[] = []
  const did: string[] = []
  switch (kind) {
    case 'join-the-cause': opened.push('joinTheCause'); break
    case 'die-humans':
      if (world.aliens && world.ruinable) opened.push('dieHumans'); else did.push('returnedToDiscard'); break
    case 'beam-down': if (world.aliens && world.beamTarget) opened.push('beamDown'); break
    case 'mysterious-island': opened.push('cardDraw'); break
    case 'fallout-event': did.push('applyFalloutEvent'); break
    case 'fortify-city': opened.push('fortifyPlacement'); break
    case 'control-the-people': opened.push('controlChoice'); break
    case 'riot': did.push('applyRiotEvent'); break
    case 'agent-of-chaos': did.push('applyAgentOfChaos'); break
    case 'mutants-evolve':
      if (world.mutants) opened.push('mutantsEvolve'); else did.push('returnedToDiscard'); break
  }
  return { opened, did }
}

/** Which follow-up modals the AI driver can now resolve by itself. */
const AI_CAN_RESOLVE = new Set([
  'joinTheCause', 'dieHumans', 'beamDown', 'mutantsEvolve',
  'cardDraw', 'fortifyPlacement', 'controlChoice',
])

console.log('\n— every event kind is accounted for —')
{
  const kinds = new Set(Object.values(EVENT_EFFECTS).map((e: any) => e.kind))
  const uncovered = [...kinds].filter(k => !APPLIED_AT_TRIGGER.has(k) && !APPLIED_ON_DISMISS.has(k))
  check('no effect kind is unhandled', uncovered.length === 0, uncovered.join(','))
  check('the two sets do not overlap',
    [...APPLIED_ON_DISMISS].every(k => !APPLIED_AT_TRIGGER.has(k)))
  check('there are effects that ONLY resolve on dismiss',
    [...kinds].some(k => APPLIED_ON_DISMISS.has(k)))
}

console.log('\n— the skipped events —')
{
  // Closing the modal without running the handler did nothing for these.
  const skipped = [...APPLIED_ON_DISMISS]
  check('ten kinds were silently skipped on AI turns', skipped.length === 10, String(skipped.length))
  for (const kind of ['riot', 'fallout-event', 'agent-of-chaos']) {
    const r = dismiss(kind, {})
    check(`${kind} applies immediately on dismiss`, r.did.length === 1, JSON.stringify(r))
  }
  for (const kind of ['fortify-city', 'control-the-people', 'mysterious-island']) {
    const r = dismiss(kind, { leader: 'p1' })
    check(`${kind} opens a follow-up the AI can already resolve`,
      r.opened.length === 1 && AI_CAN_RESOLVE.has(r.opened[0]), JSON.stringify(r))
  }
}

console.log('\n— nothing the AI opens can strand it —')
{
  const worlds = [
    { name: 'aliens + mutants present, targets available', w: { aliens: true, mutants: true, ruinable: true, beamTarget: true, leader: 'p1' } },
    { name: 'aliens present, nothing to ruin',             w: { aliens: true, mutants: true, ruinable: false, beamTarget: false, leader: 'p1' } },
    { name: 'no aliens, no mutants',                       w: { aliens: false, mutants: false, ruinable: false, beamTarget: false, leader: 'p1' } },
  ]
  let ok = true
  for (const { name, w } of worlds) {
    for (const kind of APPLIED_ON_DISMISS) {
      const r = dismiss(kind, w)
      for (const o of r.opened) {
        if (!AI_CAN_RESOLVE.has(o)) { ok = false; console.log(`   ${name}: ${kind} opens unresolvable ${o}`) }
      }
    }
  }
  check('every follow-up an AI can open has an AI branch', ok)
}

console.log('\n— faction events with nobody to own them return the card —')
{
  check('Die Humans with no Aliens returns to the discard',
    dismiss('die-humans', { aliens: false }).did.includes('returnedToDiscard'))
  check('Die Humans with Aliens but no minor city returns it too',
    dismiss('die-humans', { aliens: true, ruinable: false }).did.includes('returnedToDiscard'))
  check('Mutants Evolve with no Mutants returns it',
    dismiss('mutants-evolve', { mutants: false }).did.includes('returnedToDiscard'))
  check('Beam Down with no target opens nothing and destroys nothing',
    dismiss('beam-down', { aliens: true, beamTarget: false }).opened.length === 0)
}

console.log('\n— single-use cards really are single use —')
{
  // EVENT_CARDS is the base set; the removeAfterUse ones are the ninth-city
  // unlocks, so look them up by id rather than in that array.
  const ninth = NINTH_CITY_EVENT_CARD_IDS
    .map(id => CARD_LOOKUP.get(id))
    .filter((c): c is any => !!c)
  const removeAfter = ninth.filter(c => c.removeAfterUse).map(c => c.id)
  check('the base events all come back around',
    EVENT_CARDS.every(c => !c.removeAfterUse))
  check('some unlocked events are removed after use', removeAfter.length > 0, String(removeAfter.length))
  check('Resistance is one of them', removeAfter.some((id: string) => id.startsWith('ec-resistance')))
  check('every ninth-city event id has an effect',
    NINTH_CITY_EVENT_CARD_IDS.every(id => !!EVENT_EFFECTS[id]))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
