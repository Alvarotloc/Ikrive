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

test("declares the web's Capacitor plugins with the same versions", () => {
  const web = JSON.parse(read('../web/package.json')).dependencies;
  const mobile = JSON.parse(read('package.json')).dependencies;
  const plugins = Object.keys(web).filter(
    (name) => /^@(capacitor(-community)?|ebarooni)\//.test(name) && name !== '@capacitor/core',
  );
  for (const name of [
    '@capacitor/app',
    '@capacitor/filesystem',
    '@capacitor/share',
    '@capacitor-community/file-opener',
    '@capacitor/local-notifications',
    '@ebarooni/capacitor-calendar',
  ]) {
    assert.ok(plugins.includes(name), `${name} missing from apps/web`);
  }
  for (const name of plugins) assert.equal(mobile[name], web[name], `${name} version in apps/mobile`);
});

test('removes the exact alarm permission and declares no calendar permissions', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /<manifest\b[^>]*\bxmlns:tools="http:\/\/schemas\.android\.com\/tools"/);
  // @capacitor/local-notifications declares it; the manifest merger drops it from the APK.
  assert.match(
    manifest,
    /<uses-permission\s+android:name="android\.permission\.SCHEDULE_EXACT_ALARM"\s+tools:node="remove"\s*\/>/,
  );
  // The phone calendar opens the system new-event screen: no calendar permissions.
  assert.doesNotMatch(manifest, /READ_CALENDAR|WRITE_CALENDAR/);
});

test('declares the CAMERA permission and the image capture query', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  // Capacitor's file chooser asks for it the first time an <input capture> opens the camera.
  assert.match(manifest, /<uses-permission\s+android:name="android\.permission\.CAMERA"\s*\/>/);
  // Android 11+ package visibility: without it resolveActivity() finds no camera app.
  assert.match(
    manifest,
    /<queries>\s*<intent>\s*<action\s+android:name="android\.media\.action\.IMAGE_CAPTURE"\s*\/>\s*<\/intent>\s*<\/queries>/,
  );
});

test('registers the camera permission plugin', () => {
  const javaDir = 'android/app/src/main/java/com/ikrive/app';
  const activity = read(`${javaDir}/MainActivity.java`);
  const register = activity.indexOf('registerPlugin(CameraPermissionPlugin.class);');
  const superOnCreate = activity.indexOf('super.onCreate(');
  assert.ok(register >= 0, 'registerPlugin(CameraPermissionPlugin.class) missing');
  assert.ok(superOnCreate > register, 'the plugin must be registered before super.onCreate');

  const plugin = read(`${javaDir}/CameraPermissionPlugin.java`);
  assert.match(plugin, /@CapacitorPlugin\(\s*name = "CameraPermission"/);
  assert.match(
    plugin,
    /@Permission\(\s*alias = "camera",\s*strings = \{\s*Manifest\.permission\.CAMERA\s*\}\s*\)/,
  );
  assert.match(plugin, /class CameraPermissionPlugin extends Plugin\b/);
});
