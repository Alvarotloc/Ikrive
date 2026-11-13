import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire, isBuiltin } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'tsup';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REPORT_FONT_FILES } from '../src/modules/reports/pdf/font-files';
import { createBuildOptions, OPTIONAL_UNBUNDLED, RUNTIME_EXTERNALS, runtimeManifest } from '../tsup.config';

interface Metafile {
  outputs: Record<string, { imports: { path: string; external?: boolean }[] }>;
}

const require = createRequire(new URL('../package.json', import.meta.url));
const readJson = <T>(path: string) => JSON.parse(readFileSync(path, 'utf8')) as T;

/** Directory of the installed package `name`, walking up from its entry point (pdfkit hides `./package.json`). */
function packageDir(name: string, from: NodeJS.Require = require): string {
  let dir = dirname(from.resolve(name));
  while (
    !existsSync(join(dir, 'package.json')) ||
    readJson<{ name?: string }>(join(dir, 'package.json')).name !== name
  ) {
    dir = dirname(dir);
  }
  return dir;
}

const installedVersion = (name: string, from?: NodeJS.Require) =>
  readJson<{ version: string }>(join(packageDir(name, from), 'package.json')).version;

describe('api build', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'ikrive-build-'));

  beforeAll(async () => {
    await build({ ...createBuildOptions(outDir), config: false, silent: true });
  }, 60_000);

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it('bundles every dependency except the runtime externals', () => {
    const metafile = readJson<Metafile>(join(outDir, 'metafile-esm.json'));
    const externals = new Set(
      Object.values(metafile.outputs).flatMap((output) =>
        output.imports.filter((entry) => entry.external).map((entry) => entry.path),
      ),
    );
    const allowed = new Set<string>([...RUNTIME_EXTERNALS, ...OPTIONAL_UNBUNDLED]);

    expect([...externals].filter((path) => !isBuiltin(path) && !allowed.has(path))).toEqual([]);
    for (const name of RUNTIME_EXTERNALS) expect(externals).toContain(name);
    expect(readdirSync(outDir)).toEqual(expect.arrayContaining(['server.js', 'job.js']));
  });

  it('writes a runtime package.json with the exact versions of the externals', () => {
    const manifest = readJson<{ type: string; dependencies: Record<string, string> }>(
      join(outDir, 'package.json'),
    );

    expect(manifest.type).toBe('module');
    expect(manifest.dependencies).toEqual(
      Object.fromEntries(RUNTIME_EXTERNALS.map((name) => [name, installedVersion(name)])),
    );
  });

  it('runtimeManifest lists only the runtime externals', () => {
    expect(
      runtimeManifest({ 'better-sqlite3': '1.0.0', sharp: '2.0.0', pdfkit: '3.0.0', fastify: '5.0.0' }),
    ).toEqual({
      type: 'module',
      private: true,
      dependencies: { 'better-sqlite3': '1.0.0', sharp: '2.0.0', pdfkit: '3.0.0' },
    });
    expect(() => runtimeManifest({ sharp: '2.0.0' })).toThrow(/better-sqlite3/);
  });

  it('copies the migrations and the report fonts', () => {
    const migrations = readdirSync(new URL('../../../packages/db/migrations', import.meta.url));

    expect(readdirSync(join(outDir, 'migrations')).sort()).toEqual(migrations.sort());
    expect(readdirSync(join(outDir, 'fonts')).sort()).toEqual(
      REPORT_FONT_FILES.map((font) => font.file).sort(),
    );
  });

  it('pins pdfkit to the version required by @react-pdf/font', () => {
    const api = readJson<{ dependencies: Record<string, string> }>(
      fileURLToPath(new URL('../package.json', import.meta.url)),
    );
    const renderer = createRequire(join(packageDir('@react-pdf/renderer'), 'package.json'));
    const fontDir = packageDir('@react-pdf/font', renderer);
    const fontRequire = createRequire(join(fontDir, 'package.json'));
    const required = readJson<{ dependencies: Record<string, string> }>(join(fontDir, 'package.json'))
      .dependencies.pdfkit;

    expect(api.dependencies.pdfkit).toBe(required);
    // A single copy: the one react-pdf loads is the one installed for the api.
    expect(packageDir('pdfkit', fontRequire)).toBe(packageDir('pdfkit'));
    expect(installedVersion('pdfkit')).toBe(required);
  });
});
