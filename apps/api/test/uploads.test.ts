import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { BadRequestError } from '../src/lib/errors';
import { INCOMPLETE_UPLOAD, receiveToBuffer, receiveToFile } from '../src/lib/uploads';

/** An error as `@fastify/error` builds them: a code and an HTTP status. */
const httpError = (statusCode: number, code = 'FST_TEST') =>
  Object.assign(new Error(`status ${statusCode}`), { code, statusCode });

/** A fake multipart part whose `toBuffer()` fails with `error`. */
const failingPart = (error: Error) => ({
  file: new PassThrough(),
  toBuffer: () => Promise.reject(error),
});

/** A file stream that fails with `error` once it is being read. */
const failingSource = (error: Error) => {
  const source = new PassThrough();
  source.write('part of the file');
  setImmediate(() => source.destroy(error));
  return source;
};

const tempPath = () => join(mkdtempSync(join(tmpdir(), 'ikrive-uploads-')), 'upload.bin');

/** The upload was turned into a 400 `BadRequestError` with `detail`. */
async function expectIncomplete(upload: Promise<unknown>, detail = INCOMPLETE_UPLOAD) {
  const error = await upload.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(BadRequestError);
  expect(error).toMatchObject({ status: 400, message: detail });
}

describe('receiveToBuffer', () => {
  it('returns the contents of a complete upload', async () => {
    const part = { file: new PassThrough(), toBuffer: async () => Buffer.from('hola') };
    expect((await receiveToBuffer(part)).toString()).toBe('hola');
  });

  it('lets through untouched an error that already has a 4xx status', async () => {
    for (const error of [httpError(413, 'FST_REQ_FILE_TOO_LARGE'), httpError(415), httpError(400)]) {
      await expect(receiveToBuffer(failingPart(error))).rejects.toBe(error);
    }
  });

  it('turns any other failure of the upload into a 400', async () => {
    for (const error of [
      new Error('Part terminated early due to unexpected end of multipart data'),
      httpError(500),
    ]) {
      await expectIncomplete(receiveToBuffer(failingPart(error), 'Cut short'), 'Cut short');
    }
  });

  it('answers 400 when the file stream was already destroyed', async () => {
    const file = new PassThrough();
    file.destroy();
    const part = { file, toBuffer: () => new Promise<Buffer>(() => {}) };
    await expectIncomplete(receiveToBuffer(part));
  });
});

describe('receiveToFile', () => {
  it('lets through untouched an upload error that already has a 4xx status', async () => {
    const error = httpError(415);
    await expect(receiveToFile(failingSource(error), tempPath())).rejects.toBe(error);
  });

  it('turns any other failure of the upload into a 400', async () => {
    const source = failingSource(new Error('Part terminated early due to unexpected end of multipart data'));
    await expectIncomplete(receiveToFile(source, tempPath()));
  });

  it('rethrows a failure of the disk, which ends in a 500', async () => {
    const source = new PassThrough();
    source.end('the whole file');
    const missingPath = join(tempPath(), 'missing', 'upload.bin');
    await expect(receiveToFile(source, missingPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
