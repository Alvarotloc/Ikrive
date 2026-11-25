import { expenses, fuelLogs, maintenanceRecords, odometerReadings } from '@ikrive/db/schema';
import { CSV_IMPORT_MAX_BYTES, csvImportRequestSchema, fuelQuantityUnit, todayIn } from '@ikrive/shared';
import {
  type CsvRow,
  csvImportProblemErrors,
  csvImportSummary,
  decodeCsv,
  parseCsvImport,
  planCsvImport,
} from '@ikrive/shared/csv-import';
import type { DataSource } from '../types';
import type { LocalDb, LocalTx } from './database';
import { listExpenses } from './expenses';
import { fileBytes } from './files';
import { listFuelLogs } from './fuel-logs';
import { listMaintenanceRecords } from './maintenance';
import { parseInput, problem } from './problems';
import { settingsRow } from './settings';
import { listReadings, requireVehicle } from './vehicles';

/** The same writes as the API's `csv-import/repository.ts`, inside the import's transaction. */
async function applyRows(tx: LocalTx, vehicleId: string, rows: readonly CsvRow[]): Promise<void> {
  const insertReading = async (date: string, value: number, source: 'manual' | 'fuel' | 'maintenance') =>
    (
      await tx
        .insert(odometerReadings)
        .values({ vehicleId, date, value, source })
        .returning({ id: odometerReadings.id })
        .get()
    ).id;

  for (const row of rows) {
    if (row.kind === 'odometer') {
      await insertReading(row.data.date, row.data.value, 'manual');
    } else if (row.kind === 'fuel') {
      const odometerReadingId = await insertReading(row.data.date, row.data.odometer, 'fuel');
      await tx.insert(fuelLogs).values({ ...row.data, vehicleId, odometerReadingId });
    } else if (row.kind === 'expense') {
      await tx.insert(expenses).values({ ...row.data, vehicleId });
    } else {
      const { odometer } = row.data;
      const odometerReadingId =
        odometer == null ? null : await insertReading(row.data.date, odometer, 'maintenance');
      await tx
        .insert(maintenanceRecords)
        .values({ ...row.data, vehicleId, odometerReadingId, scheduleId: null });
    }
  }
}

/**
 * `csvImport` of the local `DataSource`: the orchestration of the API's `csv-import/service.ts` on the
 * device, with the same limit, parser, plan (duplicates, order, odometer and future dates) and problems.
 * Only inner helpers are called: another serialized method would wait for this one in the queue forever.
 */
export function localCsvImport(db: LocalDb): DataSource['csvImport'] {
  return {
    async import(vehicleId, file, input = {}) {
      // Before reading the file, as the API's multipart limit stops the upload.
      if (file.size > CSV_IMPORT_MAX_BYTES) throw problem(413, 'request file too large');
      const { dryRun, ...options } = parseInput(csvImportRequestSchema, input);
      const vehicle = await requireVehicle(db, vehicleId);
      const { distanceUnit, volumeUnit, timezone } = await settingsRow(db);

      const { text, replaced } = decodeCsv(await fileBytes(file));
      const result = parseCsvImport(text, {
        ...options,
        target: { distance: distanceUnit, quantity: fuelQuantityUnit(vehicle.fuelType, volumeUnit) },
      });
      if (result.status !== 'parsed') {
        throw problem(400, 'Bad Request', 'The CSV cannot be imported', csvImportProblemErrors(result));
      }

      const plan = planCsvImport(
        result.rows,
        {
          readings: await listReadings(db, vehicleId),
          fuelLogs: await listFuelLogs(db, vehicleId),
          maintenance: await listMaintenanceRecords(db, vehicleId),
          expenses: await listExpenses(db, vehicleId),
        },
        todayIn(timezone),
      );
      if (!dryRun) await db.transaction((tx) => applyRows(tx, vehicleId, plan.accepted));
      return csvImportSummary(result, plan, { dryRun, encodingReplaced: replaced });
    },
  };
}
