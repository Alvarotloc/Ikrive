import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  CsvColumn,
  CsvDateFormat,
  CsvDecimalSeparator,
  CsvFormat,
  CsvGenericMapping,
  CsvImportOptions,
  CsvRowError,
  CsvRowKind,
  CsvSkippedRow,
} from '../csv-import/types';
import {
  CSV_COLUMNS,
  type CSV_DATE_FORMATS,
  type CSV_DECIMAL_SEPARATORS,
  type CSV_FORMATS,
  type CSV_ROW_ERROR_CODES,
  type CSV_ROW_KINDS,
  type CSV_SKIP_REASONS,
  type CsvImportRequest,
  type CsvImportSummary,
  csvImportRequestSchema,
} from './csv-import';

describe('csv import schemas', () => {
  it('matches the parser unions', () => {
    expectTypeOf<(typeof CSV_FORMATS)[number]>().toEqualTypeOf<CsvFormat>();
    expectTypeOf<(typeof CSV_ROW_KINDS)[number]>().toEqualTypeOf<CsvRowKind>();
    expectTypeOf<(typeof CSV_DATE_FORMATS)[number]>().toEqualTypeOf<CsvDateFormat>();
    expectTypeOf<(typeof CSV_DECIMAL_SEPARATORS)[number]>().toEqualTypeOf<CsvDecimalSeparator>();
    expectTypeOf<(typeof CSV_COLUMNS)[number]>().toEqualTypeOf<CsvColumn>();
    expectTypeOf<(typeof CSV_ROW_ERROR_CODES)[number]>().toEqualTypeOf<CsvRowError['code']>();
    expectTypeOf<(typeof CSV_SKIP_REASONS)[number]>().toEqualTypeOf<CsvSkippedRow['reason']>();
    expectTypeOf<NonNullable<CsvImportRequest['mapping']>>().toEqualTypeOf<CsvGenericMapping>();
    expectTypeOf<CsvImportRequest['sourceUnits']>().toEqualTypeOf<CsvImportOptions['sourceUnits']>();
    expectTypeOf<CsvImportSummary['errors'][number]>().toEqualTypeOf<CsvRowError>();
    expectTypeOf<CsvImportSummary['skipped'][number]>().toEqualTypeOf<CsvSkippedRow>();
    expect(new Set(CSV_COLUMNS).size).toBe(CSV_COLUMNS.length);
  });

  it('accepts the parser options and defaults dryRun to false', () => {
    expect(csvImportRequestSchema.parse({})).toEqual({ dryRun: false });
    const options = {
      dryRun: true,
      dateFormat: 'dmy',
      decimalSeparator: ',',
      sourceUnits: { distance: 'mi', quantity: null },
      mapping: { kind: 'fuel', columns: { date: 0, odometer: 2 }, dateFormat: 'ymd', decimalSeparator: '.' },
    } as const;
    expect(csvImportRequestSchema.parse(options)).toEqual(options);
  });

  it('rejects unknown options', () => {
    const paths = (value: unknown) => {
      const result = csvImportRequestSchema.safeParse(value);
      expect(result.success).toBe(false);
      return result.error?.issues.map((issue) => issue.path.join('.'));
    };
    expect(paths({ target: { distance: 'km', quantity: 'l' } })).toEqual(['']);
    expect(paths({ dateFormat: 'yyyy-mm-dd' })).toEqual(['dateFormat']);
    expect(paths({ sourceUnits: { distance: 'parsec' } })).toEqual(['sourceUnits.distance']);
    expect(
      paths({ mapping: { kind: 'fuel', columns: { date: -1 }, dateFormat: 'ymd', decimalSeparator: '.' } }),
    ).toEqual(['mapping.columns.date']);
    expect(
      paths({ mapping: { kind: 'fuel', columns: { colour: 1 }, dateFormat: 'ymd', decimalSeparator: '.' } }),
    ).toEqual(['mapping.columns']);
  });
});
