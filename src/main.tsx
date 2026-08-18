import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import DuneDevBoard from './components/dune/DuneDevBoard'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* ?dune opens the Dune development view. A query check rather than a
        router: the app has no routing, and adding one for a dev screen would be
        a larger change than the screen. Absent the flag nothing here runs. */}
    {new URLSearchParams(window.location.search).has('dune') ? <DuneDevBoard /> : <App />}
  </React.StrictMode>,
)
