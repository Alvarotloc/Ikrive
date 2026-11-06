import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENV_VARIABLES } from '../src/config';

const GUIDE = join(import.meta.dirname, '../../../docs/self-hosting.md');

/** Variables read outside the config schema: the process time zone and the version baked into the image. */
const EXTRA_VARIABLES = ['TZ', 'IKRIVE_VERSION'];

describe('docs/self-hosting.md', () => {
  it('documents every environment variable', () => {
    const tableRows = readFileSync(GUIDE, 'utf8')
      .split('\n')
      .filter((line) => line.startsWith('|'));
    const documented = (key: string) => tableRows.some((row) => row.startsWith(`| \`${key}\` |`));

    expect(ENV_VARIABLES).toContain('AUTH_SECRET');
    const missing = [...ENV_VARIABLES, ...EXTRA_VARIABLES].filter((key) => !documented(key));
    expect(missing).toEqual([]);
  });
});
