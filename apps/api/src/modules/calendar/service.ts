import {
  AVERAGE_WINDOW_DAYS,
  addDays,
  type CalendarEvent,
  type CalendarFeed,
  type CalendarFeedSecret,
  computeScheduleDue,
  type OdometerPoint,
  scheduleCalendarEvent,
  toICalendar,
} from '@ikrive/shared';
import { todayIn } from '../../lib/dates';
import { NotFoundError } from '../../lib/errors';
import { generateFeedToken, hashVerifier, parseFeedToken, verifierMatches } from '../../lib/tokens';
import type { SchedulesRepository } from '../schedules/repository';
import type { SettingsService } from '../settings/service';
import type { VehiclesRepository } from '../vehicles/repository';
import type { CalendarRepository } from './repository';

interface CalendarServiceDeps {
  repo: CalendarRepository;
  schedules: SchedulesRepository;
  vehicles: VehiclesRepository;
  settings: SettingsService;
  /** Public URL of the server: the feed URL and its events' links are built on it. */
  baseUrl: string;
}

export function createCalendarService({ repo, schedules, vehicles, settings, baseUrl }: CalendarServiceDeps) {
  /**
   * Owner of a feed token. Every failure (malformed, unknown selector, wrong verifier) is the same
   * 404, so a caller cannot tell which part was wrong.
   */
  const requireOwner = (token: string) => {
    const parsed = parseFeedToken(token);
    const row = parsed && repo.findBySelector(parsed.selector);
    if (!parsed || !row || !verifierMatches(parsed.verifier, row.verifierHash)) {
      throw new NotFoundError('Calendar feed not found');
    }
    return row.userId;
  };

  return {
    status(userId: string): CalendarFeed {
      const row = repo.find(userId);
      return row
        ? { enabled: true, createdAt: row.createdAt.toISOString() }
        : { enabled: false, createdAt: null };
    },

    /** Enables the feed or, when it is already enabled, replaces its token (the old URL stops working). */
    enable(userId: string): CalendarFeedSecret {
      const { token, selector, verifier } = generateFeedToken();
      const row = repo.upsert(userId, { selector, verifierHash: hashVerifier(verifier) });
      return {
        enabled: true,
        createdAt: row.createdAt.toISOString(),
        url: new URL(`/api/calendar/${token}.ics`, baseUrl).href,
      };
    },

    disable(userId: string) {
      repo.delete(userId);
    },

    /** iCalendar with one event per dated schedule of the token owner's active vehicles. */
    feed(token: string, now = new Date()): string {
      const userId = requireOwner(token);
      const { locale, timezone, distanceUnit } = settings.get(userId);
      const today = todayIn(timezone, now);
      const rules = schedules.listForOwnerActiveVehicles(userId);

      const readingsByVehicle = new Map<string, OdometerPoint[]>();
      for (const { vehicleId, date, value } of vehicles.listRecentReadingsByVehicles(
        [...new Set(rules.map((rule) => rule.vehicleId))],
        addDays(today, -AVERAGE_WINDOW_DAYS),
      )) {
        const list = readingsByVehicle.get(vehicleId) ?? [];
        list.push({ date, value });
        readingsByVehicle.set(vehicleId, list);
      }

      const events: CalendarEvent[] = [];
      for (const rule of rules) {
        const due = computeScheduleDue(rule, readingsByVehicle.get(rule.vehicleId) ?? [], today);
        const event = scheduleCalendarEvent({
          schedule: { id: rule.id, title: rule.title, ...due },
          vehicle: {
            id: rule.vehicleId,
            name: rule.vehicleName ?? `${rule.vehicleMake} ${rule.vehicleModel}`,
          },
          baseUrl,
          locale,
          distanceUnit,
        });
        if (event) events.push(event);
      }
      return toICalendar(events, { now, name: 'Ikrive' });
    },
  };
}

export type CalendarService = ReturnType<typeof createCalendarService>;
