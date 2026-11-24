import type { CsvRow } from '@ikrive/shared/csv-import';
import type { Db } from '../../db/client';
import { fuelLogs, maintenanceRecords, odometerReadings } from '../../db/schema';

export function createCsvImportRepository(db: Db) {
  return {
    /**
     * Writes the accepted rows of an import in one transaction: a loose reading as `manual`, a refuel
     * or a maintenance record with its linked `fuel` or `maintenance` reading (maintenance only when it
     * has an odometer). Any failure rolls back the whole import.
     */
    apply(vehicleId: string, rows: readonly CsvRow[]) {
      db.transaction((tx) => {
        const insertReading = (date: string, value: number, source: 'manual' | 'fuel' | 'maintenance') =>
          tx
            .insert(odometerReadings)
            .values({ vehicleId, date, value, source })
            .returning({ id: odometerReadings.id })
            .get().id;

        for (const row of rows) {
          if (row.kind === 'odometer') {
            insertReading(row.data.date, row.data.value, 'manual');
          } else if (row.kind === 'fuel') {
            const odometerReadingId = insertReading(row.data.date, row.data.odometer, 'fuel');
            tx.insert(fuelLogs)
              .values({ ...row.data, vehicleId, odometerReadingId })
              .run();
          } else {
            const { odometer } = row.data;
            const odometerReadingId =
              odometer == null ? null : insertReading(row.data.date, odometer, 'maintenance');
            tx.insert(maintenanceRecords)
              .values({ ...row.data, vehicleId, odometerReadingId, scheduleId: null })
              .run();
          }
        }
      });
    },
  };
}

export type CsvImportRepository = ReturnType<typeof createCsvImportRepository>;
