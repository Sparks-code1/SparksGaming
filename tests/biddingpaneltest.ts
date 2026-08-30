// The bidding screen, rendered.
//
// Most of this is ordinary — the standing bid is shown, the passed seats are
// marked, the count is right. The one claim worth the trouble is that a card
// CANNOT appear unless it was handed in: the panel is what a player looks at,
// and if prescience leaked here it would leak to the one place somebody is
// actually watching.
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import { BiddingPanel, BiddingBar } from '@/components/dune/BiddingPanel'
import { TreacheryCardBack } from '@/components/dune/TreacheryCardFace'
import type { BiddingPanelProps } from '@/components/dune/BiddingPanel'
import { TREACHERY_CARDS } from '@/data/dune/treachery'
import type { FactionId } from '@/types/Dune/Faction'

let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

const card = (id: string) => TREACHERY_CARDS.find(c => c.id === id)!
const ORDER: FactionId[] = ['atreides', 'harkonnen', 'emperor', 'fremen']

const base: BiddingPanelProps = {
  ask: {
    kind: 'treachery-bid', index: 1, cardCount: 4,
    high: { faction: 'harkonnen', spice: 3 }, minimum: 4,
    hands: { atreides: 1, harkonnen: 2, emperor: 0, fremen: 0 },
  },
  order: ORDER,
  toAct: 'atreides',
  passed: ['emperor'],
  seat: 'atreides',
  spice: 12,
  hand: [card('baliset')],
  closesAt: 15_000,
  now: 5_000,
  onBid: () => {},
  onPass: () => {},
}

const draw = (over: Partial<BiddingPanelProps> = {}) =>
  renderToStaticMarkup(createElement(BiddingPanel, { ...base, ...over }))

// ── THE CARD IS FACE DOWN UNLESS ONE WAS HANDED IN ────────────────────────
// The auction's public state names no card, so there is nothing here to draw
// face up. `revealed` is the only route in, and it is a prop — this component
// cannot fetch, look up or derive a card. A leak would have to be written on
// purpose one level up.
{
  const shut = draw()
  check('with nothing handed in, the slot is a card back',
    shut.includes('face down'), true)
  check('...and no card in the deck is named anywhere in the markup',
    TREACHERY_CARDS.filter(c => shut.includes(c.name)).map(c => c.id), ['baliset'])
  // baliset is the seat's OWN hand, which it may of course see. Said out loud
  // so the line above is not read as "no card at all appears".
  check('...the one exception being the card in this seat\'s own hand',
    shut.includes('BALISET'), true)
}
{
  const seen = draw({ revealed: card('lasgun') })
  check('a card handed in is drawn face up', seen.includes('LASGUN'), true)
  check('...and the slot says so, so the seat knows the table cannot see it',
    seen.includes('You alone can see this card'), true)

  // ── A CARD CAN BE READ BEFORE IT IS BID ON ──────────────────────────────
  // The small faces are buttons now, opening the same floating view the
  // tray uses. The one that most needs it is the Atreides' glimpse — the
  // card on the block, priced before a bid — and the seat's own hand beside
  // it.
  check('the glimpsed card opens at reading size',
    seen.includes('aria-label="Open Lasgun"'), true)
  check('...and so does a card in the hand',
    seen.includes('aria-label="Open Baliset"'), true)
  const panelSrc = readFileSync('src/components/dune/BiddingPanel.tsx', 'utf8')
  check('...into the tray\'s own floating view',
    /<TreacheryCardFace card=\{zoomCard\} width=\{CARD_ZOOM\} \/>/.test(panelSrc), true)

  // ── THE EXPIRED PUSH SPEAKS ─────────────────────────────────────────────
  // The second deadlock was not the rules: the push could fail three ways in
  // silence — no client, a busy flag, an error filed under a seat nobody was
  // viewing. Now it rides any signed-in session and reads its outcome out.
  const harness = readFileSync('src/components/dune/DuneMultiSeatView.tsx', 'utf8')
  check('the push rides any signed-in session',
    /\[sessions\.find\(x => x\.login\.faction === waitingOn\), mine, \.\.\.sessions\]\s*[\r\n]+\s*\.find\(x => x\?\.client\)/.test(harness), true)
  check('...says so when there is none',
    /if \(!actor\?\.client\) \{ setResolveNote\('no signed-in session to push with'\); return \}/.test(harness), true)
  check('...reads a refusal out instead of filing it away',
    /setResolveNote\(`refused: \$\{res\.error\?\.code \?\? 'unknown'\}/.test(harness), true)
  check('...and the note has a place on the box',
    /data-resolve-note/.test(harness), true)
  check('...and it is no longer a back', seen.includes('face down'), false)
}
// null and undefined both mean "not entitled", and both have to behave the
// same: a caller that has no reveal will pass one or the other without
// thinking about which.
check('an explicit null is the same as nothing at all',
  draw({ revealed: null }).includes('face down'), true)

// ── a back is a back ──────────────────────────────────────────────────────
// Anything distinguishing on it — a corner mark, a count, anything derived from
// the card — is a way to tell one card from another without turning it over,
// which is the whole thing the auction rests on. It takes no card, so it cannot
// vary by one; this asserts the consequence rather than trusting the signature.
{
  const back = renderToStaticMarkup(createElement(TreacheryCardBack, {}))
  check('the back names no card in the deck',
    TREACHERY_CARDS.filter(c => back.includes(c.name)).map(c => c.id), [])
  check('...and carries no id either',
    TREACHERY_CARDS.filter(c => back.includes(c.id)).map(c => c.id), [])
  check('two backs are the same bytes',
    back === renderToStaticMarkup(createElement(TreacheryCardBack, {})), true)
  // HANDED A CARD, it must draw the same thing. The signature does not accept
  // one today, and that is the guarantee — but a signature is one edit away
  // from accepting one, and the edit that adds it is the same edit that draws
  // it. Passing one through the cast asserts the property rather than the type,
  // so widening the props later fails here instead of shipping a back that can
  // be read.
  const withCard = renderToStaticMarkup(
    createElement(TreacheryCardBack, { card: card('lasgun') } as never))
  check('a back handed a card ignores it entirely', withCard === back, true)
  check('...and names it nowhere', withCard.includes('LASGUN') || withCard.includes('Lasgun'), false)
}

// ── the auction, as the table sees it ─────────────────────────────────────
{
  const html = draw()
  check('the standing bid and who holds it', html.includes('Standing bid'), true)
  // Sliced out of the document, because the turn-order strip names every seat
  // in an aria-label — so "the markup contains Harkonnen" was true however the
  // bid line was written, and removing the name from it changed nothing.
  const bidLine = html.slice(html.indexOf('Standing bid'), html.indexOf('Standing bid') + 300)
  check('...naming the bidder in that line', bidLine.includes('Harkonnen'), true)
  check('...and the amount', /<strong>3<\/strong>/.test(html), true)
  check('which card of the row this is', html.includes('Card 2 of 4'), true)
  check('...and how many are left after it', html.includes('2 more after this one'), true)
}
check('the last card says so rather than counting zero',
  draw({ ask: { ...base.ask, index: 3 } }).includes('last card of the row'), true)
check('no bids yet is stated, not left blank',
  draw({ ask: { ...base.ask, high: null, minimum: 1 } }).includes('No bids yet'), true)

// ── whose turn, and who has passed ────────────────────────────────────────
{
  const html = draw()
  // Written first as check(label, X, X), which passes by construction — the
  // same shape that hid six broken assertions in the privacy script. Comparing
  // an expression against itself is not a check, and it looks exactly like one.
  const NAMES: Record<string, string> = {
    atreides: 'Atreides', harkonnen: 'Harkonnen', emperor: 'Emperor', fremen: 'Fremen',
  }
  check('every seat in the order is drawn',
    ORDER.filter(f => !html.includes(NAMES[f])), [])
  // Both the label AND the mark. The labels are what a screen reader gets and
  // are always present; the marks are what everyone else reads, and asserting
  // only the labels let a sabotage blank the ring and dim a seat to invisible
  // without failing anything.
  check('the seat to act is labelled as such', html.includes('to act'), true)
  check('...and ringed, which is how it is actually read',
    /r="21"[^>]*stroke="#f0e2bb"/.test(html) || /stroke="#f0e2bb"[^>]*r="21"/.test(html), true)
  check('a passed seat is labelled as passed', html.includes(', passed'), true)
  // Dimmed, not dropped: who has left the bidding is part of reading the table,
  // and a seat that vanished would move everyone after it along the strip.
  check('...and dimmed rather than removed', html.includes('opacity="0.32"'), true)
  check('...and still drawn at all', html.includes('Emperor'), true)
  check('this client knows which seat is theirs', html.includes(', you'), true)
}

// ── the clock ─────────────────────────────────────────────────────────────
check('the countdown shows what is left, not what has elapsed',
  draw().includes('10s'), true)
check('...and reads zero rather than negative once past the deadline',
  draw({ now: 20_000 }).includes('0s'), true)
// Injected, not read. A component that measured its own duration would count
// differently on every machine, and the deadline was stamped once by the server.
check('the same props render the same clock twice',
  draw().includes('10s') && draw().includes('10s'), true)

// ── a refusal is the bidder's alone ───────────────────────────────────────
{
  check('nothing is said when there is no refusal',
    draw().includes('role="alert"'), false)
  const refused = draw({ refusal: 'more-than-you-hold' })
  check('a refusal is shown to the bidder', refused.includes('You do not have that much spice'), true)
  // AN UNKNOWN CODE SHOWS ITSELF. The settle path can refuse with codes this
  // map never knew — 'deck-exhausted' reached a live table as a BLANK line
  // and the clock suffix, which read as "pass refused: clock still running".
  check('...and an unknown code shows itself rather than nothing',
    draw({ refusal: 'deck-exhausted' as never }).includes('Refused: deck-exhausted'), true)
  const unknownBar = renderToStaticMarkup(createElement(BiddingBar, {
    ask: base.ask, closesAt: base.closesAt, now: base.now,
    refusal: 'deck-exhausted', onOpen: () => {}, children: null,
  } as never))
  check('...in the shut bar as well',
    unknownBar.includes('Refused: deck-exhausted'), true)
  // THE CLOCK IS NOT RESET, and the panel says so — a refused bid must not be a
  // way to buy time to think, and a bidder who assumes it was will run out.
  check('...beside a clock that is still running',
    refused.includes('The clock is still running'), true)
  check('...and the deadline is unchanged by it', refused.includes('10s'), true)
}

// ── this seat's own ───────────────────────────────────────────────────────
{
  const html = draw()
  check('its spice', html.includes('12 spice'), true)
  check('its hand', html.includes('BALISET'), true)
  check('an empty hand says so rather than showing nothing',
    draw({ hand: [] }).includes('no cards'), true)
}

// ── acting is only offered to the seat whose turn it is ───────────────────
check('the seat to act is given the controls', draw().includes('id="dune-bid"'), true)
{
  const waiting = draw({ toAct: 'fremen' })
  check('another seat is told who is thinking', waiting.includes('Waiting for Fremen'), true)
  check('...and is given no controls', waiting.includes('id="dune-bid"'), false)
}

// ── the board stays behind it ─────────────────────────────────────────────
// A player is bidding on a card to fight over a specific piece of ground, and
// taking the map away while they decide what it is worth removes the thing the
// decision is about.
{
  const html = draw()
  check('the panel floats over the board rather than replacing it',
    html.includes('position:absolute') && html.includes('inset:0'), true)
  check('...and dims it rather than covering it',
    /background:#000000a8/.test(html), true)
}


// ── the panel can be got out of the way ───────────────────────────────────
// It covers the middle of the board, and the board is how a player decides what
// a card is worth — whether they can reach Arrakeen this turn, who is standing
// next to their spice. Being unable to look at the map while pricing a card for
// it was a real complaint about a real screen.
{
  const open = draw()
  check('the open panel offers a way to shut it',
    open.includes('aria-label="Shut the bidding panel to see the board"'), true)

  // WHAT SURVIVES BEING SHUT. An auction you must reopen before you can answer
  // it is one you will miss the clock on, and the clock does not stop for a
  // player who wanted to look at the board.
  const bar = renderToStaticMarkup(createElement(BiddingBar, {
    ask: base.ask, closesAt: base.closesAt, now: base.now, refusal: null,
    onOpen: () => {},
    children: createElement('button', { type: 'button' }, 'Bid'),
  }))
  check('the shut bar still says which card', bar.includes('Card 2 of 4'), true)
  check('...and the standing bid', bar.includes('Harkonnen'), true)
  check('...and keeps the controls it was given', bar.includes('Bid'), true)
  check('...and a way back to the panel',
    bar.includes('aria-label="Open the bidding panel"'), true)
  // No scrim: the whole point of shutting it is to see the board underneath.
  check('...and does not dim the board', /#000000a8/.test(bar), false)
}


// ── the breath between cards ──────────────────────────────────────────────
// A card that has just closed leaves a moment before the next may be bid on,
// so the seat that won it can look at what it bought. The server refuses bids
// inside it; this stops the panel offering a button whose one outcome is that
// refusal.
{
  // The pause is a MOMENT, stamped by the server, counted against this
  // client's injected clock — `now` is 5_000 in the fixture.
  const paused = { ...base.ask, pauseUntil: 8_000 }

  const during = draw({ ask: paused })
  check('the panel says the next card is coming', during.includes('next card in'), true)
  check('...counting the seconds until it does', during.includes('3s'), true)

  // NO BID CONTROLS, even for the seat whose turn it is — which is the whole
  // point, and what a sabotage removing `&& !between` walked straight through
  // because nothing here rendered a paused panel at all.
  check('...and offers the acting seat no bid', during.includes('Bid'), false)
  check('...nor a pass', during.includes('Pass'), false)

  // ONCE IT HAS PASSED, the panel is itself again. Checking only the paused
  // render would pass on a panel that never offered a bid at all.
  const after = draw({ ask: paused, now: 9_000 })
  check('after the pause the acting seat may bid again', after.includes('Bid'), true)
  check('...and the notice is gone', after.includes('next card in'), false)

  // AND A CARD WITH NO PAUSE BEHIND IT is unaffected — most cards have none.
  const plain = draw({})
  check('a card with no pause behaves as before', plain.includes('next card in'), false)
  check('...and still offers a bid', plain.includes('Bid'), true)
}

// ── an allied bidder's input is not capped at their own purse ─────────────
// The flag is a boolean on purpose: the ally's balance never reaches the
// panel, so nothing here can leak it — the server judges the pair together.
{
  const alone = draw()
  const together = draw({ allied: true })
  check('alone, the bid input is capped at the purse',
    [/max="12"/.test(alone), /data-ally-purse/.test(alone)], [true, false])
  check('...allied, the cap lifts and the purse line says why',
    [/max="12"/.test(together), /data-ally-purse/.test(together)], [false, true])
}

console.log(pass ? '\nALL PASS' : '\nFAILURES PRESENT')
process.exit(pass ? 0 : 1)
