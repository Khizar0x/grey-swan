import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Some Solana-adjacent deps reference Node's `global` object, which
  // doesn't exist in the browser — map it to `globalThis` like webpack did.
  define: {
    global: 'globalThis',
  },
  // The pinning server (server/) runs separately on :8787 — proxy /api so
  // the frontend can call fetch('/api/pin') the same way in dev and prod,
  // without CORS config living in two places.
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
