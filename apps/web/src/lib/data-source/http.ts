import type {
  AdminUser,
  Attachment,
  CalendarFeed,
  CalendarFeedSecret,
  ClientConfig,
  CsvImportSummary,
  DataImportSummary,
  FuelLog,
  MaintenanceRecord,
  MaintenanceSchedule,
  MaintenanceSpending,
  Me,
  Notification,
  NotificationChannel,
  NotificationChannelTestResult,
  NotificationList,
  OdometerReading,
  ReportShare,
  ReportShareSecret,
  UserSettings,
  Vehicle,
  VehicleStats,
} from '@ikrive/shared';
import { saleReportPath } from '@/features/reports/sale-report';
import { ApiError, api } from '../api-client';
import type { DataSource } from './types';

/** The multipart body of an upload: the API takes a single `file` part, with the file's name. */
const fileBody = (file: File) => {
  const body = new FormData();
  body.append('file', file);
  return body;
};

/** The multipart body of a CSV import: `options` (JSON) before `file`, so the API reads it first. */
const csvImportBody = (file: File, options: object) => {
  const body = new FormData();
  body.append('options', JSON.stringify(options));
  body.append('file', file);
  return body;
};

const attachmentsPath = (vehicleId: string, recordId: string) =>
  `/vehicles/${vehicleId}/maintenance/${recordId}/attachments`;

const CALENDAR_FEED_PATH = '/settings/calendar-feed';

/** `DataSource` over the Ikrive API (same origin or a remote server, see `lib/server.ts`). */
export const httpDataSource: DataSource = {
  async me() {
    try {
      return await api.get<Me>('/me');
    } catch (error) {
      // No session: not an error for the app, which then shows the login.
      if (error instanceof ApiError && error.problem.status === 401) return null;
      throw error;
    }
  },
  config: () => api.get<ClientConfig>('/config'),
  settings: {
    get: () => api.get<UserSettings>('/settings'),
    update: (changes) => api.patch<UserSettings>('/settings', changes),
  },
  vehicles: {
    list: (status) => api.get<Vehicle[]>(`/vehicles?status=${status}`),
    get: (id) => api.get<Vehicle>(`/vehicles/${id}`),
    create: (input) => api.post<Vehicle>('/vehicles', input),
    update: (id, changes) => api.patch<Vehicle>(`/vehicles/${id}`, changes),
    remove: (id) => api.delete<void>(`/vehicles/${id}`),
    setPhoto: (id, file) => api.put<Vehicle>(`/vehicles/${id}/photo`, fileBody(file)),
    removePhoto: (id) => api.delete<Vehicle>(`/vehicles/${id}/photo`),
  },
  odometer: {
    list: (vehicleId) => api.get<OdometerReading[]>(`/vehicles/${vehicleId}/odometer`),
    add: (vehicleId, reading) => api.post<OdometerReading>(`/vehicles/${vehicleId}/odometer`, reading),
    remove: (vehicleId, readingId) => api.delete<void>(`/vehicles/${vehicleId}/odometer/${readingId}`),
  },
  fuelLogs: {
    list: (vehicleId) => api.get<FuelLog[]>(`/vehicles/${vehicleId}/fuel-logs`),
    create: (vehicleId, log) => api.post<FuelLog>(`/vehicles/${vehicleId}/fuel-logs`, log),
    update: (vehicleId, logId, changes) =>
      api.patch<FuelLog>(`/vehicles/${vehicleId}/fuel-logs/${logId}`, changes),
    remove: (vehicleId, logId) => api.delete<void>(`/vehicles/${vehicleId}/fuel-logs/${logId}`),
  },
  maintenance: {
    list: (vehicleId) => api.get<MaintenanceRecord[]>(`/vehicles/${vehicleId}/maintenance`),
    spending: (vehicleId) => api.get<MaintenanceSpending>(`/vehicles/${vehicleId}/maintenance/spending`),
    create: (vehicleId, record) => api.post<MaintenanceRecord>(`/vehicles/${vehicleId}/maintenance`, record),
    update: (vehicleId, recordId, changes) =>
      api.patch<MaintenanceRecord>(`/vehicles/${vehicleId}/maintenance/${recordId}`, changes),
    remove: (vehicleId, recordId) => api.delete<void>(`/vehicles/${vehicleId}/maintenance/${recordId}`),
  },
  attachments: {
    list: (vehicleId, recordId) => api.get<Attachment[]>(attachmentsPath(vehicleId, recordId)),
    upload: (vehicleId, recordId, file) =>
      api.post<Attachment>(attachmentsPath(vehicleId, recordId), fileBody(file)),
    remove: (vehicleId, recordId, attachmentId) =>
      api.delete<void>(`${attachmentsPath(vehicleId, recordId)}/${attachmentId}`),
  },
  schedules: {
    list: (vehicleId) => api.get<MaintenanceSchedule[]>(`/vehicles/${vehicleId}/schedules`),
    create: (vehicleId, schedule) =>
      api.post<MaintenanceSchedule>(`/vehicles/${vehicleId}/schedules`, schedule),
    update: (vehicleId, scheduleId, changes) =>
      api.patch<MaintenanceSchedule>(`/vehicles/${vehicleId}/schedules/${scheduleId}`, changes),
    remove: (vehicleId, scheduleId) => api.delete<void>(`/vehicles/${vehicleId}/schedules/${scheduleId}`),
  },
  stats: {
    get: (vehicleId) => api.get<VehicleStats>(`/vehicles/${vehicleId}/stats`),
  },
  saleReport: {
    download: (vehicleId, options) => api.download(saleReportPath(vehicleId, options)),
  },
  reportShares: {
    list: (vehicleId) => api.get<ReportShare[]>(`/vehicles/${vehicleId}/report-shares`),
    create: (vehicleId, body) => api.post<ReportShareSecret>(`/vehicles/${vehicleId}/report-shares`, body),
    revoke: (vehicleId, shareId) => api.delete<void>(`/vehicles/${vehicleId}/report-shares/${shareId}`),
  },
  notifications: {
    list: () => api.get<NotificationList>('/notifications'),
    markRead: (id) => api.patch<Notification>(`/notifications/${id}/read`),
    markAllRead: () => api.post<void>('/notifications/read-all'),
  },
  notificationChannels: {
    list: () => api.get<NotificationChannel[]>('/notification-channels'),
    create: (channel) => api.post<NotificationChannel>('/notification-channels', channel),
    update: (id, changes) => api.patch<NotificationChannel>(`/notification-channels/${id}`, changes),
    remove: (id) => api.delete<void>(`/notification-channels/${id}`),
    test: (id) => api.post<NotificationChannelTestResult>(`/notification-channels/${id}/test`),
  },
  calendarFeed: {
    get: () => api.get<CalendarFeed>(CALENDAR_FEED_PATH),
    enable: () => api.post<CalendarFeedSecret>(CALENDAR_FEED_PATH),
    disable: () => api.delete<void>(CALENDAR_FEED_PATH),
  },
  csvImport: {
    import: (vehicleId, file, options = {}) =>
      api.post<CsvImportSummary>(`/vehicles/${vehicleId}/csv-import`, csvImportBody(file, options)),
  },
  dataPortability: {
    import: (file) => api.post<DataImportSummary>('/me/import', fileBody(file)),
    export: () => api.download('/me/export'),
  },
  adminUsers: {
    list: () => api.get<AdminUser[]>('/admin/users'),
    setRole: (id, role) => api.put<AdminUser>(`/admin/users/${id}/role`, { role }),
    disable: (id) => api.post<AdminUser>(`/admin/users/${id}/disable`),
    enable: (id) => api.post<AdminUser>(`/admin/users/${id}/enable`),
    remove: (id) => api.delete<void>(`/admin/users/${id}`),
  },
  files: {
    get: (url) => api.downloadUrl(url),
  },
};
