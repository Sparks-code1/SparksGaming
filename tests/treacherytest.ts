// The treachery deck. The shape checks matter more than any single card: a deck
// is a list of near-identical objects, which is exactly where one entry drifts
// from the rest and nothing notices.
import { TREACHERY_CARDS } from '@/data/dune/treachery'
import { TREACHERY_HEADER, TREACHERY_KIND_WORD, cardSubtitle } from '@/types/Dune/Treachery'
import type { TreacheryCard, TreacheryKind } from '@/types/Dune/Treachery'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { createElement } from 'react'
// The .browser entry, not 'react-dom/server': the node one is CJS and reaches
// for require('stream'), which esbuild cannot fold into an ESM bundle. Nothing
// here needs streaming — renderToStaticMarkup returns a string either way.
import { renderToStaticMarkup } from 'react-dom/server.browser'
import { TreacheryCardFace } from '@/components/dune/TreacheryCardFace'
import { layoutCard, fitNameSize, isDrawnHere, artFit, headerMarkFor, CARD_H, NAME_W } from '@/components/dune/TreacheryCardFace'
import { SUBTITLE_Y, SUBTITLE_SIZE, HEADER_BOTTOM } from '@/components/dune/TreacheryCardFace'

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

// ── the header mark ───────────────────────────────────────────────────────
// The glyph goes by SUBTYPE, so a weapon and the defence that answers it carry
// the same one across two different header colours, and the defence wears it
// inside a shield. That is the pairing rule showing up in the art, so it is
// checked like a rule rather than left to the eye.
//
// Asserted through headerMarkFor — the function the card actually renders from
// — rather than through a copy of its rules written here. The copy passed while
// agreeing only with itself; it could not have caught the renderer drifting.
{
  const spec = (id: string) => headerMarkFor(TREACHERY_CARDS.find(c => c.id === id)!)

  check('a poison weapon and the Snooper carry the same glyph',
    [spec('gomjabbar').glyph, spec('snooper').glyph], ['droplet', 'droplet'])
  check('a projectile weapon and the Shield carry the same glyph',
    [spec('crysknife').glyph, spec('shield').glyph], ['crosshair', 'crosshair'])
  // ...and the shield is what tells them apart. Same class, opposite roles.
  check('the weapon deals the class and the defence answers it',
    [spec('gomjabbar').shielded, spec('snooper').shielded,
      spec('crysknife').shielded, spec('shield').shielded],
    [false, true, false, true])

  // Written the other way round on the first attempt: "every card WITH a class
  // is marked", which filtered on the very property it was asserting and so
  // could never fail. Taking a card's class away removed it from the check
  // instead of failing it. This asks the question that can be answered no.
  check('every weapon and defence carries a glyph the header can draw',
    TREACHERY_CARDS.filter(c => ['weapon', 'defense'].includes(c.kind)
      && headerMarkFor(c).glyph === 'none').map(c => c.id), [])

  // The Lasgun's bolt is its own class, and nothing answers a Lasgun. So the
  // absence of a SHIELDED bolt is the rule, not an accident of today's deck: a
  // shielded bolt would mean somebody had invented a defence the game lacks.
  check('the Lasgun carries the bolt', spec('lasgun').glyph, 'bolt')
  check('nothing shields against a Lasgun',
    TREACHERY_CARDS.filter(c => headerMarkFor(c).glyph === 'bolt' && headerMarkFor(c).shielded)
      .map(c => c.id), [])
  // Only defences are shielded, and every one of them is. The mark is a claim
  // about the card's ROLE, so it has to track kind exactly or it is decoration.
  check('the shielded cards are exactly the defences',
    TREACHERY_CARDS.filter(c => headerMarkFor(c).shielded).map(c => c.id).sort(),
    TREACHERY_CARDS.filter(c => c.kind === 'defense').map(c => c.id).sort())
}

// ── what the card actually draws ───────────────────────────────────────────
// Everything above asks headerMarkFor what the mark SHOULD be. Nothing above
// establishes that the card draws it — the rule could be exported, correct, and
// simply not called. Deleting the <HeaderMark> element left the whole suite
// green, which is how this check came to exist.
//
// So the card is rendered and the mark is read back off it. This is the only
// place the drawing itself is under test; everything else is data.
{
  const drawn = (c: TreacheryCard) =>
    renderToStaticMarkup(createElement(TreacheryCardFace, { card: c }))
  const markOf = (c: TreacheryCard) =>
    (/data-mark="([a-z-]+)"/.exec(drawn(c)) ?? [])[1] ?? 'nothing drawn'
  const expected = (c: TreacheryCard) => {
    const { glyph, shielded } = headerMarkFor(c)
    return shielded ? `shield-${glyph}` : glyph
  }

  check('every card draws the mark its own rule asks for',
    TREACHERY_CARDS.filter(c => markOf(c) !== expected(c))
      .map(c => `${c.id}: drew ${markOf(c)}, rule says ${expected(c)}`), [])
  // Spot-checked by name as well, so a bug that made expected() and markOf()
  // wrong in the same direction still fails. The pair above cannot catch that.
  check('the Shield draws a shielded crosshair', markOf(
    TREACHERY_CARDS.find(c => c.id === 'shield')!), 'shield-crosshair')
  check('the Snooper draws a shielded droplet', markOf(
    TREACHERY_CARDS.find(c => c.id === 'snooper')!), 'shield-droplet')
  check('the Lasgun draws a bare bolt', markOf(
    TREACHERY_CARDS.find(c => c.id === 'lasgun')!), 'bolt')
  check('a poison weapon draws a bare droplet', markOf(
    TREACHERY_CARDS.find(c => c.id === 'chaumas')!), 'droplet')
}

// ── the subtitle says what kind of card this is ────────────────────────────
// A player who has to read four sentences of rules to find out whether they
// are holding a weapon or the defence against one is reading the wrong thing.
// The line under the name says it in two words.
//
// THE POINT IS THAT IT IS DERIVED. A subtitle typed onto thirty-three cards is
// thirty-three chances to label a poison weapon "Projectile" — and a player
// reading that label would answer it with a Shield and lose a leader, because
// battle resolution branches on `subtype` and never reads the label. The
// checks below are about that disagreement being impossible rather than about
// any particular wording.
{
  const sub = (id: string) => cardSubtitle(TREACHERY_CARDS.find(c => c.id === id)!)
  check('a projectile weapon names its class', sub('crysknife'), 'Weapon — Projectile')
  check('a poison weapon names its own', sub('chaumas'), 'Weapon — Poison')
  check('the Lasgun is a class of one', sub('lasgun'), 'Weapon — Lasgun')
  check('the Shield answers projectiles', sub('shield'), 'Defense — Projectile')
  check('the Snooper answers poison', sub('snooper'), 'Defense — Poison')
  check('a worthless card says so and stops', sub('lalala'), 'Worthless Card')
  check('a special says only that', sub('karama'), 'Special')

  // ── the label cannot disagree with the field the rules read ──────────────
  // Not "the label equals what the rule computes", which would be the rule
  // checked against itself. The claim is that the CLASS the pairing turns on
  // appears in the words, for every card that has one.
  const equipment = TREACHERY_CARDS.filter(c => c.kind === 'weapon' || c.kind === 'defense')
  check('every weapon and defence names the class it pairs on',
    equipment.filter(c =>
      !cardSubtitle(c).toLowerCase().endsWith(String(c.subtype).toLowerCase())).map(c => c.id), [])
  // And the pairing reads off the label too: a Shield and the weapons it stops
  // carry the same word, which is the same claim the shared header glyph makes.
  check('the Shield and the projectiles it stops share a word',
    [sub('shield').split(' — ')[1], sub('crysknife').split(' — ')[1]], ['Projectile', 'Projectile'])
  check('...and the Snooper and the poisons',
    [sub('snooper').split(' — ')[1], sub('gomjabbar').split(' — ')[1]], ['Poison', 'Poison'])

  // NOTHING ELSE CLAIMS A CLASS. Nothing branches on a special's subtype, so
  // "Special — Storm" would promise a pairing the rules do not have; the
  // worthless cards carry 'none', and "Worthless — None" says nothing twice.
  check('nothing but equipment claims a class',
    TREACHERY_CARDS.filter(c => c.kind !== 'weapon' && c.kind !== 'defense'
      && cardSubtitle(c).includes('—')).map(c => c.id), [])

  // One label, one kind. Two kinds sharing a subtitle would mean the words
  // cannot tell a player which of the four groups they are holding.
  const kindsPerLabel = new Map<string, Set<TreacheryKind>>()
  for (const c of TREACHERY_CARDS) {
    const label = cardSubtitle(c)
    kindsPerLabel.set(label, (kindsPerLabel.get(label) ?? new Set()).add(c.kind))
  }
  check('no label is shared by two kinds',
    [...kindsPerLabel].filter(([, ks]) => ks.size > 1).map(([l]) => l), [])
  check('every kind has a word', Object.values(TREACHERY_KIND_WORD).filter(w => !w), [])
  // PINNED WORDING, and deliberately so. These seven strings are what a player
  // reads, and the deck is where a change to them shows up — the defences read
  // SHIELD for a day before matching the printed cards, and this is the check
  // that made that a decision rather than a diff.
  check('the whole deck carries seven labels between it',
    [...kindsPerLabel.keys()].sort(),
    ['Defense — Poison', 'Defense — Projectile', 'Special', 'Weapon — Lasgun',
     'Weapon — Poison', 'Weapon — Projectile', 'Worthless Card'])

  // ── and the card draws it ────────────────────────────────────────────────
  // The rule being right does not put it on the card. Same lesson as the
  // header mark above: deleting the element left that suite green.
  const drawn = (c: TreacheryCard) =>
    renderToStaticMarkup(createElement(TreacheryCardFace, { card: c }))
  const subOf = (c: TreacheryCard) =>
    (/data-subtitle="([^"]+)"/.exec(drawn(c)) ?? [])[1] ?? 'nothing drawn'
  check('every card draws the label its own two fields ask for',
    TREACHERY_CARDS.filter(c => subOf(c) !== cardSubtitle(c))
      .map(c => `${c.id}: drew ${subOf(c)}, rule says ${cardSubtitle(c)}`), [])
  // The attribute is not the card. Text that never reached the <text> element
  // would leave the attribute right and the face blank.
  check('...and prints it where a player can read it',
    TREACHERY_CARDS.filter(c => !drawn(c).includes(`>${cardSubtitle(c)}</text>`))
      .map(c => c.id), [])

  // ── in the gap it was drawn for ──────────────────────────────────────────
  // Twelve units of sand between the header band and the art box. A line that
  // drifts up sits on a colour it has no contrast against; one that drifts
  // down goes under the picture.
  const artTop = Number((/<image[^>]*\by="([\d.]+)"/
    .exec(drawn(TREACHERY_CARDS.find(c => c.id === 'crysknife')!)) ?? [])[1])
  check('the art box is where the gap ends', artTop, 50)
  check('the line clears the header band', SUBTITLE_Y - SUBTITLE_SIZE >= HEADER_BOTTOM, true)
  check('...and stops short of the picture', SUBTITLE_Y + SUBTITLE_SIZE * 0.3 <= artTop, true)
  // A text-only card has no picture, and its rules text starts at 56 — the
  // line must clear that too or it lands on the first sentence.
  check('...and clears the text on a card with no picture',
    SUBTITLE_Y + SUBTITLE_SIZE * 0.3 <= layoutCard(
      TREACHERY_CARDS.find(c => c.id === 'karama')!).textTop, true)
}

// ── drawn art and supplied art are treated as opposites ────────────────────
// Two decisions hang off the same question. Drawn art gets a ruled box and is
// fitted inside it; supplied art gets no box and fills it, cropping. Both are
// right for one kind of picture and wrong for the other — a frame inside the
// card's own frame reads as a mistake, and fitting a wide subject on a square
// canvas scales it by its empty margin instead of its subject.
//
// So the question is asked once, by isDrawnHere, and these checks are about
// that predicate rather than about either use of it.
//
// The list of formats matters because the predicate is a BINARY split of a set
// that is not binary. Anything not an SVG is treated as a supplied photograph
// and cropped. A format arriving that is neither drawn-here nor a photograph
// would be cropped silently, so the set is pinned rather than left open.
check('every picture is a format the drawn/supplied split has been thought about',
  TREACHERY_CARDS.filter(c => c.image && !/\.(svg|png|jpe?g)$/.test(c.image)).map(c => c.id), [])
check('the drawn cards are exactly the SVGs',
  TREACHERY_CARDS.filter(c => c.image && isDrawnHere(c.image)).map(c => c.id).sort(),
  ['baliset', 'jubbacloak', 'kulon', 'lalala', 'triptogamont'])
check('...and the supplied pictures are exactly the rasters',
  TREACHERY_CARDS.filter(c => c.image && !isDrawnHere(c.image)).map(c => c.id).sort(),
  ['chaumas', 'chaumurky', 'cheaphero', 'crysknife', 'ellacadrug', 'familyatomics',
    'gomjabbar', 'hajr', 'lasgun', 'maulapistol', 'shield', 'sliptip', 'snooper',
    'stunner', 'tleilaxughola', 'truthtrance', 'weathercontrol'])
// The decision that actually hangs off the predicate. Asserted on the value the
// renderer uses rather than on the predicate alone, because "meet" and "slice"
// are one word apart and the wrong one is invisible in a diff.
check('supplied pictures fill their box',
  TREACHERY_CARDS.filter(c => c.image && !isDrawnHere(c.image))
    .map(c => artFit(c.image!)).filter(f => f !== 'xMidYMid slice'), [])
check('drawn pictures are fitted inside it, never cropped',
  TREACHERY_CARDS.filter(c => c.image && isDrawnHere(c.image))
    .map(c => artFit(c.image!)).filter(f => f !== 'xMidYMid meet'), [])
// Stated as a rule because it is the reason the split is safe: every drawn
// picture is authored to the same square box, so "fit inside" never wastes
// space on one, and cropping one would cut art that has no margin to give.
check('every drawn picture is authored square, which is why it is never cropped',
  TREACHERY_CARDS.filter(c => c.image && isDrawnHere(c.image)).filter(c => {
    const svg = readFileSync('public' + c.image, 'utf8')
    const box = /viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(svg)
    return !box || box[1] !== box[2]
  }).map(c => c.id), [])

// ── the name stops before the mark ─────────────────────────────────────────
// The name moved left and the mark moved into the header beside it, so they now
// share a 27-pixel band and can collide. Names run from six characters to
// nineteen, which is exactly the range where a fixed size works for the short
// ones and overruns on the long ones.
{
  const tooWide = TREACHERY_CARDS.filter(c => {
    const size = fitNameSize(c.name, NAME_W)
    return c.name.length * size * 0.68 > NAME_W + 0.5
  }).map(c => c.id)
  check('no name runs into the header mark', tooWide, [])

  // Fitting is trivial if the name is allowed to shrink to nothing, so the
  // floor is checked too — the same trap the body text had.
  const tiny = TREACHERY_CARDS.filter(c => fitNameSize(c.name, NAME_W) < 8).map(c => c.id)
  check('...and none of them vanished to manage it', tiny, [])

  // Short names should not be shrunk for nothing.
  check('a short name takes the full size', fitNameSize('Shield', NAME_W), 15.5)
  check('...and the longest name in the deck is smaller',
    fitNameSize('Captain Iakin Nefud', NAME_W) < 15.5, true)
}

// ── every card fits on its own card ────────────────────────────────────────
// The layout used a fixed type size and a fixed art box, which worked for a
// weapon and ran the Lasgun off the bottom edge — it carries seven times the
// text. Nothing noticed, because nothing was looking. This looks.
{
  const drawn = TREACHERY_CARDS.filter(c => c.image || c.textOnly)
  const overflow = drawn.filter(c => {
    const { textTop, size, lines } = layoutCard(c)
    return textTop + lines.length * size * 1.28 > CARD_H - 6
  }).map(c => c.id)
  check('no card runs its text off the bottom', overflow, [])

  // Fitting is not enough on its own — it could be achieved by shrinking the
  // type to nothing. The floor is what keeps the fit honest.
  const tiny = drawn.filter(c => layoutCard(c).size < 6).map(c => c.id)
  check('...and none of them got there by becoming unreadable', tiny, [])

  // The Lasgun is the worst case, so it is named: if it ever fits at full art
  // height something has gone wrong with the measuring, not with the card.
  const lasgun = layoutCard(TREACHERY_CARDS.find(c => c.id === 'lasgun')!)
  check('the Lasgun gives up art space to fit its rules', lasgun.artH < 104, true)
  check('...and a weapon with ordinary text keeps the full box',
    layoutCard(TREACHERY_CARDS.find(c => c.id === 'crysknife')!).artH, 104)
}

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
check('four distinct timings', timings,
  ['any-time', 'battle-plan', 'mentat-storm', 'movement'])
check('everything committed in a plan is a weapon, defence, worthless or Cheap Hero',
  TREACHERY_CARDS.filter(c => c.timing === 'battle-plan'
    && !['weapon', 'defense', 'worthless'].includes(c.kind) && c.id !== 'cheaphero').map(c => c.id), [])
// ONE WINDOW NOW, THE MENTAT PAUSE. They wanted two — steering before the roll,
// detonating after it — and the storm had to publish a number and wait between
// them. Both are played at the Pause for the storm of the turn after, which is
// the moment immediately following, so the sequence is unchanged and the beat
// is gone. A DELIBERATE DEPARTURE: at the Pause the coming roll is not known,
// so Family Atomics is a judgement rather than a calculation.
check('both storm cards share the Mentat Pause',
  TREACHERY_CARDS.filter(c => c.subtype === 'storm').map(c => [c.id, c.timing]),
  [['weathercontrol', 'mentat-storm'], ['familyatomics', 'mentat-storm']])
check('...and both say so on the card',
  TREACHERY_CARDS.filter(c => c.subtype === 'storm')
    .map(c => c.text.includes('Mentat Pause')), [true, true])

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
// Stated by group rather than as a list of ids. A list has to be edited every
// time a picture lands and says nothing about what is still missing; groups say
// which sets are finished, which is the thing worth knowing.
check('every worthless card is drawn',
  TREACHERY_CARDS.filter(c => c.kind === 'worthless' && !c.image).map(c => c.id), [])
check('every projectile weapon is drawn',
  TREACHERY_CARDS.filter(c => c.subtype === 'projectile' && c.kind === 'weapon' && !c.image)
    .map(c => c.id), [])
check('the Lasgun is drawn',
  !!TREACHERY_CARDS.find(c => c.id === 'lasgun')?.image, true)
check('every special is drawn',
  TREACHERY_CARDS.filter(c => c.kind === 'special' && !c.image && !c.textOnly).map(c => c.id), [])
// The poison class is complete: all four weapons and the one defence that
// answers them. Worth asserting as a CLASS rather than as five card names,
// because that is what completeness means here — a poison weapon added later
// with no picture should fail this, and a list of names would not notice.
check('every poison card is drawn, weapons and defence alike',
  TREACHERY_CARDS.filter(c => c.subtype === 'poison' && !c.image).map(c => c.id), [])
check('...which is four weapons and one defence',
  TREACHERY_CARDS.filter(c => c.subtype === 'poison').map(c => c.kind).sort(),
  ['defense', 'weapon', 'weapon', 'weapon', 'weapon'])
check('every projectile card is drawn, weapons and defence alike',
  TREACHERY_CARDS.filter(c => c.subtype === 'projectile' && !c.image).map(c => c.id), [])
check('...which is likewise four weapons and one defence',
  TREACHERY_CARDS.filter(c => c.subtype === 'projectile').map(c => c.kind).sort(),
  ['defense', 'weapon', 'weapon', 'weapon', 'weapon'])
// Everything a battle plan can hold now has a face. What is left undrawn is
// entirely the specials, which is a different job.
check('every card that can go in a battle plan is drawn',
  TREACHERY_CARDS.filter(c => c.timing === 'battle-plan' && !c.image).map(c => c.id), [])
// Nothing is left. Every card in the deck now carries a face except Karama,
// which is text by design — so the exception is named rather than the gap being
// listed, and a card added later without art fails this instead of quietly
// joining a list of known absences.
check('every card is drawn, and Karama is the only one that is text instead',
  TREACHERY_CARDS.filter(c => !c.image && !c.textOnly).map(c => c.id), [])

// ── art on disk that no card points at ─────────────────────────────────────
// The other direction of the same question, and the one that is silent. A card
// naming a missing picture renders a hole and gets noticed; a picture nobody
// names renders nothing anywhere and does not. It earned itself immediately:
// three supplied pictures were sitting unwired when it went in, one of which
// nobody had noticed was there at all.
//
// weather-control.svg and snooper.svg are here for the opposite reason: both
// were drawn here and then superseded by supplied pictures. Kept rather than
// deleted, because they cost a kilobyte each and the cards may want them back.
//
// Listed rather than asserted empty, because the list IS the finding. When one
// gets wired this fails and reports the shorter list, which is the maintenance.
check('pictures in the folder that no card uses',
  readdirSync('public/treachery')
    // stop.svg is the header mark, drawn by the component rather than named by
    // a card, so it is not an orphan.
    .filter(f => f !== 'stop.svg')
    .filter(f => !TREACHERY_CARDS.some(c => c.image === '/treachery/' + f))
    .sort(),
  ['snooper.svg', 'weather-control.svg'])
// The count moves as art lands; when it fails it reports the new number, which
// is the whole of the maintenance.
check('twenty-two cards drawn', TREACHERY_CARDS.filter(c => c.image).length, 22)
check('Weather Control is drawn too',
  TREACHERY_CARDS.find(c => c.id === 'weathercontrol')?.image, '/treachery/weather_control.png')
check('no two cards share a picture',
  new Set(TREACHERY_CARDS.filter(c => c.image).map(c => c.image)).size,
  TREACHERY_CARDS.filter(c => c.image).length)

// A card pointing at a picture that is not there is silent — it renders as a
// gap, and only at the moment somebody looks. Checked against the filesystem
// rather than assumed, the same way the string joins are checked at the source.
check('every picture a card names actually exists',
  TREACHERY_CARDS.filter(c => c.image && !existsSync('public' + c.image)).map(c => c.image), [])
// An empty or truncated file is the thing being guarded against, and on the
// card it looks exactly like a missing one. Checked by magic bytes rather than
// by extension, so a file renamed to .png does not pass for one.
check('...and is a real image with something in it',
  TREACHERY_CARDS.filter(c => {
    if (!c.image) return false
    const bytes = readFileSync('public' + c.image)
    if (isDrawnHere(c.image)) {
      return !/<(path|circle|ellipse|rect|polygon|polyline|image)\b/.test(bytes.toString('utf8'))
    }
    if (bytes.length <= 1024) return true
    const png = bytes[0] === 0x89 && bytes.toString('ascii', 1, 4) === 'PNG'
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    return !(png || jpeg)
  }).map(c => c.image), [])
check('Karama is the only card that is text by design',
  TREACHERY_CARDS.filter(c => c.textOnly).map(c => c.id), ['karama'])
check('a text-only card never carries an image',
  TREACHERY_CARDS.filter(c => c.textOnly && c.image).map(c => c.id), [])

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
