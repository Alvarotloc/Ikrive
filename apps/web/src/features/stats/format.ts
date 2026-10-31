import type { DistanceUnit } from '@ikrive/shared';

export interface StatsFormatOptions {
  locale: string;
  currency: string;
  distanceUnit: DistanceUnit;
  /** Label of the vehicle's quantity unit (`fuel.units.*`): "L", "gal" or "kWh". */
  quantityUnitLabel: string;
}

/** `YYYY-MM` or `YYYY-MM-DD` as a UTC instant, so the month or day never shifts with the browser's zone. */
const utc = (value: string) =>
  new Date(`${value.length === 7 ? `${value}-01` : value.slice(0, 10)}T00:00:00Z`);

/** Pure formatters for the vehicle statistics: they depend only on the locale, currency and units. */
export function createStatsFormatters({
  locale,
  currency,
  distanceUnit,
  quantityUnitLabel,
}: StatsFormatOptions) {
  const integer = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const consumption = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const costPerDistance = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  });
  const month = new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const shortDate = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });

  return {
    /** "6,5 L/100 km" (up to 2 decimals). */
    consumption: (value: number) => `${consumption.format(value)} ${quantityUnitLabel}/100 ${distanceUnit}`,
    /** "0,085 €/km" (in the user's currency, 2 to 3 decimals). */
    costPerDistance: (value: number) => `${costPerDistance.format(value)}/${distanceUnit}`,
    /** `2025-03` → "mar 2025". */
    month: (value: string) => month.format(utc(value)),
    /** `2025-03-10` → "10 mar", for the X axis. */
    shortDate: (iso: string) => shortDate.format(utc(iso)),
    /** Axis ticks, without decimals. */
    number: (value: number) => integer.format(value),
  };
}

export type StatsFormatters = ReturnType<typeof createStatsFormatters>;
