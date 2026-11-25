import type {
  CSV_REJECT_REASONS,
  CSV_ROW_ERROR_CODES,
  CSV_SKIP_REASONS,
  CsvImportRequestInput,
  CsvImportSummary,
} from '@ikrive/shared';
import type {
  CsvColumn,
  CsvDateFormat,
  CsvDecimalSeparator,
  CsvGenericMapping,
  CsvRowKind,
} from '@ikrive/shared/csv-import';

export type CsvRowErrorCode = (typeof CSV_ROW_ERROR_CODES)[number];
export type CsvRejectReason = (typeof CSV_REJECT_REASONS)[number];
export type CsvSkipReason = (typeof CSV_SKIP_REASONS)[number];

/** `CSV_REQUIRED_COLUMNS` of the parser chunk, passed in so this module does not load the parser. */
export type CsvRequiredColumns = Readonly<Record<CsvRowKind, readonly (readonly CsvColumn[])[]>>;

/** The generic mapping while the user fills it in: every choice starts empty. */
export interface MappingDraft {
  kind: CsvRowKind | '';
  columns: Partial<Record<CsvColumn, number>>;
  dateFormat: CsvDateFormat | '';
  decimalSeparator: CsvDecimalSeparator | '';
}

export const emptyMapping: MappingDraft = { kind: '', columns: {}, dateFormat: '', decimalSeparator: '' };

/** Options of the import without `dryRun`: the preview and the import send the same ones. */
export type CsvImportChoice = Omit<CsvImportRequestInput, 'dryRun'>;

/** `null` until the kind, the date format, the separator and every group of required columns are set. */
export function toMapping(draft: MappingDraft, required: CsvRequiredColumns): CsvGenericMapping | null {
  const { kind, dateFormat, decimalSeparator } = draft;
  if (kind === '' || dateFormat === '' || decimalSeparator === '') return null;
  const complete = required[kind].every((group) =>
    group.some((column) => draft.columns[column] !== undefined),
  );
  return complete ? { kind, columns: draft.columns, dateFormat, decimalSeparator } : null;
}

/** Options sent to the parser and to the API (never `target`, never `dryRun`). */
export function importOptions(
  state: {
    generic: boolean;
    mapping: MappingDraft;
    dateFormat?: CsvDateFormat | undefined;
    decimalSeparator?: CsvDecimalSeparator | undefined;
  },
  required: CsvRequiredColumns,
): CsvImportChoice | null {
  if (state.generic) {
    const mapping = toMapping(state.mapping, required);
    return mapping ? { mapping } : null;
  }
  return {
    ...(state.dateFormat ? { dateFormat: state.dateFormat } : {}),
    ...(state.decimalSeparator ? { decimalSeparator: state.decimalSeparator } : {}),
  };
}

const totalCreated = (s: CsvImportSummary) => s.created.odometer + s.created.fuel + s.created.maintenance;

/** Counters of the preview: valid = would be created, errors = unreadable + rejected rows. */
export function previewCounts(s: CsvImportSummary) {
  return {
    valid: totalCreated(s),
    duplicates: s.duplicates,
    errors: s.errors.length + s.rejected.length,
    skipped: s.skipped.length,
  };
}

/** Counters of the final summary: omitted = duplicates + skipped, errors = unreadable + rejected. */
export function resultCounts(s: CsvImportSummary) {
  return {
    created: s.created,
    omitted: s.duplicates + s.skipped.length,
    errors: s.errors.length + s.rejected.length,
  };
}

export type CsvIssue =
  | { row: number; type: 'error'; code: CsvRowErrorCode; field: string | null }
  | {
      row: number;
      type: 'rejected';
      reason: CsvRejectReason;
      conflict: { date: string; value: number } | null;
    }
  | { row: number; type: 'skipped'; reason: CsvSkipReason; label: string | null };

/** Rows listed under the counters before «and N more». */
export const CSV_ISSUES_LIMIT = 50;

/** errors + rejected + skipped sorted by row, cut to `limit`, with the total. */
export function csvIssues(
  s: CsvImportSummary,
  limit = CSV_ISSUES_LIMIT,
): { items: CsvIssue[]; total: number } {
  const all: CsvIssue[] = [
    ...s.errors.map((e): CsvIssue => ({ row: e.row, type: 'error', code: e.code, field: e.field })),
    ...s.rejected.map(
      (r): CsvIssue => ({ row: r.row, type: 'rejected', reason: r.reason, conflict: r.conflict }),
    ),
    ...s.skipped.map((k): CsvIssue => ({ row: k.row, type: 'skipped', reason: k.reason, label: k.label })),
  ].sort((a, b) => a.row - b.row);
  return { items: all.slice(0, limit), total: all.length };
}

/** Translation key of each decimal separator: `.` cannot be a key segment of i18next. */
export const DECIMAL_SEPARATOR_KEYS: Record<CsvDecimalSeparator, 'dot' | 'comma'> = {
  '.': 'dot',
  ',': 'comma',
};
