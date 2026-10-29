import type { FuelLog } from '@ikrive/shared';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { todayIso } from '@/lib/format';
import { defaultsFrom, type FuelFormInput, formErrorFor, fuelFormSchema } from './form';

const input = (overrides: Partial<FuelFormInput> = {}): FuelFormInput => ({
  date: '2025-03-10',
  odometer: '120000',
  quantity: '',
  totalPrice: '',
  pricePerUnit: '',
  fullTank: true,
  missedPrevious: false,
  ...overrides,
});

const log: FuelLog = {
  id: 'f1',
  vehicleId: 'v1',
  date: '2025-03-10',
  odometer: 120_000,
  quantity: 40.125,
  totalPrice: 58.54,
  pricePerUnit: 1.459,
  fullTank: false,
  missedPrevious: true,
  createdAt: '2025-03-10T10:00:00.000Z',
  updatedAt: '2025-03-10T10:00:00.000Z',
};

/** Message of each issue by field path. */
function issues(overrides: Partial<FuelFormInput>) {
  const result = fuelFormSchema.safeParse(input(overrides));
  expect(result.success).toBe(false);
  return Object.fromEntries(
    (result.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message]),
  );
}

const problem = (status: number, extra: object = {}) =>
  new ApiError({ type: 'about:blank', title: 'Error', status, ...extra });

describe('fuel form', () => {
  it('completes the missing value on parse', () => {
    expect(fuelFormSchema.parse(input({ quantity: '40,125', totalPrice: '58,54' }))).toEqual({
      date: '2025-03-10',
      odometer: 120_000,
      quantity: 40.125,
      totalPrice: 58.54,
      pricePerUnit: 1.459,
      fullTank: true,
      missedPrevious: false,
    });
    expect(fuelFormSchema.parse(input({ quantity: '40,125', pricePerUnit: '1,459' })).totalPrice).toBe(58.54);
    expect(fuelFormSchema.parse(input({ totalPrice: '58,54', pricePerUnit: '1,459' })).quantity).toBe(40.123);
    // The three typed values are kept as they are.
    expect(
      fuelFormSchema.parse(input({ quantity: '40', totalPrice: '58,40', pricePerUnit: '1,459' })),
    ).toMatchObject({ quantity: 40, totalPrice: 58.4, pricePerUnit: 1.459 });
  });

  it('requires two of the three values', () => {
    const twoOfThree = 'Rellena al menos dos de: cantidad, precio total y precio por unidad.';

    expect(issues({ quantity: '40' })).toEqual({ totalPrice: twoOfThree, pricePerUnit: twoOfThree });
    expect(issues({})).toEqual({ quantity: twoOfThree, totalPrice: twoOfThree, pricePerUnit: twoOfThree });
  });

  it('rejects non-positive values and a non-integer odometer', () => {
    expect(issues({ quantity: '0', totalPrice: '50', odometer: 'abc' })).toEqual({
      quantity: 'El valor no es válido.',
      odometer: 'Introduce un número válido.',
    });
    expect(Object.keys(issues({ quantity: '40', totalPrice: '0' }))).toEqual(['totalPrice']);
    expect(Object.keys(issues({ quantity: '10001', totalPrice: '50' }))).toEqual(['quantity']);
    expect(Object.keys(issues({ quantity: '40', totalPrice: '50', odometer: '' }))).toEqual(['odometer']);
  });

  it('parses a single separator as decimal in every value', () => {
    expect(fuelFormSchema.parse(input({ quantity: '1.459', totalPrice: '58,36' }))).toMatchObject({
      quantity: 1.459,
      totalPrice: 58.36,
    });
    expect(fuelFormSchema.parse(input({ quantity: '40', pricePerUnit: '1,459' })).pricePerUnit).toBe(1.459);
  });

  it('flags several separators as an invalid number', () => {
    const invalid = 'Introduce un número válido.';

    expect(issues({ quantity: '1.234,56', totalPrice: '50' })).toEqual({ quantity: invalid });
    expect(issues({ quantity: '40', totalPrice: '1.234,56' })).toEqual({ totalPrice: invalid });
    expect(issues({ quantity: '40', pricePerUnit: '1.234,56' })).toEqual({ pricePerUnit: invalid });
  });

  it('flags too many decimals with the field maximum', () => {
    expect(issues({ quantity: '40,1255', totalPrice: '50' })).toEqual({
      quantity: 'Como mucho 3 decimales.',
    });
    expect(issues({ quantity: '40', totalPrice: '58,365' })).toEqual({
      totalPrice: 'Como mucho 2 decimales.',
    });
    expect(issues({ quantity: '40', pricePerUnit: '1,4599' })).toEqual({
      pricePerUnit: 'Como mucho 3 decimales.',
    });
  });

  it('defaults a new log to today, full tank and the last odometer', () => {
    expect(defaultsFrom({ lastOdometer: 132_480 })).toEqual({
      date: todayIso(),
      odometer: '132480',
      quantity: '',
      totalPrice: '',
      pricePerUnit: '',
      fullTank: true,
      missedPrevious: false,
    });
    expect(defaultsFrom({}).odometer).toBe('');
  });

  it('prefills the form from a log', () => {
    expect(defaultsFrom({ log, lastOdometer: 130_000 })).toEqual({
      date: '2025-03-10',
      odometer: '120000',
      quantity: '40,125',
      totalPrice: '58,54',
      pricePerUnit: '1,459',
      fullTank: false,
      missedPrevious: true,
    });
  });

  it('maps a 409 problem to the odometer field', () => {
    expect(formErrorFor(problem(409))).toEqual({
      field: 'odometer',
      messageKey: 'fuel.errors.odometerConflict',
    });
  });

  it('maps a 400 problem without errors to the date field', () => {
    expect(formErrorFor(problem(400))).toEqual({ field: 'date', messageKey: 'fuel.errors.future' });
  });

  it('maps any other error to the generic message', () => {
    const generic = { field: 'root', messageKey: 'common.error' };

    expect(formErrorFor(problem(400, { errors: [{ path: 'quantity', message: 'Too big' }] }))).toEqual(
      generic,
    );
    expect(formErrorFor(problem(500))).toEqual(generic);
    expect(formErrorFor(new Error('offline'))).toEqual(generic);
  });
});
