import type {
  CsvDateFormat,
  CsvDecimalSeparator,
  CsvImportedCells,
  CsvRowError,
  CsvRowErrorCode,
  CsvRowWarning,
  CsvValueContext,
} from './types';

const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}(?!\d)/;
const YEAR_FIRST = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/;
const YEAR_LAST = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T].*)?$/;
const GROUPED_NUMBER = /^\d{1,3}([.,]\d{3})+$/;
const SEVERAL_GROUPS = /^\d{1,3}(?:[.,]\d{3}){2,}$/;
/** A final part that is not 3 digits long cannot be a thousands group. */
const PROVEN_DECIMAL = /^-?\d+[.,](?:\d{1,2}|\d{4,})$/;
const CURRENCY_OR_SPACE = /[\s$€£]/;
const NUMBER_PATTERNS: Record<CsvDecimalSeparator, RegExp> = {
  '.': /^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/,
  ',': /^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/,
};

/** A `Map` because the key comes from the file: an object would also match `constructor`. */
const DECLARED_DATE_FORMATS = new Map<string, CsvDateFormat>([
  ['yyyy-mm-dd', 'ymd'],
  ['dd.mm.yyyy', 'dmy'],
  ['dd/mm/yyyy', 'dmy'],
  ['mm/dd/yyyy', 'mdy'],
]);

const TRUE_VALUES = new Set(['yes', 'si', 'tak', 'ja', '1', 'true']);
const FALSE_VALUES = new Set(['no', 'nie', 'nein', '0', 'false']);

/** Lower case without accents, to compare names written by people. */
export const normalizeText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

export const declaredDateFormat = (raw: string): CsvDateFormat | null =>
  DECLARED_DATE_FORMATS.get(raw.trim().toLowerCase()) ?? null;

/** Explicit option, then ISO dates (unambiguous), then the format the file declares. */
export function resolveDateFormat(
  explicit: CsvDateFormat | undefined,
  dates: string[],
  declared: CsvDateFormat | null,
): CsvDateFormat | null {
  if (explicit) return explicit;
  const present = dates.map((date) => date.trim()).filter(Boolean);
  if (present.every((date) => ISO_DATE_PREFIX.test(date))) return 'ymd';
  return declared;
}

/** Explicit option, then the only separator seen; `null` when the imported cells are ambiguous. */
export function resolveDecimalSeparator(
  explicit: CsvDecimalSeparator | undefined,
  numbers: CsvImportedCells['numbers'],
): CsvDecimalSeparator | null {
  if (explicit) return explicit;
  let hasDot = false;
  let hasComma = false;
  let hasLoneGroup = false;
  let hasProvenDecimal = false;
  for (const { column, raw } of numbers) {
    const cleaned = cleanNumber(raw);
    if (GROUPED_NUMBER.test(cleaned)) {
      if (column === 'odometer' || SEVERAL_GROUPS.test(cleaned)) return null;
      hasLoneGroup = true;
    }
    hasProvenDecimal ||= PROVEN_DECIMAL.test(cleaned);
    hasDot ||= cleaned.includes('.');
    hasComma ||= cleaned.includes(',');
  }
  if (hasDot && hasComma) return null;
  // Three decimals are normal in Drivvo (`10.881`), but alone they could also be thousands.
  if (hasLoneGroup && !hasProvenDecimal) return null;
  return hasComma ? ',' : '.';
}

const isRealDate = (year: number, month: number, day: number) => {
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (days[month - 1] ?? 0);
};

/** Calendar date as `YYYY-MM-DD`; any time is dropped without converting zones. */
export function parseDate(raw: string, format: CsvDateFormat): string | null {
  const match = raw.trim().match(format === 'ymd' ? YEAR_FIRST : YEAR_LAST);
  if (!match) return null;
  const [first, second, third] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const [year, month, day] =
    format === 'ymd'
      ? [first, second, third]
      : format === 'dmy'
        ? [third, second, first]
        : [third, first, second];
  if (!isRealDate(year, month, day)) return null;
  const pad = (value: number, length: number) => String(value).padStart(length, '0');
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** Walks in from both edges: a regex anchored at the end is quadratic on long inner runs of spaces. */
export function cleanNumber(raw: string): string {
  let start = 0;
  let end = raw.length;
  while (start < end && CURRENCY_OR_SPACE.test(raw.charAt(start))) start++;
  while (end > start && CURRENCY_OR_SPACE.test(raw.charAt(end - 1))) end--;
  return raw.slice(start, end);
}

/** Validated with a pattern because `Number()` would accept `1e5` or `0x10`. */
export function parseNumber(raw: string, separator: CsvDecimalSeparator): number | null {
  const cleaned = cleanNumber(raw);
  if (!NUMBER_PATTERNS[separator].test(cleaned)) return null;
  const group = separator === '.' ? ',' : '.';
  return Number(cleaned.replaceAll(group, '').replace(separator, '.'));
}

export function parseBoolean(raw: string): boolean | null {
  const value = normalizeText(raw);
  if (TRUE_VALUES.has(value)) return true;
  return FALSE_VALUES.has(value) ? false : null;
}

export const distanceFromHeader = (header: string): 'km' | 'mi' | null => {
  const unit = header.match(/\(\s*(km|mi)\s*\)/i)?.[1]?.toLowerCase();
  return unit === 'km' || unit === 'mi' ? unit : null;
};

/** A cell that makes its whole row invalid. Never leaves the module: `attemptRow` catches it. */
export class CsvCellError extends Error {
  constructor(
    readonly code: CsvRowErrorCode,
    readonly field: string | null,
  ) {
    super(code);
  }
}

/** Runs the reading of one row: a bad cell becomes an error of that row and the rest go on. */
export function attemptRow(row: number, errors: CsvRowError[], read: () => void): void {
  try {
    read();
  } catch (error) {
    if (!(error instanceof CsvCellError)) throw error;
    errors.push({ row, code: error.code, field: error.field });
  }
}

export function readDate(raw: string, format: CsvDateFormat, field = 'date'): string {
  if (raw.trim() === '') throw new CsvCellError('missing_field', field);
  const date = parseDate(raw, format);
  if (date === null) throw new CsvCellError('invalid_date', field);
  return date;
}

/** `undefined` for a blank cell. */
export function readNumber(raw: string, context: CsvValueContext, field: string): number | undefined {
  if (cleanNumber(raw) === '') return undefined;
  const value = parseNumber(raw, context.decimalSeparator);
  if (value === null) throw new CsvCellError('invalid_number', field);
  return value;
}

/** `undefined` for a blank cell. */
export function readBoolean(raw: string, field: string): boolean | undefined {
  if (raw.trim() === '') return undefined;
  const value = parseBoolean(raw);
  if (value === null) throw new CsvCellError('invalid_boolean', field);
  return value;
}

/** Rounds to the nearest integer and records the warning when the source had decimals. */
export function readOdometer(
  raw: string,
  context: CsvValueContext,
  warnings: CsvRowWarning[],
  field = 'odometer',
): number | undefined {
  const value = readNumber(raw, context, field);
  if (value === undefined) return undefined;
  const rounded = Math.round(value);
  if (rounded !== value) warnings.push('odometer_rounded');
  return rounded;
}

/** A maintenance odometer that is blank or 0 means the source did not record it. */
export function readMaintenanceOdometer(
  raw: string,
  context: CsvValueContext,
  warnings: CsvRowWarning[],
): number | null {
  return readOdometer(raw, context, warnings) || null;
}
