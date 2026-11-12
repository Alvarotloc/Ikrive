import { describe, expect, it } from 'vitest';
import { hourIn, isoWeekOf, todayIn, weekdayOf } from './dates';

describe('todayIn', () => {
  it('returns today in the time zone', () => {
    const now = new Date('2026-10-25T23:30:00.000Z');
    expect(todayIn('UTC', now)).toBe('2026-10-25');
    expect(todayIn('Europe/Madrid', now)).toBe('2026-10-26');
    expect(todayIn('America/New_York', now)).toBe('2026-10-25');
  });

  it('falls back to UTC with an invalid time zone', () => {
    expect(todayIn('Not/AZone', new Date('2026-10-25T23:30:00.000Z'))).toBe('2026-10-25');
  });
});

describe('hourIn', () => {
  it('returns the local hour in the time zone', () => {
    const now = new Date('2026-07-01T08:15:00.000Z');
    expect(hourIn('UTC', now)).toBe(8);
    expect(hourIn('Europe/Madrid', now)).toBe(10);
    expect(hourIn('UTC', new Date('2026-07-01T00:15:00.000Z'))).toBe(0);
  });

  it('falls back to UTC with an invalid time zone', () => {
    expect(hourIn('Not/AZone', new Date('2026-07-01T08:15:00.000Z'))).toBe(8);
  });
});

describe('weekdayOf', () => {
  it('returns the weekday of a date (0 = Sunday)', () => {
    expect(weekdayOf('2026-10-25')).toBe(0);
    expect(weekdayOf('2026-10-22')).toBe(4);
    expect(weekdayOf('2026-10-31')).toBe(6);
  });
});

describe('isoWeekOf', () => {
  it('returns the ISO week of a date', () => {
    expect(isoWeekOf('2026-10-19')).toBe('2026-W43');
    expect(isoWeekOf('2026-10-25')).toBe('2026-W43');
    expect(isoWeekOf('2026-10-26')).toBe('2026-W44');
    // Weeks across a year boundary belong to the year of their Thursday.
    expect(isoWeekOf('2026-01-01')).toBe('2026-W01');
    expect(isoWeekOf('2027-01-03')).toBe('2026-W53');
    expect(isoWeekOf('2024-12-30')).toBe('2025-W01');
  });
});
