import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DataDirNotWritableError,
  dataDirErrorMessage,
  ensureWritableDataDir,
  ensureWritableDataDirOrExit,
} from '../src/lib/data-dir';

/** Root ignores file permissions, so the real permission checks cannot fail under it. */
const isRoot = process.getuid?.() === 0;
const ids = { uid: 1234, gid: 5678 };

describe('ensureWritableDataDir', () => {
  let base: string;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'ikrive-data-dir-'));
  });

  afterEach(() => {
    chmodSync(base, 0o700);
    rmSync(base, { recursive: true, force: true });
  });

  it('accepts a writable folder and leaves no probe file behind', () => {
    expect(ensureWritableDataDir(base, ids)).toBe(base);
    expect(readdirSync(base)).toEqual([]);
  });

  it('creates a missing folder (and its parents) when it can', () => {
    const dir = join(base, 'nested', 'data');
    expect(ensureWritableDataDir(dir, ids)).toBe(dir);
    expect(statSync(dir).isDirectory()).toBe(true);
  });

  it.skipIf(isRoot)('rejects a folder without write permission with the path, ids and fix', () => {
    chmodSync(base, 0o500);
    let thrown: unknown;
    try {
      ensureWritableDataDir(base, ids);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(DataDirNotWritableError);
    const message = (thrown as Error).message;
    expect(message).toContain(`DATA_DIR ${base} is not writable`);
    expect(message).toContain('uid 1234, gid 5678');
    expect(message).toContain('EACCES');
    expect(message).toContain('sudo chown -R 1000:1000 data');
  });

  it.skipIf(isRoot)('rejects a missing folder whose parent is not writable', () => {
    chmodSync(base, 0o500);
    const dir = join(base, 'data');
    expect(() => ensureWritableDataDir(dir, ids)).toThrow(DataDirNotWritableError);
    expect(existsSync(dir)).toBe(false);
  });
});

describe('dataDirErrorMessage', () => {
  it('includes the path, the process ids, the error code and the fix', () => {
    const cause = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    const message = dataDirErrorMessage('/data', { uid: 0, gid: 0 }, cause);
    expect(message).toContain('DATA_DIR /data is not writable by the process (uid 0, gid 0): EACCES.');
    expect(message).toContain('sudo chown -R 1000:1000 data');
    expect(message).toContain('mkdir data');
    expect(message).not.toContain('\n');
  });

  it('falls back to the error message and unknown ids', () => {
    const message = dataDirErrorMessage('/data', { uid: undefined, gid: undefined }, new Error('boom'));
    expect(message).toContain('(uid unknown, gid unknown): boom.');
  });
});

describe('ensureWritableDataDirOrExit', () => {
  let base: string;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'ikrive-data-dir-'));
  });

  afterEach(() => {
    chmodSync(base, 0o700);
    rmSync(base, { recursive: true, force: true });
  });

  class Exit extends Error {
    constructor(readonly code: number) {
      super(`exit ${code}`);
    }
  }

  const fakeProcess = () => {
    const lines: string[] = [];
    return {
      lines,
      deps: {
        ids,
        stderr: { write: (line: string) => lines.push(line) },
        exit: (code: number): never => {
          throw new Exit(code);
        },
      },
    };
  };

  it('returns the path without writing anything when the folder is writable', () => {
    const { lines, deps } = fakeProcess();
    expect(ensureWritableDataDirOrExit(base, deps)).toBe(base);
    expect(lines).toEqual([]);
  });

  it.skipIf(isRoot)('writes one line and exits with 1 when the folder is not writable', () => {
    chmodSync(base, 0o500);
    const { lines, deps } = fakeProcess();
    expect(() => ensureWritableDataDirOrExit(base, deps)).toThrow(new Exit(1));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^DATA_DIR .* is not writable .*sudo chown -R 1000:1000 data.*\n$/);
  });

  it.skipIf(isRoot)(
    'makes the server exit with 1 and a single clear line instead of SQLITE_CANTOPEN',
    () => {
      chmodSync(base, 0o500);
      const apiDir = join(import.meta.dirname, '..');
      const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
        cwd: apiDir,
        // Only what the check needs: the test runner's own variables (PORT, BASE_URL…) are not valid config.
        env: { PATH: process.env.PATH, NODE_ENV: 'test', DATA_DIR: join(base, 'data') },
        encoding: 'utf8',
        timeout: 30_000,
      });
      expect(result.status).toBe(1);
      const lines = result.stderr.trim().split('\n');
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain(`DATA_DIR ${join(base, 'data')} is not writable`);
      expect(lines[0]).toContain('sudo chown -R 1000:1000 data');
      expect(result.stderr).not.toContain('SQLITE_CANTOPEN');
    },
    40_000,
  );
});

describe('docs/self-hosting.md', () => {
  it('shows the exact message the container logs when /data is not writable', () => {
    const guide = readFileSync(join(import.meta.dirname, '../../../docs/self-hosting.md'), 'utf8');
    const cause = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    expect(guide).toContain(dataDirErrorMessage('/data', { uid: 1000, gid: 1000 }, cause));
  });
});
