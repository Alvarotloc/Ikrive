import { describe, expect, it } from 'vitest';
import { editedFuelPrices, fuelQuantityUnit, resolveFuelPrices } from './fuel';

describe('fuelQuantityUnit', () => {
  it('uses kWh only for electric vehicles', () => {
    expect(fuelQuantityUnit('electric', 'l')).toBe('kwh');
    expect(fuelQuantityUnit('electric', 'gal')).toBe('kwh');
    expect(fuelQuantityUnit('gasoline', 'l')).toBe('l');
    expect(fuelQuantityUnit('diesel', 'gal')).toBe('gal');
    expect(fuelQuantityUnit('plugin_hybrid', 'l')).toBe('l');
    expect(fuelQuantityUnit('plugin_hybrid', 'gal')).toBe('gal');
  });
});

describe('resolveFuelPrices', () => {
  it('computes the price per unit rounded to 3 decimals', () => {
    expect(resolveFuelPrices({ quantity: 40, totalPrice: 58.36 })).toEqual({
      totalPrice: 58.36,
      pricePerUnit: 1.459,
    });
    // 50 / 3 = 16.6666...
    expect(resolveFuelPrices({ quantity: 3, totalPrice: 50 })).toEqual({
      totalPrice: 50,
      pricePerUnit: 16.667,
    });
  });

  it('computes the total price rounded to 2 decimals', () => {
    expect(resolveFuelPrices({ quantity: 40, pricePerUnit: 1.459 })).toEqual({
      totalPrice: 58.36,
      pricePerUnit: 1.459,
    });
    expect(resolveFuelPrices({ quantity: 35.27, pricePerUnit: 1.549 })).toEqual({
      totalPrice: 54.63,
      pricePerUnit: 1.549,
    });
    // 3 × 0.1 is 0.30000000000000004 in floating point.
    expect(resolveFuelPrices({ quantity: 3, pricePerUnit: 0.1 })).toEqual({
      totalPrice: 0.3,
      pricePerUnit: 0.1,
    });
  });

  it('keeps both prices when both are given', () => {
    expect(resolveFuelPrices({ quantity: 40, totalPrice: 60, pricePerUnit: 1.459 })).toEqual({
      totalPrice: 60,
      pricePerUnit: 1.459,
    });
  });

  it('throws without any price', () => {
    expect(() => resolveFuelPrices({ quantity: 40 })).toThrow();
  });
});

describe('editedFuelPrices', () => {
  const stored = { quantity: 40, totalPrice: 60 };

  it('keeps both prices sent', () => {
    expect(editedFuelPrices(stored, { quantity: 50, totalPrice: 70, pricePerUnit: 1.399 })).toEqual({
      totalPrice: 70,
      pricePerUnit: 1.399,
    });
  });

  it('recomputes the other price from the resulting quantity', () => {
    expect(editedFuelPrices(stored, { totalPrice: 58.36 })).toEqual({
      totalPrice: 58.36,
      pricePerUnit: 1.459,
    });
    expect(editedFuelPrices(stored, { quantity: 50, pricePerUnit: 1.5 })).toEqual({
      totalPrice: 75,
      pricePerUnit: 1.5,
    });
  });

  it('keeps the total when only the quantity changes', () => {
    expect(editedFuelPrices(stored, { quantity: 48 })).toEqual({ totalPrice: 60, pricePerUnit: 1.25 });
  });

  it('returns nothing without price or quantity', () => {
    expect(editedFuelPrices(stored, {})).toEqual({});
  });
});
