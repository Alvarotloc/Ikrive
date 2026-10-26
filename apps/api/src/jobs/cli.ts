import type { Writable } from 'node:stream';
import { JOB_NAMES } from '@ikrive/shared';
import { databasePath } from '../app';
import { loadConfig } from '../config';
import { createDb, runMigrations } from '../db/client';
import { createNotificationDispatcher } from '../modules/notification-channels/dispatcher';
import { isJobName, runJob } from './registry';

export interface JobCliDeps {
  env: NodeJS.ProcessEnv;
  stdout: Writable;
  stderr: Writable;
  now?: Date;
  fetch?: typeof globalThis.fetch;
}

/**
 * `job <name>`: runs a job against the database in `DATA_DIR` (applying pending migrations first)
 * and prints its summary as JSON. Returns the exit code: 0 when it ran (even with failed sends,
 * reported in `failed`), 1 on wrong usage. Unexpected errors are thrown.
 */
export async function runJobCli(args: string[], deps: JobCliDeps): Promise<number> {
  const [name] = args;
  if (name === undefined || !isJobName(name)) {
    deps.stderr.write(`Usage: job <${JOB_NAMES.join('|')}>\n`);
    return 1;
  }

  const config = loadConfig(deps.env);
  const db = createDb(databasePath(config));
  try {
    runMigrations(db);
    const dispatcher = createNotificationDispatcher({
      db,
      fetch: deps.fetch ?? globalThis.fetch,
      baseUrl: config.BASE_URL,
    });
    const summary = await runJob(name, { db, dispatcher, now: deps.now });
    deps.stdout.write(`${JSON.stringify(summary)}\n`);
    return 0;
  } finally {
    db.$client.close();
  }
}
