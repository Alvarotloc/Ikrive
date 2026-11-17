import { Font, pdf } from '@react-pdf/renderer';
import type { SaleReport } from '../domain/sale-report';
import {
  REPORT_FONT_FILES,
  REPORT_FONTS,
  type ReportFontFamily,
  type ReportFontFile,
} from '../domain/sale-report-fonts';
import { SaleReportDocument } from './document';

/**
 * Where react-pdf loads a report font from: a path on disk (Node), a URL or a base64 data URL. Injected,
 * so this module never reads the disk on its own.
 */
export type ReportFontSource = (font: ReportFontFile) => string;

const fontsOf = (family: ReportFontFamily, fonts: ReportFontSource) =>
  REPORT_FONT_FILES.filter((font) => font.family === family).map((font) => ({
    src: fonts(font),
    fontWeight: font.weight,
  }));

let registered = false;

/** Registers the report fonts once (`Font` is global state of react-pdf): later sources are ignored. */
export function registerReportFonts(fonts: ReportFontSource): void {
  if (registered) return;
  Font.register({ family: REPORT_FONTS.display, fonts: fontsOf('outfit', fonts) });
  Font.register({ family: REPORT_FONTS.text, fonts: fontsOf('plus-jakarta-sans', fonts) });
  // Words are never split with hyphens: titles, plates and VINs must stay readable.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}

/**
 * Renders a built sale report to a PDF with `pdf().toBlob()`, which both the Node and the browser builds
 * of react-pdf provide. CPU-bound: hundreds of milliseconds on the calling thread.
 */
export async function renderSaleReportPdf(report: SaleReport, fonts: ReportFontSource): Promise<Uint8Array> {
  registerReportFonts(fonts);
  const blob = await pdf(<SaleReportDocument report={report} />).toBlob();
  return new Uint8Array(await blob.arrayBuffer());
}
