// Truthtrance. The card's whole promise is that the answer cannot be false, so
// the checks worth writing are the ones about that promise rather than about
// any individual question: that the menu never offers something unanswerable,
// and that a gap in the server's knowledge never comes out as a "no".
import { readFileSync } from 'node:fs'
import {
  askTruthtrance, truthtranceBank, phraseQuestion, isPredictionQuestion, isBattlePlanQuestion,
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
  // A battle both sides have committed to and neither has revealed — the only
  // window the plan questions are legal in.
  //
  // The Harkonnen plan is the interesting one: a Cheap Hero leading, a BALISET
  // in the weapon slot, and nothing in the defence slot. A worthless card in a
  // weapon slot is the bluff the whole deck is built around, and it is what
  // separates "is a card there" from "is it a weapon".
  battle: {
    combatants: ['atreides', 'harkonnen'],
    plans: {
      atreides: {
        leader: { kind: 'leader', name: 'Duncan Idaho' },
        dialled: 6, weapon: 'lasgun', defence: 'shield',
      },
      harkonnen: {
        leader: { kind: 'cheap-hero' },
        dialled: 3, weapon: 'baliset', defence: null,
      },
    },
    revealed: false,
  },
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
  // Battle plan questions are excluded: they refuse for a window reason before
  // they ever reach a seat's secrets, which is a different rule tested below.
  const perSeat = (q: TruthtranceQuestion) =>
    !isPredictionQuestion(q) && !isBattlePlanQuestion(q)
  const answers = truthtranceBank({ maxSpice: 3 })
    .filter(perSeat)
    .map(q => ask('atreides', q, empty))
  check('no question about an unknown seat is answered at all',
    answers.filter(r => r.ok).length, 0)
  check('...every one of them refuses for the same stated reason',
    [...new Set(answers.map(r => r.ok ? 'answered' : r.refusal))], ['no-secret-for-seat'])
  // And the same seat WITH secrets answers all of them, so the check above is
  // about the missing data and not about the questions being broken.
  check('...while the same questions all answer when the store has the seat',
    truthtranceBank({ maxSpice: 3 }).filter(perSeat)
      .map(q => ask('atreides', q)).filter(r => !r.ok).length, 0)
}

// ── nothing in the menu is unanswerable ─────────────────────────────────────
// The bank is generated from the deck, the factions and their leaders, so it
// cannot offer a card or a leader the answerer has never heard of. Asserted
// because the two are generated from the same sources TODAY and a menu that
// offers a question the resolver refuses is a dead end in the UI.
{
  const bank = truthtranceBank()
  // Prediction questions go to the Bene Gesserit; everything else to the
  // Atreides, who are a combatant in the fixture's battle and so can answer the
  // plan questions too.
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

// ── the battle plan ─────────────────────────────────────────────────────────
check('a leader in the plan answers yes',
  answerOf(ask('atreides', { ask: 'plan-leader-is', leader: 'Duncan Idaho' })), true)
check('another of their own leaders answers no',
  answerOf(ask('atreides', { ask: 'plan-leader-is', leader: 'Gurney Halleck' })), false)
check('a Cheap Hero is not a leader and answers no to every leader',
  answerOf(ask('harkonnen', { ask: 'plan-leader-is', leader: 'Feyd-Rautha' })), false)
check('...and is found by its own question',
  [answerOf(ask('harkonnen', { ask: 'plan-uses-cheap-hero' })),
    answerOf(ask('atreides', { ask: 'plan-uses-cheap-hero' }))], [true, false])

// THE CARD THIS ONE IS FOR. The Harkonnen have a Baliset in the weapon slot.
// Something is there, and everyone at the table can see that something is
// there — what they cannot see is that it will do nothing. A question about
// the slot being occupied would answer yes and be worthless; this asks whether
// the card is a weapon.
check('a worthless card in the weapon slot is not a weapon',
  answerOf(ask('harkonnen', { ask: 'plan-has-weapon' })), false)
check('...while a real weapon answers yes',
  answerOf(ask('atreides', { ask: 'plan-has-weapon' })), true)
check('an empty defence slot answers no',
  answerOf(ask('harkonnen', { ask: 'plan-has-defence' })), false)
check('...and a defence answers yes',
  answerOf(ask('atreides', { ask: 'plan-has-defence' })), true)

// The Atreides are playing a Lasgun, whose class is its own. So they are
// playing a weapon, and they are playing neither a poison nor a projectile one
// — which is exactly the shape of the card and the reason "any weapon" is a
// separate question from the two classes.
check('the Lasgun is a weapon of no askable class',
  [answerOf(ask('atreides', { ask: 'plan-has-weapon' })),
    answerOf(ask('atreides', { ask: 'plan-weapon-of-class', battleClass: 'poison' })),
    answerOf(ask('atreides', { ask: 'plan-weapon-of-class', battleClass: 'projectile' }))],
  [true, false, false])
check('a Shield is found as a projectile defence, not a poison one',
  [answerOf(ask('atreides', { ask: 'plan-defence-of-class', battleClass: 'projectile' })),
    answerOf(ask('atreides', { ask: 'plan-defence-of-class', battleClass: 'poison' }))],
  [true, false])

// A slot holding the wrong sort of card. The battle phase should never write
// this, and that is exactly why it is worth pinning: the card's promise is that
// nothing it says is false, and "yes, they are playing a projectile weapon"
// about a Shield in the weapon slot would be false however the Shield got there.
// Every plan question reads the card's KIND as well as its class for this
// reason, and without that reading these four all answer the wrong way.
{
  const malformed = secrets()
  malformed.battle = {
    ...malformed.battle!,
    plans: {
      ...malformed.battle!.plans,
      atreides: {
        leader: { kind: 'leader', name: 'Duncan Idaho' },
        dialled: 6, weapon: 'shield', defence: 'crysknife',
      },
    },
  }
  check('a defence in the weapon slot is not a weapon of any class',
    [answerOf(ask('atreides', { ask: 'plan-has-weapon' }, malformed)),
      answerOf(ask('atreides', { ask: 'plan-weapon-of-class', battleClass: 'projectile' }, malformed))],
    [false, false])
  check('...and a weapon in the defence slot defends against nothing',
    [answerOf(ask('atreides', { ask: 'plan-has-defence' }, malformed)),
      answerOf(ask('atreides', { ask: 'plan-defence-of-class', battleClass: 'projectile' }, malformed))],
    [false, false])
}

check('the dial is met exactly', answerOf(ask('atreides', { ask: 'plan-dialled-at-least', amount: 6 })), true)
check('...and one over is not', answerOf(ask('atreides', { ask: 'plan-dialled-at-least', amount: 7 })), false)

// ── the window, which is the whole design ──────────────────────────────────
// THE ONE THAT MATTERS. The Atreides have committed; the Harkonnen have not.
// Answering here would let the asker read a plan while somebody is still
// writing theirs, which ends simultaneity as a phase. That the TARGET has
// committed is not enough.
{
  const midCommit = secrets()
  midCommit.battle = {
    combatants: ['atreides', 'harkonnen'],
    plans: { atreides: midCommit.battle!.plans.atreides },
    revealed: false,
  }
  check('a committed plan is not readable while anyone is still writing theirs',
    answerOf(ask('atreides', { ask: 'plan-has-weapon' }, midCommit)),
    'refused: plans-not-all-committed')
}
check('nothing is readable outside a battle',
  answerOf(ask('atreides', { ask: 'plan-has-weapon' }, { ...secrets(), battle: undefined })),
  'refused: no-battle-in-progress')
// Spending the card on a fact everyone can already see is a trap, not a play.
check('nothing is readable once the plans are face up',
  answerOf(ask('atreides', { ask: 'plan-has-weapon' },
    { ...secrets(), battle: { ...secrets().battle!, revealed: true } })),
  'refused: plans-already-revealed')
check('a player who is not in the battle has no plan to read',
  answerOf(ask('fremen', { ask: 'plan-has-weapon' })), 'refused: not-in-this-battle')
// The asker need not be fighting. A bystander learns a bit they cannot use in
// this battle, which is the card being weak rather than the rule being loose.
check('but the asker may be a bystander',
  answerOf(ask('atreides', { ask: 'plan-uses-cheap-hero' })), false)

check('a leader nobody has, asked of a plan',
  answerOf(ask('atreides', { ask: 'plan-leader-is', leader: 'Nobody' })), 'refused: no-such-leader')
check('a dial of zero, which every plan meets',
  answerOf(ask('atreides', { ask: 'plan-dialled-at-least', amount: 0 })),
  'refused: amount-out-of-range')

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

// ── the wiring: rows in, answers published, the card spent on truth ───────
{
  const { planFromRow } = await import('@/lib/dune/truthtrance')
  check('a row converts leader, hero, or NOBODY — never a lie either way',
    [planFromRow({ dial: 3, leader: 'Stilgar', weapon: 'crysknife' }),
      planFromRow({ dial: 2, cheapHero: true }),
      planFromRow({ dial: 1 })],
    [{ leader: { kind: 'leader', name: 'Stilgar' }, dialled: 3, weapon: 'crysknife', defence: null },
      { leader: { kind: 'cheap-hero' }, dialled: 2, weapon: null, defence: null },
      { leader: { kind: 'none' }, dialled: 1, weapon: null, defence: null }])
  const nobody = askTruthtrance({
    asker: 'harkonnen', target: 'atreides',
    question: { ask: 'plan-uses-cheap-hero' },
    secrets: {
      hands: {}, traitors: {}, spice: {},
      battle: {
        combatants: ['atreides', 'emperor'],
        plans: {
          atreides: planFromRow({ dial: 1 }),
          emperor: planFromRow({ dial: 2, leader: 'Hasimir Fenring' }),
        },
        revealed: false,
      },
    } as never,
    turn: 4, phase: 'Battles',
  } as never)
  check('...and a leaderless plan answers NO to the hero, not undefined',
    nobody.ok && nobody.answer.answer, false)

  // ── the endpoint's discipline ───────────────────────────────────────────
  const fn = readFileSync('supabase/functions/dune-action/index.ts', 'utf8')
  const tt = fn.slice(fn.indexOf("case 'TRUTHTRANCE'"), fn.indexOf("case 'ALLY_GRANT'"))
  check('the play needs the card in hand, and the refusal keeps it there',
    [/code: 'card-not-held'/.test(tt),
      // refuse BEFORE spend: the order in the source is the proof
      tt.indexOf('askedTT.ok') < tt.indexOf('handTT.splice')],
    [true, true])
  check('one copy is spent — spliced, never filtered whole',
    /handTT\.splice\(handTT\.indexOf\('truthtrance'\), 1\)/.test(tt), true)
  check('the answer is published with its moment, the card discarded, the count moved',
    [/\{ asker: a\.asker, target: a\.target, asked: a\.asked, answer: a\.answer, asOf: a\.asOf \}/.test(tt),
      /treacheryDiscard: \[/.test(tt) && /'truthtrance',\s*[\r\n]+\s*\]/.test(tt),
      /handCount: handTT\.length/.test(tt)],
    [true, true, true])
  check('the store is assembled from every seated row — the law refuses loudly, never lies quietly',
    [/hands\[fac\] = row\.cards \?\? \[\]/.test(tt),
      /if \(fac === 'bene-gesserit' && row\.prediction\) prediction = row\.prediction/.test(tt),
      /\? \[\[f, planFromRow\(row\.battlePlan as never\)\]\] : \[\]/.test(tt)],
    [true, true, true])
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
