import { afterEach, describe, expect, it, vi } from 'vitest';
import { MissingFileError } from '@/lib/data-source/local/files';
import { createDeviceFileStore } from './native-storage';

const plugin = vi.hoisted(() => ({
  writeFile: vi.fn(),
  readFile: vi.fn(),
  deleteFile: vi.fn(),
  stat: vi.fn(),
}));
vi.mock('@capacitor/filesystem', () => ({ Directory: { Data: 'DATA' }, Filesystem: plugin }));
// `native-files` (its base64 helper) imports these plugins.
vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn() } }));
vi.mock('@capacitor-community/file-opener', () => ({ FileOpener: { open: vi.fn() } }));

const PDF = new TextEncoder().encode('%PDF-1.7 factura ñ');

afterEach(() => {
  plugin.writeFile.mockReset();
  plugin.readFile.mockReset();
  plugin.deleteFile.mockReset();
  plugin.stat.mockReset();
});

interface RangeOptions {
  offset: number;
  length: number;
}

/** `stat` and a `readFile` that serves the asked range of `file` as base64, as the native plugin does. */
function serveRanges(file: Uint8Array) {
  plugin.stat.mockResolvedValue({ type: 'file', size: file.length });
  plugin.readFile.mockImplementation(async ({ offset, length }: RangeOptions) => ({
    data: Buffer.from(file.subarray(offset, offset + length)).toString('base64'),
  }));
}

function sample(size: number): Uint8Array {
  const file = new Uint8Array(size);
  for (let i = 0; i < size; i++) file[i] = (i * 7) % 256;
  return file;
}

async function collect(chunks: AsyncIterable<Uint8Array>): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  for await (const chunk of chunks) out.push(chunk);
  return out;
}

describe('device file store', () => {
  it('writes under uploads in Directory.Data with a random key', async () => {
    plugin.writeFile.mockResolvedValue({ uri: 'file:///data/user/0/app.ikrive/files/uploads/x' });
    const store = createDeviceFileStore();

    const key = await store.save('attachments', PDF, 'pdf');
    const other = await store.save('vehicles', PDF, 'webp');

    expect(key).toMatch(/^attachments\/[0-9a-f-]{36}\.pdf$/);
    expect(other).toMatch(/^vehicles\/[0-9a-f-]{36}\.webp$/);
    expect(plugin.writeFile).toHaveBeenNthCalledWith(1, {
      path: `uploads/${key}`,
      data: Buffer.from(PDF).toString('base64'),
      directory: 'DATA',
      recursive: true,
    });
    expect(plugin.writeFile).toHaveBeenCalledTimes(2);
  });

  it('reads a file back as a blob of its type', async () => {
    plugin.readFile.mockResolvedValue({ data: Buffer.from(PDF).toString('base64') });
    const store = createDeviceFileStore();

    const blob = await store.read('attachments/a.pdf', 'application/pdf');

    expect(plugin.readFile).toHaveBeenCalledExactlyOnceWith({
      path: 'uploads/attachments/a.pdf',
      directory: 'DATA',
    });
    expect(blob.type).toBe('application/pdf');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(PDF);

    // On the web the plugin returns a Blob.
    plugin.readFile.mockResolvedValue({ data: new Blob([PDF]) });
    const fromBlob = await store.read('attachments/a.pdf', 'application/pdf');
    expect(fromBlob.type).toBe('application/pdf');
    expect(new Uint8Array(await fromBlob.arrayBuffer())).toEqual(PDF);
  });

  it('tells a missing file apart from other read errors', async () => {
    const store = createDeviceFileStore();

    plugin.readFile.mockRejectedValue(new Error('File does not exist'));
    const missing = await store.read('vehicles/a.webp', 'image/webp').catch((error: unknown) => error);
    expect(missing).toBeInstanceOf(MissingFileError);
    expect(missing).toMatchObject({ key: 'vehicles/a.webp' });

    const denied = new Error('Permission denied');
    plugin.readFile.mockRejectedValue(denied);
    await expect(store.read('vehicles/a.webp', 'image/webp')).rejects.toBe(denied);
  });

  it('ignores removing a missing file', async () => {
    const store = createDeviceFileStore();
    plugin.deleteFile.mockResolvedValue(undefined);

    await store.remove('vehicles/a.webp');
    expect(plugin.deleteFile).toHaveBeenCalledExactlyOnceWith({
      path: 'uploads/vehicles/a.webp',
      directory: 'DATA',
    });

    plugin.deleteFile.mockRejectedValue(new Error('File does not exist'));
    await expect(store.remove('vehicles/a.webp')).resolves.toBeUndefined();

    plugin.deleteFile.mockRejectedValue(new Error('Permission denied'));
    await expect(store.remove('vehicles/a.webp')).rejects.toThrow('Permission denied');
  });

  it('reads a file in ranges of at most the chunk size', async () => {
    const chunkBytes = 256 * 1024;
    const file = sample(600 * 1024 + 1);
    serveRanges(file);
    const store = createDeviceFileStore();

    const chunks = await collect(store.readChunks('attachments/a.pdf', chunkBytes));

    expect(plugin.stat).toHaveBeenCalledExactlyOnceWith({
      path: 'uploads/attachments/a.pdf',
      directory: 'DATA',
    });
    expect(plugin.readFile.mock.calls).toEqual([
      [{ path: 'uploads/attachments/a.pdf', directory: 'DATA', offset: 0, length: chunkBytes }],
      [{ path: 'uploads/attachments/a.pdf', directory: 'DATA', offset: 262144, length: chunkBytes }],
      [
        {
          path: 'uploads/attachments/a.pdf',
          directory: 'DATA',
          offset: 524288,
          length: file.length - 524288,
        },
      ],
    ]);
    for (const [options] of plugin.readFile.mock.calls as [RangeOptions][]) {
      expect(options.length).toBeGreaterThanOrEqual(1);
      expect(options.length).toBeLessThanOrEqual(chunkBytes);
    }
    expect(chunks.map((chunk) => chunk.length)).toEqual([chunkBytes, chunkBytes, file.length - 524288]);
    expect(Buffer.concat(chunks).equals(Buffer.from(file))).toBe(true);
  });

  it('reads the next range only when asked', async () => {
    serveRanges(sample(10));
    const chunks = createDeviceFileStore().readChunks('attachments/a.pdf', 4)[Symbol.asyncIterator]();

    expect(plugin.stat).not.toHaveBeenCalled();
    expect(plugin.readFile).not.toHaveBeenCalled();
    expect((await chunks.next()).value).toEqual(sample(10).subarray(0, 4));
    expect(plugin.readFile).toHaveBeenCalledTimes(1);
    expect((await chunks.next()).value).toEqual(sample(10).subarray(4, 8));
    expect(plugin.readFile).toHaveBeenCalledTimes(2);
    expect((await chunks.next()).value).toEqual(sample(10).subarray(8, 10));
    expect(await chunks.next()).toEqual({ done: true, value: undefined });
    expect(plugin.readFile).toHaveBeenCalledTimes(3);
  });

  it('rejects a missing file before the first range', async () => {
    const store = createDeviceFileStore();

    plugin.stat.mockRejectedValue(new Error('File does not exist'));
    const missing = await collect(store.readChunks('vehicles/a.webp', 1024)).catch((error: unknown) => error);
    expect(missing).toBeInstanceOf(MissingFileError);
    expect(missing).toMatchObject({ key: 'vehicles/a.webp' });
    expect(plugin.readFile).not.toHaveBeenCalled();

    const denied = new Error('Permission denied');
    plugin.stat.mockRejectedValue(denied);
    await expect(collect(store.readChunks('vehicles/a.webp', 1024))).rejects.toBe(denied);
  });

  it('rejects a range of an unexpected size', async () => {
    const file = sample(3000);
    plugin.stat.mockResolvedValue({ type: 'file', size: file.length });
    // A plugin that ignores the range returns the whole file.
    plugin.readFile.mockResolvedValue({ data: Buffer.from(file).toString('base64') });

    const error = await collect(createDeviceFileStore().readChunks('attachments/a.pdf', 1024)).catch(
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(MissingFileError);
    expect(error).toMatchObject({
      message: 'Unexpected read of attachments/a.pdf: 3000 bytes instead of 1024',
    });
  });

  it('reads an empty file without readFile', async () => {
    plugin.stat.mockResolvedValue({ type: 'file', size: 0 });

    const chunks = await collect(createDeviceFileStore().readChunks('attachments/a.pdf', 1024));

    expect(chunks).toEqual([]);
    expect(plugin.readFile).not.toHaveBeenCalled();
  });
});
