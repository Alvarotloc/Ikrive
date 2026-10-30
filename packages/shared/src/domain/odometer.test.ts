import { describe, expect, it } from 'vitest';
import {
  averageDistancePerMonth,
  averageDistancePerYear,
  findOdometerConflict,
  latestOdometerReading,
} from './odometer';

const readings = [
  { date: '2022-01-10', value: 10_000 },
  { date: '2022-06-10', value: 15_000 },
  { date: '2023-01-10', value: 20_000 },
];

describe('findOdometerConflict', () => {
  it('accepts readings that keep the sequence monotonic', () => {
    expect(findOdometerConflict(readings, { date: '2023-02-01', value: 20_500 })).toBeNull();
    expect(findOdometerConflict(readings, { date: '2022-03-01', value: 12_000 })).toBeNull();
    expect(findOdometerConflict(readings, { date: '2022-06-10', value: 15_000 })).toBeNull();
  });

  it('rejects a value lower than an earlier reading', () => {
    expect(findOdometerConflict(readings, { date: '2023-02-01', value: 19_000 })).toEqual(readings[2]);
  });

  it('rejects a value higher than a later reading', () => {
    expect(findOdometerConflict(readings, { date: '2022-03-01', value: 16_000 })).toEqual(readings[1]);
  });

  it('allows any order within the same day', () => {
    expect(findOdometerConflict(readings, { date: '2022-06-10', value: 14_900 })).toBeNull();
  });
});

describe('latestOdometerReading', () => {
  it('returns null without readings', () => {
    expect(latestOdometerReading([])).toBeNull();
  });

  it('picks the latest date and the highest value on ties', () => {
    const sameDay = [...readings, { date: '2023-01-10', value: 20_100 }];
    expect(latestOdometerReading(sameDay)).toEqual({ date: '2023-01-10', value: 20_100 });
  });
});

describe('averageDistancePerYear', () => {
  it('needs at least a month of history', () => {
    expect(averageDistancePerYear(readings.slice(0, 1))).toBeNull();
    expect(
      averageDistancePerYear([
        { date: '2022-01-01', value: 0 },
        { date: '2022-01-15', value: 1_000 },
      ]),
    ).toBeNull();
  });

  it('extrapolates the distance to a year', () => {
    expect(averageDistancePerYear(readings)).toBe(10_000);
  });
});

describe('averageDistancePerMonth', () => {
  it('averages the distance per month', () => {
    expect(averageDistancePerMonth(readings)).toBe(833);
    expect(averageDistancePerMonth(readings.slice(0, 1))).toBeNull();
    expect(
      averageDistancePerMonth([
        { date: '2022-01-01', value: 0 },
        { date: '2022-01-15', value: 1_000 },
      ]),
    ).toBeNull();
  });
});
