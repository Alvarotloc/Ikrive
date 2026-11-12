import { PassThrough, pipeline, type Readable } from 'node:stream';
import {
  attachmentExportPath,
  DATA_EXPORT_FORMAT_VERSION,
  type DataExport,
  dataExportSchema,
  photoExportPath,
  todayIn,
} from '@ikrive/shared';
import type { FastifyBaseLogger } from 'fastify';
import { ZipFile } from 'yazl';
import type { FileStorage } from '../../lib/storage';
import { APP_VERSION } from '../../lib/version';
import type { SettingsService } from '../settings/service';
import type { DataExportRepository, DataExportRows } from './repository';

interface DataExportServiceDeps {
  repo: DataExportRepository;
  settings: Pick<SettingsService, 'get'>;
  storage: Pick<FileStorage, 'exists'> & { read(key: string): Readable };
  log: Pick<FastifyBaseLogger, 'warn' | 'error'>;
}

type Row<K extends keyof DataExportRows> = DataExportRows[K][number];

/** A file to copy into the zip: its storage key and its path inside the zip. */
interface ZipFileEntry {
  key: string;
  path: string;
}

const iso = (date: Date) => date.toISOString();

/** Groups rows by a key, keeping their order. */
function groupBy<T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

/** The channel config without its token; `hasToken` keeps whether there was one. */
function channelOf(row: Row<'notificationChannels'>) {
  const { token, ...config } = { token: undefined, ...row.config };
  return {
    type: row.type,
    enabled: row.enabled,
    hasToken: Boolean(token),
    config,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function createDataExportService({ repo, settings, storage, log }: DataExportServiceDeps) {
  /** Attachments and photos whose file is on disk; missing ones are skipped with a warning. */
  async function presentFiles(rows: DataExportRows) {
    const attachmentIds = new Set<string>();
    for (const attachment of rows.attachments) {
      if (await storage.exists(attachment.storageKey)) attachmentIds.add(attachment.id);
      else log.warn({ attachmentId: attachment.id }, 'export: missing file');
    }
    const photoVehicleIds = new Set<string>();
    for (const vehicle of rows.vehicles) {
      if (vehicle.photo === null) continue;
      if (await storage.exists(vehicle.photo)) photoVehicleIds.add(vehicle.id);
      else log.warn({ vehicleId: vehicle.id }, 'export: missing file');
    }
    return { attachmentIds, photoVehicleIds };
  }

  /**
   * Maps the rows to the document, dropping every owner id and storage key. Returns, next to it,
   * the files to copy into the zip.
   */
  async function build(userId: string) {
    const rows = repo.load(userId);
    const userSettings = settings.get(userId);
    const { attachmentIds, photoVehicleIds } = await presentFiles(rows);
    const files: ZipFileEntry[] = [];

    const readingsOf = groupBy(rows.odometerReadings, (row) => row.vehicleId);
    const schedulesOf = groupBy(rows.maintenanceSchedules, (row) => row.vehicleId);
    const recordsOf = groupBy(rows.maintenanceRecords, (row) => row.vehicleId);
    const fuelLogsOf = groupBy(rows.fuelLogs, (row) => row.vehicleId);
    const attachmentsOf = groupBy(
      rows.attachments.filter((row) => attachmentIds.has(row.id)),
      (row) => row.entityId,
    );

    const attachmentOf = (row: Row<'attachments'>) => {
      const path = attachmentExportPath(row.id, row.mimeType);
      files.push({ key: row.storageKey, path });
      return {
        id: row.id,
        originalName: row.originalName,
        mimeType: row.mimeType,
        size: row.size,
        sha256: row.sha256,
        path,
        createdAt: iso(row.createdAt),
      };
    };

    const vehicleOf = (row: Row<'vehicles'>) => {
      let photoPath: string | null = null;
      if (row.photo !== null && photoVehicleIds.has(row.id)) {
        photoPath = photoExportPath(row.id);
        files.push({ key: row.photo, path: photoPath });
      }
      return {
        id: row.id,
        name: row.name,
        make: row.make,
        model: row.model,
        version: row.version,
        year: row.year,
        plate: row.plate,
        vin: row.vin,
        type: row.type,
        fuelType: row.fuelType,
        purchaseDate: row.purchaseDate,
        purchasePrice: row.purchasePrice,
        purchaseOdometer: row.purchaseOdometer,
        notes: row.notes,
        soldAt: row.soldAt,
        archivedAt: row.archivedAt ? iso(row.archivedAt) : null,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
        photoPath,
        odometerReadings: (readingsOf.get(row.id) ?? []).map((reading) => ({
          id: reading.id,
          date: reading.date,
          value: reading.value,
          source: reading.source,
          createdAt: iso(reading.createdAt),
        })),
        maintenanceSchedules: (schedulesOf.get(row.id) ?? []).map((schedule) => ({
          id: schedule.id,
          title: schedule.title,
          category: schedule.category,
          intervalMonths: schedule.intervalMonths,
          intervalDistance: schedule.intervalDistance,
          warnDays: schedule.warnDays,
          warnDistance: schedule.warnDistance,
          lastDoneDate: schedule.lastDoneDate,
          lastDoneOdometer: schedule.lastDoneOdometer,
          createdAt: iso(schedule.createdAt),
          updatedAt: iso(schedule.updatedAt),
        })),
        maintenanceRecords: (recordsOf.get(row.id) ?? []).map((record) => ({
          id: record.id,
          date: record.date,
          odometer: record.odometer,
          odometerReadingId: record.odometerReadingId,
          category: record.category,
          title: record.title,
          description: record.description,
          workshop: record.workshop,
          cost: record.cost,
          includeInReport: record.includeInReport,
          scheduleId: record.scheduleId,
          createdAt: iso(record.createdAt),
          updatedAt: iso(record.updatedAt),
          attachments: (attachmentsOf.get(record.id) ?? []).map(attachmentOf),
        })),
        fuelLogs: (fuelLogsOf.get(row.id) ?? []).map((fuelLog) => ({
          id: fuelLog.id,
          date: fuelLog.date,
          odometer: fuelLog.odometer,
          odometerReadingId: fuelLog.odometerReadingId,
          quantity: fuelLog.quantity,
          totalPrice: fuelLog.totalPrice,
          pricePerUnit: fuelLog.pricePerUnit,
          fullTank: fuelLog.fullTank,
          missedPrevious: fuelLog.missedPrevious,
          createdAt: iso(fuelLog.createdAt),
          updatedAt: iso(fuelLog.updatedAt),
        })),
      };
    };

    // Defense in depth: the document must satisfy the schema the import checks, and unknown keys go.
    const document: DataExport = dataExportSchema.parse({
      formatVersion: DATA_EXPORT_FORMAT_VERSION,
      appVersion: APP_VERSION,
      exportedAt: iso(new Date()),
      settings: userSettings,
      notificationChannels: rows.notificationChannels.map(channelOf),
      vehicles: rows.vehicles.map(vehicleOf),
    });
    return { document, files, timezone: userSettings.timezone };
  }

  return {
    /**
     * Document of the user's data and the zip as a stream: `data.json` plus every referenced file.
     * No file is opened until the stream is consumed, and then one at a time.
     */
    async export(userId: string) {
      const { document, files, timezone } = await build(userId);
      const zip = new ZipFile();
      // A Readable we can destroy: when it is destroyed (client abort, failed file) the pipeline
      // destroys the zip output too. Errors reach the route through `stream`, which logs them.
      const stream = new PassThrough();
      pipeline(zip.outputStream, stream, () => {});
      let current: Readable | null = null;
      // `pipe` does not propagate destruction: close the file being copied when the output goes away.
      stream.once('close', () => current?.destroy());
      zip.addBuffer(Buffer.from(JSON.stringify(document, null, 2)), 'data.json');
      // yazl asks for the next stream as soon as the previous one ends, but a file descriptor is only
      // released on `close`: waiting for it keeps at most one file open at a time.
      let previousClosed = Promise.resolve();
      for (const { key, path } of files) {
        // PDFs and images are already compressed: storing them saves CPU for nothing lost.
        zip.addReadStreamLazy(path, { compress: false }, (callback) => {
          previousClosed = previousClosed.then(
            () =>
              new Promise<void>((resolve) => {
                if (stream.destroyed) return resolve();
                const file = storage.read(key);
                current = file;
                file.once('close', () => {
                  current = null;
                  resolve();
                });
                // yazl only pipes the file, which does not forward errors: without this listener a
                // failed open or read (deleted file, EACCES) would be an unhandled 'error' event and
                // crash the process. The download is cut short instead (truncated zip).
                file.once('error', (error) => {
                  log.error({ err: error, path }, 'export: file read failed');
                  stream.destroy(error);
                  resolve();
                });
                callback(null, file);
              }),
          );
        });
      }
      zip.end();
      return {
        fileName: `ikrive-export-${todayIn(timezone)}.zip`,
        document,
        stream,
      };
    },
  };
}

export type DataExportService = ReturnType<typeof createDataExportService>;
