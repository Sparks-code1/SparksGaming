// The treachery deck. The shape checks matter more than any single card: a deck
// is a list of near-identical objects, which is exactly where one entry drifts
// from the rest and nothing notices.
import { TREACHERY_CARDS } from '@/data/dune/treachery'
import { TREACHERY_HEADER } from '@/types/Dune/Treachery'
import type { TreacheryCard, TreacheryKind } from '@/types/Dune/Treachery'
import { readFileSync, existsSync } from 'node:fs'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}
const copies = (cs: TreacheryCard[]) => cs.reduce((n, c) => n + c.copies, 0)

// ── the shape is the same all the way down ──────────────────────────────────
check('every card has an id, a name and text',
  TREACHERY_CARDS.filter(c => !c.id || !c.name || !c.text).map(c => c.id ?? c.name), [])
check('ids are unique', new Set(TREACHERY_CARDS.map(c => c.id)).size, TREACHERY_CARDS.length)
check('names are unique', new Set(TREACHERY_CARDS.map(c => c.name)).size, TREACHERY_CARDS.length)
check('every id is lower case with no spaces',
  TREACHERY_CARDS.filter(c => c.id !== c.id.toLowerCase().replace(/[^a-z0-9]/g, '')).map(c => c.id), [])
check('every card has at least one copy',
  TREACHERY_CARDS.filter(c => !(c.copies >= 1)).map(c => c.id), [])
check('every kind is one of the four',
  TREACHERY_CARDS.filter(c => !['weapon', 'defense', 'special', 'worthless'].includes(c.kind))
    .map(c => `${c.id}: ${c.kind}`), [])

// The concatenation bug, checked at the SOURCE rather than by hunting for words
// in the output. Every draft of this file has welded at least one join — first
// "mayprotect" and "cardif", then "movementrules" — because a string split
// across two lines loses the space at the seam and nothing about the result
// looks wrong until you read it aloud.
//
// Listing the welds already seen only ever catches those. Reading the joins
// catches the class: if the left piece ends in a letter and the right piece
// starts with one, there is no space between them.
{
  const src = readFileSync('src/data/dune/treachery.ts', 'utf8')
  const welds = [...src.matchAll(/(\S)['"]\s*\n\s*\+ ['"](\S)/g)]
    .filter(m => /[A-Za-z,.]/.test(m[1]) && /[A-Za-z]/.test(m[2]))
    .map(m => `...${m[1]}|${m[2]}...`)
  check('no string join welds two words together', welds, [])
}
check('no text has a doubled space',
  TREACHERY_CARDS.filter(c => /  /.test(c.text.replace(/\n/g, ''))).map(c => c.id), [])

// ── the deck's size ─────────────────────────────────────────────────────────
// 33 as it stands, and Truthtrance's two are inside that number. If Truthtrance
// is removed the deck is 31 and this fails saying so, rather than a count
// quietly moving.
const truthtrance = TREACHERY_CARDS.find(c => c.id === 'truthtrance')
check('Truthtrance is still in the deck', truthtrance?.copies ?? 0, 2)
check('33 cards in the deck, Truthtrance included', copies(TREACHERY_CARDS), 33)
check('...which is 31 without it', copies(TREACHERY_CARDS) - (truthtrance?.copies ?? 0), 31)

// ── weapons and defences pair up ────────────────────────────────────────────
// The pairing is the rule, so it is checked as a rule: every class a weapon
// attacks with has a defence that stops it, and every defence stops something
// that exists. The lasgun is the one exception and it is named, so the day a
// second unanswerable weapon appears this fails instead of accepting it.
const weapons = TREACHERY_CARDS.filter(c => c.kind === 'weapon')
const defenses = TREACHERY_CARDS.filter(c => c.kind === 'defense')
const weaponClasses = [...new Set(weapons.map(c => c.subtype))].sort()
const defenseClasses = [...new Set(defenses.map(c => c.subtype))].sort()

check('weapons attack with three classes', weaponClasses, ['lasgun', 'poison', 'projectile'])
check('defences stop two of them', defenseClasses, ['poison', 'projectile'])
check('every weapon class has a defence, except the lasgun',
  weaponClasses.filter(w => w !== 'lasgun' && !defenseClasses.includes(w)), [])
check('every defence stops a weapon that exists',
  defenseClasses.filter(d => !weaponClasses.includes(d)), [])
check('exactly one weapon has no answer',
  weapons.filter(c => !defenseClasses.includes(c.subtype)).map(c => c.id), ['lasgun'])

// Nine weapons against eight defences: the deck is deliberately short of
// protection, which is worth pinning because it is a balance fact rather than an
// accident of transcription.
check('nine weapons, eight defences', [copies(weapons), copies(defenses)], [9, 8])

// Five worthless cards, one copy each, where there used to be one card with
// five copies. The deck total is unchanged, which is the point of checking both
// numbers rather than just the total.
{
  const worthless = TREACHERY_CARDS.filter(c => c.kind === 'worthless')
  check('five worthless cards', worthless.length, 5)
  check('...one copy of each', worthless.map(c => c.copies), [1, 1, 1, 1, 1])
  check('...five copies in the deck, as before', copies(worthless), 5)
  // They differ by name and picture and in no other way. If one ever gains a
  // rule of its own it stops being worthless, and this is what notices.
  check('they are mechanically identical',
    new Set(worthless.map(c => `${c.kind}|${c.subtype}|${c.timing}|${c.text}`)).size, 1)
  check('...and are told apart by name alone',
    new Set(worthless.map(c => c.name)).size, 5)
}

// A poison weapon must name the Snooper and a projectile the Shield. This is the
// check that catches the draft's real error, where the Snooper claimed to stop
// projectiles while sitting in the poison class.
check('poison weapons all name the Snooper',
  weapons.filter(c => c.subtype === 'poison' && !/Snooper/.test(c.text)).map(c => c.id), [])
check('projectile weapons all name the Shield',
  weapons.filter(c => c.subtype === 'projectile' && !/Shield/.test(c.text)).map(c => c.id), [])
check('the Shield stops projectiles and says so',
  /projectile/i.test(defenses.find(c => c.subtype === 'projectile')?.text ?? ''), true)
check('the Snooper stops poison and says so',
  /poison/i.test(defenses.find(c => c.subtype === 'poison')?.text ?? ''), true)

// ── the Lasgun ruling ───────────────────────────────────────────────────────
// The whole ruling rests on one word. "anyone" includes the Lasgun's own owner,
// so the explosion turns on both cards being on the table rather than on who
// played which. Soften it to "your opponent" and the rule changes quietly —
// nothing else in the repo would notice, because battles do not exist yet.
{
  const lasgun = TREACHERY_CARDS.find(c => c.id === 'lasgun')!
  check('the explosion fires on ANYONE playing a Shield',
    /if anyone plays a Shield/i.test(lasgun.text), true)
  check('...not on the opponent specifically',
    /opponent'?s? (?:plays? a )?Shield/i.test(lasgun.text), false)
  check('the lasgun still kills through any defence',
    /regardless of defense card/i.test(lasgun.text), true)
  check('...and the territory, not just the leaders, is lost',
    /forces, leaders, and spice/i.test(lasgun.text), true)
}

// ── Hajr ────────────────────────────────────────────────────────────────────
// It arrived carrying Cheap Hero's text: a card about a zero-strength leader,
// under a subtype and timing that both said movement. The generalised check
// below is what catches that class — a card that is not committed in a battle
// plan has no business mentioning one.
{
  const hajr = TREACHERY_CARDS.find(c => c.id === 'hajr')!
  check('Hajr says movement in every field',
    [hajr.kind, hajr.subtype, hajr.timing], ['special', 'movement', 'movement'])
  check('...and its text is about moving forces', /force movement/i.test(hajr.text), true)
  check('...including a group that has already moved',
    /already moved this phase/i.test(hajr.text), true)
}
check('no card outside a battle plan claims to be part of one',
  TREACHERY_CARDS.filter(c => c.timing !== 'battle-plan' && /Battle Plan/i.test(c.text))
    .map(c => c.id), [])

// ── timing ──────────────────────────────────────────────────────────────────
// Every timing names a window some phase has to open. Two of these do not exist
// yet; the point of listing them is that they are visible.
const timings = [...new Set(TREACHERY_CARDS.map(c => c.timing))].sort()
check('five distinct timings', timings,
  ['any-time', 'battle-plan', 'movement', 'storm-after-roll', 'storm-before-roll'])
check('everything committed in a plan is a weapon, defence, worthless or Cheap Hero',
  TREACHERY_CARDS.filter(c => c.timing === 'battle-plan'
    && !['weapon', 'defense', 'worthless'].includes(c.kind) && c.id !== 'cheaphero').map(c => c.id), [])
check('the two storm cards want two different windows',
  TREACHERY_CARDS.filter(c => c.subtype === 'storm').map(c => [c.id, c.timing]),
  [['weathercontrol', 'storm-before-roll'], ['familyatomics', 'storm-after-roll']])

// ── headers ─────────────────────────────────────────────────────────────────
check('every kind in the deck has a header colour',
  TREACHERY_CARDS.filter(c => !TREACHERY_HEADER[c.kind]).map(c => c.id), [])
// Checked as hues rather than as three hex strings. The exact shades have
// already moved once — the green darkened when the header text went black — and
// a check that pins the digits fails on every tweak while catching nothing that
// matters. What matters is that a weapon is not blue.
{
  const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  // A real hue angle rather than "which channel is biggest". Yellow has red as
  // its largest channel, so the cruder test called the worthless header red the
  // moment it stopped being green — a check that would have passed while
  // describing the card wrongly.
  const hue = (hex: string) => {
    const [r, g, b] = rgb(hex)
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
    if (!d) return 'grey'
    const deg = ((60 * (max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4)) + 360) % 360
    return deg < 20 || deg >= 330 ? 'red' : deg < 70 ? 'yellow' : deg < 170 ? 'green' : 'blue'
  }
  check('weapons red, defences blue, specials green, worthless yellow',
    (['weapon', 'defense', 'special', 'worthless'] as TreacheryKind[])
      .map(k => hue(TREACHERY_HEADER[k])),
    ['red', 'blue', 'green', 'yellow'])
  check('all four kinds have their own colour',
    new Set(Object.values(TREACHERY_HEADER)).size, 4)
  // Black text sits on these, so none of them may be so dark it swallows it or
  // so light the text has nothing to sit against. Loose bounds — this is a
  // guard against a header going near-black, not a contrast policy.
  const luma = (hex: string) => { const [r, g, b] = rgb(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
  check('no header is so dark that black text vanishes into it',
    (Object.keys(TREACHERY_HEADER) as TreacheryKind[]).filter(k => luma(TREACHERY_HEADER[k]) < 45), [])
}

// ── artwork ─────────────────────────────────────────────────────────────────
// image is optional because none exists yet. textOnly says a card is never
// getting any, which is a different statement — without it a later art pass
// could not tell "not drawn" from "not to be drawn".
// The worthless cards have art; nothing else does yet.
check('six cards are drawn so far',
  TREACHERY_CARDS.filter(c => c.image).map(c => c.id).sort(),
  ['baliset', 'jubbacloak', 'kulon', 'lalala', 'triptogamont', 'weathercontrol'])
check('Weather Control is drawn too',
  TREACHERY_CARDS.find(c => c.id === 'weathercontrol')?.image, '/treachery/weather-control.svg')
check('no two cards share a picture',
  new Set(TREACHERY_CARDS.filter(c => c.image).map(c => c.image)).size,
  TREACHERY_CARDS.filter(c => c.image).length)

// A card pointing at a picture that is not there is silent — it renders as a
// gap, and only at the moment somebody looks. Checked against the filesystem
// rather than assumed, the same way the string joins are checked at the source.
check('every picture a card names actually exists',
  TREACHERY_CARDS.filter(c => c.image && !existsSync('public' + c.image)).map(c => c.image), [])
check('...and is an SVG with something drawn in it',
  TREACHERY_CARDS.filter(c => c.image
    && !/\<(path|circle|ellipse|rect|polygon|polyline)\b/.test(readFileSync('public' + c.image, 'utf8')))
    .map(c => c.image), [])
check('Karama is the only card that is text by design',
  TREACHERY_CARDS.filter(c => c.textOnly).map(c => c.id), ['karama'])
check('a text-only card never carries an image',
  TREACHERY_CARDS.filter(c => c.textOnly && c.image).map(c => c.id), [])

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
