import {
  buildSaleReport,
  type SaleReportAttachment,
  type SaleReportMaintenance,
  type SaleReportOptions,
} from '@ikrive/shared';
import type { FastifyBaseLogger } from 'fastify';
import { todayIn } from '../../lib/dates';
import { NotFoundError } from '../../lib/errors';
import type { FileStorage } from '../../lib/storage';
import type { AttachmentsRepository } from '../attachments/repository';
import type { MaintenanceRepository } from '../maintenance/repository';
import type { SettingsService } from '../settings/service';
import type { VehiclesRepository } from '../vehicles/repository';
import { appendAnnexes, type LoadedAnnex, loadAnnex } from './pdf/annexes';
import { renderSaleReportPdf } from './pdf/render';

interface ReportsServiceDeps {
  vehicles: VehiclesRepository;
  maintenance: MaintenanceRepository;
  settings: SettingsService;
  attachments: AttachmentsRepository;
  storage: FileStorage;
  /** Total stored bytes of the invoices appended to one report (`REPORT_MAX_ANNEX_MB`). */
  maxAnnexBytes: number;
}

export function createReportsService({
  vehicles,
  maintenance,
  settings,
  attachments,
  storage,
  maxAnnexBytes,
}: ReportsServiceDeps) {
  return {
    /**
     * Sale report of an owned vehicle in the owner's language, currency and units, issued today in the
     * owner's time zone. Other users' vehicles are reported as missing, before anything is rendered.
     *
     * With `includeInvoices`, the attachments of the included maintenance records are appended in table
     * order. One that does not fit in what is left of `maxAnnexBytes` (checked before reading it) or
     * cannot be read is skipped with a warning and a notice in the report; the report is always served.
     */
    async generate(
      ownerId: string,
      vehicleId: string,
      options: SaleReportOptions,
      log: FastifyBaseLogger,
    ): Promise<{ fileName: string; pdf: Buffer }> {
      const vehicle = vehicles.findOwned(ownerId, vehicleId);
      if (!vehicle) throw new NotFoundError('Vehicle not found');
      const ownerSettings = settings.get(ownerId);
      // The repository lists newest first; reversed, records of the same day keep their creation order,
      // which is also the table order of the report.
      const records = maintenance.listByVehicle(vehicleId).reverse();

      // Keyed by attachment id: the PDF follows `report.annexes.items`, not the loading order.
      const loaded = new Map<string, LoadedAnnex>();
      let remaining = maxAnnexBytes;
      const annexesOf = async (recordId: string): Promise<SaleReportAttachment[]> => {
        const result: SaleReportAttachment[] = [];
        for (const row of attachments.listByEntity('maintenance', recordId)) {
          const attachment = { id: row.id, name: row.originalName };
          // `size` is the exact size of the stored file: the limit is checked without reading it.
          if (row.size > remaining) {
            log.warn(
              { vehicleId, attachmentId: row.id },
              'Sale report: attachment skipped, report annex size limit reached',
            );
            result.push({ ...attachment, skipped: 'size_limit' });
            continue;
          }
          try {
            loaded.set(row.id, await loadAnnex(row, storage));
          } catch (err) {
            log.warn(
              { vehicleId, attachmentId: row.id, err },
              'Sale report: attachment could not be annexed',
            );
            result.push({ ...attachment, skipped: 'unreadable' });
            continue;
          }
          // An unreadable attachment adds nothing to the PDF, so it does not use up the budget.
          remaining -= row.size;
          result.push({ ...attachment, skipped: null });
        }
        return result;
      };

      const reportMaintenance: SaleReportMaintenance[] = [];
      for (const { id, date, odometer, category, title, cost, includeInReport } of records) {
        // Attachments of excluded records are never read, and none at all without `includeInvoices`.
        const withAttachments = options.includeInvoices && includeInReport;
        reportMaintenance.push({
          date,
          odometer,
          category,
          title,
          cost,
          includeInReport,
          attachments: withAttachments ? await annexesOf(id) : [],
        });
      }

      const report = buildSaleReport({
        vehicle,
        readings: vehicles.listReadings(vehicleId).map(({ date, value }) => ({ date, value })),
        maintenance: reportMaintenance,
        settings: ownerSettings,
        options,
        issuedOn: todayIn(ownerSettings.timezone),
      });
      const pdf = await renderSaleReportPdf(report);
      // Skipped annexes (with a notice) were never loaded, so they are not in the map.
      const annexes = (report.annexes?.items ?? []).flatMap((item) => {
        const annex = item.notice === null ? loaded.get(item.id) : undefined;
        return annex ? [annex] : [];
      });
      return { fileName: report.fileName, pdf: annexes.length > 0 ? await appendAnnexes(pdf, annexes) : pdf };
    },
  };
}

export type ReportsService = ReturnType<typeof createReportsService>;
