import { createMaintenanceRecordSchema, type MaintenanceRecord } from '@ikrive/shared';
import { z } from 'zod';
import { parseDecimal, parseInteger } from '@/features/vehicles/numbers';
import { ApiError } from '@/lib/api-client';
import { todayIso } from '@/lib/format';

const shape = createMaintenanceRecordSchema.shape;

/**
 * The shared create schema, with the numeric fields typed as text ("1.234,56", blank → null).
 * `unwrap()` drops the `optional()`: a text field always yields a number or null.
 */
export const maintenanceFormSchema = z.object({
  date: shape.date,
  odometer: z.string().transform(parseInteger).pipe(shape.odometer.unwrap()),
  category: shape.category,
  title: shape.title,
  description: shape.description,
  workshop: shape.workshop,
  cost: z.string().transform(parseDecimal).pipe(shape.cost.unwrap()),
  includeInReport: z.boolean(),
  /** Select value: '' is "none". */
  scheduleId: z
    .string()
    .transform((value) => value || null)
    .pipe(shape.scheduleId.unwrap()),
});

export type MaintenanceFormInput = z.input<typeof maintenanceFormSchema>;
export type MaintenanceFormValues = z.output<typeof maintenanceFormSchema>;

const toText = (value: number | string | null | undefined) => (value == null ? '' : String(value));

/** Form values for editing `record`, or the defaults of a new record (today, oil change, in the report). */
export function defaultsFrom(record?: MaintenanceRecord): MaintenanceFormInput {
  return {
    date: record?.date ?? todayIso(),
    odometer: toText(record?.odometer),
    category: record?.category ?? 'oil_change',
    title: toText(record?.title),
    description: toText(record?.description),
    workshop: toText(record?.workshop),
    cost: toText(record?.cost),
    includeInReport: record?.includeInReport ?? true,
    scheduleId: record?.scheduleId ?? '',
  };
}

export type MaintenanceFormError = { field: 'odometer' | 'date' | 'root'; messageKey: string };

/**
 * Where to show an error returned by the API when saving.
 * The API has no machine-readable codes: 409 is an odometer conflict and a 400 without
 * validation `errors` is the future-date rule.
 */
export function formErrorFor(error: unknown): MaintenanceFormError {
  if (error instanceof ApiError) {
    const { status, errors } = error.problem;
    if (status === 409) return { field: 'odometer', messageKey: 'maintenance.errors.odometerConflict' };
    if (status === 400 && !errors) return { field: 'date', messageKey: 'maintenance.errors.future' };
  }
  return { field: 'root', messageKey: 'common.error' };
}
