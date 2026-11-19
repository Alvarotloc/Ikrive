import { isNativeApp } from '@/lib/platform';

/**
 * Native app only: deletes the photos the camera left on the device in earlier runs (`removeCameraPhotos`),
 * that is, those older than the moment this is called (taken before loading the plugin, so a photo the camera
 * creates while the sweep runs is kept). Called once when the app starts (`main.tsx`), in server and local
 * mode. At that point no page holds a photo still to upload, retry or discard: those live only in memory, so a
 * failed upload keeps its photo until the app is closed. It never runs while the app is open, as coming back
 * from the camera is a resume too and would delete the photo just taken. On the web (and the PWA) it does
 * nothing and loads nothing.
 */
export async function cleanUpCameraPhotos(): Promise<void> {
  if (!isNativeApp()) return;
  const startedAt = Date.now();
  try {
    const native = await import('@/lib/native-camera');
    await native.removeCameraPhotos(startedAt);
  } catch {
    // No photos folder yet, or the plugin failed: the next start tries again.
  }
}
