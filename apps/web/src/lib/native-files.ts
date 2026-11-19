/**
 * Files in the native app (the SPA inside the Android APK), where `<a download href="blob:…">` and new
 * tabs do nothing. Loaded only by `download.ts` through `import()` when `isNativeApp()`: the web never
 * requests this module nor the Capacitor plugins.
 *
 * The blob is written to the app cache (no storage permissions; covered by the `FileProvider`), then
 * shared with the system share sheet (save) or opened with the app of its MIME type (open). The files are
 * not removed afterwards: the target app may read them later, they are overwritten by name and Android
 * clears the cache when it needs space.
 */

import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { FileOpener } from '@capacitor-community/file-opener';
import i18n from '@/i18n';

/** Characters that Android/Windows file systems or a `files/<name>` path do not accept in a name. */
const RESERVED = new Set(['/', '\\', ':', '*', '?', '"', '<', '>', '|']);

/** Replaces `/ \ : * ? " < > |` and control characters with `_` and trims trailing spaces and dots; '' → 'file'. */
export function safeFileName(name: string): string {
  const isControl = (char: string) => char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f;
  const safe = Array.from(name, (char) => (isControl(char) || RESERVED.has(char) ? '_' : char))
    .join('')
    .replace(/[\s.]+$/, '');
  return safe || 'file';
}

/** Bytes per `String.fromCharCode` call: well under the engines' argument limit. */
const CHUNK = 0x8000;

/** Base64 of `bytes` without the `data:` prefix, as the Filesystem plugin expects it (Node and the WebView). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Base64 without the `data:` prefix, as the Filesystem plugin expects it (works in Node and the WebView). */
export async function blobToBase64(blob: Blob): Promise<string> {
  return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
}

/** The Share plugin rejects with «Share canceled» when the sheet is closed without a choice. */
export function isShareCanceled(error: unknown): boolean {
  return error instanceof Error && /share canceled/i.test(error.message);
}

/** Writes `blob` to the app cache as `files/<safe name>` and returns its `file://` URI. */
async function writeToCache(fileName: string, blob: Blob): Promise<string> {
  const { uri } = await Filesystem.writeFile({
    path: `files/${safeFileName(fileName)}`,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
    recursive: true,
  });
  return uri;
}

/** Saves or shares `blob` as `fileName` through the system share sheet; closing the sheet is not an error. */
export async function saveFile(fileName: string, blob: Blob): Promise<void> {
  const uri = await writeToCache(fileName, blob);
  try {
    await Share.share({ title: fileName, files: [uri], dialogTitle: i18n.t('files.shareTitle') });
  } catch (error) {
    if (!isShareCanceled(error)) throw error;
  }
}

/** Opens `blob` with the app of its MIME type (e.g. the system PDF viewer). */
export async function openFile(fileName: string, blob: Blob): Promise<void> {
  const uri = await writeToCache(fileName, blob);
  await FileOpener.open({ filePath: uri, contentType: blob.type || 'application/octet-stream' });
}
