import { describe, expect, it } from 'vitest';
import { pickInitialLocale } from './locale';

describe('pickInitialLocale', () => {
  it('uses the locale stored in the browser over the browser language', () => {
    expect(pickInitialLocale('en', 'es-ES')).toBe('en');
    expect(pickInitialLocale('es', 'en-US')).toBe('es');
  });

  it.each([
    ['nothing stored', null],
    ['an unsupported locale', 'fr'],
    ['an empty value', ''],
  ])('falls back to the browser language with %s', (_, stored) => {
    expect(pickInitialLocale(stored, 'en-GB')).toBe('en');
    expect(pickInitialLocale(stored, 'es-ES')).toBe('es');
  });

  it('falls back to Spanish for any other or unknown browser language', () => {
    expect(pickInitialLocale(null, 'fr-FR')).toBe('es');
    expect(pickInitialLocale(null, 'EN')).toBe('en');
    expect(pickInitialLocale(null, undefined)).toBe('es');
  });
});
