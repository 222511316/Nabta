import { defineConfig, devices } from '@playwright/test'

// US24, NFR02: the agreed browser set. Chromium (Chrome, Edge), Firefox and WebKit (Safari),
// each at phone width and at a common laptop width.
const PORT = 8100
const SIZES = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1366, height: 900 },
}
const BROWSERS = {
  chromium: devices['Desktop Chrome'],
  firefox: devices['Desktop Firefox'],
  webkit: devices['Desktop Safari'],
}

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Every test signs up its own grower, so tests don't share records; SQLite keeps writers few.
  workers: 3,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    // Machine-readable results for the test reports.
    ['json', { outputFile: 'e2e-results/results.json' }],
    ['junit', { outputFile: 'e2e-results/results.xml' }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'en-GB',
    timezoneId: 'Asia/Riyadh',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: Object.entries(BROWSERS).flatMap(([browser, device]) =>
    Object.entries(SIZES).map(([size, viewport]) => ({
      name: `${browser}-${size}`,
      use: { ...device, viewport },
    })),
  ),
  webServer: {
    command: 'node e2e/server.mjs',
    url: `http://127.0.0.1:${PORT}/api/health`,
    env: { E2E_PORT: String(PORT) },
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
})
