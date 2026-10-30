export interface OdometerPoint {
  date: string;
  value: number;
}

/** Chronological order; readings on the same day by value. */
export const byDateThenValue = (a: OdometerPoint, b: OdometerPoint) =>
  a.date.localeCompare(b.date) || a.value - b.value;

/**
 * Odometer readings must not decrease over time. Returns the first existing reading that a new one
 * would contradict (an earlier date with a higher value, or a later date with a lower value), or null.
 * Readings on the same day may come in any order.
 */
export function findOdometerConflict<T extends OdometerPoint>(
  readings: readonly T[],
  candidate: OdometerPoint,
): T | null {
  return (
    readings.find(
      (reading) =>
        (reading.date < candidate.date && reading.value > candidate.value) ||
        (reading.date > candidate.date && reading.value < candidate.value),
    ) ?? null
  );
}

/** Most recent reading (latest date, highest value on ties), or null when there are none. */
export function latestOdometerReading<T extends OdometerPoint>(readings: readonly T[]): T | null {
  return readings.reduce<T | null>(
    (latest, reading) => (!latest || byDateThenValue(reading, latest) > 0 ? reading : latest),
    null,
  );
}

const DAY_MS = 86_400_000;
const MIN_SPAN_DAYS = 30;

/**
 * Distance per day between the first and the last reading, or null with fewer than two readings or
 * when they span less than a month, because extrapolating a few days is meaningless.
 */
function distancePerDay(readings: readonly OdometerPoint[]): number | null {
  if (readings.length < 2) return null;
  const sorted = [...readings].sort(byDateThenValue);
  const first = sorted[0] as OdometerPoint;
  const last = sorted[sorted.length - 1] as OdometerPoint;
  const days = (Date.parse(last.date) - Date.parse(first.date)) / DAY_MS;
  if (days < MIN_SPAN_DAYS) return null;
  return (last.value - first.value) / days;
}

/**
 * Average distance per year between the first and the last reading. Returns null when the readings
 * span less than a month, because extrapolating a few days to a year is meaningless.
 */
export function averageDistancePerYear(readings: readonly OdometerPoint[]): number | null {
  const perDay = distancePerDay(readings);
  return perDay === null ? null : Math.round(perDay * 365);
}

/** Average distance per month (a twelfth of a year), with the same one-month minimum span. */
export function averageDistancePerMonth(readings: readonly OdometerPoint[]): number | null {
  const perDay = distancePerDay(readings);
  return perDay === null ? null : Math.round((perDay * 365) / 12);
}
