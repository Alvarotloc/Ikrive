import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const mobileDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(mobileDir, path), 'utf8');
const config = JSON.parse(read('capacitor.config.json'));

test('packages the native web build', () => {
  assert.equal(resolve(mobileDir, config.webDir), resolve(mobileDir, '../web/dist-native'));
});

test('serves the app from https://localhost', () => {
  assert.equal(config.server.androidScheme, 'https');
  // No remote URL: the app loads its own assets, and its origin stays https://localhost.
  assert.equal(config.server.url, undefined);
  assert.equal(config.server.hostname ?? 'localhost', 'localhost');
});

test('allows http servers', () => {
  assert.equal(config.android.allowMixedContent, true);
  assert.match(
    read('android/app/src/main/AndroidManifest.xml'),
    /<application\b[^>]*\bandroid:usesCleartextTraffic="true"/,
  );
});

test('reads the version from Gradle properties', () => {
  const gradle = read('android/app/build.gradle');
  assert.match(gradle, /versionCode\(\(project\.findProperty\('ikriveVersionCode'\)/);
  assert.match(gradle, /versionName\(\(project\.findProperty\('ikriveVersionName'\)/);
  assert.doesNotMatch(gradle, /versionCode \d/);
});

test('keeps CapacitorHttp off: requests leave from the WebView with its Origin', () => {
  assert.notEqual(config.plugins?.CapacitorHttp?.enabled, true);
});
