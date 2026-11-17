import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { ReportFontFamily } from '@ikrive/shared';

const require = createRequire(import.meta.url);

/**
 * Path of a report `.woff`, the font source the API gives the shared PDF module. The `dist/` bundle ships
 * them in `fonts/` next to the module (the image does not install `@fontsource/*`); from `src/` (tsx,
 * vitest) they are resolved from the package.
 */
export function resolveReportFont(
  family: ReportFontFamily,
  file: string,
  bundledDir: URL = new URL('./fonts/', import.meta.url),
): string {
  const bundled = fileURLToPath(new URL(file, bundledDir));
  if (existsSync(bundled)) return bundled;
  return require.resolve(`@fontsource/${family}/files/${file}`);
}
