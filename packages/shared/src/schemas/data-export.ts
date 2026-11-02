import { z } from 'zod';
import { attachmentExportPath, photoExportPath } from '../domain/data-export';
import {
  ATTACHMENT_MIME_TYPES,
  FUEL_TYPES,
  MAINTENANCE_CATEGORIES,
  ODOMETER_SOURCES,
  VEHICLE_TYPES,
} from '../enums';
import { moneySchema, odometerValueSchema } from './common';
import { userSettingsSchema } from './settings';
import { isoDateSchema } from './vehicles';

/** Version of the `data.json` format inside the export zip. Bump it on breaking changes. */
export const DATA_EXPORT_FORMAT_VERSION = 1;

/**
 * Opaque reference local to the document (the database UUID). Restricted to a safe charset because
 * it is also part of the file paths inside the zip.
 */
const exportIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const timestampSchema = z.iso.datetime();
const nonNegativeIntSchema = z.number().int().min(0);

// No length limits of the forms here: valid old data in the database must not break the export.

const odometerReadingExportSchema = z.object({
  id: exportIdSchema,
  date: isoDateSchema,
  value: odometerValueSchema,
  source: z.enum(ODOMETER_SOURCES),
  createdAt: timestampSchema,
});

const maintenanceScheduleExportSchema = z.object({
  id: exportIdSchema,
  title: z.string(),
  category: z.enum(MAINTENANCE_CATEGORIES),
  intervalMonths: nonNegativeIntSchema.nullable(),
  intervalDistance: nonNegativeIntSchema.nullable(),
  warnDays: nonNegativeIntSchema,
  warnDistance: nonNegativeIntSchema,
  lastDoneDate: isoDateSchema,
  lastDoneOdometer: odometerValueSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

const attachmentExportSchema = z.object({
  id: exportIdSchema,
  originalName: z.string(),
  mimeType: z.enum(ATTACHMENT_MIME_TYPES),
  /** Bytes. */
  size: nonNegativeIntSchema,
  /** Hex SHA-256 of the contents. */
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  /** Path of the file inside the zip: `attachmentExportPath(id, mimeType)`. */
  path: z.string(),
  createdAt: timestampSchema,
});

const maintenanceRecordExportSchema = z.object({
  id: exportIdSchema,
  date: isoDateSchema,
  odometer: odometerValueSchema.nullable(),
  /** `id` of a reading of the same vehicle. */
  odometerReadingId: exportIdSchema.nullable(),
  category: z.enum(MAINTENANCE_CATEGORIES),
  title: z.string(),
  description: z.string().nullable(),
  workshop: z.string().nullable(),
  cost: moneySchema.nullable(),
  includeInReport: z.boolean(),
  /** `id` of a schedule of the same vehicle. */
  scheduleId: exportIdSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  attachments: z.array(attachmentExportSchema),
});

const fuelLogExportSchema = z.object({
  id: exportIdSchema,
  date: isoDateSchema,
  odometer: odometerValueSchema,
  /** `id` of a reading of the same vehicle. */
  odometerReadingId: exportIdSchema.nullable(),
  quantity: z.number().min(0),
  totalPrice: moneySchema,
  pricePerUnit: moneySchema,
  fullTank: z.boolean(),
  missedPrevious: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

const vehicleExportSchema = z.object({
  id: exportIdSchema,
  name: z.string().nullable(),
  make: z.string(),
  model: z.string(),
  version: z.string().nullable(),
  year: z.number().int().nullable(),
  plate: z.string().nullable(),
  vin: z.string().nullable(),
  type: z.enum(VEHICLE_TYPES),
  fuelType: z.enum(FUEL_TYPES),
  purchaseDate: isoDateSchema.nullable(),
  purchasePrice: moneySchema.nullable(),
  purchaseOdometer: odometerValueSchema.nullable(),
  notes: z.string().nullable(),
  soldAt: isoDateSchema.nullable(),
  archivedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  /** Path of the photo inside the zip (`photoExportPath(id)`), or `null` without a photo. */
  photoPath: z.string().nullable(),
  odometerReadings: z.array(odometerReadingExportSchema),
  maintenanceSchedules: z.array(maintenanceScheduleExportSchema),
  maintenanceRecords: z.array(maintenanceRecordExportSchema),
  fuelLogs: z.array(fuelLogExportSchema),
});

const channelFields = {
  enabled: z.boolean(),
  /** Whether the channel had a token; the token itself is never exported. */
  hasToken: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
};

/** Channel config without `token`: unknown keys (a stray `token`) are stripped by `parse`. */
const notificationChannelExportSchema = z.discriminatedUnion('type', [
  z.object({
    ...channelFields,
    type: z.literal('ntfy'),
    config: z.object({ serverUrl: z.string(), topic: z.string() }),
  }),
  z.object({ ...channelFields, type: z.literal('gotify'), config: z.object({ serverUrl: z.string() }) }),
  z.object({
    ...channelFields,
    type: z.literal('apprise'),
    config: z.object({ serverUrl: z.string(), key: z.string(), tag: z.string().nullable().optional() }),
  }),
  z.object({ ...channelFields, type: z.literal('webhook'), config: z.object({ url: z.string() }) }),
]);

type DataExportShape = z.infer<typeof dataExportObjectSchema>;

const dataExportObjectSchema = z.object({
  formatVersion: z.literal(DATA_EXPORT_FORMAT_VERSION),
  /** Version of Ikrive that generated the export. */
  appVersion: z.string().min(1),
  exportedAt: timestampSchema,
  settings: userSettingsSchema,
  notificationChannels: z.array(notificationChannelExportSchema),
  vehicles: z.array(vehicleExportSchema),
});

/**
 * Integrity of the document: unique ids per collection, internal references resolvable inside the
 * same vehicle, every reading linked at most once, and file paths equal to the generated ones (so
 * `../`, absolute paths or foreign ids are rejected by construction).
 */
function checkIntegrity(document: DataExportShape, ctx: z.RefinementCtx) {
  const seen = {
    vehicles: new Set<string>(),
    odometerReadings: new Set<string>(),
    maintenanceSchedules: new Set<string>(),
    maintenanceRecords: new Set<string>(),
    fuelLogs: new Set<string>(),
    attachments: new Set<string>(),
  };
  const linkedReadings = new Set<string>();
  const issue = (message: string, path: (string | number)[]) =>
    ctx.addIssue({ code: 'custom', message, path });
  const unique = (collection: keyof typeof seen, id: string, path: (string | number)[]) => {
    if (seen[collection].has(id)) issue(`Duplicate id in ${collection}`, [...path, 'id']);
    seen[collection].add(id);
  };
  const linkReading = (readings: Set<string>, readingId: string | null, path: (string | number)[]) => {
    if (readingId === null) return;
    if (!readings.has(readingId)) issue('Unknown odometer reading', [...path, 'odometerReadingId']);
    else if (linkedReadings.has(readingId))
      issue('Odometer reading linked twice', [...path, 'odometerReadingId']);
    linkedReadings.add(readingId);
  };

  document.vehicles.forEach((vehicle, v) => {
    const base = ['vehicles', v];
    unique('vehicles', vehicle.id, base);
    if (vehicle.photoPath !== null && vehicle.photoPath !== photoExportPath(vehicle.id)) {
      issue('Invalid photo path', [...base, 'photoPath']);
    }

    const readings = new Set<string>();
    vehicle.odometerReadings.forEach((reading, i) => {
      unique('odometerReadings', reading.id, [...base, 'odometerReadings', i]);
      readings.add(reading.id);
    });
    const schedules = new Set<string>();
    vehicle.maintenanceSchedules.forEach((schedule, i) => {
      unique('maintenanceSchedules', schedule.id, [...base, 'maintenanceSchedules', i]);
      schedules.add(schedule.id);
    });

    vehicle.maintenanceRecords.forEach((record, i) => {
      const path = [...base, 'maintenanceRecords', i];
      unique('maintenanceRecords', record.id, path);
      if (record.scheduleId !== null && !schedules.has(record.scheduleId)) {
        issue('Unknown maintenance schedule', [...path, 'scheduleId']);
      }
      linkReading(readings, record.odometerReadingId, path);
      record.attachments.forEach((attachment, a) => {
        const attachmentPath = [...path, 'attachments', a];
        unique('attachments', attachment.id, attachmentPath);
        if (attachment.path !== attachmentExportPath(attachment.id, attachment.mimeType)) {
          issue('Invalid attachment path', [...attachmentPath, 'path']);
        }
      });
    });

    vehicle.fuelLogs.forEach((fuelLog, i) => {
      const path = [...base, 'fuelLogs', i];
      unique('fuelLogs', fuelLog.id, path);
      linkReading(readings, fuelLog.odometerReadingId, path);
    });
  });
}

/** `data.json` of the export zip (format v1). The import validates the uploaded file against it. */
export const dataExportSchema = dataExportObjectSchema.superRefine(checkIntegrity);
export type DataExport = z.infer<typeof dataExportSchema>;
export type DataExportVehicle = DataExport['vehicles'][number];
export type DataExportMaintenanceRecord = DataExportVehicle['maintenanceRecords'][number];
export type DataExportAttachment = DataExportMaintenanceRecord['attachments'][number];
export type DataExportNotificationChannel = DataExport['notificationChannels'][number];
