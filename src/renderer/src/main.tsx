import React from 'react'
import ReactDOM from 'react-dom/client'

import App from './App'
import { ThemeProvider } from './components/ui/theme-provider'
import { TooltipProvider } from './components/ui/tooltip'
import { installBrowserBridgeIfNeeded } from './platform/browserBridge'
import { StoreProvider } from './state/root/store-provider'
import './styles.css'

installBrowserBridgeIfNeeded()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <StoreProvider>
      <ThemeProvider>
        <TooltipProvider>
          <App />
        </TooltipProvider>
      </ThemeProvider>
    </StoreProvider>
  </React.StrictMode>,
)
