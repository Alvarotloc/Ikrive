import {
  buildSaleReport,
  type SaleReportAnnexSkip,
  type SaleReportAttachment,
  type SaleReportInput,
  type SaleReportMaintenance,
} from '../domain/sale-report';
import { type AnnexImageNormalizer, appendAnnexes, type LoadedAnnex, loadAnnex } from './annexes';
import { type ReportFontSource, renderSaleReportPdf } from './render';

/** An attachment of a maintenance record that may become an annex of the report. */
export interface SaleReportAnnexFile {
  id: string;
  /** Original file name. */
  name: string;
  mimeType: string;
  /** Exact size of the stored file: the budget is checked without reading it. */
  size: number;
  storageKey: string;
}

export interface SaleReportPdfInput extends Omit<SaleReportInput, 'maintenance'> {
  /** In creation order (the order of the report's table). */
  maintenance: readonly (Omit<SaleReportMaintenance, 'attachments'> & { id: string })[];
}

export interface SaleReportPdfDeps {
  fonts: ReportFontSource;
  /** Total stored bytes of the invoices appended to one report. */
  maxAnnexBytes: number;
  /** Attachments of a record in upload order. Only called for included records with `includeInvoices`. */
  attachmentsOf(recordId: string): readonly SaleReportAnnexFile[];
  readAnnex(file: SaleReportAnnexFile): Promise<Uint8Array>;
  toAnnexImage: AnnexImageNormalizer;
  /** Called for each invoice left out of the PDF (it gets a notice in the report). */
  onAnnexSkipped?(file: SaleReportAnnexFile, reason: SaleReportAnnexSkip, error?: unknown): void;
}

/**
 * The sale report PDF, the same in the API and on the phone: `buildSaleReport`, the react-pdf render and,
 * with `includeInvoices`, the invoices of the included records appended in table order.
 *
 * An invoice that does not fit in what is left of `maxAnnexBytes` is skipped (`size_limit`) without
 * reading it; one that cannot be read or prepared is skipped (`unreadable`) without using up the budget.
 * Both get a notice in the report, which is always generated.
 */
export async function generateSaleReportPdf(
  input: SaleReportPdfInput,
  deps: SaleReportPdfDeps,
): Promise<{ fileName: string; pdf: Uint8Array }> {
  // Keyed by attachment id: the PDF follows `report.annexes.items`, not the loading order.
  const loaded = new Map<string, LoadedAnnex>();
  let remaining = deps.maxAnnexBytes;
  const annexesOf = async (recordId: string): Promise<SaleReportAttachment[]> => {
    const result: SaleReportAttachment[] = [];
    for (const file of deps.attachmentsOf(recordId)) {
      const attachment = { id: file.id, name: file.name };
      if (file.size > remaining) {
        deps.onAnnexSkipped?.(file, 'size_limit');
        result.push({ ...attachment, skipped: 'size_limit' });
        continue;
      }
      try {
        loaded.set(file.id, await loadAnnex(await deps.readAnnex(file), file.mimeType, deps.toAnnexImage));
      } catch (error) {
        deps.onAnnexSkipped?.(file, 'unreadable', error);
        result.push({ ...attachment, skipped: 'unreadable' });
        continue;
      }
      // An unreadable attachment adds nothing to the PDF, so it does not use up the budget.
      remaining -= file.size;
      result.push({ ...attachment, skipped: null });
    }
    return result;
  };

  const maintenance: SaleReportMaintenance[] = [];
  for (const { id, ...record } of input.maintenance) {
    // Attachments of excluded records are never read, and none at all without `includeInvoices`.
    const withAttachments = input.options.includeInvoices && record.includeInReport;
    maintenance.push({ ...record, attachments: withAttachments ? await annexesOf(id) : [] });
  }

  const report = buildSaleReport({ ...input, maintenance });
  const pdf = await renderSaleReportPdf(report, deps.fonts);
  // Skipped annexes (with a notice) were never loaded, so they are not in the map.
  const annexes = (report.annexes?.items ?? []).flatMap((item) => {
    const annex = item.notice === null ? loaded.get(item.id) : undefined;
    return annex ? [annex] : [];
  });
  return { fileName: report.fileName, pdf: annexes.length > 0 ? await appendAnnexes(pdf, annexes) : pdf };
}
