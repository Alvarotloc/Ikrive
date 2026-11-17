import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { generateSaleReportPdf } from '@ikrive/shared/sale-report-pdf';
import type { SaleReportPdfKit } from '@/lib/data-source/local/sale-report';

const require = createRequire(import.meta.url);

/** Base64 data URL of a report font of `@fontsource`: works with both the Node and the browser builds of react-pdf. */
const dataUrl = (family: string, file: string) =>
  `data:font/woff;base64,${readFileSync(require.resolve(`@fontsource/${family}/files/${file}`)).toString('base64')}`;

const urls = new Map<string, string>();

/**
 * The `SaleReportPdfKit` of the tests (`LocalDeps.saleReportPdf`): the shared PDF module with the brand fonts
 * read from `@fontsource`, instead of the asset URLs of the chunk the app loads.
 */
export const nodeSaleReportPdf: SaleReportPdfKit = {
  generateSaleReportPdf,
  fonts(font) {
    let url = urls.get(font.file);
    if (!url) {
      url = dataUrl(font.family, font.file);
      urls.set(font.file, url);
    }
    return url;
  },
};

export const loadNodeSaleReportPdf = async (): Promise<SaleReportPdfKit> => nodeSaleReportPdf;
