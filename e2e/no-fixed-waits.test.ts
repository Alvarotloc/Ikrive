import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const TESTS_DIR = join(import.meta.dirname, 'tests');
const FIXED_WAITS = /\b(waitForTimeout|setTimeout|sleep)\s*\(/;

/** `.ts` files under `dir`, recursively, relative to `TESTS_DIR`. */
function suiteFiles(dir = TESTS_DIR): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return suiteFiles(path);
    return entry.name.endsWith('.ts') ? [path.slice(TESTS_DIR.length + 1)] : [];
  });
}

describe('e2e suite', () => {
  it('e2e tests do not use fixed waits', () => {
    const files = suiteFiles();
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.flatMap((file) =>
      readFileSync(join(TESTS_DIR, file), 'utf8')
        .split('\n')
        .flatMap((line, index) => (FIXED_WAITS.test(line) ? [`${file}:${index + 1}: ${line.trim()}`] : [])),
    );
    expect(offenders).toEqual([]);
  });
});
