import { LOCAL_USER_ID } from '@ikrive/db';
import { attachments } from '@ikrive/db/schema';
import { type SaleReportOptions, todayIn } from '@ikrive/shared';
import type { ReportFontSource, SaleReportAnnexFile } from '@ikrive/shared/sale-report-pdf';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { DataSource, DownloadedFile } from '../types';
import type { LocalDb } from './database';
import { fileBytes, type LocalDeps } from './files';
import { listMaintenanceRecords } from './maintenance';
import { problem } from './problems';
import type { SerialQueue } from './serial';
import { localSettings } from './settings';
import { listReadings, requireVehicle } from './vehicles';

/**
 * Stored bytes of the invoices appended to one sale report on the phone. Lower than the API's default
 * (`REPORT_MAX_ANNEX_MB`, 100): the WebView holds the annexes, the PDF and its base64 copy at once.
 */
export const LOCAL_MAX_ANNEX_MB = 25;

/** What the PDF chunk (`./sale-report-pdf`) provides: the shared generator and where its fonts are. */
export interface SaleReportPdfKit {
  generateSaleReportPdf: typeof import('@ikrive/shared/sale-report-pdf').generateSaleReportPdf;
  fonts: ReportFontSource;
}

/** Loads the PDF chunk (react-pdf, pdf-lib and the fonts) only when a report is downloaded. */
export type LoadSaleReportPdf = () => Promise<SaleReportPdfKit>;

const loadSaleReportPdf: LoadSaleReportPdf = () => import('./sale-report-pdf');

/** The attachments of `recordIds` in upload order (`createdAt`, then `rowid`), grouped by record. */
async function attachmentsByRecord(
  db: LocalDb,
  recordIds: readonly string[],
): Promise<Map<string, SaleReportAnnexFile[]>> {
  const byRecord = new Map<string, SaleReportAnnexFile[]>();
  if (recordIds.length === 0) return byRecord;
  const rows = await db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.ownerId, LOCAL_USER_ID),
        eq(attachments.entityType, 'maintenance'),
        inArray(attachments.entityId, [...recordIds]),
      ),
    )
    .orderBy(asc(attachments.createdAt), asc(sql`${attachments}.rowid`))
    .all();
  for (const row of rows) {
    const files = byRecord.get(row.entityId) ?? [];
    files.push({
      id: row.id,
      name: row.originalName,
      mimeType: row.mimeType,
      size: row.size,
      storageKey: row.storageKey,
    });
    byRecord.set(row.entityId, files);
  }
  return byRecord;
}

/**
 * `saleReport` of the local `DataSource`: the API's sale report PDF generated on the phone with the
 * shared module (`@ikrive/shared/sale-report-pdf`), loaded with `import()` on the first download. Only
 * the reads of the database go through `queue`; the invoices are read from the device and the PDF is
 * rendered outside it. An invoice that cannot be read is skipped with a notice, as the API does.
 */
export function localSaleReport(
  db: LocalDb,
  { files, images, saleReportPdf = loadSaleReportPdf }: LocalDeps,
  queue: SerialQueue,
): DataSource['saleReport'] {
  return {
    async download(vehicleId: string, options: SaleReportOptions): Promise<DownloadedFile> {
      const { vehicle, settings, records, readings, annexFiles } = await queue.run(async () => {
        const vehicle = await requireVehicle(db, vehicleId);
        // Newest first, reversed: the creation order of the API's report table.
        const records = (await listMaintenanceRecords(db, vehicleId)).reverse();
        const included = records.filter((record) => record.includeInReport).map((record) => record.id);
        return {
          vehicle,
          settings: await localSettings(db).get(),
          records,
          readings: await listReadings(db, vehicleId),
          annexFiles: options.includeInvoices ? await attachmentsByRecord(db, included) : new Map(),
        };
      });

      try {
        const { generateSaleReportPdf, fonts } = await saleReportPdf();
        const { fileName, pdf } = await generateSaleReportPdf(
          {
            vehicle,
            readings: readings.map(({ date, value }) => ({ date, value })),
            maintenance: records.map(({ id, date, odometer, category, title, cost, includeInReport }) => ({
              id,
              date,
              odometer,
              category,
              title,
              cost,
              includeInReport,
            })),
            settings,
            options,
            issuedOn: todayIn(settings.timezone),
          },
          {
            fonts,
            maxAnnexBytes: LOCAL_MAX_ANNEX_MB * 1024 * 1024,
            attachmentsOf: (recordId) => annexFiles.get(recordId) ?? [],
            // Any failure (`MissingFileError` included) makes the invoice `unreadable`, as in the API.
            readAnnex: async (file) => fileBytes(await files.read(file.storageKey, file.mimeType)),
            toAnnexImage: (data, mimeType) => images.toAnnexImage(data, mimeType),
          },
        );
        return { blob: new Blob([pdf.slice()], { type: 'application/pdf' }), fileName };
      } catch {
        throw problem(500, 'Internal Server Error', 'Could not generate the sale report');
      }
    },
  };
}
