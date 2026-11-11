import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('documents install, CORS and the iPhone alternative', () => {
  const doc = read('docs/mobile.md');
  // Install: download from the Releases, check the sha256, allow unknown sources.
  assert.match(doc, /releases/i);
  assert.match(doc, /sha256sum -c ikrive-vX\.Y\.Z\.apk\.sha256/);
  assert.match(doc, /orígenes desconocidos/);
  // CORS: the Android origin in TRUSTED_ORIGINS.
  assert.match(doc, /TRUSTED_ORIGINS=capacitor:\/\/localhost,https:\/\/localhost/);
  assert.match(doc, /`https:\/\/localhost`/);
  // HTTP travels in clear text.
  assert.match(doc, /en claro/);
  // iPhone: the PWA from Safari.
  assert.match(doc, /iPhone/);
  assert.match(doc, /Añadir a pantalla de inicio/);
  // Signing secrets of the release workflow.
  for (const secret of [
    'ANDROID_KEYSTORE_BASE64',
    'ANDROID_KEYSTORE_PASSWORD',
    'ANDROID_KEY_ALIAS',
    'ANDROID_KEY_PASSWORD',
  ]) {
    assert.ok(doc.includes(`\`${secret}\``), secret);
  }
  // Linked from the self-hosting guide and the README.
  assert.match(read('docs/self-hosting.md'), /\(mobile\.md#cors-trusted_origins\)/);
  assert.match(read('README.md'), /\(docs\/mobile\.md\)/);
});

test('documents native files and no longer lists them as a limitation', () => {
  const doc = read('docs/mobile.md');
  assert.doesNotMatch(doc, /mobile-native-files/);
  assert.doesNotMatch(doc, /aún no funcionan descargar/);
  // Download = the share sheet; open a PDF = the system viewer.
  assert.match(doc, /compartir/);
  assert.match(doc, /visor/);
});

test('documents the phone calendar and local notifications', () => {
  const doc = read('docs/mobile.md');
  // No longer a known limitation.
  assert.doesNotMatch(doc, /notificaciones del sistema/);
  assert.doesNotMatch(doc, /calendario nativo/);
  assert.match(doc, /## Calendario y notificaciones/);
  assert.match(doc, /Calendario del teléfono/);
  assert.match(doc, /Permitir notificaciones/);
  // Only while the app is open; with it closed, the notification channels.
  assert.match(doc, /app abierta/);
  assert.match(doc, /canales/);
  for (const channel of ['ntfy', 'Gotify', 'Apprise', 'webhook']) assert.ok(doc.includes(channel), channel);
});
