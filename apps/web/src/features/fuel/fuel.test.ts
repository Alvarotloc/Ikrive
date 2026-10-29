import type { FuelLog } from '@ikrive/shared';
import { describe, expect, it } from 'vitest';
import { computeThirdValue, formatInputNumber, parseFuelNumber, sortFuelLogs } from './fuel';

const log = (overrides: Partial<FuelLog>): FuelLog => ({
  id: 'f1',
  vehicleId: 'v1',
  date: '2025-03-10',
  odometer: 120_000,
  quantity: 40,
  totalPrice: 58.36,
  pricePerUnit: 1.459,
  fullTank: true,
  missedPrevious: false,
  createdAt: '2025-03-10T10:00:00.000Z',
  updatedAt: '2025-03-10T10:00:00.000Z',
  ...overrides,
});

const empty = { quantity: null, totalPrice: null, pricePerUnit: null };

describe('parseFuelNumber', () => {
  it('treats a single dot or comma as the decimal separator', () => {
    expect(parseFuelNumber('40.125', 3)).toEqual({ ok: true, value: 40.125 });
    expect(parseFuelNumber('40,125', 3)).toEqual({ ok: true, value: 40.125 });
    expect(parseFuelNumber('1.459', 3)).toEqual({ ok: true, value: 1.459 });
    expect(parseFuelNumber('58,36', 2)).toEqual({ ok: true, value: 58.36 });
    expect(parseFuelNumber('58', 2)).toEqual({ ok: true, value: 58 });
    expect(parseFuelNumber(' 58,3 ', 2)).toEqual({ ok: true, value: 58.3 });
    expect(parseFuelNumber('', 3)).toEqual({ ok: true, value: null });
    expect(parseFuelNumber('  ', 3)).toEqual({ ok: true, value: null });
  });

  it('rejects more than one separator or other characters', () => {
    for (const text of ['1.234,56', '1,234.56', '5.', ',5', '1 459', 'abc', '-5', '1e3']) {
      expect(parseFuelNumber(text, 3)).toEqual({ ok: false, reason: 'format' });
    }
  });

  it('rejects more fraction digits than allowed', () => {
    expect(parseFuelNumber('40,1255', 3)).toEqual({ ok: false, reason: 'fraction' });
    expect(parseFuelNumber('58,365', 2)).toEqual({ ok: false, reason: 'fraction' });
  });
});

describe('sortFuelLogs', () => {
  it('sorts logs by date, odometer and creation date descending', () => {
    const old = log({ id: 'old', date: '2024-12-01', odometer: 110_000 });
    const lowKm = log({ id: 'lowKm', date: '2025-03-10', odometer: 119_500 });
    const first = log({ id: 'first', createdAt: '2025-03-10T08:00:00.000Z' });
    const second = log({ id: 'second', createdAt: '2025-03-10T09:00:00.000Z' });
    const input = [old, first, lowKm, second];

    expect(sortFuelLogs(input).map(({ id }) => id)).toEqual(['second', 'first', 'lowKm', 'old']);
    expect(input.map(({ id }) => id)).toEqual(['old', 'first', 'lowKm', 'second']);
  });
});

describe('computeThirdValue', () => {
  it('computes the price per unit rounded to 3 decimals', () => {
    expect(computeThirdValue({ ...empty, quantity: 40.125, totalPrice: 58.54 }, 'pricePerUnit')).toBe(1.459);
    expect(computeThirdValue({ ...empty, quantity: 3, totalPrice: 10 }, 'pricePerUnit')).toBe(3.333);
  });

  it('computes the total price rounded to 2 decimals', () => {
    expect(computeThirdValue({ ...empty, quantity: 40.125, pricePerUnit: 1.459 }, 'totalPrice')).toBe(58.54);
    expect(computeThirdValue({ ...empty, quantity: 1.459, pricePerUnit: 40 }, 'totalPrice')).toBe(58.36);
  });

  it('computes the quantity rounded to 3 decimals', () => {
    expect(computeThirdValue({ ...empty, totalPrice: 58.54, pricePerUnit: 1.459 }, 'quantity')).toBe(40.123);
    expect(computeThirdValue({ ...empty, totalPrice: 10, pricePerUnit: 3 }, 'quantity')).toBe(3.333);
  });

  it('returns null without two positive values', () => {
    expect(computeThirdValue(empty, 'quantity')).toBeNull();
    expect(computeThirdValue({ ...empty, quantity: 40 }, 'totalPrice')).toBeNull();
    expect(computeThirdValue({ ...empty, quantity: 0, totalPrice: 50 }, 'pricePerUnit')).toBeNull();
    expect(computeThirdValue({ ...empty, quantity: Number.NaN, totalPrice: 50 }, 'pricePerUnit')).toBeNull();
    // The target already has a value: nothing to compute.
    expect(computeThirdValue({ quantity: 40, totalPrice: 50, pricePerUnit: 1.2 }, 'pricePerUnit')).toBeNull();
  });
});

describe('formatInputNumber', () => {
  it('formats input numbers for the locale', () => {
    expect(formatInputNumber(1.459, 'es')).toBe('1,459');
    expect(formatInputNumber(1.459, 'en')).toBe('1.459');
    expect(formatInputNumber(1234.5, 'es')).toBe('1234,5');
    expect(formatInputNumber(58, 'es')).toBe('58');
  });

  it('round-trips formatted input numbers through parseFuelNumber', () => {
    for (const locale of ['es', 'en']) {
      for (const value of [40.125, 1234.5]) {
        expect(parseFuelNumber(formatInputNumber(value, locale), 3)).toEqual({ ok: true, value });
      }
    }
  });
});
