import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { findPwaArtifacts } from '../scripts/check-web-dir.mjs';

const CLEAN_INDEX = '<!doctype html><html><head><link rel="icon" href="/favicon.ico"></head></html>';
const dirs = [];

/** A temporary build directory with the given files (name → content). */
function buildDir(files) {
  const dir = mkdtempSync(join(tmpdir(), 'ikrive-web-'));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test('finds service worker and manifest files', () => {
  const dir = buildDir({
    'index.html': CLEAN_INDEX,
    'sw.js': '',
    'registerSW.js': '',
    'workbox-2fbc6a65.js': '',
    'manifest.webmanifest': '{}',
  });
  assert.deepEqual(findPwaArtifacts(dir).sort(), [
    'manifest.webmanifest',
    'registerSW.js',
    'sw.js',
    'workbox-2fbc6a65.js',
  ]);
});

test('finds a manifest link in index.html', () => {
  const dir = buildDir({
    'index.html': '<html><head><link rel="manifest" href="/manifest.webmanifest"></head></html>',
  });
  assert.deepEqual(findPwaArtifacts(dir), ['index.html']);
});

test('accepts a clean build', () => {
  const dir = buildDir({ 'index.html': CLEAN_INDEX, 'favicon.ico': '', 'logo.png': '' });
  assert.deepEqual(findPwaArtifacts(dir), []);
});
