import { describe, expect, it } from 'vitest';
import { adminUserLocks } from './admin-users';

const admin = { id: 'admin', role: 'admin' as const, disabled: false };
const other = { id: 'other', role: 'admin' as const, disabled: false };
const user = { id: 'user', role: 'user' as const, disabled: false };
const none = { demote: null, disable: null, delete: null };

describe('adminUserLocks', () => {
  it('locks demote only for the last active admin', () => {
    expect(adminUserLocks(admin, { actorId: 'admin', activeAdminCount: 1 }).demote).toBe('last_admin');
    expect(adminUserLocks(other, { actorId: 'admin', activeAdminCount: 1 }).demote).toBe('last_admin');
    // Demoting oneself is allowed while another active admin remains.
    expect(adminUserLocks(admin, { actorId: 'admin', activeAdminCount: 2 }).demote).toBeNull();
    expect(adminUserLocks(other, { actorId: 'admin', activeAdminCount: 2 })).toEqual(none);
  });

  it('locks disable and delete for self before last admin', () => {
    expect(adminUserLocks(admin, { actorId: 'admin', activeAdminCount: 1 })).toEqual({
      demote: 'last_admin',
      disable: 'self',
      delete: 'self',
    });
    expect(adminUserLocks(admin, { actorId: 'admin', activeAdminCount: 2 })).toEqual({
      demote: null,
      disable: 'self',
      delete: 'self',
    });
    expect(adminUserLocks(other, { actorId: 'admin', activeAdminCount: 1 })).toEqual({
      demote: 'last_admin',
      disable: 'last_admin',
      delete: 'last_admin',
    });
  });

  it('ignores disabled admins in the count', () => {
    // A disabled admin is never the last active admin, whatever the count.
    const disabled = { ...other, disabled: true };
    expect(adminUserLocks(disabled, { actorId: 'admin', activeAdminCount: 1 })).toEqual(none);
    expect(adminUserLocks(disabled, { actorId: 'admin', activeAdminCount: 0 })).toEqual(none);
    // The only active admin is still the last one when a disabled admin exists (count excludes it).
    expect(adminUserLocks(other, { actorId: 'admin', activeAdminCount: 1 })).toMatchObject({
      demote: 'last_admin',
      disable: 'last_admin',
    });
  });

  it('never locks a regular user', () => {
    expect(adminUserLocks(user, { actorId: 'admin', activeAdminCount: 1 })).toEqual(none);
    expect(adminUserLocks(user, { actorId: 'admin', activeAdminCount: 0 })).toEqual(none);
    expect(adminUserLocks({ ...user, disabled: true }, { actorId: 'admin', activeAdminCount: 1 })).toEqual(
      none,
    );
  });
});
