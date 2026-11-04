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

/** Workbox `generateSW` options: precache the app shell and serve `index.html` for SPA navigations. */
export const pwaWorkbox: VitePWAOptions['workbox'] = {
  globPatterns: ['**/*.{js,css,html,woff2,png,ico,webmanifest}'],
  navigateFallback: 'index.html',
  navigateFallbackDenylist: [API_PATH],
  cleanupOutdatedCaches: true,
  // No runtimeCaching: requests outside the precache go straight to the network.
};
