import { describe, expect, it } from 'vitest';
import { csvRowKey } from './keys';
import { parseCsvImport } from './parse';

const fuel = {
  date: '2025-01-10',
  odometer: 10000,
  quantity: 40.5,
  totalPrice: 60.75,
  pricePerUnit: 1.5,
  fullTank: true,
  missedPrevious: false,
};
const maintenance = {
  date: '2025-03-01',
  odometer: null,
  category: 'other' as const,
  title: '  Cambio de Aceite ',
  cost: 89.9,
  includeInReport: true,
};

describe('csvRowKey', () => {
  it('builds the same key across formats', () => {
    expect(csvRowKey({ kind: 'odometer', data: { date: '2025-01-10', value: 100 } })).toBe(
      'odometer|2025-01-10|100',
    );
    expect(csvRowKey({ kind: 'fuel', data: fuel })).toBe('fuel|2025-01-10|10000|40.500|60.75');
    expect(csvRowKey({ kind: 'maintenance', data: maintenance })).toBe(
      'maintenance|2025-03-01||cambio de aceite|89.90',
    );
    expect(csvRowKey({ kind: 'maintenance', data: { ...maintenance, odometer: 5, cost: null } })).toBe(
      'maintenance|2025-03-01|5|cambio de aceite|',
    );
  });

  it('builds the expense key without category', () => {
    const insurance = {
      date: '2025-04-01',
      category: 'insurance' as const,
      title: '  Seguro Anual ',
      cost: 420.5,
    };
    expect(csvRowKey({ kind: 'expense', data: insurance })).toBe('expense|2025-04-01|seguro anual|420.50');
    // A category corrected after importing still matches the row of the file.
    expect(csvRowKey({ kind: 'expense', data: { ...insurance, category: 'other', description: 'x' } })).toBe(
      'expense|2025-04-01|seguro anual|420.50',
    );
    expect(csvRowKey({ kind: 'expense', data: { date: '2025-04-01', category: 'parking', cost: 3 } })).toBe(
      'expense|2025-04-01||3.00',
    );
    expect(
      csvRowKey({ kind: 'expense', data: { date: '2025-04-01', category: 'parking', title: null, cost: 3 } }),
    ).toBe('expense|2025-04-01||3.00');
  });

  it('builds the same key for a zero-cost maintenance in every format', () => {
    const drivvoHeader = Array.from({ length: 21 }, (_, index) => `C${index}`).join(',');
    const files = {
      fuelio: [
        '"## Log"',
        '"Data","Odo (km)","Fuel (litres)","Full","Price (optional)"',
        '"## CostCategories"',
        '"CostTypeID","Name","priority"',
        '"1","Revision","0"',
        '"## Costs"',
        '"CostTitle","Date","Odo","CostTypeID","Notes","Cost","isTemplate","isIncome","UniqueId"',
        '"Revision","2025-01-01","100","1","","0","0","0","7"',
      ].join('\n'),
      drivvo: [
        '##Refuelling',
        drivvoHeader,
        '##Service',
        'Odometer (km),Date,Total cost,Type of service,Local service,Notes',
        '100,2025-01-01,0,Revision,,',
      ].join('\n'),
      lubelogger: 'Date,Odometer,Description,Cost\n2025-01-01,100,Revision,0\n',
    };
    for (const [format, text] of Object.entries(files)) {
      const result = parseCsvImport(text, { target: { distance: 'km', quantity: 'l' } });
      if (result.status !== 'parsed') throw new Error(`${format}: ${result.status}`);
      expect(result.format).toBe(format);
      expect(result.errors).toEqual([]);
      expect(
        result.rows.map((row) => row.key),
        format,
      ).toEqual(['maintenance|2025-01-01|100|revision|']);
    }
  });

  it('ignores price per unit and category in the key', () => {
    expect(csvRowKey({ kind: 'fuel', data: { ...fuel, pricePerUnit: 1.499 } })).toBe(
      csvRowKey({ kind: 'fuel', data: fuel }),
    );
    expect(csvRowKey({ kind: 'maintenance', data: { ...maintenance, category: 'repair' } })).toBe(
      csvRowKey({ kind: 'maintenance', data: maintenance }),
    );
  });
});
