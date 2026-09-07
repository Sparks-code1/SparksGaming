import { readFileSync } from 'node:fs'
import { placeholderIn, HIDDEN_CARD_ID } from '@/lib/stateView'
import { withoutPlaceholders } from '@/lib/legacyApi'
import type { LegacyState } from '@/types/legacy'
// A finished game that was never closed out, and the three doors it walked
// through — pinned so none of them opens again.
//
// FIELD REPORT, 2026-09-06 (match 4698930d → b87e8d7a). Hugh won game 1; his
// win screen wrote the game-number bump and the star reset with his rewards;
// four runner-ups rewarded; the finalize ran on Hugh's machine (game_sessions
// has the row at 18:03:18). The campaign row then read game 1, in progress,
// stars intact — a whole-row write from a pre-win copy. The host's screen,
// holding that copy, hosted "Game #1" again; the board hydrated game 1's card
// block from the blob, whose piles were a client's mirrored PLACEHOLDERS; and
// deal-match wrote them as the decks of the new game. Every draw and refill
// then dealt `hidden-card`: two in the face-up row, two in a hand, a coin the
// panel had nothing to draw for, and a red star carried into "game 2".
//
//   1. performSave could write a shared campaign wholesale when the page held
//      no version — now it reads and rebuilds instead, and the version comes
//      with the state in one read so it cannot be missing.
//   2. saveLegacyState never stores a placeholder.
//   3. deal-match and the host refuse a deal that carries one.
//   4. The between-game screen does not host over a game still open.
let pass = true
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`}`)
}
/** Comments out, so a pin can never be satisfied by its own explanation. */
const bare = (src: string) => src.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}/g, '')

console.log('\n— a placeholder is found wherever a deal could carry it —')
{
  check('a clean state has none', placeholderIn({ cards: { territoryDeck: ['tc-a'], sideboard: ['tc-b'], resourceDeck: ['resource-1'], territoryDiscard: [] } }), null)
  check('the match piles', placeholderIn({ cards: { territoryDeck: [HIDDEN_CARD_ID, HIDDEN_CARD_ID], sideboard: [] } }), 'cards.territoryDeck')
  check('the face-up row', placeholderIn({ cards: { territoryDeck: [], sideboard: ['tc-a', HIDDEN_CARD_ID] } }), 'cards.sideboard')
  check('the campaign block', placeholderIn({ legacySnapshot: { activeGameCards: { resourceDeck: [HIDDEN_CARD_ID] } } }), 'legacySnapshot.activeGameCards.resourceDeck')
  check('a hand inside it', placeholderIn({ legacySnapshot: { activeGameCards: { playerHands: { p1: ['tc-a', HIDDEN_CARD_ID] } } } }), 'legacySnapshot.activeGameCards.playerHands.p1')
  check('nothing at all', placeholderIn(null), null)
}

console.log('\n— the blob keeps real cards or none —')
{
  const dirty = {
    campaignId: 'c1',
    activeGameCards: {
      gameNumber: 1, dealSeed: 7,
      territoryDeck: [HIDDEN_CARD_ID, HIDDEN_CARD_ID], sideboard: ['tc-a', HIDDEN_CARD_ID],
      resourceDeck: [HIDDEN_CARD_ID], territoryDiscard: ['tc-b'],
      playerHands: { p1: ['tc-c', HIDDEN_CARD_ID], p2: [] },
    },
  } as unknown as LegacyState
  const clean = withoutPlaceholders(dirty)
  const c = clean.activeGameCards as unknown as Record<string, unknown>
  check('placeholders leave the piles', [c.territoryDeck, c.sideboard, c.resourceDeck], [[], ['tc-a'], []])
  check('...and the hands', c.playerHands, { p1: ['tc-c'], p2: [] })
  check('...and real cards and the rest stay', [c.territoryDiscard, c.gameNumber, c.dealSeed], [['tc-b'], 1, 7])
  const already = { campaignId: 'c1', activeGameCards: { territoryDeck: ['tc-a'], playerHands: { p1: [] } } } as unknown as LegacyState
  check('a clean block is handed back as the same object', withoutPlaceholders(already) === already, true)
  check('no card block at all is fine', withoutPlaceholders({ campaignId: 'c1' } as LegacyState).activeGameCards, undefined)
}

console.log('\n— the save: version with the state, no wholesale write of a shared campaign —')
{
  const api = bare(readFileSync('src/lib/legacyApi.ts', 'utf8'))
  check('the row is read with its version in one select',
    /\.select\('legacy_state, join_code, legacy_version'\)/.test(api), true)
  check('loadLegacyState has no separate version read left',
    /select\('legacy_version'\)\.eq\('id', campaignId\)\.maybeSingle\(\)/.test(api), false)
  check('...and records the version off the row it read',
    /noteLegacyVersion\(campaignId, \(data as CampaignRow\)\.legacy_version as number\)/.test(api), true)
  check('an unknown version on a shared campaign reads and rebuilds instead of upserting',
    /\} else if \(campaignIsShared\(state\) && !legacyVersionColumnMissing\) \{[\s\S]{0,1600}?const merged = rebuild\(fresh\)\s*publishFreshLegacy\(merged\)\s*return performSave\(merged, opts, attempt \+ 1\)/.test(api), true)
  check('...a screen with nothing to rebuild from keeps the row and says so',
    /if \(!rebuild\) \{\s*noteKnownState\(fresh\)\s*publishFreshLegacy\(fresh\)[\s\S]{0,400}?throw new StaleCampaignError/.test(api), true)
  check('...and the bound holds', /if \(attempt >= MAX_REAPPLY_ATTEMPTS\) throw new StaleCampaignError/.test(api), true)
  check('every save goes through the placeholder strip',
    /const clean = withoutPlaceholders\(state\)\s*return saveQueue\.run\(state\.campaignId, \(\) => performSave\(clean, opts\)\)/.test(api), true)
}

console.log('\n— the deal refuses a placeholder, on both sides —')
{
  const deal = bare(readFileSync('supabase/functions/deal-match/index.ts', 'utf8'))
  check('deal-match refuses before it writes',
    /const placeholder = placeholderIn\(state\)\s*if \(placeholder\) \{\s*return json\(\{[\s\S]{0,200}?code: 'placeholder-deck',/.test(deal), true)
  check('...and the refusal comes before the first write', deal.indexOf("code: 'placeholder-deck'") < deal.indexOf("rpc('apply_match_write'"), true)
  const board = bare(readFileSync('src/components/GameBoard.tsx', 'utf8'))
  check('the host refuses the same deal before asking the server',
    /const placeholder = placeholderIn\(gameStateRef\.current\)\s*if \(placeholder\) \{\s*throw new Error[\s\S]{0,200}?\}\s*await startLobby\(lobbyToStart, gameStateRef\.current\)/.test(board), true)
}

console.log('\n— no hosting over a game still open —')
{
  const screen = bare(readFileSync('src/components/BetweenGameScreen.tsx', 'utf8'))
  check('the host button waits on the open game',
    /\{user && !openLobby && !\(legacy\.gameInProgress && legacy\.activeMatchId\) && \(/.test(screen), true)
  check('...and the wait is explained',
    /\{user && !openLobby && legacy\.gameInProgress && legacy\.activeMatchId && \([\s\S]{0,700}?is still open online/.test(screen), true)
}

console.log(pass ? '\nall close-out pins hold' : '\nFAILED')
process.exit(pass ? 0 : 1)
