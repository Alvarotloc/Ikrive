import { describe, expect, it } from 'vitest';
import { adminUserRoleUpdateSchema } from './admin';

describe('adminUserRoleUpdateSchema', () => {
  it('accepts the user roles', () => {
    expect(adminUserRoleUpdateSchema.parse({ role: 'admin' })).toEqual({ role: 'admin' });
    expect(adminUserRoleUpdateSchema.parse({ role: 'user' })).toEqual({ role: 'user' });
  });

  it('rejects unknown roles', () => {
    expect(adminUserRoleUpdateSchema.safeParse({ role: 'owner' }).success).toBe(false);
    expect(adminUserRoleUpdateSchema.safeParse({ role: 'admin,user' }).success).toBe(false);
    expect(adminUserRoleUpdateSchema.safeParse({}).success).toBe(false);
  });
});
