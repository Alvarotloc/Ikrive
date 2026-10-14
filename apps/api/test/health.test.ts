import { describe, expect, it } from 'vitest';
import { createTestApp } from './helpers';

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const { app } = await createTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok' });
  });

  it('returns problem details for unknown API routes', async () => {
    const { app } = await createTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
  });
});
