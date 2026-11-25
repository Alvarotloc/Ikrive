import type { FuelQuantityUnit } from '../enums';
import { matchMaintenanceCategory } from './categories';
import type { CsvDocument, CsvRecord } from './tokenizer';
import type {
  CsvAdapter,
  CsvAdapterOutput,
  CsvImportedCells,
  CsvRowKind,
  CsvRowWarning,
  CsvValueContext,
} from './types';
import {
  attemptRow,
  readBoolean,
  readDate,
  readMaintenanceOdometer,
  readNumber,
  readOdometer,
} from './values';

const DATE = ['date', 'fuelup_date'];
const ODOMETER = ['odometer', 'odo'];
const VOLUME = ['fuelconsumed', 'gallons', 'liters', 'litres', 'consumption', 'quantity', 'qty'];
const COST = ['cost', 'total cost', 'totalcost', 'total price', 'price'];
const FULL = ['isfilltofull', 'filled up'];
const PARTIAL = ['partial_fuelup', 'partial tank', 'partial_fill'];
const MISSED = ['missed_fuelup', 'missedfuelup', 'missed fill up', 'missed_fill'];
const NOTES = ['notes', 'note'];
const VOLUME_UNITS: Record<string, FuelQuantityUnit> = { liters: 'l', litres: 'l', gallons: 'gal' };

export type LubeLoggerRecordType = 'fuel' | 'service' | 'odometer' | 'tax';

const headerKeys = (header: string[]) => header.map((name) => name.trim().toLowerCase());

const findAlias = (keys: string[], aliases: string[]) => {
  for (const alias of aliases) {
    const index = keys.indexOf(alias);
    if (index >= 0) return index;
  }
  return -1;
};

const dateParts = (keys: string[]) => ({
  day: keys.indexOf('day'),
  month: keys.indexOf('month'),
  year: keys.indexOf('year'),
});

const hasDate = (keys: string[]) => {
  const { day, month, year } = dateParts(keys);
  return findAlias(keys, DATE) >= 0 || (day >= 0 && month >= 0 && year >= 0);
};

/** Record type deduced from the columns; `null` when they are not a LubeLogger record. */
export function lubeLoggerRecordType(header: string[]): LubeLoggerRecordType | null {
  const keys = headerKeys(header);
  if (!hasDate(keys)) return null;
  const odometer = findAlias(keys, ODOMETER) >= 0;
  const cost = findAlias(keys, COST) >= 0;
  const description = keys.includes('description');
  if (findAlias(keys, VOLUME) >= 0) return 'fuel';
  if (odometer && description && cost) return 'service';
  if (odometer && !cost) return 'odometer';
  if (description && cost && !odometer) return 'tax';
  return null;
}

const cell = (record: CsvRecord, index: number) => (index < 0 ? '' : (record.fields[index] ?? '').trim());

const table = (doc: CsvDocument) => {
  const [head, ...rows] = doc.preamble;
  const keys = headerKeys(head?.fields ?? []);
  return {
    type: lubeLoggerRecordType(head?.fields ?? []),
    keys,
    rows,
    date: findAlias(keys, DATE),
    parts: dateParts(keys),
    odometer: findAlias(keys, ODOMETER),
    volume: findAlias(keys, VOLUME),
    cost: findAlias(keys, COST),
    full: findAlias(keys, FULL),
    partial: findAlias(keys, PARTIAL),
    missed: findAlias(keys, MISSED),
    description: keys.indexOf('description'),
    notes: findAlias(keys, NOTES),
  };
};

type Table = ReturnType<typeof table>;

/** `day`+`month`+`year` composed as ISO; `null` when the parts are not numbers. */
const composedDate = (record: CsvRecord, { parts }: Table) => {
  const [day, month, year] = [cell(record, parts.day), cell(record, parts.month), cell(record, parts.year)];
  if (!/^\d{1,2}$/.test(day) || !/^\d{1,2}$/.test(month) || !/^\d{4}$/.test(year)) return null;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

const rawDate = (record: CsvRecord, columns: Table) =>
  columns.date >= 0 ? cell(record, columns.date) : (composedDate(record, columns) ?? '');

function readRowDate(record: CsvRecord, columns: Table, context: CsvValueContext) {
  if (columns.date >= 0) return readDate(cell(record, columns.date), context.dateFormat);
  // Built from separate columns, so it is ISO whatever date format was chosen.
  return readDate(composedDate(record, columns) ?? 'invalid', 'ymd');
}

function readFullTank(record: CsvRecord, columns: Table) {
  if (columns.full >= 0) return readBoolean(cell(record, columns.full), 'fullTank');
  const partial = readBoolean(cell(record, columns.partial), 'fullTank');
  return partial === undefined ? undefined : !partial;
}

const KIND_BY_TYPE: Record<LubeLoggerRecordType, CsvRowKind> = {
  fuel: 'fuel',
  service: 'maintenance',
  odometer: 'odometer',
  tax: 'expense',
};

export const lubeLoggerAdapter: CsvAdapter = {
  format: 'lubelogger',

  headers: (doc) => (doc.preamble[0]?.fields ?? []).map((field) => field.trim()),

  declaredDateFormat: () => null,

  sourceUnits: (doc) => {
    const columns = table(doc);
    const volume = columns.keys[columns.volume];
    return { distance: null, quantity: (volume && VOLUME_UNITS[volume]) || null };
  },

  collectImportedCells: (doc) => {
    const columns = table(doc);
    const cells: CsvImportedCells = { dates: [], numbers: [] };
    if (columns.type === null) return cells;
    for (const record of columns.rows) {
      cells.dates.push(rawDate(record, columns));
      // A tax record has no odometer.
      if (columns.type !== 'tax')
        cells.numbers.push({ column: 'odometer', raw: cell(record, columns.odometer) });
      if (columns.type === 'fuel') {
        cells.numbers.push(
          { column: 'quantity', raw: cell(record, columns.volume) },
          { column: 'totalPrice', raw: cell(record, columns.cost) },
        );
      } else if (columns.type === 'service' || columns.type === 'tax') {
        cells.numbers.push({ column: 'cost', raw: cell(record, columns.cost) });
      }
    }
    return cells;
  },

  normalize: (doc, context) => {
    const columns = table(doc);
    const output: CsvAdapterOutput = { drafts: [], errors: [], skipped: [] };
    const { type } = columns;
    if (type === null) return output;
    for (const record of columns.rows) {
      attemptRow(record.line, output.errors, () => {
        const warnings: CsvRowWarning[] = [];
        const date = readRowDate(record, columns, context);
        let input: Record<string, unknown>;
        if (type === 'fuel') {
          input = {
            date,
            odometer: readOdometer(cell(record, columns.odometer), context, warnings),
            quantity: readNumber(cell(record, columns.volume), context, 'quantity'),
            totalPrice: readNumber(cell(record, columns.cost), context, 'totalPrice'),
            fullTank: readFullTank(record, columns),
            missedPrevious: readBoolean(cell(record, columns.missed), 'missedPrevious'),
          };
        } else if (type === 'service') {
          const title = cell(record, columns.description);
          input = {
            date,
            odometer: readMaintenanceOdometer(cell(record, columns.odometer), context, warnings),
            category: matchMaintenanceCategory(title) ?? 'other',
            title: title || undefined,
            description: cell(record, columns.notes),
            cost: readNumber(cell(record, columns.cost), context, 'cost') ?? null,
          };
        } else if (type === 'tax') {
          input = {
            date,
            category: 'tax',
            title: cell(record, columns.description),
            description: cell(record, columns.notes),
            cost: readNumber(cell(record, columns.cost), context, 'cost'),
          };
        } else {
          input = { date, value: readOdometer(cell(record, columns.odometer), context, warnings, 'value') };
        }
        output.drafts.push({
          sourceRow: record.line,
          sourceId: null,
          kind: KIND_BY_TYPE[type],
          input,
          warnings,
          dropped: { notes: type === 'fuel' && cell(record, columns.notes) !== '', station: false },
        });
      });
    }
    return output;
  },
};
