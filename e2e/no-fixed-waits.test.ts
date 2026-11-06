import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const FIXED_WAITS = /\b(waitForTimeout|setTimeout|sleep)\s*\(/;

/** `.ts` files under `dir`, recursively, relative to `root`. */
function suiteFiles(root: string, dir = root): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return suiteFiles(root, path);
    return entry.name.endsWith('.ts') ? [path.slice(root.length + 1)] : [];
  });
}

/** `file:line: code` of every fixed wait in the `.ts` files of `folder` (relative to this package). */
function fixedWaits(folder: string): { files: string[]; offenders: string[] } {
  const root = join(import.meta.dirname, folder);
  const files = suiteFiles(root);
  const offenders = files.flatMap((file) =>
    readFileSync(join(root, file), 'utf8')
      .split('\n')
      .flatMap((line, index) =>
        FIXED_WAITS.test(line) ? [`${folder}/${file}:${index + 1}: ${line.trim()}`] : [],
      ),
  );
  return { files, offenders };
}

describe('e2e suite', () => {
  it('e2e tests do not use fixed waits', () => {
    const { files, offenders } = fixedWaits('tests');
    expect(files.length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it('screenshot script does not use fixed waits', () => {
    const { files, offenders } = fixedWaits('screenshots');
    expect(files.length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
