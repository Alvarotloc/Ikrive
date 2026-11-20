import { strToU8, Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import type { DataExport } from './schemas/data-export';

/**
 * Writer of the export zip built on the client (local mode). Kept out of the package index so that
 * `fflate` only reaches the bundles that import this subpath. The API streams its own zip with yazl.
 */
export interface DataExportZip {
  /** Adds `data` stored (no compression: PDFs and images are already compressed) under `path`. */
  addFile(path: string, data: Uint8Array): void;
  /** Adds `data.json` (deflated, `JSON.stringify(document, null, 2)`) and closes the zip. */
  finish(document: DataExport): Uint8Array<ArrayBuffer>[];
}

/** Receives each piece of the zip as soon as fflate produces it (synchronously, in order). */
export type DataExportZipChunk = (chunk: Uint8Array<ArrayBuffer>) => void;

/** An entry of the streamed zip fed piece by piece; closed by the `push` with `final`. */
export interface DataExportZipEntry {
  /**
   * Hands `data` (after the entry's header, on the first push) to the callback before returning; with
   * `final`, also the entry's data descriptor, and the entry is closed.
   */
  push(data: Uint8Array, final?: boolean): void;
}

/** The zip writer that hands every piece to its callback instead of keeping it. */
export interface DataExportZipStream {
  /**
   * Opens an entry stored (no compression) under `path`, to be fed with `push`. Throws while another
   * entry is open: fflate would queue the second one in memory until the first is closed.
   */
  openFile(path: string): DataExportZipEntry;
  /**
   * Adds `data` stored under `path`. Every piece of the entry (header and data) has reached the
   * callback when it returns. Throws while another entry is open.
   */
  addFile(path: string, data: Uint8Array): void;
  /** Adds `data.json` (deflated, `JSON.stringify(document, null, 2)`) and closes the zip. Throws while an entry is open. */
  finish(document: DataExport): void;
}

/** `chunk` typed over a plain `ArrayBuffer` (what `Blob` takes); a view, not a copy, as fflate makes them. */
function ownBuffer(chunk: Uint8Array): Uint8Array<ArrayBuffer> {
  const { buffer } = chunk;
  return buffer instanceof ArrayBuffer
    ? new Uint8Array(buffer, chunk.byteOffset, chunk.byteLength)
    : chunk.slice();
}

/**
 * Files go in as they are read and `data.json` last, so the caller never holds every loose file and
 * the zip at the same time. The import indexes entries through the central directory: order is free.
 * Each entry is closed before the next one is added, so the writer keeps nothing: what it gets is
 * already in `onChunk`. A file pushed in pieces gives the same bytes as pushed whole: fflate writes
 * every stored entry with a data descriptor (CRC and sizes after the data).
 */
export function streamDataExportZip(onChunk: DataExportZipChunk): DataExportZipStream {
  let failure: Error | null = null;
  // fflate calls back synchronously for `ZipPassThrough`/`ZipDeflate` pushes.
  const zip = new Zip((error, chunk) => {
    if (error) failure = error;
    else onChunk(ownBuffer(chunk));
  });
  const check = () => {
    if (failure) throw failure;
  };
  let open = false;
  const assertNoneOpen = () => {
    if (open) throw new Error('Another zip entry is still open');
  };

  const openFile = (path: string): DataExportZipEntry => {
    assertNoneOpen();
    const entry = new ZipPassThrough(path);
    zip.add(entry);
    open = true;
    let closed = false;
    return {
      push(data, final = false) {
        if (closed) throw new Error(`The zip entry ${path} is already closed`);
        if (final) {
          closed = true;
          open = false;
        }
        entry.push(data, final);
        check();
      },
    };
  };

  return {
    openFile,
    addFile(path, data) {
      openFile(path).push(data, true);
    },
    finish(document) {
      assertNoneOpen();
      const entry = new ZipDeflate('data.json', { level: 6 });
      zip.add(entry);
      entry.push(strToU8(JSON.stringify(document, null, 2)), true);
      zip.end();
      check();
    },
  };
}

/** `streamDataExportZip` collecting its chunks, which `finish` returns. */
export function createDataExportZip(): DataExportZip {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const zip = streamDataExportZip((chunk) => chunks.push(chunk));
  return {
    addFile: (path, data) => zip.addFile(path, data),
    finish(document) {
      zip.finish(document);
      return chunks;
    },
  };
}
