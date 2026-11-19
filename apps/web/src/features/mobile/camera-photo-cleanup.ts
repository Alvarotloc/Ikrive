import { isNativeApp } from '@/lib/platform';
import { pendingCaptureCutoff } from './camera-restore';

/**
 * Native app only: deletes the photos the camera left on the device in earlier runs (`removeCameraPhotos`),
 * that is, those older than the moment this is called (taken before loading the plugin, so a photo the camera
 * creates while the sweep runs is kept). Called once when the app starts (`main.tsx`), in server and local
 * mode. At that point no page holds a photo still to upload, retry or discard: those live only in memory, so a
 * failed upload keeps its photo until the app is closed. It never runs while the app is open, as coming back
 * from the camera is a resume too and would delete the photo just taken. On the web (and the PWA) it does
 * nothing and loads nothing.
 *
 * A valid pending capture (`camera-restore`: Android killed the app while the camera was open) moves the cut
 * back to when its camera opened, so the photo it waits for survives until `CameraRestoreHandler` reads it.
 * That handler removes the capture, so the next start without one deletes the photo like any other.
 */
export async function cleanUpCameraPhotos(): Promise<void> {
  if (!isNativeApp()) return;
  const startedAt = Date.now();
  try {
    const native = await import('@/lib/native-camera');
    const before = Math.min(startedAt, (await pendingCaptureCutoff()) ?? startedAt);
    await native.removeCameraPhotos(before);
  } catch {
    // No photos folder yet, or the plugin failed: the next start tries again.
  }
}
