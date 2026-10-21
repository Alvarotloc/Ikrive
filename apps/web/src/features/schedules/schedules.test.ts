import type { MaintenanceSchedule } from '@ikrive/shared';
import { describe, expect, it } from 'vitest';
import { sortSchedules } from './schedules';

const schedule = (overrides: Partial<MaintenanceSchedule>): MaintenanceSchedule => ({
  id: 's1',
  vehicleId: 'v1',
  title: 'Aceite',
  category: 'oil_change',
  intervalMonths: 12,
  intervalDistance: 15_000,
  warnDays: 30,
  warnDistance: 1000,
  lastDoneDate: '2025-01-01',
  lastDoneOdometer: 100_000,
  nextDueDate: '2026-01-01',
  nextDueDateEstimated: false,
  nextDueOdometer: 115_000,
  status: 'ok',
  createdAt: '2025-01-01T10:00:00.000Z',
  updatedAt: '2025-01-01T10:00:00.000Z',
  ...overrides,
});

const titles = (schedules: MaintenanceSchedule[]) => sortSchedules(schedules).map(({ title }) => title);

describe('sortSchedules', () => {
  it('sorts overdue before due soon before ok', () => {
    const schedules = [
      schedule({ title: 'Al día', status: 'ok', nextDueDate: '2025-02-01' }),
      schedule({ title: 'Próximo', status: 'due_soon', nextDueDate: '2027-01-01' }),
      // Overdue by distance only, without a date: still first.
      schedule({ title: 'Vencido', status: 'overdue', nextDueDate: null }),
    ];

    expect(titles(schedules)).toEqual(['Vencido', 'Próximo', 'Al día']);
  });

  it('sorts by next due date then odometer with nulls last', () => {
    const schedules = [
      schedule({ title: 'Sin nada', nextDueDate: null, nextDueOdometer: null }),
      schedule({ title: 'Solo km', nextDueDate: null, nextDueOdometer: 90_000 }),
      schedule({ title: 'Marzo sin km', nextDueDate: '2026-03-01', nextDueOdometer: null }),
      schedule({ title: 'Marzo 120.000', nextDueDate: '2026-03-01', nextDueOdometer: 120_000 }),
      schedule({ title: 'Marzo 110.000', nextDueDate: '2026-03-01', nextDueOdometer: 110_000 }),
      schedule({ title: 'Enero', nextDueDate: '2026-01-15', nextDueOdometer: 200_000 }),
    ];

    expect(titles(schedules)).toEqual([
      'Enero',
      'Marzo 110.000',
      'Marzo 120.000',
      'Marzo sin km',
      'Solo km',
      'Sin nada',
    ]);
  });

  it('breaks ties by title', () => {
    const schedules = [
      schedule({ title: 'Neumáticos' }),
      schedule({ title: 'Filtros' }),
      schedule({ title: 'ITV' }),
    ];

    expect(titles(schedules)).toEqual(['Filtros', 'ITV', 'Neumáticos']);
    // The input is left untouched.
    expect(schedules.map(({ title }) => title)).toEqual(['Neumáticos', 'Filtros', 'ITV']);
  });
});
