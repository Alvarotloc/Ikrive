import { createWriteStream } from 'node:fs';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { BadRequestError } from './errors';

/** Detail of the 400 for an upload that ended early, unless the route names what was expected. */
export const INCOMPLETE_UPLOAD = 'The upload ended before the file was complete';

/**
 * An error that already carries a 4xx HTTP status (`@fastify/multipart` limits such as
 * `FST_REQ_FILE_TOO_LARGE`, 413): it says more than a generic 400, so it goes through untouched.
 */
function isClientError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'statusCode' in error &&
    typeof error.statusCode === 'number' &&
    error.statusCode >= 400 &&
    error.statusCode < 500
  );
}

/**
 * When the multipart body is malformed (no closing boundary) or the client disconnects,
 * `@fastify/multipart` either destroys the file stream without an error or busboy emits an error
 * on it («Part terminated early…»), depending on whether the part was already being read. A stream
 * destroyed before it is consumed would make `pipeline` wait forever, so it is checked first.
 */
function assertNotCutShort(source: Readable, detail: string): void {
  if (source.destroyed && !source.readableEnded) throw new BadRequestError(detail);
}

/**
 * Writes an uploaded file to `path`; always settles. A failure of the upload side with its own 4xx
 * status is rethrown; any other (error or premature close) means the upload is incomplete: 400
 * with `detail`. A failure of the disk side (full disk…) is rethrown too, and ends in a 500.
 */
export async function receiveToFile(
  source: Readable,
  path: string,
  detail = INCOMPLETE_UPLOAD,
): Promise<void> {
  assertNotCutShort(source, detail);
  const sink = createWriteStream(path);
  // `pipeline` destroys both streams with the first error, so whichever fails first is the cause.
  let failed: 'source' | 'sink' | undefined;
  source.once('error', () => {
    failed ??= 'source';
  });
  sink.once('error', () => {
    failed ??= 'sink';
  });
  try {
    await pipeline(source, sink);
  } catch (error) {
    if (failed === 'sink' || isClientError(error)) throw error;
    throw new BadRequestError(detail);
  }
}

/**
 * Reads an uploaded file (a `MultipartFile`) into memory. An error with its own 4xx status (a file
 * over the size limit: 413) is rethrown; any other can only come from the upload itself: 400 with
 * `detail`.
 */
export async function receiveToBuffer(
  part: { file: Readable; toBuffer: () => Promise<Buffer> },
  detail = INCOMPLETE_UPLOAD,
): Promise<Buffer> {
  assertNotCutShort(part.file, detail);
  try {
    return await part.toBuffer();
  } catch (error) {
    if (isClientError(error)) throw error;
    throw new BadRequestError(detail);
  }
}
