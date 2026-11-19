import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanUpCameraPhotos } from './camera-photo-cleanup';

const native = vi.hoisted(() => ({
  removeCameraPhotos: vi.fn(),
  readPendingCapture: vi.fn(async (): Promise<string | null> => null),
}));
vi.mock('@/lib/native-camera', () => native);

/** When the app started in these tests (epoch ms). */
const STARTED_AT = Date.UTC(2026, 10, 19, 10, 15, 30, 500);
/** When «Take photo» opened the camera in the run Android killed. */
const OPENED_AT = STARTED_AT - 120_000;

/** A pending capture written when the camera opened at `openedAt`. */
const pendingCapture = (openedAt: number) =>
  JSON.stringify({ target: { kind: 'vehicle-photo', vehicleId: 'v1' }, mode: 'server', openedAt });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  native.removeCameraPhotos.mockReset();
  native.readPendingCapture.mockReset();
  native.readPendingCapture.mockResolvedValue(null);
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

  it('keeps the photos taken since a pending capture opened the camera', async () => {
    vi.stubEnv('MODE', 'native');
    vi.useFakeTimers({ now: STARTED_AT });
    native.readPendingCapture.mockResolvedValue(pendingCapture(OPENED_AT));
    native.removeCameraPhotos.mockResolvedValue(1);

    await cleanUpCameraPhotos();

    // `removeCameraPhotos` deletes only what is older than the second the camera opened in.
    expect(native.removeCameraPhotos).toHaveBeenCalledExactlyOnceWith(OPENED_AT);
  });

  it('ignores an invalid pending capture', async () => {
    vi.stubEnv('MODE', 'native');
    vi.useFakeTimers({ now: STARTED_AT });
    for (const json of [
      '{not json',
      JSON.stringify({ target: { kind: 'vehicle-photo' }, mode: 'server', openedAt: OPENED_AT }),
      JSON.stringify({ target: { kind: 'vehicle-photo', vehicleId: 'v1' }, mode: 'server' }),
    ]) {
      native.readPendingCapture.mockResolvedValueOnce(json);
      await cleanUpCameraPhotos();
    }
    // Unreadable is no pending capture either.
    native.readPendingCapture.mockRejectedValueOnce(new Error('Permission denied'));
    await cleanUpCameraPhotos();

    expect(native.removeCameraPhotos.mock.calls).toEqual([
      [STARTED_AT],
      [STARTED_AT],
      [STARTED_AT],
      [STARTED_AT],
    ]);
  });

  it('deletes the recovered photo on the next start without a pending capture', async () => {
    vi.stubEnv('MODE', 'native');
    // The run that recovered the photo: its pending capture keeps it.
    vi.useFakeTimers({ now: STARTED_AT });
    native.readPendingCapture.mockResolvedValueOnce(pendingCapture(OPENED_AT));
    await cleanUpCameraPhotos();

    // The recovery removed the pending capture; the next start sweeps everything before it.
    const nextStart = STARTED_AT + 3_600_000;
    vi.setSystemTime(nextStart);
    await cleanUpCameraPhotos();

    // The second sweep's cut is after the photo (taken since `OPENED_AT`): it is deleted.
    expect(native.removeCameraPhotos.mock.calls).toEqual([[OPENED_AT], [nextStart]]);
  });
});
