import { MAINTENANCE_CATEGORIES, NOTIFICATION_CHANNEL_TYPES } from '@ikrive/shared';
import { describe, expect, it } from 'vitest';
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

  it('defines a label for every notification channel type', () => {
    for (const locale of [es, en]) {
      for (const type of NOTIFICATION_CHANNEL_TYPES) {
        expect(locale.notificationChannels.types[type]).toEqual(expect.any(String));
        expect(locale.notificationChannels.types[type]).not.toBe('');
      }
    }
  });
});
