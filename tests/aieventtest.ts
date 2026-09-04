import { readFileSync } from 'node:fs'
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

// ── The nuclear milestone is an announcement holding a board change ────────
//
// THE SAME SHAPE AS EVERY EVENT ABOVE, which is why it belongs in this file:
// it resolves when the display is CLOSED, not when it opens.
// handleNuclearMilestoneComplete is what dispatches OBLITERATE_TERRITORY, so
// until somebody presses the modal the Fallout Zone does not exist.
//
// It was in NEITHER of the two lists that make an interrupt safe on an AI turn:
// not in humanBlockingChoice, so the driver played straight through it, and not
// in the interrupt concierge, so nothing answered it either. An AI carried on
// underneath an announcement holding an unmade board change, and the crater
// landed whenever the human next looked — possibly turns later, onto a board
// that had moved on.
{
  const board = readFileSync('src/components/GameBoard.tsx', 'utf8')
  const at = board.indexOf('function humanBlockingChoice()')
  const fn = at < 0 ? '' : board.slice(at, board.indexOf('\n  }', at))

  check('the driver stands down for the nuclear announcement',
    /if \(pendingNuclear\) return/.test(fn))

  // AND IT IS STILL THE CLOSE THAT WRITES THE CRATER. If that ever stops being
  // true the guard above is unnecessary — and if the guard is removed while it
  // IS true, the bug comes straight back. Pinned together for that reason.
  const done = board.indexOf('function handleNuclearMilestoneComplete()')
  const doneFn = done < 0 ? '' : board.slice(done, done + 1600)
  check('...because closing it is what makes the crater',
    /dispatch\(\{\s*[\r\n]+\s*type: 'OBLITERATE_TERRITORY'/.test(doneFn))

  // NOBODY'S CHOICE, so unlike the entries around it this one is not gated on
  // whose it is: the announcement shows on every machine and whoever is at
  // this one closes it. Gating it on a player would put it back to sleep on
  // exactly the machine that has to write.
  check('...and it is not gated on a player owning it',
    /if \(pendingNuclear\) return '[^']*'\n/.test(fn + '\n'))

  // ── AND SOMETHING ANSWERS IT WHEN NO HUMAN CAN ──────────────────────────
  //
  // The guard above cost a second bug the moment it landed. An AI can BE the
  // one who fires the milestone — the third missile on a roll brings the fire
  // whoever played it — so on a table whose last human has been eliminated the
  // driver stands down on an announcement nobody is left to press, and the
  // game stops for good. Playing straight through it was the first bug;
  // waiting forever is the second, and the same guard causes it.
  const cAt = board.indexOf('Answers every interrupt choice OWNED BY AN AI')
  const cEnd = board.indexOf('Missile replenishment', cAt)
  const concierge = cAt < 0 || cEnd < 0 ? '' : board.slice(cAt, cEnd)
  check('the concierge is where it was found', concierge.length > 0)

  // CLOSED, NOT SKIPPED. Clearing pendingNuclear would unblock the driver and
  // lose the crater — quieter than the original bug and worse.
  check('the concierge closes the announcement for the AI',
    /if \(pendingNuclear && !showCombat[\s\S]{0,400}?handleNuclearMilestoneComplete\(\)/.test(concierge))

  // ABOVE THE CURRENT-PLAYER BAIL, which is the whole trick: the milestone
  // fires DURING an AI's turn, and that bail is the concierge handing such
  // turns to the main loop — which is standing down on this very state. Below
  // the bail this branch is unreachable in the only case it exists for, and
  // nothing else in the file would notice.
  check('...before it hands AI turns back to the main loop',
    concierge.indexOf('handleNuclearMilestoneComplete') > 0
    && concierge.indexOf('handleNuclearMilestoneComplete') < concierge.indexOf('the main loop has it'))

  // ONLY WHEN NOBODY IS THERE. A human closes their own copy and reads it on
  // the way past; answering it for them would make the campaign's loudest
  // moment a flicker.
  check('...and only when no live human is left to press it',
    /!gameState\.players\.some\(p => !p\.isAI && !p\.isEliminated\)/.test(concierge))
}


console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
