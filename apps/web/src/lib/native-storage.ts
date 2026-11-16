/**
 * The file store of the local mode on the device: the photos and attachments of the local `DataSource`
 * in the app's private storage (`Directory.Data`, no permissions, removed with the app) under
 * `uploads/<key>`, the same keys the API uses. Loaded only through `import()` in local mode.
 */

import { Directory, Filesystem } from '@capacitor/filesystem';
import type { LocalFileStore } from '@/lib/data-source/local/files';
import { blobToBase64 } from './native-files';

const ROOT = 'uploads';

const pathOf = (key: string) => `${ROOT}/${key}`;

/** Bytes of the base64 the Filesystem plugin returns on the device. */
function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** The plugin rejects with «File does not exist» when deleting a missing file. */
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
      const { data } = await Filesystem.readFile({ path: pathOf(key), directory: Directory.Data });
      const bytes = typeof data === 'string' ? base64ToBytes(data) : await data.arrayBuffer();
      return new Blob([bytes], { type: mimeType });
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
