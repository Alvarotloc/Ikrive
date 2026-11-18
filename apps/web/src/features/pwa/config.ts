import type { ManifestOptions, VitePWAOptions } from 'vite-plugin-pwa';

/** Web app manifest: what the browser needs to install Ikrive as a standalone app. */
export const pwaManifest: Partial<ManifestOptions> = {
  id: '/',
  name: 'Ikrive',
  short_name: 'Ikrive',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  theme_color: '#2d3a3a',
  background_color: '#f9fafb',
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

/** Paths the SW must never answer: every API request, public report PDFs included. */
export const API_PATH = /^\/api\//;

/**
 * Folder of the web build where the chunks of the native-only code go (`nativeChunkFileNames`). The other
 * chunks are written straight into `assets/`, so no chunk of the web can land here by its name.
 */
export const NATIVE_CHUNKS_DIR = 'assets/native/';

/**
 * Modules that only the native app runs: the `lib/native-*.ts` loaded through `import()` when
 * `isNativeApp()` and the Capacitor packages they import (core and plugins, web fallbacks included).
 *
 * The web never imports Capacitor nor a `lib/native-*` module statically, only through `import()` after
 * `isNativeApp()`. With a static import the web would load that code on every page, but its chunk (made
 * only of these modules) would still go to `assets/native/`, out of the precache: the web would not work
 * offline. Kept by hand: `native-only.test.ts` fails when a `lib/native-*.ts` or a dependency of
 * `apps/mobile` is not listed here, and when the web imports one of them statically.
 */
const NATIVE_ONLY_MODULES = [
  /\/src\/lib\/native-(files|calendar|notifications|sqlite|storage|back-button|app-state|camera)\.ts$/,
  /\/node_modules\/(@capacitor|@capacitor-community|@ebarooni)\//,
];

const isNativeOnlyModule = (id: string) => NATIVE_ONLY_MODULES.some((pattern) => pattern.test(id));

/**
 * Entry points loaded with `import()` only by the local mode of the native app, whose chunk also goes to
 * `NATIVE_CHUNKS_DIR` whatever it bundles: the sale report PDF (the shared module, react-pdf, pdf-lib and
 * their ~30 dependencies, which a list of modules could not keep up with). Dependencies it shares with
 * the app (`react`) stay in common chunks. The web never imports it statically (`native-only.test.ts`).
 */
const NATIVE_ONLY_ENTRIES = [/\/src\/lib\/data-source\/local\/sale-report-pdf\.ts$/];

/**
 * `chunkFileNames` of the web build: a chunk made only of native-only modules, or whose entry point is a
 * native-only entry, goes to `NATIVE_CHUNKS_DIR`; any other chunk (even one that mixes both) keeps Vite's
 * default name.
 */
export function nativeChunkFileNames(chunk: {
  moduleIds: readonly string[];
  facadeModuleId?: string | null;
}): string {
  const { facadeModuleId } = chunk;
  const nativeEntry = !!facadeModuleId && NATIVE_ONLY_ENTRIES.some((pattern) => pattern.test(facadeModuleId));
  const nativeOnly = chunk.moduleIds.length > 0 && chunk.moduleIds.every(isNativeOnlyModule);
  return nativeEntry || nativeOnly ? `${NATIVE_CHUNKS_DIR}[name]-[hash].js` : 'assets/[name]-[hash].js';
}

/**
 * Workbox `generateSW` options: precache the app shell and serve `index.html` for SPA navigations. The
 * native-only chunks are left out: the web never requests them.
 */
export const pwaWorkbox: VitePWAOptions['workbox'] = {
  globPatterns: ['**/*.{js,css,html,woff2,png,ico,webmanifest}'],
  globIgnores: [`${NATIVE_CHUNKS_DIR}**`],
  navigateFallback: 'index.html',
  navigateFallbackDenylist: [API_PATH],
  cleanupOutdatedCaches: true,
  // No runtimeCaching: requests outside the precache go straight to the network.
};
