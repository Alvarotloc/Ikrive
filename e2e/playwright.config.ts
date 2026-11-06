import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { baseURL, webServer } from './server-config';

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
  webServer,
});
