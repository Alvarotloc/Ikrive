import { httpDataSource } from './http';
import type { DataSource } from './types';

export type { DataSource, DownloadedFile, VehicleListStatus } from './types';

let current: DataSource = httpDataSource;

/**
 * The active `DataSource`. Call it inside each `queryFn`/`mutationFn`, not at import time, so a
 * replacement installed later (the local mode, a test) is the one used.
 */
export const dataSource = (): DataSource => current;

/** Installs `next` as the active `DataSource` (the HTTP one by default). */
export function setDataSource(next: DataSource): void {
  current = next;
}
