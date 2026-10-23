import { CHANNEL_URL_CREDENTIALS } from '@ikrive/shared';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import type { Db } from '../src/db/client';
import { notificationChannels } from '../src/db/schema';
import { createTestApp, signUp } from './helpers';

type TestApp = Awaited<ReturnType<typeof createTestApp>>['app'];
type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function signUpUser(app: TestApp, email: string) {
  const { response, cookie } = await signUp(app, email);
  return { cookie, userId: (response.json() as { user: { id: string } }).user.id };
}

const call = (app: TestApp, cookie: string, method: Method, url: string, payload?: object) =>
  app.inject({ method, url: `/api/notification-channels${url}`, headers: { cookie }, payload });

const ntfy = { type: 'ntfy', config: { serverUrl: 'https://ntfy.sh', topic: 'car', token: 'tk_secret' } };
const gotify = {
  type: 'gotify',
  config: { serverUrl: 'https://gotify.example.com', token: 'gotify-secret' },
};
const webhook = { type: 'webhook', config: { url: 'https://hooks.example.com/ikrive' } };

const rows = (db: Db) => db.select().from(notificationChannels).all();
const row = (db: Db, id: string) =>
  db.select().from(notificationChannels).where(eq(notificationChannels.id, id)).get();

/** A `fetch` that answers every request with `status` and records the calls. */
const fakeFetch = (status = 200) =>
  vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status }));

describe('notification channels', () => {
  it('creates and lists channels oldest first', async () => {
    const { app } = await createTestApp();
    const { cookie } = await signUpUser(app, 'ada@example.com');

    const created = await call(app, cookie, 'POST', '', gotify);
    expect(created.statusCode).toBe(201);
    expect(created.json()).toEqual({
      id: expect.any(String),
      type: 'gotify',
      enabled: true,
      hasToken: true,
      lastError: null,
      config: { serverUrl: 'https://gotify.example.com' },
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    await new Promise((resolve) => setTimeout(resolve, 2));
    expect((await call(app, cookie, 'POST', '', { ...webhook, enabled: false })).json()).toMatchObject({
      type: 'webhook',
      enabled: false,
      hasToken: false,
      config: { url: 'https://hooks.example.com/ikrive' },
    });

    const list = await call(app, cookie, 'GET', '');
    expect(list.statusCode).toBe(200);
    expect(list.json().map((c: { type: string }) => c.type)).toEqual(['gotify', 'webhook']);
  });

  it('rejects an invalid channel', async () => {
    const { app, db } = await createTestApp();
    const { cookie } = await signUpUser(app, 'ada@example.com');

    for (const payload of [
      { type: 'email', config: { url: 'https://example.com' } },
      { type: 'gotify', config: { serverUrl: 'https://gotify.example.com' } },
      { type: 'webhook', config: { url: 'ftp://example.com/hook' } },
      { type: 'ntfy', config: { serverUrl: 'https://ntfy.sh' } },
    ]) {
      const response = await call(app, cookie, 'POST', '', payload);
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
    }
    expect(rows(db)).toHaveLength(0);
  });

  it('rejects urls with credentials', async () => {
    const { app, db } = await createTestApp();
    const { cookie } = await signUpUser(app, 'ada@example.com');

    const created = await call(app, cookie, 'POST', '', {
      type: 'webhook',
      config: { url: 'https://user:pass@hooks.example.com/ikrive' },
    });
    expect(created.statusCode).toBe(400);
    expect(created.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(created.json().errors).toEqual([{ path: 'config.url', message: CHANNEL_URL_CREDENTIALS }]);
    expect(rows(db)).toHaveLength(0);

    const { id } = (await call(app, cookie, 'POST', '', ntfy)).json();
    const updated = await call(app, cookie, 'PATCH', `/${id}`, {
      type: 'ntfy',
      config: { serverUrl: 'https://user:pass@ntfy.example.com', topic: 'car' },
    });
    expect(updated.statusCode).toBe(400);
    expect(updated.json().errors).toEqual([{ path: 'config.serverUrl', message: CHANNEL_URL_CREDENTIALS }]);
    expect(row(db, id)?.config).toEqual(ntfy.config);
  });

  it('updates enabled and config keeping the stored token', async () => {
    const { app, db } = await createTestApp();
    const { cookie } = await signUpUser(app, 'ada@example.com');
    const { id } = (await call(app, cookie, 'POST', '', ntfy)).json();

    const disabled = await call(app, cookie, 'PATCH', `/${id}`, { type: 'ntfy', enabled: false });
    expect(disabled.statusCode).toBe(200);
    expect(disabled.json()).toMatchObject({
      enabled: false,
      hasToken: true,
      config: { serverUrl: 'https://ntfy.sh', topic: 'car' },
    });
    expect(row(db, id)?.config).toEqual(ntfy.config);

    const moved = await call(app, cookie, 'PATCH', `/${id}`, {
      type: 'ntfy',
      config: { serverUrl: 'https://ntfy.example.com', topic: 'garage' },
    });
    expect(moved.statusCode).toBe(200);
    expect(moved.json()).toMatchObject({
      enabled: false,
      hasToken: true,
      config: { serverUrl: 'https://ntfy.example.com', topic: 'garage' },
    });
    expect(row(db, id)?.config).toEqual({
      serverUrl: 'https://ntfy.example.com',
      topic: 'garage',
      token: 'tk_secret',
    });

    await call(app, cookie, 'PATCH', `/${id}`, {
      type: 'ntfy',
      config: { ...ntfy.config, token: 'new-token' },
    });
    expect(row(db, id)?.config).toMatchObject({ token: 'new-token' });

    const invalid = await call(app, cookie, 'PATCH', `/${id}`, {
      type: 'ntfy',
      config: { serverUrl: 'ftp://x' },
    });
    expect(invalid.statusCode).toBe(400);
    expect(row(db, id)?.config).toMatchObject({ token: 'new-token', topic: 'car' });
  });

  it('rejects a patch with a different type', async () => {
    const { app, db } = await createTestApp();
    const { cookie } = await signUpUser(app, 'ada@example.com');
    const { id } = (await call(app, cookie, 'POST', '', ntfy)).json();
    const before = row(db, id);

    const response = await call(app, cookie, 'PATCH', `/${id}`, { ...webhook, enabled: false });
    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(row(db, id)).toEqual(before);
  });

  it('deletes a channel', async () => {
    const { app, db } = await createTestApp();
    const { cookie } = await signUpUser(app, 'ada@example.com');
    const { id } = (await call(app, cookie, 'POST', '', ntfy)).json();

    const response = await call(app, cookie, 'DELETE', `/${id}`);
    expect(response.statusCode).toBe(204);
    expect(row(db, id)).toBeUndefined();
    expect((await call(app, cookie, 'DELETE', `/${id}`)).statusCode).toBe(404);
  });

  it('never returns the token', async () => {
    const { app } = await createTestApp();
    const { cookie } = await signUpUser(app, 'ada@example.com');

    const responses = [
      await call(app, cookie, 'POST', '', ntfy),
      await call(app, cookie, 'POST', '', gotify),
    ];
    const [first] = responses.map((r) => r.json());
    responses.push(await call(app, cookie, 'PATCH', `/${first.id}`, { type: 'ntfy', enabled: false }));
    responses.push(await call(app, cookie, 'GET', ''));
    for (const response of responses) {
      expect(response.body).not.toContain('tk_secret');
      expect(response.body).not.toContain('gotify-secret');
      expect(response.body).not.toContain('"token"');
    }
    expect(responses[3]?.json().map((c: { hasToken: boolean }) => c.hasToken)).toEqual([true, true]);

    const withoutToken = (await call(app, cookie, 'POST', '', webhook)).json();
    expect(withoutToken.hasToken).toBe(false);
  });

  it("hides other users' channels", async () => {
    const { app } = await createTestApp();
    const ada = await signUpUser(app, 'ada@example.com');
    const bob = await signUpUser(app, 'bob@example.com');
    await call(app, ada.cookie, 'POST', '', ntfy);
    await call(app, bob.cookie, 'POST', '', webhook);

    expect((await call(app, ada.cookie, 'GET', '')).json().map((c: { type: string }) => c.type)).toEqual([
      'ntfy',
    ]);
    expect((await call(app, bob.cookie, 'GET', '')).json().map((c: { type: string }) => c.type)).toEqual([
      'webhook',
    ]);
  });

  it("returns 404 for another user's channel", async () => {
    const fetch = fakeFetch();
    const { app, db } = await createTestApp({}, { fetch });
    const ada = await signUpUser(app, 'ada@example.com');
    const bob = await signUpUser(app, 'bob@example.com');
    const { id } = (await call(app, ada.cookie, 'POST', '', ntfy)).json();
    const before = row(db, id);

    for (const [method, url, payload] of [
      ['PATCH', `/${id}`, { type: 'ntfy', enabled: false }],
      ['DELETE', `/${id}`, undefined],
      ['POST', `/${id}/test`, undefined],
      ['PATCH', '/missing', { type: 'ntfy', enabled: false }],
      ['POST', '/missing/test', undefined],
    ] as const) {
      const response = await call(app, bob.cookie, method, url, payload);
      expect(response.statusCode, `${method} ${url}`).toBe(404);
      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
    }
    expect(row(db, id)).toEqual(before);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('requires a session', async () => {
    const { app } = await createTestApp();
    for (const [method, url] of [
      ['GET', '/api/notification-channels'],
      ['POST', '/api/notification-channels'],
      ['PATCH', '/api/notification-channels/x'],
      ['DELETE', '/api/notification-channels/x'],
      ['POST', '/api/notification-channels/x/test'],
    ] as const) {
      const response = await app.inject({ method, url, payload: method === 'GET' ? undefined : ntfy });
      expect(response.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it('sends a test message and clears the last error', async () => {
    const fetch = fakeFetch(200);
    const { app, db } = await createTestApp({}, { fetch });
    const { cookie } = await signUpUser(app, 'ada@example.com');
    await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { cookie },
      payload: { locale: 'en' },
    });
    const { id } = (await call(app, cookie, 'POST', '', { ...gotify, enabled: false })).json();
    db.update(notificationChannels)
      .set({ lastError: 'HTTP 500' })
      .where(eq(notificationChannels.id, id))
      .run();

    const response = await call(app, cookie, 'POST', `/${id}/test`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, error: null });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('https://gotify.example.com/message');
    expect(JSON.parse(String(init?.body))).toEqual({
      title: 'Ikrive: test notification',
      message: 'If you can read this, the channel works.',
      priority: 5,
    });
    expect(row(db, id)?.lastError).toBeNull();
  });

  it('reports a failed test and stores the error', async () => {
    const fetch = fakeFetch(500);
    const { app, db } = await createTestApp({}, { fetch });
    const { cookie } = await signUpUser(app, 'ada@example.com');
    const { id } = (await call(app, cookie, 'POST', '', ntfy)).json();

    const response = await call(app, cookie, 'POST', `/${id}/test`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: false, error: 'HTTP 500' });
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({
      title: 'Ikrive: notificación de prueba',
    });
    expect(row(db, id)?.lastError).toBe('HTTP 500');
    expect((await call(app, cookie, 'GET', '')).json()[0]).toMatchObject({ id, lastError: 'HTTP 500' });
  });
});
