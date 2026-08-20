// Faction cards during the draft: every weakness reads yellow, and the lead
// faction is identifiable.
//
// Weakness powers used to carry their own accent colours — orange, blue,
// purple, red, grey — so a drawback could render in the same blue as a comeback
// power or the same red as a star power.
import { factionPowers, factionCampaignMarks, POWER_YELLOW, POWER_BLUE, POWER_RED, POWER_GREEN }
  from '@/lib/factionPowers'
import { WEAKNESS_POWERS } from '@/data/weaknessPowers'
import { leadFactionId, factionWinCounts } from '@/lib/gameLogic'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

const base: any = {
  alienWeaknessPowers: {}, comebackPowers: {}, factionStarPowerMissions: {},
  removedAbilityIds: [], victoryLog: [],
}
const weaknessLines = (lines: any[]) => lines.filter(l => l.label.startsWith('⚠'))

console.log('\n— every weakness power renders yellow —')
{
  check('there are several weakness powers to check', WEAKNESS_POWERS.length >= 5, String(WEAKNESS_POWERS.length))
  check('they do NOT all share a colour in the data',
    new Set(WEAKNESS_POWERS.map(w => w.color)).size > 1)

  let allYellow = true
  for (const wp of WEAKNESS_POWERS) {
    const legacy = { ...base, alienWeaknessPowers: { 'khan-industries': wp.id } }
    const lines = weaknessLines(factionCampaignMarks('khan-industries', legacy))
    if (lines.length !== 1) { allYellow = false; console.log(`   ${wp.id}: expected 1 weakness line, got ${lines.length}`) }
    else if (lines[0].color !== POWER_YELLOW) { allYellow = false; console.log(`   ${wp.id}: ${lines[0].color}`) }
  }
  check(`all ${WEAKNESS_POWERS.length} render as ${POWER_YELLOW}`, allYellow)
}

console.log('\n— the Alien Collaborator weakness matches —')
{
  const legacy = { ...base, alienCollaboratorFactionId: 'saharan-republic' }
  const lines = weaknessLines(factionCampaignMarks('saharan-republic', legacy))
  check('it is a weakness line', lines.length === 1)
  check('and it is the same yellow', lines[0]?.color === POWER_YELLOW)
}

console.log('\n— two weaknesses on one faction both read yellow —')
{
  const legacy = {
    ...base,
    alienWeaknessPowers: { 'die-mechaniker': WEAKNESS_POWERS[0].id },
    alienCollaboratorFactionId: 'die-mechaniker',
  }
  const lines = weaknessLines(factionCampaignMarks('die-mechaniker', legacy))
  check('both appear', lines.length === 2, String(lines.length))
  check('both yellow', lines.every(l => l.color === POWER_YELLOW))
}

console.log('\n— weakness yellow is distinct from the other categories —')
{
  // Widened to string on purpose: narrowed to literals the compiler decides
  // these can never be equal and objects to the comparison, which would leave
  // nothing guarding against a future edit that makes two colours match.
  const colour = (c: string) => c
  check('not the comeback blue', colour(POWER_YELLOW) !== POWER_BLUE)
  check('not the star-power red', colour(POWER_YELLOW) !== POWER_RED)
  check('not the starting-power green', colour(POWER_YELLOW) !== POWER_GREEN)

  // A faction carrying one of each: the categories must stay tellable apart.
  const legacy = {
    ...base,
    alienWeaknessPowers: { 'enclave-of-the-bear': WEAKNESS_POWERS[1].id },
    comebackPowers: { 'enclave-of-the-bear': 'aggressive' },
  }
  const lines = factionPowers('enclave-of-the-bear', legacy, {})
  const colours = new Set(lines.map(l => l.color))
  check('the weakness is yellow', lines.some(l => l.label.startsWith('⚠') && l.color === POWER_YELLOW))
  check('the comeback stays blue', lines.some(l => l.label.startsWith('↺') && l.color === POWER_BLUE))
  check('no two categories collide', colours.size === lines.length ||
    lines.every(l => !l.label.startsWith('⚠') || l.color === POWER_YELLOW))
}

console.log('\n— a faction with no weakness shows none —')
{
  const lines = weaknessLines(factionCampaignMarks('imperial-balkania', base))
  check('nothing is invented', lines.length === 0)
}

console.log('\n— the lead faction —')
{
  const log = (...factions: string[]) => factions.map((factionId, i) => ({ gameNumber: i + 1, factionId }))
  check('a clear leader is named',
    leadFactionId(log('aliens', 'aliens', 'khan-industries')) === 'aliens')
  check('a tie means no lead faction',
    leadFactionId(log('aliens', 'khan-industries')) === null)
  check('no games played means none', leadFactionId([]) === null)
  check('the badge reports the right win count',
    factionWinCounts(log('aliens', 'aliens', 'khan-industries'))['aliens'] === 2)
  check('a faction that never won counts zero',
    (factionWinCounts(log('aliens'))['mutants'] ?? 0) === 0)

  // The real campaign shape: Ryan won g3/g4 with different factions, so wins
  // follow the FACTION, not the player.
  const real = [
    { gameNumber: 1, factionId: 'enclave-of-the-bear' },
    { gameNumber: 2, factionId: 'khan-industries' },
    { gameNumber: 3, factionId: 'khan-industries' },
    { gameNumber: 4, factionId: 'imperial-balkania' },
    { gameNumber: 5, factionId: 'aliens' },
    { gameNumber: 6, factionId: 'aliens' },
  ]
  check('khan and aliens tie on 2, so there is no leader', leadFactionId(real) === null)
  const counts = factionWinCounts(real)
  check('khan-industries has 2', counts['khan-industries'] === 2)
  check('aliens has 2', counts['aliens'] === 2)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
