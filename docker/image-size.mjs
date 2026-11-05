// Fails when a local image is too big. Size = sum of its uncompressed layers (`docker history`).
// Usage: node docker/image-size.mjs <image> [maxMB=250]
import { execFileSync } from 'node:child_process';

const [image, maxArg = '250'] = process.argv.slice(2);
const maxMB = Number(maxArg);
if (!image || !Number.isFinite(maxMB) || maxMB <= 0) {
  console.error('usage: node docker/image-size.mjs <image> [maxMB=250]');
  process.exit(2);
}

const history = execFileSync('docker', ['history', '--human=false', '--format', '{{.Size}}', image], {
  encoding: 'utf8',
});
const bytes = history
  .split('\n')
  .filter((line) => line.trim() !== '')
  .reduce((total, line) => total + Number(line), 0);
const sizeMB = bytes / 1e6;

console.log(`ikrive image ${image}: ${sizeMB.toFixed(1)} MB`);
if (bytes >= maxMB * 1e6) {
  console.error(`✗ ${image} is ${sizeMB.toFixed(1)} MB, the limit is ${maxMB} MB`);
  process.exit(1);
}
