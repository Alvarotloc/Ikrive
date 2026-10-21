import { describe, expect, it } from 'vitest';
import { createMaintenanceScheduleSchema, updateMaintenanceScheduleSchema } from './schedules';

const valid = { title: 'Cambio de aceite', category: 'oil_change', intervalMonths: 12 } as const;

describe('createMaintenanceScheduleSchema', () => {
  it('requires at least one interval', () => {
    expect(createMaintenanceScheduleSchema.safeParse(valid).success).toBe(true);
    expect(
      createMaintenanceScheduleSchema.safeParse({
        ...valid,
        intervalMonths: undefined,
        intervalDistance: 15_000,
      }).success,
    ).toBe(true);

    for (const intervals of [
      { intervalMonths: undefined },
      { intervalMonths: null, intervalDistance: null },
    ]) {
      const result = createMaintenanceScheduleSchema.safeParse({ ...valid, ...intervals });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(['intervalMonths']);
    }
  });

  it('rejects categories outside MAINTENANCE_CATEGORIES', () => {
    expect(createMaintenanceScheduleSchema.safeParse({ ...valid, category: 'car_wash' }).success).toBe(false);
  });

  it('defaults the warning thresholds on create', () => {
    expect(createMaintenanceScheduleSchema.parse(valid)).toEqual({
      ...valid,
      warnDays: 30,
      warnDistance: 1000,
    });
    expect(createMaintenanceScheduleSchema.parse({ ...valid, warnDays: 0, warnDistance: 500 })).toMatchObject(
      {
        warnDays: 0,
        warnDistance: 500,
      },
    );
  });
});

describe('updateMaintenanceScheduleSchema', () => {
  it('does not default the warning thresholds on update', () => {
    expect(updateMaintenanceScheduleSchema.parse({ title: 'Filtros' })).toEqual({ title: 'Filtros' });
    expect(updateMaintenanceScheduleSchema.parse({ warnDays: 7 })).toEqual({ warnDays: 7 });
  });
});
