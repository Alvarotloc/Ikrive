import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calendarFeeds } from '../src/db/schema';
import { createTestApp, signUp } from './helpers';

type TestApp = Awaited<ReturnType<typeof createTestApp>>['app'];

const FEED = '/api/settings/calendar-feed';

async function setup() {
  const { app, db } = await createTestApp();
  const { cookie } = await signUp(app);
  return { app, db, cookie };
}

/** Feed management requests of one user. */
const feedApi = (app: TestApp, cookie: string) => ({
  status: () => app.inject({ method: 'GET', url: FEED, headers: { cookie } }),
  enable: async () => {
    const response = await app.inject({ method: 'POST', url: FEED, headers: { cookie } });
    expect(response.statusCode).toBe(200);
    return response.json() as { enabled: true; createdAt: string; url: string };
  },
  disable: () => app.inject({ method: 'DELETE', url: FEED, headers: { cookie } }),
});

/** Path (without origin) of a feed URL, to request it with `inject`. */
const pathOf = (url: string) => new URL(url).pathname;

const getFeed = (app: TestApp, url: string) => app.inject({ method: 'GET', url: pathOf(url) });

/** Content lines of an iCalendar body after unfolding. */
const unfold = (ics: string) => ics.replace(/\r\n /g, '').split('\r\n');

const countEvents = (ics: string) => unfold(ics).filter((line) => line === 'BEGIN:VEVENT').length;

async function createVehicle(app: TestApp, cookie: string, fields: Record<string, unknown> = {}) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/vehicles',
    headers: { cookie },
    payload: { make: 'Seat', model: 'León', ...fields },
  });
  expect(response.statusCode).toBe(201);
  return response.json() as { id: string };
}

async function createSchedule(
  app: TestApp,
  cookie: string,
  vehicleId: string,
  payload: Record<string, unknown>,
) {
  const response = await app.inject({
    method: 'POST',
    url: `/api/vehicles/${vehicleId}/schedules`,
    headers: { cookie },
    payload: { category: 'oil_change', lastDoneDate: '2026-01-15', ...payload },
  });
  expect(response.statusCode).toBe(201);
  return response.json() as { id: string; nextDueDate: string | null };
}

const expectNotFound = (response: Awaited<ReturnType<TestApp['inject']>>) => {
  expect(response.statusCode).toBe(404);
  expect(response.headers['content-type']).toContain('application/problem+json');
  expect(response.json()).toMatchObject({ status: 404, detail: 'Calendar feed not found' });
};

describe('calendar feed settings', () => {
  it('reports a disabled feed', async () => {
    const { app, cookie } = await setup();
    const response = await feedApi(app, cookie).status();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ enabled: false, createdAt: null });
  });

  it('enables the feed', async () => {
    const { app, cookie } = await setup();
    const api = feedApi(app, cookie);
    const enabled = await api.enable();
    expect(enabled.enabled).toBe(true);
    expect(enabled.url).toMatch(/^http:\/\/localhost:3000\/api\/calendar\/[0-9a-f]{80}\.ics$/);
    expect(Number.isNaN(Date.parse(enabled.createdAt))).toBe(false);

    const status = await api.status();
    expect(status.json()).toEqual({ enabled: true, createdAt: enabled.createdAt });
  });

  it('stores only the selector and the verifier hash', async () => {
    const { app, db, cookie } = await setup();
    const { url } = await feedApi(app, cookie).enable();
    const token = /([0-9a-f]{80})\.ics$/.exec(url)?.[1] ?? '';
    const selector = token.slice(0, 16);
    const verifier = token.slice(16);

    const rows = db.select().from(calendarFeeds).all();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.selector).toBe(selector);
    expect(row?.verifierHash).toBe(createHash('sha256').update(verifier).digest('hex'));
    const stored = JSON.stringify(row);
    expect(stored).not.toContain(token);
    expect(stored).not.toContain(verifier);
  });

  it('disables the feed', async () => {
    const { app, db, cookie } = await setup();
    const api = feedApi(app, cookie);
    await api.enable();

    const response = await api.disable();
    expect(response.statusCode).toBe(204);
    expect((await api.status()).json()).toEqual({ enabled: false, createdAt: null });
    expect(db.select().from(calendarFeeds).all()).toHaveLength(0);
    // Idempotent.
    expect((await api.disable()).statusCode).toBe(204);
  });

  it('requires a session', async () => {
    const { app } = await setup();
    for (const method of ['GET', 'POST', 'DELETE'] as const) {
      const response = await app.inject({ method, url: FEED });
      expect(response.statusCode).toBe(401);
      expect(response.headers['content-type']).toContain('application/problem+json');
    }
  });
});

describe('calendar feed', () => {
  it('serves the feed without a session', async () => {
    const { app, cookie } = await setup();
    const { url } = await feedApi(app, cookie).enable();

    const response = await getFeed(app, url);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/calendar; charset=utf-8');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(unfold(response.body)).toContain('X-WR-CALNAME:Ikrive');
  });

  it('includes one event per dated schedule of active vehicles', async () => {
    const { app, cookie } = await setup();
    const active = await createVehicle(app, cookie, { name: 'Clio' });
    const archived = await createVehicle(app, cookie);
    const sold = await createVehicle(app, cookie);
    const byMonths = await createSchedule(app, cookie, active.id, { title: 'Aceite', intervalMonths: 12 });
    const second = await createSchedule(app, cookie, active.id, { title: 'ITV', intervalMonths: 24 });
    // Only distance and no readings: no date, no event.
    await createSchedule(app, cookie, active.id, {
      title: 'Neumáticos',
      intervalDistance: 40_000,
      lastDoneOdometer: 10_000,
    });
    const archivedRule = await createSchedule(app, cookie, archived.id, {
      title: 'Frenos',
      intervalMonths: 12,
    });
    const soldRule = await createSchedule(app, cookie, sold.id, { title: 'Batería', intervalMonths: 12 });
    const patch = (id: string, payload: Record<string, unknown>) =>
      app.inject({ method: 'PATCH', url: `/api/vehicles/${id}`, headers: { cookie }, payload });
    expect((await patch(archived.id, { archived: true })).statusCode).toBe(200);
    expect((await patch(sold.id, { soldAt: '2026-03-01' })).statusCode).toBe(200);

    // Another user's schedule stays out of this feed.
    const other = await signUp(app, 'grace@example.com', 'Grace');
    const otherVehicle = await createVehicle(app, other.cookie);
    const otherRule = await createSchedule(app, other.cookie, otherVehicle.id, {
      title: 'Ajena',
      intervalMonths: 6,
    });

    const { url } = await feedApi(app, cookie).enable();
    const lines = unfold((await getFeed(app, url)).body);
    expect(lines.filter((line) => line === 'BEGIN:VEVENT')).toHaveLength(2);
    expect(lines).toContain(`UID:schedule-${byMonths.id}@ikrive`);
    expect(lines).toContain(`UID:schedule-${second.id}@ikrive`);
    expect(lines).toContain('SUMMARY:Aceite · Clio');
    expect(lines).toContain('DTSTART;VALUE=DATE:20270115');
    expect(lines).toContain(`URL:http://localhost:3000/vehicles/${active.id}`);
    for (const absent of [archivedRule, soldRule, otherRule]) {
      expect(lines).not.toContain(`UID:schedule-${absent.id}@ikrive`);
    }
  });

  it('keeps the uid when a schedule changes', async () => {
    const { app, cookie } = await setup();
    const vehicle = await createVehicle(app, cookie);
    const rule = await createSchedule(app, cookie, vehicle.id, { title: 'Aceite', intervalMonths: 12 });
    const { url } = await feedApi(app, cookie).enable();

    const before = unfold((await getFeed(app, url)).body);
    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/vehicles/${vehicle.id}/schedules/${rule.id}`,
      headers: { cookie },
      payload: { intervalMonths: 6 },
    });
    expect(updated.statusCode).toBe(200);
    const after = unfold((await getFeed(app, url)).body);

    const uid = `UID:schedule-${rule.id}@ikrive`;
    expect(before).toContain(uid);
    expect(after).toContain(uid);
    expect(before).toContain('DTSTART;VALUE=DATE:20270115');
    expect(after).toContain('DTSTART;VALUE=DATE:20260715');
  });

  it("uses the owner's settings", async () => {
    const { app, cookie } = await setup();
    const settings = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { cookie },
      payload: { locale: 'en', distanceUnit: 'mi' },
    });
    expect(settings.statusCode).toBe(200);
    const vehicle = await createVehicle(app, cookie);
    await createSchedule(app, cookie, vehicle.id, {
      title: 'Oil',
      intervalMonths: 12,
      intervalDistance: 10_000,
      lastDoneOdometer: 5_000,
    });
    const { url } = await feedApi(app, cookie).enable();

    const lines = unfold((await getFeed(app, url)).body);
    expect(lines).toContain('SUMMARY:Oil · Seat León');
    expect(lines).toContain(
      `DESCRIPTION:Due at 15\\,000 mi\\nVehicle page: http://localhost:3000/vehicles/${vehicle.id}`,
    );
  });
});

describe('calendar feed time zone', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("computes today in the owner's time zone", async () => {
    // 18:00 UTC on 15 June is already 06:00 on 16 June in Auckland (UTC+12).
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-15T18:00:00Z'));
    const { app, cookie } = await setup();
    const setTimezone = async (timezone: string) => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/settings',
        headers: { cookie },
        payload: { timezone },
      });
      expect(response.statusCode).toBe(200);
    };
    await setTimezone('Pacific/Auckland');
    const vehicle = await createVehicle(app, cookie);
    const addReading = async (date: string, value: number) => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/vehicles/${vehicle.id}/odometer`,
        headers: { cookie },
        payload: { date, value },
      });
      expect(response.statusCode).toBe(201);
    };
    // 17 March is 90 days before 15 June (UTC "today") but 91 before 16 June (Auckland "today"),
    // so it only counts for the daily average in UTC.
    await addReading('2026-03-17', 10_000);
    await addReading('2026-04-02', 11_000);
    await addReading('2026-06-01', 17_000);
    await createSchedule(app, cookie, vehicle.id, {
      title: 'Neumáticos',
      intervalDistance: 10_000,
      lastDoneOdometer: 10_000,
    });
    const { url } = await feedApi(app, cookie).enable();

    // Auckland: 6000 km in 60 days = 100/day; 3000 left → 30 days after 1 June.
    const auckland = unfold((await getFeed(app, url)).body);
    expect(auckland).toContain('DTSTART;VALUE=DATE:20260701');

    // UTC: 7000 km in 76 days; 3000 left → 33 days after 1 June.
    await setTimezone('UTC');
    const utc = unfold((await getFeed(app, url)).body);
    expect(utc).toContain('DTSTART;VALUE=DATE:20260704');
  });
});

describe('calendar feed not found', () => {
  it('returns 404 for an unknown token', async () => {
    const { app } = await setup();
    expectNotFound(await app.inject({ method: 'GET', url: `/api/calendar/${'a'.repeat(80)}.ics` }));
  });

  it('returns 404 after regenerating', async () => {
    const { app, cookie } = await setup();
    const api = feedApi(app, cookie);
    const first = await api.enable();
    const second = await api.enable();
    expect(second.url).not.toBe(first.url);

    expectNotFound(await getFeed(app, first.url));
    expect((await getFeed(app, second.url)).statusCode).toBe(200);
  });

  it('returns 404 after disabling', async () => {
    const { app, cookie } = await setup();
    const api = feedApi(app, cookie);
    const { url } = await api.enable();
    expect((await getFeed(app, url)).statusCode).toBe(200);
    await api.disable();
    expectNotFound(await getFeed(app, url));
  });

  it('returns 404 without the .ics suffix or with a malformed token', async () => {
    const { app, cookie } = await setup();
    const { url } = await feedApi(app, cookie).enable();
    const token = /([0-9a-f]{80})\.ics$/.exec(url)?.[1] ?? '';
    const selector = token.slice(0, 16);
    const wrongVerifier = `${selector}${'0'.repeat(64)}`;

    for (const path of [
      `/api/calendar/${token}`,
      `/api/calendar/${token}.ical`,
      `/api/calendar/${token.slice(1)}.ics`,
      `/api/calendar/${token.toUpperCase()}.ics`,
      `/api/calendar/${wrongVerifier}.ics`,
      '/api/calendar/.ics',
    ]) {
      expectNotFound(await app.inject({ method: 'GET', url: path }));
    }
    expect(countEvents((await getFeed(app, url)).body)).toBe(0);
  });
});

describe('calendar feed of a disabled owner', () => {
  /** The admin signs up first (an admin cannot disable themselves); the owner has a feed. */
  async function setupOwner() {
    const { app, db } = await createTestApp();
    const admin = await signUp(app, 'admin@example.com', 'Admin');
    const owner = await signUp(app, 'ada@example.com', 'Ada');
    const ownerId = (owner.response.json() as { user: { id: string } }).user.id;
    const { url } = await feedApi(app, owner.cookie).enable();
    const setDisabled = async (disabled: boolean) => {
      const action = disabled ? 'disable' : 'enable';
      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/users/${ownerId}/${action}`,
        headers: { cookie: admin.cookie },
      });
      expect(response.statusCode).toBe(200);
    };
    const feedRow = () => db.select().from(calendarFeeds).where(eq(calendarFeeds.userId, ownerId)).get();
    return { app, url, setDisabled, feedRow };
  }

  /** A well-formed token whose selector does not exist. */
  const unknownFeed = (app: TestApp) =>
    app.inject({ method: 'GET', url: `/api/calendar/${randomBytes(40).toString('hex')}.ics` });

  it('returns the same 404 as an unknown token while the owner is disabled', async () => {
    const { app, url, setDisabled } = await setupOwner();
    expect((await getFeed(app, url)).statusCode).toBe(200);
    await setDisabled(true);

    const disabled = await getFeed(app, url);
    const unknown = await unknownFeed(app);
    expectNotFound(disabled);
    expect(disabled.statusCode).toBe(unknown.statusCode);
    expect(disabled.headers['content-type']).toBe(unknown.headers['content-type']);
    expect(disabled.json()).toEqual(unknown.json());
  });

  it('serves the feed again with the same token after reactivation', async () => {
    const { app, url, setDisabled } = await setupOwner();
    await setDisabled(true);
    expectNotFound(await getFeed(app, url));
    await setDisabled(false);

    const response = await getFeed(app, url);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/calendar; charset=utf-8');
    expect(response.body).toContain('BEGIN:VCALENDAR');
  });

  it('keeps the feed row when disabling and enabling the owner', async () => {
    const { feedRow, setDisabled } = await setupOwner();
    const before = feedRow();
    expect(before).toBeDefined();
    await setDisabled(true);
    expect(feedRow()).toEqual(before);
    await setDisabled(false);
    expect(feedRow()).toEqual(before);
  });

  it('sends no-store on feed 404s', async () => {
    const { app, url, setDisabled } = await setupOwner();
    expect((await getFeed(app, url)).headers['cache-control']).toBe('private, no-store');
    const unknown = await unknownFeed(app);
    expect(unknown.statusCode).toBe(404);
    expect(unknown.headers['cache-control']).toBe('private, no-store');
    const noSuffix = await app.inject({ method: 'GET', url: pathOf(url).replace(/\.ics$/, '') });
    expect(noSuffix.statusCode).toBe(404);
    expect(noSuffix.headers['cache-control']).toBe('private, no-store');

    await setDisabled(true);
    const disabled = await getFeed(app, url);
    expect(disabled.statusCode).toBe(404);
    expect(disabled.headers['cache-control']).toBe('private, no-store');
  });
});
