import type { VehicleStatus } from '../enums';

/** A sold vehicle is `sold` even when it is also archived; otherwise `archived` or `active`. */
export const vehicleStatus = ({
  soldAt,
  archivedAt,
}: {
  soldAt: unknown;
  archivedAt: unknown;
}): VehicleStatus => (soldAt ? 'sold' : archivedAt ? 'archived' : 'active');

/**
 * Archive date of an edited vehicle: untouched (`undefined`) without `archived`, the current one
 * (or `now` when it had none) when archiving, so re-archiving keeps the original date, and `null`
 * when unarchiving. Generic in the date type: the API stores `Date`, other stores may use strings.
 */
export function archivedAtAfterUpdate<T>(
  current: T | null,
  archived: boolean | undefined,
  now: T,
): T | null | undefined {
  if (archived === undefined) return undefined;
  return archived ? (current ?? now) : null;
}
