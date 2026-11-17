/**
 * The chunk of the local sale report PDF: the shared module (react-pdf, pdf-lib) and the report fonts as
 * asset URLs. Loaded only with `import()` (`LocalDeps.saleReportPdf`); the web build sends it to
 * `assets/native/`, out of the service worker's precache (`NATIVE_ONLY_ENTRIES`).
 */
import outfit600 from '@fontsource/outfit/files/outfit-latin-600-normal.woff?url';
import outfit700 from '@fontsource/outfit/files/outfit-latin-700-normal.woff?url';
import jakarta400 from '@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-400-normal.woff?url';
import jakarta600 from '@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-600-normal.woff?url';
import type { ReportFontFile } from '@ikrive/shared';
import type { ReportFontSource } from '@ikrive/shared/sale-report-pdf';

export { generateSaleReportPdf } from '@ikrive/shared/sale-report-pdf';

/** Typed by file name, so a font added to `REPORT_FONT_FILES` without its URL fails the typecheck. */
const FONT_URLS: Record<ReportFontFile['file'], string> = {
  'outfit-latin-600-normal.woff': outfit600,
  'outfit-latin-700-normal.woff': outfit700,
  'plus-jakarta-sans-latin-400-normal.woff': jakarta400,
  'plus-jakarta-sans-latin-600-normal.woff': jakarta600,
};

export const fonts: ReportFontSource = (font) => FONT_URLS[font.file];
