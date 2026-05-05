import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'
import { initRendererErrorLogger } from './utils/errorLogger'

// Capture every console.error / unhandled exception / unhandled rejection
// and stream them to main, which appends to a rotating log file under
// userData/error.log. Initialise as early as possible.
initRendererErrorLogger()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
