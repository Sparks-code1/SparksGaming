// Truthtrance. The card's whole promise is that the answer cannot be false, so
// the checks worth writing are the ones about that promise rather than about
// any individual question: that the menu never offers something unanswerable,
// and that a gap in the server's knowledge never comes out as a "no".
import {
  askTruthtrance, truthtranceBank, phraseQuestion, isPredictionQuestion,
} from '@/lib/dune/truthtrance'
import type { TruthtranceQuestion, TruthtranceSecrets } from '@/lib/dune/truthtrance'
import { TREACHERY_CARDS } from '@/data/dune/treachery'
import { FACTIONS, FACTION_IDS } from '@/data/dune/factions'
import type { FactionId } from '@/types/Dune/Faction'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

// A table with every seat filled, so "missing" is always deliberate below.
const secrets = (): TruthtranceSecrets => ({
  hands: {
    atreides: ['karama', 'shield', 'lasgun'],
    harkonnen: ['chaumas', 'baliset'],
    fremen: [],
    'bene-gesserit': ['snooper'],
    emperor: ['crysknife'],
    'spacing-guild': ['cheaphero'],
  },
  traitors: {
    atreides: ['Stilgar'],
    harkonnen: ['Duncan Idaho', 'Caid', 'Stilgar', 'Alia'],
    fremen: ['Lady Jessica'],
    'bene-gesserit': [],
    emperor: ['Gurney Halleck'],
    'spacing-guild': [],
  },
  spice: {
    atreides: 10, harkonnen: 0, fremen: 3,
    'bene-gesserit': 5, emperor: 12, 'spacing-guild': 5,
  },
  prediction: { faction: 'atreides', turn: 7 },
})

const ask = (target: FactionId, question: TruthtranceQuestion, s = secrets()) =>
  askTruthtrance({ asker: 'spacing-guild', target, question, secrets: s, turn: 4, phase: 'Bidding' })

/** The answer, or the refusal, flattened so a check can read either. */
const answerOf = (r: ReturnType<typeof ask>) => r.ok ? r.answer.answer : `refused: ${r.refusal}`

// ── the answers are right ───────────────────────────────────────────────────
check('a card in hand answers yes', answerOf(ask('atreides', { ask: 'holds-card', cardId: 'karama' })), true)
check('a card not in hand answers no', answerOf(ask('harkonnen', { ask: 'holds-card', cardId: 'karama' })), false)
check('an empty hand answers no rather than refusing',
  answerOf(ask('fremen', { ask: 'holds-card', cardId: 'karama' })), false)
check('kind is read off the deck, not the id',
  [answerOf(ask('atreides', { ask: 'holds-kind', kind: 'defense' })),
    answerOf(ask('harkonnen', { ask: 'holds-kind', kind: 'defense' }))], [true, false])
check('a poison weapon is found by its class',
  answerOf(ask('harkonnen', { ask: 'holds-weapon-of-class', battleClass: 'poison' })), true)
// The distinction the two class questions exist for. The Harkonnen hold Chaumas,
// a poison WEAPON; asking whether they can defend against poison is a different
// question with a different answer, and a single class question would conflate
// them into one useless bit.
check('...and holding the weapon is not holding the defence',
  answerOf(ask('harkonnen', { ask: 'holds-defence-of-class', battleClass: 'poison' })), false)
check('the Snooper answers the poison defence question',
  answerOf(ask('bene-gesserit', { ask: 'holds-defence-of-class', battleClass: 'poison' })), true)
// A Shield is a projectile defence and the Lasgun is neither poison nor
// projectile, so an Atreides hand of Karama/Shield/Lasgun answers exactly one of
// these four yes.
check('the four class questions are answered independently',
  [answerOf(ask('atreides', { ask: 'holds-weapon-of-class', battleClass: 'poison' })),
    answerOf(ask('atreides', { ask: 'holds-weapon-of-class', battleClass: 'projectile' })),
    answerOf(ask('atreides', { ask: 'holds-defence-of-class', battleClass: 'poison' })),
    answerOf(ask('atreides', { ask: 'holds-defence-of-class', battleClass: 'projectile' }))],
  [false, false, false, true])

check('a traitor held answers yes', answerOf(ask('atreides', { ask: 'traitor-is', leader: 'Stilgar' })), true)
check('a traitor not held answers no', answerOf(ask('atreides', { ask: 'traitor-is', leader: 'Alia' })), false)
// The Harkonnen keep all four they draw, so this question is a great deal more
// likely to answer yes against them. That is the faction power showing through
// the card, not a bug, but it is the reason the card is stronger against them.
check('the Harkonnen hold four, so more leaders answer yes',
  [answerOf(ask('harkonnen', { ask: 'traitor-is', leader: 'Duncan Idaho' })),
    answerOf(ask('harkonnen', { ask: 'traitor-is', leader: 'Caid' }))], [true, true])
check('a traitor is found by its faction',
  answerOf(ask('fremen', { ask: 'traitor-in-faction', faction: 'atreides' })), true)
check('...and not by the wrong faction',
  answerOf(ask('fremen', { ask: 'traitor-in-faction', faction: 'emperor' })), false)

check('spice at least, met exactly, answers yes',
  answerOf(ask('fremen', { ask: 'spice-at-least', amount: 3 })), true)
check('spice one over answers no', answerOf(ask('fremen', { ask: 'spice-at-least', amount: 4 })), false)
// Zero spice is a real holding, not a missing one. The seat is in the table with
// a 0, and every question about it must answer rather than refuse.
check('a seat holding nothing still answers',
  answerOf(ask('harkonnen', { ask: 'spice-at-least', amount: 1 })), false)

check('the prediction is one bit at a time',
  [answerOf(ask('bene-gesserit', { ask: 'predicted-faction', faction: 'atreides' })),
    answerOf(ask('bene-gesserit', { ask: 'predicted-faction', faction: 'emperor' })),
    answerOf(ask('bene-gesserit', { ask: 'predicted-turn', turn: 7 })),
    answerOf(ask('bene-gesserit', { ask: 'predicted-turn', turn: 6 }))],
  [true, false, true, false])

// ── the promise: no gap in the server's knowledge becomes a "no" ────────────
// The failure this guards against is the one that would break the card: a
// server that answers "no, they hold no Karama" because it never loaded their
// hand has lied under the one rule that says it cannot. Every question about a
// seat the store knows nothing about must refuse, not answer.
{
  const empty: TruthtranceSecrets = { hands: {}, traitors: {}, spice: {} }
  const answers = truthtranceBank({ maxSpice: 3 })
    .filter(q => !isPredictionQuestion(q))
    .map(q => ask('atreides', q, empty))
  check('no question about an unknown seat is answered at all',
    answers.filter(r => r.ok).length, 0)
  check('...every one of them refuses for the same stated reason',
    [...new Set(answers.map(r => r.ok ? 'answered' : r.refusal))], ['no-secret-for-seat'])
  // And the same seat WITH secrets answers all of them, so the check above is
  // about the missing data and not about the questions being broken.
  check('...while the same questions all answer when the store has the seat',
    truthtranceBank({ maxSpice: 3 }).filter(q => !isPredictionQuestion(q))
      .map(q => ask('atreides', q)).filter(r => !r.ok).length, 0)
}

// ── nothing in the menu is unanswerable ─────────────────────────────────────
// The bank is generated from the deck, the factions and their leaders, so it
// cannot offer a card or a leader the answerer has never heard of. Asserted
// because the two are generated from the same sources TODAY and a menu that
// offers a question the resolver refuses is a dead end in the UI.
{
  const bank = truthtranceBank()
  const refused = bank
    .map(q => ({ q, r: ask(isPredictionQuestion(q) ? 'bene-gesserit' : 'atreides', q) }))
    .filter(x => !x.r.ok)
    .map(x => `${phraseQuestion(x.q)} -> ${x.r.ok ? '' : x.r.refusal}`)
  check('every question the bank offers can be answered', refused, [])
  check('the bank asks about every card in the deck',
    bank.filter(q => q.ask === 'holds-card').length, TREACHERY_CARDS.length)
  check('the bank asks about every leader in the game',
    bank.filter(q => q.ask === 'traitor-is').length,
    FACTION_IDS.reduce((n, id) => n + (FACTIONS[id]?.leaders.length ?? 0), 0))
}

// ── who may be asked what ───────────────────────────────────────────────────
check('the card cannot be turned on its holder',
  answerOf(ask('spacing-guild', { ask: 'holds-card', cardId: 'karama' })), 'refused: target-is-self')
check('only the Bene Gesserit can be asked about the prediction',
  answerOf(ask('atreides', { ask: 'predicted-faction', faction: 'emperor' })),
  'refused: not-the-bene-gesserit')
check('and not even them before they have made it',
  answerOf(ask('bene-gesserit', { ask: 'predicted-turn', turn: 3 },
    { ...secrets(), prediction: undefined })), 'refused: no-prediction-made')

// ── ill-formed questions are refused, not guessed at ────────────────────────
check('a card that is not in the deck', answerOf(ask('atreides', { ask: 'holds-card', cardId: 'nosuch' })),
  'refused: no-such-card')
check('a leader nobody has', answerOf(ask('atreides', { ask: 'traitor-is', leader: 'Nobody' })),
  'refused: no-such-leader')
check('a spice threshold of zero, which would always answer yes',
  answerOf(ask('atreides', { ask: 'spice-at-least', amount: 0 })), 'refused: amount-out-of-range')
check('a turn outside the ten', answerOf(ask('bene-gesserit', { ask: 'predicted-turn', turn: 11 })),
  'refused: turn-out-of-range')

// ── the answer is a fact about a moment ─────────────────────────────────────
// Hands and spice move. Without the stamp the log reads as a standing fact and
// will be used as one three turns later.
{
  const r = ask('atreides', { ask: 'holds-card', cardId: 'karama' })
  check('the answer records when it was true', r.ok ? r.answer.asOf : null,
    { turn: 4, phase: 'Bidding' })
  check('...and carries its own wording for the public log',
    r.ok ? r.answer.asked : null, 'Do you hold a Karama?')
  check('...and who asked whom', r.ok ? [r.answer.asker, r.answer.target] : null,
    ['spacing-guild', 'atreides'])
}

// The same question against the same seat one turn later can answer differently,
// which is the whole reason the stamp exists.
{
  const later = secrets()
  later.hands = { ...later.hands, atreides: ['shield'] }
  check('the same question answers differently once the hand has moved',
    [answerOf(ask('atreides', { ask: 'holds-card', cardId: 'karama' })),
      answerOf(ask('atreides', { ask: 'holds-card', cardId: 'karama' }, later))],
    [true, false])
}

// ── the wording is public, so it has to read ────────────────────────────────
// One of one is "the Lasgun"; four of four is "a Shield". Taken from the deck's
// own copy counts rather than a list of exceptions.
check('a unique card is named with "the"',
  phraseQuestion({ ask: 'holds-card', cardId: 'lasgun' }), 'Do you hold the Lasgun?')
check('a card with copies is named with "a"',
  phraseQuestion({ ask: 'holds-card', cardId: 'shield' }), 'Do you hold a Shield?')
check('every question in the bank phrases as a question',
  truthtranceBank().filter(q => !phraseQuestion(q).endsWith('?')).length, 0)
// Aimed at a raw id leaking into public text — `bene-gesserit` where "Bene
// Gesserit" belongs, which is what the fallbacks in phraseQuestion would emit if
// a lookup ever missed. Written first as "no phrase contains a hyphen", which
// failed on Slip-tip: the card is spelt that way and the phrasing was right.
check('no question phrases with a raw id or an undefined',
  truthtranceBank()
    .map(q => phraseQuestion(q))
    .filter(text => /undefined|\bnull\b/.test(text) || FACTION_IDS.some(id => text.includes(id))),
  [])

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
