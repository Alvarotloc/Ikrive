import { type FuelLog, isoDateSchema, moneySchema, odometerValueSchema } from '@ikrive/shared';
import { z } from 'zod';
import { parseInteger } from '@/features/vehicles/numbers';
import i18n from '@/i18n';
import { ApiError } from '@/lib/api-client';
import { todayIso } from '@/lib/format';
import {
  computeThirdValue,
  FUEL_FRACTION_DIGITS,
  FUEL_VALUE_FIELDS,
  formatInputNumber,
  parseFuelNumber,
} from './fuel';

/**
 * A refuel value typed as text, with a single separator always decimal (blank → null).
 * A malformed number becomes NaN, so the number schema reports "enter a valid number";
 * too many decimals get their own message with the field maximum.
 */
const fuelNumber = (digits: number) =>
  z.string().transform((text, ctx) => {
    const result = parseFuelNumber(text, digits);
    if (result.ok) return result.value;
    if (result.reason === 'format') return Number.NaN;
    ctx.addIssue({ code: 'custom', message: i18n.t('fuel.errors.maxDecimals', { count: digits }) });
    return z.NEVER;
  });

/** Same limits as `createFuelLogSchema`; any two of the three values complete the third on parse. */
export const fuelFormSchema = z
  .object({
    date: isoDateSchema,
    odometer: z.string().transform(parseInteger).pipe(odometerValueSchema),
    quantity: fuelNumber(FUEL_FRACTION_DIGITS.quantity).pipe(z.number().positive().max(10_000).nullable()),
    totalPrice: fuelNumber(FUEL_FRACTION_DIGITS.totalPrice).pipe(moneySchema.positive().nullable()),
    pricePerUnit: fuelNumber(FUEL_FRACTION_DIGITS.pricePerUnit).pipe(moneySchema.positive().nullable()),
    fullTank: z.boolean(),
    missedPrevious: z.boolean(),
  })
  .superRefine((values, ctx) => {
    const blank = FUEL_VALUE_FIELDS.filter((field) => values[field] === null);
    if (blank.length < 2) return;
    for (const field of blank) {
      ctx.addIssue({ code: 'custom', path: [field], message: i18n.t('fuel.errors.twoOfThree') });
    }
  })
  .transform((values, ctx) => {
    const quantity = values.quantity ?? computeThirdValue(values, 'quantity');
    const totalPrice = values.totalPrice ?? computeThirdValue(values, 'totalPrice');
    const pricePerUnit = values.pricePerUnit ?? computeThirdValue(values, 'pricePerUnit');
    if (quantity === null || totalPrice === null || pricePerUnit === null) {
      // Unreachable after the refinement above; keeps the output fully numeric.
      ctx.addIssue({ code: 'custom', path: ['quantity'], message: i18n.t('fuel.errors.twoOfThree') });
      return z.NEVER;
    }
    return { ...values, quantity, totalPrice, pricePerUnit };
  });

export type FuelFormInput = z.input<typeof fuelFormSchema>;
export type FuelFormValues = z.output<typeof fuelFormSchema>;

/**
 * Form values for editing `log`, or the defaults of a new refuel: today, a full tank and the last
 * odometer reading proposed.
 */
export function defaultsFrom({ log, lastOdometer }: { log?: FuelLog; lastOdometer?: number }): FuelFormInput {
  const number = (value: number) => formatInputNumber(value, i18n.language);
  if (log) {
    return {
      date: log.date,
      odometer: String(log.odometer),
      quantity: number(log.quantity),
      totalPrice: number(log.totalPrice),
      pricePerUnit: number(log.pricePerUnit),
      fullTank: log.fullTank,
      missedPrevious: log.missedPrevious,
    };
  }
  return {
    date: todayIso(),
    odometer: lastOdometer === undefined ? '' : String(lastOdometer),
    quantity: '',
    totalPrice: '',
    pricePerUnit: '',
    fullTank: true,
    missedPrevious: false,
  };
}

export type FuelFormError = { field: 'odometer' | 'date' | 'root'; messageKey: string };

/**
 * Where to show an error returned by the API when saving.
 * The API has no machine-readable codes: 409 is an odometer conflict and a 400 without
 * validation `errors` is the future-date rule.
 */
export function formErrorFor(error: unknown): FuelFormError {
  if (error instanceof ApiError) {
    const { status, errors } = error.problem;
    if (status === 409) return { field: 'odometer', messageKey: 'fuel.errors.odometerConflict' };
    if (status === 400 && !errors) return { field: 'date', messageKey: 'fuel.errors.future' };
  }
  return { field: 'root', messageKey: 'common.error' };
}
