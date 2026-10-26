import { cpSync } from 'node:fs';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts', 'src/job.ts'],
  format: 'esm',
  target: 'node22',
  platform: 'node',
  clean: true,
  sourcemap: true,
  // Bundle the workspace package (it ships TypeScript sources); keep real npm deps external.
  noExternal: ['@ikrive/shared'],
  onSuccess: async () => {
    cpSync('src/db/migrations', 'dist/migrations', { recursive: true });
  },
});
