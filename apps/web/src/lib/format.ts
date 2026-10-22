import { DEFAULT_USER_SETTINGS } from '@ikrive/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { settingsQuery } from '@/features/settings/queries';

/** Today's date as `YYYY-MM-DD` in the browser's time zone, for date inputs. */
export function todayIso() {
  return new Date().toLocaleDateString('en-CA');
}

/** Locale- and settings-aware formatters (distance unit, currency). */
export function useFormat() {
  const { i18n } = useTranslation();
  const { data: settings = DEFAULT_USER_SETTINGS } = useQuery(settingsQuery);
  const locale = i18n.language;

  return useMemo(() => {
    const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
    const money = new Intl.NumberFormat(locale, { style: 'currency', currency: settings.currency });
    // Date-only values are stored without time zone; format them as UTC so the day never shifts.
    const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' });
    const dateTime = dateTimeFormat(locale, settings.timezone);
    const unit = settings.distanceUnit;
    return {
      distanceUnit: unit,
      number: (value: number) => number.format(value),
      distance: (value: number) => `${number.format(value)} ${unit}`,
      money: (value: number) => money.format(value),
      date: (iso: string) => date.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)),
      /** An instant (ISO date-time) as date and time in the user's time zone. */
      dateTime: (iso: string) => dateTime.format(new Date(iso)),
    };
  }, [locale, settings.currency, settings.distanceUnit, settings.timezone]);
}

/** Date and time in `timeZone`, or in the browser's zone when the saved one is not a valid IANA zone. */
function dateTimeFormat(locale: string, timeZone: string) {
  const options = { dateStyle: 'medium', timeStyle: 'short' } as const;
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone });
  } catch {
    return new Intl.DateTimeFormat(locale, options);
  }
}
