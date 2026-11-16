import { LOCAL_USER_ID } from '@ikrive/db';
import { attachments, maintenanceRecords, odometerReadings, vehicles } from '@ikrive/db/schema';
import {
  archivedAtAfterUpdate,
  canDeleteOdometerReading,
  createOdometerReadingSchema,
  createVehicleSchema,
  detectPhotoFormat,
  initialOdometerReading,
  type OdometerReading,
  odometerConflictMessage,
  updateVehicleSchema,
  type Vehicle,
  type VehicleStatus,
  validateOdometerWrite,
  vehicleStatus,
} from '@ikrive/shared';
import { and, desc, eq, inArray, isNotNull, isNull, type SQL } from 'drizzle-orm';
import type { DataSource } from '../types';
import type { LocalDb } from './database';
import { assertUploadSize, assertWebp, fileBytes, type LocalDeps, localPhotoUrl, removeFiles } from './files';
import { badRequest, conflict, notFound, parseInput } from './problems';
import { localToday } from './settings';

export type VehicleRow = typeof vehicles.$inferSelect;
type OdometerReadingRow = typeof odometerReadings.$inferSelect;

/** Same filters as the API's `vehicles/repository.ts`. */
const statusFilter: Record<VehicleStatus, SQL | undefined> = {
  active: and(isNull(vehicles.soldAt), isNull(vehicles.archivedAt)),
  archived: and(isNull(vehicles.soldAt), isNotNull(vehicles.archivedAt)),
  sold: isNotNull(vehicles.soldAt),
};

/** The local user's vehicle, or a 404 problem as the API reports a missing one. */
export async function requireVehicle(db: LocalDb, id: string): Promise<VehicleRow> {
  const vehicle = await db
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.id, id), eq(vehicles.ownerId, LOCAL_USER_ID)))
    .get();
  if (!vehicle) throw notFound('Vehicle not found');
  return vehicle;
}

/** The vehicle's readings, newest first (by date, then by value). */
export function listReadings(db: LocalDb, vehicleId: string): Promise<OdometerReadingRow[]> {
  return db
    .select()
    .from(odometerReadings)
    .where(eq(odometerReadings.vehicleId, vehicleId))
    .orderBy(desc(odometerReadings.date), desc(odometerReadings.value))
    .all();
}

const readingToDto = ({ createdAt, ...reading }: OdometerReadingRow): OdometerReading => ({
  ...reading,
  createdAt: createdAt.toISOString(),
});

async function toDto(db: LocalDb, row: VehicleRow): Promise<Vehicle> {
  const { ownerId: _ownerId, photo: _photo, archivedAt, createdAt, updatedAt, ...fields } = row;
  const [latest] = await listReadings(db, row.id);
  return {
    ...fields,
    archivedAt: archivedAt?.toISOString() ?? null,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    status: vehicleStatus(row),
    photoUrl: row.photo ? localPhotoUrl({ id: row.id, photo: row.photo }) : null,
    odometer: latest ? { value: latest.value, date: latest.date } : null,
  };
}

const PHOTO_FOLDER = 'vehicles';
const UNSUPPORTED_PHOTO = 'The file is not a supported image (JPEG, PNG, WebP, AVIF, GIF or TIFF)';

/** `vehicles` of the local `DataSource`; the photo is recoded to WebP and kept in the local store. */
export function localVehicles(db: LocalDb, { files, images }: LocalDeps): DataSource['vehicles'] {
  const setPhotoKey = (id: string, photo: string | null) =>
    db.update(vehicles).set({ photo }).where(eq(vehicles.id, id)).returning().get();

  return {
    async list(status) {
      const rows = await db
        .select()
        .from(vehicles)
        .where(and(eq(vehicles.ownerId, LOCAL_USER_ID), status === 'all' ? undefined : statusFilter[status]))
        .orderBy(desc(vehicles.createdAt))
        .all();
      const dtos: Vehicle[] = [];
      for (const row of rows) dtos.push(await toDto(db, row));
      return dtos;
    },

    async get(id) {
      return toDto(db, await requireVehicle(db, id));
    },

    async create(input) {
      const { currentOdometer, ...fields } = parseInput(createVehicleSchema, input);
      const firstReading = initialOdometerReading(currentOdometer, await localToday(db));
      const vehicle = await db.transaction(async (tx) => {
        const created = await tx
          .insert(vehicles)
          .values({ ...fields, ownerId: LOCAL_USER_ID })
          .returning()
          .get();
        if (firstReading) {
          await tx.insert(odometerReadings).values({ ...firstReading, vehicleId: created.id });
        }
        return created;
      });
      return toDto(db, vehicle);
    },

    async update(id, changes) {
      const { archived, ...fields } = parseInput(updateVehicleSchema, changes);
      const current = await requireVehicle(db, id);
      const archivedAt = archivedAtAfterUpdate(current.archivedAt, archived, new Date());
      const updated = await db
        .update(vehicles)
        .set({ ...fields, archivedAt })
        .where(eq(vehicles.id, id))
        .returning()
        .get();
      return toDto(db, updated);
    },

    /**
     * Its readings, fuel logs, maintenance records and schedules go with it (`on delete cascade`); the
     * attachments of its records are deleted in the same transaction. Their files and the photo, afterwards.
     */
    async remove(id) {
      const vehicle = await requireVehicle(db, id);
      const keys = await db.transaction(async (tx) => {
        const records = tx
          .select({ id: maintenanceRecords.id })
          .from(maintenanceRecords)
          .where(eq(maintenanceRecords.vehicleId, id));
        const removed = await tx
          .delete(attachments)
          .where(and(eq(attachments.entityType, 'maintenance'), inArray(attachments.entityId, records)))
          .returning({ storageKey: attachments.storageKey })
          .all();
        await tx.delete(vehicles).where(eq(vehicles.id, id));
        return removed.map((row) => row.storageKey);
      });
      await removeFiles(files, vehicle.photo ? [...keys, vehicle.photo] : keys);
    },

    /** Oriented, at most 1600 px and recoded to WebP (which also strips its metadata); replaces the previous one. */
    async setPhoto(id, file) {
      const vehicle = await requireVehicle(db, id);
      assertUploadSize(file);
      const data = await fileBytes(file);
      if (!detectPhotoFormat(data)) throw badRequest(UNSUPPORTED_PHOTO);
      const webp = await images.toWebpPhoto(data).catch(() => {
        throw badRequest(UNSUPPORTED_PHOTO);
      });
      assertWebp(webp);
      const key = await files.save(PHOTO_FOLDER, webp, 'webp');
      let updated: VehicleRow;
      try {
        updated = await setPhotoKey(id, key);
      } catch (error) {
        await removeFiles(files, [key]);
        throw error;
      }
      if (vehicle.photo) await removeFiles(files, [vehicle.photo]);
      return toDto(db, updated);
    },

    async removePhoto(id) {
      const vehicle = await requireVehicle(db, id);
      const updated = await setPhotoKey(id, null);
      if (vehicle.photo) await removeFiles(files, [vehicle.photo]);
      return toDto(db, updated);
    },
  };
}

/** `odometer` of the local `DataSource`. */
export function localOdometer(db: LocalDb): DataSource['odometer'] {
  return {
    async list(vehicleId) {
      await requireVehicle(db, vehicleId);
      return (await listReadings(db, vehicleId)).map(readingToDto);
    },

    async add(vehicleId, input) {
      const reading = parseInput(createOdometerReadingSchema, input);
      await requireVehicle(db, vehicleId);
      const error = validateOdometerWrite({
        readings: await listReadings(db, vehicleId),
        date: reading.date,
        odometer: reading.value,
        today: await localToday(db),
      });
      if (error?.kind === 'future_date') throw badRequest('The reading date cannot be in the future');
      if (error?.kind === 'conflict') throw conflict(odometerConflictMessage(error.conflict));
      const created = await db
        .insert(odometerReadings)
        .values({ ...reading, vehicleId, source: 'manual' })
        .returning()
        .get();
      return readingToDto(created);
    },

    async remove(vehicleId, readingId) {
      await requireVehicle(db, vehicleId);
      const reading = await db
        .select()
        .from(odometerReadings)
        .where(and(eq(odometerReadings.id, readingId), eq(odometerReadings.vehicleId, vehicleId)))
        .get();
      if (!reading) throw notFound('Reading not found');
      if (!canDeleteOdometerReading(reading)) {
        throw conflict('This reading belongs to another record; edit or delete that record instead');
      }
      await db.delete(odometerReadings).where(eq(odometerReadings.id, readingId));
    },
  };
}
