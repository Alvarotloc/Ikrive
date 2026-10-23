import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTestApp } from './helpers';

const MAX = 300;

/** Creates a minimal built SPA (index.html + one asset) to serve from WEB_DIST_DIR. */
function createWebDist() {
  const dir = mkdtempSync(join(tmpdir(), 'ikrive-web-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Ikrive</title>');
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log("ikrive");');
  return dir;
}

describe('rate limit', () => {
  it('does not count or limit SPA static files and client-route fallback', async () => {
    const { app } = await createTestApp({ WEB_DIST_DIR: createWebDist() });
    const urls = ['/', '/index.html', '/assets/app.js', '/vehicles/123'];

    for (let i = 0; i < MAX + 20; i++) {
      for (const url of urls) {
        const response = await app.inject({ method: 'GET', url });
        expect(response.statusCode, `${url} #${i}`).toBe(200);
        expect(response.headers['x-ratelimit-limit']).toBeUndefined();
      }
    }

    // Static traffic did not consume the API budget.
    const api = await app.inject({ method: 'GET', url: '/api/health' });
    expect(api.statusCode).toBe(200);
    expect(api.headers['x-ratelimit-remaining']).toBe(String(MAX - 1));
  });

  it('still limits /api routes and answers 429 past the maximum', async () => {
    const { app } = await createTestApp({ WEB_DIST_DIR: createWebDist() });

    for (let i = 0; i < MAX; i++) {
      const response = await app.inject({ method: 'GET', url: '/api/health' });
      expect(response.statusCode).toBe(200);
    }

    const limited = await app.inject({ method: 'GET', url: '/api/health' });
    expect(limited.statusCode).toBe(429);

    // The SPA keeps loading even when the API budget is exhausted.
    const page = await app.inject({ method: 'GET', url: '/assets/app.js' });
    expect(page.statusCode).toBe(200);
  });
});
