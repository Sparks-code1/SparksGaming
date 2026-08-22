import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import DuneDevBoard from './components/dune/DuneDevBoard'
import DuneGameScreenPreview from './components/dune/DuneGameScreenPreview'
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
    {new URLSearchParams(window.location.search).has('dune-game')
      ? <DuneGameScreenPreview />
      : new URLSearchParams(window.location.search).has('dune')
        ? <DuneDevBoard />
        : <App />}
  </React.StrictMode>,
)
