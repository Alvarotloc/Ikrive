import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import type { Db } from '../src/db/client';
import { notifications, vehicles } from '../src/db/schema';
import { todayIn, weekdayOf } from '../src/lib/dates';
import { createTestApp, signUp } from './helpers';

type TestApp = Awaited<ReturnType<typeof createTestApp>>['app'];

const TIMEZONE = 'UTC';

/**
 * Signs up a user whose reminders are due right now without faking the clock: reminder hour 0 and,
 * for the odometer nudge, today's weekday. The first account is the instance admin.
 */
async function createUser(app: TestApp, email: string) {
  const { response, cookie } = await signUp(app, email);
  const headers = { cookie };
  const patched = await app.inject({
    method: 'PATCH',
    url: '/api/settings',
    headers,
    payload: {
      timezone: TIMEZONE,
      reminderHour: 0,
      odometerReminderWeekday: weekdayOf(todayIn(TIMEZONE, new Date())),
    },
  });
  expect(patched.statusCode).toBe(200);

  const createVehicle = async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/vehicles',
      headers,
      payload: { make: 'Seat', model: 'León', name: 'Coche' },
    });
    expect(created.statusCode).toBe(201);
    return (created.json() as { id: string }).id;
  };
  const createOverdueSchedule = async () => {
    const schedule = await app.inject({
      method: 'POST',
      url: `/api/vehicles/${await createVehicle()}/schedules`,
      headers,
      payload: {
        title: 'Cambio de aceite',
        category: 'oil_change',
        intervalMonths: 12,
        lastDoneDate: '2025-01-01',
      },
    });
    expect(schedule.statusCode).toBe(201);
  };
  const addChannel = async (payload: object) => {
    const created = await app.inject({ method: 'POST', url: '/api/notification-channels', headers, payload });
    expect(created.statusCode).toBe(201);
  };
  return {
    userId: (response.json() as { user: { id: string } }).user.id,
    cookie,
    createVehicle,
    createOverdueSchedule,
    addChannel,
  };
}

const runJob = (app: TestApp, name: string, cookie?: string) =>
  app.inject({
    method: 'POST',
    url: `/api/admin/jobs/${name}/run`,
    headers: cookie ? { cookie } : {},
  });

const rows = (db: Db) => db.select().from(notifications).all();

const expectProblem = (response: Awaited<ReturnType<typeof runJob>>, status: number) => {
  expect(response.statusCode).toBe(status);
  expect(response.headers['content-type']).toContain('application/problem+json');
  expect(response.json()).toMatchObject({ status });
};

describe('POST /api/admin/jobs/:name/run', () => {
  it('runs the reminders job', async () => {
    const { app, db } = await createTestApp();
    const admin = await createUser(app, 'admin@example.com');
    await admin.createOverdueSchedule();

    const response = await runJob(app, 'reminders', admin.cookie);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ job: 'reminders', evaluated: 1, created: 1, failed: 0 });
    expect(rows(db)).toMatchObject([
      { userId: admin.userId, type: 'schedule_overdue', title: 'Cambio de aceite' },
    ]);
  });

  it('runs the odometer-nudge job', async () => {
    const { app, db } = await createTestApp();
    const admin = await createUser(app, 'admin@example.com');
    const vehicleId = await admin.createVehicle();
    // No readings and created more than a week ago.
    db.update(vehicles)
      .set({ createdAt: new Date(Date.now() - 30 * 86_400_000) })
      .where(eq(vehicles.id, vehicleId))
      .run();

    const response = await runJob(app, 'odometer-nudge', admin.cookie);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ job: 'odometer-nudge', evaluated: 1, created: 1, failed: 0 });
    expect(rows(db)).toMatchObject([{ userId: admin.userId, type: 'odometer_nudge', title: 'Coche' }]);
  });

  it('reports failed sends', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) =>
      String(input) === 'https://down.example.com/hook'
        ? new Response(null, { status: 502 })
        : new Response(null, { status: 200 }),
    );
    const { app } = await createTestApp({}, { fetch });
    const admin = await createUser(app, 'admin@example.com');
    await admin.createOverdueSchedule();
    await admin.addChannel({ type: 'webhook', config: { url: 'https://down.example.com/hook' } });
    await admin.addChannel({ type: 'webhook', config: { url: 'https://hooks.example.com/ok' } });

    const response = await runJob(app, 'reminders', admin.cookie);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ job: 'reminders', evaluated: 1, created: 1, failed: 1 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('returns 404 for an unknown job', async () => {
    const { app } = await createTestApp();
    const admin = await createUser(app, 'admin@example.com');

    const response = await runJob(app, 'foo', admin.cookie);

    expectProblem(response, 404);
    expect(response.json()).toMatchObject({ detail: 'Unknown job: foo' });
  });

  it('returns 401 without a session', async () => {
    const { app, db } = await createTestApp();
    const admin = await createUser(app, 'admin@example.com');
    await admin.createOverdueSchedule();

    expectProblem(await runJob(app, 'reminders'), 401);
    expectProblem(await runJob(app, 'foo'), 401);
    expect(rows(db)).toEqual([]);
  });

  it('returns 403 for a regular user', async () => {
    const { app, db } = await createTestApp();
    const admin = await createUser(app, 'admin@example.com');
    const user = await createUser(app, 'bob@example.com');
    await admin.createOverdueSchedule();
    await user.createOverdueSchedule();

    expectProblem(await runJob(app, 'reminders', user.cookie), 403);
    expectProblem(await runJob(app, 'odometer-nudge', user.cookie), 403);
    // Authorization comes first: a regular user cannot tell which jobs exist.
    expectProblem(await runJob(app, 'foo', user.cookie), 403);
    expect(rows(db)).toEqual([]);
  });

  it('runs even when the scheduler is disabled', async () => {
    const { app, db } = await createTestApp({ REMINDERS_ENABLED: 'false' });
    const admin = await createUser(app, 'admin@example.com');
    await admin.createOverdueSchedule();

    const response = await runJob(app, 'reminders', admin.cookie);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ job: 'reminders', created: 1 });
    expect(rows(db)).toHaveLength(1);
  });
});
