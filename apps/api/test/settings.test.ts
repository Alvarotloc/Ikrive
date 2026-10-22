import { DEFAULT_USER_SETTINGS } from '@ikrive/shared';
import { describe, expect, it } from 'vitest';
import { createTestApp, signUp } from './helpers';

describe('settings', () => {
  it('returns defaults and persists updates', async () => {
    const { app } = await createTestApp();
    const { cookie } = await signUp(app);

    const initial = await app.inject({ method: 'GET', url: '/api/settings', headers: { cookie } });
    expect(initial.json()).toEqual(DEFAULT_USER_SETTINGS);

    const updated = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { cookie },
      payload: { distanceUnit: 'mi', currency: 'usd' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ distanceUnit: 'mi', currency: 'USD' });
  });

  it('validates the payload', async () => {
    const { app } = await createTestApp();
    const { cookie } = await signUp(app);
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { cookie },
      payload: { odometerReminderWeekday: 9 },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ title: 'Validation failed' });
  });

  it('returns and updates the reminder hour', async () => {
    const { app } = await createTestApp();
    const { cookie } = await signUp(app);

    const initial = await app.inject({ method: 'GET', url: '/api/settings', headers: { cookie } });
    expect(initial.json().reminderHour).toBe(8);

    const updated = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { cookie },
      payload: { reminderHour: 20 },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toEqual({ ...DEFAULT_USER_SETTINGS, reminderHour: 20 });

    const persisted = await app.inject({ method: 'GET', url: '/api/settings', headers: { cookie } });
    expect(persisted.json().reminderHour).toBe(20);
  });

  it('rejects an invalid reminder hour', async () => {
    const { app } = await createTestApp();
    const { cookie } = await signUp(app);

    for (const reminderHour of [-1, 24, 7.5, '8']) {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/settings',
        headers: { cookie },
        payload: { reminderHour },
      });
      expect(response.statusCode).toBe(400);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.json()).toMatchObject({ title: 'Validation failed' });
    }

    const current = await app.inject({ method: 'GET', url: '/api/settings', headers: { cookie } });
    expect(current.json().reminderHour).toBe(8);
  });
});
