/**
 * `.woff` files of `@fontsource/*` embedded in the sale report (react-pdf cannot read woff2). Plain data,
 * exported from the package index so the API's `tsup.config.ts` and the web read them without loading
 * react-pdf.
 */
export const REPORT_FONT_FILES = [
  { family: 'outfit', weight: 600, file: 'outfit-latin-600-normal.woff' },
  { family: 'outfit', weight: 700, file: 'outfit-latin-700-normal.woff' },
  { family: 'plus-jakarta-sans', weight: 400, file: 'plus-jakarta-sans-latin-400-normal.woff' },
  { family: 'plus-jakarta-sans', weight: 600, file: 'plus-jakarta-sans-latin-600-normal.woff' },
] as const;

export type ReportFontFile = (typeof REPORT_FONT_FILES)[number];

export type ReportFontFamily = ReportFontFile['family'];

/** Brand fonts of the report: Outfit for titles, Plus Jakarta Sans for text. */
export const REPORT_FONTS = { display: 'Outfit', text: 'Plus Jakarta Sans' } as const;
