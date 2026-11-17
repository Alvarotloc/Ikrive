import { buffer } from 'node:stream/consumers';
import { type SaleReportOptions, todayIn } from '@ikrive/shared';
import { generateSaleReportPdf } from '@ikrive/shared/sale-report-pdf';
import type { FastifyBaseLogger } from 'fastify';
import { NotFoundError } from '../../lib/errors';
import { toAnnexImage } from '../../lib/images';
import type { FileStorage } from '../../lib/storage';
import type { AttachmentsRepository } from '../attachments/repository';
import type { MaintenanceRepository } from '../maintenance/repository';
import type { SettingsService } from '../settings/service';
import type { VehiclesRepository } from '../vehicles/repository';
import { resolveReportFont } from './pdf/fonts';

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

      const { fileName, pdf } = await generateSaleReportPdf(
        {
          vehicle,
          readings: vehicles.listReadings(vehicleId).map(({ date, value }) => ({ date, value })),
          maintenance: records.map(({ id, date, odometer, category, title, cost, includeInReport }) => ({
            id,
            date,
            odometer,
            category,
            title,
            cost,
            includeInReport,
          })),
          settings: ownerSettings,
          options,
          issuedOn: todayIn(ownerSettings.timezone),
        },
        {
          fonts: (font) => resolveReportFont(font.family, font.file),
          maxAnnexBytes,
          attachmentsOf: (recordId) =>
            attachments.listByEntity('maintenance', recordId).map((row) => ({
              id: row.id,
              name: row.originalName,
              mimeType: row.mimeType,
              size: row.size,
              storageKey: row.storageKey,
            })),
          readAnnex: async (file) => buffer(storage.read(file.storageKey)),
          toAnnexImage: (data) => toAnnexImage(Buffer.from(data.buffer, data.byteOffset, data.byteLength)),
          onAnnexSkipped(file, reason, err) {
            if (reason === 'size_limit') {
              log.warn(
                { vehicleId, attachmentId: file.id },
                'Sale report: attachment skipped, report annex size limit reached',
              );
            } else {
              log.warn(
                { vehicleId, attachmentId: file.id, err },
                'Sale report: attachment could not be annexed',
              );
            }
          },
        },
      );
      return { fileName, pdf: Buffer.from(pdf) };
    },
  };
}

export type ReportsService = ReturnType<typeof createReportsService>;
