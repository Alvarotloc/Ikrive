import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { pwaManifest, pwaWorkbox } from './src/features/pwa/config.ts';

// `--mode native` is the build of the Android app (`build:native`, `isNativeApp()`): no PWA in it.
export default defineConfig(({ mode }) => ({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    // The app registers the SW itself (`features/pwa/service-worker.ts`); the plugin still links the manifest.
    // Disabled in the native build: no `sw.js`, manifest nor `<link rel="manifest">`, and
    // `virtual:pwa-register` resolves to a no-op.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: pwaManifest,
      workbox: pwaWorkbox,
      includeAssets: [],
      disable: mode === 'native',
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
}));
