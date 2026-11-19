import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanUpCameraPhotos } from './camera-photo-cleanup';

const native = vi.hoisted(() => ({ removeCameraPhotos: vi.fn() }));
vi.mock('@/lib/native-camera', () => native);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  native.removeCameraPhotos.mockReset();
});

describe('cleanUpCameraPhotos', () => {
  it('deletes the camera photos older than its call in the native app', async () => {
    vi.stubEnv('MODE', 'native');
    const startedAt = Date.UTC(2026, 10, 19, 10, 15, 30, 500);
    vi.useFakeTimers({ now: startedAt });
    native.removeCameraPhotos.mockResolvedValue(3);

    const done = cleanUpCameraPhotos();
    // Time goes by while the plugin loads: the sweep still uses the moment it was called.
    vi.setSystemTime(startedAt + 500);
    await done;

    expect(native.removeCameraPhotos).toHaveBeenCalledExactlyOnceWith(startedAt);
  });

  it('does nothing on the web', async () => {
    vi.stubEnv('MODE', 'production');

    await cleanUpCameraPhotos();

    expect(native.removeCameraPhotos).not.toHaveBeenCalled();
  });

  it('swallows a failed clean-up so the app starts anyway', async () => {
    vi.stubEnv('MODE', 'native');
    native.removeCameraPhotos.mockRejectedValue(new Error('Directory does not exist.'));

    await expect(cleanUpCameraPhotos()).resolves.toBeUndefined();
  });
});
