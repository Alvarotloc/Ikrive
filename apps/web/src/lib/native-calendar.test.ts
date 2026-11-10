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
  it('builds all-day options from local midnight to the next local midnight', () => {
    // UTC− zone: the UTC midnight would be the previous local day.
    process.env.TZ = 'America/New_York';
    expect(calendarPromptOptions(event)).toEqual({
      title: event.title,
      description: event.description,
      isAllDay: true,
      startDate: Date.parse('2026-03-10T04:00:00.000Z'),
      endDate: Date.parse('2026-03-11T04:00:00.000Z'),
    });

    process.env.TZ = 'Europe/Madrid';
    const madrid = calendarPromptOptions(event);
    expect(madrid.startDate).toBe(Date.parse('2026-03-09T23:00:00.000Z'));
    expect(madrid.endDate).toBe(Date.parse('2026-03-10T23:00:00.000Z'));

    // A DST change in between: still the next local midnight, not 24 h later.
    const dst = calendarPromptOptions({ ...event, date: '2026-03-29' });
    expect(dst.startDate).toBe(Date.parse('2026-03-28T23:00:00.000Z'));
    expect(dst.endDate).toBe(Date.parse('2026-03-29T22:00:00.000Z'));

    // Month and year boundaries.
    const newYear = calendarPromptOptions({ ...event, date: '2026-12-31' });
    expect(new Date(newYear.endDate).getFullYear()).toBe(2027);
    expect(new Date(newYear.endDate).getMonth()).toBe(0);
    expect(new Date(newYear.endDate).getDate()).toBe(1);
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
      endDate: Date.parse('2026-03-10T23:00:00.000Z'),
    });
  });

  it('rejects when the plugin fails', async () => {
    plugin.createEventWithPrompt.mockRejectedValue(new Error('No Activity found to handle Intent'));

    await expect(createDeviceEvent(event)).rejects.toThrow('No Activity found to handle Intent');
  });
});
