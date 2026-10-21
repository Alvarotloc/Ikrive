import {
  type CreateMaintenanceScheduleInput,
  createMaintenanceScheduleSchema,
  type DistanceUnit,
  type MaintenanceSchedule,
  type UpdateMaintenanceScheduleInput,
} from '@ikrive/shared';
import { z } from 'zod';
import { parseInteger } from '@/features/vehicles/numbers';
import i18n from '@/i18n';

const shape = createMaintenanceScheduleSchema.shape;

/**
 * A whole number typed as text ("15.000"); blank → null, which `schema` rejects as required unless it
 * is nullable. `preprocess` lets the parsed value reach non-nullable schemas such as `warnDays`.
 */
const integerText = <T extends z.ZodType<number | null>>(schema: T) =>
  z.string().pipe(z.preprocess((text) => parseInteger(String(text)), schema));

/**
 * The shared create schema with the numeric fields typed as text. Its own interval refine replaces the
 * shared one, whose literal English message would take precedence over the translated zod messages.
 * `unit` is the user's distance unit, shown in the interval error.
 */
export const scheduleFormSchema = (unit: DistanceUnit) =>
  z
    .object({
      title: shape.title,
      category: shape.category,
      intervalMonths: integerText(shape.intervalMonths.unwrap()),
      intervalDistance: integerText(shape.intervalDistance.unwrap()),
      // `unwrap()` drops the default: a blank threshold is an error, not 30 days.
      warnDays: integerText(shape.warnDays.unwrap()),
      warnDistance: integerText(shape.warnDistance.unwrap()),
      lastDoneDate: z
        .string()
        .transform((value) => value || undefined)
        .pipe(shape.lastDoneDate),
      lastDoneOdometer: integerText(shape.lastDoneOdometer.unwrap()),
    })
    .refine((value) => value.intervalMonths !== null || value.intervalDistance !== null, {
      path: ['intervalMonths'],
      error: () => i18n.t('schedules.errors.intervalRequired', { unit }),
    });

export type ScheduleFormInput = z.input<ReturnType<typeof scheduleFormSchema>>;
export type ScheduleFormValues = z.output<ReturnType<typeof scheduleFormSchema>>;

const toText = (value: number | string | null | undefined) => (value == null ? '' : String(value));

/** Form values for editing `schedule`, or the defaults of a new one (oil change, warn 30 days / 1000 before). */
export function defaultsFrom(schedule?: MaintenanceSchedule): ScheduleFormInput {
  return {
    title: toText(schedule?.title),
    category: schedule?.category ?? 'oil_change',
    intervalMonths: toText(schedule?.intervalMonths),
    intervalDistance: toText(schedule?.intervalDistance),
    warnDays: toText(schedule?.warnDays ?? 30),
    warnDistance: toText(schedule?.warnDistance ?? 1000),
    lastDoneDate: toText(schedule?.lastDoneDate),
    lastDoneOdometer: toText(schedule?.lastDoneOdometer),
  };
}

/** Body of `POST`: blank "last done" fields are left out so the API applies its defaults. */
export function toCreateBody({
  lastDoneDate,
  lastDoneOdometer,
  ...values
}: ScheduleFormValues): CreateMaintenanceScheduleInput {
  return {
    ...values,
    ...(lastDoneDate !== undefined && { lastDoneDate }),
    ...(lastDoneOdometer !== null && { lastDoneOdometer }),
  };
}

/**
 * Body of `PATCH`: every field, blank intervals and last done odometer as null.
 * The last done date cannot be cleared (the API always keeps one), so a blank one is left out.
 */
export function toUpdateBody({
  lastDoneDate,
  ...values
}: ScheduleFormValues): UpdateMaintenanceScheduleInput {
  return { ...values, ...(lastDoneDate !== undefined && { lastDoneDate }) };
}
