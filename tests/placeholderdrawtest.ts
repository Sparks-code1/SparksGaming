import { readFileSync } from 'node:fs'
// A coin drawn online is a placeholder, and the placeholder has to be treated
// as what it is at every step — plus the hold that keeps a seat's own echo
// from stepping its screen back.
//
// FIELD REPORT, 2026-09-06, match 4698930d: coin cards could be picked but
// did not stay, and the pile still read 10. Seq 180 in the log is the whole
// story — `DRAW_CARD {cardId: "hidden-card", source: "face-up"}`, accepted,
// no effects. Since the deck split the coin pile a client holds is a stack of
// placeholders (the order is the server's secret); the draw modal classified
// a pick as a coin by looking its id up in the card data, a placeholder has
// none, so every online coin pick went out labelled face-up. The reducer's
// face-up branch looked for the placeholder in the sideboard, found nothing,
// and returned the state unchanged — an accepted no-op, logged like a move.
//
// Three places had to agree, and each is pinned:
//   1. the modal classifies by the pile the pick came off, not by card data;
//   2. the reducer treats a placeholder as a coin draw whatever the label says
//      (carddecktest drives that one with the real reducer);
//   3. the board's local bookkeeping takes ONE placeholder off its pile — a
//      filter by id on a pile of identical ids emptied it in one draw, and an
//      emptied coin pile awards a star.
//
// And the rewind (same day, same table): while a seat's own placements are in
// flight, a board arriving on the socket is newer than anything applied and
// yet predates those placements. Applied, it stepped the acting screen back a
// troop until the next response landed. The board now waits — bounded — for
// the last response, which is the promise the comment on onlinePostsPending
// had been making all along.
let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`}`)
}
/** Comments out, so a pin can never be satisfied by its own explanation. */
const bare = (src: string) => src.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}/g, '')

console.log('\n— the modal: a coin by the pile it came off —')
{
  const modal = bare(readFileSync('src/components/CardDrawModal.tsx', 'utf8'))
  check('the pick is a coin if it is on the coin pile, before any card-data lookup',
    /const isCoin = resourceDeck\.includes\(selected\) \|\| getCoinCard\(selected\) !== undefined/.test(modal), true)
  check('...and the coin pile offers its top card, which online is the placeholder',
    /setSelected\(resourceDeck\[0\]\)/.test(modal), true)
}

console.log('\n— the reducer: a placeholder is a coin draw whatever the source says —')
{
  const reducer = bare(readFileSync('src/lib/gameReducer.ts', 'utf8'))
  check('the face-up branch is only for a real, named card',
    /if \(action\.source === 'face-up' && action\.cardId !== HIDDEN_CARD_ID\) \{/.test(reducer), true)
  check('...using the one placeholder id the client is given',
    /import \{ HIDDEN_CARD_ID \} from '@\/lib\/stateView'/.test(reducer), true)
}

console.log('\n— the board: one placeholder off the local pile, and a held echo —')
{
  const board = bare(readFileSync('src/components/GameBoard.tsx', 'utf8'))
  check('a coin draw takes one card off the local pile by position',
    /const at = resourceDeck\.indexOf\(cardId\)\s*if \(at >= 0\) resourceDeck\.splice\(at, 1\)/.test(board), true)
  check('...never a filter by id, which empties a pile of placeholders',
    /resourceDeck = resourceDeck\.filter\(id => id !== cardId\)/.test(board), false)

  const stateAt = board.indexOf('onState: (state, version) => {')
  const onState = stateAt < 0 ? '' : board.slice(stateAt, stateAt + 1600)
  check('the wire handler was found', stateAt > 0, true)
  check('a wire board waits while this seat\'s own actions are in flight, for a bounded time',
    /if \(onlinePostsPending\.current > 0 && Date\.now\(\) - flightSinceRef\.current < HOLD_BOARD_MS\) \{\s*heldBoardRef\.current = true[\s\S]{0,200}?return/.test(onState), true)
  check('...and the bound is a real number of seconds, not a debug value',
    /const HOLD_BOARD_MS = 8_000/.test(board), true)
  check('a thrown POST re-reads the row if a board was held on its account',
    /if \(heldBoardRef\.current && isLast\(\)\) \{\s*heldBoardRef\.current = false\s*const row = await loadMatchState\(matchId\)/.test(board), true)
  check('...and every settled response releases the hold',
    (board.match(/heldBoardRef\.current = false/g) ?? []).length, 3)
}

console.log(pass ? '\nall placeholder-draw pins hold' : '\nFAILED')
process.exit(pass ? 0 : 1)
