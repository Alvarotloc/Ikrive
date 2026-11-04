import { describe, expect, it } from 'vitest';
import { navItemsFor } from './nav-items';

describe('navItemsFor', () => {
  it('includes the users entry only for admins', () => {
    expect(navItemsFor('admin').map((item) => item.to)).toEqual([
      '/',
      '/vehicles',
      '/odometer',
      '/admin/users',
      '/settings',
    ]);
    expect(navItemsFor('user').map((item) => item.to)).toEqual(['/', '/vehicles', '/odometer', '/settings']);
    expect(navItemsFor(undefined).map((item) => item.to)).not.toContain('/admin/users');
  });
});
