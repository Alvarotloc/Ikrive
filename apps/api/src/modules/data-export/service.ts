import { PassThrough, pipeline, type Readable } from 'node:stream';
import { buildDataExport, todayIn } from '@ikrive/shared';
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

  /** Document of the user's data and the files to copy into the zip (see `buildDataExport`). */
  async function build(userId: string) {
    const rows = repo.load(userId);
    const userSettings = settings.get(userId);
    const present = await presentFiles(rows);
    const { document, files } = buildDataExport({
      rows,
      settings: userSettings,
      appVersion: APP_VERSION,
      exportedAt: new Date(),
      present,
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
