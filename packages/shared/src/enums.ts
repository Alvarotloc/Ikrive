export const USER_ROLES = ['admin', 'user'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const DISTANCE_UNITS = ['km', 'mi'] as const;
export type DistanceUnit = (typeof DISTANCE_UNITS)[number];

export const VOLUME_UNITS = ['l', 'gal'] as const;
export type VolumeUnit = (typeof VOLUME_UNITS)[number];

/** Unit of a fuel log's quantity: the user's volume unit, or kWh for electric vehicles. */
export const FUEL_QUANTITY_UNITS = ['l', 'gal', 'kwh'] as const;
export type FuelQuantityUnit = (typeof FUEL_QUANTITY_UNITS)[number];

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

/** Vehicle costs that are neither refuels nor maintenance (`expenses.category`). */
export const EXPENSE_CATEGORIES = ['insurance', 'tax', 'tolls', 'parking', 'fines', 'other'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Computed on read from a maintenance schedule's next due date and odometer. */
export const SCHEDULE_STATUSES = ['ok', 'due_soon', 'overdue'] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

export const ODOMETER_SOURCES = ['manual', 'maintenance', 'fuel'] as const;
export type OdometerSource = (typeof ODOMETER_SOURCES)[number];

export const NOTIFICATION_CHANNEL_TYPES = ['ntfy', 'gotify', 'apprise', 'webhook'] as const;
export type NotificationChannelType = (typeof NOTIFICATION_CHANNEL_TYPES)[number];

/** In-app notification kinds; the web translates them, the stored title and body are user data. */
export const NOTIFICATION_TYPES = ['schedule_due_soon', 'schedule_overdue', 'odometer_nudge'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** 0 = Sunday ... 6 = Saturday */
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/** Content types accepted as attachments (detected from the file bytes, not the declared type). */
export const ATTACHMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
export type AttachmentMimeType = (typeof ATTACHMENT_MIME_TYPES)[number];

/** Entities that can own attachments (`attachments.entity_type`). */
export const ATTACHMENT_ENTITY_TYPES = ['maintenance'] as const;
export type AttachmentEntityType = (typeof ATTACHMENT_ENTITY_TYPES)[number];

/** Computed on read from a report share's `revokedAt`/`expiresAt`: revoked wins over expired. */
export const REPORT_SHARE_STATUSES = ['active', 'expired', 'revoked'] as const;
export type ReportShareStatus = (typeof REPORT_SHARE_STATUSES)[number];

/** Derived from a user's `disabledAt`: a disabled account cannot sign in. */
export const USER_STATUSES = ['active', 'disabled'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** Why an admin action on an account is not allowed: it is the actor's own, or the last active admin. */
export const ADMIN_USER_LOCK_REASONS = ['self', 'last_admin'] as const;
export type AdminUserLockReason = (typeof ADMIN_USER_LOCK_REASONS)[number];
