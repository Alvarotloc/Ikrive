import { describe, expect, it } from 'vitest';
import { addDays, addMonths, averageDailyDistance, computeScheduleDue, type ScheduleRule } from './schedules';

const today = '2026-06-30';

/** 2400 km in the 80 days before today (30 km/day), plus a reading outside the window. */
const readings = [
  { date: '2026-01-01', value: 5_000 },
  { date: '2026-04-11', value: 10_000 },
  { date: '2026-06-30', value: 12_400 },
];

const rule = (overrides: Partial<ScheduleRule>): ScheduleRule => ({
  intervalMonths: null,
  intervalDistance: null,
  warnDays: 30,
  warnDistance: 1000,
  lastDoneDate: '2026-01-15',
  lastDoneOdometer: 10_000,
  ...overrides,
});

describe('date helpers', () => {
  it('addMonths clamps to the end of the month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-03-31', 1)).toBe('2026-04-30');
    expect(addMonths('2025-11-15', 3)).toBe('2026-02-15');
    expect(addMonths('2026-05-31', 12)).toBe('2027-05-31');
  });

  it('adds and subtracts days', () => {
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-06-30', -90)).toBe('2026-04-01');
  });
});

describe('averageDailyDistance', () => {
  it('averages the distance of the last 90 days', () => {
    expect(averageDailyDistance(readings, today)).toBe(30);
    // The window starts 90 days before today, both ends included.
    expect(
      averageDailyDistance(
        [
          { date: '2026-04-01', value: 1_000 },
          { date: '2026-06-30', value: 10_000 },
        ],
        today,
      ),
    ).toBe(100);
  });

  it('returns a null average without enough data', () => {
    expect(averageDailyDistance([], today)).toBeNull();
    expect(averageDailyDistance([{ date: '2026-06-01', value: 10_000 }], today)).toBeNull();
    // Less than 30 days between the first and the last reading.
    expect(
      averageDailyDistance(
        [
          { date: '2026-06-10', value: 10_000 },
          { date: '2026-06-30', value: 11_000 },
        ],
        today,
      ),
    ).toBeNull();
    // No distance driven.
    expect(
      averageDailyDistance(
        [
          { date: '2026-04-10', value: 10_000 },
          { date: '2026-06-30', value: 10_000 },
        ],
        today,
      ),
    ).toBeNull();
    // Readings outside the window: older than 90 days or after today.
    expect(
      averageDailyDistance(
        [
          { date: '2026-01-01', value: 5_000 },
          { date: '2026-03-31', value: 8_000 },
          { date: '2026-06-20', value: 10_000 },
          { date: '2026-08-01', value: 12_000 },
        ],
        today,
      ),
    ).toBeNull();
  });
});

describe('computeScheduleDue', () => {
  it('computes the due date from months', () => {
    expect(computeScheduleDue(rule({ intervalMonths: 12, lastDoneDate: '2026-01-31' }), [], today)).toEqual({
      nextDueDate: '2027-01-31',
      nextDueDateEstimated: false,
      nextDueOdometer: null,
      status: 'ok',
    });
    expect(
      computeScheduleDue(rule({ intervalMonths: 1, lastDoneDate: '2026-12-31' }), [], today),
    ).toMatchObject({ nextDueDate: '2027-01-31' });
  });

  it('computes the due odometer from distance', () => {
    expect(computeScheduleDue(rule({ intervalDistance: 5_000 }), [], today)).toEqual({
      nextDueDate: null,
      nextDueDateEstimated: false,
      nextDueOdometer: 15_000,
      status: 'ok',
    });
    // Without a last done odometer there is nothing to add the interval to.
    expect(
      computeScheduleDue(rule({ intervalDistance: 5_000, lastDoneOdometer: null }), readings, today),
    ).toEqual({ nextDueDate: null, nextDueDateEstimated: false, nextDueOdometer: null, status: 'ok' });
  });

  it('estimates the due date from the daily average', () => {
    // 2600 km left at 30 km/day = 86.7 → 87 days after the latest reading.
    expect(computeScheduleDue(rule({ intervalDistance: 5_000 }), readings, today)).toEqual({
      nextDueDate: '2026-09-25',
      nextDueDateEstimated: true,
      nextDueOdometer: 15_000,
      status: 'ok',
    });
    // Without enough data the estimate is null.
    expect(
      computeScheduleDue(rule({ intervalDistance: 5_000 }), [{ date: '2026-06-30', value: 12_400 }], today),
    ).toMatchObject({ nextDueDate: null, nextDueDateEstimated: false });
  });

  it('uses whichever comes first', () => {
    expect(
      computeScheduleDue(rule({ intervalMonths: 12, intervalDistance: 5_000 }), readings, today),
    ).toMatchObject({ nextDueDate: '2026-09-25', nextDueDateEstimated: true, nextDueOdometer: 15_000 });
    expect(
      computeScheduleDue(rule({ intervalMonths: 7, intervalDistance: 5_000 }), readings, today),
    ).toMatchObject({ nextDueDate: '2026-08-15', nextDueDateEstimated: false, nextDueOdometer: 15_000 });
  });

  it('marks due_soon within the warning thresholds', () => {
    // Due by months on 2026-07-15; warned 30 days before.
    const byMonths = rule({ intervalMonths: 6 });
    expect(computeScheduleDue(byMonths, [], '2026-06-14').status).toBe('ok');
    expect(computeScheduleDue(byMonths, [], '2026-06-15').status).toBe('due_soon');
    expect(computeScheduleDue(byMonths, [], '2026-07-14').status).toBe('due_soon');
    expect(computeScheduleDue({ ...byMonths, warnDays: 0 }, [], '2026-07-14').status).toBe('ok');

    // Due at 15 000; warned 1000 before.
    const byDistance = rule({ intervalDistance: 5_000 });
    expect(computeScheduleDue(byDistance, [{ date: today, value: 13_999 }], today).status).toBe('ok');
    expect(computeScheduleDue(byDistance, [{ date: today, value: 14_000 }], today).status).toBe('due_soon');
    expect(computeScheduleDue(byDistance, [{ date: today, value: 14_999 }], today).status).toBe('due_soon');
  });

  it('marks overdue by date and by distance', () => {
    expect(computeScheduleDue(rule({ intervalMonths: 6 }), [], '2026-07-15').status).toBe('overdue');
    expect(computeScheduleDue(rule({ intervalMonths: 6 }), [], '2027-01-01').status).toBe('overdue');
    expect(
      computeScheduleDue(rule({ intervalDistance: 5_000 }), [{ date: today, value: 15_000 }], today).status,
    ).toBe('overdue');
    // Whichever comes first: distance reached long before the date.
    expect(
      computeScheduleDue(
        rule({ intervalMonths: 24, intervalDistance: 5_000 }),
        [{ date: today, value: 16_000 }],
        today,
      ).status,
    ).toBe('overdue');
  });

  it('ignores the estimated date for the status', () => {
    // 100 km/day: the estimate (2026-05-21) is already past, but only 13 000 of 15 000 are driven.
    const due = computeScheduleDue(
      rule({ intervalDistance: 5_000 }),
      [
        { date: '2026-04-01', value: 10_000 },
        { date: '2026-05-01', value: 13_000 },
      ],
      today,
    );
    expect(due).toEqual({
      nextDueDate: '2026-05-21',
      nextDueDateEstimated: true,
      nextDueOdometer: 15_000,
      status: 'ok',
    });
  });
});
