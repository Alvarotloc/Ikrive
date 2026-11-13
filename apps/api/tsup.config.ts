import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Options } from 'tsup';
import { REPORT_FONT_FILES } from './src/modules/reports/pdf/font-files';

/**
 * Packages left out of the bundle and installed in the image (`dist/package.json`): native binaries
 * (`better-sqlite3`, `sharp`) and `pdfkit`, which loads its standard fonts with a dynamic
 * `require('#standard-fonts/…')` that the bundler cannot follow.
 */
export const RUNTIME_EXTERNALS = ['better-sqlite3', 'sharp', 'pdfkit'] as const;

/** Optional peers loaded with `import()` inside a `try`: not installed, so they stay unresolved. */
export const OPTIONAL_UNBUNDLED = ['@opentelemetry/api'] as const;

type RuntimeExternal = (typeof RUNTIME_EXTERNALS)[number];

export interface RuntimeManifest {
  type: 'module';
  private: true;
  dependencies: Record<string, string>;
}

const ROOT = fileURLToPath(new URL('.', import.meta.url));

/** `package.json` written to `dist/`: ESM for the bundle and the externals pinned to `versions`. */
export function runtimeManifest(versions: Record<string, string>): RuntimeManifest {
  const dependencies: Record<string, string> = {};
  for (const name of RUNTIME_EXTERNALS) {
    const version = versions[name];
    if (!version) throw new Error(`Missing installed version of runtime external ${name}`);
    dependencies[name] = version;
  }
  return { type: 'module', private: true, dependencies };
}

/**
 * Installed version of a runtime external, resolved from `apps/api`. Walks up from its entry point
 * because not every package exports `./package.json` (`pdfkit` does not).
 */
function installedVersion(name: RuntimeExternal): string {
  const require = createRequire(join(ROOT, 'package.json'));
  let dir = dirname(require.resolve(name));
  while (dir !== dirname(dir)) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) {
      const pkg = JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string; version?: string };
      if (pkg.name === name && pkg.version) return pkg.version;
    }
    dir = dirname(dir);
  }
  throw new Error(`Cannot find the package.json of ${name}`);
}

/** Copies the migrations and the report fonts next to the bundle and writes its `package.json`. */
function writeRuntimeFiles(outDir: string): void {
  cpSync(join(ROOT, '../../packages/db/migrations'), join(outDir, 'migrations'), { recursive: true });

  const fontsDir = join(outDir, 'fonts');
  mkdirSync(fontsDir, { recursive: true });
  const require = createRequire(join(ROOT, 'package.json'));
  for (const font of REPORT_FONT_FILES) {
    cpSync(require.resolve(`@fontsource/${font.family}/files/${font.file}`), join(fontsDir, font.file));
  }

  const versions = Object.fromEntries(RUNTIME_EXTERNALS.map((name) => [name, installedVersion(name)]));
  writeFileSync(join(outDir, 'package.json'), `${JSON.stringify(runtimeManifest(versions), null, 2)}\n`);
}

const externalPattern = RUNTIME_EXTERNALS.join('|');

export function createBuildOptions(outDir = 'dist'): Options {
  const out = resolve(ROOT, outDir);
  return {
    entry: { server: join(ROOT, 'src/server.ts'), job: join(ROOT, 'src/job.ts') },
    outDir: out,
    format: 'esm',
    target: 'node22',
    platform: 'node',
    clean: true,
    sourcemap: true,
    metafile: true,
    // Everything is bundled (including the workspace package) except the runtime externals. Both
    // options are needed: `noExternal` wins over `external`, and pdfkit is not listed by default.
    noExternal: [new RegExp(`^(?!(${externalPattern})(/|$))`)],
    external: [...RUNTIME_EXTERNALS],
    // CJS dependencies bundled into ESM call `require` (fs, path…): give them a real one.
    banner: {
      js: "import { createRequire as __ikriveCreateRequire } from 'node:module'; const require = __ikriveCreateRequire(import.meta.url);",
    },
    onSuccess: async () => {
      writeRuntimeFiles(out);
    },
  };
}

export default defineConfig(createBuildOptions());
