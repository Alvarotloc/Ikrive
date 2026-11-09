// Fails when the web build packaged in the APK carries PWA artifacts: the app ships its own assets, a
// service worker would only cache stale copies of them. Usage: node scripts/check-web-dir.mjs <dir>
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PWA_FILE = /^(sw\.js|registerSW\.js|workbox-.*\.js|manifest\.webmanifest)$/;
const MANIFEST_LINK = /<link\b[^>]*\brel=["']?manifest\b/i;

/** PWA artifacts in the build at `dir` (top-level file names, plus `index.html` if it links a manifest); [] = clean. */
export function findPwaArtifacts(dir) {
  const found = readdirSync(dir).filter((name) => PWA_FILE.test(name));
  const index = join(dir, 'index.html');
  if (existsSync(index) && MANIFEST_LINK.test(readFileSync(index, 'utf8'))) found.push('index.html');
  return found;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = resolve(process.argv[2] ?? '../web/dist-native');
  const found = findPwaArtifacts(dir);
  if (found.length > 0) {
    console.error(`PWA artifacts in the native build (${dir}): ${found.join(', ')}`);
    process.exit(1);
  }
  console.log(`No PWA artifacts in ${dir}`);
}
