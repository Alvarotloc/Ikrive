import { createRequire } from 'node:module';
import { Font } from '@react-pdf/renderer';

/** Brand fonts of the report: Outfit for titles, Plus Jakarta Sans for text. */
export const REPORT_FONTS = { display: 'Outfit', text: 'Plus Jakarta Sans' } as const;

const require = createRequire(import.meta.url);

/**
 * `.woff` file of `@fontsource/<family>` (react-pdf cannot read woff2). Resolved through Node so it
 * works the same from `src/` (tsx, vitest) and from the `dist/` bundle with the production modules.
 */
const fontFile = (family: string, weight: number) =>
  require.resolve(`@fontsource/${family}/files/${family}-latin-${weight}-normal.woff`);

let registered = false;

/** Registers the report fonts once (`Font` is global state of react-pdf). */
export function registerReportFonts(): void {
  if (registered) return;
  Font.register({
    family: REPORT_FONTS.display,
    fonts: [
      { src: fontFile('outfit', 600), fontWeight: 600 },
      { src: fontFile('outfit', 700), fontWeight: 700 },
    ],
  });
  Font.register({
    family: REPORT_FONTS.text,
    fonts: [
      { src: fontFile('plus-jakarta-sans', 400), fontWeight: 400 },
      { src: fontFile('plus-jakarta-sans', 600), fontWeight: 600 },
    ],
  });
  // Words are never split with hyphens: titles, plates and VINs must stay readable.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
