import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { csvImportSummarySchema } from '../schemas/csv-import';
import { csvImportProblemErrors, csvImportSummary, decodeCsv, planCsvImport } from './apply';
import { csvRowKey } from './keys';
import { parseCsvImport } from './parse';
import type { CsvImportResult, CsvRow } from './types';

const TODAY = '2025-06-30';
const target = { distance: 'km', quantity: 'l' } as const;
const fixtureBytes = (name: string) =>
  new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const none = { readings: [], fuelLogs: [], maintenance: [], expenses: [] };

const base = (sourceRow: number) => ({ sourceRow, sourceId: null, warnings: [] });
const fuel = (sourceRow: number, date: string, odometer: number, quantity = 40, totalPrice = 60): CsvRow => {
  const data = {
    date,
    odometer,
    quantity,
    totalPrice,
    pricePerUnit: totalPrice / quantity,
    fullTank: true,
    missedPrevious: false,
  };
  return { ...base(sourceRow), kind: 'fuel', data, key: csvRowKey({ kind: 'fuel', data }) };
};
const service = (
  sourceRow: number,
  date: string,
  odometer: number | null,
  title = 'Aceite',
  cost = 80,
): CsvRow => {
  const data = { date, odometer, category: 'oil_change' as const, title, cost, includeInReport: true };
  return { ...base(sourceRow), kind: 'maintenance', data, key: csvRowKey({ kind: 'maintenance', data }) };
};
const reading = (sourceRow: number, date: string, value: number): CsvRow => {
  const data = { date, value };
  return { ...base(sourceRow), kind: 'odometer', data, key: csvRowKey({ kind: 'odometer', data }) };
};
const expense = (sourceRow: number, date: string, title: string | null = 'Peaje', cost = 12.4): CsvRow => {
  const data = { date, category: 'tolls' as const, title, cost };
  return { ...base(sourceRow), kind: 'expense', data, key: csvRowKey({ kind: 'expense', data }) };
};
const rowsOf = (plan: { accepted: CsvRow[] }) => plan.accepted.map((row) => row.sourceRow);

function parsed(text: string): Extract<CsvImportResult, { status: 'parsed' }> {
  const result = parseCsvImport(text, { target });
  if (result.status !== 'parsed') throw new Error(result.status);
  return result;
}

describe('planCsvImport', () => {
  it('skips rows whose key is already stored', () => {
    const rows = [
      fuel(2, '2025-01-10', 10000),
      service(3, '2025-02-01', 10500),
      reading(4, '2025-03-01', 11000),
    ];
    const plan = planCsvImport(
      rows,
      {
        readings: [{ id: 'r1', date: '2025-03-01', value: 11000 }],
        fuelLogs: [{ date: '2025-01-10', odometer: 10000, quantity: 40, totalPrice: 60 }],
        maintenance: [{ date: '2025-02-01', odometer: 10500, title: '  ACEITE ', cost: 80 }],
        expenses: [],
      },
      TODAY,
    );
    expect(plan).toEqual({ accepted: [], duplicates: 3, rejected: [] });

    // The stored reading can be the linked one of a refuel (source `fuel`): a loose row repeating it is a duplicate.
    const linked = planCsvImport(
      [reading(5, '2025-01-10', 10000)],
      { ...none, readings: [{ id: 'f1', date: '2025-01-10', value: 10000 }] },
      TODAY,
    );
    expect(linked.duplicates).toBe(1);
  });

  it('keeps only the first of repeated rows', () => {
    const plan = planCsvImport(
      [
        fuel(2, '2025-01-10', 10000),
        fuel(3, '2025-01-10', 10000),
        reading(4, '2025-03-01', 11000),
        reading(5, '2025-03-01', 11000),
      ],
      none,
      TODAY,
    );
    expect(rowsOf(plan)).toEqual([2, 4]);
    expect(plan.duplicates).toBe(2);
  });

  it('treats an odometer row matching an accepted refuel as a duplicate', () => {
    // The loose reading comes first in the file, but refuels are processed before it.
    const plan = planCsvImport([reading(2, '2025-01-10', 10000), fuel(3, '2025-01-10', 10000)], none, TODAY);
    expect(rowsOf(plan)).toEqual([3]);
    expect(plan.duplicates).toBe(1);
  });

  it('plans refuels and maintenance before odometer rows', () => {
    const plan = planCsvImport(
      [
        reading(2, '2025-01-01', 500),
        service(3, '2025-02-01', null),
        fuel(4, '2025-01-15', 1000),
        reading(5, '2025-03-01', 2000),
      ],
      none,
      TODAY,
    );
    expect(rowsOf(plan)).toEqual([3, 4, 2, 5]);
  });

  it('rejects conflicts against stored and accepted readings', () => {
    const plan = planCsvImport(
      [
        fuel(2, '2025-01-10', 900), // lower than the stored reading of an earlier day
        fuel(3, '2025-02-01', 5000),
        reading(4, '2025-03-01', 4000), // lower than the accepted refuel of row 3
        service(5, '2025-02-15', 4500), // lower than the accepted refuel of row 3, on a later day
        service(6, '2025-02-20', null), // no odometer: nothing to contradict
      ],
      { ...none, readings: [{ id: 'r1', date: '2025-01-01', value: 1000 }] },
      TODAY,
    );
    expect(rowsOf(plan)).toEqual([3, 6]);
    expect(plan.rejected).toEqual([
      { row: 2, kind: 'fuel', reason: 'odometer_conflict', conflict: { date: '2025-01-01', value: 1000 } },
      {
        row: 5,
        kind: 'maintenance',
        reason: 'odometer_conflict',
        conflict: { date: '2025-02-01', value: 5000 },
      },
      {
        row: 4,
        kind: 'odometer',
        reason: 'odometer_conflict',
        conflict: { date: '2025-02-01', value: 5000 },
      },
    ]);
  });

  it('skips expenses already stored or repeated in the file', () => {
    const plan = planCsvImport(
      [
        expense(2, '2025-01-10', 'Seguro', 300), // stored, with another category and case
        expense(3, '2025-02-01'),
        expense(4, '2025-02-01'), // repeated in the file
        expense(5, '2025-02-01', 'Peaje', 9.9), // same day and title, another amount
        expense(6, '2025-03-01', null, 3),
        expense(7, '2025-03-01', null, 3), // two equal tickets without title count as one
        fuel(8, '2025-02-01', 10000),
      ],
      { ...none, expenses: [{ date: '2025-01-10', title: ' SEGURO', cost: 300 }] },
      TODAY,
    );
    expect(rowsOf(plan)).toEqual([3, 5, 6, 8]);
    expect(plan.duplicates).toBe(3);
    expect(plan.rejected).toEqual([]);
  });

  it('rejects future expenses', () => {
    const plan = planCsvImport(
      [expense(2, '2025-07-01'), expense(3, TODAY, 'Parking'), reading(4, '2025-06-15', 100)],
      // A stored reading that an odometer would contradict: an expense has none and is not compared.
      { ...none, readings: [{ id: 'r1', date: '2025-06-01', value: 50_000 }] },
      TODAY,
    );
    // Expenses go with refuels and maintenance, before the loose readings, and add no reading.
    expect(rowsOf(plan)).toEqual([3]);
    expect(plan.rejected).toEqual([
      { row: 2, kind: 'expense', reason: 'future_date', conflict: null },
      {
        row: 4,
        kind: 'odometer',
        reason: 'odometer_conflict',
        conflict: { date: '2025-06-01', value: 50_000 },
      },
    ]);
  });

  it('rejects future dates', () => {
    const plan = planCsvImport(
      [service(2, '2025-07-01', null), reading(3, TODAY, 100), reading(4, '2025-07-01', 200)],
      none,
      TODAY,
    );
    expect(rowsOf(plan)).toEqual([3]);
    expect(plan.rejected).toEqual([
      { row: 2, kind: 'maintenance', reason: 'future_date', conflict: null },
      { row: 4, kind: 'odometer', reason: 'future_date', conflict: null },
    ]);
  });
});

describe('csvImportSummary', () => {
  it('summarizes created rows by kind', () => {
    const result = parsed(new TextDecoder().decode(fixtureBytes('fuelio.csv')));
    const plan = planCsvImport(result.rows, none, '2026-01-01');
    const summary = csvImportSummary(result, plan, { dryRun: true, encodingReplaced: false });
    expect(csvImportSummarySchema.parse(summary)).toEqual(summary);
    expect(summary).toEqual({
      dryRun: true,
      format: 'fuelio',
      created: { odometer: 0, fuel: 2, maintenance: 2, expense: 1 },
      duplicates: 0,
      rejected: [],
      errors: result.errors,
      skipped: result.skipped,
      droppedFuelFields: result.droppedFuelFields,
      encodingReplaced: false,
    });
    expect(result.skipped.length).toBeGreaterThan(0);
  });

  it('summarizes created expenses', () => {
    const result = parsed(new TextDecoder().decode(fixtureBytes('lubelogger-tax.csv')));
    const summary = csvImportSummary(result, planCsvImport(result.rows, none, TODAY), {
      dryRun: false,
      encodingReplaced: false,
    });
    expect(csvImportSummarySchema.parse(summary)).toEqual(summary);
    expect(summary.created).toEqual({ odometer: 0, fuel: 0, maintenance: 0, expense: 1 });
    // A second import of the same rows creates nothing.
    const again = planCsvImport(
      result.rows,
      {
        ...none,
        expenses: result.rows.map((row) => row.data as { date: string; title: string; cost: number }),
      },
      TODAY,
    );
    expect(csvImportSummary(result, again, { dryRun: false, encodingReplaced: false })).toMatchObject({
      created: { odometer: 0, fuel: 0, maintenance: 0, expense: 0 },
      duplicates: 1,
    });
  });
});

describe('csvImportProblemErrors', () => {
  it('maps unparsed results to problem errors', () => {
    expect(csvImportProblemErrors({ status: 'unknown', headers: ['foo'] })).toEqual([
      { path: 'file', message: 'Unrecognized CSV format' },
    ]);
    expect(
      csvImportProblemErrors({
        status: 'needs_options',
        format: 'generic',
        headers: [],
        missing: ['dateFormat', 'decimalSeparator', 'columns.date'],
      }),
    ).toEqual([
      { path: 'dateFormat', message: 'Required' },
      { path: 'decimalSeparator', message: 'Required' },
      { path: 'mapping.columns.date', message: 'Required' },
    ]);
    expect(
      csvImportProblemErrors({
        status: 'unit_mismatch',
        format: 'fuelio',
        source: { distance: 'km', quantity: null },
        target: { distance: 'mi', quantity: 'l' },
      }),
    ).toEqual([
      { path: 'sourceUnits', message: 'The file units (km) differ from the vehicle units (mi, l)' },
    ]);
  });
});

describe('decodeCsv', () => {
  it('decodes UTF-8 with and without BOM', () => {
    const text = 'Date,Odometer,Description,Cost\n2025-02-15,30700,Revisión general,20.00\n';
    const bytes = new TextEncoder().encode(text);
    expect(decodeCsv(bytes)).toEqual({ text, replaced: false });
    expect(decodeCsv(new Uint8Array([0xef, 0xbb, 0xbf, ...bytes]))).toEqual({ text, replaced: false });
    // A U+FFFD written in a valid UTF-8 file is not a replaced byte.
    const written = `${text}�`;
    expect(decodeCsv(new TextEncoder().encode(written))).toEqual({ text: written, replaced: false });
  });

  it('flags replaced bytes of a Latin-1 file', () => {
    const { text, replaced } = decodeCsv(fixtureBytes('lubelogger-service-latin1.csv'));
    expect(replaced).toBe(true);
    expect(text).toContain('Revisi�n general');
    const result = parsed(text);
    const summary = csvImportSummary(result, planCsvImport(result.rows, none, TODAY), {
      dryRun: false,
      encodingReplaced: replaced,
    });
    expect(summary.encodingReplaced).toBe(true);
    expect(summary.created).toEqual({ odometer: 0, fuel: 0, maintenance: 2, expense: 0 });
  });
});
