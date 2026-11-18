/**
 * The data export of the local mode on the device: the zip is appended piece by piece to a file of the
 * app cache (`exports/<name>`, covered by the `FileProvider`) and shared from that file, so neither the
 * whole zip nor its base64 is ever in memory. Loaded only through `import()` by `local-mode.ts` (the
 * local `DataSource`'s `exportSink`) and `download.ts` (sharing), like `native-files.ts`.
 *
 * Only one export is kept: each new one first empties `exports/`, which also clears an export left by a
 * closed share sheet or a killed app.
 */

import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import i18n from '@/i18n';
import type { OpenExportSink } from './data-source/local/export-sink';
import type { DeviceFile } from './data-source/types';
import { bytesToBase64, isShareCanceled, safeFileName } from './native-files';

/** Folder of the export in `Directory.Cache`, apart from the `files/` of `native-files.ts`. */
export const EXPORT_DIR = 'exports';

/**
 * Largest slice of a piece per `appendFile` (≈ 700 KB of base64 per bridge message): bounded memory
 * without opening and closing the file for every few bytes. The plugin decodes each call on its own, so
 * the slices need not be multiples of 3.
 */
export const EXPORT_APPEND_BYTES = 512 * 1024;

/** The plugin rejects with «… does not exist» when deleting a missing file or folder. */
const isMissing = (error: unknown) => error instanceof Error && /does not exist/i.test(error.message);

/** Removes the file of the export; never rejects (it may not exist, or the cache may be gone). */
async function removeExportFile(path: string): Promise<void> {
  try {
    await Filesystem.deleteFile({ path, directory: Directory.Cache });
  } catch {
    // Nothing to do: Android clears the cache, and the next export empties `exports/`.
  }
}

/**
 * The export target of the device: empties `exports/`, creates the file empty and appends every piece to
 * it in order. `close` returns the file without reading it; `abort` removes it.
 */
export const openDeviceExportSink: OpenExportSink = async (fileName) => {
  try {
    await Filesystem.rmdir({ path: EXPORT_DIR, directory: Directory.Cache, recursive: true });
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  const path = `${EXPORT_DIR}/${safeFileName(fileName)}`;
  const { uri } = await Filesystem.writeFile({
    path,
    data: '',
    directory: Directory.Cache,
    recursive: true,
  });

  return {
    async write(chunk) {
      for (let offset = 0; offset < chunk.length; offset += EXPORT_APPEND_BYTES) {
        await Filesystem.appendFile({
          path,
          data: bytesToBase64(chunk.subarray(offset, offset + EXPORT_APPEND_BYTES)),
          directory: Directory.Cache,
        });
      }
    },
    async close(): Promise<DeviceFile> {
      return { fileName, uri, path };
    },
    abort: () => removeExportFile(path),
  };
};

/**
 * Opens the system share sheet with the export file. The file stays after sharing (the target app may
 * read it later) and when the sheet is closed: Android also reports «Share canceled» for targets that keep
 * reading the file in the background (Quick Share, Bluetooth). The next export removes it. Any other
 * failure removes the file and rejects.
 */
export async function shareExportFile(file: DeviceFile): Promise<void> {
  try {
    await Share.share({ title: file.fileName, files: [file.uri], dialogTitle: i18n.t('files.shareTitle') });
  } catch (error) {
    if (isShareCanceled(error)) return;
    await removeExportFile(file.path);
    throw error;
  }
}
