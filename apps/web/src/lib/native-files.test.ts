import { afterEach, describe, expect, it, vi } from 'vitest';
import { blobToBase64, isShareCanceled, openFile, safeFileName, saveFile } from './native-files';

const plugins = vi.hoisted(() => ({ writeFile: vi.fn(), share: vi.fn(), open: vi.fn() }));
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Filesystem: { writeFile: plugins.writeFile },
}));
vi.mock('@capacitor/share', () => ({ Share: { share: plugins.share } }));
vi.mock('@capacitor-community/file-opener', () => ({ FileOpener: { open: plugins.open } }));

const URI = 'file:///data/user/0/app.ikrive/cache/files/invoice.pdf';

/** Plugins that succeed: the written file is at `URI`. */
function pluginsSucceed() {
  plugins.writeFile.mockResolvedValue({ uri: URI });
  plugins.share.mockResolvedValue({});
  plugins.open.mockResolvedValue(undefined);
}

afterEach(() => {
  plugins.writeFile.mockReset();
  plugins.share.mockReset();
  plugins.open.mockReset();
});

describe('native files', () => {
  it('writes the file to the cache with its sanitized name', async () => {
    expect(safeFileName('a/b:c.pdf')).toBe('a_b_c.pdf');
    expect(safeFileName('a\\b*c?d"e<f>g|h\u0001.pdf')).toBe('a_b_c_d_e_f_g_h_.pdf');
    expect(safeFileName('Factura taller 2026.pdf. ')).toBe('Factura taller 2026.pdf');
    expect(safeFileName('')).toBe('file');
    expect(safeFileName('...')).toBe('file');
    pluginsSucceed();

    await saveFile('Taller: revisión/2026.pdf', new Blob(['%PDF-1.7 ñ'], { type: 'application/pdf' }));

    expect(plugins.writeFile).toHaveBeenCalledExactlyOnceWith({
      path: 'files/Taller_ revisión_2026.pdf',
      data: Buffer.from('%PDF-1.7 ñ').toString('base64'),
      directory: 'CACHE',
      recursive: true,
    });
  });

  it('encodes large blobs to base64 without the data: prefix', async () => {
    const bytes = Uint8Array.from({ length: 100_000 }, (_, i) => i % 256);

    const base64 = await blobToBase64(new Blob([bytes]));

    expect(base64).toBe(Buffer.from(bytes).toString('base64'));
  });

  it('opens the share sheet with the written file', async () => {
    pluginsSucceed();

    await saveFile('invoice.pdf', new Blob(['%PDF-1.7'], { type: 'application/pdf' }));

    expect(plugins.share).toHaveBeenCalledExactlyOnceWith({
      title: 'invoice.pdf',
      files: [URI],
      dialogTitle: 'Guardar o compartir',
    });
    expect(plugins.open).not.toHaveBeenCalled();
  });

  it('resolves when the share sheet is cancelled', async () => {
    pluginsSucceed();
    plugins.share.mockRejectedValue(new Error('Share canceled'));

    await expect(saveFile('invoice.pdf', new Blob(['x']))).resolves.toBeUndefined();
    expect(isShareCanceled(new Error('Share canceled'))).toBe(true);
    expect(isShareCanceled(new Error('Something else'))).toBe(false);
    expect(isShareCanceled('Share canceled')).toBe(false);
  });

  it('opens the file with its MIME type', async () => {
    pluginsSucceed();

    await openFile('invoice.pdf', new Blob(['%PDF-1.7'], { type: 'application/pdf' }));

    expect(plugins.writeFile).toHaveBeenCalledWith(expect.objectContaining({ path: 'files/invoice.pdf' }));
    expect(plugins.open).toHaveBeenCalledExactlyOnceWith({ filePath: URI, contentType: 'application/pdf' });
    expect(plugins.share).not.toHaveBeenCalled();
  });

  it('falls back to application/octet-stream', async () => {
    pluginsSucceed();

    await openFile('data.bin', new Blob(['x']));

    expect(plugins.open).toHaveBeenCalledExactlyOnceWith({
      filePath: URI,
      contentType: 'application/octet-stream',
    });
  });

  it('rejects when writing, sharing or opening fails', async () => {
    const blob = new Blob(['x'], { type: 'application/pdf' });

    plugins.writeFile.mockRejectedValue(new Error('No space left'));
    await expect(saveFile('a.pdf', blob)).rejects.toThrow('No space left');
    await expect(openFile('a.pdf', blob)).rejects.toThrow('No space left');
    expect(plugins.share).not.toHaveBeenCalled();
    expect(plugins.open).not.toHaveBeenCalled();

    pluginsSucceed();
    plugins.share.mockRejectedValue(new Error('Share failed'));
    await expect(saveFile('a.pdf', blob)).rejects.toThrow('Share failed');

    plugins.open.mockRejectedValue(new Error('Activity not found'));
    await expect(openFile('a.pdf', blob)).rejects.toThrow('Activity not found');
  });
});
