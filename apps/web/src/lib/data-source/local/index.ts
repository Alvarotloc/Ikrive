import type { ClientConfig, Me } from '@ikrive/shared';
import type { DataSource } from '../types';
import { localAttachments } from './attachments';
import { localCsvImport } from './csv-import';
import { localDataPortability } from './data-export';
import { LOCAL_USER, type LocalDb } from './database';
import { localExpenses } from './expenses';
import { LOCAL_MAX_UPLOAD_MB, type LocalDeps } from './files';
import { localFiles } from './files-get';
import { localFuelLogs } from './fuel-logs';
import { localMaintenance } from './maintenance';
import { localNotifications } from './notifications';
import { unsupported } from './problems';
import { localSaleReport } from './sale-report';
import { localSchedules } from './schedules';
import { createSerialQueue, type SerialQueue } from './serial';
import { localSettings } from './settings';
import { localStats } from './stats';
import { localOdometer, localVehicles } from './vehicles';

export { type LocalDb, openLocalDatabase } from './database';
export type { LocalDeps, LocalFileStore, LocalImages } from './files';

/** The user of the local mode: a plain user, so the admin section stays hidden by role. */
export const LOCAL_ME: Me = { ...LOCAL_USER };

/** `maxUploadMb` is the API's default; `localBaseUrl` because nothing on the phone is reachable from outside. */
export const LOCAL_CLIENT_CONFIG: ClientConfig = { maxUploadMb: LOCAL_MAX_UPLOAD_MB, localBaseUrl: true };

/** Rejects with a 501 problem without touching the database: features that need a server or a later version. */
const reject = async (): Promise<never> => {
  throw unsupported();
};

type AsyncMethod = (...args: never[]) => Promise<unknown>;

/** `group` with every method run through `queue`, so no two operations interleave their statements. */
function serialized<G extends Record<string, AsyncMethod>>(queue: SerialQueue, group: G): G {
  const wrapped: Record<string, AsyncMethod> = {};
  for (const [name, method] of Object.entries(group)) {
    wrapped[name] = (...args) => queue.run(() => method(...args));
  }
  return wrapped as G;
}

/**
 * The `DataSource` of the mobile app's local mode, over the SQLite database of the device (`db`) and its
 * files and image processing (`deps`). It applies the same `@ikrive/shared` rules as the API and rejects
 * with the same `ApiError` problems. The notifications inbox is filled on the device with the reminders of
 * the API's jobs each time it is listed. What needs a server (channels, iCal feed, public links, admin) or
 * comes in a later version (import) rejects with a 501; the data export builds the same zip and the sale
 * report the same PDF as the API on the device.
 */
export function createLocalDataSource(db: LocalDb, deps: LocalDeps): DataSource {
  const queue = createSerialQueue();
  return {
    me: async () => LOCAL_ME,
    config: async () => LOCAL_CLIENT_CONFIG,
    settings: serialized(queue, localSettings(db)),
    vehicles: serialized(queue, localVehicles(db, deps)),
    odometer: serialized(queue, localOdometer(db)),
    fuelLogs: serialized(queue, localFuelLogs(db)),
    expenses: serialized(queue, localExpenses(db)),
    maintenance: serialized(queue, localMaintenance(db, deps)),
    attachments: serialized(queue, localAttachments(db, deps)),
    schedules: serialized(queue, localSchedules(db)),
    stats: serialized(queue, localStats(db)),
    saleReport: localSaleReport(db, deps, queue),
    reportShares: { list: reject, create: reject, revoke: reject },
    notifications: serialized(queue, localNotifications(db)),
    notificationChannels: { list: reject, create: reject, update: reject, remove: reject, test: reject },
    calendarFeed: { get: reject, enable: reject, disable: reject },
    csvImport: serialized(queue, localCsvImport(db)),
    dataPortability: { import: reject, ...localDataPortability(db, deps, queue) },
    adminUsers: { list: reject, setRole: reject, disable: reject, enable: reject, remove: reject },
    files: localFiles(db, deps, queue),
  };
}
