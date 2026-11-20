import { strFromU8, Unzip, UnzipInflate } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createDataExportZip, streamDataExportZip } from './data-export-zip';
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

describe('streamDataExportZip', () => {
  it('streams the chunks of a file before addFile returns', () => {
    const received: Uint8Array[] = [];
    const zip = streamDataExportZip((chunk) => received.push(chunk));
    const path = 'attachments/a1.pdf';
    const data = new Uint8Array(4096).fill(3);
    zip.addFile(path, data);
    const afterAdd = concat(received);

    expect(afterAdd.length).toBeGreaterThanOrEqual(data.length);
    // Local header (30 bytes + the name), then the bytes of the file: none of them waits for `finish`.
    const start = 30 + path.length;
    expect(afterAdd.subarray(start, start + data.length)).toEqual(data);

    const beforeFinish = received.length;
    zip.finish(document);
    const entries = readEntries(received);
    expect(received.length).toBeGreaterThan(beforeFinish);
    expect(entries.get(path)).toEqual({ compression: 0, data });
  });

  it('streams the same bytes as createDataExportZip', () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const webp = new Uint8Array(1024).fill(9);
    const received: Uint8Array[] = [];
    const stream = streamDataExportZip((chunk) => received.push(chunk));
    const collected = createDataExportZip();
    for (const zip of [stream, collected]) {
      zip.addFile('attachments/a1.pdf', pdf);
      zip.addFile('photos/v1.webp', webp);
    }
    stream.finish(document);

    expect(concat(received)).toEqual(concat(collected.finish(document)));
  });
});

describe('streamDataExportZip openFile', () => {
  it('streams each piece of an open file before push returns', () => {
    const received: Uint8Array[] = [];
    const zip = streamDataExportZip((chunk) => received.push(chunk));
    const path = 'attachments/a1.pdf';
    const first = new Uint8Array(1000).fill(1);
    const second = new Uint8Array(500).fill(2);
    const entry = zip.openFile(path);

    entry.push(first);
    const header = 30 + path.length;
    const afterFirst = concat(received);
    expect(afterFirst.length).toBe(header + first.length);
    expect(afterFirst.subarray(header)).toEqual(first);

    entry.push(second);
    const afterSecond = concat(received);
    expect(afterSecond.length).toBe(header + first.length + second.length);
    expect(afterSecond.subarray(header + first.length)).toEqual(second);

    const beforeFinal = afterSecond.length;
    entry.push(new Uint8Array(0), true);
    // The data descriptor (CRC and sizes) goes out with the final push.
    expect(concat(received).length).toBeGreaterThan(beforeFinal);

    zip.finish(document);
    expect(readEntries(received).get(path)).toEqual({ compression: 0, data: concat([first, second]) });
  });

  it('streams the same bytes for a file pushed in pieces as with addFile', () => {
    const piece = 256 * 1024;
    const pdf = new Uint8Array(1024 * 1024 + 3);
    for (let i = 0; i < pdf.length; i++) pdf[i] = (i * 31) % 251;
    const empty = new Uint8Array(0);

    const whole: Uint8Array[] = [];
    const wholeZip = streamDataExportZip((chunk) => whole.push(chunk));
    wholeZip.addFile('attachments/a1.pdf', pdf);
    wholeZip.addFile('photos/v1.webp', empty);
    wholeZip.finish(document);

    const pieces: Uint8Array[] = [];
    const piecesZip = streamDataExportZip((chunk) => pieces.push(chunk));
    const entry = piecesZip.openFile('attachments/a1.pdf');
    for (let offset = 0; offset < pdf.length; offset += piece) {
      entry.push(pdf.subarray(offset, offset + piece));
    }
    entry.push(new Uint8Array(0), true);
    piecesZip.openFile('photos/v1.webp').push(new Uint8Array(0), true);
    piecesZip.finish(document);

    expect(concat(pieces)).toEqual(concat(whole));
    const entries = readEntries(pieces);
    expect(entries.get('attachments/a1.pdf')?.data).toEqual(pdf);
    expect(entries.get('photos/v1.webp')?.data).toEqual(empty);
  });

  it('throws when an entry is still open', () => {
    const received: Uint8Array[] = [];
    const zip = streamDataExportZip((chunk) => received.push(chunk));
    const entry = zip.openFile('attachments/a1.pdf');

    expect(() => zip.openFile('attachments/a2.pdf')).toThrow('Another zip entry is still open');
    expect(() => zip.addFile('attachments/a2.pdf', new Uint8Array([1, 2, 3]))).toThrow(
      'Another zip entry is still open',
    );
    expect(() => zip.finish(document)).toThrow('Another zip entry is still open');
    expect(received).toEqual([]);

    // Once closed, the zip goes on as usual.
    entry.push(new Uint8Array([4, 5]), true);
    zip.addFile('attachments/a2.pdf', new Uint8Array([1, 2, 3]));
    zip.finish(document);
    expect([...readEntries(received).keys()]).toEqual([
      'attachments/a1.pdf',
      'attachments/a2.pdf',
      'data.json',
    ]);
  });
});
