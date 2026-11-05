import { defineConfig } from 'vitest/config';

// Only the guards on the suite run under `pnpm test`; the Playwright specs in `tests/` run with `pnpm test:e2e`.
export default defineConfig({
  test: {
    include: ['*.test.ts'],
  },
});
