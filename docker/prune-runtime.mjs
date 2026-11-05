// Trims the runtime externals installed in the `natives` stage of the Dockerfile.
// Usage: node prune-runtime.mjs <node_modules>
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2];
if (!root || !existsSync(root)) {
  console.error('usage: node prune-runtime.mjs <node_modules>');
  process.exit(1);
}

const remove = (path) => rmSync(path, { recursive: true, force: true });

// better-sqlite3: keep only the prebuilt binary of this platform; drop the sources used to compile it.
const sqlite = join(root, 'better-sqlite3');
for (const entry of ['deps', 'src', 'binding.gyp']) remove(join(sqlite, entry));
const prebuilds = join(sqlite, 'prebuilds');
if (existsSync(prebuilds)) {
  const keep = `linuxmusl-${process.arch}.node`;
  for (const file of readdirSync(prebuilds)) if (file !== keep) remove(join(prebuilds, file));
}

// pdfkit: the bundle imports `js/pdfkit.node.mjs`; the standalone, browser and legacy builds are unused.
const pdfkitJs = join(root, 'pdfkit', 'js');
if (existsSync(pdfkitJs)) {
  for (const file of readdirSync(pdfkitJs)) {
    if (/^pdfkit\.(standalone|browser|old)/.test(file)) remove(join(pdfkitJs, file));
  }
}

// Source maps of every package: the process does not run with --enable-source-maps.
function removeMaps(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) removeMaps(path);
    else if (entry.name.endsWith('.map')) remove(path);
  }
}
removeMaps(root);
