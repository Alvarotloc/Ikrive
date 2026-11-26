import type { CacheKeyIdGeneratorContext } from 'vitest/node';

/** `import.meta.glob(` or its typed form `import.meta.glob<T>(`, with or without spaces before the bracket. */
const IMPORT_META_GLOB = /import\.meta\.glob\s*[<(]/;

/**
 * Cache key generator for Vitest's `fsModuleCache` (`node_modules/.vitest-cache`): leaves out of the cache
 * every module that uses `import.meta.glob`, whose output depends on which files match the pattern and not
 * only on its own source.
 *
 * Vitest already does it, but only when the source contains the literal `import.meta.glob(`: the typed form
 * (`import.meta.glob<string>(` in `lib/data-source/local/migrations.ts`) slips through, and a new migration
 * in `packages/db/migrations` then failed with «Missing migration file …» until the cache was deleted.
 * Returning `undefined` keeps Vitest's default key for the rest of the modules.
 */
export function skipImportMetaGlob({
  sourceCode,
}: Pick<CacheKeyIdGeneratorContext, 'sourceCode'>): false | undefined {
  return IMPORT_META_GLOB.test(sourceCode) ? false : undefined;
}
