import { createHash, randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DATA_EXPORT_FORMAT_VERSION,
  type DataExport,
  type DataExportAttachment,
  type DataExportNotificationChannel,
  type DataImportSummary,
  dataExportSchema,
  detectAttachmentType,
  findMatchingVehicles,
  notificationChannelConfigSchema,
  sanitizeFileName,
} from '@ikrive/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { Entry } from 'yauzl';
import {
  BadRequestError,
  ConflictError,
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
} from '../../lib/errors';
import { assertDecodableImage } from '../../lib/images';
import type { FileStorage } from '../../lib/storage';
import { openZip, type ZipReader } from '../../lib/zip-reader';
import type { SettingsService } from '../settings/service';
import { type DataImportRepository, duplicateImportError, type ImportPlan } from './repository';

export interface ImportLimits {
  /** Size of the uploaded zip. */
  zipBytes: number;
  /** Declared uncompressed size of `data.json` plus every referenced file. */
  totalBytes: number;
  /** Declared uncompressed size of each referenced file. */
  fileBytes: number;
  /** Declared uncompressed size of `data.json`. */
  dataJsonBytes: number;
  /** Entries in the zip. */
  entries: number;
}

interface DataImportServiceDeps {
  repo: DataImportRepository;
  settings: Pick<SettingsService, 'get'>;
  storage: Pick<FileStorage, 'save' | 'remove'>;
  /** Where the route stores the uploaded zip while it is imported. */
  tmpDir: string;
  limits: ImportLimits;
  log: Pick<FastifyBaseLogger, 'error'>;
}

const DATA_JSON = 'data.json';
const MAX_SCHEMA_ERRORS = 20;
/** Settings the stored values depend on: importing in other ones would corrupt them silently. */
const UNIT_SETTINGS = ['currency', 'distanceUnit', 'volumeUnit'] as const;
const UNSUPPORTED_ATTACHMENT = 'Only PDF, JPEG, PNG and WebP files are allowed';

const MIB = 1024 * 1024;
const mib = (bytes: number) => `${Math.round((bytes / MIB) * 10) / 10} MiB`;

/** A file the document references: its entry in the zip and what it is. */
type ReferencedFile =
  | { path: string; entry: Entry; kind: 'attachment'; attachment: DataExportAttachment }
  | { path: string; entry: Entry; kind: 'photo' };

/** Storage keys of the saved files, by their path in the zip. */
type StoredFiles = Map<string, { key: string; extension: string }>;

const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const date = (value: string) => new Date(value);

/** `JSON.parse`, then the format version, then the schema (in that order, for clear errors). */
function parseDocument(data: Buffer): DataExport {
  let json: unknown;
  try {
    json = JSON.parse(data.toString('utf8'));
  } catch {
    throw new BadRequestError(`${DATA_JSON} is not valid JSON`);
  }
  const version =
    typeof json === 'object' && json !== null && 'formatVersion' in json ? json.formatVersion : undefined;
  if (version !== DATA_EXPORT_FORMAT_VERSION) {
    const received = version === undefined ? 'missing' : JSON.stringify(version);
    throw new BadRequestError(
      `Unsupported export format version ${received} (supported: ${DATA_EXPORT_FORMAT_VERSION})`,
    );
  }
  const result = dataExportSchema.safeParse(json);
  if (!result.success) {
    throw new BadRequestError(
      `${DATA_JSON} does not match the export format`,
      result.error.issues.slice(0, MAX_SCHEMA_ERRORS).map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    );
  }
  return result.data;
}

/**
 * Rows with new ids for everything in the document. References (`scheduleId`, `odometerReadingId`,
 * the attachments' `entityId`) are translated through the old → new id maps; the rest of the
 * fields and the timestamps are kept as they are.
 */
function buildPlan(document: DataExport, stored: StoredFiles) {
  const plan: ImportPlan = {
    vehicles: [],
    odometerReadings: [],
    maintenanceSchedules: [],
    maintenanceRecords: [],
    fuelLogs: [],
    attachments: [],
    notificationChannels: [],
  };
  let photos = 0;
  let skippedChannels = 0;

  for (const vehicle of document.vehicles) {
    const vehicleId = randomUUID();
    const photo = vehicle.photoPath === null ? null : (stored.get(vehicle.photoPath)?.key ?? null);
    if (photo !== null) photos += 1;
    plan.vehicles.push({
      id: vehicleId,
      name: vehicle.name,
      make: vehicle.make,
      model: vehicle.model,
      version: vehicle.version,
      year: vehicle.year,
      plate: vehicle.plate,
      vin: vehicle.vin,
      type: vehicle.type,
      fuelType: vehicle.fuelType,
      purchaseDate: vehicle.purchaseDate,
      purchasePrice: vehicle.purchasePrice,
      purchaseOdometer: vehicle.purchaseOdometer,
      notes: vehicle.notes,
      photo,
      soldAt: vehicle.soldAt,
      archivedAt: vehicle.archivedAt === null ? null : date(vehicle.archivedAt),
      createdAt: date(vehicle.createdAt),
      updatedAt: date(vehicle.updatedAt),
    });

    // The schema guarantees every reference resolves inside the same vehicle.
    const readingIds = new Map<string, string>();
    for (const reading of vehicle.odometerReadings) {
      const id = randomUUID();
      readingIds.set(reading.id, id);
      plan.odometerReadings.push({
        id,
        vehicleId,
        date: reading.date,
        value: reading.value,
        source: reading.source,
        createdAt: date(reading.createdAt),
      });
    }
    const readingOf = (oldId: string | null) => (oldId === null ? null : (readingIds.get(oldId) ?? null));

    const scheduleIds = new Map<string, string>();
    for (const schedule of vehicle.maintenanceSchedules) {
      const id = randomUUID();
      scheduleIds.set(schedule.id, id);
      plan.maintenanceSchedules.push({
        id,
        vehicleId,
        title: schedule.title,
        category: schedule.category,
        intervalMonths: schedule.intervalMonths,
        intervalDistance: schedule.intervalDistance,
        warnDays: schedule.warnDays,
        warnDistance: schedule.warnDistance,
        lastDoneDate: schedule.lastDoneDate,
        lastDoneOdometer: schedule.lastDoneOdometer,
        createdAt: date(schedule.createdAt),
        updatedAt: date(schedule.updatedAt),
      });
    }

    for (const record of vehicle.maintenanceRecords) {
      const id = randomUUID();
      plan.maintenanceRecords.push({
        id,
        vehicleId,
        date: record.date,
        odometer: record.odometer,
        odometerReadingId: readingOf(record.odometerReadingId),
        category: record.category,
        title: record.title,
        description: record.description,
        workshop: record.workshop,
        cost: record.cost,
        includeInReport: record.includeInReport,
        scheduleId: record.scheduleId === null ? null : (scheduleIds.get(record.scheduleId) ?? null),
        createdAt: date(record.createdAt),
        updatedAt: date(record.updatedAt),
      });
      for (const attachment of record.attachments) {
        const file = stored.get(attachment.path);
        if (!file) throw new Error(`File of ${attachment.path} not stored`);
        plan.attachments.push({
          id: randomUUID(),
          entityType: 'maintenance',
          entityId: id,
          originalName: sanitizeFileName(attachment.originalName, file.extension),
          mimeType: attachment.mimeType,
          size: attachment.size,
          sha256: attachment.sha256,
          storageKey: file.key,
          createdAt: date(attachment.createdAt),
        });
      }
    }

    for (const fuelLog of vehicle.fuelLogs) {
      plan.fuelLogs.push({
        id: randomUUID(),
        vehicleId,
        date: fuelLog.date,
        odometer: fuelLog.odometer,
        odometerReadingId: readingOf(fuelLog.odometerReadingId),
        quantity: fuelLog.quantity,
        totalPrice: fuelLog.totalPrice,
        pricePerUnit: fuelLog.pricePerUnit,
        fullTank: fuelLog.fullTank,
        missedPrevious: fuelLog.missedPrevious,
        createdAt: date(fuelLog.createdAt),
        updatedAt: date(fuelLog.updatedAt),
      });
    }
  }

  for (const channel of document.notificationChannels) {
    const row = channelRow(channel);
    if (row) plan.notificationChannels.push(row);
    else skippedChannels += 1;
  }

  return { plan, photos, skippedChannels };
}

/**
 * A channel without a token, revalidated with the strict schema (the export one only requires
 * strings: no `file:` URL or one with credentials gets in). `null` when it has to be skipped.
 */
function channelRow(
  channel: DataExportNotificationChannel,
): ImportPlan['notificationChannels'][number] | null {
  if (channel.hasToken) return null;
  const result = notificationChannelConfigSchema.safeParse({ type: channel.type, config: channel.config });
  if (!result.success) return null;
  return {
    id: randomUUID(),
    type: result.data.type,
    config: result.data.config,
    enabled: channel.enabled,
    createdAt: date(channel.createdAt),
    updatedAt: date(channel.updatedAt),
  };
}

/** Every file the document references, found in the zip index (400 when one is missing). */
function referencedFiles(document: DataExport, zip: ZipReader): ReferencedFile[] {
  const find = (path: string) => {
    const entry = zip.entries.get(path);
    if (!entry) throw new BadRequestError(`The zip does not contain ${path}, referenced by ${DATA_JSON}`);
    return entry;
  };
  const files: ReferencedFile[] = [];
  for (const vehicle of document.vehicles) {
    if (vehicle.photoPath !== null) {
      files.push({ path: vehicle.photoPath, entry: find(vehicle.photoPath), kind: 'photo' });
    }
    for (const record of vehicle.maintenanceRecords) {
      for (const attachment of record.attachments) {
        files.push({ path: attachment.path, entry: find(attachment.path), kind: 'attachment', attachment });
      }
    }
  }
  return files;
}

export function createDataImportService({
  repo,
  settings,
  storage,
  tmpDir,
  limits,
  log,
}: DataImportServiceDeps) {
  /** Declared sizes, checked before any of those entries is decompressed. */
  function checkDeclaredSizes(dataJson: Entry, files: ReferencedFile[]) {
    let total = dataJson.uncompressedSize;
    for (const { path, entry } of files) {
      if (entry.uncompressedSize > limits.fileBytes) {
        throw new PayloadTooLargeError(`${path} is larger than ${mib(limits.fileBytes)}`);
      }
      total += entry.uncompressedSize;
    }
    if (total > limits.totalBytes) {
      throw new PayloadTooLargeError(`The files of the export add up to more than ${mib(limits.totalBytes)}`);
    }
  }

  function checkSettings(userId: string, document: DataExport) {
    const current = settings.get(userId);
    const different = UNIT_SETTINGS.filter((key) => document.settings[key] !== current[key]);
    if (different.length > 0) {
      const list = different
        .map((key) => `${key} (export: ${document.settings[key]}, yours: ${current[key]})`)
        .join(', ');
      throw new ConflictError(`The export uses different settings: ${list}. Change them and import again.`);
    }
  }

  /** Validates a file like a normal upload and saves it; returns its new storage key and extension. */
  async function storeFile(file: ReferencedFile, data: Buffer, written: string[]) {
    const type = detectAttachmentType(data);
    if (file.kind === 'photo') {
      const valid =
        type?.mimeType === 'image/webp' &&
        (await assertDecodableImage(data).then(
          () => true,
          () => false,
        ));
      if (!valid) throw new UnsupportedMediaTypeError(`${file.path} is not a valid WebP image`);
      const key = await storage.save('vehicles', data, 'webp');
      written.push(key);
      return { key, extension: 'webp' };
    }

    const { attachment } = file;
    if (!type) throw new UnsupportedMediaTypeError(`${file.path}: ${UNSUPPORTED_ATTACHMENT}`);
    if (type.mimeType !== attachment.mimeType) {
      throw new UnsupportedMediaTypeError(`${file.path} is not a ${attachment.mimeType} file`);
    }
    if (type.mimeType.startsWith('image/')) {
      await assertDecodableImage(data).catch(() => {
        throw new UnsupportedMediaTypeError(`${file.path} is not a valid image`);
      });
    }
    if (data.length !== attachment.size || sha256(data) !== attachment.sha256) {
      throw new BadRequestError(`${file.path} does not match its size or sha256 in ${DATA_JSON}`);
    }
    const key = await storage.save('attachments', data, type.extension);
    written.push(key);
    return { key, extension: type.extension };
  }

  return {
    limits,

    /** New path, inside `tmpDir`, for an uploaded zip. The caller removes the file. */
    async tempZipPath(): Promise<string> {
      await mkdir(tmpDir, { recursive: true });
      return join(tmpDir, `import-${randomUUID()}.zip`);
    },

    /**
     * Adds the contents of an export zip to the user's account, all or nothing: files are saved
     * first, one at a time, then every row goes in one transaction; if anything fails the saved
     * files are removed. Nothing is notified: the jobs pick the new data up on their next run.
     */
    async import(userId: string, zipPath: string): Promise<DataImportSummary> {
      const zip = await openZip(zipPath, { entries: limits.entries });
      try {
        const dataJson = zip.entries.get(DATA_JSON);
        if (!dataJson) throw new BadRequestError(`The zip does not contain ${DATA_JSON} at its root`);
        if (dataJson.uncompressedSize > limits.dataJsonBytes) {
          throw new PayloadTooLargeError(`${DATA_JSON} is larger than ${mib(limits.dataJsonBytes)}`);
        }
        const data = await zip.read(dataJson, limits.dataJsonBytes);
        const dataSha256 = sha256(data);
        const document = parseDocument(data);
        // Before the settings: if they changed since the first import, what matters is that it is
        // already there. Only a shortcut: the unique index in `repo.insert` is the guarantee.
        const importedAt = repo.hasImport(userId, dataSha256);
        if (importedAt) throw duplicateImportError(importedAt);
        checkSettings(userId, document);
        // Entries the document does not reference are never opened.
        const files = referencedFiles(document, zip);
        checkDeclaredSizes(dataJson, files);

        const written: string[] = [];
        try {
          const stored: StoredFiles = new Map();
          for (const file of files) {
            const data = await zip.read(file.entry, limits.fileBytes);
            stored.set(file.path, await storeFile(file, data, written));
          }
          const { plan, photos, skippedChannels } = buildPlan(document, stored);
          // Read before inserting: only what the account had before this import is compared.
          const existing = repo.vehicles(userId);
          const counts = repo.insert(userId, plan, dataSha256);
          return {
            ...counts,
            photos,
            skipped: { notificationChannels: skippedChannels },
            matchingVehicles: findMatchingVehicles(
              plan.vehicles.map(({ id, name, make, model, plate, vin }) => ({
                id,
                name: name ?? null,
                make,
                model,
                plate: plate ?? null,
                vin: vin ?? null,
              })),
              existing,
            ),
          };
        } catch (error) {
          // The transaction already rolled back: only the saved files are left to undo.
          for (const key of written) {
            await storage.remove(key).catch((removeError: unknown) => {
              log.error({ err: removeError, key }, 'import: could not remove a saved file');
            });
          }
          throw error;
        }
      } finally {
        zip.close();
      }
    },
  };
}

export type DataImportService = ReturnType<typeof createDataImportService>;
