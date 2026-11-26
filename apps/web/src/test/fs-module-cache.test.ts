import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { skipImportMetaGlob } from './fs-module-cache.ts';

function keyFor(sourceCode: string): false | undefined {
  return skipImportMetaGlob({ sourceCode });
}

describe('skipImportMetaGlob', () => {
  it('leaves out of the cache the modules that use import.meta.glob, typed or not', () => {
    expect(keyFor("const files = import.meta.glob('./*.sql', { eager: true });")).toBe(false);
    expect(keyFor("const files = import.meta.glob<string>('./*.sql', { eager: true });")).toBe(false);
    expect(keyFor("const files = import.meta.glob <string>('./*.sql');")).toBe(false);
  });

  it('keeps the default cache key for the rest of the modules', () => {
    expect(
      keyFor("import journal from './_journal.json';\nexport const tags = journal.entries;"),
    ).toBeUndefined();
    expect(keyFor('const url = import.meta.url;')).toBeUndefined();
  });

  it('leaves out the bundled migrations, so a new migration file is picked up on the next run', () => {
    const source = readFileSync(new URL('../lib/data-source/local/migrations.ts', import.meta.url), 'utf8');
    expect(keyFor(source)).toBe(false);
  });
});
