import type { CsvImportRequestInput, VehicleListQuery } from '@ikrive/shared';

export const queryKeys = {
  me: ['me'] as const,
  settings: ['settings'] as const,
  config: ['config'] as const,
  calendarFeed: ['calendar-feed'] as const,
  /** Every account of the instance (admin only); any admin action refreshes it, locks included. */
  adminUsers: ['admin-users'] as const,
  csvImport: {
    /**
     * Dry run of a CSV import. `fileId` stands for the `File` (which serializes as `{}`); any other
     * vehicle, file or options is another preview.
     */
    preview: (vehicleId: string, fileId: number, options: Omit<CsvImportRequestInput, 'dryRun'>) =>
      ['csv-import', 'preview', vehicleId, fileId, options] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    list: ['notifications', 'list'] as const,
  },
  notificationChannels: {
    all: ['notification-channels'] as const,
  },
  vehicles: {
    all: ['vehicles'] as const,
    list: (status: NonNullable<VehicleListQuery['status']>) => ['vehicles', 'list', status] as const,
    detail: (id: string) => ['vehicles', 'detail', id] as const,
    odometer: (id: string) => ['vehicles', 'detail', id, 'odometer'] as const,
    maintenance: (id: string) => ['vehicles', 'detail', id, 'maintenance'] as const,
    /** Under `maintenance(id)`: saving or deleting a record refreshes it. */
    maintenanceSpending: (id: string) => ['vehicles', 'detail', id, 'maintenance', 'spending'] as const,
    /** Under `vehicles.all`: saving a refuel refreshes the vehicle's odometer and readings too. */
    fuelLogs: (id: string) => ['vehicles', 'detail', id, 'fuel-logs'] as const,
    /** Under `detail(id)`: saving or deleting an expense refreshes it and the statistics. */
    expenses: (id: string) => ['vehicles', 'detail', id, 'expenses'] as const,
    /** Under `vehicles.all`: saving a maintenance record refreshes the next due dates too. */
    schedules: (id: string) => ['vehicles', 'detail', id, 'schedules'] as const,
    /**
     * Under `vehicles.all`: refuel, maintenance, odometer and vehicle mutations already invalidate the
     * whole tree, and expense mutations the vehicle's `detail(id)`, so the statistics refresh with them.
     */
    stats: (id: string) => ['vehicles', 'detail', id, 'stats'] as const,
    /** Public links to the sale report; creating or revoking one refreshes it. */
    reportShares: (id: string) => ['vehicles', 'detail', id, 'report-shares'] as const,
    /** Under `maintenance(id)`: creating or deleting a record already invalidates them. */
    attachments: (id: string, recordId: string) =>
      ['vehicles', 'detail', id, 'maintenance', recordId, 'attachments'] as const,
  },
};
