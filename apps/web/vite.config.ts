import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { pwaManifest, pwaWorkbox } from './src/features/pwa/config.ts';

export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    // The app registers the SW itself (`features/pwa/service-worker.ts`); the plugin still links the manifest.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: pwaManifest,
      workbox: pwaWorkbox,
      includeAssets: [],
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
