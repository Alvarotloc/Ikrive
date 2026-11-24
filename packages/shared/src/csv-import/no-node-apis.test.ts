import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const FORBIDDEN = /\bnode:|\bBuffer\b|\bprocess\b|\brequire\b/;

describe('csv-import portability', () => {
  it('uses no Node APIs', () => {
    const directory = new URL('./', import.meta.url);
    const sources = readdirSync(directory).filter(
      (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'),
    );
    expect(sources).toContain('parse.ts');
    for (const name of sources) {
      expect(readFileSync(new URL(name, directory), 'utf8'), name).not.toMatch(FORBIDDEN);
    }
  });
});
