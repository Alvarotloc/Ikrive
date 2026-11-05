import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { resolveReportFont } from '../src/modules/reports/pdf/fonts';

const FILE = 'outfit-latin-600-normal.woff';
const tempDirs: string[] = [];

/** Temporary directory as the `URL` (with trailing slash) that `resolveReportFont` expects. */
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'ikrive-fonts-'));
  tempDirs.push(dir);
  return { dir, url: pathToFileURL(`${dir}${sep}`) };
}

describe('report fonts', () => {
  afterAll(() => {
    for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  });

  it('uses the bundled font file when it exists next to the module', () => {
    const { dir, url } = tempDir();
    writeFileSync(join(dir, FILE), 'woff');

    expect(resolveReportFont('outfit', FILE, url)).toBe(join(dir, FILE));
  });

  it('falls back to the @fontsource package when there is no bundled font', () => {
    const { url } = tempDir();

    const path = resolveReportFont('outfit', FILE, url);

    expect(path).toContain(join('@fontsource', 'outfit', 'files', FILE));
    expect(existsSync(path)).toBe(true);
  });
});
