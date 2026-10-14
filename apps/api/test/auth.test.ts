import { describe, expect, it } from 'vitest';
import { createTestApp, signUp } from './helpers';

describe('auth', () => {
  it('makes the first user admin and later users regular users', async () => {
    const { app } = await createTestApp();
    const first = await signUp(app, 'admin@example.com');
    const second = await signUp(app, 'user@example.com');

    const me1 = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: first.cookie } });
    const me2 = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: second.cookie } });
    expect(me1.json()).toMatchObject({ email: 'admin@example.com', role: 'admin' });
    expect(me2.json()).toMatchObject({ email: 'user@example.com', role: 'user' });
  });

  it('blocks sign-ups after the first user when DISABLE_SIGNUP is set', async () => {
    const { app } = await createTestApp({ DISABLE_SIGNUP: 'true' });
    expect((await signUp(app, 'admin@example.com')).response.statusCode).toBe(200);
    expect((await signUp(app, 'intruder@example.com')).response.statusCode).toBe(403);
  });

  it('rejects unauthenticated requests', async () => {
    const { app } = await createTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/me' });
    expect(response.statusCode).toBe(401);
  });
});
