import { LOCAL_USER_ID } from '@ikrive/db';
import {
  attachments,
  expenses,
  fuelLogs,
  maintenanceRecords,
  maintenanceSchedules,
  odometerReadings,
  vehicleDocuments,
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
import { and, asc, eq, getTableColumns, inArray, or, type SQL, sql } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { DataSource, ExportedFile } from '../types';
import type { LocalDb } from './database';
import { type LocalExportSink, openMemoryExportSink } from './export-sink';
import { type LocalDeps, MissingFileError } from './files';
import { problem } from './problems';
import type { SerialQueue } from './serial';
import { localSettings } from './settings';

const buildVersion: unknown = import.meta.env.VITE_IKRIVE_VERSION;

/** `appVersion` of the local export: the build's version, with the API's fallback when it is not set. */
export const LOCAL_APP_VERSION =
  typeof buildVersion === 'string' && buildVersion ? buildVersion : '0.0.0-dev';

/**
 * Size of the pieces the export reads each file in (`LocalFileStore.readChunks`): the most of a file held
 * in memory at once, whatever its size. Larger pieces mean fewer calls to the native bridge, but the
 * plugin's read joins its 8 KiB blocks by copying a `String`, which costs more per byte the larger the piece.
 */
export const EXPORT_READ_BYTES = 256 * 1024;

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

  const expenseRows = await db
    .select(getTableColumns(expenses))
    .from(expenses)
    .innerJoin(vehicles, eq(vehicles.id, expenses.vehicleId))
    .where(owned)
    .orderBy(asc(expenses.date), asc(expenses.createdAt), rowid(expenses))
    .all();

  const documentRows = await db
    .select(getTableColumns(vehicleDocuments))
    .from(vehicleDocuments)
    .innerJoin(vehicles, eq(vehicles.id, vehicleDocuments.vehicleId))
    .where(owned)
    .orderBy(asc(vehicleDocuments.createdAt), rowid(vehicleDocuments))
    .all();

  const ownedRecordIds = db
    .select({ id: maintenanceRecords.id })
    .from(maintenanceRecords)
    .innerJoin(vehicles, eq(vehicles.id, maintenanceRecords.vehicleId))
    .where(owned);
  const ownedDocumentIds = db
    .select({ id: vehicleDocuments.id })
    .from(vehicleDocuments)
    .innerJoin(vehicles, eq(vehicles.id, vehicleDocuments.vehicleId))
    .where(owned);
  const files = await db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.ownerId, LOCAL_USER_ID),
        or(
          and(eq(attachments.entityType, 'maintenance'), inArray(attachments.entityId, ownedRecordIds)),
          and(eq(attachments.entityType, 'document'), inArray(attachments.entityId, ownedDocumentIds)),
        ),
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
    expenses: expenseRows,
    documents: documentRows,
    attachments: files,
    notificationChannels: [],
  };
}

/**
 * `dataPortability` of the local `DataSource`: the export zip of the API (`data.json` + attachments +
 * photos) built on the phone with the shared builder and the streaming zip writer. Only the reads of the
 * database go through `queue`; the files are read one at a time, in pieces of `EXPORT_READ_BYTES`, and
 * added to the zip as they come, `data.json` last. A file missing from the device is left out, as the API
 * does; any other read failure aborts with a 500.
 *
 * The zip goes to `exportSink` (a file of the device in the native app, a `Blob` by default) piece by
 * piece: every piece of the zip is written before the next piece of a file is read, so what is held at any
 * time is one piece and its zip headers, whatever the size of the files or of the whole zip. A failed
 * export discards its target.
 */
export function localDataPortability(
  db: LocalDb,
  { files, exportSink = openMemoryExportSink }: Pick<LocalDeps, 'files' | 'exportSink'>,
  queue: SerialQueue,
): Pick<DataSource['dataPortability'], 'export'> {
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

    const readFailed = () => problem(500, 'Internal Server Error', 'Could not read a file of the export');
    /** Next piece of `chunks`; a failure of the store is the export's read 500. */
    const nextChunk = async (chunks: AsyncIterator<Uint8Array>) => {
      try {
        return await chunks.next();
      } catch {
        throw readFailed();
      }
    };

    /**
     * Copies the file of `key` to the zip entry `path`, a piece at a time: each piece is written to the
     * sink before the next one is read. `false` when the file is not on the device (nothing is added).
     */
    const copyFile = async (path: string, key: string): Promise<boolean> => {
      const chunks = files.readChunks(key, EXPORT_READ_BYTES)[Symbol.asyncIterator]();
      let next: IteratorResult<Uint8Array>;
      try {
        next = await chunks.next();
      } catch (error) {
        if (error instanceof MissingFileError) return false;
        throw readFailed();
      }
      const entry = zip.openFile(path);
      while (!next.done) {
        entry.push(next.value);
        await flush();
        next = await nextChunk(chunks);
      }
      entry.push(new Uint8Array(0), true);
      await flush();
      return true;
    };

    const attachmentIds = new Set<string>();
    for (const row of rows.attachments) {
      if (await copyFile(attachmentExportPath(row.id, row.mimeType), row.storageKey)) {
        attachmentIds.add(row.id);
      }
    }
    const photoVehicleIds = new Set<string>();
    for (const row of rows.vehicles) {
      if (row.photo === null) continue;
      if (await copyFile(photoExportPath(row.id), row.photo)) photoVehicleIds.add(row.id);
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
