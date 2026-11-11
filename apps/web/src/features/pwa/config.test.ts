import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import viteConfig from '../../../vite.config.ts';
import { API_PATH, NATIVE_CHUNKS_DIR, nativeChunkFileNames, pwaManifest, pwaWorkbox } from './config';

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

const SRC = '/app/apps/web/src';
const NODE_MODULES = '/app/node_modules/.pnpm';
const NATIVE_ONLY = [
  `${SRC}/lib/native-files.ts`,
  `${SRC}/lib/native-calendar.ts`,
  `${SRC}/lib/native-notifications.ts`,
  `${NODE_MODULES}/@capacitor+core@8.6.0/node_modules/@capacitor/core/dist/index.js`,
  `${NODE_MODULES}/@capacitor+filesystem@8.1.5/node_modules/@capacitor/filesystem/dist/esm/web.js`,
  `${NODE_MODULES}/@capacitor+share@8.0.3/node_modules/@capacitor/share/dist/esm/index.js`,
  `${NODE_MODULES}/@capacitor+local-notifications@8.3.1/node_modules/@capacitor/local-notifications/dist/esm/web.js`,
  `${NODE_MODULES}/@capacitor-community+file-opener@8.0.1/node_modules/@capacitor-community/file-opener/dist/esm/index.js`,
  `${NODE_MODULES}/@ebarooni+capacitor-calendar@8.10.0/node_modules/@ebarooni/capacitor-calendar/dist/esm/web.js`,
];
const WEB = [
  `${SRC}/lib/download.ts`,
  `${SRC}/lib/platform.ts`,
  `${SRC}/features/notifications/device-notifications.ts`,
  `${SRC}/features/calendar/actions.ts`,
  `${SRC}/lib/native-other.ts`,
  `${NODE_MODULES}/@radix-ui+react-dialog@1.1.15/node_modules/@radix-ui/react-dialog/dist/index.mjs`,
  `${NODE_MODULES}/workbox-window@7.4.1/node_modules/workbox-window/build/workbox-window.prod.es5.mjs`,
  '\0vite/preload-helper.js',
];

/** Whether Workbox would precache a chunk named `file` according to `globIgnores` (`<dir>/**` patterns only). */
function isIgnored(file: string) {
  return (pwaWorkbox?.globIgnores ?? []).some(
    (pattern) => pattern.endsWith('/**') && file.startsWith(pattern.slice(0, -2)),
  );
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

  it('names the chunks of native-only code with their own folder', () => {
    expect(NATIVE_CHUNKS_DIR).toBe('assets/native/');
    for (const id of NATIVE_ONLY) {
      expect(nativeChunkFileNames({ moduleIds: [id] }), id).toBe('assets/native/[name]-[hash].js');
    }
    expect(nativeChunkFileNames({ moduleIds: NATIVE_ONLY })).toBe('assets/native/[name]-[hash].js');
  });

  it('keeps the default name for web chunks, mixed chunks and empty chunks', () => {
    for (const id of WEB) {
      expect(nativeChunkFileNames({ moduleIds: [id] }), id).toBe('assets/[name]-[hash].js');
    }
    expect(nativeChunkFileNames({ moduleIds: [...NATIVE_ONLY, `${SRC}/lib/download.ts`] })).toBe(
      'assets/[name]-[hash].js',
    );
    expect(nativeChunkFileNames({ moduleIds: [] })).toBe('assets/[name]-[hash].js');
  });

  it('does not precache the native-only chunks and still precaches the rest', () => {
    expect(pwaWorkbox?.globIgnores).toEqual(['assets/native/**']);
    expect(isIgnored('assets/native/native-files-DGOXk9qM.js')).toBe(true);
    expect(isIgnored('assets/native/web-kI98L_az.js')).toBe(true);
    expect(isIgnored('assets/native/dist-BbtsWifC.js')).toBe(true);
    for (const file of [
      'index.html',
      'assets/index-abc123.js',
      'assets/native-like-abc123.js',
      'assets/web-abc123.js',
      'assets/dist-abc123.js',
      'assets/index-abc123.css',
      'icons/icon-192.png',
    ]) {
      expect(isIgnored(file), file).toBe(false);
    }
  });

  it('renames the chunks in the web build only, not in the native build', () => {
    const chunkFileNames = (mode: string) => {
      const output = viteConfig({ mode, command: 'build' }).build?.rolldownOptions?.output;
      return Array.isArray(output) ? undefined : output?.chunkFileNames;
    };
    expect(chunkFileNames('production')).toBe(nativeChunkFileNames);
    expect(chunkFileNames('native')).toBeUndefined();
  });
});
