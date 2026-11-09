import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // The browser only ever talks to Vite; API calls are forwarded to FastAPI so
    // the session cookie stays first-party. 127.0.0.1 avoids IPv6 lookups on Windows.
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    restoreMocks: true,
    // The browser tests in e2e/ run with Playwright (npm run e2e).
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
