// The strategy card: the document, the parse, the card, and the button.
//
// WHY THIS EXISTS. The words on this card are not written in the codebase —
// they are written in docs/Strategy.md and generated into a TypeScript module
// by scripts/build-strategy.mjs. That is one source of truth and one copy of
// it, which is the arrangement the edge bundles use, and it fails in exactly
// the same way: somebody edits the document, nobody regenerates, and the game
// shows the old text forever with everything green.
//
// So the first thing here runs the generator's own --check. Everything after it
// asks whether the parse landed on the right faction, and whether any of it
// reaches the screen.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import { FACTION_STRATEGY } from '@/data/dune/strategy.gen'
import { FACTION_IDS } from '@/data/dune/factions'
import { hudRows } from '@/lib/dune/hud'
import type { FactionId } from '@/types/Dune/Faction'
import type { DuneGameState } from '@/types/Dune/Game'
import { FACTION_LOOK } from '@/components/dune/SeatLayer'
import { FACTION_FIGURES } from '@/components/dune/LeaderDisc'
import { StrategyCard, StrategyOverlay } from '@/components/dune/StrategyCard'
import { OwnStrip } from '@/components/dune/OwnStrip'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

// ── the checked-in copy is the document's ─────────────────────────────────
// THE ONE THAT CANNOT BE FAKED BY THIS FILE. Everything below reads the
// generated module; this is what says the generated module is the document.
{
  const current = (() => {
    try { execSync('node scripts/build-strategy.mjs --check', { stdio: 'pipe' }); return true }
    catch { return false }
  })()
  check('the generated strategy is current with docs/Strategy.md', current, true)

  const gen = readFileSync('src/data/dune/strategy.gen.ts', 'utf8')
  check('...and says it is generated', gen.startsWith('// AUTO-GENERATED'), true)
}

// ── every faction has a page, and it is their own ─────────────────────────
// The id is derived from the heading — 'Spacing Guild' → 'spacing-guild' — so
// nothing in the script holds a second list of factions. What that trades away
// is a heading nobody thought about mapping to nothing, or to the wrong seat.
// tsc catches a key that is not a FactionId; this catches the rest.
{
  check('all six factions have a page',
    [...FACTION_IDS].sort(), Object.keys(FACTION_STRATEGY).sort())

  // THE HEADING IS THE CROSS-CHECK. The id came out of the heading, so if the
  // parse slid a block onto the wrong faction the heading would arrive with
  // it, naming somebody else.
  check('every page is headed by the faction it is filed under',
    FACTION_IDS.filter(id => FACTION_STRATEGY[id].heading !== FACTION_LOOK[id].name), [])

  check('none of them is empty',
    FACTION_IDS.filter(id => !FACTION_STRATEGY[id].strategy || !FACTION_STRATEGY[id].flavour), [])
  // The word "Strategy:" labels the line in the document; on the card it would
  // be a heading printed inside its own paragraph.
  check('the label is dropped from the text',
    FACTION_IDS.filter(id => /^Strategy:/i.test(FACTION_STRATEGY[id].strategy)), [])
  // Long enough to be the paragraph rather than a fragment of one. The Emperor
  // has the shortest and it runs to 470 characters.
  check('every page carries a paragraph, not a sentence',
    FACTION_IDS.filter(id => FACTION_STRATEGY[id].strategy.length < 300), [])
}

// ── the words are the document's words ────────────────────────────────────
// A parse can be well-formed and still lose half a line. Both fields are
// checked against the document itself, whitespace-collapsed the one way the
// generator is allowed to change them.
{
  const doc = readFileSync('docs/Strategy.md', 'utf8').replace(/\s+/g, ' ')
  const missing = FACTION_IDS.filter(id =>
    !doc.includes(FACTION_STRATEGY[id].strategy) || !doc.includes(FACTION_STRATEGY[id].flavour))
  check('every page is in the document verbatim', missing, [])

  // AND NOTHING WAS INVENTED. The document is 6 blocks; a seventh page would
  // mean the parser was making them up.
  check('nothing is on the card that is not in the document',
    Object.keys(FACTION_STRATEGY).length, 6)
}

// ── the card draws all of it ──────────────────────────────────────────────
// Data being right is not the card being right. Every one of these has been a
// bug in this codebase in some other component: the text sized to nothing, the
// element dropped, the picture registered and never drawn.
{
  const drawn = (id: FactionId) =>
    renderToStaticMarkup(createElement(StrategyCard, { faction: id }))

  const gaps: string[] = []
  for (const id of FACTION_IDS) {
    const html = drawn(id)
    const notes = FACTION_STRATEGY[id]
    const figure = FACTION_FIGURES[id]
    // React escapes apostrophes as &#x27; — the strategy text is full of them,
    // so the comparison is made on the same escaping rather than on the raw.
    const esc = (s: string) => s.replace(/'/g, '&#x27;').replace(/"/g, '&quot;')
    if (!html.includes(esc(notes.strategy))) gaps.push(`${id}: no strategy text`)
    if (!html.includes(esc(notes.flavour))) gaps.push(`${id}: no flavour`)
    if (!html.includes(FACTION_LOOK[id].name)) gaps.push(`${id}: not named`)
    // BY ITS CONTENTS, not by the attribute beside it. Emptying the
    // figcaption left this green: the name is also on the disc's data-figure,
    // so "the card mentions him" was true of a card with no caption.
    if (!html.includes(`>${esc(figure.name)}</figcaption>`)) gaps.push(`${id}: figure not captioned`)
    if (!html.includes(`data-figure="${figure.name}"`)) gaps.push(`${id}: no figure disc`)
    if (!html.includes(`data-faction="${id}"`)) gaps.push(`${id}: unattributed`)
    // THE SYMBOL, read out of the header rather than inferred. SeatMark draws
    // the faction's colour as the ground of its circle, and the search is
    // scoped to that one <svg> because the figure's disc below uses the same
    // colour for the same reason.
    const mark = (/<svg data-part="faction-mark"[\s\S]*?<\/svg>/.exec(html) ?? [''])[0]
    if (!mark.includes(FACTION_LOOK[id].colour)) gaps.push(`${id}: no faction mark`)
  }
  check('every faction\'s card carries its symbol, its figure and its words', gaps, [])

  // THE NAME IS UNDER THE PHOTO, which is where the request put it and where a
  // long one can be read. It cannot go on the disc: a leader's name is set on
  // an arc inside the rim, CAPTAIN IAKIN NEFUD at nineteen characters is
  // already at the smallest of the four sizes that arc offers, and BARON
  // VLADIMIR HARKONNEN is twenty-four.
  const baron = drawn('harkonnen' as FactionId)
  check('the figure is captioned under the disc',
    /<figcaption[^>]*data-figure-name="Baron Vladimir Harkonnen"/.test(baron), true)
  check('...and the disc comes before the caption',
    baron.indexOf('data-figure="Baron Vladimir Harkonnen"') < baron.indexOf('<figcaption'), true)
  check('...with his face on it', /<image[^>]+Baron\.png/.test(baron), true)

  // ONE FACTION'S CARD IS ONE FACTION'S. Six cards that all showed the
  // Atreides would pass every check above except this one.
  const others = FACTION_IDS.filter(id => id !== 'harkonnen')
    .filter(id => baron.includes(FACTION_STRATEGY[id].strategy.slice(0, 60)))
  check('a card carries nobody else\'s notes', others, [])
}

// ── it covers the board, and only when asked for ──────────────────────────
{
  const over = renderToStaticMarkup(createElement(StrategyOverlay, {
    faction: 'fremen' as FactionId, onClose: () => {},
  }))
  check('the overlay is a dialog', over.includes('role="dialog"') && over.includes('aria-modal="true"'), true)
  check('...that covers rather than dims',
    /position:fixed;inset:0/.test(over.replace(/\s/g, '')), true)
  check('...with the card inside it', over.includes('data-layer="strategy-card"'), true)
  check('...and a way out', over.includes('aria-label="Close the strategy card"'), true)

  // A card with no handler is inert rather than trapped: the preview renders
  // one, and a Close that does nothing is worse than no Close.
  const inert = renderToStaticMarkup(createElement(StrategyCard, { faction: 'fremen' as FactionId }))
  check('a card with no handler offers no Close',
    inert.includes('aria-label="Close the strategy card"'), false)
}

// ── the button is under the faction card ──────────────────────────────────
{
  const state = {
    turn: 1, phase: 'Bidding', mode: 'basic',
    players: [{ seat: 'p1', faction: 'harkonnen', spice: 0, handCount: 0 }],
    forces: [], spiceOnBoard: [], storm: 1,
  } as unknown as DuneGameState
  const mine = hudRows(state).find(r => r.faction === 'harkonnen')!
  const strip = renderToStaticMarkup(createElement(OwnStrip, {
    seat: 'harkonnen' as FactionId, mode: 'basic' as const, own: null, player: mine, ally: null,
  }))

  check('the strip offers the strategy card', strip.includes('aria-label="Strategy card"'), true)
  // UNDER the faction card's button, in the same panel. Both are about your own
  // faction and this is the one a new player wants first.
  check('...under the faction card',
    strip.indexOf('aria-label="Faction card"') < strip.indexOf('aria-label="Strategy card"'), true)

  // SHUT UNTIL ASKED FOR, like the two panels beside it. Several hundred words
  // rendered into the strip would be the thing moving them out of it fixed.
  check('the strip carries no strategy prose',
    strip.includes(FACTION_STRATEGY['harkonnen'].strategy.slice(0, 60)), false)
  check('...and no overlay over the board',
    strip.includes('data-layer="strategy-overlay"'), false)

  // THE WIRING, not the behaviour. Rendering the button and never rendering the
  // overlay leaves every check above green — the same failure the zoomed card
  // had, and the reason that check exists a few files over.
  const src = readFileSync('src/components/dune/OwnStrip.tsx', 'utf8')
  check('the button opens something', /setShowStrategy\(v => !v\)/.test(src), true)
  check('...and that something is the overlay', /\{showStrategy && \(/.test(src), true)
  check('...for this seat', /<StrategyOverlay faction=\{seat\}/.test(src), true)
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')

// Not optional: without an exit code the runner counts a failing suite green.
process.exit(pass ? 0 : 1)
