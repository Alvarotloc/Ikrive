import type { i18n as I18n } from 'i18next';
import { z } from 'zod';

type Issue = Parameters<z.core.$ZodErrorMap>[0];

const isBlank = (input: unknown) => input === undefined || input === null || input === '';

/**
 * Translates a zod issue into a user-facing message with the `validation.*` keys.
 * Covers every issue the web forms can raise; anything else gets a generic "invalid value",
 * so zod's English defaults never reach the UI.
 */
export function validationMessage(issue: Issue, i18n: I18n): string {
  const { t } = i18n;
  // Grouping only from 5 digits: a year (1886) reads as such, a mileage (9.999.999) stays legible.
  const number = (value: number | bigint) =>
    new Intl.NumberFormat(i18n.language, { useGrouping: 'min2' }).format(value);

  switch (issue.code) {
    case 'invalid_type':
      if (isBlank(issue.input)) return t('validation.required');
      if (issue.expected === 'int') return t('validation.integer');
      if (issue.expected === 'number') return t('validation.number');
      break;
    case 'too_small':
      if (issue.origin === 'string') {
        const count = Number(issue.minimum);
        if (issue.exact) return t('validation.exactLength', { count });
        return count === 1 ? t('validation.required') : t('validation.minLength', { count });
      }
      if ((issue.origin === 'number' || issue.origin === 'int') && issue.inclusive !== false) {
        return t('validation.min', { min: number(issue.minimum) });
      }
      break;
    case 'too_big':
      if (issue.origin === 'string') {
        const count = Number(issue.maximum);
        return t(issue.exact ? 'validation.exactLength' : 'validation.maxLength', { count });
      }
      if ((issue.origin === 'number' || issue.origin === 'int') && issue.inclusive !== false) {
        return t('validation.max', { max: number(issue.maximum) });
      }
      break;
    case 'invalid_format':
      if (isBlank(issue.input)) return t('validation.required');
      if (issue.format === 'email') return t('validation.email');
      if (issue.format === 'date') return t('validation.date');
      break;
    case 'invalid_value':
      return t('validation.option');
  }
  return t('validation.invalid');
}

/**
 * Makes zod speak the active i18next language. Configured once for the whole app (also covers
 * the `@ikrive/shared` schemas, which use the same zod instance). The message is built when a
 * schema is validated, so after `changeLanguage` the next validation already uses the new language.
 */
export function configureZodMessages(i18n: I18n) {
  z.config({ customError: (issue) => validationMessage(issue, i18n) });
}
