import { type FuelLog, resolveFuelPrices } from '@ikrive/shared';

/** The three values of a refuel: any two of them determine the third. */
export type FuelValueField = 'quantity' | 'totalPrice' | 'pricePerUnit';

export const FUEL_VALUE_FIELDS: readonly FuelValueField[] = ['quantity', 'totalPrice', 'pricePerUnit'];

/** Decimals accepted (and computed) for each value: pumps show 3 for the quantity and the price per unit. */
export const FUEL_FRACTION_DIGITS: Record<FuelValueField, number> = {
  quantity: 3,
  totalPrice: 2,
  pricePerUnit: 3,
};

export type FuelNumberResult =
  | { ok: true; value: number | null }
  | { ok: false; reason: 'format' | 'fraction' };

/**
 * Parses a refuel value. A single `.` or `,` is ALWAYS the decimal separator ("1.459" → 1.459,
 * "58,36" → 58.36): thousands separators are not accepted and nothing is reinterpreted or rounded.
 * Blank → null; more than `maxFractionDigits` decimals → 'fraction'; anything else
 * ("1.234,56", "5.", "1 459", letters) → 'format'.
 */
export function parseFuelNumber(text: string, maxFractionDigits: number): FuelNumberResult {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, value: null };
  const match = /^(\d+)(?:[.,](\d+))?$/.exec(trimmed);
  if (!match) return { ok: false, reason: 'format' };
  const fraction = match[2] ?? '';
  if (fraction.length > maxFractionDigits) return { ok: false, reason: 'fraction' };
  return { ok: true, value: Number(`${match[1]}.${fraction || '0'}`) };
}

/** Newest first: by date, then odometer, then creation time (all descending). */
export function sortFuelLogs(logs: FuelLog[]): FuelLog[] {
  return [...logs].sort(
    (a, b) =>
      b.date.localeCompare(a.date) || b.odometer - a.odometer || b.createdAt.localeCompare(a.createdAt),
  );
}

const isPositive = (value: number | null): value is number =>
  value !== null && Number.isFinite(value) && value > 0;

const round = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/**
 * The value of `target` computed from the other two, when both are positive and `target` is empty;
 * otherwise null. Prices are rounded as `resolveFuelPrices` does (total to 2, per unit to 3) and the
 * quantity to 3 decimals.
 */
export function computeThirdValue(
  values: Record<FuelValueField, number | null>,
  target: FuelValueField,
): number | null {
  if (values[target] !== null) return null;
  const { quantity, totalPrice, pricePerUnit } = values;
  switch (target) {
    case 'quantity':
      return isPositive(totalPrice) && isPositive(pricePerUnit)
        ? round(totalPrice / pricePerUnit, FUEL_FRACTION_DIGITS.quantity)
        : null;
    case 'totalPrice':
      return isPositive(quantity) && isPositive(pricePerUnit)
        ? resolveFuelPrices({ quantity, pricePerUnit }).totalPrice
        : null;
    case 'pricePerUnit':
      return isPositive(quantity) && isPositive(totalPrice)
        ? resolveFuelPrices({ quantity, totalPrice }).pricePerUnit
        : null;
  }
}

/**
 * A number to write into an input in `locale` ("1,459" in Spanish): no thousands grouping and at most
 * 3 decimals, so `parseFuelNumber` reads it back as the same value.
 */
export function formatInputNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 3 }).format(value);
}
