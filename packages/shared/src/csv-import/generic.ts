import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  MAINTENANCE_CATEGORIES,
  type MaintenanceCategory,
} from '../enums';
import { matchExpenseCategory, matchMaintenanceCategory } from './categories';
import type { CsvDocument, CsvRecord } from './tokenizer';
import type {
  CsvAdapterOutput,
  CsvColumn,
  CsvGenericMapping,
  CsvRowKind,
  CsvRowWarning,
  CsvValueContext,
} from './types';
import {
  attemptRow,
  normalizeText,
  readBoolean,
  readDate,
  readMaintenanceOdometer,
  readNumber,
  readOdometer,
} from './values';

/** Each inner list is a group where at least one column must be mapped. */
export const CSV_REQUIRED_COLUMNS: Record<CsvRowKind, readonly (readonly CsvColumn[])[]> = {
  odometer: [['date'], ['value']],
  fuel: [['date'], ['odometer'], ['quantity'], ['totalPrice', 'pricePerUnit']],
  maintenance: [['date'], ['title']],
  expense: [['date'], ['cost']],
};

/** Columns each kind of row can import, in the order the mapping form shows them. */
export const CSV_KIND_COLUMNS: Record<CsvRowKind, readonly CsvColumn[]> = {
  odometer: ['date', 'value'],
  fuel: ['date', 'odometer', 'quantity', 'totalPrice', 'pricePerUnit', 'fullTank', 'missedPrevious'],
  maintenance: ['date', 'odometer', 'title', 'category', 'description', 'workshop', 'cost'],
  expense: ['date', 'category', 'title', 'description', 'cost'],
};

export const genericHeaders = (doc: CsvDocument) =>
  (doc.records[0]?.fields ?? []).map((field) => field.trim());

/** Columns that are required and not mapped, or mapped outside the header. */
export function missingGenericColumns(doc: CsvDocument, mapping: CsvGenericMapping): CsvColumn[] {
  const width = doc.records[0]?.fields.length ?? 0;
  const isValid = (index: number) => Number.isInteger(index) && index >= 0 && index < width;
  const missing = new Set<CsvColumn>();
  for (const column of CSV_KIND_COLUMNS[mapping.kind]) {
    const index = mapping.columns[column];
    if (index !== undefined && !isValid(index)) missing.add(column);
  }
  for (const group of CSV_REQUIRED_COLUMNS[mapping.kind]) {
    const [first] = group;
    if (first && group.every((column) => mapping.columns[column] === undefined)) missing.add(first);
  }
  return [...missing];
}

const categoryOf = (raw: string): MaintenanceCategory => {
  const exact = MAINTENANCE_CATEGORIES.find((category) => category === normalizeText(raw));
  return exact ?? matchMaintenanceCategory(raw) ?? 'other';
};

const expenseCategoryOf = (raw: string): ExpenseCategory => {
  const exact = EXPENSE_CATEGORIES.find((category) => category === normalizeText(raw));
  return exact ?? matchExpenseCategory(raw) ?? 'other';
};

export function normalizeGeneric(doc: CsvDocument, mapping: CsvGenericMapping): CsvAdapterOutput {
  const context: CsvValueContext = {
    dateFormat: mapping.dateFormat,
    decimalSeparator: mapping.decimalSeparator,
  };
  const output: CsvAdapterOutput = { drafts: [], errors: [], skipped: [] };
  const read = (record: CsvRecord, column: CsvColumn) => {
    const index = mapping.columns[column];
    return index === undefined ? '' : (record.fields[index] ?? '').trim();
  };
  for (const record of doc.records.slice(1)) {
    attemptRow(record.line, output.errors, () => {
      const warnings: CsvRowWarning[] = [];
      const date = readDate(read(record, 'date'), context.dateFormat);
      let input: Record<string, unknown>;
      if (mapping.kind === 'odometer') {
        input = { date, value: readOdometer(read(record, 'value'), context, warnings, 'value') };
      } else if (mapping.kind === 'fuel') {
        input = {
          date,
          odometer: readOdometer(read(record, 'odometer'), context, warnings),
          quantity: readNumber(read(record, 'quantity'), context, 'quantity'),
          totalPrice: readNumber(read(record, 'totalPrice'), context, 'totalPrice'),
          pricePerUnit: readNumber(read(record, 'pricePerUnit'), context, 'pricePerUnit'),
          fullTank: readBoolean(read(record, 'fullTank'), 'fullTank'),
          missedPrevious: readBoolean(read(record, 'missedPrevious'), 'missedPrevious'),
        };
      } else if (mapping.kind === 'expense') {
        input = {
          date,
          category: expenseCategoryOf(read(record, 'category')),
          title: read(record, 'title'),
          description: read(record, 'description'),
          cost: readNumber(read(record, 'cost'), context, 'cost'),
        };
      } else {
        input = {
          date,
          odometer: readMaintenanceOdometer(read(record, 'odometer'), context, warnings),
          category: categoryOf(read(record, 'category')),
          title: read(record, 'title') || undefined,
          description: read(record, 'description'),
          workshop: read(record, 'workshop'),
          cost: readNumber(read(record, 'cost'), context, 'cost') ?? null,
        };
      }
      output.drafts.push({
        sourceRow: record.line,
        sourceId: null,
        kind: mapping.kind,
        input,
        warnings,
        dropped: { notes: false, station: false },
      });
    });
  }
  return output;
}
