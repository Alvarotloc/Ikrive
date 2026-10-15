import type { MaintenanceRecord } from '@ikrive/shared';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { defaultsFrom, formErrorFor, type MaintenanceFormInput, maintenanceFormSchema } from './form';

const input = (overrides: Partial<MaintenanceFormInput> = {}): MaintenanceFormInput => ({
  date: '2025-03-10',
  odometer: '',
  category: 'oil_change',
  title: 'Cambio de aceite',
  description: '',
  workshop: '',
  cost: '',
  includeInReport: true,
  ...overrides,
});

const record: MaintenanceRecord = {
  id: 'r1',
  vehicleId: 'v1',
  date: '2025-03-10',
  odometer: 120_000,
  category: 'brakes',
  title: 'Pastillas delanteras',
  description: 'Discos revisados',
  workshop: 'Taller Paco',
  cost: 180.5,
  includeInReport: false,
  createdAt: '2025-03-10T10:00:00.000Z',
  updatedAt: '2025-03-10T10:00:00.000Z',
};

describe('maintenance form', () => {
  it('turns blank odometer and cost into null', () => {
    const values = maintenanceFormSchema.parse(input({ odometer: '  ', cost: '' }));

    expect(values).toMatchObject({ odometer: null, cost: null, description: null, workshop: null });
  });

  it('parses Spanish and English cost notation', () => {
    expect(maintenanceFormSchema.parse(input({ cost: '1.234,56', odometer: '120.000' }))).toMatchObject({
      cost: 1234.56,
      odometer: 120_000,
    });
    expect(maintenanceFormSchema.parse(input({ cost: '1,234.56' })).cost).toBe(1234.56);
  });

  it('rejects an empty title and a non-numeric odometer', () => {
    const result = maintenanceFormSchema.safeParse(input({ title: '   ', odometer: 'mucho' }));

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.')).sort()).toEqual(['odometer', 'title']);
  });

  it('prefills the form from a record', () => {
    expect(defaultsFrom(record)).toEqual({
      date: '2025-03-10',
      odometer: '120000',
      category: 'brakes',
      title: 'Pastillas delanteras',
      description: 'Discos revisados',
      workshop: 'Taller Paco',
      cost: '180.5',
      includeInReport: false,
    });
    expect(defaultsFrom()).toMatchObject({
      category: 'oil_change',
      includeInReport: true,
      title: '',
      odometer: '',
    });
    expect(defaultsFrom().date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(maintenanceFormSchema.parse(defaultsFrom(record))).toMatchObject({
      odometer: 120_000,
      cost: 180.5,
    });
  });

  it('maps a 409 problem to the odometer field', () => {
    const error = new ApiError({ type: 'about:blank', title: 'Conflict', status: 409, detail: 'backwards' });

    expect(formErrorFor(error)).toEqual({
      field: 'odometer',
      messageKey: 'maintenance.errors.odometerConflict',
    });
  });

  it('maps a 400 problem without errors to the date field', () => {
    const error = new ApiError({ type: 'about:blank', title: 'Bad Request', status: 400, detail: 'future' });

    expect(formErrorFor(error)).toEqual({ field: 'date', messageKey: 'maintenance.errors.future' });
  });

  it('maps any other error to the generic message', () => {
    const validation = new ApiError({
      type: 'about:blank',
      title: 'Validation failed',
      status: 400,
      errors: [{ path: 'title', message: 'Too small' }],
    });
    const server = new ApiError({ type: 'about:blank', title: 'Internal Server Error', status: 500 });

    for (const error of [validation, server, new TypeError('Failed to fetch'), undefined]) {
      expect(formErrorFor(error)).toEqual({ field: 'root', messageKey: 'common.error' });
    }
  });
});
