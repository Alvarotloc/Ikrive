import { Car, Gauge, Home, Settings } from 'lucide-react';

/** Main destinations of the app, shared by the desktop sidebar and the mobile menu. */
export const navItems = [
  { to: '/', icon: Home, label: 'nav.dashboard' },
  { to: '/vehicles', icon: Car, label: 'nav.vehicles' },
  { to: '/odometer', icon: Gauge, label: 'nav.odometer' },
  { to: '/settings', icon: Settings, label: 'nav.settings' },
] as const;
