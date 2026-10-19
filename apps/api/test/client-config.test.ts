import { describe, expect, it } from 'vitest';
import { createTestApp, signUp } from './helpers';

describe('GET /api/config', () => {
  it('returns the upload limit configured in MAX_UPLOAD_MB', async () => {
    const { app } = await createTestApp({ MAX_UPLOAD_MB: '7' });
    const { cookie } = await signUp(app);
    const response = await app.inject({ method: 'GET', url: '/api/config', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ maxUploadMb: 7 });
  });

  it('requires a session', async () => {
    const { app } = await createTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/config' });
    expect(response.statusCode).toBe(401);
    expect(response.headers['content-type']).toContain('application/problem+json');
  });
});
