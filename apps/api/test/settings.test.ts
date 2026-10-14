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
});
