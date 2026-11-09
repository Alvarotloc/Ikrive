import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { setTimeout } from 'node:timers/promises';
import { vi } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createDb, type Db, runMigrations } from '../src/db/client';
import type { LogStream } from '../src/lib/logging';
import { createNotificationDispatcher } from '../src/modules/notification-channels/dispatcher';

/**
 * `fetch` replaces the notification channels' HTTP client (no real network in tests); `logStream`
 * turns the logger on and receives its output.
 */
export async function createTestApp(
  env: Record<string, string> = {},
  { fetch, logStream }: { fetch?: typeof globalThis.fetch; logStream?: LogStream } = {},
) {
  const dataDir = mkdtempSync(join(tmpdir(), 'ikrive-test-'));
  const config = loadConfig({
    NODE_ENV: 'test',
    BASE_URL: 'http://localhost:3000',
    DATA_DIR: dataDir,
    ...env,
  });
  const db = createDb(':memory:');
  runMigrations(db);
  const app = await buildApp({ config, db, fetch, logStream });
  await app.ready();
  baseUrls.set(app, config.BASE_URL);
  return { app, db, dataDir };
}

type TestApp = Awaited<ReturnType<typeof createTestApp>>['app'];

/** BASE_URL of each test app: Better Auth only accepts sign-ups whose `origin` is a trusted one. */
const baseUrls = new WeakMap<object, string>();

/** Signs up a user and returns the session cookie header to authenticate later requests. */
export async function signUp(app: TestApp, email = 'ada@example.com', name = 'Ada') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: { origin: baseUrls.get(app) ?? TEST_BASE_URL },
    payload: { email, name, password: 'correct-horse-battery' },
  });
  const cookie = response.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  return { response, cookie };
}

export const TEST_BASE_URL = 'http://localhost:3000';

/** Dispatcher for the jobs; by default its `fetch` answers 200 to every channel. */
export function createTestDispatcher(
  db: Db,
  fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 200 })),
) {
  return createNotificationDispatcher({ db, fetch, baseUrl: TEST_BASE_URL });
}

/**
 * The two shapes of a multipart upload that never completes, from a full multipart `payload`.
 * `whole`: the body arrives at once (right Content-Length) but without the closing boundary.
 * `chunked()`: the same body streamed in several chunks, as over the network (send it with
 * `content-length: whole.length`); busboy is already reading the part when the body ends, and it
 * fails the file stream with an error instead of closing it.
 */
export function incompleteMultipart(payload: Buffer) {
  const whole = payload.subarray(0, payload.lastIndexOf('\r\n--'));
  const head = whole.indexOf('\r\n\r\n') + 4;
  const chunked = () =>
    Readable.from(
      (async function* () {
        for (const chunk of [whole.subarray(0, head), whole.subarray(head, head + 1000)]) {
          yield chunk;
          await setTimeout(20);
        }
        yield whole.subarray(head + 1000);
      })(),
      { objectMode: false },
    );
  return { whole, chunked };
}
