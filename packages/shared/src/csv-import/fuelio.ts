import type { MaintenanceCategory } from '../enums';
import { matchMaintenanceCategory } from './categories';
import type { CsvRecord, CsvSection } from './tokenizer';
import type { CsvAdapter, CsvAdapterOutput, CsvImportedCells, CsvRowWarning, CsvSkippedRow } from './types';
import {
  attemptRow,
  CsvCellError,
  declaredDateFormat,
  distanceFromHeader,
  parseBoolean,
  readBoolean,
  readDate,
  readMaintenanceOdometer,
  readNumber,
  readOdometer,
} from './values';

const columnKey = (header: string) =>
  header
    .toLowerCase()
    .replace(/\(optional\)/g, '')
    .replace(/\s+/g, '');

/** Index by normalized name; a unit in brackets (`Odo (km)`) is allowed after it. */
const findColumn = (header: string[], ...names: string[]) => {
  const keys = header.map(columnKey);
  return keys.findIndex((key) => names.some((name) => key === name || key.startsWith(`${name}(`)));
};

const cell = (record: CsvRecord, index: number) => (index < 0 ? '' : (record.fields[index] ?? '').trim());

const section = (sections: CsvSection[], name: string) => sections.find((item) => item.name === name);

/** Whether a `## Log` header has the columns of a Fuelio log. */
export const isFuelioLogHeader = (header: string[]) =>
  findColumn(header, 'data', 'date') >= 0 && findColumn(header, 'odo') >= 0;

const logTable = (sections: CsvSection[]) => {
  const log = section(sections, 'log');
  const header = log?.records[0]?.fields;
  if (!log || !header) return null;
  return {
    header,
    rows: log.records.slice(1),
    date: findColumn(header, 'data', 'date'),
    odometer: findColumn(header, 'odo'),
    quantity: findColumn(header, 'fuel'),
    full: findColumn(header, 'full'),
    price: findColumn(header, 'price'),
    volumePrice: findColumn(header, 'volumeprice'),
    missed: findColumn(header, 'missed'),
    city: findColumn(header, 'city'),
    notes: findColumn(header, 'notes'),
    station: findColumn(header, 'stationid'),
    uniqueId: findColumn(header, 'uniqueid'),
  };
};

const costCategories = (sections: CsvSection[]) => {
  const categories = section(sections, 'costcategories');
  const names = new Map<string, string>();
  const header = categories?.records[0]?.fields;
  if (!categories || !header) return names;
  const id = findColumn(header, 'costtypeid');
  const name = findColumn(header, 'name');
  for (const record of categories.records.slice(1)) names.set(cell(record, id), cell(record, name));
  return names;
};

type CostClass =
  | { type: 'maintenance'; category: MaintenanceCategory }
  | { type: 'skip'; reason: CsvSkippedRow['reason']; label: string | null }
  | { type: 'invalid'; field: string };

const costsTable = (sections: CsvSection[]) => {
  const costs = section(sections, 'costs');
  const header = costs?.records[0]?.fields;
  if (!costs || !header) return null;
  const names = costCategories(sections);
  const columns = {
    title: findColumn(header, 'costtitle'),
    date: findColumn(header, 'date'),
    odometer: findColumn(header, 'odo'),
    typeId: findColumn(header, 'costtypeid'),
    notes: findColumn(header, 'notes'),
    cost: findColumn(header, 'cost'),
    template: findColumn(header, 'istemplate'),
    income: findColumn(header, 'isincome'),
    uniqueId: findColumn(header, 'uniqueid'),
  };
  const classify = (record: CsvRecord): CostClass => {
    const label = names.get(cell(record, columns.typeId)) || cell(record, columns.title) || null;
    for (const [flag, field, reason] of [
      [columns.template, 'isTemplate', 'template'],
      [columns.income, 'isIncome', 'income'],
    ] as const) {
      const raw = cell(record, flag);
      if (raw === '') continue;
      const value = parseBoolean(raw);
      if (value === null) return { type: 'invalid', field };
      if (value) return { type: 'skip', reason, label };
    }
    const category = matchMaintenanceCategory(names.get(cell(record, columns.typeId)) ?? '');
    return category ? { type: 'maintenance', category } : { type: 'skip', reason: 'not_maintenance', label };
  };
  return { columns, rows: costs.records.slice(1), classify };
};

/** In Fuelio an empty or zero amount means it was not recorded. */
const amount = (value: number | undefined) => (value === 0 ? undefined : value);

export const fuelioAdapter: CsvAdapter = {
  format: 'fuelio',

  headers: ({ sections }) =>
    (section(sections, 'log')?.records[0]?.fields ?? []).map((field) => field.trim()),

  declaredDateFormat: ({ sections }) => {
    const vehicle = section(sections, 'vehicle');
    const header = vehicle?.records[0]?.fields;
    const values = vehicle?.records[1];
    if (!header || !values) return null;
    return declaredDateFormat(cell(values, findColumn(header, 'importcsvdateformat')));
  },

  sourceUnits: ({ sections }) => {
    const table = logTable(sections);
    const odometer = table ? (table.header[table.odometer] ?? '') : '';
    return { distance: distanceFromHeader(odometer), quantity: null };
  },

  collectImportedCells: ({ sections }) => {
    const cells: CsvImportedCells = { dates: [], numbers: [] };
    const log = logTable(sections);
    for (const record of log?.rows ?? []) {
      if (!log) break;
      cells.dates.push(cell(record, log.date));
      cells.numbers.push(
        { column: 'odometer', raw: cell(record, log.odometer) },
        { column: 'quantity', raw: cell(record, log.quantity) },
        { column: 'totalPrice', raw: cell(record, log.price) },
        { column: 'pricePerUnit', raw: cell(record, log.volumePrice) },
      );
    }
    const costs = costsTable(sections);
    for (const record of costs?.rows ?? []) {
      if (costs?.classify(record).type !== 'maintenance') continue;
      cells.dates.push(cell(record, costs.columns.date));
      cells.numbers.push(
        { column: 'odometer', raw: cell(record, costs.columns.odometer) },
        { column: 'cost', raw: cell(record, costs.columns.cost) },
      );
    }
    return cells;
  },

  normalize: ({ sections }, context) => {
    const output: CsvAdapterOutput = { drafts: [], errors: [], skipped: [] };
    const log = logTable(sections);
    for (const record of log?.rows ?? []) {
      if (!log) break;
      attemptRow(record.line, output.errors, () => {
        const warnings: CsvRowWarning[] = [];
        const station = cell(record, log.station);
        const input = {
          date: readDate(cell(record, log.date), context.dateFormat),
          odometer: readOdometer(cell(record, log.odometer), context, warnings),
          quantity: readNumber(cell(record, log.quantity), context, 'quantity'),
          totalPrice: amount(readNumber(cell(record, log.price), context, 'totalPrice')),
          pricePerUnit: amount(readNumber(cell(record, log.volumePrice), context, 'pricePerUnit')),
          fullTank: readBoolean(cell(record, log.full), 'fullTank'),
          missedPrevious: readBoolean(cell(record, log.missed), 'missedPrevious'),
        };
        output.drafts.push({
          sourceRow: record.line,
          sourceId: cell(record, log.uniqueId) || null,
          kind: 'fuel',
          input,
          warnings,
          dropped: {
            notes: cell(record, log.notes) !== '',
            station: cell(record, log.city) !== '' || (station !== '' && station !== '0'),
          },
        });
      });
    }
    const costs = costsTable(sections);
    for (const record of costs?.rows ?? []) {
      if (!costs) break;
      const costClass = costs.classify(record);
      if (costClass.type === 'skip') {
        output.skipped.push({ row: record.line, reason: costClass.reason, label: costClass.label });
        continue;
      }
      attemptRow(record.line, output.errors, () => {
        if (costClass.type === 'invalid') throw new CsvCellError('invalid_boolean', costClass.field);
        const warnings: CsvRowWarning[] = [];
        const input = {
          date: readDate(cell(record, costs.columns.date), context.dateFormat),
          odometer: readMaintenanceOdometer(cell(record, costs.columns.odometer), context, warnings),
          category: costClass.category,
          title: cell(record, costs.columns.title) || undefined,
          description: cell(record, costs.columns.notes),
          cost: amount(readNumber(cell(record, costs.columns.cost), context, 'cost')) ?? null,
        };
        output.drafts.push({
          sourceRow: record.line,
          sourceId: cell(record, costs.columns.uniqueId) || null,
          kind: 'maintenance',
          input,
          warnings,
          dropped: { notes: false, station: false },
        });
      });
    }
    return output;
  },
};
