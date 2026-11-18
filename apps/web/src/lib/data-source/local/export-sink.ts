import type { ExportedFile } from '../types';

/**
 * Where the local export writes its zip, piece by piece and in order: a file of the device in the native
 * app (`lib/native-export.ts`), a `Blob` in memory on the web and in the tests.
 */
export interface LocalExportSink {
  /** Writes `chunk` after the previous ones; resolves once it is on its target. */
  write(chunk: Uint8Array): Promise<void>;
  /** Ends the zip and returns what the UI saves or shares. */
  close(): Promise<ExportedFile>;
  /** Removes whatever was written. Never rejects. */
  abort(): Promise<void>;
}

/** Opens the target of an export named `fileName`. */
export type OpenExportSink = (fileName: string) => Promise<LocalExportSink>;

/** The target of #66: the pieces kept in memory and returned as one `application/zip` `Blob`. */
export const openMemoryExportSink: OpenExportSink = async (fileName) => {
  let chunks: Uint8Array<ArrayBuffer>[] = [];
  return {
    async write(chunk) {
      // A view of the writer's piece, as #66 kept them; copied only off a shared buffer.
      const { buffer } = chunk;
      chunks.push(
        buffer instanceof ArrayBuffer
          ? new Uint8Array(buffer, chunk.byteOffset, chunk.byteLength)
          : chunk.slice(),
      );
    },
    async close() {
      const blob = new Blob(chunks, { type: 'application/zip' });
      chunks = [];
      return { blob, fileName };
    },
    async abort() {
      chunks = [];
    },
  };
};
