import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createDb, runMigrations } from '../src/db/client';

export async function createTestApp(env: Record<string, string> = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'ikrive-test-'));
  const config = loadConfig({
    NODE_ENV: 'test',
    BASE_URL: 'http://localhost:3000',
    DATA_DIR: dataDir,
    ...env,
  });
  const db = createDb(':memory:');
  runMigrations(db);
  const app = await buildApp({ config, db });
  await app.ready();
  return { app, db, dataDir };
}

type TestApp = Awaited<ReturnType<typeof createTestApp>>['app'];

/** Signs up a user and returns the session cookie header to authenticate later requests. */
export async function signUp(app: TestApp, email = 'ada@example.com', name = 'Ada') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: { origin: 'http://localhost:3000' },
    payload: { email, name, password: 'correct-horse-battery' },
  });
  const cookie = response.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  return { response, cookie };
}
