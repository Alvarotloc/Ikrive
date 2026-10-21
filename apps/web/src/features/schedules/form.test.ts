import type { MaintenanceSchedule } from '@ikrive/shared';
import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { defaultsFrom, type ScheduleFormInput, scheduleFormSchema, toCreateBody, toUpdateBody } from './form';

const input = (overrides: Partial<ScheduleFormInput> = {}): ScheduleFormInput => ({
  title: 'Cambio de aceite',
  category: 'oil_change',
  intervalMonths: '12',
  intervalDistance: '15.000',
  warnDays: '30',
  warnDistance: '1.000',
  lastDoneDate: '',
  lastDoneOdometer: '',
  ...overrides,
});

const schedule: MaintenanceSchedule = {
  id: 's1',
  vehicleId: 'v1',
  title: 'Neumáticos',
  category: 'tires',
  intervalMonths: null,
  intervalDistance: 40_000,
  warnDays: 15,
  warnDistance: 2000,
  lastDoneDate: '2025-03-10',
  lastDoneOdometer: 120_000,
  nextDueDate: '2027-01-01',
  nextDueDateEstimated: true,
  nextDueOdometer: 160_000,
  status: 'ok',
  createdAt: '2025-03-10T10:00:00.000Z',
  updatedAt: '2025-03-10T10:00:00.000Z',
};

const schema = scheduleFormSchema('km');

describe('schedule form', () => {
  it('parses intervals typed with thousands separators', () => {
    expect(schema.parse(input({ intervalDistance: '15.000', warnDistance: '1,500' }))).toEqual({
      title: 'Cambio de aceite',
      category: 'oil_change',
      intervalMonths: 12,
      intervalDistance: 15_000,
      warnDays: 30,
      warnDistance: 1500,
      lastDoneDate: undefined,
      lastDoneOdometer: null,
    });

    const result = schema.safeParse(input({ intervalMonths: 'doce', warnDays: '', title: ' ' }));
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.')).sort()).toEqual([
      'intervalMonths',
      'title',
      'warnDays',
    ]);
  });

  it('requires an interval in months or distance', () => {
    const result = scheduleFormSchema('mi').safeParse(input({ intervalMonths: '', intervalDistance: ' ' }));

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ['intervalMonths'], message: 'Indica un intervalo en meses o en mi' }),
    ]);
    expect(i18n.t('schedules.errors.intervalRequired', { unit: 'km' })).toBe(
      'Indica un intervalo en meses o en km',
    );
    expect(schema.safeParse(input({ intervalMonths: '' })).success).toBe(true);
    expect(schema.safeParse(input({ intervalDistance: '' })).success).toBe(true);
  });

  it('omits blank last done fields when creating', () => {
    expect(toCreateBody(schema.parse(input({ intervalDistance: '' })))).toEqual({
      title: 'Cambio de aceite',
      category: 'oil_change',
      intervalMonths: 12,
      intervalDistance: null,
      warnDays: 30,
      warnDistance: 1000,
    });
    expect(
      toCreateBody(schema.parse(input({ lastDoneDate: '2025-03-10', lastDoneOdometer: '120.000' }))),
    ).toMatchObject({ lastDoneDate: '2025-03-10', lastDoneOdometer: 120_000 });
  });

  it('sends blank intervals and last done odometer as null when updating', () => {
    const values = schema.parse(
      input({
        intervalMonths: '',
        intervalDistance: '40.000',
        lastDoneDate: '2025-03-10',
        lastDoneOdometer: '',
      }),
    );

    expect(toUpdateBody(values)).toEqual({
      title: 'Cambio de aceite',
      category: 'oil_change',
      intervalMonths: null,
      intervalDistance: 40_000,
      warnDays: 30,
      warnDistance: 1000,
      lastDoneDate: '2025-03-10',
      lastDoneOdometer: null,
    });
  });

  it('prefills the form from a schedule', () => {
    expect(defaultsFrom(schedule)).toEqual({
      title: 'Neumáticos',
      category: 'tires',
      intervalMonths: '',
      intervalDistance: '40000',
      warnDays: '15',
      warnDistance: '2000',
      lastDoneDate: '2025-03-10',
      lastDoneOdometer: '120000',
    });
    expect(defaultsFrom()).toEqual({
      title: '',
      category: 'oil_change',
      intervalMonths: '',
      intervalDistance: '',
      warnDays: '30',
      warnDistance: '1000',
      lastDoneDate: '',
      lastDoneOdometer: '',
    });
    expect(toUpdateBody(schema.parse(defaultsFrom(schedule)))).toMatchObject({
      intervalMonths: null,
      intervalDistance: 40_000,
      lastDoneOdometer: 120_000,
    });
  });
});
