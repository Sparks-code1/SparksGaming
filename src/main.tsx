import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import DuneDevBoard from './components/dune/DuneDevBoard'
import DuneGameScreenPreview from './components/dune/DuneGameScreenPreview'
import DuneMatchScreen from './components/dune/DuneMatchScreen'
// THE IMPORT ITSELF IS BEHIND THE FLAG, not just the render.
//
// The multi-seat harness signs several accounts in at once, and must not be in
// a bundle a player runs. A lazy import at top level with the DEV check only on
// the JSX is NOT enough: Vite folds import.meta.env.DEV to false so the branch
// is dead, but the `import()` is still there for Rollup to see, and it emitted
// a 4.6kB DuneMultiSeatView chunk into dist — never loaded, but shipped and
// reachable by URL. Put the flag around the import expression and the whole
// thing folds to null and the chunk is gone. tests/multiseattest builds and
// checks, because the source shape alone said this was fine when it was not.
const DuneMultiSeatView = import.meta.env.DEV
  ? lazy(() => import('./components/dune/DuneMultiSeatView'))
  : null
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
{/* ?dune opens the Dune development view, ?dune-game the game screen over a
        fixture, ?dune-match=<id> a REAL match as whoever this browser is signed
        in as. Query checks rather than a router: the app has no routing, and
        adding one for these would be a larger change than the screens.

        ?dune-match IS NOT A DEV FLAG, unlike the three beside it. It ships, it
        takes no credentials, and it holds one session — the seat it plays is
        the row match_players has for the signed-in user, which the server
        resolves again on every action. It is a URL rather than a menu item
        because there is no lobby to reach it from yet; when there is, that
        lobby links here and this stays the destination.

        The ORDER matters — 'dune-game' contains 'dune', and `has('dune')` is
        false for it, but a startsWith would match both and the game screen
        would be unreachable. */}
    {DuneMultiSeatView && new URLSearchParams(window.location.search).has('dune-seats')
      ? <Suspense fallback={null}><DuneMultiSeatView /></Suspense>
      : new URLSearchParams(window.location.search).has('dune-match')
      ? <DuneMatchScreen
          matchId={new URLSearchParams(window.location.search).get('dune-match') ?? ''} />
      : new URLSearchParams(window.location.search).has('dune-game')
      ? <DuneGameScreenPreview />
      : new URLSearchParams(window.location.search).has('dune')
        ? <DuneDevBoard />
        : <App />}
  </React.StrictMode>,
)
