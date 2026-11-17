/**
 * The sale report PDF (react-pdf layout and render, pdf-lib annexes), shared by the API and the local
 * mode of the phone. Kept out of the package index so react-pdf and pdf-lib only reach the bundles that
 * import this subpath: the web loads it with `import()`.
 */
export {
  type AnnexImage,
  type AnnexImageNormalizer,
  appendAnnexes,
  fitImage,
  type LoadedAnnex,
  loadAnnex,
} from './annexes';
export { SaleReportDocument } from './document';
export {
  generateSaleReportPdf,
  type SaleReportAnnexFile,
  type SaleReportPdfDeps,
  type SaleReportPdfInput,
} from './generate';
export { type ReportFontSource, registerReportFonts, renderSaleReportPdf } from './render';
