import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detectCsvFormat } from './detect';
import { parseCsvImport } from './parse';

const text = readFileSync(new URL('./fixtures/drivvo.csv', import.meta.url), 'utf8');
const target = { distance: 'km', quantity: 'l' } as const;
const header = Array.from({ length: 21 }, (_, index) => `C${index}`).join(',');
const withRow = (row: string) => `##Refuelling\n${header}\n${row}\n`;

describe('drivvo', () => {
  it('normalizes the Drivvo fixture', () => {
    const result = parseCsvImport(text, { target });
    if (result.status !== 'parsed') throw new Error(result.status);
    expect(result.format).toBe('drivvo');
    expect(result.decimalSeparator).toBe('.');
    expect(result.errors).toEqual([]);
    expect(result.rows.map(({ sourceRow, kind, data }) => ({ sourceRow, kind, data }))).toEqual([
      {
        sourceRow: 6,
        kind: 'fuel',
        data: {
          date: '2025-01-05',
          odometer: 20000,
          quantity: 40,
          totalPrice: 60,
          pricePerUnit: 1.5,
          fullTank: true,
          missedPrevious: false,
        },
      },
      {
        sourceRow: 7,
        kind: 'fuel',
        data: {
          date: '2025-02-10',
          odometer: 20500,
          quantity: 40,
          totalPrice: 46,
          pricePerUnit: 1.15,
          fullTank: true,
          missedPrevious: false,
        },
      },
      {
        sourceRow: 13,
        kind: 'maintenance',
        data: {
          date: '2025-03-15',
          odometer: 21000,
          category: 'oil_change',
          title: 'Oil change',
          description: 'Notas del servicio',
          workshop: 'Taller Ejemplo',
          cost: 120.5,
          includeInReport: true,
        },
      },
    ]);
    expect(result.skipped).toEqual([{ row: 10, reason: 'not_maintenance', label: 'Insurance' }]);
    expect(result.droppedFuelFields).toEqual({ notes: true, station: true });
  });

  it('merges several fuels into one refuel', () => {
    const result = parseCsvImport(withRow('100,2025-01-01,Gasoline,2,,10,No,LPG,1,5,5,Yes,CNG,,3,3,No,,,,'), {
      target,
    });
    if (result.status !== 'parsed') throw new Error(result.status);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]?.warnings).toEqual(['merged_fuels']);
    expect(result.rows[0]?.data).toMatchObject({
      quantity: 18,
      totalPrice: 28,
      pricePerUnit: 1.556,
      fullTank: true,
    });
  });

  it('computes a zero fuel total from its price and volume when merging', () => {
    const result = parseCsvImport(
      withRow('100,2025-01-01,Gasoline,1.5,0,40,Yes,LPG,0.8,16,20,Yes,,,,,,,,,'),
      {
        target,
      },
    );
    if (result.status !== 'parsed') throw new Error(result.status);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]?.warnings).toEqual(['merged_fuels']);
    expect(result.rows[0]?.data).toMatchObject({ quantity: 60, totalPrice: 76, pricePerUnit: 1.267 });
  });

  it.each([
    ['an empty price', 'Gasoline,,0,40,Yes'],
    ['a zero price', 'Gasoline,0,0,40,Yes'],
    ['an empty total and a zero price', 'Gasoline,0,,40,Yes'],
  ])('rejects a merged fuel without total or price (%s)', (_label, fuel) => {
    const result = parseCsvImport(
      `${withRow(`100,2025-01-01,${fuel},LPG,0.8,16,20,Yes,,,,,,,,,`)}200,2025-02-01,Gasoline,2,20,10,Yes,,,,,,,,,,,,,,\n`,
      { target },
    );
    if (result.status !== 'parsed') throw new Error(result.status);
    expect(result.errors).toEqual([{ row: 3, code: 'missing_field', field: 'totalPrice' }]);
    expect(result.rows.map((row) => row.sourceRow)).toEqual([4]);
  });

  it.each([
    ['a negative total', 'Gasoline,1.5,-5,40,Yes,LPG,0.8,16,20,Yes', 'totalPrice'],
    ['a negative price', 'Gasoline,-1.5,60,40,Yes,LPG,0.8,16,20,Yes', 'pricePerUnit'],
    ['a negative price with a zero total', 'Gasoline,-1.5,0,40,Yes,LPG,0.8,16,20,Yes', 'pricePerUnit'],
    ['a negative total with a zero price', 'Gasoline,0,-5,40,Yes,LPG,0.8,16,20,Yes', 'totalPrice'],
    ['a negative volume', 'Gasoline,1.5,60,-4,Yes,LPG,0.8,16,20,Yes', 'quantity'],
    ['a negative total in the second fuel', 'Gasoline,1.5,60,40,Yes,LPG,0.8,-16,20,Yes', 'totalPrice'],
  ])('rejects a negative value in a merged fuel (%s)', (_label, fuels, field) => {
    const result = parseCsvImport(
      `${withRow(`100,2025-01-01,${fuels},,,,,,,,,`)}200,2025-02-01,Gasoline,2,20,10,Yes,,,,,,,,,,,,,,\n`,
      { target },
    );
    if (result.status !== 'parsed') throw new Error(result.status);
    expect(result.errors).toEqual([{ row: 3, code: 'out_of_range', field }]);
    expect(result.rows.map((row) => row.sourceRow)).toEqual([4]);
    expect(result.rows[0]?.data).toMatchObject({ odometer: 200, quantity: 10, totalPrice: 20 });
  });

  it.each([
    ['the first fuel', 'Gasoline,1.5,60,0,Yes,LPG,0.8,16,20,Yes'],
    ['the second fuel', 'Gasoline,1.5,60,40,Yes,LPG,0.8,16,0,Yes'],
    ['a fuel without a price', 'Gasoline,0,60,0,Yes,LPG,0.8,16,20,Yes'],
  ])('rejects a merged fuel with an amount but no volume (%s)', (_label, fuels) => {
    const result = parseCsvImport(
      `${withRow(`100,2025-01-01,${fuels},,,,,,,,,`)}200,2025-02-01,Gasoline,2,20,10,Yes,,,,,,,,,,,,,,\n`,
      { target },
    );
    if (result.status !== 'parsed') throw new Error(result.status);
    expect(result.errors).toEqual([{ row: 3, code: 'out_of_range', field: 'quantity' }]);
    expect(result.rows.map((row) => row.sourceRow)).toEqual([4]);
    expect(result.rows[0]?.data).toMatchObject({ odometer: 200, quantity: 10, totalPrice: 20 });
  });

  it.each([
    ['a padded middle slot', 'Gasoline,2,20,10,Yes,"",0,0,0,No,LPG,1,5,5,Yes', 15, 25],
    ['a padded last slot', 'Gasoline,2,20,10,Yes,LPG,1,5,5,Yes,"",0,0,0,No', 15, 25],
    ['a slot with a price but no volume or total', 'Gasoline,1.5,60,40,Yes,LPG,0.8,0,0,No,,,,,', 40, 60],
  ])('keeps ignoring padded empty fuel slots (%s)', (_label, fuels, quantity, totalPrice) => {
    const result = parseCsvImport(withRow(`100,2025-01-01,${fuels},,,,`), { target });
    if (result.status !== 'parsed') throw new Error(result.status);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]?.data).toMatchObject({ quantity, totalPrice });
  });

  it('rejects a refuel row with more than 21 fields', () => {
    const result = parseCsvImport(withRow(`100,2025-01-01,Gasoline,2,20,10,Yes${','.repeat(15)}`), {
      target,
    });
    if (result.status !== 'parsed') throw new Error(result.status);
    expect(result.errors).toEqual([{ row: 3, code: 'malformed_row', field: null }]);
    expect(result.rows).toEqual([]);
  });

  it('rejects a row mixing electricity and fuel', () => {
    const result = parseCsvImport(
      `${withRow('100,2025-01-01,Gasoline,2,20,10,Yes,Electricity,0.3,3,10,Yes,,,,,,,,,')}200,2025-02-01,Gasoline,2,20,10,Yes,,,,,,,,,,,,,,\n`,
      { target },
    );
    if (result.status !== 'parsed') throw new Error(result.status);
    expect(result.errors).toEqual([{ row: 3, code: 'mixed_fuel_units', field: 'quantity' }]);
    expect(result.rows.map((row) => row.sourceRow)).toEqual([4]);
  });

  describe.each(['constructor', '__proto__'])('a section named %s', (name) => {
    const refuelRow = `100,2025-01-01,Gasoline,2,20,10,Yes${','.repeat(14)}`;

    it('is detected as a refuel section by its shape', () => {
      const text = `##${name}\n${header}\n${refuelRow}\n`;
      expect(detectCsvFormat(text).format).toBe('drivvo');
      const result = parseCsvImport(text, { target });
      if (result.status !== 'parsed') throw new Error(result.status);
      expect(result.format).toBe('drivvo');
      expect(result.errors).toEqual([]);
      expect(result.rows.map(({ sourceRow, kind }) => ({ sourceRow, kind }))).toEqual([
        { sourceRow: 3, kind: 'fuel' },
      ]);
      expect(result.rows[0]?.data).toMatchObject({ date: '2025-01-01', odometer: 100, quantity: 10 });
    });

    it('produces the maintenance row of a 6-column service', () => {
      const result = parseCsvImport(
        `${withRow(refuelRow)}##${name}\nC0,C1,C2,C3,C4,C5\n200,2025-02-01,50,Oil change,Taller,Notas\n`,
        { target },
      );
      if (result.status !== 'parsed') throw new Error(result.status);
      expect(result.errors).toEqual([]);
      expect(result.skipped).toEqual([]);
      const row = result.rows.find((candidate) => candidate.kind === 'maintenance');
      expect(row?.sourceRow).toBe(6);
      expect(row?.data).toEqual({
        date: '2025-02-01',
        odometer: 200,
        category: 'oil_change',
        title: 'Oil change',
        description: 'Notas',
        workshop: 'Taller',
        cost: 50,
        includeInReport: true,
      });
    });

    it('skips a 7-column expense as not maintenance', () => {
      const result = parseCsvImport(
        `${withRow(refuelRow)}##${name}\nC0,C1,C2,C3,C4,C5,C6\n200,2025-02-01,300,Insurance,Aseguradora,,Nota\n`,
        { target },
      );
      if (result.status !== 'parsed') throw new Error(result.status);
      expect(result.errors).toEqual([]);
      expect(result.rows.map((row) => row.kind)).toEqual(['fuel']);
      expect(result.skipped).toEqual([{ row: 6, reason: 'not_maintenance', label: 'Insurance' }]);
    });
  });
});
