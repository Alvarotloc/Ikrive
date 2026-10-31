import { describe, expect, it } from 'vitest';
import { createStatsFormatters, type StatsFormatOptions } from './format';

const es: StatsFormatOptions = { locale: 'es', currency: 'EUR', distanceUnit: 'km', quantityUnitLabel: 'L' };
const en: StatsFormatOptions = {
  locale: 'en',
  currency: 'USD',
  distanceUnit: 'mi',
  quantityUnitLabel: 'gal',
};

// Intl separates the amount and the currency symbol with a non-breaking space in some locales.
const plain = (text: string) => text.replace(/\s/g, ' ');

describe('createStatsFormatters', () => {
  it('formats numbers with the locale separators', () => {
    expect(createStatsFormatters(es).number(12_345.4)).toBe('12.345');
    expect(createStatsFormatters(en).number(12_345.6)).toBe('12,346');
  });

  it('formats consumption with the quantity and distance units', () => {
    expect(createStatsFormatters(es).consumption(6.5)).toBe('6,5 L/100 km');
    expect(createStatsFormatters(en).consumption(4.2)).toBe('4.2 gal/100 mi');
    expect(createStatsFormatters({ ...es, quantityUnitLabel: 'kWh' }).consumption(18)).toBe('18 kWh/100 km');
    expect(createStatsFormatters(es).consumption(6.4567)).toBe('6,46 L/100 km');
  });

  it("formats the cost per distance in the user's currency", () => {
    expect(plain(createStatsFormatters(es).costPerDistance(0.085))).toBe('0,085 €/km');
    expect(plain(createStatsFormatters(es).costPerDistance(0.1))).toBe('0,10 €/km');
    expect(createStatsFormatters(en).costPerDistance(0.1234)).toBe('$0.123/mi');
    expect(createStatsFormatters(en).costPerDistance(0.5)).toBe('$0.50/mi');
  });

  it("formats months and dates in UTC with the user's locale", () => {
    // Parsed as local time, these would fall in the previous month or day west of UTC.
    expect(createStatsFormatters(es).month('2025-01')).toBe('ene 2025');
    expect(createStatsFormatters(en).month('2025-01')).toBe('Jan 2025');
    expect(createStatsFormatters(es).shortDate('2025-03-01')).toBe('1 mar');
    expect(createStatsFormatters(en).shortDate('2025-03-01')).toBe('Mar 1');
  });
});
