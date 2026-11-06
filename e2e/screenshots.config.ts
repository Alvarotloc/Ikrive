import { defineConfig, devices } from '@playwright/test';
import { baseURL, webServer } from './server-config';

// README screenshots (`pnpm screenshots`): writes `docs/screenshots/*.png`. Not part of `pnpm test:e2e`,
// whose config only looks at `tests/`.
export default defineConfig({
  testDir: './screenshots',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results/screenshots',
  use: {
    baseURL,
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    // The PWA must not serve cached assets nor show the update prompt.
    serviceWorkers: 'block',
    // Charts and entrance animations render in their final state.
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'screenshots',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer,
});
