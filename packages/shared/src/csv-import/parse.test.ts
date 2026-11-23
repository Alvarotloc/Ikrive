import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createFuelLogSchema } from '../schemas/fuel-logs';
import { createMaintenanceRecordSchema } from '../schemas/maintenance';
import { createOdometerReadingSchema } from '../schemas/vehicles';
import { parseCsvImport } from './parse';
import type { CsvImportOptions, CsvImportResult } from './types';

const target = { distance: 'km', quantity: 'l' } as const;
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const parsed = (text: string, options: Partial<CsvImportOptions> = {}) => {
  const result = parseCsvImport(text, { target, ...options });
  if (result.status !== 'parsed') throw new Error(JSON.stringify(result));
  return result;
};
type Parsed = Extract<CsvImportResult, { status: 'parsed' }>;
const values = (result: Parsed) => result.rows.map((row) => row.data);

const FUELIO_HEADER =
  '"Data","Odo (km)","Fuel (litres)","Full","Price (optional)","l/100km (optional)","latitude (optional)","longitude (optional)","City (optional)","Notes (optional)","VolumePrice","StationID (optional)"';
const fuelioRow = (
  quantity: string,
  price: string,
  extra: Partial<Record<'city' | 'notes' | 'station', string>> = {},
) =>
  `"2025-01-10","10000","${quantity}","1","${price}","6.1","40.1234","-3.5678","${extra.city ?? ''}","${extra.notes ?? ''}","","${extra.station ?? '0'}"`;
const COSTS_HEADER =
  '"CostTitle","Date","Odo","CostTypeID","Notes","Cost","isTemplate","isIncome","UniqueId"';
const drivvoHeader = Array.from({ length: 21 }, (_, index) => `C${index}`).join(';');

describe('parseCsvImport', () => {
  it('returns unknown without throwing', () => {
    expect(parseCsvImport('', { target })).toEqual({ status: 'unknown', headers: [] });
    expect(parseCsvImport('foo,bar\n1,2\n', { target })).toEqual({
      status: 'unknown',
      headers: ['foo', 'bar'],
    });
  });

  it('gives the same result with BOM, CRLF and semicolons', () => {
    const plain = parsed('Date,Odometer\n2025-03-01,1000\n');
    const variant = parsed('﻿Date;Odometer\r\n2025-03-01;1000\r\n');
    expect(variant.rows).toEqual(plain.rows);
  });

  it('reads every fixture alike with BOM and CRLF', () => {
    for (const name of ['fuelio.csv', 'drivvo.csv', 'lubelogger-fuel.csv', 'lubelogger-service.csv']) {
      const text = fixture(name);
      expect(parsed(`\uFEFF${text.replaceAll('\n', '\r\n')}`), name).toEqual(parsed(text));
    }
  });

  it('asks for the date format when it cannot be resolved', () => {
    expect(parseCsvImport('Date,Odometer\n03/04/2025,1000\n', { target })).toEqual({
      status: 'needs_options',
      format: 'lubelogger',
      headers: ['Date', 'Odometer'],
      missing: ['dateFormat'],
    });
    expect(values(parsed('Date,Odometer\n03/04/2025,1000\n', { dateFormat: 'dmy' }))).toEqual([
      { date: '2025-04-03', value: 1000 },
    ]);
  });

  it('asks for the date format when the file declares an inherited object key', () => {
    const text = [
      '"## Vehicle"',
      '"Name","ImportCSVDateFormat"',
      '"Coche","constructor"',
      '"## Log"',
      FUELIO_HEADER,
      fuelioRow('40.5', '60.75').replace('2025-01-10', '03/04/2025'),
    ].join('\n');
    expect(parseCsvImport(text, { target })).toEqual({
      status: 'needs_options',
      format: 'fuelio',
      headers: expect.any(Array),
      missing: ['dateFormat'],
    });
  });

  it('reports a long inner run of spaces as an invalid number', () => {
    const result = parsed(`Date,Odometer\n2025-01-01,1${' '.repeat(100_000)}x\n2025-01-02,200\n`);
    expect(result.errors).toEqual([{ row: 2, code: 'invalid_number', field: 'value' }]);
    expect(values(result)).toEqual([{ date: '2025-01-02', value: 200 }]);
  });

  it('returns unit_mismatch without rows', () => {
    expect(parseCsvImport(fixture('fuelio.csv'), { target: { distance: 'mi', quantity: 'l' } })).toEqual({
      status: 'unit_mismatch',
      format: 'fuelio',
      source: { distance: 'km', quantity: null },
      target: { distance: 'mi', quantity: 'l' },
    });
    expect(parseCsvImport('Date,Odometer,Gallons,Cost\n2025-01-01,100,10,20\n', { target })).toMatchObject({
      status: 'unit_mismatch',
      source: { distance: null, quantity: 'gal' },
    });
  });

  it('lets sourceUnits override the detected units', () => {
    const result = parsed(fixture('fuelio.csv'), {
      target: { distance: 'mi', quantity: 'l' },
      sourceUnits: { distance: 'mi' },
    });
    expect(result.sourceUnits).toEqual({ distance: 'mi', quantity: null });
    expect(result.rows[0]?.data).toMatchObject({ odometer: 10000 });
  });

  it('returns schema-valid data for every kind', () => {
    const rows = ['fuelio.csv', 'drivvo.csv', 'lubelogger-odometer.csv'].flatMap(
      (name) => parsed(fixture(name)).rows,
    );
    expect(new Set(rows.map((row) => row.kind))).toEqual(new Set(['fuel', 'maintenance', 'odometer']));
    for (const row of rows) {
      const schema =
        row.kind === 'fuel'
          ? createFuelLogSchema
          : row.kind === 'maintenance'
            ? createMaintenanceRecordSchema
            : createOdometerReadingSchema;
      expect(schema.safeParse(row.data).success, row.key).toBe(true);
    }
  });

  it('rounds a decimal odometer with a warning', () => {
    const result = parsed('Date,Odometer\n2025-01-01,1000.6\n');
    expect(result.rows[0]).toMatchObject({ data: { value: 1001 }, warnings: ['odometer_rounded'] });
  });

  it('keeps processing after an invalid row', () => {
    const result = parsed(
      'Date,Odometer,FuelConsumed,Cost\n2025-01-01,100,10,20\n2025-13-01,200,10,20\n2025-01-03,abc,10,20\n2025-01-04,400,0,20\n2025-01-05,500,,20\n2025-01-06,600,10,30\n',
    );
    expect(result.errors).toEqual([
      { row: 3, code: 'invalid_date', field: 'date' },
      { row: 4, code: 'invalid_number', field: 'odometer' },
      { row: 5, code: 'out_of_range', field: 'quantity' },
      { row: 6, code: 'missing_field', field: 'quantity' },
    ]);
    expect(result.rows.map((row) => row.sourceRow)).toEqual([2, 7]);
  });

  it('reports a malformed row and keeps the next ones', () => {
    const result = parsed(`Date,Odometer\n2025-01-01,"${'9'.repeat(4100)}\n2025-01-02,200\n`);
    expect(result.errors).toEqual([{ row: 2, code: 'malformed_row', field: null }]);
    expect(values(result)).toEqual([{ date: '2025-01-02', value: 200 }]);
  });

  it('ignores Fuelio columns that are not imported when detecting decimals', () => {
    const result = parsed(`"## Log"\n${FUELIO_HEADER}\n${fuelioRow('40,5', '60,75')}\n`);
    expect(result.decimalSeparator).toBe(',');
    expect(result.rows[0]?.data).toMatchObject({ quantity: 40.5, totalPrice: 60.75, pricePerUnit: 1.5 });
  });

  it('ignores the Drivvo fuel efficiency when detecting decimals', () => {
    const row = `20000;2025-01-05 09:00:00;Gasoline;1,5;60,75;40,5;Yes;;;;;;;;;;;25.158 km/L;;;`;
    const result = parsed(`##Refuelling\n${drivvoHeader}\n${row}\n`);
    expect(result.status).toBe('parsed');
    expect(result.decimalSeparator).toBe(',');
    expect(result.rows[0]?.data).toMatchObject({ quantity: 40.5, totalPrice: 60.75, pricePerUnit: 1.5 });
  });

  it('ignores skipped rows when detecting decimals', () => {
    const text = [
      '"## Log"',
      FUELIO_HEADER,
      fuelioRow('40,5', '60,75'),
      '"## CostCategories"',
      '"CostTypeID","Name","priority"',
      '"2","Seguro","0"',
      '"## Costs"',
      COSTS_HEADER,
      '"Seguro","01/02/2025","10","2","","300.50","0","0","9"',
    ].join('\n');
    const result = parsed(text);
    expect(result.decimalSeparator).toBe(',');
    expect(result.dateFormat).toBe('ymd');
    expect(result.skipped).toEqual([{ row: 9, reason: 'not_maintenance', label: 'Seguro' }]);
  });

  it('still asks for the separator when imported columns mix them', () => {
    expect(
      parseCsvImport(`"## Log"\n${FUELIO_HEADER}\n${fuelioRow('40,5', '60.75')}\n`, { target }),
    ).toMatchObject({
      status: 'needs_options',
      format: 'fuelio',
      missing: ['decimalSeparator'],
    });
  });

  describe('thousands in amounts and quantities', () => {
    const service = (...costs: string[]) =>
      `Date,Odometer,Description,Cost\n${costs
        .map((cost, index) => `2025-01-0${index + 1},${1000 + index},Oil change,"${cost}"`)
        .join('\n')}\n`;
    const drivvoRefuel = (price: string, total: string, volume: string) =>
      `##Refuelling\n${drivvoHeader}\n20000;2025-01-05 09:00:00;Gasoline;${price};${total};${volume};Yes;;;;;;;;;;;;;;\n`;
    const asksForSeparator = { status: 'needs_options', missing: ['decimalSeparator'] };

    it('asks for the separator on a lone grouped amount', () => {
      expect(parseCsvImport(service('$1,200'), { target })).toMatchObject(asksForSeparator);
      expect(parseCsvImport(service('$1,200', '300'), { target })).toMatchObject(asksForSeparator);
      expect(parsed(service('$1,200'), { decimalSeparator: '.' }).rows[0]?.data).toMatchObject({
        cost: 1200,
      });
      expect(parsed(service('$1,200'), { decimalSeparator: ',' }).rows[0]?.data).toMatchObject({ cost: 1.2 });
    });

    it('asks on several thousands groups', () => {
      expect(parseCsvImport(service('1,200,000'), { target })).toMatchObject(asksForSeparator);
      expect(parseCsvImport(service('1,200,000', '58,89'), { target })).toMatchObject(asksForSeparator);
      expect(parseCsvImport(service('1.200.000', '58.89'), { target })).toMatchObject(asksForSeparator);
    });

    it('accepts three decimals when another cell proves the separator', () => {
      const result = parsed(drivvoRefuel('5.412', '58.89', '10.881'));
      expect(result.format).toBe('drivvo');
      expect(result.decimalSeparator).toBe('.');
      expect(result.rows[0]?.data).toMatchObject({
        pricePerUnit: 5.412,
        totalPrice: 58.89,
        quantity: 10.881,
      });
      const comma = parsed(drivvoRefuel('6,199', '61,833', '9,5'));
      expect(comma.decimalSeparator).toBe(',');
      expect(comma.rows[0]?.data).toMatchObject({ pricePerUnit: 6.199, totalPrice: 61.833, quantity: 9.5 });
    });

    it('asks when no cell proves the three decimals', () => {
      expect(parseCsvImport(drivvoRefuel('6.199', '61.833', '10.881'), { target })).toMatchObject(
        asksForSeparator,
      );
      expect(parseCsvImport(service('1.200', '1.2.3'), { target })).toMatchObject(asksForSeparator);
    });

    it('keeps asking for a grouped odometer even with a proven separator', () => {
      const text = 'Date,Odometer,FuelConsumed,Cost\n2025-01-01,12.345,10.5,20.25\n';
      expect(parseCsvImport(text, { target })).toMatchObject(asksForSeparator);
    });

    it('keeps the Drivvo fixture parsed without asking', () => {
      expect(parseCsvImport(fixture('drivvo.csv'), { target })).toMatchObject({
        status: 'parsed',
        format: 'drivvo',
        decimalSeparator: '.',
      });
    });
  });

  it('uses ymd for ISO dates despite a different declared format', () => {
    const result = parsed(fixture('fuelio.csv'));
    expect(result.dateFormat).toBe('ymd');
    expect(result.rows[0]?.data.date).toBe('2025-01-10');
  });

  it('flags dropped fuel notes and station per format', () => {
    expect(parsed(fixture('fuelio.csv')).droppedFuelFields).toEqual({ notes: true, station: true });
    expect(parsed(fixture('drivvo.csv')).droppedFuelFields).toEqual({ notes: true, station: true });
    expect(parsed(fixture('lubelogger-fuel.csv')).droppedFuelFields).toEqual({ notes: true, station: false });
    expect(
      parsed(`"## Log"\n${FUELIO_HEADER}\n${fuelioRow('40.5', '60.75', { station: '7' })}\n`)
        .droppedFuelFields,
    ).toEqual({ notes: false, station: true });
  });

  it('ignores blank values and StationID 0', () => {
    expect(
      parsed(`"## Log"\n${FUELIO_HEADER}\n${fuelioRow('40.5', '60.75', { city: '  ', notes: ' ' })}\n`)
        .droppedFuelFields,
    ).toEqual({ notes: false, station: false });
  });

  it('ignores notes on maintenance and on rejected fuel rows', () => {
    expect(parsed(fixture('lubelogger-service.csv')).droppedFuelFields).toEqual({
      notes: false,
      station: false,
    });
    const rejected = parsed('Date,Odometer,FuelConsumed,Cost,Notes\n2025-01-01,100,0,20,Nota\n');
    expect(rejected.rows).toEqual([]);
    expect(rejected.droppedFuelFields).toEqual({ notes: false, station: false });
  });

  it('reports no dropped fields for a generic mapping', () => {
    const result = parsed('fecha,km,l,total,notas\n2025-01-01,100,10,20,Nota\n', {
      mapping: {
        kind: 'fuel',
        columns: { date: 0, odometer: 1, quantity: 2, totalPrice: 3 },
        dateFormat: 'ymd',
        decimalSeparator: '.',
      },
    });
    expect(result.rows).toHaveLength(1);
    expect(result.droppedFuelFields).toEqual({ notes: false, station: false });
  });
});
