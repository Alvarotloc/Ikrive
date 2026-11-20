/**
 * The file store of the local mode on the device: the photos and attachments of the local `DataSource`
 * in the app's private storage (`Directory.Data`, no permissions, removed with the app) under
 * `uploads/<key>`, the same keys the API uses. Loaded only through `import()` in local mode.
 */

import { Directory, Filesystem } from '@capacitor/filesystem';
import { type LocalFileStore, MissingFileError } from '@/lib/data-source/local/files';
import { base64ToBytes, blobToBase64 } from './native-files';

const ROOT = 'uploads';

const pathOf = (key: string) => `${ROOT}/${key}`;

/** The plugin rejects with «File does not exist» when reading or deleting a missing file. */
const isMissingFile = (error: unknown) => error instanceof Error && /does not exist/i.test(error.message);

/** `LocalFileStore` over `@capacitor/filesystem` in `Directory.Data`. */
export function createDeviceFileStore(): LocalFileStore {
  return {
    async save(folder, data, extension) {
      const key = `${folder}/${crypto.randomUUID()}.${extension}`;
      await Filesystem.writeFile({
        path: pathOf(key),
        data: await blobToBase64(new Blob([data.slice()])),
        directory: Directory.Data,
        recursive: true,
      });
      return key;
    },

    async read(key, mimeType) {
      const { data } = await Filesystem.readFile({ path: pathOf(key), directory: Directory.Data }).catch(
        (error: unknown) => {
          throw isMissingFile(error) ? new MissingFileError(key) : error;
        },
      );
      const bytes = typeof data === 'string' ? base64ToBytes(data) : await data.arrayBuffer();
      return new Blob([bytes], { type: mimeType });
    },

    /**
     * Ranges of `readFile` (`offset`/`length`, native only): the plugin skips to `offset` and reads up to
     * `length`, so only that piece is ever in base64. The size comes from `stat` because `length: 0` reads
     * the whole file and an `offset` past the end fails, so neither is ever asked for.
     */
    async *readChunks(key, chunkBytes) {
      const path = pathOf(key);
      const { size } = await Filesystem.stat({ path, directory: Directory.Data }).catch((error: unknown) => {
        throw isMissingFile(error) ? new MissingFileError(key) : error;
      });
      for (let offset = 0; offset < size; ) {
        const length = Math.min(chunkBytes, size - offset);
        const { data } = await Filesystem.readFile({ path, directory: Directory.Data, offset, length });
        const bytes =
          typeof data === 'string' ? base64ToBytes(data) : new Uint8Array(await data.arrayBuffer());
        // A plugin that ignored the range (its web version does) would give a corrupt zip.
        if (bytes.length !== length) {
          throw new Error(`Unexpected read of ${key}: ${bytes.length} bytes instead of ${length}`);
        }
        yield bytes;
        offset += length;
      }
    },

    async remove(key) {
      try {
        await Filesystem.deleteFile({ path: pathOf(key), directory: Directory.Data });
      } catch (error) {
        if (!isMissingFile(error)) throw error;
      }
    },
  };
}
