import { describe, expect, it } from 'vitest';
import { createTestApp, signUp } from './helpers';

describe('GET /api/config', () => {
  it('returns the upload limit and flags a local BASE_URL', async () => {
    // `createTestApp` uses `BASE_URL=http://localhost:3000`.
    const { app } = await createTestApp({ MAX_UPLOAD_MB: '7' });
    const { cookie } = await signUp(app);
    const response = await app.inject({ method: 'GET', url: '/api/config', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ maxUploadMb: 7, localBaseUrl: true });
  });

  it('does not flag a public BASE_URL', async () => {
    const { app } = await createTestApp({ BASE_URL: 'https://ikrive.example.com' });
    const { cookie } = await signUp(app);
    const response = await app.inject({ method: 'GET', url: '/api/config', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ localBaseUrl: false });
  });

  it('requires a session', async () => {
    const { app } = await createTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/config' });
    expect(response.statusCode).toBe(401);
    expect(response.headers['content-type']).toContain('application/problem+json');
  });
});
