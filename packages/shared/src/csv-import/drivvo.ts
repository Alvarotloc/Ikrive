import { resolveFuelPrices } from '../domain/fuel';
import { matchMaintenanceCategory } from './categories';
import type { CsvDocument, CsvRecord, CsvSection } from './tokenizer';
import type { CsvAdapter, CsvAdapterOutput, CsvImportedCells, CsvRowWarning, CsvValueContext } from './types';
import {
  attemptRow,
  CsvCellError,
  distanceFromHeader,
  normalizeText,
  readBoolean,
  readDate,
  readMaintenanceOdometer,
  readNumber,
  readOdometer,
} from './values';

const REFUEL_COLUMNS = 21;
const EXPENSE_COLUMNS = 7;
const SERVICE_COLUMNS = 6;
const MIN_REFUEL_FIELDS = 7;
/** First column of each of the three fuels of a refuel row: name, price, total, volume, full. */
const FUEL_SLOTS = [2, 7, 12] as const;
const EFFICIENCY_FREE_NUMBERS = [3, 4, 5, 8, 9, 10, 13, 14, 15] as const;
const STATION = 18;
const NOTES = 20;

/** A `Map` because the key comes from the file: an object would also match `constructor`. */
const NAMED_SECTIONS = new Map<string, DrivvoSectionKind>([
  ['refuelling', 'refuel'],
  ['reabastecimiento', 'refuel'],
  ['expense', 'expense'],
  ['service', 'service'],
  ['servicio', 'service'],
]);

export type DrivvoSectionKind = 'refuel' | 'expense' | 'service';

const cell = (record: CsvRecord, index: number) => (record.fields[index] ?? '').trim();

/** By known name or, when translated, by column count and an ISO date in the second column. */
export function drivvoSectionKind(section: CsvSection): DrivvoSectionKind | null {
  const named = NAMED_SECTIONS.get(section.name);
  if (named) return named;
  const [header, firstRow] = section.records;
  if (!header || !firstRow || !/^\d{4}-\d{2}-\d{2}(?!\d)/.test(cell(firstRow, 1))) return null;
  if (header.fields.length === REFUEL_COLUMNS) return 'refuel';
  if (header.fields.length === EXPENSE_COLUMNS) return 'expense';
  return header.fields.length === SERVICE_COLUMNS ? 'service' : null;
}

export const isDrivvoRefuelSection = (section: CsvSection) =>
  drivvoSectionKind(section) === 'refuel' && section.records[0]?.fields.length === REFUEL_COLUMNS;

const sectionsOf = (doc: CsvDocument, kind: DrivvoSectionKind) =>
  doc.sections.filter((section) => drivvoSectionKind(section) === kind);

const validRefuelShape = (record: CsvRecord) =>
  record.fields.length >= MIN_REFUEL_FIELDS && record.fields.length <= REFUEL_COLUMNS;

const isZeroOrBlank = (raw: string) => /^[\s0.,]*$/.test(raw);

/** A fuel slot counts when any of its amounts has a value: exports may pad unused slots with 0. */
const presentSlots = (record: CsvRecord) =>
  FUEL_SLOTS.filter(
    (start) =>
      !isZeroOrBlank(cell(record, start + 1)) ||
      !isZeroOrBlank(cell(record, start + 2)) ||
      !isZeroOrBlank(cell(record, start + 3)),
  );

const isElectric = (name: string) => /electr|eletr|kwh/.test(normalizeText(name));

/** The schema only sees the merged sum, where a negative would be offset by the other fuels. */
function readFuelAmount(raw: string, context: CsvValueContext, field: string) {
  const value = readNumber(raw, context, field);
  if (value !== undefined && value < 0) throw new CsvCellError('out_of_range', field);
  return value;
}

function readRefuel(record: CsvRecord, context: CsvValueContext, warnings: CsvRowWarning[]) {
  const date = readDate(cell(record, 1), context.dateFormat);
  const odometer = readOdometer(cell(record, 0), context, warnings);
  const slots = presentSlots(record);
  const electric = slots.filter((start) => isElectric(cell(record, start)));
  if (electric.length > 0 && electric.length < slots.length) {
    throw new CsvCellError('mixed_fuel_units', 'quantity');
  }
  if (slots.length <= 1) {
    const start = slots[0] ?? FUEL_SLOTS[0];
    return {
      date,
      odometer,
      quantity: readNumber(cell(record, start + 3), context, 'quantity'),
      totalPrice: readNumber(cell(record, start + 2), context, 'totalPrice'),
      pricePerUnit: readNumber(cell(record, start + 1), context, 'pricePerUnit'),
      fullTank: readBoolean(cell(record, start + 4), 'fullTank'),
    };
  }
  let quantity = 0;
  let totalPrice = 0;
  let fullTank = false;
  for (const start of slots) {
    const volume = readFuelAmount(cell(record, start + 3), context, 'quantity');
    if (volume === undefined) throw new CsvCellError('missing_field', 'quantity');
    const price = readFuelAmount(cell(record, start + 1), context, 'pricePerUnit');
    const total = readFuelAmount(cell(record, start + 2), context, 'totalPrice');
    if (!total && !price) throw new CsvCellError('missing_field', 'totalPrice');
    // Money without volume would inflate the weighted average price of the merged refuel.
    if (volume === 0 && total) throw new CsvCellError('out_of_range', 'quantity');
    quantity += volume;
    // Exports may pad a missing total with 0: the price and the volume still give the real one.
    totalPrice += total || resolveFuelPrices({ quantity: volume, pricePerUnit: price ?? 0 }).totalPrice;
    fullTank ||= readBoolean(cell(record, start + 4), 'fullTank') === true;
  }
  warnings.push('merged_fuels');
  const merged = {
    quantity: Math.round(quantity * 1000) / 1000,
    totalPrice: Math.round(totalPrice * 100) / 100,
  };
  return { date, odometer, ...merged, ...resolveFuelPrices(merged), fullTank };
}

export const drivvoAdapter: CsvAdapter = {
  format: 'drivvo',

  headers: (doc) => (sectionsOf(doc, 'refuel')[0]?.records[0]?.fields ?? []).map((field) => field.trim()),

  declaredDateFormat: () => null,

  sourceUnits: (doc) => ({
    distance: distanceFromHeader(sectionsOf(doc, 'refuel')[0]?.records[0]?.fields[0] ?? ''),
    quantity: null,
  }),

  collectImportedCells: (doc) => {
    const cells: CsvImportedCells = { dates: [], numbers: [] };
    for (const section of sectionsOf(doc, 'refuel')) {
      for (const record of section.records.slice(1).filter(validRefuelShape)) {
        cells.dates.push(cell(record, 1));
        cells.numbers.push({ column: 'odometer', raw: cell(record, 0) });
        for (const index of EFFICIENCY_FREE_NUMBERS) {
          const offset = (index - 3) % 5;
          const column = offset === 0 ? 'pricePerUnit' : offset === 1 ? 'totalPrice' : 'quantity';
          cells.numbers.push({ column, raw: cell(record, index) });
        }
      }
    }
    for (const section of sectionsOf(doc, 'service')) {
      for (const record of section.records.slice(1)) {
        cells.dates.push(cell(record, 1));
        cells.numbers.push(
          { column: 'odometer', raw: cell(record, 0) },
          { column: 'cost', raw: cell(record, 2) },
        );
      }
    }
    return cells;
  },

  normalize: (doc, context) => {
    const output: CsvAdapterOutput = { drafts: [], errors: [], skipped: [] };
    for (const section of sectionsOf(doc, 'refuel')) {
      for (const record of section.records.slice(1)) {
        if (!validRefuelShape(record)) {
          output.errors.push({ row: record.line, code: 'malformed_row', field: null });
          continue;
        }
        attemptRow(record.line, output.errors, () => {
          const warnings: CsvRowWarning[] = [];
          const input = readRefuel(record, context, warnings);
          output.drafts.push({
            sourceRow: record.line,
            sourceId: null,
            kind: 'fuel',
            input,
            warnings,
            dropped: { notes: cell(record, NOTES) !== '', station: cell(record, STATION) !== '' },
          });
        });
      }
    }
    for (const section of sectionsOf(doc, 'expense')) {
      for (const record of section.records.slice(1)) {
        output.skipped.push({ row: record.line, reason: 'not_maintenance', label: cell(record, 3) || null });
      }
    }
    for (const section of sectionsOf(doc, 'service')) {
      for (const record of section.records.slice(1)) {
        attemptRow(record.line, output.errors, () => {
          const warnings: CsvRowWarning[] = [];
          const title = cell(record, 3);
          const input = {
            date: readDate(cell(record, 1), context.dateFormat),
            odometer: readMaintenanceOdometer(cell(record, 0), context, warnings),
            category: matchMaintenanceCategory(title) ?? 'other',
            title: title || undefined,
            description: cell(record, 5),
            workshop: cell(record, 4),
            cost: readNumber(cell(record, 2), context, 'cost') ?? null,
          };
          output.drafts.push({
            sourceRow: record.line,
            sourceId: null,
            kind: 'maintenance',
            input,
            warnings,
            dropped: { notes: false, station: false },
          });
        });
      }
    }
    return output;
  },
};
