import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAMERA_PHOTO_NAME, isCameraGranted, removeCameraPhotos } from './native-camera';

const plugin = vi.hoisted(() => ({ checkPermissions: vi.fn() }));
/** Names given to `registerPlugin`, recorded when the module is imported (before any mock is reset). */
const registered = vi.hoisted((): string[] => []);
vi.mock('@capacitor/core', () => ({
  registerPlugin: (name: string) => {
    registered.push(name);
    return plugin;
  },
}));

const filesystem = vi.hoisted(() => ({ readdir: vi.fn(), deleteFile: vi.fn() }));
vi.mock('@capacitor/filesystem', () => ({ Directory: { External: 'EXTERNAL' }, Filesystem: filesystem }));

/** When the app started in these tests (epoch ms, not on a whole second). */
const STARTED_AT = Date.UTC(2026, 10, 19, 10, 15, 30, 500);
/** A moment well before the app started: the photos of an earlier run. */
const EARLIER = STARTED_AT - 60_000;

/** An entry of `Filesystem.readdir` (only the fields the clean-up reads matter). */
const entry = (name: string, type: 'file' | 'directory' = 'file', mtime = EARLIER) => ({
  name,
  type,
  size: 1,
  mtime,
  uri: `file:///storage/emulated/0/Android/data/app.ikrive/files/Pictures/${name}`,
});

afterEach(() => {
  plugin.checkPermissions.mockReset();
  filesystem.readdir.mockReset();
  filesystem.deleteFile.mockReset();
});

describe('native camera', () => {
  it('is granted only when the camera permission is granted', async () => {
    expect(registered).toEqual(['CameraPermission']);
    const cases = [
      ['granted', true],
      ['prompt', false],
      ['denied', false],
      ['prompt-with-rationale', false],
    ] as const;
    for (const [camera, expected] of cases) {
      plugin.checkPermissions.mockResolvedValueOnce({ camera });
      await expect(isCameraGranted()).resolves.toBe(expected);
    }
    expect(plugin.checkPermissions).toHaveBeenCalledTimes(4);
  });
});

describe('camera photos clean-up', () => {
  it('matches the names Capacitor gives the photos and nothing else', () => {
    expect(CAMERA_PHOTO_NAME.test('JPEG_20261119_101530_8123456789012345678.jpg')).toBe(true);
    expect(CAMERA_PHOTO_NAME.test('JPEG_20261119_101530_1.jpg')).toBe(true);
    for (const name of [
      'IMG_20261119_101530.jpg',
      'JPEG_20261119_101530_.jpg',
      'JPEG_20261119_101530_123.jpeg',
      'JPEG_20261119_101530_123.jpg.part',
      'xJPEG_20261119_101530_123.jpg',
      'JPEG_2026111_101530_123.jpg',
    ]) {
      expect(CAMERA_PHOTO_NAME.test(name), name).toBe(false);
    }
  });

  it('deletes the camera photos in Pictures of the external files dir', async () => {
    filesystem.readdir.mockResolvedValue({
      files: [
        entry('JPEG_20261118_090000_111.jpg'),
        entry('JPEG_20261119_101530_222.jpg'),
        entry('notes.txt'),
        entry('IMG_20261119_101530.jpg'),
        entry('JPEG_20261119_101530_333.jpg', 'directory'),
      ],
    });
    filesystem.deleteFile.mockResolvedValue(undefined);

    await expect(removeCameraPhotos(STARTED_AT)).resolves.toBe(2);

    expect(filesystem.readdir).toHaveBeenCalledExactlyOnceWith({ path: 'Pictures', directory: 'EXTERNAL' });
    expect(filesystem.deleteFile.mock.calls).toEqual([
      [{ path: 'Pictures/JPEG_20261118_090000_111.jpg', directory: 'EXTERNAL' }],
      [{ path: 'Pictures/JPEG_20261119_101530_222.jpg', directory: 'EXTERNAL' }],
    ]);
  });

  it('keeps deleting when one photo cannot be deleted', async () => {
    filesystem.readdir.mockResolvedValue({
      files: [entry('JPEG_20261118_090000_111.jpg'), entry('JPEG_20261119_101530_222.jpg')],
    });
    filesystem.deleteFile
      .mockRejectedValueOnce(new Error('File does not exist.'))
      .mockResolvedValueOnce(undefined);

    await expect(removeCameraPhotos(STARTED_AT)).resolves.toBe(1);
    expect(filesystem.deleteFile).toHaveBeenCalledTimes(2);
  });

  it('deletes only the photos older than the start of the app', async () => {
    filesystem.readdir.mockResolvedValue({
      files: [
        entry('JPEG_20261119_101400_111.jpg', 'file', EARLIER),
        entry('JPEG_20261119_101529_222.jpg', 'file', STARTED_AT - 501),
        entry('JPEG_20261119_101530_333.jpg', 'file', STARTED_AT - 500),
        entry('JPEG_20261119_101530_444.jpg', 'file', STARTED_AT),
        entry('JPEG_20261119_101531_555.jpg', 'file', STARTED_AT + 1000),
      ],
    });
    filesystem.deleteFile.mockResolvedValue(undefined);

    await expect(removeCameraPhotos(STARTED_AT)).resolves.toBe(2);

    // The one at the start of the second the app started in may be from this run (whole-second mtimes): kept.
    expect(filesystem.deleteFile.mock.calls).toEqual([
      [{ path: 'Pictures/JPEG_20261119_101400_111.jpg', directory: 'EXTERNAL' }],
      [{ path: 'Pictures/JPEG_20261119_101529_222.jpg', directory: 'EXTERNAL' }],
    ]);
  });

  it('keeps the photos without a usable modification time', async () => {
    const photo = entry('JPEG_20261119_101400_111.jpg');
    filesystem.readdir.mockResolvedValue({
      files: [
        { ...photo, mtime: undefined },
        { ...photo, mtime: 0 },
        { ...photo, mtime: Number.NaN },
        { ...photo, mtime: '1763547270000' },
      ],
    });

    await expect(removeCameraPhotos(STARTED_AT)).resolves.toBe(0);
    expect(filesystem.deleteFile).not.toHaveBeenCalled();
  });

  it('deletes nothing when there are no photos', async () => {
    filesystem.readdir.mockResolvedValue({ files: [] });

    await expect(removeCameraPhotos(STARTED_AT)).resolves.toBe(0);
    expect(filesystem.deleteFile).not.toHaveBeenCalled();
  });

  it('rejects when the folder cannot be listed (no photo taken yet)', async () => {
    filesystem.readdir.mockRejectedValue(new Error('Directory does not exist.'));

    await expect(removeCameraPhotos(STARTED_AT)).rejects.toThrow('does not exist');
    expect(filesystem.deleteFile).not.toHaveBeenCalled();
  });
});
