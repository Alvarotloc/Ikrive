import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { API_PATH, pwaManifest, pwaWorkbox } from './config';

/** Width and height from the IHDR chunk of a PNG in `public/`. */
function pngSize(src: string) {
  const png = readFileSync(new URL(`../../../public/${src}`, import.meta.url));
  return `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;
}

/** Whether a Workbox glob pattern of the form `**\/*.{a,b}` matches `file`. */
function globMatches(pattern: string, file: string) {
  const extensions = pattern.match(/\*\.\{(.+)\}$/)?.[1]?.split(',') ?? [];
  return extensions.some((extension) => file.endsWith(`.${extension}`));
}

const denylist = pwaWorkbox?.navigateFallbackDenylist ?? [];
const isDenied = (path: string) => denylist.some((pattern) => pattern.test(path));

describe('pwa config', () => {
  it('declares the brand name, colours and standalone display', () => {
    expect(pwaManifest).toMatchObject({
      name: 'Ikrive',
      short_name: 'Ikrive',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: '#2d3a3a',
      background_color: '#f9fafb',
    });
  });

  it('declares 192 and 512 icons and a maskable 512 icon', () => {
    expect(pwaManifest.icons).toEqual([
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ]);
    for (const icon of pwaManifest.icons ?? []) {
      expect(pngSize(icon.src), icon.src).toBe(icon.sizes);
    }
  });

  it('precaches html, js, css, fonts, images and icons', () => {
    const patterns = pwaWorkbox?.globPatterns ?? [];
    const shell = [
      'index.html',
      'assets/index-abc123.js',
      'assets/index-abc123.css',
      'fonts/outfit-v15-latin/outfit-v15-latin-700.woff2',
      'icons/icon-192.png',
      'favicon.ico',
    ];
    for (const file of shell) {
      expect(
        patterns.some((pattern) => globMatches(pattern, file)),
        file,
      ).toBe(true);
    }
  });

  it('falls back to index.html for SPA navigations', () => {
    expect(pwaWorkbox?.navigateFallback).toBe('index.html');
    expect(isDenied('/vehicles/123')).toBe(false);
    expect(isDenied('/')).toBe(false);
    expect(isDenied('/login')).toBe(false);
  });

  it('never serves /api from the cache', () => {
    expect(denylist).toContain(API_PATH);
    expect(isDenied('/api/me')).toBe(true);
    expect(isDenied('/api/auth/get-session')).toBe(true);
    expect(isDenied('/api/public/reports/abc')).toBe(true);
    expect(pwaWorkbox?.runtimeCaching).toBeUndefined();
  });
});
