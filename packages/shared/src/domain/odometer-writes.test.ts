import { describe, expect, it } from 'vitest';
import {
  canDeleteOdometerReading,
  fuelReadingChange,
  initialOdometerReading,
  maintenanceReadingChange,
  odometerConflictMessage,
  validateOdometerWrite,
} from './odometer-writes';

const readings = [
  { id: 'r1', date: '2026-01-10', value: 10_000 },
  { id: 'r2', date: '2026-03-10', value: 12_000 },
];
const today = '2026-04-01';

describe('validateOdometerWrite', () => {
  it('rejects a future date', () => {
    expect(validateOdometerWrite({ readings, date: '2026-04-02', odometer: 13_000, today })).toEqual({
      kind: 'future_date',
    });
    expect(validateOdometerWrite({ readings, date: '2026-04-02', odometer: undefined, today })).toEqual({
      kind: 'future_date',
    });
  });

  it('accepts today', () => {
    expect(validateOdometerWrite({ readings, date: today, odometer: 13_000, today })).toBeNull();
  });

  it('reports a conflicting reading', () => {
    expect(validateOdometerWrite({ readings, date: '2026-02-01', odometer: 13_000, today })).toEqual({
      kind: 'conflict',
      conflict: readings[1],
    });
    expect(odometerConflictMessage({ date: '2026-03-10', value: 12_000 })).toBe(
      'The odometer cannot go backwards: there is a reading of 12000 on 2026-03-10',
    );
  });

  it('ignores its own reading', () => {
    expect(
      validateOdometerWrite({ readings, ownReadingId: 'r2', date: '2026-02-01', odometer: 13_000, today }),
    ).toBeNull();
  });

  it('skips the check without odometer', () => {
    expect(validateOdometerWrite({ readings, date: '2026-02-01', odometer: null, today })).toBeNull();
    expect(validateOdometerWrite({ readings, date: '2026-02-01', odometer: undefined, today })).toBeNull();
  });
});

describe('maintenanceReadingChange', () => {
  const record = { date: '2026-02-01', odometer: 11_000 };

  it('maintenance: removes the reading when odometer is cleared', () => {
    expect(maintenanceReadingChange(record, { odometer: null })).toEqual({ kind: 'remove' });
    expect(maintenanceReadingChange({ date: '2026-02-01', odometer: null }, { odometer: null })).toEqual({
      kind: 'remove',
    });
  });

  it('maintenance: upserts on date or odometer change', () => {
    expect(maintenanceReadingChange(record, { date: '2026-02-02' })).toEqual({
      kind: 'upsert',
      date: '2026-02-02',
      value: 11_000,
    });
    expect(maintenanceReadingChange(record, { odometer: 11_500 })).toEqual({
      kind: 'upsert',
      date: '2026-02-01',
      value: 11_500,
    });
    expect(maintenanceReadingChange({ date: '2026-02-01', odometer: null }, { odometer: 11_500 })).toEqual({
      kind: 'upsert',
      date: '2026-02-01',
      value: 11_500,
    });
  });

  it('maintenance: keeps when nothing changes', () => {
    expect(maintenanceReadingChange(record, {})).toEqual({ kind: 'keep' });
    expect(maintenanceReadingChange(record, { date: '2026-02-01', odometer: 11_000 })).toEqual({
      kind: 'keep',
    });
    // Without a resulting odometer there is no reading to write.
    expect(maintenanceReadingChange({ date: '2026-02-01', odometer: null }, { date: '2026-02-05' })).toEqual({
      kind: 'keep',
    });
  });
});

describe('fuelReadingChange', () => {
  const log = { date: '2026-02-01', odometer: 11_000 };

  it('fuel: upserts on date or odometer change', () => {
    expect(fuelReadingChange(log, { date: '2026-02-02' })).toEqual({
      kind: 'upsert',
      date: '2026-02-02',
      value: 11_000,
    });
    expect(fuelReadingChange(log, { odometer: 11_200 })).toEqual({
      kind: 'upsert',
      date: '2026-02-01',
      value: 11_200,
    });
  });

  it('fuel: keeps when nothing changes', () => {
    expect(fuelReadingChange(log, {})).toEqual({ kind: 'keep' });
    expect(fuelReadingChange(log, { date: '2026-02-01', odometer: 11_000 })).toEqual({ kind: 'keep' });
  });
});

describe('canDeleteOdometerReading', () => {
  it('only manual readings are deletable', () => {
    expect(canDeleteOdometerReading({ source: 'manual' })).toBe(true);
    expect(canDeleteOdometerReading({ source: 'fuel' })).toBe(false);
    expect(canDeleteOdometerReading({ source: 'maintenance' })).toBe(false);
  });
});

describe('initialOdometerReading', () => {
  it('builds the initial manual reading', () => {
    expect(initialOdometerReading(5_000, today)).toEqual({ date: today, value: 5_000, source: 'manual' });
    expect(initialOdometerReading(0, today)).toEqual({ date: today, value: 0, source: 'manual' });
    expect(initialOdometerReading(null, today)).toBeUndefined();
    expect(initialOdometerReading(undefined, today)).toBeUndefined();
  });
});
