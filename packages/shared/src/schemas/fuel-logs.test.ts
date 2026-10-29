import { describe, expect, it } from 'vitest';
import { createFuelLogSchema, updateFuelLogSchema } from './fuel-logs';

const valid = { date: '2026-05-10', odometer: 45_000, quantity: 40, totalPrice: 58.36 } as const;

describe('createFuelLogSchema', () => {
  it('requires at least one price', () => {
    const { totalPrice: _totalPrice, ...withoutPrices } = valid;
    const result = createFuelLogSchema.safeParse(withoutPrices);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['totalPrice']);
    expect(createFuelLogSchema.parse(valid)).toMatchObject({ totalPrice: 58.36, pricePerUnit: 1.459 });
    expect(createFuelLogSchema.parse({ ...withoutPrices, pricePerUnit: 1.459 })).toMatchObject({
      totalPrice: 58.36,
      pricePerUnit: 1.459,
    });
  });

  it('rejects non-positive quantity and prices', () => {
    for (const payload of [
      { ...valid, quantity: 0 },
      { ...valid, quantity: -5 },
      { ...valid, quantity: 10_001 },
      { ...valid, totalPrice: 0 },
      { ...valid, totalPrice: -1 },
      { ...valid, pricePerUnit: 0 },
    ]) {
      expect(createFuelLogSchema.safeParse(payload).success, JSON.stringify(payload)).toBe(false);
    }
    expect(updateFuelLogSchema.safeParse({ quantity: 0 }).success).toBe(false);
    expect(updateFuelLogSchema.safeParse({ pricePerUnit: -1.5 }).success).toBe(false);
  });

  it('requires the odometer on create', () => {
    const { odometer: _odometer, ...withoutOdometer } = valid;
    expect(createFuelLogSchema.safeParse(withoutOdometer).success).toBe(false);
    expect(createFuelLogSchema.safeParse({ ...valid, odometer: null }).success).toBe(false);
    expect(createFuelLogSchema.safeParse({ ...valid, odometer: 45_000.5 }).success).toBe(false);
    expect(updateFuelLogSchema.safeParse({ odometer: null }).success).toBe(false);
  });

  it('defaults fullTank and missedPrevious on create only', () => {
    expect(createFuelLogSchema.parse(valid)).toMatchObject({ fullTank: true, missedPrevious: false });
    expect(createFuelLogSchema.parse({ ...valid, fullTank: false, missedPrevious: true })).toMatchObject({
      fullTank: false,
      missedPrevious: true,
    });
    expect(updateFuelLogSchema.parse({ quantity: 30 })).toEqual({ quantity: 30 });
    expect(updateFuelLogSchema.parse({ fullTank: false })).toEqual({ fullTank: false });
  });
});
