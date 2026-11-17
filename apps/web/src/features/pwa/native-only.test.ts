import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { nativeChunkFileNames } from './config';

/**
 * Guards for `NATIVE_ONLY_MODULES`, which is kept by hand: every native-only module that exists in the
 * repository must go to `assets/native/`, and the web must only reach them through `import()`.
 */

const SRC = fileURLToPath(new URL('../../', import.meta.url));
const LIB = join(SRC, 'lib');
const MOBILE_PACKAGE = fileURLToPath(new URL('../../../../mobile/package.json', import.meta.url));
const NATIVE_CHUNK = 'assets/native/[name]-[hash].js';

/** `lib/native-*.ts` modules (not their tests), read from the folder so a new one is checked too. */
const nativeLibs = readdirSync(LIB)
  .filter((file) => /^native-.+\.ts$/.test(file) && !file.endsWith('.test.ts'))
  .map((file) => join(LIB, file));

/**
 * Packages of the native app that end up in the JS bundle. `@capacitor/android` is the Android platform
 * (Java/Gradle project, never imported from JS) and `@capacitor/cli` is build tooling; both are excluded.
 */
const NOT_IN_BUNDLE = new Set(['@capacitor/android', '@capacitor/cli']);
const mobileDependencies: Record<string, string> =
  JSON.parse(readFileSync(MOBILE_PACKAGE, 'utf8')).dependencies ?? {};
const nativePackages = Object.entries(mobileDependencies).filter(([name]) => !NOT_IN_BUNDLE.has(name));

/**
 * Synthetic module id shaped like the ones pnpm gives to a file of `name@version`; it is not read from disk.
 * Only its `/node_modules/<name>/` segment matters, since that is what `NATIVE_ONLY_MODULES` matches.
 */
const packageModuleId = (name: string, version: string, file: string) =>
  `/app/node_modules/.pnpm/${name.replace('/', '+')}@${version}/node_modules/${name}/${file}`;

/** `*.ts`/`*.tsx` files under `dir`, recursively. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** Specifiers of the static value imports and re-exports of `source` (`import type`/`export type` are erased). */
function staticImports(source: string): string[] {
  const fromClause = /^\s*(?:import|export)\s+(?!type\s)[^;'"]*?\sfrom\s*['"]([^'"]+)['"]/gm;
  const sideEffect = /^\s*import\s*['"]([^'"]+)['"]/gm;
  return [...source.matchAll(fromClause), ...source.matchAll(sideEffect)].map((match) => match[1] ?? '');
}

/** Whether `specifier`, imported from `file`, is Capacitor (or a plugin of the app) or a `lib/native-*` module. */
function isNativeOnlyImport(file: string, specifier: string): boolean {
  if (nativePackages.some(([name]) => specifier === name || specifier.startsWith(`${name}/`))) return true;
  if (specifier.startsWith('@capacitor/')) return true;
  const path = specifier.startsWith('@/')
    ? join(SRC, specifier.slice(2))
    : specifier.startsWith('.')
      ? resolve(dirname(file), specifier)
      : undefined;
  return path?.startsWith(`${LIB}/native-`) === true && !path.slice(LIB.length + 1).includes('/');
}

const LOCAL = join(LIB, 'data-source/local');
const SALE_REPORT_PDF_CHUNK = join(LOCAL, 'sale-report-pdf.ts');
/** Packages of the sale report PDF: only its chunk (`local/sale-report-pdf.ts`) may import them statically. */
const SALE_REPORT_PDF_PACKAGES = ['@ikrive/shared/sale-report-pdf', '@react-pdf/renderer', 'pdf-lib'];

/** Whether `specifier`, imported from `file`, is the sale report PDF module, its dependencies or its chunk. */
function isSaleReportPdfImport(file: string, specifier: string): boolean {
  if (SALE_REPORT_PDF_PACKAGES.some((name) => specifier === name || specifier.startsWith(`${name}/`)))
    return true;
  const path = specifier.startsWith('@/')
    ? join(SRC, specifier.slice(2))
    : specifier.startsWith('.')
      ? resolve(dirname(file), specifier)
      : undefined;
  return path !== undefined && path.replace(/\.ts$/, '') === SALE_REPORT_PDF_CHUNK.replace(/\.ts$/, '');
}

describe('native-only modules', () => {
  it('finds the native libs and the native app packages', () => {
    expect(nativeLibs.length).toBeGreaterThan(0);
    expect(nativePackages.length).toBeGreaterThan(0);
    expect(nativePackages.map(([name]) => name)).not.toContain('@capacitor/android');
  });

  it('sends every lib/native-*.ts to assets/native/', () => {
    for (const id of nativeLibs) {
      expect(nativeChunkFileNames({ moduleIds: [id] }), id).toBe(NATIVE_CHUNK);
    }
  });

  it('sends every package of the native app to assets/native/', () => {
    for (const [name, version] of nativePackages) {
      for (const file of ['dist/esm/index.js', 'dist/esm/web.js']) {
        const id = packageModuleId(name, version, file);
        expect(nativeChunkFileNames({ moduleIds: [id] }), id).toBe(NATIVE_CHUNK);
      }
    }
  });

  it('sends the back button module and @capacitor/app to assets/native/', () => {
    const lib = join(LIB, 'native-back-button.ts');
    expect(nativeLibs).toContain(lib);
    expect(nativeChunkFileNames({ moduleIds: [lib] })).toBe(NATIVE_CHUNK);
    const app = nativePackages.find(([name]) => name === '@capacitor/app');
    expect(app).toBeDefined();
    const id = packageModuleId('@capacitor/app', app?.[1] ?? '', 'dist/esm/index.js');
    expect(nativeChunkFileNames({ moduleIds: [id] })).toBe(NATIVE_CHUNK);
  });

  it('sends the app state module to assets/native/', () => {
    const lib = join(LIB, 'native-app-state.ts');
    expect(nativeLibs).toContain(lib);
    expect(nativeChunkFileNames({ moduleIds: [lib] })).toBe(NATIVE_CHUNK);
  });

  it('detects static imports of native-only code and ignores type-only and dynamic ones', () => {
    const file = join(SRC, 'features/calendar/actions.ts');
    const source = [
      "import { Share } from '@capacitor/share';",
      "import {\n  createDeviceEvent,\n} from '@/lib/native-calendar';",
      "export { saveFile } from '../../lib/native-files';",
      "import '@ebarooni/capacitor-calendar';",
      "import type { PermissionState } from '@capacitor/core';",
      "import type { DevicePermission } from '@/lib/native-notifications';",
      "const native = await import('@/lib/native-notifications');",
      "import { isNativeApp } from '@/lib/platform';",
    ].join('\n');
    const flagged = staticImports(source).filter((specifier) => isNativeOnlyImport(file, specifier));
    expect(flagged).toEqual([
      '@capacitor/share',
      '@/lib/native-calendar',
      '../../lib/native-files',
      '@ebarooni/capacitor-calendar',
    ]);
  });

  it('the web imports Capacitor and lib/native-* only through import()', () => {
    const webFiles = sourceFiles(SRC).filter(
      (file) =>
        !nativeLibs.includes(file) && !/\.test\.tsx?$/.test(file) && !file.startsWith(join(SRC, 'test/')),
    );
    expect(webFiles.length).toBeGreaterThan(0);
    const offenders = webFiles.flatMap((file) =>
      staticImports(readFileSync(file, 'utf8'))
        .filter((specifier) => isNativeOnlyImport(file, specifier))
        .map((specifier) => `${file.slice(SRC.length)} → ${specifier}`),
    );
    expect(offenders).toEqual([]);
  });

  it('sends the local sale report pdf chunk to assets/native/', () => {
    const shared = '/app/packages/shared/src/sale-report-pdf/index.ts';
    const reactPdf = packageModuleId('@react-pdf/renderer', '4.9.0', 'lib/react-pdf.browser.js');
    expect(
      nativeChunkFileNames({
        facadeModuleId: SALE_REPORT_PDF_CHUNK,
        moduleIds: [SALE_REPORT_PDF_CHUNK, shared, reactPdf],
      }),
    ).toBe(NATIVE_CHUNK);
    // Its dependencies alone, or another entry with the same modules, stay in assets/.
    expect(nativeChunkFileNames({ facadeModuleId: null, moduleIds: [shared, reactPdf] })).toBe(
      'assets/[name]-[hash].js',
    );
    const local = join(LOCAL, 'sale-report.ts');
    expect(nativeChunkFileNames({ facadeModuleId: local, moduleIds: [local, reactPdf] })).toBe(
      'assets/[name]-[hash].js',
    );
  });

  it('the web imports the sale report pdf module only through import()', () => {
    const file = join(LOCAL, 'sale-report.ts');
    const source = [
      "import { generateSaleReportPdf } from '@ikrive/shared/sale-report-pdf';",
      "import { pdf } from '@react-pdf/renderer';",
      "import { PDFDocument } from 'pdf-lib';",
      "export { fonts } from './sale-report-pdf';",
      "import { fonts } from '@/lib/data-source/local/sale-report-pdf';",
      "import type { ReportFontSource } from '@ikrive/shared/sale-report-pdf';",
      "const kit = await import('./sale-report-pdf');",
      "import { buildSaleReport } from '@ikrive/shared';",
      "import { localSettings } from './settings';",
    ].join('\n');
    expect(staticImports(source).filter((specifier) => isSaleReportPdfImport(file, specifier))).toEqual([
      '@ikrive/shared/sale-report-pdf',
      '@react-pdf/renderer',
      'pdf-lib',
      './sale-report-pdf',
      '@/lib/data-source/local/sale-report-pdf',
    ]);

    const webFiles = sourceFiles(SRC).filter(
      (path) =>
        path !== SALE_REPORT_PDF_CHUNK && !/\.test\.tsx?$/.test(path) && !path.startsWith(join(SRC, 'test/')),
    );
    const offenders = webFiles.flatMap((path) =>
      staticImports(readFileSync(path, 'utf8'))
        .filter((specifier) => isSaleReportPdfImport(path, specifier))
        .map((specifier) => `${path.slice(SRC.length)} → ${specifier}`),
    );
    expect(offenders).toEqual([]);
  });
});
