import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detectCsvFormat } from './detect';
import { lubeLoggerRecordType } from './lubelogger';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const refuelHeader = Array.from({ length: 21 }, (_, index) => `Kolumna ${index}`).join(',');
const refuelRow = `100,2025-01-01 10:00:00,Benzyna,1.5,60,40,Tak${','.repeat(14)}`;

describe('detectCsvFormat', () => {
  it('detects Fuelio marker variants', () => {
    expect(detectCsvFormat(fixture('fuelio.csv')).format).toBe('fuelio');
    expect(detectCsvFormat('"## Log"\nData,Odo (km),Fuel (litres)\n').format).toBe('fuelio');
    expect(detectCsvFormat('## Log,,,\nData,Odo(mi),Fuel,Full\n').format).toBe('fuelio');
  });

  it('detects Drivvo with translated sections', () => {
    expect(detectCsvFormat(fixture('drivvo.csv')).format).toBe('drivvo');
    const detected = detectCsvFormat(`#Tankowanie\n${refuelHeader}\n${refuelRow}\n`);
    expect(detected.format).toBe('drivvo');
    expect(detected.headers).toHaveLength(21);
  });

  it('detects each LubeLogger record type', () => {
    for (const [name, type] of [
      ['lubelogger-fuel.csv', 'fuel'],
      ['lubelogger-service.csv', 'service'],
      ['lubelogger-odometer.csv', 'odometer'],
      ['lubelogger-tax.csv', 'tax'],
    ] as const) {
      const detected = detectCsvFormat(fixture(name));
      expect(detected.format, name).toBe('lubelogger');
      expect(lubeLoggerRecordType(detected.headers), name).toBe(type);
    }
    expect(lubeLoggerRecordType(['day', 'month', 'year', 'odo'])).toBe('odometer');
  });

  it('returns unknown for empty or foreign text', () => {
    expect(detectCsvFormat('')).toEqual({ format: 'unknown', headers: [] });
    expect(detectCsvFormat('name,color\nuno,rojo\n')).toEqual({
      format: 'unknown',
      headers: ['name', 'color'],
    });
    expect(detectCsvFormat('## Otro\nfoo,bar\n')).toEqual({ format: 'unknown', headers: ['foo', 'bar'] });
  });
});
