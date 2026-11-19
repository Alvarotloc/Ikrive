import type {
  AdminUser,
  AdminUserRoleUpdate,
  Attachment,
  CalendarFeed,
  CalendarFeedSecret,
  ClientConfig,
  CreateFuelLogInput,
  CreateMaintenanceRecordInput,
  CreateMaintenanceScheduleInput,
  CreateNotificationChannelInput,
  CreateOdometerReading,
  CreateReportShare,
  CreateVehicleInput,
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
  SaleReportOptions,
  UpdateFuelLogInput,
  UpdateMaintenanceRecordInput,
  UpdateMaintenanceScheduleInput,
  UpdateNotificationChannelInput,
  UpdateUserSettings,
  UpdateVehicleInput,
  UserSettings,
  Vehicle,
  VehicleListQuery,
  VehicleStats,
} from '@ikrive/shared';

export interface DownloadedFile {
  blob: Blob;
  /** File name of the `Content-Disposition` header, `null` without one. */
  fileName: string | null;
}

/** The local export left on the device (native app): shared from its file, never loaded in memory. */
export interface DeviceFile {
  fileName: string;
  /** `file://` URI of the file. */
  uri: string;
  /** Relative to `Directory.Cache`. */
  path: string;
}

/** What `dataPortability.export()` gives: a `Blob` (web, server mode) or a file of the device (local mode). */
export type ExportedFile = DownloadedFile | DeviceFile;

export type VehicleListStatus = NonNullable<VehicleListQuery['status']>;

/**
 * Every read and write the web makes, grouped by domain: one operation per call of the `queries.ts`
 * files. The query keys and invalidations stay in those files; an implementation only moves data.
 * Uploads take a `File` (its name is kept) and downloads return the blob with its file name.
 * Failures reject with an `ApiError` carrying an RFC 7807 `Problem`, whatever the implementation.
 */
export interface DataSource {
  /** Current user; `null` without a session. */
  me(): Promise<Me | null>;
  config(): Promise<ClientConfig>;
  settings: {
    get(): Promise<UserSettings>;
    update(changes: UpdateUserSettings): Promise<UserSettings>;
  };
  vehicles: {
    list(status: VehicleListStatus): Promise<Vehicle[]>;
    get(id: string): Promise<Vehicle>;
    create(input: CreateVehicleInput): Promise<Vehicle>;
    update(id: string, changes: UpdateVehicleInput): Promise<Vehicle>;
    remove(id: string): Promise<void>;
    setPhoto(id: string, file: File): Promise<Vehicle>;
    removePhoto(id: string): Promise<Vehicle>;
  };
  odometer: {
    list(vehicleId: string): Promise<OdometerReading[]>;
    add(vehicleId: string, reading: CreateOdometerReading): Promise<OdometerReading>;
    remove(vehicleId: string, readingId: string): Promise<void>;
  };
  fuelLogs: {
    list(vehicleId: string): Promise<FuelLog[]>;
    create(vehicleId: string, log: CreateFuelLogInput): Promise<FuelLog>;
    update(vehicleId: string, logId: string, changes: UpdateFuelLogInput): Promise<FuelLog>;
    remove(vehicleId: string, logId: string): Promise<void>;
  };
  maintenance: {
    list(vehicleId: string): Promise<MaintenanceRecord[]>;
    spending(vehicleId: string): Promise<MaintenanceSpending>;
    create(vehicleId: string, record: CreateMaintenanceRecordInput): Promise<MaintenanceRecord>;
    update(
      vehicleId: string,
      recordId: string,
      changes: UpdateMaintenanceRecordInput,
    ): Promise<MaintenanceRecord>;
    remove(vehicleId: string, recordId: string): Promise<void>;
  };
  attachments: {
    list(vehicleId: string, recordId: string): Promise<Attachment[]>;
    upload(vehicleId: string, recordId: string, file: File): Promise<Attachment>;
    remove(vehicleId: string, recordId: string, attachmentId: string): Promise<void>;
  };
  schedules: {
    list(vehicleId: string): Promise<MaintenanceSchedule[]>;
    create(vehicleId: string, schedule: CreateMaintenanceScheduleInput): Promise<MaintenanceSchedule>;
    update(
      vehicleId: string,
      scheduleId: string,
      changes: UpdateMaintenanceScheduleInput,
    ): Promise<MaintenanceSchedule>;
    remove(vehicleId: string, scheduleId: string): Promise<void>;
  };
  stats: {
    get(vehicleId: string): Promise<VehicleStats>;
  };
  saleReport: {
    download(vehicleId: string, options: SaleReportOptions): Promise<DownloadedFile>;
  };
  reportShares: {
    list(vehicleId: string): Promise<ReportShare[]>;
    create(vehicleId: string, body: CreateReportShare): Promise<ReportShareSecret>;
    revoke(vehicleId: string, shareId: string): Promise<void>;
  };
  notifications: {
    list(): Promise<NotificationList>;
    markRead(id: string): Promise<Notification>;
    markAllRead(): Promise<void>;
  };
  notificationChannels: {
    list(): Promise<NotificationChannel[]>;
    create(channel: CreateNotificationChannelInput): Promise<NotificationChannel>;
    update(id: string, changes: UpdateNotificationChannelInput): Promise<NotificationChannel>;
    remove(id: string): Promise<void>;
    test(id: string): Promise<NotificationChannelTestResult>;
  };
  calendarFeed: {
    get(): Promise<CalendarFeed>;
    enable(): Promise<CalendarFeedSecret>;
    disable(): Promise<void>;
  };
  dataPortability: {
    import(file: File): Promise<DataImportSummary>;
    /** The export zip of every piece of the user's data (`data.json` + attachments + photos). */
    export(): Promise<ExportedFile>;
  };
  adminUsers: {
    list(): Promise<AdminUser[]>;
    setRole(id: string, role: AdminUserRoleUpdate['role']): Promise<AdminUser>;
    disable(id: string): Promise<AdminUser>;
    enable(id: string): Promise<AdminUser>;
    remove(id: string): Promise<void>;
  };
  /** A file of a DTO (`vehicle.photoUrl`, `attachment.url`) by its opaque URL. */
  files: {
    get(url: string): Promise<DownloadedFile>;
  };
}
