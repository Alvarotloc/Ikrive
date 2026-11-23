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
    ]);
    expect(result.skipped).toEqual([
      { row: 17, reason: 'not_maintenance', label: 'Seguro' },
      { row: 18, reason: 'template', label: 'Cambio de aceite' },
      { row: 19, reason: 'income', label: 'Cambio de aceite' },
    ]);
    expect(result.droppedFuelFields).toEqual({ notes: true, station: true });
  });
});
