import type { NotificationChannelType } from '../enums';
import {
  DATA_EXPORT_FORMAT_VERSION,
  type DataExport,
  type DataExportAttachment,
  type DataExportMaintenanceRecord,
  type DataExportVehicle,
  dataExportSchema,
} from '../schemas/data-export';
import type { UserSettings } from '../schemas/settings';
import { attachmentExportPath, photoExportPath } from './data-export';

// Structural row types: this package cannot import `@ikrive/db` (it depends on us). They are the
// document's fields with `Date` timestamps plus the keys the document drops (parent ids, storage
// keys). Rows with more columns (`ownerId`, `lastError`…) are assignable as well.

type Reading = DataExportVehicle['odometerReadings'][number];
type Schedule = DataExportVehicle['maintenanceSchedules'][number];
type FuelLog = DataExportVehicle['fuelLogs'][number];

interface ChildOfVehicle {
  vehicleId: string;
}

export type DataExportVehicleRow = Omit<
  DataExportVehicle,
  | 'photoPath'
  | 'odometerReadings'
  | 'maintenanceSchedules'
  | 'maintenanceRecords'
  | 'fuelLogs'
  | 'archivedAt'
  | 'createdAt'
  | 'updatedAt'
> & {
  /** Storage key of the photo, or `null` without one. */
  photo: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
export type DataExportReadingRow = Omit<Reading, 'createdAt'> & ChildOfVehicle & { createdAt: Date };
export type DataExportScheduleRow = Omit<Schedule, 'createdAt' | 'updatedAt'> &
  ChildOfVehicle & { createdAt: Date; updatedAt: Date };
export type DataExportRecordRow = Omit<
  DataExportMaintenanceRecord,
  'attachments' | 'createdAt' | 'updatedAt'
> &
  ChildOfVehicle & { createdAt: Date; updatedAt: Date };
export type DataExportFuelLogRow = Omit<FuelLog, 'createdAt' | 'updatedAt'> &
  ChildOfVehicle & { createdAt: Date; updatedAt: Date };
export type DataExportAttachmentRow = Omit<DataExportAttachment, 'path' | 'createdAt'> & {
  /** Id of the maintenance record it belongs to. */
  entityId: string;
  storageKey: string;
  createdAt: Date;
};
export interface DataExportChannelRow {
  type: NotificationChannelType;
  enabled: boolean;
  /** Config as stored: it may include the token in clear. */
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/** Everything a user exports, one list per table, in export order. */
export interface DataExportInputRows {
  vehicles: DataExportVehicleRow[];
  odometerReadings: DataExportReadingRow[];
  maintenanceSchedules: DataExportScheduleRow[];
  maintenanceRecords: DataExportRecordRow[];
  fuelLogs: DataExportFuelLogRow[];
  attachments: DataExportAttachmentRow[];
  notificationChannels: DataExportChannelRow[];
}

/** A file to copy into the zip: its storage key and its path inside the zip. */
export interface DataExportFile {
  key: string;
  path: string;
}

export interface BuildDataExportInput {
  rows: DataExportInputRows;
  settings: UserSettings;
  appVersion: string;
  exportedAt: Date;
  /** Attachments and vehicle photos whose file is available; the rest are left out. */
  present: { attachmentIds: ReadonlySet<string>; photoVehicleIds: ReadonlySet<string> };
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
function channelOf(row: DataExportChannelRow) {
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

/**
 * Maps the rows to the `data.json` document, dropping every owner id and storage key. Returns, next
 * to it, the files to copy into the zip. Used by `GET /api/me/export` and by the local mode export.
 */
export function buildDataExport({ rows, settings, appVersion, exportedAt, present }: BuildDataExportInput): {
  document: DataExport;
  files: DataExportFile[];
} {
  const files: DataExportFile[] = [];

  const readingsOf = groupBy(rows.odometerReadings, (row) => row.vehicleId);
  const schedulesOf = groupBy(rows.maintenanceSchedules, (row) => row.vehicleId);
  const recordsOf = groupBy(rows.maintenanceRecords, (row) => row.vehicleId);
  const fuelLogsOf = groupBy(rows.fuelLogs, (row) => row.vehicleId);
  const attachmentsOf = groupBy(
    rows.attachments.filter((row) => present.attachmentIds.has(row.id)),
    (row) => row.entityId,
  );

  const attachmentOf = (row: DataExportAttachmentRow) => {
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

  const vehicleOf = (row: DataExportVehicleRow) => {
    let photoPath: string | null = null;
    if (row.photo !== null && present.photoVehicleIds.has(row.id)) {
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
    appVersion,
    exportedAt: iso(exportedAt),
    settings,
    notificationChannels: rows.notificationChannels.map(channelOf),
    vehicles: rows.vehicles.map(vehicleOf),
  });
  return { document, files };
}
