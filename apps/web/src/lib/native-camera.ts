/**
 * State of the camera permission in the native app (the SPA inside the Android APK). Loaded only through
 * `import()` when `isNativeApp()` (`CameraCaptureButton`): the web never requests this module nor the plugin.
 *
 * `CameraPermission` is a plugin of the app itself (`apps/mobile/android/.../CameraPermissionPlugin.java`)
 * with no methods of its own: it only declares the `camera` alias, so `checkPermissions()` reports the
 * `CAMERA` permission. It asks for nothing: Capacitor asks for the permission when an input with `capture`
 * opens the camera.
 */

import { type PermissionState, registerPlugin } from '@capacitor/core';

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
