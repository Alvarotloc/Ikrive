import { and, asc, eq, getTableColumns, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { activeUserFilter } from '../../db/filters';
import { maintenanceSchedules, user, userSettings, vehicles } from '../../db/schema';
import { activeVehicleFilter } from '../vehicles/repository';

export type MaintenanceScheduleRow = typeof maintenanceSchedules.$inferSelect;
export type NewMaintenanceScheduleRow = typeof maintenanceSchedules.$inferInsert;

export function createSchedulesRepository(db: Db) {
  return {
    /** Oldest first; `rowid` breaks ties between schedules created in the same millisecond. */
    listByVehicle(vehicleId: string) {
      return db
        .select()
        .from(maintenanceSchedules)
        .where(eq(maintenanceSchedules.vehicleId, vehicleId))
        .orderBy(asc(maintenanceSchedules.createdAt), asc(sql`rowid`))
        .all();
    },
    /**
     * Schedules of every user's active vehicles, with the vehicle's owner and name and the owner's
     * time zone and reminder hour (null when the owner has no settings row yet). For jobs.
     */
    listForActiveVehicles() {
      return db
        .select({
          ...getTableColumns(maintenanceSchedules),
          ownerId: vehicles.ownerId,
          vehicleName: vehicles.name,
          vehicleMake: vehicles.make,
          vehicleModel: vehicles.model,
          timezone: userSettings.timezone,
          reminderHour: userSettings.reminderHour,
        })
        .from(maintenanceSchedules)
        .innerJoin(vehicles, eq(vehicles.id, maintenanceSchedules.vehicleId))
        .innerJoin(user, eq(user.id, vehicles.ownerId))
        .leftJoin(userSettings, eq(userSettings.userId, vehicles.ownerId))
        .where(and(activeVehicleFilter, activeUserFilter))
        .all();
    },
    /** Schedules of one user's active vehicles, with the vehicle's name, make and model. For the iCal feed. */
    listForOwnerActiveVehicles(ownerId: string) {
      return db
        .select({
          ...getTableColumns(maintenanceSchedules),
          vehicleName: vehicles.name,
          vehicleMake: vehicles.make,
          vehicleModel: vehicles.model,
        })
        .from(maintenanceSchedules)
        .innerJoin(vehicles, eq(vehicles.id, maintenanceSchedules.vehicleId))
        .where(and(eq(vehicles.ownerId, ownerId), activeVehicleFilter))
        .orderBy(asc(maintenanceSchedules.createdAt), asc(sql`${maintenanceSchedules}.rowid`))
        .all();
    },
    find(vehicleId: string, id: string) {
      return db
        .select()
        .from(maintenanceSchedules)
        .where(and(eq(maintenanceSchedules.id, id), eq(maintenanceSchedules.vehicleId, vehicleId)))
        .get();
    },
    create(values: NewMaintenanceScheduleRow) {
      return db.insert(maintenanceSchedules).values(values).returning().get();
    },
    update(id: string, values: Partial<NewMaintenanceScheduleRow>) {
      return db
        .update(maintenanceSchedules)
        .set(values)
        .where(eq(maintenanceSchedules.id, id))
        .returning()
        .get();
    },
    /** Deletes a schedule; its maintenance records are kept and unlinked by the `ON DELETE SET NULL` FK. */
    delete(id: string) {
      db.delete(maintenanceSchedules).where(eq(maintenanceSchedules.id, id)).run();
    },
  };
}

export type SchedulesRepository = ReturnType<typeof createSchedulesRepository>;
