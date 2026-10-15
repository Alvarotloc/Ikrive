import { describe, expect, it } from 'vitest';
import { createMaintenanceRecordSchema, updateMaintenanceRecordSchema } from './maintenance';

const valid = { date: '2026-05-10', category: 'oil_change', title: 'Cambio de aceite' } as const;

describe('createMaintenanceRecordSchema', () => {
  it('rejects categories outside MAINTENANCE_CATEGORIES', () => {
    expect(createMaintenanceRecordSchema.safeParse(valid).success).toBe(true);
    expect(createMaintenanceRecordSchema.safeParse({ ...valid, category: 'car_wash' }).success).toBe(false);
  });

  it('stores blank optional texts as null', () => {
    const parsed = createMaintenanceRecordSchema.parse({
      ...valid,
      description: '   ',
      workshop: '  Taller Paco ',
    });
    expect(parsed).toMatchObject({ description: null, workshop: 'Taller Paco', includeInReport: true });
  });
});

describe('updateMaintenanceRecordSchema', () => {
  it('does not default includeInReport on update', () => {
    expect(updateMaintenanceRecordSchema.parse({ title: 'Filtros' })).toEqual({ title: 'Filtros' });
    expect(updateMaintenanceRecordSchema.parse({ includeInReport: false })).toEqual({
      includeInReport: false,
    });
  });
});
