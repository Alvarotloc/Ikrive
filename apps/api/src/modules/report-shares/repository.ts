import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { activeUserFilter } from '../../db/filters';
import { reportShares, user, vehicles } from '../../db/schema';

export type ReportShareRow = typeof reportShares.$inferSelect;
export type NewReportShareRow = typeof reportShares.$inferInsert;

export function createReportSharesRepository(db: Db) {
  return {
    /** Newest first; links created in the same millisecond keep their insertion order (reversed). */
    listByVehicle(vehicleId: string) {
      return db
        .select()
        .from(reportShares)
        .where(eq(reportShares.vehicleId, vehicleId))
        .orderBy(desc(reportShares.createdAt), desc(sql`rowid`))
        .all();
    },
    find(vehicleId: string, id: string) {
      return db
        .select()
        .from(reportShares)
        .where(and(eq(reportShares.id, id), eq(reportShares.vehicleId, vehicleId)))
        .get();
    },
    /**
     * The link of a token selector and the owner of its vehicle (whose settings render the report),
     * unless the owner is disabled (then it behaves as an unknown token).
     */
    findBySelector(selector: string) {
      return db
        .select({ share: reportShares, ownerId: vehicles.ownerId })
        .from(reportShares)
        .innerJoin(vehicles, eq(vehicles.id, reportShares.vehicleId))
        .innerJoin(user, eq(user.id, vehicles.ownerId))
        .where(and(eq(reportShares.selector, selector), activeUserFilter))
        .get();
    },
    create(values: NewReportShareRow) {
      return db.insert(reportShares).values(values).returning().get();
    },
    /** Sets `revoked_at` only if it is not set yet, so revoking again keeps the first date. */
    revoke(id: string, revokedAt: Date) {
      db.update(reportShares)
        .set({ revokedAt })
        .where(and(eq(reportShares.id, id), isNull(reportShares.revokedAt)))
        .run();
    },
  };
}

export type ReportSharesRepository = ReturnType<typeof createReportSharesRepository>;
