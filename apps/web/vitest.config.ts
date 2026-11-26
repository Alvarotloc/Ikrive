import { defineConfig, mergeConfig } from 'vitest/config';
import { skipImportMetaGlob } from './src/test/fs-module-cache.ts';
import viteConfig from './vite.config.ts';

// Two projects that inherit the app's Vite config (aliases, React plugin):
// pure logic (`*.test.ts`) runs in Node; components (`*.test.tsx`) run in jsdom with Testing Library.
export default mergeConfig(
  viteConfig({ mode: 'test', command: 'serve' }),
  defineConfig({
    // Vitest caches transformed modules in `node_modules/.vitest-cache` between runs: the modules that use
    // `import.meta.glob` stay out of it so they see new matching files (`src/test/fs-module-cache.ts`).
    plugins: [
      {
        name: 'ikrive:fs-module-cache-skip-glob',
        configureVitest: ({ defineCacheKeyGenerator }) => defineCacheKeyGenerator(skipImportMetaGlob),
      },
    ],
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: 'unit',
            environment: 'node',
            include: ['src/**/*.test.ts'],
            setupFiles: ['./src/test/setup-unit.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'dom',
            environment: 'jsdom',
            include: ['src/**/*.test.tsx'],
            setupFiles: ['./src/test/setup.ts'],
          },
        },
      ],
    },
  }),
);
