import { describe, expect, it } from 'vitest';
import {
  cleanNumber,
  declaredDateFormat,
  parseBoolean,
  parseDate,
  parseNumber,
  resolveDateFormat,
  resolveDecimalSeparator,
} from './values';

const numbers = (...raw: string[]) => raw.map((value) => ({ column: 'quantity' as const, raw: value }));

describe('date format', () => {
  it('resolves the date format by priority', () => {
    expect(resolveDateFormat('mdy', ['03/04/2025'], 'dmy')).toBe('mdy');
    expect(resolveDateFormat(undefined, ['2025-03-04'], null)).toBe('ymd');
    expect(resolveDateFormat(undefined, ['03/04/2025'], 'dmy')).toBe('dmy');
    expect(resolveDateFormat(undefined, ['03/04/2025'], null)).toBeNull();
  });

  it('prefers ISO dates over a different declared format', () => {
    expect(resolveDateFormat(undefined, ['2025-03-04 10:00', ''], 'dmy')).toBe('ymd');
    expect(resolveDateFormat(undefined, ['2025-03-04', '04.03.2025'], 'dmy')).toBe('dmy');
  });

  it('lets options.dateFormat override ISO dates', () => {
    expect(resolveDateFormat('dmy', ['2025-03-04'], null)).toBe('dmy');
    expect(parseDate('2025-03-04', 'dmy')).toBeNull();
  });

  it('does not ask for a date format when no date is imported', () => {
    expect(resolveDateFormat(undefined, [], null)).toBe('ymd');
    expect(resolveDateFormat(undefined, ['  '], null)).toBe('ymd');
  });

  it('only accepts the declared date formats of its table', () => {
    expect(declaredDateFormat(' DD/MM/YYYY ')).toBe('dmy');
    for (const raw of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(declaredDateFormat(raw), raw).toBeNull();
    }
  });

  it('does not guess an ambiguous date', () => {
    expect(resolveDateFormat(undefined, ['13/04/2025', '03/04/2025'], null)).toBeNull();
    expect(parseDate('03/04/2025', 'dmy')).toBe('2025-04-03');
    expect(parseDate('03/04/2025', 'mdy')).toBe('2025-03-04');
    expect(parseDate('3.4.2025 10:30', 'dmy')).toBe('2025-04-03');
  });
});

describe('decimal separator', () => {
  it('uses the only decimal separator seen', () => {
    expect(resolveDecimalSeparator(undefined, numbers('1,5', '20'))).toBe(',');
    expect(resolveDecimalSeparator(undefined, numbers('1.5', '20'))).toBe('.');
    expect(resolveDecimalSeparator(undefined, numbers('20'))).toBe('.');
    expect(parseNumber('1.234,5', ',')).toBe(1234.5);
    expect(parseNumber('1,234.5', '.')).toBe(1234.5);
  });

  it('asks for the separator when it is ambiguous', () => {
    expect(resolveDecimalSeparator(undefined, numbers('1,5', '2.5'))).toBeNull();
    expect(resolveDecimalSeparator(undefined, [{ column: 'odometer', raw: '12.345' }])).toBeNull();
    expect(resolveDecimalSeparator(',', [{ column: 'odometer', raw: '12.345' }])).toBe(',');
    expect(parseNumber('12.345', ',')).toBe(12345);
  });

  it('strips currency symbols', () => {
    expect(parseNumber(' $123.45 ', '.')).toBe(123.45);
    expect(parseNumber('12,50 €', ',')).toBe(12.5);
    expect(parseNumber('£7', '.')).toBe(7);
  });

  it('cleans a cell with a long inner run of spaces', () => {
    const inner = ' '.repeat(100_000);
    expect(cleanNumber(` $1${inner}x€ `)).toBe(`1${inner}x`);
    expect(cleanNumber(` \t$€£ `)).toBe('');
    expect(parseNumber(`1${inner}x`, '.')).toBeNull();
  });

  it('rejects exponents and impossible dates', () => {
    for (const raw of ['1e5', '0x10', 'abc', '1.2.3']) expect(parseNumber(raw, '.'), raw).toBeNull();
    for (const raw of ['2025-02-30', '2025-13-01', '25-01-01']) expect(parseDate(raw, 'ymd'), raw).toBeNull();
    expect(parseDate('31/04/25', 'dmy')).toBeNull();
    expect(parseDate('2024-02-29', 'ymd')).toBe('2024-02-29');
  });

  it('reads the translated booleans', () => {
    for (const raw of ['Yes', 'Sí', 'Tak', 'Ja', '1', 'True']) expect(parseBoolean(raw), raw).toBe(true);
    for (const raw of ['No', 'Nie', 'Nein', '0', 'False']) expect(parseBoolean(raw), raw).toBe(false);
    expect(parseBoolean('quizá')).toBeNull();
  });
});
