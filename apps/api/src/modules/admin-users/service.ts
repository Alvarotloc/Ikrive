import { type AdminUser, type AdminUserLockReason, adminUserLocks, type UserRole } from '@ikrive/shared';
import type { FastifyBaseLogger } from 'fastify';
import { ConflictError, NotFoundError } from '../../lib/errors';
import type { FileStorage } from '../../lib/storage';
import type { AdminUserRow, AdminUsersRepository } from './repository';

interface AdminUsersServiceDeps {
  repo: AdminUsersRepository;
  storage: Pick<FileStorage, 'remove'>;
  log: Pick<FastifyBaseLogger, 'error'>;
}

const LOCK_DETAILS: Record<AdminUserLockReason, string> = {
  self: 'You cannot disable or delete your own account',
  last_admin: 'The instance must keep at least one active admin',
};

/**
 * Account management for the instance admin. The checks and the writes run back to back on the
 * synchronous SQLite driver, so no other request can slip in between them.
 */
export function createAdminUsersService({ repo, storage, log }: AdminUsersServiceDeps) {
  const locksOf = (row: AdminUserRow, actorId: string, activeAdminCount = repo.countActiveAdmins()) =>
    adminUserLocks(
      { id: row.id, role: row.role, disabled: row.disabledAt !== null },
      { actorId, activeAdminCount },
    );

  const toDto = (row: AdminUserRow, actorId: string, activeAdminCount?: number): AdminUser => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.disabledAt ? 'disabled' : 'active',
    disabledAt: row.disabledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    vehicleCount: row.vehicleCount,
    isSelf: row.id === actorId,
    locks: locksOf(row, actorId, activeAdminCount),
  });

  const requireUser = (id: string) => {
    const row = repo.find(id);
    if (!row) throw new NotFoundError('User not found');
    return row;
  };

  const assertAllowed = (reason: AdminUserLockReason | null) => {
    if (reason) throw new ConflictError(LOCK_DETAILS[reason]);
  };

  const reload = (id: string, actorId: string) => toDto(requireUser(id), actorId);

  return {
    list(actorId: string): AdminUser[] {
      const activeAdminCount = repo.countActiveAdmins();
      return repo.list().map((row) => toDto(row, actorId, activeAdminCount));
    },

    setRole(actorId: string, id: string, role: UserRole): AdminUser {
      const target = requireUser(id);
      if (target.role === role) return toDto(target, actorId);
      if (role === 'user') assertAllowed(locksOf(target, actorId).demote);
      repo.setRole(id, role);
      return reload(id, actorId);
    },

    disable(actorId: string, id: string, now = new Date()): AdminUser {
      const target = requireUser(id);
      if (target.disabledAt) return toDto(target, actorId);
      assertAllowed(locksOf(target, actorId).disable);
      repo.disable(id, now);
      return reload(id, actorId);
    },

    enable(actorId: string, id: string): AdminUser {
      const target = requireUser(id);
      if (!target.disabledAt) return toDto(target, actorId);
      repo.enable(id);
      return reload(id, actorId);
    },

    /** Deletes the user with all their data: rows first, files afterwards (an orphan file is acceptable). */
    async remove(actorId: string, id: string) {
      const target = requireUser(id);
      assertAllowed(locksOf(target, actorId).delete);
      const keys = repo.fileKeys(id);
      repo.delete(id);
      for (const key of keys) {
        await storage.remove(key).catch((err: unknown) => {
          log.error({ err, key }, 'admin: could not remove a user file');
        });
      }
    },
  };
}

export type AdminUsersService = ReturnType<typeof createAdminUsersService>;
