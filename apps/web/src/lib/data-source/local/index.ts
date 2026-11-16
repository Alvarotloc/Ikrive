import type { ClientConfig, Me } from '@ikrive/shared';
import type { DataSource } from '../types';
import { localAttachments } from './attachments';
import { LOCAL_USER, type LocalDb } from './database';
import { LOCAL_MAX_UPLOAD_MB, type LocalDeps } from './files';
import { localFiles } from './files-get';
import { localFuelLogs } from './fuel-logs';
import { localMaintenance } from './maintenance';
import { unsupported } from './problems';
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
 * with the same `ApiError` problems. What needs a server (notifications, channels, iCal feed, public links,
 * admin) or comes with #66–#68 (sale report, import) rejects with a 501.
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
    maintenance: serialized(queue, localMaintenance(db, deps)),
    attachments: serialized(queue, localAttachments(db, deps)),
    schedules: serialized(queue, localSchedules(db)),
    stats: serialized(queue, localStats(db)),
    saleReport: { download: reject },
    reportShares: { list: reject, create: reject, revoke: reject },
    notifications: { list: reject, markRead: reject, markAllRead: reject },
    notificationChannels: { list: reject, create: reject, update: reject, remove: reject, test: reject },
    calendarFeed: { get: reject, enable: reject, disable: reject },
    dataPortability: { import: reject },
    adminUsers: { list: reject, setRole: reject, disable: reject, enable: reject, remove: reject },
    files: localFiles(db, deps, queue),
  };
}
