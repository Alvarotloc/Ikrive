import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { createTestApp, signUp } from './helpers';

type TestApp = Awaited<ReturnType<typeof createTestApp>>['app'];

const leon = { make: 'Seat', model: 'León', version: 'FR 1.5 TSI', year: 2019, plate: '5432 mvr' };

async function createVehicle(app: TestApp, cookie: string, payload: Record<string, unknown> = leon) {
  const response = await app.inject({ method: 'POST', url: '/api/vehicles', headers: { cookie }, payload });
  expect(response.statusCode).toBe(201);
  return response.json();
}

function multipart(file: Buffer, filename = 'photo.png', mimetype = 'image/png') {
  const boundary = '----ikrive-test-boundary';
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimetype}\r\n\r\n`,
    ),
    file,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

const png = () =>
  sharp({ create: { width: 64, height: 32, channels: 3, background: '#c5e8e0' } })
    .png()
    .toBuffer();

describe('vehicles', () => {
  it('rejects unauthenticated requests', async () => {
    const { app } = await createTestApp();
    expect((await app.inject({ method: 'GET', url: '/api/vehicles' })).statusCode).toBe(401);
  });

  it('creates, reads, updates and deletes a vehicle', async () => {
    const { app } = await createTestApp();
    const { cookie } = await signUp(app);

    const created = await createVehicle(app, cookie, { ...leon, currentOdometer: 132_480, notes: '  ' });
    expect(created).toMatchObject({
      make: 'Seat',
      plate: '5432 MVR',
      type: 'car',
      fuelType: 'gasoline',
      notes: null,
      status: 'active',
      photoUrl: null,
      odometer: { value: 132_480 },
    });

    const list = await app.inject({ method: 'GET', url: '/api/vehicles', headers: { cookie } });
    expect(list.json()).toHaveLength(1);

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/vehicles/${created.id}`,
      headers: { cookie },
      payload: { name: 'El León', fuelType: 'diesel' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ name: 'El León', fuelType: 'diesel', make: 'Seat' });

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/vehicles/${created.id}`,
      headers: { cookie },
    });
    expect(deleted.statusCode).toBe(204);
    const gone = await app.inject({ method: 'GET', url: `/api/vehicles/${created.id}`, headers: { cookie } });
    expect(gone.statusCode).toBe(404);
  });

  it('validates the payload', async () => {
    const { app } = await createTestApp();
    const { cookie } = await signUp(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/vehicles',
      headers: { cookie },
      payload: { model: 'León', year: 1500 },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().errors.map((e: { path: string }) => e.path)).toEqual(
      expect.arrayContaining(['make', 'year']),
    );
  });

  it('archives and marks vehicles as sold, filtering the list by status', async () => {
    const { app } = await createTestApp();
    const { cookie } = await signUp(app);
    const archived = await createVehicle(app, cookie);
    const sold = await createVehicle(app, cookie, { make: 'Honda', model: 'CB500F', type: 'motorcycle' });
    await createVehicle(app, cookie, { make: 'Renault', model: 'Zoe', fuelType: 'electric' });

    const patch = (id: string, payload: object) =>
      app.inject({ method: 'PATCH', url: `/api/vehicles/${id}`, headers: { cookie }, payload });
    expect((await patch(archived.id, { archived: true })).json()).toMatchObject({ status: 'archived' });
    expect((await patch(sold.id, { soldAt: '2025-03-01' })).json()).toMatchObject({ status: 'sold' });

    const list = async (status: string) =>
      (await app.inject({ method: 'GET', url: `/api/vehicles?status=${status}`, headers: { cookie } }))
        .json()
        .map((v: { make: string }) => v.make);
    expect(await list('active')).toEqual(['Renault']);
    expect(await list('archived')).toEqual(['Seat']);
    expect(await list('sold')).toEqual(['Honda']);
    expect(await list('all')).toHaveLength(3);

    expect((await patch(archived.id, { archived: false })).json()).toMatchObject({
      status: 'active',
      archivedAt: null,
    });
  });

  it('keeps the odometer monotonic', async () => {
    const { app } = await createTestApp();
    const { cookie } = await signUp(app);
    const vehicle = await createVehicle(app, cookie);
    const url = `/api/vehicles/${vehicle.id}/odometer`;
    const add = (date: string, value: number) =>
      app.inject({ method: 'POST', url, headers: { cookie }, payload: { date, value } });

    expect((await add('2024-01-10', 10_000)).statusCode).toBe(201);
    const second = await add('2024-06-10', 15_000);
    expect(second.statusCode).toBe(201);
    expect((await add('2024-03-01', 12_000)).statusCode).toBe(201);

    const backwards = await add('2024-07-01', 14_000);
    expect(backwards.statusCode).toBe(409);
    expect(backwards.json().detail).toContain('15000');
    expect((await add('2024-02-01', 13_000)).statusCode).toBe(409);
    expect((await add('2999-01-01', 99_000)).statusCode).toBe(400);

    const readings = await app.inject({ method: 'GET', url, headers: { cookie } });
    expect(readings.json().map((r: { value: number }) => r.value)).toEqual([15_000, 12_000, 10_000]);

    const current = await app.inject({
      method: 'GET',
      url: `/api/vehicles/${vehicle.id}`,
      headers: { cookie },
    });
    expect(current.json().odometer).toEqual({ value: 15_000, date: '2024-06-10' });

    const removed = await app.inject({
      method: 'DELETE',
      url: `${url}/${second.json().id}`,
      headers: { cookie },
    });
    expect(removed.statusCode).toBe(204);
    expect((await add('2024-07-01', 14_000)).statusCode).toBe(201);
  });

  it('refuses to delete readings owned by a record', async () => {
    const { app } = await createTestApp();
    const { cookie } = await signUp(app);
    const vehicle = await createVehicle(app, cookie);
    const base = `/api/vehicles/${vehicle.id}`;
    const record = await app.inject({
      method: 'POST',
      url: `${base}/maintenance`,
      headers: { cookie },
      payload: { date: '2024-05-10', odometer: 45_000, category: 'oil_change', title: 'Aceite' },
    });
    expect(record.statusCode).toBe(201);
    const readings = async () =>
      (await app.inject({ method: 'GET', url: `${base}/odometer`, headers: { cookie } })).json();
    const [reading] = await readings();
    expect(reading).toMatchObject({ value: 45_000, source: 'maintenance' });

    const removed = await app.inject({
      method: 'DELETE',
      url: `${base}/odometer/${reading.id}`,
      headers: { cookie },
    });
    expect(removed.statusCode).toBe(409);
    expect(removed.headers['content-type']).toContain('application/problem+json');
    expect(await readings()).toEqual([reading]);
  });

  it('stores the photo as WebP and removes the file with the vehicle', async () => {
    const { app, dataDir } = await createTestApp();
    const { cookie } = await signUp(app);
    const vehicle = await createVehicle(app, cookie);
    const photoDir = join(dataDir, 'uploads', 'vehicles');

    const upload = (file: Buffer) => {
      const { payload, headers } = multipart(file);
      return app.inject({
        method: 'PUT',
        url: `/api/vehicles/${vehicle.id}/photo`,
        payload,
        headers: { ...headers, cookie },
      });
    };

    expect((await upload(Buffer.from('not an image'))).statusCode).toBe(400);
    const uploaded = await upload(await png());
    expect(uploaded.statusCode).toBe(200);
    const { photoUrl } = uploaded.json();
    expect(photoUrl).toMatch(new RegExp(`^/api/vehicles/${vehicle.id}/photo\\?v=`));

    const photo = await app.inject({ method: 'GET', url: photoUrl, headers: { cookie } });
    expect(photo.statusCode).toBe(200);
    expect(photo.headers['content-type']).toBe('image/webp');
    expect((await sharp(photo.rawPayload).metadata()).format).toBe('webp');
    expect(readdirSync(photoDir)).toHaveLength(1);

    await app.inject({ method: 'DELETE', url: `/api/vehicles/${vehicle.id}`, headers: { cookie } });
    expect(existsSync(photoDir) ? readdirSync(photoDir) : []).toHaveLength(0);
  });

  it("does not let a user access another user's vehicles", async () => {
    const { app } = await createTestApp();
    const owner = await signUp(app, 'owner@example.com');
    const intruder = await signUp(app, 'intruder@example.com');
    const vehicle = await createVehicle(app, owner.cookie, { ...leon, currentOdometer: 1_000 });
    const readingId = (
      await app.inject({
        method: 'GET',
        url: `/api/vehicles/${vehicle.id}/odometer`,
        headers: { cookie: owner.cookie },
      })
    ).json()[0].id;

    const asIntruder = { cookie: intruder.cookie };
    const list = await app.inject({ method: 'GET', url: '/api/vehicles?status=all', headers: asIntruder });
    expect(list.json()).toEqual([]);

    const base = `/api/vehicles/${vehicle.id}`;
    const photo = multipart(await png());
    const attempts = [
      { method: 'GET', url: base },
      { method: 'PATCH', url: base, payload: { make: 'Hacked' } },
      { method: 'DELETE', url: base },
      { method: 'GET', url: `${base}/photo` },
      { method: 'DELETE', url: `${base}/photo` },
      { method: 'PUT', url: `${base}/photo`, payload: photo.payload, headers: photo.headers },
      { method: 'GET', url: `${base}/odometer` },
      { method: 'POST', url: `${base}/odometer`, payload: { date: '2024-01-01', value: 2_000 } },
      { method: 'DELETE', url: `${base}/odometer/${readingId}` },
    ] as const;
    for (const attempt of attempts) {
      const headers = { ...('headers' in attempt ? attempt.headers : {}), ...asIntruder };
      const response = await app.inject({ ...attempt, headers });
      expect(response.statusCode, `${attempt.method} ${attempt.url}`).toBe(404);
    }

    const intact = await app.inject({ method: 'GET', url: base, headers: { cookie: owner.cookie } });
    expect(intact.json()).toMatchObject({ make: 'Seat', odometer: { value: 1_000 } });
  });
});
