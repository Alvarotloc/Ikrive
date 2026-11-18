import type { ExportedFile } from './data-source/types';
import { isNativeApp } from './platform';

/**
 * Saves `blob` as a file named `fileName`. Web: through a temporary `<a download>`. Native app (where
 * that does nothing): written to the app cache and offered in the system share sheet (`native-files.ts`,
 * loaded only there). Rejects if the native side fails; closing the share sheet is not a failure.
 */
export async function downloadBlob(fileName: string, blob: Blob): Promise<void> {
  if (isNativeApp()) {
    const { saveFile } = await import('./native-files');
    return saveFile(fileName, blob);
  }
  // No `await` before the click: the browser must still see it as part of the user's gesture.
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked on the next tick: some browsers start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Opens `blob` (e.g. a PDF). Web: in a new tab with the browser's viewer, through a temporary
 * `<a target="_blank">` without a `window.opener`; `fileName` is not used. Native app: written to the app
 * cache as `fileName` and opened with the system app of its MIME type. Rejects if the native side fails.
 */
export async function openBlob(blob: Blob, fileName: string): Promise<void> {
  if (isNativeApp()) {
    const { openFile } = await import('./native-files');
    return openFile(fileName, blob);
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  // The new tab loads the URL after the click: keep it alive for a while.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Saves the data export. A file of the device (local mode of the native app) is shared from that file
 * (`native-export.ts`, loaded only then); a `Blob` goes to `downloadBlob` as `fileName`, or `fallbackName`
 * when it has none.
 */
export async function saveExportedFile(file: ExportedFile, fallbackName: string): Promise<void> {
  if ('uri' in file) {
    const { shareExportFile } = await import('./native-export');
    return shareExportFile(file);
  }
  return downloadBlob(file.fileName ?? fallbackName, file.blob);
}
