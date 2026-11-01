import type { SaleReport } from '@ikrive/shared';
import { renderToBuffer } from '@react-pdf/renderer';
import { registerReportFonts } from './fonts';
import { SaleReportDocument } from './sale-report-document';

/** Renders a built sale report to a PDF. CPU-bound: hundreds of milliseconds on the Node thread. */
export async function renderSaleReportPdf(report: SaleReport): Promise<Buffer> {
  registerReportFonts();
  return renderToBuffer(<SaleReportDocument report={report} />);
}
