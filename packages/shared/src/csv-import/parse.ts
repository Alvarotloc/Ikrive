import type { z } from 'zod';
import { createExpenseSchema } from '../schemas/expenses';
import { createFuelLogSchema } from '../schemas/fuel-logs';
import { createMaintenanceRecordSchema } from '../schemas/maintenance';
import { createOdometerReadingSchema } from '../schemas/vehicles';
import { detectDocument } from './detect';
import { drivvoAdapter } from './drivvo';
import { fuelioAdapter } from './fuelio';
import { genericHeaders, missingGenericColumns, normalizeGeneric } from './generic';
import { csvRowKey } from './keys';
import { lubeLoggerAdapter } from './lubelogger';
import { type CsvDocument, readCsvDocument } from './tokenizer';
import type {
  CsvAdapter,
  CsvAdapterOutput,
  CsvDateFormat,
  CsvDecimalSeparator,
  CsvDraftRow,
  CsvFormat,
  CsvImportOptions,
  CsvImportResult,
  CsvRow,
  CsvRowError,
  CsvSourceUnits,
} from './types';
import { resolveDateFormat, resolveDecimalSeparator } from './values';

const ADAPTERS: Record<CsvAdapter['format'], CsvAdapter> = {
  fuelio: fuelioAdapter,
  drivvo: drivvoAdapter,
  lubelogger: lubeLoggerAdapter,
};

function schemaError(draft: CsvDraftRow, error: z.ZodError): CsvRowError {
  const path = error.issues[0]?.path[0];
  const field = typeof path === 'string' ? path : null;
  const absent = field !== null && draft.input[field] === undefined;
  return { row: draft.sourceRow, code: absent ? 'missing_field' : 'out_of_range', field };
}

function validateDraft(draft: CsvDraftRow): CsvRow | CsvRowError {
  const base = { sourceRow: draft.sourceRow, sourceId: draft.sourceId, warnings: draft.warnings };
  if (draft.kind === 'odometer') {
    const result = createOdometerReadingSchema.safeParse(draft.input);
    if (!result.success) return schemaError(draft, result.error);
    return {
      ...base,
      kind: 'odometer',
      data: result.data,
      key: csvRowKey({ kind: 'odometer', data: result.data }),
    };
  }
  if (draft.kind === 'fuel') {
    const result = createFuelLogSchema.safeParse(draft.input);
    if (!result.success) return schemaError(draft, result.error);
    return { ...base, kind: 'fuel', data: result.data, key: csvRowKey({ kind: 'fuel', data: result.data }) };
  }
  if (draft.kind === 'expense') {
    const result = createExpenseSchema.safeParse(draft.input);
    if (!result.success) return schemaError(draft, result.error);
    return {
      ...base,
      kind: 'expense',
      data: result.data,
      key: csvRowKey({ kind: 'expense', data: result.data }),
    };
  }
  const result = createMaintenanceRecordSchema.safeParse(draft.input);
  if (!result.success) return schemaError(draft, result.error);
  return {
    ...base,
    kind: 'maintenance',
    data: result.data,
    key: csvRowKey({ kind: 'maintenance', data: result.data }),
  };
}

function resolveUnits(detected: CsvSourceUnits, override: CsvImportOptions['sourceUnits']): CsvSourceUnits {
  return {
    distance: override?.distance !== undefined ? override.distance : detected.distance,
    quantity: override?.quantity !== undefined ? override.quantity : detected.quantity,
  };
}

const unitsDiffer = (source: CsvSourceUnits, target: CsvImportOptions['target']) =>
  (source.distance !== null && source.distance !== target.distance) ||
  (source.quantity !== null && source.quantity !== target.quantity);

function buildParsed(
  doc: CsvDocument,
  format: CsvFormat,
  dateFormat: CsvDateFormat,
  decimalSeparator: CsvDecimalSeparator,
  sourceUnits: CsvSourceUnits,
  output: CsvAdapterOutput,
): CsvImportResult {
  const rows: CsvRow[] = [];
  const errors: CsvRowError[] = [
    ...doc.malformed.map((row): CsvRowError => ({ row, code: 'malformed_row', field: null })),
    ...output.errors,
  ];
  const droppedFuelFields = { notes: false, station: false };
  for (const draft of output.drafts) {
    const validated = validateDraft(draft);
    if ('code' in validated) {
      errors.push(validated);
      continue;
    }
    rows.push(validated);
    if (validated.kind === 'fuel') {
      droppedFuelFields.notes ||= draft.dropped.notes;
      droppedFuelFields.station ||= draft.dropped.station;
    }
  }
  rows.sort((a, b) => a.sourceRow - b.sourceRow);
  errors.sort((a, b) => a.row - b.row);
  const skipped = [...output.skipped].sort((a, b) => a.row - b.row);
  return {
    status: 'parsed',
    format,
    dateFormat,
    decimalSeparator,
    sourceUnits,
    rows,
    errors,
    skipped,
    droppedFuelFields,
  };
}

function parseGeneric(
  doc: CsvDocument,
  options: CsvImportOptions & { mapping: NonNullable<CsvImportOptions['mapping']> },
) {
  const { mapping, target } = options;
  const missing = missingGenericColumns(doc, mapping);
  if (missing.length > 0) {
    return {
      status: 'needs_options',
      format: 'generic',
      headers: genericHeaders(doc),
      missing: missing.map((column) => `columns.${column}` as const),
    } satisfies CsvImportResult;
  }
  const source = resolveUnits({ distance: null, quantity: null }, options.sourceUnits);
  if (unitsDiffer(source, target)) {
    return { status: 'unit_mismatch', format: 'generic', source, target } satisfies CsvImportResult;
  }
  return buildParsed(
    doc,
    'generic',
    mapping.dateFormat,
    mapping.decimalSeparator,
    source,
    normalizeGeneric(doc, mapping),
  );
}

/** Detects the format of a decoded CSV and converts it to rows ready for the creation services. */
export function parseCsvImport(text: string, options: CsvImportOptions): CsvImportResult {
  const doc = readCsvDocument(text);
  if (options.mapping) return parseGeneric(doc, { ...options, mapping: options.mapping });

  const detection = detectDocument(doc);
  if (detection.format === 'unknown') return { status: 'unknown', headers: detection.headers };
  const adapter = ADAPTERS[detection.format];

  const cells = adapter.collectImportedCells(doc);
  const dateFormat = resolveDateFormat(options.dateFormat, cells.dates, adapter.declaredDateFormat(doc));
  const decimalSeparator = resolveDecimalSeparator(options.decimalSeparator, cells.numbers);
  if (dateFormat === null || decimalSeparator === null) {
    const missing: ('dateFormat' | 'decimalSeparator')[] = [];
    if (dateFormat === null) missing.push('dateFormat');
    if (decimalSeparator === null) missing.push('decimalSeparator');
    return { status: 'needs_options', format: adapter.format, headers: detection.headers, missing };
  }

  const source = resolveUnits(adapter.sourceUnits(doc), options.sourceUnits);
  if (unitsDiffer(source, options.target)) {
    return { status: 'unit_mismatch', format: adapter.format, source, target: options.target };
  }
  const output = adapter.normalize(doc, { dateFormat, decimalSeparator });
  return buildParsed(doc, adapter.format, dateFormat, decimalSeparator, source, output);
}
