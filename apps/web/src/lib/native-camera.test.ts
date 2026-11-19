import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CAMERA_PHOTO_NAME,
  clearPendingCapture,
  isCameraGranted,
  PENDING_CAPTURE_PATH,
  readCameraPhotoSince,
  readPendingCapture,
  removeCameraPhotos,
  savePendingCapture,
} from './native-camera';

const plugin = vi.hoisted(() => ({ checkPermissions: vi.fn() }));
/** Names given to `registerPlugin`, recorded when the module is imported (before any mock is reset). */
const registered = vi.hoisted((): string[] => []);
vi.mock('@capacitor/core', () => ({
  registerPlugin: (name: string) => {
    registered.push(name);
    return plugin;
  },
}));

const filesystem = vi.hoisted(() => ({
  readdir: vi.fn(),
  deleteFile: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));
vi.mock('@capacitor/filesystem', () => ({
  Directory: { External: 'EXTERNAL', Data: 'DATA' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: filesystem,
}));
// `native-files` (its base64 helper) imports these plugins.
vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn() } }));
vi.mock('@capacitor-community/file-opener', () => ({ FileOpener: { open: vi.fn() } }));

/** When the app started in these tests (epoch ms, not on a whole second). */
const STARTED_AT = Date.UTC(2026, 10, 19, 10, 15, 30, 500);
/** A moment well before the app started: the photos of an earlier run. */
const EARLIER = STARTED_AT - 60_000;

/** An entry of `Filesystem.readdir` (only the fields the clean-up reads matter). */
const entry = (name: string, type: 'file' | 'directory' = 'file', mtime = EARLIER, size = 1) => ({
  name,
  type,
  size,
  mtime,
  uri: `file:///storage/emulated/0/Android/data/app.ikrive/files/Pictures/${name}`,
});

afterEach(() => {
  plugin.checkPermissions.mockReset();
  filesystem.readdir.mockReset();
  filesystem.deleteFile.mockReset();
  filesystem.readFile.mockReset();
  filesystem.writeFile.mockReset();
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

describe('pending capture', () => {
  /** The plugin's error for a missing file. */
  const missing = () => new Error('File does not exist.');

  it('saves, reads and clears the pending capture in the app data', async () => {
    const json = JSON.stringify({ target: { kind: 'vehicle-photo', vehicleId: 'v1' } });
    filesystem.writeFile.mockResolvedValue({ uri: 'file:///data/camera/pending-capture.json' });
    filesystem.readFile.mockResolvedValue({ data: json });
    filesystem.deleteFile.mockResolvedValue(undefined);

    await savePendingCapture(json);
    await expect(readPendingCapture()).resolves.toBe(json);
    await clearPendingCapture();

    expect(PENDING_CAPTURE_PATH).toBe('camera/pending-capture.json');
    expect(filesystem.writeFile).toHaveBeenCalledExactlyOnceWith({
      path: 'camera/pending-capture.json',
      data: json,
      directory: 'DATA',
      encoding: 'utf8',
      recursive: true,
    });
    expect(filesystem.readFile).toHaveBeenCalledExactlyOnceWith({
      path: 'camera/pending-capture.json',
      directory: 'DATA',
      encoding: 'utf8',
    });
    expect(filesystem.deleteFile).toHaveBeenCalledExactlyOnceWith({
      path: 'camera/pending-capture.json',
      directory: 'DATA',
    });
  });

  it('reads a missing pending capture as null and clears it without error', async () => {
    filesystem.readFile.mockRejectedValue(missing());
    filesystem.deleteFile.mockRejectedValue(missing());

    await expect(readPendingCapture()).resolves.toBeNull();
    await expect(clearPendingCapture()).resolves.toBeUndefined();

    // Any other failure is not «no capture».
    filesystem.readFile.mockRejectedValue(new Error('Permission denied'));
    filesystem.deleteFile.mockRejectedValue(new Error('Permission denied'));
    await expect(readPendingCapture()).rejects.toThrow('Permission denied');
    await expect(clearPendingCapture()).rejects.toThrow('Permission denied');
  });

  it('reads the newest non-empty camera photo taken since the camera opened', async () => {
    // The camera opened half a second into 10:15:30; the photo may carry 10:15:30.000 (whole seconds).
    const openedAt = STARTED_AT;
    filesystem.readdir.mockResolvedValue({
      files: [
        entry('JPEG_20261119_101400_111.jpg', 'file', EARLIER, 2048),
        entry('JPEG_20261119_101530_222.jpg', 'file', STARTED_AT - 500, 2048),
        entry('JPEG_20261119_101540_333.jpg', 'file', STARTED_AT + 10_000, 4096),
        entry('JPEG_20261119_101545_444.jpg', 'file', STARTED_AT + 15_000, 0),
        entry('notes.txt', 'file', STARTED_AT + 20_000, 10),
        entry('JPEG_20261119_101550_555.jpg', 'directory', STARTED_AT + 20_000, 10),
      ],
    });
    const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    filesystem.readFile.mockResolvedValue({ data: Buffer.from(bytes).toString('base64') });

    const photo = await readCameraPhotoSince(openedAt);

    expect(filesystem.readdir).toHaveBeenCalledExactlyOnceWith({ path: 'Pictures', directory: 'EXTERNAL' });
    expect(filesystem.readFile).toHaveBeenCalledExactlyOnceWith({
      path: 'Pictures/JPEG_20261119_101540_333.jpg',
      directory: 'EXTERNAL',
    });
    expect(photo).toBeInstanceOf(File);
    expect(photo?.name).toBe('JPEG_20261119_101540_333.jpg');
    expect(photo?.type).toBe('image/jpeg');
    expect(new Uint8Array((await photo?.arrayBuffer()) ?? new ArrayBuffer(0))).toEqual(bytes);

    // Only the one from the start of the second the camera opened in is left: it still counts.
    filesystem.readdir.mockResolvedValue({
      files: [
        entry('JPEG_20261119_101400_111.jpg', 'file', EARLIER, 2048),
        entry('JPEG_20261119_101530_222.jpg', 'file', STARTED_AT - 500, 2048),
      ],
    });
    expect((await readCameraPhotoSince(openedAt))?.name).toBe('JPEG_20261119_101530_222.jpg');
  });

  it('finds no camera photo when the camera left only an empty file', async () => {
    filesystem.readdir.mockResolvedValue({
      files: [
        entry('JPEG_20261119_101400_111.jpg', 'file', EARLIER, 2048),
        entry('JPEG_20261119_101540_222.jpg', 'file', STARTED_AT + 10_000, 0),
      ],
    });

    await expect(readCameraPhotoSince(STARTED_AT)).resolves.toBeNull();
    expect(filesystem.readFile).not.toHaveBeenCalled();
  });
});
