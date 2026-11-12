import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The `queries.ts` files reach the data through the active `DataSource` (`dataSource()`), never through
 * the HTTP client directly: otherwise a local `DataSource` would be skipped without anyone noticing.
 */

const SRC = fileURLToPath(new URL('../../', import.meta.url));
const API_CLIENT = join(SRC, 'lib', 'api-client');

/** Every `src/features/<domain>/queries.ts`, read from the folder so a new one is checked too. */
const queriesFiles = readdirSync(join(SRC, 'features'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(SRC, 'features', entry.name, 'queries.ts'))
  .filter((file) => existsSync(file));

const checkedFiles = [...queriesFiles, join(SRC, 'lib', 'client-config.ts')];

/** Specifiers of every import and re-export of `source`, type-only ones included. */
function importSpecifiers(source: string): string[] {
  const fromClause = /^\s*(?:import|export)\s[^;'"]*?\sfrom\s*['"]([^'"]+)['"]/gm;
  const sideEffect = /^\s*import\s*['"]([^'"]+)['"]/gm;
  return [...source.matchAll(fromClause), ...source.matchAll(sideEffect)].map((match) => match[1] ?? '');
}

/** Whether `specifier`, imported from `file`, is `lib/api-client`. */
function isApiClient(file: string, specifier: string): boolean {
  const path = specifier.startsWith('@/')
    ? join(SRC, specifier.slice(2))
    : specifier.startsWith('.')
      ? resolve(dirname(file), specifier)
      : null;
  return path !== null && path.replace(/\.tsx?$/, '') === API_CLIENT;
}

describe('data source boundary', () => {
  it('finds the queries.ts files', () => {
    expect(queriesFiles.length).toBeGreaterThanOrEqual(13);
  });

  it('queries.ts files do not import the api client', () => {
    const offenders = checkedFiles
      .filter((file) =>
        importSpecifiers(readFileSync(file, 'utf8')).some((specifier) => isApiClient(file, specifier)),
      )
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });
});
