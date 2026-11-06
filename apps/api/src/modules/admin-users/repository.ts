import type { UserRole } from '@ikrive/shared';
import { and, asc, count, eq, isNotNull } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { activeUserFilter } from '../../db/filters';
import { attachments, session, user, vehicles } from '../../db/schema';

const adminUserColumns = {
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  disabledAt: user.disabledAt,
  createdAt: user.createdAt,
  // Counting the joined column (not the rows) gives 0 to users without vehicles.
  vehicleCount: count(vehicles.id),
};

export function createAdminUsersRepository(db: Db) {
  /** Users with their number of vehicles (archived and sold ones included). */
  const select = () =>
    db.select(adminUserColumns).from(user).leftJoin(vehicles, eq(vehicles.ownerId, user.id)).groupBy(user.id);

  return {
    list() {
      return select().orderBy(asc(user.createdAt), asc(user.id)).all();
    },
    find(id: string) {
      return select().where(eq(user.id, id)).get();
    },
    /** Admins that are not disabled: the ones that keep the instance manageable. */
    countActiveAdmins(): number {
      return (
        db
          .select({ value: count() })
          .from(user)
          .where(and(eq(user.role, 'admin'), activeUserFilter))
          .get()?.value ?? 0
      );
    },
    setRole(id: string, role: UserRole) {
      db.update(user).set({ role }).where(eq(user.id, id)).run();
    },
    /** Disables the account and signs it out everywhere, atomically. */
    disable(id: string, now: Date) {
      db.transaction((tx) => {
        tx.update(user).set({ disabledAt: now }).where(eq(user.id, id)).run();
        tx.delete(session).where(eq(session.userId, id)).run();
      });
    },
    enable(id: string) {
      db.update(user).set({ disabledAt: null }).where(eq(user.id, id)).run();
    },
    /** Storage keys of the user's files: vehicle photos and attachments. */
    fileKeys(id: string): string[] {
      const photos = db
        .select({ key: vehicles.photo })
        .from(vehicles)
        .where(and(eq(vehicles.ownerId, id), isNotNull(vehicles.photo)))
        .all()
        .flatMap(({ key }) => (key ? [key] : []));
      const files = db
        .select({ key: attachments.storageKey })
        .from(attachments)
        .where(eq(attachments.ownerId, id))
        .all()
        .map(({ key }) => key);
      return [...photos, ...files];
    },
    /** Deletes the user; every row of theirs goes with it through the foreign keys. */
    delete(id: string) {
      db.delete(user).where(eq(user.id, id)).run();
    },
  };
}

export type AdminUsersRepository = ReturnType<typeof createAdminUsersRepository>;
export type AdminUserRow = NonNullable<ReturnType<AdminUsersRepository['find']>>;
