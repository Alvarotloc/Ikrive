import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDeviceFileStore } from './native-storage';

const plugin = vi.hoisted(() => ({ writeFile: vi.fn(), readFile: vi.fn(), deleteFile: vi.fn() }));
vi.mock('@capacitor/filesystem', () => ({ Directory: { Data: 'DATA' }, Filesystem: plugin }));
// `native-files` (its base64 helper) imports these plugins.
vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn() } }));
vi.mock('@capacitor-community/file-opener', () => ({ FileOpener: { open: vi.fn() } }));

const PDF = new TextEncoder().encode('%PDF-1.7 factura ñ');

afterEach(() => {
  plugin.writeFile.mockReset();
  plugin.readFile.mockReset();
  plugin.deleteFile.mockReset();
});

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
});
