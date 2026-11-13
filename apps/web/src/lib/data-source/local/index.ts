import type { ClientConfig, Me } from '@ikrive/shared';
import type { DataSource } from '../types';
import { LOCAL_USER, type LocalDb } from './database';
import { localFuelLogs } from './fuel-logs';
import { localMaintenance } from './maintenance';
import { unsupported } from './problems';
import { localSchedules } from './schedules';
import { createSerialQueue, type SerialQueue } from './serial';
import { localSettings } from './settings';
import { localStats } from './stats';
import { localOdometer, localVehicles } from './vehicles';

export { type LocalDb, openLocalDatabase } from './database';

/** The user of the local mode: a plain user, so the admin section stays hidden by role. */
export const LOCAL_ME: Me = { ...LOCAL_USER };

/** `maxUploadMb` is the API's default; `localBaseUrl` because nothing on the phone is reachable from outside. */
export const LOCAL_CLIENT_CONFIG: ClientConfig = { maxUploadMb: 20, localBaseUrl: true };

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
 * The `DataSource` of the mobile app's local mode, over the SQLite database of the device (`db`). It applies
 * the same `@ikrive/shared` rules as the API and rejects with the same `ApiError` problems. What needs a
 * server (notifications, channels, iCal feed, public links, admin) or comes with #65–#68 (photo,
 * attachments, files, sale report, import) rejects with a 501.
 */
export function createLocalDataSource(db: LocalDb): DataSource {
  const queue = createSerialQueue();
  return {
    me: async () => LOCAL_ME,
    config: async () => LOCAL_CLIENT_CONFIG,
    settings: serialized(queue, localSettings(db)),
    vehicles: serialized(queue, { ...localVehicles(db), setPhoto: reject, removePhoto: reject }),
    odometer: serialized(queue, localOdometer(db)),
    fuelLogs: serialized(queue, localFuelLogs(db)),
    maintenance: serialized(queue, localMaintenance(db)),
    attachments: { list: reject, upload: reject, remove: reject },
    schedules: serialized(queue, localSchedules(db)),
    stats: serialized(queue, localStats(db)),
    saleReport: { download: reject },
    reportShares: { list: reject, create: reject, revoke: reject },
    notifications: { list: reject, markRead: reject, markAllRead: reject },
    notificationChannels: { list: reject, create: reject, update: reject, remove: reject, test: reject },
    calendarFeed: { get: reject, enable: reject, disable: reject },
    dataPortability: { import: reject },
    adminUsers: { list: reject, setRole: reject, disable: reject, enable: reject, remove: reject },
    files: { get: reject },
  };
}
