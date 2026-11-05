/**
 * `.woff` files of `@fontsource/*` registered by the sale report (react-pdf cannot read woff2).
 * Kept free of imports so `tsup.config.ts` can copy them into `dist/fonts/` without loading react-pdf.
 */
export const REPORT_FONT_FILES = [
  { family: 'outfit', weight: 600, file: 'outfit-latin-600-normal.woff' },
  { family: 'outfit', weight: 700, file: 'outfit-latin-700-normal.woff' },
  { family: 'plus-jakarta-sans', weight: 400, file: 'plus-jakarta-sans-latin-400-normal.woff' },
  { family: 'plus-jakarta-sans', weight: 600, file: 'plus-jakarta-sans-latin-600-normal.woff' },
] as const;

export type ReportFontFamily = (typeof REPORT_FONT_FILES)[number]['family'];
