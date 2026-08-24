import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import DuneDevBoard from './components/dune/DuneDevBoard'
import DuneGameScreenPreview from './components/dune/DuneGameScreenPreview'
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
        fixture. Query checks rather than a router: the app has no routing, and
        adding one for two dev screens would be a larger change than the
        screens. Absent both flags nothing here runs.

        The ORDER matters — 'dune-game' contains 'dune', and `has('dune')` is
        false for it, but a startsWith would match both and the game screen
        would be unreachable. */}
    {DuneMultiSeatView && new URLSearchParams(window.location.search).has('dune-seats')
      ? <Suspense fallback={null}><DuneMultiSeatView /></Suspense>
      : new URLSearchParams(window.location.search).has('dune-game')
      ? <DuneGameScreenPreview />
      : new URLSearchParams(window.location.search).has('dune')
        ? <DuneDevBoard />
        : <App />}
  </React.StrictMode>,
)
