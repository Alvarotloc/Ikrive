import type { MaintenanceRecord } from '@ikrive/shared';
import { describe, expect, it } from 'vitest';
import {
  availableCategories,
  filterRecords,
  groupByYear,
  recordDetails,
  resolveFilter,
  sortRecords,
} from './timeline';

const record = (overrides: Partial<MaintenanceRecord>): MaintenanceRecord => ({
  id: 'r1',
  vehicleId: 'v1',
  date: '2025-03-10',
  odometer: null,
  category: 'oil_change',
  title: 'Cambio de aceite',
  description: null,
  workshop: null,
  cost: null,
  includeInReport: true,
  scheduleId: null,
  createdAt: '2025-03-10T10:00:00.000Z',
  updatedAt: '2025-03-10T10:00:00.000Z',
  ...overrides,
});

const ids = (records: MaintenanceRecord[]) => records.map((r) => r.id);

describe('maintenance timeline', () => {
  it('sorts records by date and creation date descending', () => {
    const records = [
      record({ id: 'old', date: '2024-05-01' }),
      record({ id: 'same-early', date: '2025-06-01', createdAt: '2025-06-01T08:00:00.000Z' }),
      record({ id: 'same-late', date: '2025-06-01', createdAt: '2025-06-01T18:00:00.000Z' }),
      record({ id: 'mid', date: '2025-01-15' }),
    ];

    expect(ids(sortRecords(records))).toEqual(['same-late', 'same-early', 'mid', 'old']);
    expect(ids(records)).toEqual(['old', 'same-early', 'same-late', 'mid']);
  });

  it('groups records by year in descending order', () => {
    const groups = groupByYear([
      record({ id: 'a', date: '2023-02-01' }),
      record({ id: 'b', date: '2025-09-01' }),
      record({ id: 'c', date: '2025-01-01' }),
      record({ id: 'd', date: '2024-07-01' }),
    ]);

    expect(groups.map((g) => ({ year: g.year, ids: ids(g.records) }))).toEqual([
      { year: '2025', ids: ['b', 'c'] },
      { year: '2024', ids: ['d'] },
      { year: '2023', ids: ['a'] },
    ]);
  });

  it('lists only present categories in MAINTENANCE_CATEGORIES order', () => {
    const records = [
      record({ category: 'other' }),
      record({ category: 'brakes' }),
      record({ category: 'oil_change' }),
      record({ category: 'brakes' }),
    ];

    expect(availableCategories(records)).toEqual(['oil_change', 'brakes', 'other']);
    expect(availableCategories([])).toEqual([]);
  });

  it('filters records by category', () => {
    const records = [
      record({ id: 'oil', category: 'oil_change' }),
      record({ id: 'tires', category: 'tires' }),
      record({ id: 'oil2', category: 'oil_change' }),
    ];

    expect(ids(filterRecords(records, 'oil_change'))).toEqual(['oil', 'oil2']);
    expect(ids(filterRecords(records, 'all'))).toEqual(['oil', 'tires', 'oil2']);
  });

  it('falls back to all when the selected category has no records', () => {
    expect(resolveFilter('brakes', ['oil_change', 'tires'])).toBe('all');
    expect(resolveFilter('tires', ['oil_change', 'tires'])).toBe('tires');
    expect(resolveFilter('all', [])).toBe('all');
  });

  it('formats details skipping missing odometer, workshop and cost', () => {
    const fmt = { distance: (n: number) => `${n} km`, money: (n: number) => `${n} €` };

    expect(recordDetails(record({ odometer: 120_000, workshop: 'Taller Paco', cost: 89.9 }), fmt)).toEqual([
      '120000 km',
      'Taller Paco',
      '89.9 €',
    ]);
    expect(recordDetails(record({ workshop: 'Taller Paco' }), fmt)).toEqual(['Taller Paco']);
    expect(recordDetails(record({ odometer: 0, cost: 0 }), fmt)).toEqual(['0 km', '0 €']);
    expect(recordDetails(record({}), fmt)).toEqual([]);
  });
});
