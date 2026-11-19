/**
 * State of the camera permission, the pending capture and clean-up of the camera photos in the native app
 * (the SPA inside the Android APK). Loaded only through `import()` when `isNativeApp()`
 * (`CameraCaptureButton`, `cleanUpCameraPhotos`, `features/mobile/camera-restore`): the web never requests
 * this module nor the plugins.
 *
 * `CameraPermission` is a plugin of the app itself (`apps/mobile/android/.../CameraPermissionPlugin.java`)
 * with no methods of its own: it only declares the `camera` alias, so `checkPermissions()` reports the
 * `CAMERA` permission. It asks for nothing: Capacitor asks for the permission when an input with `capture`
 * opens the camera.
 */

import { type PermissionState, registerPlugin } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { base64ToBytes } from './native-files';

interface CameraPermissionPlugin {
  checkPermissions(): Promise<{ camera: PermissionState }>;
}

const CameraPermission = registerPlugin<CameraPermissionPlugin>('CameraPermission');

/**
 * Whether the app may use the camera. Only `granted` counts: Android reports `prompt` both before the first
 * request and after a denial through the file chooser, which never fills the plugin's `denied` cache.
 */
export async function isCameraGranted(): Promise<boolean> {
  const { camera } = await CameraPermission.checkPermissions();
  return camera === 'granted';
}

/**
 * Where Capacitor's file chooser (`BridgeWebChromeClient.createImageFile`) writes each photo taken through an
 * input with `capture`: `getExternalFilesDir(PICTURES)`, that is `Pictures` under `Directory.External`
 * (`getExternalFilesDir(null)`, app-specific, no storage permission).
 */
export const CAMERA_PHOTOS_DIR = 'Pictures';

/** `File.createTempFile("JPEG_" + yyyyMMdd_HHmmss + "_", ".jpg")`: the names Capacitor gives the photos. */
export const CAMERA_PHOTO_NAME = /^JPEG_\d{8}_\d{6}_\d+\.jpg$/;

/**
 * Deletes the photos Capacitor left in `CAMERA_PHOTOS_DIR` before `startedAt` (when the app started, epoch ms)
 * and resolves to how many it deleted. Capacitor never deletes them, and the `File` the WebView hands to the
 * page still reads from that file, so this only runs when no page holds one: when the app starts. A photo
 * from this run (the camera opened while the sweep is still going) is kept: only files whose `mtime` (epoch ms,
 * `File.lastModified()` on Android) falls before the second `startedAt` is in are deleted, as some file systems
 * keep whole seconds; a file without a usable `mtime` is kept too. A file it cannot delete is left for the next
 * start. Rejects if the folder cannot be listed (it does not exist until the first photo).
 */
export async function removeCameraPhotos(startedAt: number): Promise<number> {
  const before = Math.floor(startedAt / 1000) * 1000;
  const { files } = await Filesystem.readdir({ path: CAMERA_PHOTOS_DIR, directory: Directory.External });
  const photos = files.filter(
    (file) =>
      file.type === 'file' &&
      CAMERA_PHOTO_NAME.test(file.name) &&
      // `File.lastModified()` is 0 when it cannot be read.
      Number.isFinite(file.mtime) &&
      file.mtime > 0 &&
      file.mtime < before,
  );
  const results = await Promise.allSettled(
    photos.map((file) =>
      Filesystem.deleteFile({ path: `${CAMERA_PHOTOS_DIR}/${file.name}`, directory: Directory.External }),
    ),
  );
  return results.filter((result) => result.status === 'fulfilled').length;
}

/** The plugin rejects with «File does not exist» when reading or deleting a missing file. */
const isMissingFile = (error: unknown) => error instanceof Error && /does not exist/i.test(error.message);

/**
 * The pending capture (`features/mobile/camera-restore`), in `Directory.Data`: written when «Take photo» opens
 * the camera and removed when the photo or the cancel arrives, so it survives Android killing the app while
 * the camera is open. A file and not `localStorage`, which the WebView writes to disk later.
 */
export const PENDING_CAPTURE_PATH = 'camera/pending-capture.json';

/** Writes the pending capture (`json`), creating its folder. */
export async function savePendingCapture(json: string): Promise<void> {
  await Filesystem.writeFile({
    path: PENDING_CAPTURE_PATH,
    data: json,
    directory: Directory.Data,
    encoding: Encoding.UTF8,
    recursive: true,
  });
}

/** The pending capture as written, or `null` if there is none. */
export async function readPendingCapture(): Promise<string | null> {
  try {
    const { data } = await Filesystem.readFile({
      path: PENDING_CAPTURE_PATH,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    return typeof data === 'string' ? data : await data.text();
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

/** Removes the pending capture; there being none is not an error. */
export async function clearPendingCapture(): Promise<void> {
  try {
    await Filesystem.deleteFile({ path: PENDING_CAPTURE_PATH, directory: Directory.Data });
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }
}

/**
 * The photo the camera took since `openedAt` (epoch ms, when «Take photo» opened it) in `CAMERA_PHOTOS_DIR`,
 * read whole into memory as an `image/jpeg` `File` with the name Capacitor gave it, or `null` if there is
 * none. Only non-empty files count (a camera closed without a photo leaves an empty one) whose `mtime` is
 * at or after the second `openedAt` is in, as some file systems keep whole seconds; the newest wins. Rejects
 * if the folder cannot be listed or the photo cannot be read.
 */
export async function readCameraPhotoSince(openedAt: number): Promise<File | null> {
  const since = Math.floor(openedAt / 1000) * 1000;
  const { files } = await Filesystem.readdir({ path: CAMERA_PHOTOS_DIR, directory: Directory.External });
  const [photo] = files
    .filter(
      (file) =>
        file.type === 'file' &&
        CAMERA_PHOTO_NAME.test(file.name) &&
        file.size > 0 &&
        Number.isFinite(file.mtime) &&
        file.mtime >= since,
    )
    .sort((a, b) => b.mtime - a.mtime);
  if (!photo) return null;
  const { data } = await Filesystem.readFile({
    path: `${CAMERA_PHOTOS_DIR}/${photo.name}`,
    directory: Directory.External,
  });
  const bytes = typeof data === 'string' ? base64ToBytes(data) : await data.arrayBuffer();
  return new File([bytes], photo.name, { type: 'image/jpeg', lastModified: photo.mtime });
}
