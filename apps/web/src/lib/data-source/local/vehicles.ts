import { LOCAL_USER_ID } from '@ikrive/db';
import { odometerReadings, vehicles } from '@ikrive/db/schema';
import {
  archivedAtAfterUpdate,
  canDeleteOdometerReading,
  createOdometerReadingSchema,
  createVehicleSchema,
  initialOdometerReading,
  type OdometerReading,
  odometerConflictMessage,
  updateVehicleSchema,
  type Vehicle,
  type VehicleStatus,
  validateOdometerWrite,
  vehicleStatus,
} from '@ikrive/shared';
import { and, desc, eq, isNotNull, isNull, type SQL } from 'drizzle-orm';
import type { DataSource } from '../types';
import type { LocalDb } from './database';
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
    // Photos come with #65.
    photoUrl: null,
    odometer: latest ? { value: latest.value, date: latest.date } : null,
  };
}

/** `vehicles` of the local `DataSource`, without the photo (`setPhoto`/`removePhoto` are added by the caller). */
export function localVehicles(db: LocalDb): Omit<DataSource['vehicles'], 'setPhoto' | 'removePhoto'> {
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

    /** Its readings, fuel logs, maintenance records and schedules go with it (`on delete cascade`). */
    async remove(id) {
      await requireVehicle(db, id);
      await db.delete(vehicles).where(eq(vehicles.id, id));
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
