import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { createTestApp, signUp, TEST_BASE_URL } from './helpers';

type TestApp = Awaited<ReturnType<typeof createTestApp>>['app'];
type Response = Awaited<ReturnType<TestApp['inject']>>;

const PASSWORD = 'correct-horse-battery';
const NATIVE = 'capacitor://localhost';
const EVIL = 'https://evil.example';

const expectProblem = (response: Response, status: number) => {
  expect(response.statusCode, response.body).toBe(status);
  expect(response.headers['content-type']).toContain('application/problem+json');
  expect(response.json()).toMatchObject({ status });
};

/** Names of the `access-control-*` headers of a response. */
const corsHeaders = (response: Response) =>
  Object.keys(response.headers).filter((name) => name.startsWith('access-control-'));

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

const signIn = (app: TestApp, email: string, origin = NATIVE) =>
  app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin },
    payload: { email, password: PASSWORD },
  });

/** Signs in from the native app and returns the signed token of `set-auth-token`. */
async function nativeToken(app: TestApp, email: string) {
  const response = await signIn(app, email);
  expect(response.statusCode, response.body).toBe(200);
  const token = response.headers['set-auth-token'];
  expect(typeof token).toBe('string');
  return token as string;
}

/** Signs up an account (the first one is the admin) and signs it in from the native app. */
async function createAccount(app: TestApp, email: string, name: string) {
  const { response, cookie } = await signUp(app, email, name);
  expect(response.statusCode).toBe(200);
  const id = (response.json() as { user: { id: string } }).user.id;
  return { id, email, cookie, token: await nativeToken(app, email) };
}

const me = (app: TestApp, headers: Record<string, string>) =>
  app.inject({ method: 'GET', url: '/api/me', headers });

async function createVehicle(app: TestApp, token: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/vehicles',
    headers: bearer(token),
    payload: { make: 'Seat', model: 'León' },
  });
  expect(response.statusCode).toBe(201);
  return (response.json() as { id: string }).id;
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

const pdf = () =>
  Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');

/** Uploads, with the token, a vehicle photo plus a PDF and an image invoice; returns the file URLs. */
async function createFiles(app: TestApp, token: string) {
  const vehicleId = await createVehicle(app, token);
  const photo = multipart(await png(), 'photo.png', 'image/png');
  const uploaded = await app.inject({
    method: 'PUT',
    url: `/api/vehicles/${vehicleId}/photo`,
    headers: { ...bearer(token), ...photo.headers },
    payload: photo.payload,
  });
  expect(uploaded.statusCode).toBe(200);

  const record = await app.inject({
    method: 'POST',
    url: `/api/vehicles/${vehicleId}/maintenance`,
    headers: bearer(token),
    payload: { date: '2025-05-10', category: 'oil_change', title: 'Cambio de aceite' },
  });
  expect(record.statusCode).toBe(201);
  const base = `/api/vehicles/${vehicleId}/maintenance/${(record.json() as { id: string }).id}/attachments`;

  const attach = async (data: Buffer, filename: string, mimetype: string) => {
    const body = multipart(data, filename, mimetype);
    const response = await app.inject({
      method: 'POST',
      url: base,
      headers: { ...bearer(token), ...body.headers },
      payload: body.payload,
    });
    expect(response.statusCode).toBe(201);
    return `${base}/${(response.json() as { id: string }).id}`;
  };
  const invoice = await attach(pdf(), 'Factura taller.pdf', 'application/pdf');
  const ticket = await attach(await png(), 'ticket.png', 'image/png');

  return {
    photo: `/api/vehicles/${vehicleId}/photo`,
    download: invoice,
    view: `${invoice}?inline=1`,
    thumbnail: `${ticket}/thumbnail`,
  };
}

/** Creates a minimal built SPA to serve from WEB_DIST_DIR. */
function createWebDist() {
  const dir = mkdtempSync(join(tmpdir(), 'ikrive-web-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Ikrive</title>');
  return dir;
}

const preflight = (app: TestApp, origin: string, url = '/api/vehicles') =>
  app.inject({
    method: 'OPTIONS',
    url,
    headers: {
      origin,
      'access-control-request-method': 'PUT',
      'access-control-request-headers': 'authorization,content-type',
    },
  });

describe('bearer session', () => {
  it('returns a signed token in set-auth-token on sign-in', async () => {
    const { app } = await createTestApp();
    await signUp(app);

    const response = await signIn(app, 'ada@example.com');
    expect(response.statusCode).toBe(200);
    const token = response.headers['set-auth-token'];
    const { token: unsigned } = response.json() as { token: string };
    // `<session token>.<HMAC signature>`
    expect(token).toMatch(new RegExp(`^${unsigned}\\.[^.]+$`));
  });

  it('authenticates protected and admin routes with the bearer token', async () => {
    const { app } = await createTestApp();
    const admin = await createAccount(app, 'admin@example.com', 'Admin');
    const bob = await createAccount(app, 'bob@example.com', 'Bob');

    const current = await me(app, bearer(bob.token));
    expect(current.statusCode).toBe(200);
    expect(current.json()).toMatchObject({ id: bob.id, email: 'bob@example.com' });

    const vehicleId = await createVehicle(app, bob.token);
    const vehicles = await app.inject({ method: 'GET', url: '/api/vehicles', headers: bearer(bob.token) });
    expect(vehicles.statusCode).toBe(200);
    expect(vehicles.json().map((vehicle: { id: string }) => vehicle.id)).toEqual([vehicleId]);

    const users = await app.inject({ method: 'GET', url: '/api/admin/users', headers: bearer(admin.token) });
    expect(users.statusCode).toBe(200);
    expect(users.json()).toHaveLength(2);
    // The role comes from the token's session too: a user is still not an admin.
    expectProblem(
      await app.inject({ method: 'GET', url: '/api/admin/users', headers: bearer(bob.token) }),
      403,
    );
  });

  it('invalidates the token on sign-out', async () => {
    const { app } = await createTestApp();
    const ada = await createAccount(app, 'ada@example.com', 'Ada');
    expect((await me(app, bearer(ada.token))).statusCode).toBe(200);

    const signOut = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: { ...bearer(ada.token), origin: NATIVE },
    });
    expect(signOut.statusCode).toBe(200);

    expectProblem(await me(app, bearer(ada.token)), 401);
    // Other sessions of the account (the web cookie) are untouched.
    expect((await me(app, { cookie: ada.cookie })).statusCode).toBe(200);
  });

  it('rejects malformed, forged and unsigned tokens with 401', async () => {
    const { app } = await createTestApp();
    await signUp(app);
    const response = await signIn(app, 'ada@example.com');
    const token = response.headers['set-auth-token'] as string;
    const { token: unsigned } = response.json() as { token: string };
    const signature = token.slice(token.indexOf('.') + 1);
    const forged = `${unsigned}.${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`;

    for (const authorization of [
      'Bearer not-a-token',
      'Bearer a.b',
      'Bearer ',
      `Bearer ${unsigned}`,
      `Bearer ${forged}`,
      `Basic ${token}`,
    ]) {
      const rejected = await me(app, { authorization });
      expectProblem(rejected, 401);
    }
    expect((await me(app, bearer(token))).statusCode).toBe(200);
  });

  it('keeps cookie sign-in working for the web', async () => {
    const { app } = await createTestApp();
    await signUp(app);

    const response = await signIn(app, 'ada@example.com', TEST_BASE_URL);
    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    const cookie = response.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    expect(cookie).toContain('better-auth.session_token=');

    const current = await me(app, { cookie, origin: TEST_BASE_URL });
    expect(current.statusCode).toBe(200);
    expect(current.json()).toMatchObject({ email: 'ada@example.com' });
    expect(corsHeaders(current)).toEqual([]);
  });
});

describe('CORS', () => {
  it('answers allowed origins with CORS headers, also on errors', async () => {
    const { app } = await createTestApp();
    const ada = await createAccount(app, 'ada@example.com', 'Ada');

    const ok = await me(app, { ...bearer(ada.token), origin: NATIVE });
    const unauthorized = await me(app, { origin: NATIVE });
    expect(ok.statusCode).toBe(200);
    expectProblem(unauthorized, 401);
    for (const response of [ok, unauthorized]) {
      expect(response.headers['access-control-allow-origin']).toBe(NATIVE);
      expect(response.headers.vary).toContain('Origin');
      expect(response.headers['access-control-expose-headers']).toBe('set-auth-token, content-disposition');
      expect(response.headers['access-control-allow-credentials']).toBeUndefined();
    }
  });

  it('keeps both exposed headers on Better Auth responses that create a session', async () => {
    const { app } = await createTestApp();
    await createAccount(app, 'ada@example.com', 'Ada');

    const native = await signIn(app, 'ada@example.com');
    expect(native.statusCode, native.body).toBe(200);
    expect(native.headers['access-control-allow-origin']).toBe(NATIVE);
    expect(native.headers['access-control-expose-headers']).toBe('set-auth-token, content-disposition');
    expect(native.headers['access-control-allow-credentials']).toBeUndefined();

    // Same-origin web sign-in: unchanged, only Better Auth's own header and no CORS allow-origin.
    const web = await signIn(app, 'ada@example.com', TEST_BASE_URL);
    expect(web.statusCode, web.body).toBe(200);
    expect(web.headers['access-control-allow-origin']).toBeUndefined();
    expect(web.headers['access-control-expose-headers']).toBe('set-auth-token');
  });

  it('answers the preflight of an allowed origin with 204', async () => {
    const { app } = await createTestApp();

    const response = await preflight(app, NATIVE);
    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(NATIVE);
    expect(response.headers['access-control-allow-methods']).toBe('GET, POST, PUT, PATCH, DELETE');
    expect(response.headers['access-control-allow-headers']).toBe('authorization, content-type');
    expect(response.headers['access-control-max-age']).toBe('600');
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('sends no CORS headers to other origins', async () => {
    const { app } = await createTestApp();
    const ada = await createAccount(app, 'ada@example.com', 'Ada');

    const simple = await me(app, { ...bearer(ada.token), origin: EVIL });
    expect(simple.statusCode).toBe(200);
    expect(corsHeaders(simple)).toEqual([]);

    const options = await preflight(app, EVIL);
    expectProblem(options, 404);
    expect(corsHeaders(options)).toEqual([]);
  });

  it('sends no CORS headers outside /api', async () => {
    const { app } = await createTestApp({ WEB_DIST_DIR: createWebDist() });

    for (const url of ['/', '/vehicles/123']) {
      const page = await app.inject({ method: 'GET', url, headers: { origin: NATIVE } });
      expect(page.statusCode).toBe(200);
      expect(corsHeaders(page)).toEqual([]);
    }
    const options = await preflight(app, NATIVE, '/vehicles/123');
    expectProblem(options, 404);
    expect(corsHeaders(options)).toEqual([]);
  });
});

describe('trusted origins', () => {
  it('accepts sign-in from a native origin', async () => {
    const { app } = await createTestApp();
    await signUp(app);

    for (const origin of ['capacitor://localhost', 'https://localhost']) {
      const response = await signIn(app, 'ada@example.com', origin);
      expect(response.statusCode, origin).toBe(200);
      expect(response.headers['set-auth-token']).toEqual(expect.any(String));
    }
  });

  it('rejects sign-in from an untrusted origin with 403', async () => {
    const { app } = await createTestApp();
    await signUp(app);

    for (const origin of [EVIL, 'capacitor://evil', 'http://localhost']) {
      const response = await signIn(app, 'ada@example.com', origin);
      expect(response.statusCode, origin).toBe(403);
      expect(response.headers['set-auth-token']).toBeUndefined();
    }
  });
});

describe('CORS_ORIGINS config', () => {
  it('uses the Capacitor origins by default', () => {
    expect(loadConfig({}).CORS_ORIGINS).toEqual(['capacitor://localhost', 'https://localhost']);
  });

  it('trusts no extra origin when empty', async () => {
    expect(loadConfig({ CORS_ORIGINS: '' }).CORS_ORIGINS).toEqual([]);
    const { app } = await createTestApp({ CORS_ORIGINS: '' });
    await signUp(app);

    const simple = await app.inject({ method: 'GET', url: '/api/health', headers: { origin: NATIVE } });
    expect(simple.statusCode).toBe(200);
    expect(corsHeaders(simple)).toEqual([]);
    const options = await preflight(app, NATIVE);
    expectProblem(options, 404);
    expect(corsHeaders(options)).toEqual([]);

    const signedIn = await signIn(app, 'ada@example.com', NATIVE);
    expect(signedIn.statusCode).toBe(403);
    expect(signedIn.headers['set-auth-token']).toBeUndefined();
    // The web keeps working from BASE_URL.
    expect((await signIn(app, 'ada@example.com', TEST_BASE_URL)).statusCode).toBe(200);
  });

  it('accepts a custom list', async () => {
    const list = ' https://app.example:8443 , capacitor://localhost ,';
    expect(loadConfig({ CORS_ORIGINS: list }).CORS_ORIGINS).toEqual([
      'https://app.example:8443',
      'capacitor://localhost',
    ]);

    const { app } = await createTestApp({ CORS_ORIGINS: list });
    await signUp(app);
    const allowed = await preflight(app, 'https://app.example:8443');
    expect(allowed.statusCode).toBe(204);
    expect(allowed.headers['access-control-allow-origin']).toBe('https://app.example:8443');
    // `https://localhost` is only a default: a custom list replaces it.
    expectProblem(await preflight(app, 'https://localhost'), 404);
    expect((await signIn(app, 'ada@example.com', 'https://app.example:8443')).statusCode).toBe(200);
    expect((await signIn(app, 'ada@example.com', 'https://localhost')).statusCode).toBe(403);
  });

  it('rejects invalid origins', () => {
    for (const value of [
      '*',
      'example.com',
      'https://a.example/',
      'https://a.example/path',
      'capacitor://localhost,*',
    ]) {
      expect(() => loadConfig({ CORS_ORIGINS: value }), value).toThrow(
        /Invalid configuration[\s\S]*CORS_ORIGINS/,
      );
    }
  });
});

describe('files with a bearer token', () => {
  it('serves photo, thumbnail and invoice to the owner', async () => {
    const { app } = await createTestApp();
    const ada = await createAccount(app, 'ada@example.com', 'Ada');
    const files = await createFiles(app, ada.token);

    const expected = {
      photo: { type: 'image/webp', disposition: undefined },
      download: { type: 'application/pdf', disposition: /^attachment; filename="Factura taller.pdf"/ },
      view: { type: 'application/pdf', disposition: /^inline; filename="Factura taller.pdf"/ },
      thumbnail: { type: 'image/webp', disposition: undefined },
    };
    for (const [name, url] of Object.entries(files) as [keyof typeof files, string][]) {
      const withToken = await app.inject({ method: 'GET', url, headers: bearer(ada.token) });
      const withCookie = await app.inject({ method: 'GET', url, headers: { cookie: ada.cookie } });
      expect(withToken.statusCode, name).toBe(200);
      expect(withToken.headers['content-type'], name).toBe(expected[name].type);
      const { disposition } = expected[name];
      if (disposition) expect(withToken.headers['content-disposition'], name).toMatch(disposition);
      // Same file and headers as the web gets with its cookie.
      expect(withToken.headers['content-type'], name).toBe(withCookie.headers['content-type']);
      expect(withToken.headers['content-disposition'], name).toBe(withCookie.headers['content-disposition']);
      expect(withToken.rawPayload.equals(withCookie.rawPayload), name).toBe(true);
    }
  });

  it("answers 404 to another user's token", async () => {
    const { app } = await createTestApp();
    const ada = await createAccount(app, 'ada@example.com', 'Ada');
    const bob = await createAccount(app, 'bob@example.com', 'Bob');
    const files = await createFiles(app, ada.token);

    for (const url of Object.values(files)) {
      expectProblem(await app.inject({ method: 'GET', url, headers: bearer(bob.token) }), 404);
    }
  });

  it('answers 401 without a token', async () => {
    const { app } = await createTestApp();
    const ada = await createAccount(app, 'ada@example.com', 'Ada');
    const files = await createFiles(app, ada.token);

    expectProblem(await app.inject({ method: 'GET', url: files.photo, headers: { origin: NATIVE } }), 401);
  });
});

describe('disabled accounts', () => {
  it('rejects the tokens of a disabled account, also after re-enabling it', async () => {
    const { app } = await createTestApp();
    const admin = await createAccount(app, 'admin@example.com', 'Admin');
    const bob = await createAccount(app, 'bob@example.com', 'Bob');
    const files = await createFiles(app, bob.token);
    const photo = () => app.inject({ method: 'GET', url: files.photo, headers: bearer(bob.token) });
    expect((await photo()).statusCode).toBe(200);

    const disabled = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${bob.id}/disable`,
      headers: bearer(admin.token),
    });
    expect(disabled.statusCode).toBe(200);
    expectProblem(await me(app, bearer(bob.token)), 401);
    expectProblem(await photo(), 401);

    const enabled = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${bob.id}/enable`,
      headers: bearer(admin.token),
    });
    expect(enabled.statusCode).toBe(200);
    expectProblem(await me(app, bearer(bob.token)), 401);
    expectProblem(await photo(), 401);
  });

  it('does not issue a token to a disabled account', async () => {
    const { app } = await createTestApp();
    const admin = await createAccount(app, 'admin@example.com', 'Admin');
    const bob = await createAccount(app, 'bob@example.com', 'Bob');
    await app.inject({
      method: 'POST',
      url: `/api/admin/users/${bob.id}/disable`,
      headers: bearer(admin.token),
    });

    const response = await signIn(app, 'bob@example.com');
    expect(response.statusCode).toBe(403);
    expect(response.headers['set-auth-token']).toBeUndefined();
  });
});
