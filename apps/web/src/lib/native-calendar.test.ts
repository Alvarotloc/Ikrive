import type { CalendarEvent } from '@ikrive/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calendarPromptOptions, createDeviceEvent } from './native-calendar';

const plugin = vi.hoisted(() => ({ createEventWithPrompt: vi.fn() }));
vi.mock('@ebarooni/capacitor-calendar', () => ({ CapacitorCalendar: plugin }));

const event: CalendarEvent = {
  uid: 'schedule-s1@ikrive',
  date: '2026-03-10',
  title: 'Cambio de aceite · Renault Clio',
  description: 'Vence a los 135.000 km.\n\nhttps://ikrive.example.com/vehicles/v1',
  url: 'https://ikrive.example.com/vehicles/v1',
};

const originalTz = process.env.TZ;

afterEach(() => {
  // `process.env.TZ = undefined` would set the string 'undefined'.
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
  plugin.createEventWithPrompt.mockReset();
});

describe('native calendar', () => {
  it('builds all-day options that start and end at the local midnight of the event day', () => {
    // UTC− zone: the UTC midnight would be the previous local day.
    process.env.TZ = 'America/New_York';
    expect(calendarPromptOptions(event)).toEqual({
      title: event.title,
      description: event.description,
      isAllDay: true,
      startDate: Date.parse('2026-03-10T04:00:00.000Z'),
      endDate: Date.parse('2026-03-10T04:00:00.000Z'),
    });

    process.env.TZ = 'Europe/Madrid';
    const madrid = calendarPromptOptions(event);
    expect(madrid.startDate).toBe(Date.parse('2026-03-09T23:00:00.000Z'));
    expect(madrid.endDate).toBe(madrid.startDate);

    // DST change days: the local midnight follows the offset of that day (CET before, CEST after).
    const dstSpring = calendarPromptOptions({ ...event, date: '2026-03-29' });
    expect(dstSpring.startDate).toBe(Date.parse('2026-03-28T23:00:00.000Z'));
    expect(dstSpring.endDate).toBe(dstSpring.startDate);
    const afterDst = calendarPromptOptions({ ...event, date: '2026-03-30' });
    expect(afterDst.startDate).toBe(Date.parse('2026-03-29T22:00:00.000Z'));

    // Month and year boundaries: the event stays on its own day, never the next one.
    for (const date of ['2026-12-31', '2026-01-31', '2026-02-28']) {
      const options = calendarPromptOptions({ ...event, date });
      const [year, month, day] = date.split('-').map(Number);
      for (const time of [options.startDate, options.endDate]) {
        const local = new Date(time);
        expect([local.getFullYear(), local.getMonth() + 1, local.getDate()]).toEqual([year, month, day]);
        expect([local.getHours(), local.getMinutes()]).toEqual([0, 0]);
      }
    }
  });

  it('opens the system new-event screen with the title and description', async () => {
    process.env.TZ = 'Europe/Madrid';
    plugin.createEventWithPrompt.mockResolvedValue({ id: null });

    await expect(createDeviceEvent(event)).resolves.toBeUndefined();

    expect(plugin.createEventWithPrompt).toHaveBeenCalledExactlyOnceWith({
      title: 'Cambio de aceite · Renault Clio',
      description: 'Vence a los 135.000 km.\n\nhttps://ikrive.example.com/vehicles/v1',
      isAllDay: true,
      startDate: Date.parse('2026-03-09T23:00:00.000Z'),
      endDate: Date.parse('2026-03-09T23:00:00.000Z'),
    });
  });

  it('rejects when the plugin fails', async () => {
    plugin.createEventWithPrompt.mockRejectedValue(new Error('No Activity found to handle Intent'));

    await expect(createDeviceEvent(event)).rejects.toThrow('No Activity found to handle Intent');
  });
});
