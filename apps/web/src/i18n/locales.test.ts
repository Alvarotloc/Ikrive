import {
  CSV_COLUMNS,
  CSV_DATE_FORMATS,
  CSV_DECIMAL_SEPARATORS,
  CSV_FORMATS,
  CSV_REJECT_REASONS,
  CSV_ROW_ERROR_CODES,
  CSV_ROW_KINDS,
  CSV_SKIP_REASONS,
  EXPENSE_CATEGORIES,
  FUEL_QUANTITY_UNITS,
  MAINTENANCE_CATEGORIES,
  NOTIFICATION_CHANNEL_TYPES,
} from '@ikrive/shared';
import { describe, expect, it } from 'vitest';
import { DECIMAL_SEPARATOR_KEYS } from '@/features/csv-import/wizard';
import en from './locales/en.json';
import es from './locales/es.json';

/** Dotted paths of every leaf, e.g. `maintenance.fields.date`; array items count as leaves (`auth.proof.0.title`). */
function flatten(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') return [prefix];
  return Object.entries(value).flatMap(([key, child]) => flatten(child, prefix ? `${prefix}.${key}` : key));
}

describe('locales', () => {
  it('es and en define the same keys', () => {
    expect(flatten(en).sort()).toEqual(flatten(es).sort());
  });

  it('defines a label for every maintenance category', () => {
    for (const locale of [es, en]) {
      for (const category of MAINTENANCE_CATEGORIES) {
        expect(locale.maintenance.categories[category]).toEqual(expect.any(String));
        expect(locale.maintenance.categories[category]).not.toBe('');
      }
    }
  });

  it('defines a label for every expense category', () => {
    for (const locale of [es, en]) {
      for (const category of EXPENSE_CATEGORIES) {
        expect(locale.expenses.categories[category]).toEqual(expect.any(String));
        expect(locale.expenses.categories[category]).not.toBe('');
      }
    }
    expect(es.expenses.categories.other).toBe('Varios');
    expect(en.expenses.categories.other).toBe('Miscellaneous');
  });

  it('defines a label for every notification channel type', () => {
    for (const locale of [es, en]) {
      for (const type of NOTIFICATION_CHANNEL_TYPES) {
        expect(locale.notificationChannels.types[type]).toEqual(expect.any(String));
        expect(locale.notificationChannels.types[type]).not.toBe('');
      }
    }
  });

  it('defines a label for every fuel quantity unit', () => {
    for (const locale of [es, en]) {
      for (const unit of FUEL_QUANTITY_UNITS) {
        expect(locale.fuel.units[unit]).toEqual(expect.any(String));
        expect(locale.fuel.units[unit]).not.toBe('');
      }
    }
  });

  it('defines a label for every CSV import value', () => {
    for (const locale of [es, en]) {
      const labels = locale.csvImport;
      const groups: [Record<string, string>, readonly string[]][] = [
        [labels.formats, CSV_FORMATS],
        [labels.kinds, CSV_ROW_KINDS],
        [labels.columns, CSV_COLUMNS],
        [labels.dateFormats, CSV_DATE_FORMATS],
        [
          labels.decimalSeparators,
          CSV_DECIMAL_SEPARATORS.map((separator) => DECIMAL_SEPARATOR_KEYS[separator]),
        ],
        [labels.errorCodes, CSV_ROW_ERROR_CODES],
        [labels.rejectReasons, CSV_REJECT_REASONS],
        [labels.skipReasons, CSV_SKIP_REASONS],
      ];
      for (const [group, values] of groups) {
        for (const value of values) {
          expect(group[value]).toEqual(expect.any(String));
          expect(group[value]).not.toBe('');
        }
      }
    }
  });

  it('en uses English quotation marks, not Spanish angle quotes', () => {
    expect(JSON.stringify(en)).not.toMatch(/[«»]/);
  });
});
