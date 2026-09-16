import { Buffer } from 'buffer'

// @solana/web3.js and @coral-xyz/anchor assume Node's Buffer/global exist.
// Vite doesn't polyfill Node built-ins, so without this, anything that
// touches account decoding (e.g. useProgram's account fetches) throws
// "Buffer is not defined" at runtime — a failure tsc and `vite build` can't
// catch, since it only happens once this code path actually executes.
globalThis.Buffer = globalThis.Buffer ?? Buffer

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import './index.css'
import { AuthProvider } from './lib/AuthContext.tsx'
import { WalletContextProvider } from './lib/WalletContextProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WalletContextProvider>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </WalletContextProvider>
  </StrictMode>,
)
