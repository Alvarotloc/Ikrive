/**
 * State of the camera permission and clean-up of the camera photos in the native app (the SPA inside the
 * Android APK). Loaded only through `import()` when `isNativeApp()` (`CameraCaptureButton`,
 * `cleanUpCameraPhotos`): the web never requests this module nor the plugins.
 *
 * `CameraPermission` is a plugin of the app itself (`apps/mobile/android/.../CameraPermissionPlugin.java`)
 * with no methods of its own: it only declares the `camera` alias, so `checkPermissions()` reports the
 * `CAMERA` permission. It asks for nothing: Capacitor asks for the permission when an input with `capture`
 * opens the camera.
 */

import { type PermissionState, registerPlugin } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

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
