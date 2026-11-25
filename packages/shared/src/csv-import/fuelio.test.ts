import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCsvImport } from './parse';

const text = readFileSync(new URL('./fixtures/fuelio.csv', import.meta.url), 'utf8');

describe('fuelio', () => {
  it('normalizes the Fuelio fixture', () => {
    const result = parseCsvImport(text, { target: { distance: 'km', quantity: 'l' } });
    if (result.status !== 'parsed') throw new Error(result.status);
    expect(result.format).toBe('fuelio');
    expect(result.dateFormat).toBe('ymd');
    expect(result.decimalSeparator).toBe('.');
    expect(result.sourceUnits).toEqual({ distance: 'km', quantity: null });
    expect(result.errors).toEqual([]);
    expect(result.rows.some((row) => row.kind === 'odometer')).toBe(false);
    expect(
      result.rows.map(({ sourceRow, sourceId, kind, data, warnings }) => ({
        sourceRow,
        sourceId,
        kind,
        data,
        warnings,
      })),
    ).toEqual([
      {
        sourceRow: 6,
        sourceId: '1001',
        kind: 'fuel',
        warnings: [],
        data: {
          date: '2025-01-10',
          odometer: 10000,
          quantity: 40.5,
          totalPrice: 60.75,
          pricePerUnit: 1.5,
          fullTank: true,
          missedPrevious: false,
        },
      },
      {
        sourceRow: 7,
        sourceId: '1002',
        kind: 'fuel',
        warnings: ['odometer_rounded'],
        data: {
          date: '2025-02-14',
          odometer: 10651,
          quantity: 35.25,
          totalPrice: 52.17,
          pricePerUnit: 1.48,
          fullTank: false,
          missedPrevious: true,
        },
      },
      {
        sourceRow: 15,
        sourceId: '2001',
        kind: 'maintenance',
        warnings: [],
        data: {
          date: '2025-03-01',
          odometer: 11000,
          category: 'oil_change',
          title: 'Aceite y filtro',
          description: 'Aceite sintetico',
          cost: 89.9,
          includeInReport: true,
        },
      },
      {
        sourceRow: 16,
        sourceId: '2002',
        kind: 'maintenance',
        warnings: [],
        data: {
          date: '2025-04-02',
          odometer: null,
          category: 'inspection',
          title: 'ITV anual',
          description: null,
          cost: 45.5,
          includeInReport: true,
        },
      },
      {
        sourceRow: 17,
        sourceId: '2003',
        kind: 'expense',
        warnings: [],
        data: {
          date: '2025-04-03',
          category: 'insurance',
          title: 'Seguro anual',
          description: null,
          cost: 300,
        },
      },
    ]);
    // Only templates and incomes are left out.
    expect(result.skipped).toEqual([
      { row: 18, reason: 'template', label: 'Cambio de aceite' },
      { row: 19, reason: 'income', label: 'Cambio de aceite' },
    ]);
    expect(result.droppedFuelFields).toEqual({ notes: true, station: true });
  });

  it('imports non-maintenance costs as expenses', () => {
    const result = parseCsvImport(text, { target: { distance: 'km', quantity: 'l' } });
    if (result.status !== 'parsed') throw new Error(result.status);
    const insurance = result.rows.find((row) => row.kind === 'expense');
    expect(insurance).toEqual({
      sourceRow: 17,
      sourceId: '2003',
      kind: 'expense',
      key: 'expense|2025-04-03|seguro anual|300.00',
      warnings: [],
      data: {
        date: '2025-04-03',
        category: 'insurance',
        title: 'Seguro anual',
        description: null,
        cost: 300,
      },
    });

    // Without a title the expense takes the name of its category; an unknown category is `other`.
    const custom = [
      '"## Log"',
      '"Data","Odo (km)","Fuel (litres)","Full","Price (optional)"',
      '"## CostCategories"',
      '"CostTypeID","Name","priority"',
      '"7","Peajes","0"',
      '"8","Lavado","0"',
      '"## Costs"',
      '"CostTitle","Date","Odo","CostTypeID","Notes","Cost","isTemplate","isIncome","UniqueId"',
      '"","2025-05-01","0","7","AP-7","12.40","0","0","31"',
      '"Lavado a mano","2025-05-02","12000","8","","15","0","0","32"',
    ].join('\n');
    const parsed = parseCsvImport(custom, { target: { distance: 'km', quantity: 'l' } });
    if (parsed.status !== 'parsed') throw new Error(parsed.status);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows.map(({ kind, sourceId, data }) => ({ kind, sourceId, data }))).toEqual([
      {
        kind: 'expense',
        sourceId: '31',
        data: { date: '2025-05-01', category: 'tolls', title: 'Peajes', description: 'AP-7', cost: 12.4 },
      },
      {
        kind: 'expense',
        sourceId: '32',
        data: { date: '2025-05-02', category: 'other', title: 'Lavado a mano', description: null, cost: 15 },
      },
    ]);
  });

  it('reports an expense without amount as an error', () => {
    const file = [
      '"## Log"',
      '"Data","Odo (km)","Fuel (litres)","Full","Price (optional)"',
      '"## CostCategories"',
      '"CostTypeID","Name","priority"',
      '"2","Seguro","0"',
      '"## Costs"',
      '"CostTitle","Date","Odo","CostTypeID","Notes","Cost","isTemplate","isIncome","UniqueId"',
      '"Seguro","2025-04-03","0","2","","0","0","0","41"',
      '"Seguro","2025-04-04","0","2","","","0","0","42"',
      '"Seguro","2025-04-05","0","2","","50","0","0","43"',
    ].join('\n');
    const result = parseCsvImport(file, { target: { distance: 'km', quantity: 'l' } });
    if (result.status !== 'parsed') throw new Error(result.status);
    expect(result.errors).toEqual([
      { row: 8, code: 'missing_field', field: 'cost' },
      { row: 9, code: 'missing_field', field: 'cost' },
    ]);
    expect(result.rows.map((row) => row.sourceId)).toEqual(['43']);
    expect(result.skipped).toEqual([]);
  });
});
