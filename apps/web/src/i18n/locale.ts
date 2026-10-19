import { LOCALES, type Locale } from '@ikrive/shared';

const STORAGE_KEY = 'ikrive.locale';

const isLocale = (value: unknown): value is Locale => LOCALES.some((locale) => locale === value);

/**
 * Language the app starts in: the last one applied in this browser (if it is a supported locale),
 * otherwise the browser's language (English for any `en*`, Spanish for the rest).
 */
export function pickInitialLocale(stored: string | null, browserLanguage: string | undefined): Locale {
  if (isLocale(stored)) return stored;
  return browserLanguage?.toLowerCase().startsWith('en') ? 'en' : 'es';
}

/** The locale saved in this browser, or null when there is none or storage is unavailable. */
export function getStoredLocale(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Remembers `locale` in this browser so the next load starts in it before the settings arrive. */
export function storeLocale(locale: string) {
  if (!isLocale(locale)) return;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Storage may be unavailable (private mode); the language still applies for this session.
  }
}
