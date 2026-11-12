import type { OdometerSource } from '../enums';
import { findOdometerConflict, type OdometerPoint } from './odometer';

/** Why a write with an odometer value (manual reading, maintenance or refuel) is rejected. */
export type OdometerWriteError = { kind: 'future_date' } | { kind: 'conflict'; conflict: OdometerPoint };

/**
 * Validates the resulting date and odometer of a write before anything is stored: the date cannot be
 * after today and the odometer cannot contradict the vehicle's readings. The write's own linked reading
 * (`ownReadingId`) is left out of the comparison, so moving it does not conflict with its previous value.
 */
export function validateOdometerWrite({
  readings,
  ownReadingId = null,
  date,
  odometer,
  today,
}: {
  readings: readonly (OdometerPoint & { id: string })[];
  ownReadingId?: string | null;
  date: string;
  odometer: number | null | undefined;
  today: string;
}): OdometerWriteError | null {
  if (date > today) return { kind: 'future_date' };
  if (odometer == null) return null;
  const others = readings.filter((reading) => reading.id !== ownReadingId);
  const conflict = findOdometerConflict(others, { date, value: odometer });
  return conflict ? { kind: 'conflict', conflict } : null;
}

/** Error message of an odometer conflict, the same for every kind of write. */
export const odometerConflictMessage = (conflict: OdometerPoint) =>
  `The odometer cannot go backwards: there is a reading of ${conflict.value} on ${conflict.date}`;

/** What to do with the linked odometer reading of an edited record. */
export type ReadingChange =
  | { kind: 'keep' }
  | { kind: 'remove' }
  | { kind: 'upsert'; date: string; value: number };

/**
 * Change to the linked reading of an edited maintenance record: clearing the odometer removes it,
 * a changed date or odometer writes it (creating it if the record had none), anything else keeps it.
 */
export function maintenanceReadingChange(
  record: { date: string; odometer: number | null },
  input: { date?: string; odometer?: number | null },
): ReadingChange {
  if (input.odometer === null) return { kind: 'remove' };
  const date = input.date ?? record.date;
  const odometer = input.odometer === undefined ? record.odometer : input.odometer;
  if (odometer != null && (date !== record.date || odometer !== record.odometer)) {
    return { kind: 'upsert', date, value: odometer };
  }
  return { kind: 'keep' };
}

/**
 * Change to the linked reading of an edited fuel log. Its odometer cannot be cleared, so there is no
 * `remove`; a log that somehow lost its reading gets it back on its next date or odometer change.
 */
export function fuelReadingChange(
  log: { date: string; odometer: number },
  input: { date?: string; odometer?: number },
): Extract<ReadingChange, { kind: 'keep' | 'upsert' }> {
  const date = input.date ?? log.date;
  const odometer = input.odometer ?? log.odometer;
  return date !== log.date || odometer !== log.odometer
    ? { kind: 'upsert', date, value: odometer }
    : { kind: 'keep' };
}

/** Only manual readings can be deleted; the others belong to a record and go with it. */
export const canDeleteOdometerReading = (reading: { source: OdometerSource }) => reading.source === 'manual';

/** First reading of a new vehicle, from its current odometer, dated today. */
export function initialOdometerReading(
  currentOdometer: number | null | undefined,
  today: string,
): { date: string; value: number; source: 'manual' } | undefined {
  return currentOdometer == null ? undefined : { date: today, value: currentOdometer, source: 'manual' };
}
