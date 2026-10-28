import type { VehicleListQuery } from '@ikrive/shared';

export const queryKeys = {
  me: ['me'] as const,
  settings: ['settings'] as const,
  config: ['config'] as const,
  calendarFeed: ['calendar-feed'] as const,
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
    /** Under `vehicles.all`: saving a maintenance record refreshes the next due dates too. */
    schedules: (id: string) => ['vehicles', 'detail', id, 'schedules'] as const,
    /** Under `maintenance(id)`: creating or deleting a record already invalidates them. */
    attachments: (id: string, recordId: string) =>
      ['vehicles', 'detail', id, 'maintenance', recordId, 'attachments'] as const,
  },
};
