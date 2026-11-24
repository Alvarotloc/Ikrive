import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectSameBytes } from '@/test/bytes';
import { EXPORT_APPEND_BYTES, openDeviceExportSink, shareExportFile } from './native-export';

/** `Directory.Cache` of the device: path → bytes, and every call made to the plugins. */
const device = vi.hoisted(() => {
  const disk = new Map<string, Uint8Array>();
  const missing = (path: string) => new Error(`File does not exist: ${path}`);
  return {
    disk,
    /** Length of the `data` of every `appendFile`. */
    appended: [] as number[],
    readFile: vi.fn(),
    stat: vi.fn(),
    share: vi.fn(),
    rmdir: vi.fn(async ({ path }: { path: string }) => {
      const inside = [...disk.keys()].filter((key) => key.startsWith(`${path}/`));
      if (inside.length === 0) throw new Error('Folder does not exist.');
      for (const key of inside) disk.delete(key);
    }),
    writeFile: vi.fn(async ({ path, data }: { path: string; data: string }) => {
      disk.set(path, Uint8Array.from(Buffer.from(data, 'base64')));
      return { uri: `file:///data/user/0/app.ikrive/cache/${path}` };
    }),
    appendFile: vi.fn(async ({ path, data }: { path: string; data: string }) => {
      device.appended.push(data.length);
      const before = disk.get(path) ?? new Uint8Array();
      const added = Buffer.from(data, 'base64');
      const after = new Uint8Array(before.length + added.length);
      after.set(before);
      after.set(added, before.length);
      disk.set(path, after);
    }),
    deleteFile: vi.fn(async ({ path }: { path: string }) => {
      if (!disk.delete(path)) throw missing(path);
    }),
  };
});
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Filesystem: {
    rmdir: device.rmdir,
    writeFile: device.writeFile,
    appendFile: device.appendFile,
    deleteFile: device.deleteFile,
    readFile: device.readFile,
    stat: device.stat,
  },
}));
vi.mock('@capacitor/share', () => ({ Share: { share: device.share } }));

const NAME = 'ikrive-export-2026-03-01.zip';
const PATH = `exports/${NAME}`;
const URI = `file:///data/user/0/app.ikrive/cache/${PATH}`;
const FILE = { fileName: NAME, uri: URI, path: PATH };

/** `size` bytes that differ from one position to the next. */
const bytes = (size: number) => Uint8Array.from({ length: size }, (_, i) => (i * 7) % 256);

beforeEach(() => {
  device.share.mockResolvedValue({});
});

afterEach(() => {
  device.disk.clear();
  device.appended.length = 0;
  for (const mock of [
    device.rmdir,
    device.writeFile,
    device.appendFile,
    device.deleteFile,
    device.readFile,
    device.stat,
    device.share,
  ]) {
    mock.mockClear();
  }
  device.share.mockReset();
});

describe('device export sink', () => {
  it('clears earlier exports and creates the file empty', async () => {
    device.disk.set('exports/ikrive-export-2026-01-01.zip', bytes(10));
    device.disk.set('files/factura.pdf', bytes(5));

    await openDeviceExportSink(NAME);

    expect(device.rmdir).toHaveBeenCalledExactlyOnceWith({
      path: 'exports',
      directory: 'CACHE',
      recursive: true,
    });
    expect(device.writeFile).toHaveBeenCalledExactlyOnceWith({
      path: PATH,
      data: '',
      directory: 'CACHE',
      recursive: true,
    });
    expect([...device.disk.keys()].sort()).toEqual([
      'exports/ikrive-export-2026-03-01.zip',
      'files/factura.pdf',
    ]);
    expect(device.disk.get(PATH)).toEqual(new Uint8Array());
    expect(device.rmdir.mock.invocationCallOrder[0]).toBeLessThan(
      device.writeFile.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('opens even when there is no earlier export and sanitizes the name', async () => {
    const sink = await openDeviceExportSink('a/b:c.zip');

    expect(device.writeFile).toHaveBeenCalledWith(expect.objectContaining({ path: 'exports/a_b_c.zip' }));
    expect(await sink.close()).toMatchObject({ fileName: 'a/b:c.zip', path: 'exports/a_b_c.zip' });
  });

  it('appends each chunk in base64 slices of at most 512 KiB', async () => {
    const sink = await openDeviceExportSink(NAME);
    const first = bytes(Math.round(1.2 * 1024 * 1024));
    const second = bytes(100);

    await sink.write(first);
    expect(device.appendFile).toHaveBeenCalledTimes(3);
    await sink.write(second);

    expect(device.appendFile).toHaveBeenCalledTimes(4);
    const maxBase64 = Buffer.from(new Uint8Array(EXPORT_APPEND_BYTES)).toString('base64').length;
    for (const length of device.appended) expect(length).toBeLessThanOrEqual(maxBase64);
    for (const [options] of device.appendFile.mock.calls) {
      expect(options).toMatchObject({ path: PATH, directory: 'CACHE' });
    }
    const expected = new Uint8Array(first.length + second.length);
    expected.set(first);
    expected.set(second, first.length);
    expectSameBytes(device.disk.get(PATH), expected);
    // Only the empty file was written in one call.
    expect(device.writeFile).toHaveBeenCalledOnce();
    expect(device.writeFile.mock.calls[0]?.[0]).toMatchObject({ data: '' });
  });

  it('returns the cache file on close without reading it', async () => {
    const sink = await openDeviceExportSink(NAME);
    await sink.write(bytes(10));

    expect(await sink.close()).toEqual(FILE);
    expect(device.readFile).not.toHaveBeenCalled();
    expect(device.stat).not.toHaveBeenCalled();
    expect(device.disk.get(PATH)).toEqual(bytes(10));
  });

  it('removes the file on abort and never rejects', async () => {
    const sink = await openDeviceExportSink(NAME);
    await sink.write(bytes(10));

    await sink.abort();

    expect(device.deleteFile).toHaveBeenCalledExactlyOnceWith({ path: PATH, directory: 'CACHE' });
    expect(device.disk.has(PATH)).toBe(false);
    // Already gone, and a failing delete: neither rejects.
    await expect(sink.abort()).resolves.toBeUndefined();
    device.deleteFile.mockRejectedValueOnce(new Error('I/O error'));
    await expect(sink.abort()).resolves.toBeUndefined();
  });
});

describe('sharing the export', () => {
  beforeEach(() => {
    device.disk.set(PATH, bytes(10));
  });

  it('shares the export from its file uri', async () => {
    device.share.mockResolvedValue({});

    await shareExportFile(FILE);

    expect(device.share).toHaveBeenCalledExactlyOnceWith({
      title: NAME,
      files: [URI],
      dialogTitle: 'Guardar o compartir',
    });
    expect(device.readFile).not.toHaveBeenCalled();
  });

  it('keeps the file after it is shared', async () => {
    device.share.mockResolvedValue({});

    await shareExportFile(FILE);

    expect(device.deleteFile).not.toHaveBeenCalled();
    expect(device.disk.get(PATH)).toEqual(bytes(10));
  });

  it('keeps the file and resolves when the share sheet is cancelled', async () => {
    device.share.mockRejectedValue(new Error('Share canceled'));

    await expect(shareExportFile(FILE)).resolves.toBeUndefined();

    expect(device.deleteFile).not.toHaveBeenCalled();
    expect(device.disk.get(PATH)).toEqual(bytes(10));
  });

  it('removes the file and rejects when sharing fails', async () => {
    device.share.mockRejectedValue(new Error('No Activity found'));

    await expect(shareExportFile(FILE)).rejects.toThrow('No Activity found');

    expect(device.deleteFile).toHaveBeenCalledExactlyOnceWith({ path: PATH, directory: 'CACHE' });
    expect(device.disk.has(PATH)).toBe(false);
  });
});
