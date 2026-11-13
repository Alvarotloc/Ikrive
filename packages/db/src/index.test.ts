import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileUrlToPath, LOCAL_USER_ID, MIGRATIONS_FOLDER } from './index';

describe('@ikrive/db', () => {
  it('points MIGRATIONS_FOLDER to the drizzle-kit journal', () => {
    expect(existsSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'))).toBe(true);
    expect(existsSync(join(MIGRATIONS_FOLDER, '0000_init.sql'))).toBe(true);
  });

  it('turns file URLs into paths on POSIX and Windows', () => {
    expect(fileUrlToPath(new URL('file:///repo/packages/db/migrations'))).toBe(
      '/repo/packages/db/migrations',
    );
    expect(fileUrlToPath(new URL('file:///home/a%20b/migrations'))).toBe('/home/a b/migrations');
    expect(fileUrlToPath(new URL('file:///C:/repo/packages/db/migrations'))).toBe(
      'C:/repo/packages/db/migrations',
    );
  });

  it('names the local user', () => {
    expect(LOCAL_USER_ID).toBe('local');
  });
});
