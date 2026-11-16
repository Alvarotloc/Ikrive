import { strFromU8, Unzip, UnzipInflate } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createDataExportZip } from './data-export-zip';
import { DATA_EXPORT_FORMAT_VERSION, type DataExport } from './schemas/data-export';
import { DEFAULT_USER_SETTINGS } from './schemas/settings';

interface Entry {
  /** 0 = stored, 8 = deflate. */
  compression: number;
  data: Uint8Array;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Reads every entry of the zip, keeping its compression method. */
function readEntries(chunks: Uint8Array[]): Map<string, Entry> {
  const entries = new Map<string, Entry>();
  const unzip = new Unzip((file) => {
    const parts: Uint8Array[] = [];
    file.ondata = (error, data, final) => {
      if (error) throw error;
      parts.push(data);
      if (final) entries.set(file.name, { compression: file.compression, data: concat(parts) });
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  unzip.push(concat(chunks), true);
  return entries;
}

const document: DataExport = {
  formatVersion: DATA_EXPORT_FORMAT_VERSION,
  appVersion: '1.0.0',
  exportedAt: '2026-01-01T00:00:00.000Z',
  settings: DEFAULT_USER_SETTINGS,
  notificationChannels: [],
  vehicles: [],
};

describe('createDataExportZip', () => {
  it('stores files uncompressed under their path', () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const webp = new Uint8Array(256).fill(7);
    const zip = createDataExportZip();
    zip.addFile('attachments/a1.pdf', pdf);
    zip.addFile('photos/v1.webp', webp);
    const entries = readEntries(zip.finish(document));

    expect([...entries.keys()]).toEqual(['attachments/a1.pdf', 'photos/v1.webp', 'data.json']);
    expect(entries.get('attachments/a1.pdf')).toEqual({ compression: 0, data: pdf });
    expect(entries.get('photos/v1.webp')).toEqual({ compression: 0, data: webp });
  });

  it('writes data.json at the root as formatted JSON', () => {
    const entries = readEntries(createDataExportZip().finish(document));
    const json = entries.get('data.json');

    expect(json?.compression).toBe(8);
    expect(strFromU8(json?.data ?? new Uint8Array())).toBe(JSON.stringify(document, null, 2));
  });
});
