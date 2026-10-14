export const USER_ROLES = ['admin', 'user'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const DISTANCE_UNITS = ['km', 'mi'] as const;
export type DistanceUnit = (typeof DISTANCE_UNITS)[number];

export const VOLUME_UNITS = ['l', 'gal'] as const;
export type VolumeUnit = (typeof VOLUME_UNITS)[number];

export const LOCALES = ['es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const VEHICLE_TYPES = ['car', 'motorcycle', 'van', 'truck', 'other'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

/** Derived from `soldAt`/`archivedAt`: sold wins over archived. */
export const VEHICLE_STATUSES = ['active', 'archived', 'sold'] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const FUEL_TYPES = [
  'gasoline',
  'diesel',
  'hybrid',
  'plugin_hybrid',
  'electric',
  'lpg',
  'cng',
  'other',
] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export const MAINTENANCE_CATEGORIES = [
  'oil_change',
  'tires',
  'brakes',
  'inspection',
  'repair',
  'filters',
  'battery',
  'other',
] as const;
export type MaintenanceCategory = (typeof MAINTENANCE_CATEGORIES)[number];

export const ODOMETER_SOURCES = ['manual', 'maintenance', 'fuel'] as const;
export type OdometerSource = (typeof ODOMETER_SOURCES)[number];

export const NOTIFICATION_CHANNEL_TYPES = ['ntfy', 'gotify', 'apprise', 'webhook'] as const;
export type NotificationChannelType = (typeof NOTIFICATION_CHANNEL_TYPES)[number];

/** 0 = Sunday ... 6 = Saturday */
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
