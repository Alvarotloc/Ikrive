import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Font } from '@react-pdf/renderer';
import { REPORT_FONT_FILES, type ReportFontFamily } from './font-files';

/** Brand fonts of the report: Outfit for titles, Plus Jakarta Sans for text. */
export const REPORT_FONTS = { display: 'Outfit', text: 'Plus Jakarta Sans' } as const;

const require = createRequire(import.meta.url);

/**
 * Path of a report `.woff`. The `dist/` bundle ships them in `fonts/` next to the module (the image
 * does not install `@fontsource/*`); from `src/` (tsx, vitest) they are resolved from the package.
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

const fontsOf = (family: ReportFontFamily) =>
  REPORT_FONT_FILES.filter((font) => font.family === family).map((font) => ({
    src: resolveReportFont(font.family, font.file),
    fontWeight: font.weight,
  }));

let registered = false;

/** Registers the report fonts once (`Font` is global state of react-pdf). */
export function registerReportFonts(): void {
  if (registered) return;
  Font.register({ family: REPORT_FONTS.display, fonts: fontsOf('outfit') });
  Font.register({ family: REPORT_FONTS.text, fonts: fontsOf('plus-jakarta-sans') });
  // Words are never split with hyphens: titles, plates and VINs must stay readable.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
