import { buildSaleReport, type SaleReportOptions } from '@ikrive/shared';
import { todayIn } from '../../lib/dates';
import { NotFoundError } from '../../lib/errors';
import type { MaintenanceRepository } from '../maintenance/repository';
import type { SettingsService } from '../settings/service';
import type { VehiclesRepository } from '../vehicles/repository';
import { renderSaleReportPdf } from './pdf/render';

interface ReportsServiceDeps {
  vehicles: VehiclesRepository;
  maintenance: MaintenanceRepository;
  settings: SettingsService;
}

export function createReportsService({ vehicles, maintenance, settings }: ReportsServiceDeps) {
  return {
    /**
     * Sale report of an owned vehicle in the owner's language, currency and units, issued today in the
     * owner's time zone. Other users' vehicles are reported as missing, before anything is rendered.
     */
    async generate(
      ownerId: string,
      vehicleId: string,
      options: SaleReportOptions,
    ): Promise<{ fileName: string; pdf: Buffer }> {
      const vehicle = vehicles.findOwned(ownerId, vehicleId);
      if (!vehicle) throw new NotFoundError('Vehicle not found');
      const ownerSettings = settings.get(ownerId);
      const report = buildSaleReport({
        vehicle,
        readings: vehicles.listReadings(vehicleId).map(({ date, value }) => ({ date, value })),
        // The repository lists newest first; reversed, records of the same day keep their creation order.
        maintenance: maintenance
          .listByVehicle(vehicleId)
          .reverse()
          .map(({ date, odometer, category, title, cost, includeInReport }) => ({
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
      });
      return { fileName: report.fileName, pdf: await renderSaleReportPdf(report) };
    },
  };
}

export type ReportsService = ReturnType<typeof createReportsService>;
