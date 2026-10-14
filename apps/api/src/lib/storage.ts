import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

/**
 * Stores uploaded files on the local disk under random names. Keys are relative paths
 * (e.g. `vehicles/<uuid>.webp`) so the data directory can be moved freely.
 */
export function createFileStorage(rootDir: string) {
  const root = resolve(rootDir);

  const pathOf = (key: string) => {
    const path = resolve(root, key);
    if (relative(root, path).startsWith('..')) throw new Error(`Invalid storage key: ${key}`);
    return path;
  };

  return {
    async save(folder: string, data: Buffer, extension: string): Promise<string> {
      const key = join(folder, `${randomUUID()}.${extension}`);
      const path = pathOf(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, data, { flag: 'wx' });
      return key;
    },
    read(key: string) {
      return createReadStream(pathOf(key));
    },
    async remove(key: string) {
      await rm(pathOf(key), { force: true });
    },
  };
}

export type FileStorage = ReturnType<typeof createFileStorage>;
