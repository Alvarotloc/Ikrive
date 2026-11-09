// Android version of a release tag. Usage: node scripts/android-version.mjs v1.2.3 → prints «1.2.3 10203».
import { fileURLToPath } from 'node:url';

const TAG = /^v(\d+)\.(\d+)\.(\d+)$/;

/** `v1.2.3` → `{ name: '1.2.3', code: 10203 }`. Throws unless it is v<major>.<minor>.<patch> with minor and patch < 100. */
export function androidVersion(tag) {
  const match = TAG.exec(tag);
  if (!match) throw new Error(`Not a v<major>.<minor>.<patch> tag: ${tag}`);
  const [major, minor, patch] = match.slice(1).map(Number);
  if (minor >= 100 || patch >= 100) throw new Error(`Minor and patch must be below 100: ${tag}`);
  return { name: `${major}.${minor}.${patch}`, code: major * 10000 + minor * 100 + patch };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { name, code } = androidVersion(process.argv[2] ?? '');
  console.log(`${name} ${code}`);
}
