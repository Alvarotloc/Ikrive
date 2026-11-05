import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const port = process.env.E2E_PORT ?? '3100';
const baseURL = `http://127.0.0.1:${port}`;
/** Same path as `ADMIN_STORAGE_STATE` in `tests/fixtures.ts`: the admin session saved by `setup`. */
const ADMIN_STORAGE_STATE = join(import.meta.dirname, '.auth/admin.json');

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // A flake is a failure.
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL,
    locale: 'es-ES',
    timezoneId: 'UTC',
    // The PWA must not serve cached assets nor show the update prompt.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: ADMIN_STORAGE_STATE },
      dependencies: ['setup'],
      testIgnore: /data-portability\.spec\.ts/,
    },
    {
      // The export holds every vehicle of the shared admin: two imports running at once would each
      // duplicate the other's vehicle, so the copies of this test (`--repeat-each`) run one by one.
      name: 'data-portability',
      testMatch: /data-portability\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: ADMIN_STORAGE_STATE },
      dependencies: ['setup'],
      workers: 1,
    },
  ],
  webServer: {
    command: 'node server.mjs',
    url: `${baseURL}/api/health`,
    // Always a fresh database: if the port is taken, fail instead of reusing a server with data.
    reuseExistingServer: false,
    timeout: 60_000,
    // Playwright SIGKILLs the server by default; SIGTERM lets `server.mjs` delete its DATA_DIR.
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
  },
});
