import { type LocalFileStore, MissingFileError } from '@/lib/data-source/local/files';

export type FileStoreOperation = 'save' | 'read' | 'remove';

/** The file store of the local `DataSource` in the tests, where there is no device. */
export interface MemoryFileStore extends LocalFileStore {
  /** Stored keys, sorted: what is «on disk». */
  keys(): string[];
  /** Bytes stored under `key`, `undefined` if there is no such file. */
  bytes(key: string): Uint8Array | undefined;
  /** Operations that reject from now on, to simulate a failing device. */
  failOn: Set<FileStoreOperation>;
}

/** A `LocalFileStore` over a `Map<key, bytes>`, with the same random keys as the device store. */
export function createMemoryFileStore(): MemoryFileStore {
  const files = new Map<string, Uint8Array>();
  const failOn = new Set<FileStoreOperation>();
  const check = (operation: FileStoreOperation) => {
    if (failOn.has(operation)) throw new Error(`File store ${operation} failed`);
  };
  return {
    failOn,
    keys: () => [...files.keys()].sort(),
    bytes: (key) => files.get(key),
    async save(folder, data, extension) {
      check('save');
      const key = `${folder}/${crypto.randomUUID()}.${extension}`;
      files.set(key, data.slice());
      return key;
    },
    async read(key, mimeType) {
      check('read');
      const data = files.get(key);
      if (!data) throw new MissingFileError(key);
      return new Blob([data.slice()], { type: mimeType });
    },
    async remove(key) {
      check('remove');
      files.delete(key);
    },
  };
}
