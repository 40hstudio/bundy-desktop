import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'
import { initRendererErrorLogger } from './utils/errorLogger'
import { initEventLogger } from './utils/eventLogger'

// Capture every console.error / unhandled exception / unhandled rejection
// and stream them to main, which appends to a rotating log file under
// userData/error.log. Initialise as early as possible.
initRendererErrorLogger()

// UI event capture — clicks, keyboard shortcuts, navigation, named
// feature events (via track()). Persists to userData/events.log.
initEventLogger()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
