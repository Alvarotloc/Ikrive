import type { Readable } from 'node:stream';
import yauzl, { type Entry, type ZipFile } from 'yauzl';
import { BadRequestError } from './errors';

export interface ZipLimits {
  /** Maximum number of entries in the central directory. */
  entries: number;
}

export interface ZipReader {
  /** Entries by name, read from the central directory (nothing is decompressed to build it). */
  entries: Map<string, Entry>;
  /**
   * Decompresses one entry into memory. Rejects with a 400 when the zip is damaged, when its real
   * size differs from the declared one or when it goes over `maxBytes`.
   */
  read(entry: Entry, maxBytes: number): Promise<Buffer>;
  close(): void;
}

function openFile(path: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    // `decodeStrings` (default) rejects absolute paths and `..` segments; `strictFileNames` keeps `\`
    // so that it is rejected too instead of being turned into `/`. `validateEntrySizes` makes every
    // stream fail when the real size differs from the declared one (lying headers, zip bombs).
    yauzl.open(
      path,
      { lazyEntries: true, autoClose: false, strictFileNames: true, validateEntrySizes: true },
      (error, zip) => {
        if (error) return reject(new BadRequestError(`The file is not a valid zip: ${error.message}`));
        resolve(zip);
      },
    );
  });
}

/** Walks the central directory and indexes the entries by name, rejecting unsafe zips. */
function index(zip: ZipFile, limits: ZipLimits): Promise<Map<string, Entry>> {
  return new Promise((resolve, reject) => {
    if (zip.entryCount > limits.entries) {
      return reject(new BadRequestError(`The zip has more than ${limits.entries} entries`));
    }
    const entries = new Map<string, Entry>();
    const fail = (error: Error) => {
      zip.removeListener('entry', onEntry);
      reject(error);
    };
    function onEntry(entry: Entry) {
      if (entries.has(entry.fileName))
        return fail(new BadRequestError(`Duplicate zip entry: ${entry.fileName}`));
      if (entry.isEncrypted()) return fail(new BadRequestError(`Encrypted zip entry: ${entry.fileName}`));
      entries.set(entry.fileName, entry);
      zip.readEntry();
    }
    zip.on('entry', onEntry);
    zip.once('end', () => resolve(entries));
    // Unsafe names, bad headers, stored entries with inconsistent sizes…
    zip.once('error', (error: Error) => fail(new BadRequestError(`Invalid zip: ${error.message}`)));
    zip.readEntry();
  });
}

function readStream(zip: ZipFile, entry: Entry, maxBytes: number): Promise<Buffer> {
  const invalid = (error: Error) =>
    new BadRequestError(`Cannot read ${entry.fileName} from the zip: ${error.message}`);
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (openError, stream: Readable) => {
      if (openError) return reject(invalid(openError));
      const chunks: Buffer[] = [];
      let bytes = 0;
      let settled = false;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        stream.destroy();
        reject(invalid(error));
      };
      // Every stream error (inflate, real size ≠ declared, I/O) settles the promise: none is unhandled.
      stream.on('error', fail);
      stream.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > maxBytes) return fail(new Error(`more than ${maxBytes} bytes`));
        chunks.push(chunk);
      });
      stream.on('end', () => {
        if (settled) return;
        settled = true;
        resolve(Buffer.concat(chunks));
      });
    });
  });
}

/**
 * Opens a zip on disk with random access (only the central directory and the entries read later are
 * touched). Any problem with the file is reported as a 400. The caller must always `close()` it.
 */
export async function openZip(path: string, limits: ZipLimits): Promise<ZipReader> {
  const zip = await openFile(path);
  // yauzl reports the errors of the indexing and of closing the file descriptor on the zip: this
  // listener stays for the zip's whole life so that none of them is an unhandled 'error' event.
  zip.on('error', () => {});
  try {
    const entries = await index(zip, limits);
    return {
      entries,
      read: (entry, maxBytes) => readStream(zip, entry, maxBytes),
      close: () => zip.close(),
    };
  } catch (error) {
    zip.close();
    throw error;
  }
}
