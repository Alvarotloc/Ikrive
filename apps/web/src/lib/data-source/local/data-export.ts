import { LOCAL_USER_ID } from '@ikrive/db';
import {
  attachments,
  fuelLogs,
  maintenanceRecords,
  maintenanceSchedules,
  odometerReadings,
  vehicles,
} from '@ikrive/db/schema';
import {
  attachmentExportPath,
  buildDataExport,
  type DataExportInputRows,
  photoExportPath,
  todayIn,
  type UserSettings,
} from '@ikrive/shared';
import { streamDataExportZip } from '@ikrive/shared/data-export-zip';
import { and, asc, eq, getTableColumns, inArray, type SQL, sql } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { DataSource, ExportedFile } from '../types';
import type { LocalDb } from './database';
import { type LocalExportSink, openMemoryExportSink } from './export-sink';
import { fileBytes, type LocalDeps, MissingFileError } from './files';
import { problem } from './problems';
import type { SerialQueue } from './serial';
import { localSettings } from './settings';

const buildVersion: unknown = import.meta.env.VITE_IKRIVE_VERSION;

/** `appVersion` of the local export: the build's version, with the API's fallback when it is not set. */
export const LOCAL_APP_VERSION =
  typeof buildVersion === 'string' && buildVersion ? buildVersion : '0.0.0-dev';

/** `rowid` breaks ties between rows created in the same millisecond, so the order is stable. */
const rowid = (table: SQLiteTable): SQL => asc(sql`${table}.rowid`);

/**
 * Everything the local user exports, one query per table in the order of the API's
 * `data-export/repository.ts`. The local mode has no notification channels.
 */
export async function loadLocalExportRows(db: LocalDb): Promise<DataExportInputRows> {
  const owned = eq(vehicles.ownerId, LOCAL_USER_ID);

  const vehicleRows = await db
    .select()
    .from(vehicles)
    .where(owned)
    .orderBy(asc(vehicles.createdAt), rowid(vehicles))
    .all();

  const readings = await db
    .select(getTableColumns(odometerReadings))
    .from(odometerReadings)
    .innerJoin(vehicles, eq(vehicles.id, odometerReadings.vehicleId))
    .where(owned)
    .orderBy(asc(odometerReadings.date), asc(odometerReadings.createdAt), rowid(odometerReadings))
    .all();

  const schedules = await db
    .select(getTableColumns(maintenanceSchedules))
    .from(maintenanceSchedules)
    .innerJoin(vehicles, eq(vehicles.id, maintenanceSchedules.vehicleId))
    .where(owned)
    .orderBy(asc(maintenanceSchedules.createdAt), rowid(maintenanceSchedules))
    .all();

  const records = await db
    .select(getTableColumns(maintenanceRecords))
    .from(maintenanceRecords)
    .innerJoin(vehicles, eq(vehicles.id, maintenanceRecords.vehicleId))
    .where(owned)
    .orderBy(asc(maintenanceRecords.date), asc(maintenanceRecords.createdAt), rowid(maintenanceRecords))
    .all();

  const fuel = await db
    .select(getTableColumns(fuelLogs))
    .from(fuelLogs)
    .innerJoin(vehicles, eq(vehicles.id, fuelLogs.vehicleId))
    .where(owned)
    .orderBy(asc(fuelLogs.date), asc(fuelLogs.createdAt), rowid(fuelLogs))
    .all();

  const ownedRecordIds = db
    .select({ id: maintenanceRecords.id })
    .from(maintenanceRecords)
    .innerJoin(vehicles, eq(vehicles.id, maintenanceRecords.vehicleId))
    .where(owned);
  const files = await db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.ownerId, LOCAL_USER_ID),
        eq(attachments.entityType, 'maintenance'),
        inArray(attachments.entityId, ownedRecordIds),
      ),
    )
    .orderBy(asc(attachments.createdAt), rowid(attachments))
    .all();

  return {
    vehicles: vehicleRows,
    odometerReadings: readings,
    maintenanceSchedules: schedules,
    maintenanceRecords: records,
    fuelLogs: fuel,
    attachments: files,
    notificationChannels: [],
  };
}

/**
 * `dataPortability` of the local `DataSource`: the export zip of the API (`data.json` + attachments +
 * photos) built on the phone with the shared builder and the streaming zip writer. Only the reads of the
 * database go through `queue`; the files are read one at a time and added to the zip as they come,
 * `data.json` last. A file missing from the device is left out, as the API does; any other read failure
 * aborts with a 500.
 *
 * The zip goes to `exportSink` (a file of the device in the native app, a `Blob` by default) piece by
 * piece: every piece of a file is written before the next file is read, so what is held at any time is
 * one file and its zip headers, whatever the size of the whole zip. A failed export discards its target.
 */
export function localDataPortability(
  db: LocalDb,
  { files, exportSink = openMemoryExportSink }: Pick<LocalDeps, 'files' | 'exportSink'>,
  queue: SerialQueue,
): Pick<DataSource['dataPortability'], 'export'> {
  /** The bytes of `key`, or `null` when the file is not on the device. */
  const read = async (key: string, mimeType: string): Promise<Uint8Array | null> => {
    try {
      return await fileBytes(await files.read(key, mimeType));
    } catch (error) {
      if (error instanceof MissingFileError) return null;
      throw problem(500, 'Internal Server Error', 'Could not read a file of the export');
    }
  };

  /** Builds the zip into `sink`; rejects on the first failure, leaving `sink` to the caller. */
  const writeZip = async (sink: LocalExportSink, rows: DataExportInputRows, settings: UserSettings) => {
    // fflate hands the pieces over synchronously and the sink writes them asynchronously: they wait
    // here, and `flush` empties the queue before anything else is read.
    const pending: Uint8Array[] = [];
    const zip = streamDataExportZip((chunk) => pending.push(chunk));
    const flush = async () => {
      for (let chunk = pending.shift(); chunk; chunk = pending.shift()) {
        try {
          await sink.write(chunk);
        } catch {
          throw problem(500, 'Internal Server Error', 'Could not write the export');
        }
      }
    };

    const attachmentIds = new Set<string>();
    for (const row of rows.attachments) {
      const bytes = await read(row.storageKey, row.mimeType);
      if (!bytes) continue;
      zip.addFile(attachmentExportPath(row.id, row.mimeType), bytes);
      attachmentIds.add(row.id);
      await flush();
    }
    const photoVehicleIds = new Set<string>();
    for (const row of rows.vehicles) {
      if (row.photo === null) continue;
      const bytes = await read(row.photo, 'image/webp');
      if (!bytes) continue;
      zip.addFile(photoExportPath(row.id), bytes);
      photoVehicleIds.add(row.id);
      await flush();
    }

    const { document } = buildDataExport({
      rows,
      settings,
      appVersion: LOCAL_APP_VERSION,
      exportedAt: new Date(),
      present: { attachmentIds, photoVehicleIds },
    });
    zip.finish(document);
    await flush();
  };

  return {
    async export(): Promise<ExportedFile> {
      const { rows, settings } = await queue.run(async () => ({
        rows: await loadLocalExportRows(db),
        settings: await localSettings(db).get(),
      }));

      const sink = await exportSink(`ikrive-export-${todayIn(settings.timezone)}.zip`);
      try {
        await writeZip(sink, rows, settings);
        return await sink.close();
      } catch (error) {
        await sink.abort();
        throw error;
      }
    },
  };
}
