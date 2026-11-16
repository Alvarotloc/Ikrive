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
 */
export function createDataExportZip(): DataExportZip {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let failure: Error | null = null;
  // fflate calls back synchronously for `ZipPassThrough`/`ZipDeflate` pushes.
  const zip = new Zip((error, chunk) => {
    if (error) failure = error;
    else chunks.push(ownBuffer(chunk));
  });
  const check = () => {
    if (failure) throw failure;
  };

  return {
    addFile(path, data) {
      const entry = new ZipPassThrough(path);
      zip.add(entry);
      entry.push(data, true);
      check();
    },
    finish(document) {
      const entry = new ZipDeflate('data.json', { level: 6 });
      zip.add(entry);
      entry.push(strToU8(JSON.stringify(document, null, 2)), true);
      zip.end();
      check();
      return chunks;
    },
  };
}
