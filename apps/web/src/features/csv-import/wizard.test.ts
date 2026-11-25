import type { CsvImportSummary } from '@ikrive/shared';
import { CSV_REQUIRED_COLUMNS } from '@ikrive/shared/csv-import';
import { describe, expect, it } from 'vitest';
import {
  csvIssues,
  emptyMapping,
  importOptions,
  type MappingDraft,
  previewCounts,
  resultCounts,
  toMapping,
} from './wizard';

const summary = (changes: Partial<CsvImportSummary> = {}): CsvImportSummary => ({
  dryRun: true,
  format: 'fuelio',
  created: { odometer: 0, fuel: 0, maintenance: 0, expense: 0 },
  duplicates: 0,
  rejected: [],
  errors: [],
  skipped: [],
  droppedFuelFields: { notes: false, station: false },
  encodingReplaced: false,
  ...changes,
});

const draft = (changes: Partial<MappingDraft>): MappingDraft => ({
  ...emptyMapping,
  dateFormat: 'ymd',
  decimalSeparator: '.',
  ...changes,
});

describe('CSV import wizard', () => {
  it('maps a draft only when every required group is set', () => {
    expect(toMapping(emptyMapping, CSV_REQUIRED_COLUMNS)).toBeNull();

    expect(toMapping(draft({ kind: 'odometer', columns: { date: 0 } }), CSV_REQUIRED_COLUMNS)).toBeNull();
    expect(
      toMapping(draft({ kind: 'odometer', columns: { date: 0, value: 1 } }), CSV_REQUIRED_COLUMNS),
    ).toEqual({ kind: 'odometer', columns: { date: 0, value: 1 }, dateFormat: 'ymd', decimalSeparator: '.' });

    const fuel = { date: 0, odometer: 1, quantity: 2 };
    expect(toMapping(draft({ kind: 'fuel', columns: fuel }), CSV_REQUIRED_COLUMNS)).toBeNull();
    expect(
      toMapping(draft({ kind: 'fuel', columns: { ...fuel, totalPrice: 3 } }), CSV_REQUIRED_COLUMNS),
    ).toEqual(expect.objectContaining({ kind: 'fuel', columns: { ...fuel, totalPrice: 3 } }));
    expect(
      toMapping(draft({ kind: 'fuel', columns: { ...fuel, pricePerUnit: 4 } }), CSV_REQUIRED_COLUMNS),
    ).toEqual(expect.objectContaining({ kind: 'fuel' }));

    expect(toMapping(draft({ kind: 'maintenance', columns: { date: 0 } }), CSV_REQUIRED_COLUMNS)).toBeNull();
    expect(
      toMapping(draft({ kind: 'maintenance', columns: { date: 0, title: 2 } }), CSV_REQUIRED_COLUMNS),
    ).toEqual(expect.objectContaining({ kind: 'maintenance' }));

    const complete = { kind: 'odometer', columns: { date: 0, value: 1 } } as const;
    expect(toMapping(draft({ ...complete, dateFormat: '' }), CSV_REQUIRED_COLUMNS)).toBeNull();
    expect(toMapping(draft({ ...complete, decimalSeparator: '' }), CSV_REQUIRED_COLUMNS)).toBeNull();
  });

  it('builds the options of a detected and of a generic file', () => {
    expect(importOptions({ generic: false, mapping: emptyMapping }, CSV_REQUIRED_COLUMNS)).toEqual({});
    expect(
      importOptions(
        { generic: false, mapping: emptyMapping, dateFormat: 'dmy', decimalSeparator: ',' },
        CSV_REQUIRED_COLUMNS,
      ),
    ).toEqual({ dateFormat: 'dmy', decimalSeparator: ',' });

    expect(
      importOptions({ generic: true, mapping: draft({ kind: 'odometer' }) }, CSV_REQUIRED_COLUMNS),
    ).toBeNull();
    const mapping = draft({ kind: 'odometer', columns: { date: 1, value: 0 }, dateFormat: 'dmy' });
    // A detected file's options never leak into a generic one: the mapping carries its own.
    expect(
      importOptions(
        { generic: true, mapping, dateFormat: 'mdy', decimalSeparator: ',' },
        CSV_REQUIRED_COLUMNS,
      ),
    ).toEqual({
      mapping: { kind: 'odometer', columns: { date: 1, value: 0 }, dateFormat: 'dmy', decimalSeparator: '.' },
    });
  });

  it('counts valid, duplicate and error rows', () => {
    const s = summary({
      created: { odometer: 2, fuel: 5, maintenance: 1, expense: 0 },
      duplicates: 3,
      errors: [{ row: 4, code: 'invalid_date', field: 'date' }],
      rejected: [{ row: 7, kind: 'fuel', reason: 'future_date', conflict: null }],
      skipped: [{ row: 9, reason: 'income', label: null }],
    });

    expect(previewCounts(s)).toEqual({ valid: 8, duplicates: 3, errors: 2, skipped: 1 });
    expect(previewCounts(summary())).toEqual({ valid: 0, duplicates: 0, errors: 0, skipped: 0 });
  });

  it('counts created expenses', () => {
    const s = summary({ created: { odometer: 1, fuel: 2, maintenance: 3, expense: 4 }, duplicates: 2 });

    expect(previewCounts(s)).toEqual({ valid: 10, duplicates: 2, errors: 0, skipped: 0 });
    expect(
      previewCounts(summary({ created: { odometer: 0, fuel: 0, maintenance: 0, expense: 1 } })).valid,
    ).toBe(1);
    expect(resultCounts({ ...s, dryRun: false }).created).toEqual({
      odometer: 1,
      fuel: 2,
      maintenance: 3,
      expense: 4,
    });
  });

  it('counts created, omitted and errors of the result', () => {
    const s = summary({
      dryRun: false,
      created: { odometer: 2, fuel: 5, maintenance: 1, expense: 0 },
      duplicates: 3,
      errors: [{ row: 4, code: 'invalid_date', field: 'date' }],
      rejected: [
        { row: 7, kind: 'fuel', reason: 'future_date', conflict: null },
        {
          row: 8,
          kind: 'odometer',
          reason: 'odometer_conflict',
          conflict: { date: '2026-01-01', value: 900 },
        },
      ],
      skipped: [
        { row: 9, reason: 'income', label: null },
        { row: 10, reason: 'template', label: 'Seguro' },
      ],
    });

    expect(resultCounts(s)).toEqual({
      created: { odometer: 2, fuel: 5, maintenance: 1, expense: 0 },
      omitted: 5,
      errors: 3,
    });
  });

  it('lists issues by row up to the limit', () => {
    const s = summary({
      errors: [
        { row: 2, code: 'invalid_number', field: 'quantity' },
        { row: 6, code: 'malformed_row', field: null },
      ],
      rejected: [
        {
          row: 4,
          kind: 'odometer',
          reason: 'odometer_conflict',
          conflict: { date: '2026-01-01', value: 900 },
        },
      ],
      skipped: [{ row: 3, reason: 'template', label: 'ITV' }],
    });

    expect(csvIssues(s)).toEqual({
      total: 4,
      items: [
        { row: 2, type: 'error', code: 'invalid_number', field: 'quantity' },
        { row: 3, type: 'skipped', reason: 'template', label: 'ITV' },
        {
          row: 4,
          type: 'rejected',
          reason: 'odometer_conflict',
          conflict: { date: '2026-01-01', value: 900 },
        },
        { row: 6, type: 'error', code: 'malformed_row', field: null },
      ],
    });
    expect(csvIssues(s, 2)).toEqual({ total: 4, items: csvIssues(s).items.slice(0, 2) });

    const many = summary({
      errors: Array.from({ length: 60 }, (_, i) => ({
        row: 61 - i,
        code: 'invalid_date' as const,
        field: 'date',
      })),
    });
    const listed = csvIssues(many);
    expect(listed.total).toBe(60);
    expect(listed.items).toHaveLength(50);
    expect(listed.items.map((issue) => issue.row)).toEqual(Array.from({ length: 50 }, (_, i) => i + 2));
  });
});
