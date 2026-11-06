import type { PlaywrightTestConfig } from '@playwright/test';

/** Port of `server.mjs` (`E2E_PORT`), shared by the E2E suite and the screenshot script. */
export const port = process.env.E2E_PORT ?? '3100';
export const baseURL = `http://127.0.0.1:${port}`;

export const webServer: PlaywrightTestConfig['webServer'] = {
  command: 'node server.mjs',
  url: `${baseURL}/api/health`,
  // Always a fresh database: if the port is taken, fail instead of reusing a server with data.
  reuseExistingServer: false,
  timeout: 60_000,
  // Playwright SIGKILLs the server by default; SIGTERM lets `server.mjs` delete its DATA_DIR.
  gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
};
