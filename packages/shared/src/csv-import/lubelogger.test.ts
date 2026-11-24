import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCsvImport } from './parse';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const target = { distance: 'km', quantity: 'l' } as const;
const parsed = (text: string) => {
  const result = parseCsvImport(text, { target });
  if (result.status !== 'parsed') throw new Error(result.status);
  expect(result.format).toBe('lubelogger');
  expect(result.errors).toEqual([]);
  return result;
};

describe('lubelogger', () => {
  it('normalizes the LubeLogger fixtures', () => {
    const fuel = parsed(fixture('lubelogger-fuel.csv'));
    expect(fuel.rows.map((row) => [row.sourceRow, row.kind, row.data])).toEqual([
      [
        2,
        'fuel',
        {
          date: '2025-01-03',
          odometer: 30000,
          quantity: 38.2,
          totalPrice: 57.3,
          pricePerUnit: 1.5,
          fullTank: true,
          missedPrevious: false,
        },
      ],
      [
        3,
        'fuel',
        {
          date: '2025-01-20',
          odometer: 30480,
          quantity: 20,
          totalPrice: 30,
          pricePerUnit: 1.5,
          fullTank: false,
          missedPrevious: true,
        },
      ],
    ]);
    expect(fuel.droppedFuelFields).toEqual({ notes: true, station: false });

    const service = parsed(fixture('lubelogger-service.csv'));
    expect(service.rows.map((row) => row.data)).toEqual([
      {
        date: '2025-02-01',
        odometer: 30500,
        category: 'oil_change',
        title: 'Oil change',
        description: 'Aceite nuevo',
        cost: 75,
        includeInReport: true,
      },
      {
        date: '2025-02-15',
        odometer: 30700,
        category: 'other',
        title: 'Limpieza general',
        description: null,
        cost: 20,
        includeInReport: true,
      },
    ]);

    const odometer = parsed(fixture('lubelogger-odometer.csv'));
    expect(odometer.rows.map((row) => [row.kind, row.data])).toEqual([
      ['odometer', { date: '2025-03-01', value: 31000 }],
      ['odometer', { date: '2025-04-01', value: 31500 }],
    ]);

    const tax = parsed(fixture('lubelogger-tax.csv'));
    expect(tax.rows).toEqual([]);
    expect(tax.skipped).toEqual([{ row: 2, reason: 'not_maintenance', label: 'Impuesto de circulacion' }]);
  });

  it('composes day, month and year as an ISO date', () => {
    const result = parsed('day,month,year,odometer\n4,3,2025,1000\n');
    expect(result.rows[0]?.data).toEqual({ date: '2025-03-04', value: 1000 });
  });
});
