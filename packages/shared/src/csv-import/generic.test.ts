import { describe, expect, it } from 'vitest';
import { CSV_KIND_COLUMNS, CSV_REQUIRED_COLUMNS } from './generic';
import { parseCsvImport } from './parse';

const target = { distance: 'km', quantity: 'l' } as const;
const base = { dateFormat: 'dmy', decimalSeparator: ',' } as const;

describe('generic', () => {
  it('converts a generic CSV with an explicit mapping', () => {
    const odometer = parseCsvImport('fecha;km\n03/04/2025;1.000\n', {
      target,
      mapping: { ...base, kind: 'odometer', columns: { date: 0, value: 1 } },
    });
    if (odometer.status !== 'parsed') throw new Error(odometer.status);
    expect(odometer.format).toBe('generic');
    expect(odometer.rows[0]).toMatchObject({ kind: 'odometer', data: { date: '2025-04-03', value: 1000 } });

    const fuel = parseCsvImport('fecha;km;litros;total;lleno\n03/04/2025;1000;40,5;60,75;0\n', {
      target,
      mapping: {
        ...base,
        kind: 'fuel',
        columns: { date: 0, odometer: 1, quantity: 2, totalPrice: 3, fullTank: 4 },
      },
    });
    if (fuel.status !== 'parsed') throw new Error(fuel.status);
    expect(fuel.rows[0]).toMatchObject({
      kind: 'fuel',
      data: { date: '2025-04-03', quantity: 40.5, totalPrice: 60.75, pricePerUnit: 1.5, fullTank: false },
    });

    const maintenance = parseCsvImport('fecha;que;tipo;coste\n03/04/2025;Pastillas;brakes;120,50\n', {
      target,
      mapping: { ...base, kind: 'maintenance', columns: { date: 0, title: 1, category: 2, cost: 3 } },
    });
    if (maintenance.status !== 'parsed') throw new Error(maintenance.status);
    expect(maintenance.rows[0]).toMatchObject({
      kind: 'maintenance',
      data: { title: 'Pastillas', category: 'brakes', cost: 120.5, odometer: null },
    });
  });

  it('reports missing or out-of-range columns', () => {
    expect(
      parseCsvImport('a,b\n1,2\n', {
        target,
        mapping: { ...base, kind: 'fuel', columns: { date: 0, odometer: 5 } },
      }),
    ).toEqual({
      status: 'needs_options',
      format: 'generic',
      headers: ['a', 'b'],
      missing: ['columns.odometer', 'columns.quantity', 'columns.totalPrice'],
    });
    expect(CSV_REQUIRED_COLUMNS.fuel).toContainEqual(['totalPrice', 'pricePerUnit']);
  });

  it('maps expense columns', () => {
    const text = [
      'fecha;tipo;concepto;notas;importe;km',
      '03/04/2025;tolls;Peaje AP-7;Viaje;12,40;1000',
      '04/04/2025;Seguro del coche;;;300;',
      '05/04/2025;Lavado;Lavado;;15;',
      '06/04/2025;;;;3,20;',
    ].join('\n');
    const result = parseCsvImport(text, {
      target,
      mapping: {
        ...base,
        kind: 'expense',
        columns: { date: 0, category: 1, title: 2, description: 3, cost: 4 },
      },
    });
    if (result.status !== 'parsed') throw new Error(result.status);
    expect(result.errors).toEqual([]);
    // The exact category, else the one of `matchExpenseCategory`, else `other`.
    expect(result.rows.map(({ kind, data }) => ({ kind, data }))).toEqual([
      {
        kind: 'expense',
        data: {
          date: '2025-04-03',
          category: 'tolls',
          title: 'Peaje AP-7',
          description: 'Viaje',
          cost: 12.4,
        },
      },
      {
        kind: 'expense',
        data: { date: '2025-04-04', category: 'insurance', title: null, description: null, cost: 300 },
      },
      {
        kind: 'expense',
        data: { date: '2025-04-05', category: 'other', title: 'Lavado', description: null, cost: 15 },
      },
      {
        kind: 'expense',
        data: { date: '2025-04-06', category: 'other', title: null, description: null, cost: 3.2 },
      },
    ]);
    // No odometer column for expenses.
    expect(CSV_KIND_COLUMNS.expense).toEqual(['date', 'category', 'title', 'description', 'cost']);
  });

  it('requires date and cost for expenses', () => {
    expect(CSV_REQUIRED_COLUMNS.expense).toEqual([['date'], ['cost']]);
    expect(
      parseCsvImport('a,b\n1,2\n', { target, mapping: { ...base, kind: 'expense', columns: { title: 1 } } }),
    ).toEqual({
      status: 'needs_options',
      format: 'generic',
      headers: ['a', 'b'],
      missing: ['columns.date', 'columns.cost'],
    });
    // An empty or zero amount is an error on `cost`.
    const result = parseCsvImport('fecha,importe\n03/04/2025,\n04/04/2025,0\n', {
      target,
      mapping: { ...base, kind: 'expense', columns: { date: 0, cost: 1 } },
    });
    if (result.status !== 'parsed') throw new Error(result.status);
    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([
      { row: 2, code: 'missing_field', field: 'cost' },
      { row: 3, code: 'out_of_range', field: 'cost' },
    ]);
  });
});
