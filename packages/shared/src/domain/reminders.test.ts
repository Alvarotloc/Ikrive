import { describe, expect, it } from 'vitest';
import {
  isOdometerNudgeTime,
  isReminderTime,
  ODOMETER_NUDGE_DAYS,
  odometerNudgeDedupeKey,
  odometerNudgeNotification,
  reminderDedupeKey,
  scheduleReminderNotification,
} from './reminders';

const today = '2026-06-30';
const vehicle = { id: 'v1', name: 'Daily', make: 'Seat', model: 'Ibiza' };
const schedule = {
  id: 's1',
  title: 'Oil change',
  intervalMonths: 12,
  intervalDistance: null,
  warnDays: 30,
  warnDistance: 1000,
  lastDoneOdometer: 10_000,
};

describe('scheduleReminderNotification', () => {
  it('builds a due soon reminder', () => {
    // Due on 2026-07-15, inside the 30 warning days.
    expect(
      scheduleReminderNotification({ ...schedule, lastDoneDate: '2025-07-15' }, vehicle, [], today),
    ).toEqual({
      vehicleId: 'v1',
      type: 'schedule_due_soon',
      title: 'Oil change',
      body: 'Daily',
      link: '/vehicles/v1',
      dedupeKey: 'schedule:s1:due_soon:2025-07-15:10000',
    });
  });

  it('builds an overdue reminder with the make and model as body', () => {
    expect(
      scheduleReminderNotification(
        { ...schedule, lastDoneDate: '2025-01-01', lastDoneOdometer: null },
        { ...vehicle, name: null },
        [],
        today,
      ),
    ).toEqual({
      vehicleId: 'v1',
      type: 'schedule_overdue',
      title: 'Oil change',
      body: 'Seat Ibiza',
      link: '/vehicles/v1',
      dedupeKey: 'schedule:s1:overdue:2025-01-01:',
    });
  });

  it('returns no reminder for an ok schedule', () => {
    expect(
      scheduleReminderNotification({ ...schedule, lastDoneDate: '2026-06-01' }, vehicle, [], today),
    ).toBeNull();
  });
});

describe('reminderDedupeKey', () => {
  it('reminder dedupe key changes with status and last done', () => {
    const rule = { lastDoneDate: '2026-01-01', lastDoneOdometer: 10_000 };
    const key = reminderDedupeKey('s1', 'due_soon', rule);
    expect(key).toBe('schedule:s1:due_soon:2026-01-01:10000');
    expect(reminderDedupeKey('s1', 'overdue', rule)).not.toBe(key);
    expect(reminderDedupeKey('s1', 'due_soon', { ...rule, lastDoneDate: '2026-02-01' })).not.toBe(key);
    expect(reminderDedupeKey('s1', 'due_soon', { ...rule, lastDoneOdometer: null })).toBe(
      'schedule:s1:due_soon:2026-01-01:',
    );
  });
});

describe('isReminderTime', () => {
  it('is reminder time from the reminder hour', () => {
    const owner = { timezone: 'Europe/Madrid', reminderHour: 9 };
    // 06:59 UTC = 08:59 in Madrid (summer time).
    expect(isReminderTime(owner, new Date('2026-07-01T06:59:00.000Z'))).toBe(false);
    expect(isReminderTime(owner, new Date('2026-07-01T07:00:00.000Z'))).toBe(true);
    expect(isReminderTime(owner, new Date('2026-07-01T21:59:00.000Z'))).toBe(true);
  });
});

describe('isOdometerNudgeTime', () => {
  // 2026-10-25 is a Sunday (0).
  const owner = { timezone: 'UTC', reminderHour: 9, weekday: 0 };

  it('nudge time only on the weekday and from the hour', () => {
    expect(isOdometerNudgeTime(owner, new Date('2026-10-25T09:00:00.000Z'))).toBe(true);
    expect(isOdometerNudgeTime(owner, new Date('2026-10-25T08:59:00.000Z'))).toBe(false);
    expect(isOdometerNudgeTime(owner, new Date('2026-10-26T09:00:00.000Z'))).toBe(false);
    // Sunday 00:30 in Madrid is still Saturday in UTC.
    expect(
      isOdometerNudgeTime(
        { ...owner, timezone: 'Europe/Madrid', reminderHour: 0 },
        new Date('2026-10-24T22:30:00.000Z'),
      ),
    ).toBe(true);
  });

  it('no nudge time without a weekday', () => {
    expect(isOdometerNudgeTime({ ...owner, weekday: null }, new Date('2026-10-25T12:00:00.000Z'))).toBe(
      false,
    );
  });
});

describe('odometerNudgeNotification', () => {
  const base = { make: 'Seat', model: 'Ibiza', createdAt: new Date('2026-01-01T12:00:00.000Z') };
  const nudgeToday = '2026-10-25';

  it('nudges vehicles 7 days stale or more', () => {
    expect(ODOMETER_NUDGE_DAYS).toBe(7);
    expect(
      odometerNudgeNotification({
        userId: 'u1',
        today: nudgeToday,
        timezone: 'UTC',
        vehicles: [
          { ...base, name: 'Daily', lastReadingDate: '2026-10-18' },
          { ...base, name: null, make: 'Tesla', model: 'Model 3', lastReadingDate: '2026-09-01' },
          { ...base, name: 'Fresh', lastReadingDate: '2026-10-19' },
        ],
      }),
    ).toEqual({
      vehicleId: null,
      type: 'odometer_nudge',
      title: 'Daily, Tesla Model 3',
      body: null,
      link: '/odometer',
      dedupeKey: 'odometer_nudge:u1:2026-W43',
    });
  });

  it('counts vehicles without readings from their local creation date', () => {
    // Created 2026-10-17 23:30 UTC = 2026-10-18 in Madrid: 7 days old on the 25th there.
    const createdAt = new Date('2026-10-17T23:30:00.000Z');
    const vehicles = [{ ...base, name: 'New', lastReadingDate: null, createdAt }];
    expect(
      odometerNudgeNotification({ userId: 'u1', today: nudgeToday, timezone: 'Europe/Madrid', vehicles })
        ?.title,
    ).toBe('New');
    // On the 24th it is only 6 days old in Madrid, but 7 in New York, where it was created on the 17th.
    expect(
      odometerNudgeNotification({ userId: 'u1', today: '2026-10-24', timezone: 'Europe/Madrid', vehicles }),
    ).toBeNull();
    expect(
      odometerNudgeNotification({ userId: 'u1', today: '2026-10-24', timezone: 'America/New_York', vehicles })
        ?.title,
    ).toBe('New');
  });

  it('returns no nudge without pending vehicles', () => {
    expect(
      odometerNudgeNotification({
        userId: 'u1',
        today: nudgeToday,
        timezone: 'UTC',
        vehicles: [{ ...base, name: 'Fresh', lastReadingDate: '2026-10-24' }],
      }),
    ).toBeNull();
    expect(
      odometerNudgeNotification({ userId: 'u1', today: nudgeToday, timezone: 'UTC', vehicles: [] }),
    ).toBeNull();
  });
});

describe('odometerNudgeDedupeKey', () => {
  it('nudge dedupe key is per ISO week', () => {
    expect(odometerNudgeDedupeKey('u1', '2026-10-19')).toBe('odometer_nudge:u1:2026-W43');
    expect(odometerNudgeDedupeKey('u1', '2026-10-25')).toBe('odometer_nudge:u1:2026-W43');
    expect(odometerNudgeDedupeKey('u1', '2026-10-26')).toBe('odometer_nudge:u1:2026-W44');
  });
});
