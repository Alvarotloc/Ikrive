import type { FuelQuantityUnit, FuelType, VolumeUnit } from '../enums';

/**
 * Unit of a fuel log's quantity. It is not stored: electric vehicles charge in kWh and every other
 * fuel (plug-in hybrids included) uses the user's volume unit.
 */
export function fuelQuantityUnit(fuelType: FuelType, volumeUnit: VolumeUnit): FuelQuantityUnit {
  return fuelType === 'electric' ? 'kwh' : volumeUnit;
}

const round = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

export interface FuelPricesInput {
  quantity: number;
  totalPrice?: number;
  pricePerUnit?: number;
}

/**
 * Completes the price that is missing from the quantity and the other one: the total is rounded to
 * cents (2 decimals) and the price per unit to 3 decimals, as pumps show it. When both are given they
 * are kept as they are, because tickets round them separately.
 */
export function resolveFuelPrices({ quantity, totalPrice, pricePerUnit }: FuelPricesInput): {
  totalPrice: number;
  pricePerUnit: number;
} {
  if (totalPrice !== undefined && pricePerUnit !== undefined) return { totalPrice, pricePerUnit };
  if (totalPrice !== undefined) return { totalPrice, pricePerUnit: round(totalPrice / quantity, 3) };
  if (pricePerUnit !== undefined) return { totalPrice: round(quantity * pricePerUnit, 2), pricePerUnit };
  throw new Error('Either the total price or the price per unit is required');
}
