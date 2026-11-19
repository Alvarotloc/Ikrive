import type { DistanceUnit, Locale } from '../enums';
import type { MaintenanceSchedule } from '../schemas/schedules';
import { addDays } from './schedules';

/** All-day calendar event of a maintenance schedule, independent of where it ends up. */
export interface CalendarEvent {
  uid: string;
  /** `YYYY-MM-DD` of the (all-day) event. */
  date: string;
  title: string;
  description: string;
  /** Vehicle page; absent when there is no web to link to (local mode of the native app). */
  url?: string;
}

export interface ScheduleEventInput {
  schedule: Pick<
    MaintenanceSchedule,
    'id' | 'title' | 'nextDueDate' | 'nextDueDateEstimated' | 'nextDueOdometer'
  >;
  /** `name` already resolved (alias, or make + model). */
  vehicle: { id: string; name: string };
  /**
   * Origin the vehicle page link is built on, or null when there is no web to link to (local mode of the
   * native app): then the event has neither the vehicle page line nor `url`.
   */
  baseUrl: string | null;
  locale: Locale;
  distanceUnit: DistanceUnit;
}

/**
 * Event texts. They live here instead of the web locale files because the API (calendar feed) and
 * the web (per-schedule action) must build exactly the same event, and the API has no i18n.
 */
export const CALENDAR_EVENT_TEXTS: Record<
  Locale,
  { dueAt: (distance: string) => string; estimated: string; vehiclePage: string }
> = {
  es: {
    dueAt: (distance) => `Vence a los ${distance}`,
    estimated: 'Fecha estimada a partir de los kilómetros recorridos',
    vehiclePage: 'Ficha del vehículo',
  },
  en: {
    dueAt: (distance) => `Due at ${distance}`,
    estimated: 'Date estimated from the distance driven',
    vehiclePage: 'Vehicle page',
  },
};

/** Builds the event of a schedule, or null when it has no next due date (nothing to put on a calendar). */
export function scheduleCalendarEvent(input: ScheduleEventInput): CalendarEvent | null {
  const { schedule, vehicle, baseUrl, locale, distanceUnit } = input;
  if (!schedule.nextDueDate) return null;
  const texts = CALENDAR_EVENT_TEXTS[locale];
  const url =
    baseUrl === null ? undefined : `${originOf(baseUrl)}/vehicles/${encodeURIComponent(vehicle.id)}`;
  const lines: string[] = [];
  if (schedule.nextDueOdometer != null) {
    const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
    lines.push(texts.dueAt(`${number.format(schedule.nextDueOdometer)} ${distanceUnit}`));
  }
  if (schedule.nextDueDateEstimated) lines.push(texts.estimated);
  if (url !== undefined) lines.push(`${texts.vehiclePage}: ${url}`);
  return {
    uid: `schedule-${schedule.id}@ikrive`,
    date: schedule.nextDueDate,
    title: `${schedule.title} · ${vehicle.name}`,
    description: lines.join('\n'),
    ...(url !== undefined && { url }),
  };
}

/**
 * `scheme://host[:port]` of an absolute URL, as `new URL(path, base)` would keep it for an absolute
 * path. (`URL` is not available here: this package has no DOM or Node types.)
 */
const originOf = (baseUrl: string) => /^[a-z][a-z\d+.-]*:\/\/[^/?#]*/i.exec(baseUrl)?.[0] ?? '';

const compactDate = (date: string) => date.replaceAll('-', '');

/** Query string with every value percent-encoded. */
const query = (params: Record<string, string>) =>
  Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');

/** Google Calendar "create event" link (all-day: the end date is exclusive). */
export function googleCalendarUrl(event: CalendarEvent): string {
  return `https://calendar.google.com/calendar/render?${query({
    action: 'TEMPLATE',
    text: event.title,
    details: event.description,
    dates: `${compactDate(event.date)}/${compactDate(addDays(event.date, 1))}`,
  })}`;
}

/** Outlook.com "compose event" link (personal accounts). */
export function outlookCalendarUrl(event: CalendarEvent): string {
  return `https://outlook.live.com/calendar/0/action/compose?${query({
    subject: event.title,
    body: event.description,
    startdt: event.date,
    enddt: addDays(event.date, 1),
    allday: 'true',
  })}`;
}

/** Control characters RFC 5545 forbids in TEXT values: every `\p{Cc}` except HTAB. */
const FORBIDDEN_CONTROL = /[^\P{Cc}\t]/gu;

/**
 * Escapes an RFC 5545 TEXT value. Every line break (`\r\n`, `\n` or a lone `\r`) becomes `\n`, so
 * no raw CR or LF can split a content line; any other control character but HTAB is dropped.
 */
const escapeText = (value: string) =>
  value
    .replace(/[\\;,]/g, (char) => `\\${char}`)
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(FORBIDDEN_CONTROL, '');

const MAX_LINE_OCTETS = 75;

/** UTF-8 length of a single character (code point). */
const utf8Octets = (char: string) => {
  const code = char.codePointAt(0) ?? 0;
  if (code < 0x80) return 1;
  if (code < 0x800) return 2;
  return code < 0x10000 ? 3 : 4;
};

/** Folds a content line at 75 octets (continuations start with a space) without splitting a character. */
function foldLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const octets = utf8Octets(char);
    if (size + octets > MAX_LINE_OCTETS) {
      parts.push(current);
      current = ' ';
      size = 1;
    }
    current += char;
    size += octets;
  }
  parts.push(current);
  return parts.join('\r\n');
}

/** `YYYYMMDDTHHMMSSZ` in UTC. */
const utcStamp = (date: Date) => `${date.toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`;

/** Serializes all-day events to an RFC 5545 iCalendar document (CRLF, folded, escaped). */
export function toICalendar(events: readonly CalendarEvent[], options: { now: Date; name?: string }): string {
  const stamp = utcStamp(options.now);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ikrive//Ikrive//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...(options.name ? [`X-WR-CALNAME:${escapeText(options.name)}`] : []),
  ];
  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeText(event.uid)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compactDate(event.date)}`,
      `DTEND;VALUE=DATE:${compactDate(addDays(event.date, 1))}`,
      `SUMMARY:${escapeText(event.title)}`,
      `DESCRIPTION:${escapeText(event.description)}`,
      ...(event.url !== undefined ? [`URL:${event.url}`] : []),
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
