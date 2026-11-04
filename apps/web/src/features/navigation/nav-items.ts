import type { UserRole } from '@ikrive/shared';
import { Car, Gauge, Home, Settings, Users } from 'lucide-react';

/** Main destinations of the app, shared by the desktop sidebar and the mobile menu. */
export const navItems = [
  { to: '/', icon: Home, label: 'nav.dashboard', adminOnly: false },
  { to: '/vehicles', icon: Car, label: 'nav.vehicles', adminOnly: false },
  { to: '/odometer', icon: Gauge, label: 'nav.odometer', adminOnly: false },
  { to: '/admin/users', icon: Users, label: 'nav.users', adminOnly: true },
  { to: '/settings', icon: Settings, label: 'nav.settings', adminOnly: false },
] as const;

/** The destinations shown to a user: the admin-only ones only for admins (and none while `role` is unknown). */
export function navItemsFor(role: UserRole | undefined) {
  return navItems.filter((item) => !item.adminOnly || role === 'admin');
}
