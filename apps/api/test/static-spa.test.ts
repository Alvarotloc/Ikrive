import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTestApp } from './helpers';

/** Creates a minimal built PWA (app shell, service worker, manifest and one asset) to serve from WEB_DIST_DIR. */
function createWebDist() {
  const dir = mkdtempSync(join(tmpdir(), 'ikrive-web-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Ikrive</title>');
  writeFileSync(join(dir, 'sw.js'), 'self.addEventListener("fetch", () => {});');
  writeFileSync(join(dir, 'manifest.webmanifest'), JSON.stringify({ name: 'Ikrive' }));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log("ikrive");');
  return dir;
}

describe('static SPA', () => {
  it('serves sw.js, the manifest and index.html with no-cache', async () => {
    const { app } = await createTestApp({ WEB_DIST_DIR: createWebDist() });

    for (const url of ['/sw.js', '/manifest.webmanifest', '/index.html', '/']) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(200);
      expect(response.headers['cache-control'], url).toBe('no-cache');
    }

    // Hashed assets keep the default caching.
    const asset = await app.inject({ method: 'GET', url: '/assets/app.js' });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['cache-control']).toBe('public, max-age=0');
  });

  it('serves the SPA fallback with no-cache', async () => {
    const { app } = await createTestApp({ WEB_DIST_DIR: createWebDist() });

    const response = await app.inject({ method: 'GET', url: '/vehicles/123' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('<title>Ikrive</title>');
    expect(response.headers['cache-control']).toBe('no-cache');
  });

  it('serves the manifest as application/manifest+json', async () => {
    const { app } = await createTestApp({ WEB_DIST_DIR: createWebDist() });

    const response = await app.inject({ method: 'GET', url: '/manifest.webmanifest' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/manifest\+json/);
    expect(response.json()).toEqual({ name: 'Ikrive' });
  });
});
