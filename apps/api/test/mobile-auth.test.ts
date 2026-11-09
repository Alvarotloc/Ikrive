import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { session } from '../src/db/schema';
import { createTestApp, signUp } from './helpers';

type TestApp = Awaited<ReturnType<typeof createTestApp>>['app'];
type Response = Awaited<ReturnType<TestApp['inject']>>;

const PASSWORD = 'correct-horse-battery';
const APP_ORIGIN = 'capacitor://localhost';
const WEB_ORIGIN = 'http://localhost:3000';
const EVIL_ORIGIN = 'https://evil.example';

const expectProblem = (response: Response, status: number) => {
  expect(response.statusCode).toBe(status);
  expect(response.headers['content-type']).toContain('application/problem+json');
  expect(response.json()).toMatchObject({ status });
};

/** Names of the `access-control-*` headers of a response. */
const corsHeaders = (response: Response) =>
  Object.keys(response.headers).filter((key) => key.startsWith('access-control-'));

const signInRequest = (app: TestApp, email: string, origin: string) =>
  app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin },
    payload: { email, password: PASSWORD },
  });

/** Signs in from the app's origin and returns the session token of the `set-auth-token` header. */
async function signInWithToken(app: TestApp, email: string, origin = APP_ORIGIN) {
  const response = await signInRequest(app, email, origin);
  expect(response.statusCode).toBe(200);
  const token = response.headers['set-auth-token'];
  if (typeof token !== 'string' || token === '') throw new Error('No set-auth-token header');
  return token;
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** Signs up an account (the first one is the admin) and returns its id, cookie and app token. */
async function createAccount(app: TestApp, email: string, name: string) {
  const { response, cookie } = await signUp(app, email, name);
  expect(response.statusCode).toBe(200);
  const id = (response.json() as { user: { id: string } }).user.id;
  const token = await signInWithToken(app, email);
  return { id, email, cookie, token };
}

function multipart(data: Buffer, filename: string, mimetype: string) {
  const boundary = '----ikrive-test-boundary';
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimetype}\r\n\r\n`,
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

const png = () =>
  sharp({ create: { width: 64, height: 32, channels: 3, background: '#c5e8e0' } })
    .png()
    .toBuffer();

async function createVehicle(app: TestApp, headers: Record<string, string>) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/vehicles',
    headers,
    payload: { make: 'Seat', model: 'León' },
  });
  expect(response.statusCode).toBe(201);
  return (response.json() as { id: string }).id;
}

/** Gives the user a vehicle with a photo and a maintenance record with an image attachment; returns the file URLs. */
async function createFiles(app: TestApp, cookie: string) {
  const vehicleId = await createVehicle(app, { cookie });
  const photo = multipart(await png(), 'photo.png', 'image/png');
  const uploaded = await app.inject({
    method: 'PUT',
    url: `/api/vehicles/${vehicleId}/photo`,
    headers: { cookie, ...photo.headers },
    payload: photo.payload,
  });
  expect(uploaded.statusCode).toBe(200);

  const record = await app.inject({
    method: 'POST',
    url: `/api/vehicles/${vehicleId}/maintenance`,
    headers: { cookie },
    payload: { date: '2025-05-10', category: 'oil_change', title: 'Cambio de aceite' },
  });
  expect(record.statusCode).toBe(201);
  const recordId = (record.json() as { id: string }).id;
  const file = multipart(await png(), 'factura.png', 'image/png');
  const attached = await app.inject({
    method: 'POST',
    url: `/api/vehicles/${vehicleId}/maintenance/${recordId}/attachments`,
    headers: { cookie, ...file.headers },
    payload: file.payload,
  });
  expect(attached.statusCode).toBe(201);
  const attachment = `/api/vehicles/${vehicleId}/maintenance/${recordId}/attachments/${(attached.json() as { id: string }).id}`;

  return {
    vehicleId,
    urls: [`/api/vehicles/${vehicleId}/photo`, attachment, `${attachment}/thumbnail`],
  };
}

/** Creates a minimal built SPA (index.html + one asset) to serve from WEB_DIST_DIR. */
function createWebDist() {
  const dir = mkdtempSync(join(tmpdir(), 'ikrive-web-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Ikrive</title>');
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log("ikrive");');
  return dir;
}

const preflight = (app: TestApp, url: string, origin: string) =>
  app.inject({
    method: 'OPTIONS',
    url,
    headers: {
      origin,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization,content-type',
    },
  });

describe('bearer sessions', () => {
  it('returns a session token on sign-up and sign-in', async () => {
    const { app } = await createTestApp();

    const signedUp = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { origin: APP_ORIGIN },
      payload: { email: 'ada@example.com', name: 'Ada', password: PASSWORD },
    });
    expect(signedUp.statusCode).toBe(200);
    expect(signedUp.headers['set-auth-token']).toEqual(expect.any(String));
    expect(signedUp.headers['set-auth-token']).not.toBe('');

    const signedIn = await signInRequest(app, 'ada@example.com', APP_ORIGIN);
    expect(signedIn.statusCode).toBe(200);
    const token = signedIn.headers['set-auth-token'];
    expect(token).toEqual(expect.any(String));
    expect(token).not.toBe(signedUp.headers['set-auth-token']);
  });

  it('authenticates API routes with the bearer token', async () => {
    const { app } = await createTestApp();
    const admin = await createAccount(app, 'ada@example.com', 'Ada');
    const headers = bearer(admin.token);

    const me = await app.inject({ method: 'GET', url: '/api/me', headers });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ id: admin.id, email: 'ada@example.com', role: 'admin' });

    const vehicleId = await createVehicle(app, headers);
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/vehicles/${vehicleId}`,
      headers,
      payload: { model: 'Ibiza' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json()).toMatchObject({ id: vehicleId, model: 'Ibiza' });

    // The vehicle belongs to the same user as with the cookie.
    const withCookie = await app.inject({
      method: 'GET',
      url: `/api/vehicles/${vehicleId}`,
      headers: { cookie: admin.cookie },
    });
    expect(withCookie.json()).toMatchObject({ model: 'Ibiza' });

    const removed = await app.inject({ method: 'DELETE', url: `/api/vehicles/${vehicleId}`, headers });
    expect(removed.statusCode).toBe(204);

    const users = await app.inject({ method: 'GET', url: '/api/admin/users', headers });
    expect(users.statusCode).toBe(200);
    expect(users.json()).toEqual([expect.objectContaining({ email: 'ada@example.com' })]);
  });

  it('rejects unknown, tampered and malformed tokens', async () => {
    const { app, db } = await createTestApp();
    const ada = await createAccount(app, 'ada@example.com', 'Ada');
    const [raw, signature] = ada.token.split('.');
    const tampered = `${raw}.${signature?.startsWith('A') ? 'B' : 'A'}${signature?.slice(1)}`;
    const me = (authorization: string) =>
      app.inject({ method: 'GET', url: '/api/me', headers: { authorization } });

    for (const authorization of [
      'Bearer d2hhdGV2ZXItdW5rbm93bi10b2tlbg',
      `Bearer ${tampered}`,
      'Bearer ',
      'Bearer',
      `Basic ${ada.token}`,
    ]) {
      expectProblem(await me(authorization), 401);
    }

    // Still valid until its session expires.
    expect((await me(`Bearer ${ada.token}`)).statusCode).toBe(200);
    db.update(session)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(session.token, raw ?? ''))
      .run();
    expectProblem(await me(`Bearer ${ada.token}`), 401);
  });

  it('invalidates the token on sign-out', async () => {
    const { app } = await createTestApp();
    const ada = await createAccount(app, 'ada@example.com', 'Ada');

    const signedOut = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: { ...bearer(ada.token), origin: APP_ORIGIN },
    });
    expect(signedOut.statusCode).toBe(200);

    expectProblem(await app.inject({ method: 'GET', url: '/api/me', headers: bearer(ada.token) }), 401);
    // Only that session ended: the web cookie still works.
    const web = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: ada.cookie } });
    expect(web.statusCode).toBe(200);
  });
});

describe('disabled accounts', () => {
  it('rejects the tokens of a disabled account', async () => {
    const { app } = await createTestApp();
    const admin = await createAccount(app, 'ada@example.com', 'Ada');
    const bob = await createAccount(app, 'bob@example.com', 'Bob');
    const me = () => app.inject({ method: 'GET', url: '/api/me', headers: bearer(bob.token) });
    expect((await me()).statusCode).toBe(200);

    const disabled = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${bob.id}/disable`,
      headers: bearer(admin.token),
    });
    expect(disabled.statusCode).toBe(200);
    expectProblem(await me(), 401);

    const enabled = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${bob.id}/enable`,
      headers: bearer(admin.token),
    });
    expect(enabled.statusCode).toBe(200);
    expectProblem(await me(), 401);
  });

  it('does not issue a token to a disabled account', async () => {
    const { app } = await createTestApp();
    const admin = await createAccount(app, 'ada@example.com', 'Ada');
    const bob = await createAccount(app, 'bob@example.com', 'Bob');
    await app.inject({
      method: 'POST',
      url: `/api/admin/users/${bob.id}/disable`,
      headers: bearer(admin.token),
    });

    const signedIn = await signInRequest(app, bob.email, APP_ORIGIN);
    expect(signedIn.statusCode).toBe(403);
    expect(signedIn.headers['set-auth-token']).toBeUndefined();
  });
});

describe('files with a bearer token', () => {
  it('serves the photo, attachment and thumbnail to their owner', async () => {
    const { app } = await createTestApp();
    const ada = await createAccount(app, 'ada@example.com', 'Ada');
    const { urls } = await createFiles(app, ada.cookie);

    for (const url of urls) {
      const withCookie = await app.inject({ method: 'GET', url, headers: { cookie: ada.cookie } });
      const withToken = await app.inject({ method: 'GET', url, headers: bearer(ada.token) });
      expect(withCookie.statusCode, url).toBe(200);
      expect(withToken.statusCode, url).toBe(200);
      expect(withToken.headers['content-type'], url).toBe(withCookie.headers['content-type']);
      expect(withToken.headers['cache-control'], url).toBe(withCookie.headers['cache-control']);
      expect(withToken.rawPayload.equals(withCookie.rawPayload), url).toBe(true);
      expect(withToken.rawPayload.length, url).toBeGreaterThan(0);
    }
  });

  it("answers 404 to another user's token", async () => {
    const { app } = await createTestApp();
    const ada = await createAccount(app, 'ada@example.com', 'Ada');
    const bob = await createAccount(app, 'bob@example.com', 'Bob');
    const { urls } = await createFiles(app, ada.cookie);

    for (const url of urls) {
      expectProblem(await app.inject({ method: 'GET', url, headers: bearer(bob.token) }), 404);
    }
  });

  it('answers 401 without cookie or token', async () => {
    const { app } = await createTestApp();
    const ada = await createAccount(app, 'ada@example.com', 'Ada');
    const { urls } = await createFiles(app, ada.cookie);

    for (const url of urls) {
      expectProblem(await app.inject({ method: 'GET', url }), 401);
    }
  });
});

describe('CORS', () => {
  it('answers preflight from an allowed origin', async () => {
    const { app } = await createTestApp();

    for (const url of ['/api/vehicles', '/api/auth/sign-in/email']) {
      const response = await preflight(app, url, APP_ORIGIN);
      expect(response.statusCode, url).toBe(204);
      expect(response.headers['access-control-allow-origin'], url).toBe(APP_ORIGIN);
      expect(response.headers['access-control-allow-methods'], url).toBe('GET, POST, PUT, PATCH, DELETE');
      expect(response.headers['access-control-allow-headers'], url).toBe('authorization, content-type');
      expect(response.headers['access-control-allow-credentials'], url).toBeUndefined();
    }
  });

  it('adds CORS headers to responses and errors for an allowed origin', async () => {
    const { app } = await createTestApp();
    const ada = await createAccount(app, 'ada@example.com', 'Ada');
    const bob = await createAccount(app, 'bob@example.com', 'Bob');
    const bobVehicle = await createVehicle(app, bearer(bob.token));
    const origin = { origin: APP_ORIGIN };

    const responses: Array<[string, Response, number]> = [
      [
        'me with token',
        await app.inject({ method: 'GET', url: '/api/me', headers: { ...origin, ...bearer(ada.token) } }),
        200,
      ],
      ['me without token', await app.inject({ method: 'GET', url: '/api/me', headers: origin }), 401],
      [
        "another user's vehicle",
        await app.inject({
          method: 'GET',
          url: `/api/vehicles/${bobVehicle}`,
          headers: { ...origin, ...bearer(ada.token) },
        }),
        404,
      ],
      ['sign-in', await signInRequest(app, ada.email, APP_ORIGIN), 200],
    ];

    for (const [name, response, status] of responses) {
      expect(response.statusCode, name).toBe(status);
      expect(response.headers['access-control-allow-origin'], name).toBe(APP_ORIGIN);
      expect(String(response.headers.vary), name).toMatch(/\bOrigin\b/i);
      expect(response.headers['access-control-expose-headers'], name).toBe(
        'set-auth-token, content-disposition',
      );
      expect(response.headers['access-control-allow-credentials'], name).toBeUndefined();
    }
  });

  it('ignores origins outside the list', async () => {
    const { app } = await createTestApp();

    const options = await preflight(app, '/api/vehicles', EVIL_ORIGIN);
    expectProblem(options, 404);
    expect(corsHeaders(options)).toEqual([]);

    const authOptions = await preflight(app, '/api/auth/sign-in/email', EVIL_ORIGIN);
    expect(authOptions.statusCode).toBe(404);
    expect(corsHeaders(authOptions)).toEqual([]);

    const health = await app.inject({ method: 'GET', url: '/api/health', headers: { origin: EVIL_ORIGIN } });
    expect(health.statusCode).toBe(200);
    expect(corsHeaders(health)).toEqual([]);
  });

  it('opens CORS to nobody when TRUSTED_ORIGINS is empty', async () => {
    const { app } = await createTestApp({ TRUSTED_ORIGINS: '' });

    const options = await preflight(app, '/api/vehicles', APP_ORIGIN);
    expect(options.statusCode).toBe(404);
    expect(corsHeaders(options)).toEqual([]);

    const health = await app.inject({ method: 'GET', url: '/api/health', headers: { origin: APP_ORIGIN } });
    expect(health.statusCode).toBe(200);
    expect(corsHeaders(health)).toEqual([]);

    const signedIn = await signInRequest(app, 'nobody@example.com', APP_ORIGIN);
    expect(corsHeaders(signedIn)).toEqual([]);
  });

  it('adds CORS headers to rate-limited responses', async () => {
    const { app } = await createTestApp();
    const headers = { origin: APP_ORIGIN };

    // Same limit as rate-limit.test.ts: 300 requests per minute on /api/*.
    for (let i = 0; i < 300; i++) {
      const response = await app.inject({ method: 'GET', url: '/api/health', headers });
      expect(response.statusCode).toBe(200);
    }

    const limited = await app.inject({ method: 'GET', url: '/api/health', headers });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['access-control-allow-origin']).toBe(APP_ORIGIN);
    expect(limited.headers['access-control-expose-headers']).toBe('set-auth-token, content-disposition');
    expect(limited.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('does not add CORS headers outside /api', async () => {
    const { app } = await createTestApp({ WEB_DIST_DIR: createWebDist() });

    for (const url of ['/', '/assets/app.js']) {
      const response = await app.inject({ method: 'GET', url, headers: { origin: APP_ORIGIN } });
      expect(response.statusCode, url).toBe(200);
      expect(corsHeaders(response), url).toEqual([]);
    }
  });
});

describe('trusted origins', () => {
  it('accepts sign-in from a listed origin', async () => {
    const { app } = await createTestApp();
    await createAccount(app, 'ada@example.com', 'Ada');
    expect((await signInRequest(app, 'ada@example.com', APP_ORIGIN)).statusCode).toBe(200);

    const custom = await createTestApp({ TRUSTED_ORIGINS: 'myapp://ikrive' });
    const { response } = await signUp(custom.app, 'ada@example.com', 'Ada');
    expect(response.statusCode).toBe(200);
    const signedIn = await signInRequest(custom.app, 'ada@example.com', 'myapp://ikrive');
    expect(signedIn.statusCode).toBe(200);
    expect(signedIn.headers['set-auth-token']).toEqual(expect.any(String));
  });

  it('rejects sign-in from other origins', async () => {
    const sessions = (db: Awaited<ReturnType<typeof createTestApp>>['db']) =>
      db.select().from(session).all().length;

    const { app, db } = await createTestApp();
    await signUp(app, 'ada@example.com', 'Ada');
    const before = sessions(db);
    const evil = await signInRequest(app, 'ada@example.com', EVIL_ORIGIN);
    expect(evil.statusCode).toBe(403);
    expect(evil.headers['set-auth-token']).toBeUndefined();
    expect(sessions(db)).toBe(before);

    const closed = await createTestApp({ TRUSTED_ORIGINS: '' });
    await signUp(closed.app, 'ada@example.com', 'Ada');
    const closedBefore = sessions(closed.db);
    const app403 = await signInRequest(closed.app, 'ada@example.com', APP_ORIGIN);
    expect(app403.statusCode).toBe(403);
    expect(app403.headers['set-auth-token']).toBeUndefined();
    expect(sessions(closed.db)).toBe(closedBefore);
  });
});

describe('web', () => {
  it('keeps cookie sessions for the web', async () => {
    const { app } = await createTestApp();
    const { response, cookie } = await signUp(app, 'ada@example.com', 'Ada');
    expect(response.statusCode).toBe(200);
    const signedIn = await signInRequest(app, 'ada@example.com', WEB_ORIGIN);
    expect(signedIn.statusCode).toBe(200);
    const sessionCookie = signedIn.cookies.find((c) => c.name === 'better-auth.session_token');
    expect(sessionCookie).toMatchObject({ httpOnly: true, sameSite: 'Lax' });
    expect(corsHeaders(signedIn)).toEqual([]);

    const { urls } = await createFiles(app, cookie);
    const webCookie = `${sessionCookie?.name}=${sessionCookie?.value}`;
    for (const url of ['/api/me', urls[0] ?? '']) {
      const result = await app.inject({
        method: 'GET',
        url,
        headers: { cookie: webCookie, origin: WEB_ORIGIN },
      });
      expect(result.statusCode, url).toBe(200);
      expect(corsHeaders(result), url).toEqual([]);
    }
  });
});
