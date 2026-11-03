import type { UserRole } from '../enums';
import type { AdminUserLocks } from '../schemas/admin';

/**
 * Admin actions that are not allowed on `target` and why. The instance must keep at least one active
 * admin (disabled admins do not count) and an admin cannot disable or delete their own account;
 * `self` wins over `last_admin`. Demoting oneself is allowed while another active admin remains.
 * Promoting and re-enabling are never locked.
 */
export function adminUserLocks(
  target: { id: string; role: UserRole; disabled: boolean },
  ctx: { actorId: string; activeAdminCount: number },
): AdminUserLocks {
  const lastAdmin = target.role === 'admin' && !target.disabled && ctx.activeAdminCount <= 1;
  const destructive = target.id === ctx.actorId ? 'self' : lastAdmin ? 'last_admin' : null;
  return {
    demote: lastAdmin ? 'last_admin' : null,
    disable: destructive,
    delete: destructive,
  };
}
