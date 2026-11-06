// Default import, as in `lib/tokens.ts`, so the spy replaces what the service calls.
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { PDFDocument } from 'pdf-lib';
import { extractText } from 'unpdf';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportShares } from '../src/db/schema';
import { hashVerifier } from '../src/lib/tokens';
import { createTestApp, signUp } from './helpers';

type TestApp = Awaited<ReturnType<typeof createTestApp>>['app'];

const PLATE = '1234BCD';
const VIN = 'VSSZZZ5FZKR123456';
const DAY_MS = 86_400_000;
const TOKEN_URL = /^http:\/\/localhost:3000\/api\/public\/reports\/([0-9a-f]{80})$/;

interface Share {
  id: string;
  hidePrices: boolean;
  hidePlate: boolean;
  hideVin: boolean;
  includeInvoices: boolean;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  status: 'active' | 'expired' | 'revoked';
  url?: string;
}

async function setup(options: Parameters<typeof createTestApp>[1] = {}) {
  const { app, db } = await createTestApp({}, options);
  const { cookie } = await signUp(app);
  return { app, db, cookie };
}

async function createVehicle(app: TestApp, cookie: string, payload: Record<string, unknown> = {}) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/vehicles',
    headers: { cookie },
    payload: { make: 'Seat', model: 'León', plate: PLATE, vin: VIN, ...payload },
  });
  expect(response.statusCode).toBe(201);
  return response.json() as { id: string };
}

const sharesUrl = (vehicleId: string) => `/api/vehicles/${vehicleId}/report-shares`;

/** Helpers bound to one vehicle of the signed-in user. */
function sharesApi(app: TestApp, cookie: string, vehicleId: string) {
  return {
    create(payload: Record<string, unknown> = {}) {
      return app.inject({ method: 'POST', url: sharesUrl(vehicleId), headers: { cookie }, payload });
    },
    async share(payload: Record<string, unknown> = {}) {
      const response = await this.create(payload);
      expect(response.statusCode).toBe(201);
      const share = response.json() as Share & { url: string };
      const token = TOKEN_URL.exec(share.url)?.[1] ?? '';
      expect(token).toHaveLength(80);
      return { ...share, token, path: new URL(share.url).pathname };
    },
    list() {
      return app.inject({ method: 'GET', url: sharesUrl(vehicleId), headers: { cookie } });
    },
    revoke(shareId: string) {
      return app.inject({ method: 'DELETE', url: `${sharesUrl(vehicleId)}/${shareId}`, headers: { cookie } });
    },
    async addMaintenance(payload: Record<string, unknown>) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/vehicles/${vehicleId}/maintenance`,
        headers: { cookie },
        payload: { category: 'repair', date: '2025-06-15', ...payload },
      });
      expect(response.statusCode).toBe(201);
      return (response.json() as { id: string }).id;
    },
  };
}

/** Public request: never carries a session. */
const fetchPublic = (app: TestApp, path: string) => app.inject({ method: 'GET', url: path });

async function pdfText(pdf: Buffer): Promise<string> {
  const { text } = await extractText(new Uint8Array(pdf), { mergePages: true });
  return text.replace(/[\u00a0\u202f]/g, ' ');
}

const pageCount = async (pdf: Buffer) => (await PDFDocument.load(pdf)).getPageCount();

function multipart(data: Buffer, filename: string) {
  const boundary = '----ikrive-share-boundary';
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        'Content-Type: application/octet-stream\r\n\r\n',
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

const expireShare = (db: Awaited<ReturnType<typeof setup>>['db'], id: string) =>
  db
    .update(reportShares)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(reportShares.id, id))
    .run();

afterEach(() => {
  vi.restoreAllMocks();
});

describe('report shares management', () => {
  it('creates a share', async () => {
    const { app, cookie } = await setup();
    const vehicle = await createVehicle(app, cookie);
    const api = sharesApi(app, cookie, vehicle.id);

    const before = Date.now();
    const share = await api.share({});
    const after = Date.now();

    expect(share).toMatchObject({
      hidePrices: false,
      hidePlate: false,
      hideVin: false,
      includeInvoices: false,
      revokedAt: null,
      status: 'active',
    });
    expect(share.url).toMatch(TOKEN_URL);
    const createdAt = Date.parse(share.createdAt);
    expect(createdAt).toBeGreaterThanOrEqual(before);
    expect(createdAt).toBeLessThanOrEqual(after);
    expect(Date.parse(share.expiresAt)).toBe(createdAt + 30 * DAY_MS);

    const week = await api.share({ expiresInDays: 7, hidePrices: true, includeInvoices: true });
    expect(week).toMatchObject({ hidePrices: true, hidePlate: false, hideVin: false, includeInvoices: true });
    expect(Date.parse(week.expiresAt)).toBe(Date.parse(week.createdAt) + 7 * DAY_MS);
    expect(week.token).not.toBe(share.token);
  });

  it('stores only the selector and the verifier hash', async () => {
    const { app, db, cookie } = await setup();
    const vehicle = await createVehicle(app, cookie);
    const share = await sharesApi(app, cookie, vehicle.id).share({ hidePlate: true });

    const rows = db.select().from(reportShares).all();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    const selector = share.token.slice(0, 16);
    const verifier = share.token.slice(16);
    expect(row).toMatchObject({ id: share.id, vehicleId: vehicle.id, selector, hidePlate: true });
    expect(row?.verifierHash).toBe(hashVerifier(verifier));
    for (const value of Object.values(row ?? {})) {
      expect(String(value)).not.toContain(share.token);
      expect(String(value)).not.toContain(verifier);
    }
  });

  it('rejects invalid shares', async () => {
    const { app, db, cookie } = await setup();
    const vehicle = await createVehicle(app, cookie);
    const api = sharesApi(app, cookie, vehicle.id);

    for (const payload of [
      { expiresInDays: 0 },
      { expiresInDays: 91 },
      { expiresInDays: 1.5 },
      { hideVin: 'true' },
    ]) {
      const response = await api.create(payload);
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
      expect(response.headers['content-type']).toContain('application/problem+json');
    }
    expect(db.select().from(reportShares).all()).toHaveLength(0);
  });

  it('lists the shares without the token', async () => {
    const { app, db, cookie } = await setup();
    const vehicle = await createVehicle(app, cookie);
    const api = sharesApi(app, cookie, vehicle.id);
    const first = await api.share({ hideVin: true });
    const second = await api.share({ hidePrices: true, expiresInDays: 7 });
    const third = await api.share();

    const listed = await api.list();
    expect(listed.statusCode).toBe(200);
    const shares = listed.json() as Share[];
    expect(shares.map((share) => share.id)).toEqual([third.id, second.id, first.id]);
    expect(shares[1]).toEqual({
      id: second.id,
      hidePrices: true,
      hidePlate: false,
      hideVin: false,
      includeInvoices: false,
      expiresAt: second.expiresAt,
      revokedAt: null,
      createdAt: second.createdAt,
      status: 'active',
    });
    for (const share of shares) expect(share).not.toHaveProperty('url');
    for (const { token } of [first, second, third]) {
      expect(listed.body).not.toContain(token);
      expect(listed.body).not.toContain(token.slice(16));
    }

    expireShare(db, first.id);
    expect((await api.revoke(second.id)).statusCode).toBe(204);
    const statuses = ((await api.list()).json() as Share[]).map((share) => [share.id, share.status]);
    expect(statuses).toEqual([
      [third.id, 'active'],
      [second.id, 'revoked'],
      [first.id, 'expired'],
    ]);
  });
});

describe('report shares revocation and authorization', () => {
  it('revokes a share', async () => {
    const { app, cookie } = await setup();
    const vehicle = await createVehicle(app, cookie);
    const api = sharesApi(app, cookie, vehicle.id);
    const share = await api.share();

    const before = Date.now();
    const revoked = await api.revoke(share.id);
    expect(revoked.statusCode).toBe(204);
    expect(revoked.body).toBe('');

    const [listed] = (await api.list()).json() as Share[];
    expect(listed?.status).toBe('revoked');
    expect(Date.parse(listed?.revokedAt ?? '')).toBeGreaterThanOrEqual(before);
  });

  it('revoking twice keeps the first date', async () => {
    const { app, db, cookie } = await setup();
    const vehicle = await createVehicle(app, cookie);
    const api = sharesApi(app, cookie, vehicle.id);
    const share = await api.share();
    expect((await api.revoke(share.id)).statusCode).toBe(204);
    const firstDate = new Date('2026-01-01T00:00:00.000Z');
    db.update(reportShares).set({ revokedAt: firstDate }).where(eq(reportShares.id, share.id)).run();

    expect((await api.revoke(share.id)).statusCode).toBe(204);
    const [listed] = (await api.list()).json() as Share[];
    expect(listed?.revokedAt).toBe(firstDate.toISOString());

    // An expired link can be revoked too.
    const expired = await api.share();
    expireShare(db, expired.id);
    expect((await api.revoke(expired.id)).statusCode).toBe(204);
    expect(((await api.list()).json() as Share[])[0]?.status).toBe('revoked');
  });

  it('requires a session', async () => {
    const { app, cookie } = await setup();
    const vehicle = await createVehicle(app, cookie);
    const share = await sharesApi(app, cookie, vehicle.id).share();

    for (const [method, url] of [
      ['POST', sharesUrl(vehicle.id)],
      ['GET', sharesUrl(vehicle.id)],
      ['DELETE', `${sharesUrl(vehicle.id)}/${share.id}`],
    ] as const) {
      const response = await app.inject({ method, url, payload: method === 'POST' ? {} : undefined });
      expect(response.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it("hides other users' vehicles", async () => {
    const { app, cookie } = await setup();
    const vehicle = await createVehicle(app, cookie);
    const own = sharesApi(app, cookie, vehicle.id);
    const share = await own.share();
    const { cookie: otherCookie } = await signUp(app, 'grace@example.com', 'Grace');
    const other = sharesApi(app, otherCookie, vehicle.id);
    const missing = sharesApi(app, cookie, 'missing-vehicle');

    for (const response of [
      await other.create(),
      await other.list(),
      await other.revoke(share.id),
      await missing.create(),
      await missing.list(),
      await missing.revoke(share.id),
    ]) {
      expect(response.statusCode).toBe(404);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.json()).toMatchObject({ detail: 'Vehicle not found' });
    }

    const [listed] = (await own.list()).json() as Share[];
    expect(listed?.status).toBe('active');
    expect((await fetchPublic(app, share.path)).statusCode).toBe(200);
  });

  it('returns 404 for a share of another vehicle', async () => {
    const { app, cookie } = await setup();
    const first = await createVehicle(app, cookie);
    const second = await createVehicle(app, cookie, { plate: '5678FGH' });
    const share = await sharesApi(app, cookie, first.id).share();
    const secondApi = sharesApi(app, cookie, second.id);

    for (const shareId of [share.id, 'missing-share']) {
      const response = await secondApi.revoke(shareId);
      expect(response.statusCode, shareId).toBe(404);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.json()).toMatchObject({ detail: 'Report share not found' });
    }
    const [listed] = (await sharesApi(app, cookie, first.id).list()).json() as Share[];
    expect(listed?.status).toBe('active');
  });

  it('deletes the shares with the vehicle', async () => {
    const { app, db, cookie } = await setup();
    const vehicle = await createVehicle(app, cookie);
    const kept = await createVehicle(app, cookie, { plate: '5678FGH' });
    await sharesApi(app, cookie, vehicle.id).share();
    await sharesApi(app, cookie, vehicle.id).share();
    const keptShare = await sharesApi(app, cookie, kept.id).share();

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/vehicles/${vehicle.id}`,
      headers: { cookie },
    });
    expect(deleted.statusCode).toBe(204);

    expect(db.select().from(reportShares).where(eq(reportShares.vehicleId, vehicle.id)).all()).toHaveLength(
      0,
    );
    expect(
      db
        .select()
        .from(reportShares)
        .all()
        .map((row) => row.id),
    ).toEqual([keptShare.id]);
  });
});

describe('public sale report', () => {
  it('serves the report without a session', async () => {
    const { app, cookie } = await setup();
    const vehicle = await createVehicle(app, cookie, { name: 'Mi León Ñ' });
    const share = await sharesApi(app, cookie, vehicle.id).share();

    const response = await fetchPublic(app, share.path);
    const owner = await app.inject({
      method: 'GET',
      url: `/api/vehicles/${vehicle.id}/report.pdf`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.rawPayload.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const disposition = String(response.headers['content-disposition']);
    expect(disposition.startsWith('inline;')).toBe(true);
    expect(disposition.replace(/^inline;/, '')).toBe(
      String(owner.headers['content-disposition']).replace(/^attachment;/, ''),
    );
    expect(String(response.headers['cache-control'])).toContain('no-store');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['x-robots-tag']).toBe('noindex');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('applies the stored options', async () => {
    const { app, cookie } = await setup();
    const vehicle = await createVehicle(app, cookie);
    const api = sharesApi(app, cookie, vehicle.id);
    const recordId = await api.addMaintenance({ title: 'Cambio de aceite', cost: 120 });
    const invoice = await PDFDocument.create();
    invoice.addPage([300, 300]);
    const { payload, headers } = multipart(Buffer.from(await invoice.save()), 'factura.pdf');
    const attached = await app.inject({
      method: 'POST',
      url: `/api/vehicles/${vehicle.id}/maintenance/${recordId}/attachments`,
      headers: { cookie, ...headers },
      payload,
    });
    expect(attached.statusCode).toBe(201);

    const plain = await fetchPublic(app, (await api.share()).path);
    const hidden = await fetchPublic(app, (await api.share({ hidePlate: true, hideVin: true })).path);
    const withInvoices = await fetchPublic(app, (await api.share({ includeInvoices: true })).path);
    for (const response of [plain, hidden, withInvoices]) expect(response.statusCode).toBe(200);

    const plainText = await pdfText(plain.rawPayload);
    expect(plainText).toContain(PLATE);
    expect(plainText).toContain(VIN);
    const hiddenText = await pdfText(hidden.rawPayload);
    expect(hiddenText).not.toContain(PLATE);
    expect(hiddenText).not.toContain(VIN);
    expect(await pageCount(withInvoices.rawPayload)).toBe((await pageCount(plain.rawPayload)) + 1);
  });

  it('hides the prices', async () => {
    const { app, cookie } = await setup();
    const vehicle = await createVehicle(app, cookie);
    const api = sharesApi(app, cookie, vehicle.id);
    await api.addMaintenance({ title: 'Cambio de aceite y filtro', cost: 12_345.67 });

    const plain = await fetchPublic(app, (await api.share()).path);
    const hidden = await fetchPublic(app, (await api.share({ hidePrices: true })).path);
    for (const response of [plain, hidden]) expect(response.statusCode).toBe(200);

    const plainText = await pdfText(plain.rawPayload);
    expect(plainText).toContain('12.345,67');
    const hiddenText = await pdfText(hidden.rawPayload);
    expect(hiddenText).not.toContain('12.345,67');
    expect(hiddenText).not.toContain('€');
    expect(hiddenText).toContain('Cambio de aceite y filtro');
  });

  it('reflects the current data', async () => {
    const { app, cookie } = await setup();
    const vehicle = await createVehicle(app, cookie);
    const api = sharesApi(app, cookie, vehicle.id);
    const share = await api.share();
    await api.addMaintenance({ title: 'Sustitución de embrague' });

    const response = await fetchPublic(app, share.path);
    expect(response.statusCode).toBe(200);
    expect(await pdfText(response.rawPayload)).toContain('Sustitución de embrague');
  });
});

describe('public sale report denials', () => {
  it('returns the same 404 for any invalid token', async () => {
    const { app, db, cookie } = await setup();
    const vehicle = await createVehicle(app, cookie);
    const api = sharesApi(app, cookie, vehicle.id);
    const valid = await api.share();
    const expired = await api.share();
    expireShare(db, expired.id);
    const revoked = await api.share();
    expect((await api.revoke(revoked.id)).statusCode).toBe(204);

    const lastChar = valid.token.at(-1) === '0' ? '1' : '0';
    const tokens = {
      malformed: 'not-a-token',
      truncated: valid.token.slice(1),
      unknownSelector: `${'0'.repeat(16)}${valid.token.slice(16)}`,
      tamperedVerifier: `${valid.token.slice(0, -1)}${lastChar}`,
      expired: expired.token,
      revoked: revoked.token,
    };

    const bodies = new Set<string>();
    for (const [reason, token] of Object.entries(tokens)) {
      const response = await fetchPublic(app, `/api/public/reports/${token}`);
      expect(response.statusCode, reason).toBe(404);
      expect(response.headers['content-type'], reason).toContain('application/problem+json');
      bodies.add(response.body);
    }
    expect([...bodies]).toEqual([
      JSON.stringify({ type: 'about:blank', title: 'Not Found', status: 404, detail: 'Report not found' }),
    ]);
    expect((await fetchPublic(app, valid.path)).statusCode).toBe(200);
  });

  it('compares the verifier in constant time', async () => {
    const { app, cookie } = await setup();
    const vehicle = await createVehicle(app, cookie);
    const share = await sharesApi(app, cookie, vehicle.id).share();
    const spy = vi.spyOn(crypto, 'timingSafeEqual');

    expect((await fetchPublic(app, share.path)).statusCode).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('keeps serving archived and sold vehicles', async () => {
    const { app, cookie } = await setup();
    const archived = await createVehicle(app, cookie);
    const sold = await createVehicle(app, cookie, { plate: '5678FGH' });
    const archivedShare = await sharesApi(app, cookie, archived.id).share();
    const soldShare = await sharesApi(app, cookie, sold.id).share();

    for (const [id, payload] of [
      [archived.id, { archived: true }],
      [sold.id, { soldAt: '2026-01-15' }],
    ] as const) {
      const patched = await app.inject({
        method: 'PATCH',
        url: `/api/vehicles/${id}`,
        headers: { cookie },
        payload,
      });
      expect(patched.statusCode).toBe(200);
    }

    for (const share of [archivedShare, soldShare]) {
      const response = await fetchPublic(app, share.path);
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
    }
  });
});

describe('public sale report of a disabled owner', () => {
  /** The admin signs up first (an admin cannot disable themselves); the owner has a vehicle. */
  async function setupOwner() {
    const { app, db } = await createTestApp();
    const admin = await signUp(app, 'admin@example.com', 'Admin');
    const owner = await signUp(app, 'ada@example.com', 'Ada');
    const ownerId = (owner.response.json() as { user: { id: string } }).user.id;
    const vehicle = await createVehicle(app, owner.cookie);
    const api = sharesApi(app, owner.cookie, vehicle.id);
    const setDisabled = async (disabled: boolean) => {
      const action = disabled ? 'disable' : 'enable';
      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/users/${ownerId}/${action}`,
        headers: { cookie: admin.cookie },
      });
      expect(response.statusCode).toBe(200);
    };
    const shareRows = () =>
      db
        .select()
        .from(reportShares)
        .where(eq(reportShares.vehicleId, vehicle.id))
        .orderBy(reportShares.id)
        .all();
    return { app, db, api, setDisabled, shareRows };
  }

  /** A well-formed token whose selector does not exist. */
  const unknownReport = (app: TestApp) =>
    fetchPublic(app, `/api/public/reports/${crypto.randomBytes(40).toString('hex')}`);

  it('returns the same 404 as an unknown token while the owner is disabled', async () => {
    const { app, api, setDisabled } = await setupOwner();
    const share = await api.share();
    expect((await fetchPublic(app, share.path)).statusCode).toBe(200);
    await setDisabled(true);

    const disabled = await fetchPublic(app, share.path);
    const unknown = await unknownReport(app);
    expect(disabled.statusCode).toBe(404);
    expect(disabled.headers['content-type']).toContain('application/problem+json');
    expect(disabled.rawPayload.subarray(0, 5).toString('latin1')).not.toBe('%PDF-');
    expect(disabled.statusCode).toBe(unknown.statusCode);
    expect(disabled.headers['content-type']).toBe(unknown.headers['content-type']);
    expect(disabled.json()).toEqual(unknown.json());
    expect(disabled.json()).toMatchObject({ status: 404, detail: 'Report not found' });
  });

  it('serves active links again with the same token after reactivation', async () => {
    const { app, api, setDisabled } = await setupOwner();
    const first = await api.share();
    const second = await api.share({ hidePrices: true });
    await setDisabled(true);
    for (const share of [first, second]) expect((await fetchPublic(app, share.path)).statusCode).toBe(404);
    await setDisabled(false);

    for (const share of [first, second]) {
      const response = await fetchPublic(app, share.path);
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.rawPayload.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    }
  });

  it('keeps expired and revoked links at 404 after reactivation', async () => {
    const { app, db, api, setDisabled } = await setupOwner();
    const expired = await api.share();
    const revoked = await api.share();
    const active = await api.share();
    await setDisabled(true);
    // The owner has no session while disabled: the link expires and is revoked in the database.
    expireShare(db, expired.id);
    db.update(reportShares).set({ revokedAt: new Date() }).where(eq(reportShares.id, revoked.id)).run();
    await setDisabled(false);

    for (const share of [expired, revoked]) {
      const response = await fetchPublic(app, share.path);
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ detail: 'Report not found' });
    }
    expect((await fetchPublic(app, active.path)).statusCode).toBe(200);
  });

  it('keeps the share rows when disabling and enabling the owner', async () => {
    const { db, api, setDisabled, shareRows } = await setupOwner();
    await api.share();
    const expired = await api.share();
    expireShare(db, expired.id);
    const revoked = await api.share();
    expect((await api.revoke(revoked.id)).statusCode).toBe(204);
    const before = shareRows();
    expect(before).toHaveLength(3);

    await setDisabled(true);
    expect(shareRows()).toEqual(before);
    await setDisabled(false);
    expect(shareRows()).toEqual(before);
  });

  it('sends no-store on public report 404s', async () => {
    const { app, api, setDisabled } = await setupOwner();
    const share = await api.share();
    const responses = [await unknownReport(app), await fetchPublic(app, '/api/public/reports/not-a-token')];
    await setDisabled(true);
    responses.push(await fetchPublic(app, share.path));

    for (const response of responses) {
      expect(response.statusCode).toBe(404);
      expect(response.headers['cache-control']).toBe('private, no-store');
    }
  });
});

describe('public sale report limits and logs', () => {
  it('rate limits the public report', async () => {
    const { app } = await setup();
    for (let i = 0; i < 10; i++) {
      expect((await fetchPublic(app, `/api/public/reports/bad-${i}`)).statusCode).toBe(404);
    }
    expect((await fetchPublic(app, '/api/public/reports/bad-10')).statusCode).toBe(429);
  });

  it('never logs the share token', async () => {
    const lines: string[] = [];
    const { app, cookie } = await setup({ logStream: { write: (line: string) => lines.push(line) } });
    const vehicle = await createVehicle(app, cookie);
    const share = await sharesApi(app, cookie, vehicle.id).share();

    expect((await fetchPublic(app, share.path)).statusCode).toBe(200);

    const output = lines.join('');
    expect(output).toContain('/api/public/reports/');
    expect(output).not.toContain(share.token);
    expect(output).not.toContain(share.token.slice(16));
  });
});
