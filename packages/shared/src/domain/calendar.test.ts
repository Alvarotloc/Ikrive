import { describe, expect, it } from 'vitest';
import {
  type CalendarEvent,
  googleCalendarUrl,
  outlookCalendarUrl,
  type ScheduleEventInput,
  scheduleCalendarEvent,
  toICalendar,
} from './calendar';

const input = (
  schedule: Partial<ScheduleEventInput['schedule']> = {},
  overrides: Partial<Omit<ScheduleEventInput, 'schedule'>> = {},
): ScheduleEventInput => ({
  schedule: {
    id: 's1',
    title: 'Cambio de aceite',
    nextDueDate: '2026-10-15',
    nextDueDateEstimated: false,
    nextDueOdometer: null,
    ...schedule,
  },
  vehicle: { id: 'v1', name: 'Clio' },
  baseUrl: 'https://ikrive.example.com',
  locale: 'es',
  distanceUnit: 'km',
  ...overrides,
});

const eventOf = (value: ScheduleEventInput): CalendarEvent => {
  const event = scheduleCalendarEvent(value);
  if (!event) throw new Error('expected an event');
  return event;
};

/** Splits a link into its base and decoded query parameters (`URL` has no types in this package). */
const parseLink = (link: string) => {
  const [base = '', search = ''] = link.split('?');
  const params = Object.fromEntries(
    search.split('&').map((pair) => {
      const [key = '', value = ''] = pair.split('=');
      return [key, decodeURIComponent(value)];
    }),
  );
  return { base, params };
};

/** UTF-8 octets of a string, counted per code point. */
const octets = (value: string) =>
  [...value].reduce((total, char) => {
    const code = char.codePointAt(0) ?? 0;
    return total + (code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4);
  }, 0);

describe('scheduleCalendarEvent', () => {
  it('builds an all-day event on the next due date', () => {
    expect(eventOf(input()).date).toBe('2026-10-15');
    expect(eventOf(input({ nextDueDate: '2027-01-02', nextDueDateEstimated: true })).date).toBe('2027-01-02');
  });

  it('titles the event with the schedule and the vehicle', () => {
    expect(eventOf(input()).title).toBe('Cambio de aceite · Clio');
  });

  it('describes the due odometer in the locale and unit', () => {
    expect(eventOf(input({ nextDueOdometer: 15_000 })).description.split('\n')[0]).toBe(
      'Vence a los 15.000 km',
    );
    expect(
      eventOf(input({ nextDueOdometer: 15_000 }, { locale: 'en', distanceUnit: 'mi' })).description.split(
        '\n',
      )[0],
    ).toBe('Due at 15,000 mi');
    expect(eventOf(input()).description).not.toMatch(/Vence|km/);
  });

  it('marks estimated dates in the description', () => {
    expect(eventOf(input({ nextDueDateEstimated: true })).description).toContain(
      'Fecha estimada a partir de los kilómetros recorridos',
    );
    expect(eventOf(input()).description).not.toContain('Fecha estimada');
  });

  it('links the vehicle page', () => {
    const event = eventOf(input({}, { baseUrl: 'https://ikrive.example.com/' }));
    expect(event.url).toBe('https://ikrive.example.com/vehicles/v1');
    expect(event.description.split('\n').at(-1)).toBe(
      'Ficha del vehículo: https://ikrive.example.com/vehicles/v1',
    );
    expect(eventOf(input({}, { baseUrl: 'http://localhost:3000' })).url).toBe(
      'http://localhost:3000/vehicles/v1',
    );
  });

  it('omits the vehicle page without a base URL (local mode)', () => {
    const event = eventOf(input({ nextDueOdometer: 15_000, nextDueDateEstimated: true }, { baseUrl: null }));
    expect(event).not.toHaveProperty('url');
    expect(event.description).toBe(
      'Vence a los 15.000 km\nFecha estimada a partir de los kilómetros recorridos',
    );
    expect(event.description).not.toMatch(/Ficha del vehículo|\/vehicles\//);
    expect(eventOf(input({}, { baseUrl: null })).description).toBe('');
  });

  it('returns null without a next due date', () => {
    expect(scheduleCalendarEvent(input({ nextDueDate: null, nextDueOdometer: 15_000 }))).toBeNull();
  });

  it('derives the uid from the schedule id', () => {
    expect(eventOf(input()).uid).toBe('schedule-s1@ikrive');
    expect(eventOf(input({ title: 'Otro', nextDueDate: '2030-01-01' })).uid).toBe('schedule-s1@ikrive');
    expect(eventOf(input({ id: 's2' })).uid).toBe('schedule-s2@ikrive');
  });
});

describe('calendar links', () => {
  const event = eventOf(input({ nextDueDate: '2026-12-31', nextDueOdometer: 15_000 }));

  it('builds the Google Calendar link', () => {
    const { base, params } = parseLink(googleCalendarUrl(event));
    expect(base).toBe('https://calendar.google.com/calendar/render');
    expect(params).toEqual({
      action: 'TEMPLATE',
      text: 'Cambio de aceite · Clio',
      details: event.description,
      dates: '20261231/20270101',
    });
    expect(parseLink(googleCalendarUrl({ ...event, date: '2026-02-28' })).params.dates).toBe(
      '20260228/20260301',
    );
  });

  it('builds the Outlook link', () => {
    const { base, params } = parseLink(outlookCalendarUrl(event));
    expect(base).toBe('https://outlook.live.com/calendar/0/action/compose');
    expect(params).toEqual({
      subject: 'Cambio de aceite · Clio',
      body: event.description,
      startdt: '2026-12-31',
      enddt: '2027-01-01',
      allday: 'true',
    });
    expect(parseLink(outlookCalendarUrl({ ...event, date: '2026-04-30' })).params.enddt).toBe('2026-05-01');
  });
});

describe('toICalendar', () => {
  const now = new Date('2026-10-26T09:05:03.123Z');
  const event: CalendarEvent = {
    uid: 'schedule-s1@ikrive',
    date: '2026-12-31',
    title: 'Aceite · Clio',
    description: 'Vence a los 15.000 km',
    url: 'https://ikrive.example.com/vehicles/v1',
  };
  /** Content lines after unfolding. */
  const unfold = (text: string) => text.replace(/\r\n /g, '').split('\r\n');

  it('serializes RFC 5545 iCalendar', () => {
    const text = toICalendar([event], { now, name: 'Ikrive' });
    expect(text.endsWith('\r\n')).toBe(true);
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    expect(unfold(text)).toEqual([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Ikrive//Ikrive//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Ikrive',
      'BEGIN:VEVENT',
      'UID:schedule-s1@ikrive',
      'DTSTAMP:20261026T090503Z',
      'DTSTART;VALUE=DATE:20261231',
      'DTEND;VALUE=DATE:20270101',
      'SUMMARY:Aceite · Clio',
      'DESCRIPTION:Vence a los 15.000 km',
      'URL:https://ikrive.example.com/vehicles/v1',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ]);
  });

  it('omits URL for an event without a vehicle page', () => {
    const { url: _url, ...withoutUrl } = event;
    const lines = unfold(toICalendar([withoutUrl], { now }));
    expect(lines.filter((line) => line.startsWith('URL'))).toEqual([]);
    expect(lines).toContain('DESCRIPTION:Vence a los 15.000 km');
    expect(lines.at(-3)).toBe('END:VEVENT');
  });

  it('escapes text values', () => {
    const text = toICalendar([{ ...event, title: 'a\\b;c,d', description: 'línea 1\nlínea 2' }], { now });
    const lines = unfold(text);
    expect(lines).toContain('SUMMARY:a\\\\b\\;c\\,d');
    expect(lines).toContain('DESCRIPTION:línea 1\\nlínea 2');
  });

  it('escapes a lone carriage return', () => {
    const text = toICalendar([{ ...event, title: 'Aceite\rClio', description: 'a\rb' }], { now });
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    const lines = unfold(text);
    expect(lines).toContain('SUMMARY:Aceite\\nClio');
    expect(lines).toContain('DESCRIPTION:a\\nb');
  });

  it('drops control characters other than tab', () => {
    const text = toICalendar(
      [{ ...event, title: 'Ace\vite\fClio\u0000\u007f', description: 'a\tb\u001bc\u0085d\ne' }],
      { now },
    );
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[^\P{Cc}\t]/u);
    const lines = unfold(text);
    expect(lines).toContain('SUMMARY:AceiteClio');
    expect(lines).toContain('DESCRIPTION:a\tbcd\\ne');
  });

  it('escapes mixed line breaks in the title, the vehicle name and the description', () => {
    const scheduleEvent = eventOf(
      input({ title: 'Cambio\r\nde\naceite\r' }, { vehicle: { id: 'v1', name: 'Renault\rClio\n\r2' } }),
    );
    const text = toICalendar([{ ...scheduleEvent, description: 'uno\r\ndos\rtres\ncuatro\n\rcinco' }], {
      now,
    });
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    const lines = unfold(text);
    expect(lines).toContain('SUMMARY:Cambio\\nde\\naceite\\n · Renault\\nClio\\n\\n2');
    expect(lines).toContain('DESCRIPTION:uno\\ndos\\ntres\\ncuatro\\n\\ncinco');
  });

  it('folds lines at 75 octets', () => {
    const title = 'Revisión anual del vehículo con cambio de neumáticos, frenos 🚗 y ñandú '.repeat(4);
    const text = toICalendar([{ ...event, title }], { now });
    const physical = text.split('\r\n');
    for (const line of physical) expect(octets(line)).toBeLessThanOrEqual(75);
    // Folding never splits a character: no replacement chars and the value round-trips.
    expect(text).not.toContain('�');
    expect(unfold(text)).toContain(`SUMMARY:${title.replaceAll(',', '\\,')}`);
    expect(physical.filter((line) => line.startsWith(' ')).length).toBeGreaterThan(1);
  });

  it('serializes an empty calendar', () => {
    expect(toICalendar([], { now })).toBe(
      'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Ikrive//Ikrive//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nEND:VCALENDAR\r\n',
    );
  });
});
