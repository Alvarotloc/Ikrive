import { and, asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { maintenanceSchedules } from '../../db/schema';

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
