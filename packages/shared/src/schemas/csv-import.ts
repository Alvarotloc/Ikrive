import { z } from 'zod';
import { DISTANCE_UNITS, FUEL_QUANTITY_UNITS } from '../enums';
import { isoDateSchema } from './vehicles';

/** Largest CSV accepted by the import, in the API and in local mode (5 MiB). */
export const CSV_IMPORT_MAX_BYTES = 5 * 1024 * 1024;

// The parser's unions as arrays, so the schemas below can use them without importing the parser.
export const CSV_FORMATS = ['fuelio', 'drivvo', 'lubelogger', 'generic'] as const;
export const CSV_ROW_KINDS = ['odometer', 'fuel', 'maintenance', 'expense'] as const;
export const CSV_DATE_FORMATS = ['ymd', 'dmy', 'mdy'] as const;
export const CSV_DECIMAL_SEPARATORS = ['.', ','] as const;
export const CSV_COLUMNS = [
  'date',
  'value',
  'odometer',
  'quantity',
  'totalPrice',
  'pricePerUnit',
  'fullTank',
  'missedPrevious',
  'title',
  'category',
  'description',
  'workshop',
  'cost',
] as const;
export const CSV_ROW_ERROR_CODES = [
  'malformed_row',
  'missing_field',
  'invalid_date',
  'invalid_number',
  'invalid_boolean',
  'out_of_range',
  'mixed_fuel_units',
] as const;
export const CSV_SKIP_REASONS = ['template', 'income'] as const;
/** Why a parsed row is not imported, besides being a duplicate. */
export const CSV_REJECT_REASONS = ['odometer_conflict', 'future_date'] as const;

/**
 * `options` field of `POST /api/vehicles/:id/csv-import`: the parser options except `target`, which
 * always comes from the server (or device) settings and the vehicle.
 */
export const csvImportRequestSchema = z.strictObject({
  /** Computes the summary without writing anything. */
  dryRun: z.boolean().default(false),
  dateFormat: z.enum(CSV_DATE_FORMATS).optional(),
  decimalSeparator: z.enum(CSV_DECIMAL_SEPARATORS).optional(),
  sourceUnits: z
    .object({
      distance: z.enum(DISTANCE_UNITS).nullable(),
      quantity: z.enum(FUEL_QUANTITY_UNITS).nullable(),
    })
    .partial()
    .optional(),
  mapping: z
    .object({
      kind: z.enum(CSV_ROW_KINDS),
      columns: z.partialRecord(z.enum(CSV_COLUMNS), z.number().int().min(0)),
      dateFormat: z.enum(CSV_DATE_FORMATS),
      decimalSeparator: z.enum(CSV_DECIMAL_SEPARATORS),
    })
    .optional(),
});
export type CsvImportRequest = z.infer<typeof csvImportRequestSchema>;
export type CsvImportRequestInput = z.input<typeof csvImportRequestSchema>;

const countSchema = z.number().int().min(0);

/** Response of the CSV import (and of its dry run). */
export const csvImportSummarySchema = z.object({
  dryRun: z.boolean(),
  format: z.enum(CSV_FORMATS),
  /** In a dry run, what would be created. */
  created: z.object({
    odometer: countSchema,
    fuel: countSchema,
    maintenance: countSchema,
    expense: countSchema,
  }),
  /** Rows already stored in the vehicle or repeated in the file. */
  duplicates: countSchema,
  rejected: z.array(
    z.object({
      row: z.number().int().positive(),
      kind: z.enum(CSV_ROW_KINDS),
      reason: z.enum(CSV_REJECT_REASONS),
      /** The reading the row contradicts; null for a future date. */
      conflict: z.object({ date: isoDateSchema, value: z.number().int() }).nullable(),
    }),
  ),
  /** Rows the parser could not read. */
  errors: z.array(
    z.object({
      row: z.number().int().positive(),
      code: z.enum(CSV_ROW_ERROR_CODES),
      field: z.string().nullable(),
    }),
  ),
  /** Rows the parser left out on purpose. */
  skipped: z.array(
    z.object({
      row: z.number().int().positive(),
      reason: z.enum(CSV_SKIP_REASONS),
      label: z.string().nullable(),
    }),
  ),
  droppedFuelFields: z.object({ notes: z.boolean(), station: z.boolean() }),
  /** True when decoding replaced invalid UTF-8 bytes with U+FFFD (the file may not be UTF-8). */
  encodingReplaced: z.boolean(),
});
export type CsvImportSummary = z.infer<typeof csvImportSummarySchema>;
