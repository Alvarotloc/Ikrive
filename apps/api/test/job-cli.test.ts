import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createDb, runMigrations } from '../src/db/client';
import { notifications } from '../src/db/schema';
import { runJobCli } from '../src/jobs/cli';
import { signUp } from './helpers';

/** 12:00 in Madrid on a Thursday: past the default reminder hour. */
const NOW = new Date('2026-10-22T10:00:00.000Z');

/** Collects what is written to it. */
function output() {
  let text = '';
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      text += String(chunk);
      callback();
    },
  });
  return { stream, text: () => text };
}

const envFor = (dataDir: string) => ({
  NODE_ENV: 'test',
  BASE_URL: 'http://localhost:3000',
  DATA_DIR: dataDir,
});

/** Creates a database in a temporary `DATA_DIR` with an admin and an overdue schedule, then closes it. */
async function dataDirWithOverdueSchedule() {
  const dataDir = mkdtempSync(join(tmpdir(), 'ikrive-cli-'));
  const config = loadConfig(envFor(dataDir));
  const db = createDb(join(dataDir, 'ikrive.db'));
  runMigrations(db);
  const app = await buildApp({ config, db });
  const { cookie } = await signUp(app, 'admin@example.com');
  const headers = { cookie };
  const vehicle = await app.inject({
    method: 'POST',
    url: '/api/vehicles',
    headers,
    payload: { make: 'Seat', model: 'León' },
  });
  const schedule = await app.inject({
    method: 'POST',
    url: `/api/vehicles/${(vehicle.json() as { id: string }).id}/schedules`,
    headers,
    payload: {
      title: 'Cambio de aceite',
      category: 'oil_change',
      intervalMonths: 12,
      lastDoneDate: '2025-01-01',
    },
  });
  expect(schedule.statusCode).toBe(201);
  await app.close();
  db.$client.close();
  return dataDir;
}

describe('job CLI', () => {
  it('runs a job against DATA_DIR', async () => {
    const dataDir = await dataDirWithOverdueSchedule();
    const stdout = output();
    const stderr = output();

    const code = await runJobCli(['reminders'], {
      env: envFor(dataDir),
      stdout: stdout.stream,
      stderr: stderr.stream,
      now: NOW,
    });

    expect(code).toBe(0);
    expect(JSON.parse(stdout.text())).toEqual({ job: 'reminders', evaluated: 1, created: 1, failed: 0 });
    expect(stdout.text().endsWith('\n')).toBe(true);
    expect(stderr.text()).toBe('');
    const db = createDb(join(dataDir, 'ikrive.db'));
    try {
      expect(db.select().from(notifications).all()).toMatchObject([
        { type: 'schedule_overdue', title: 'Cambio de aceite' },
      ]);
    } finally {
      db.$client.close();
    }
  });

  it('rejects an unknown or missing job', async () => {
    for (const args of [['foo'], []]) {
      const dataDir = mkdtempSync(join(tmpdir(), 'ikrive-cli-'));
      const stdout = output();
      const stderr = output();

      const code = await runJobCli(args, {
        env: envFor(dataDir),
        stdout: stdout.stream,
        stderr: stderr.stream,
      });

      expect(code).toBe(1);
      expect(stderr.text()).toBe('Usage: job <reminders|odometer-nudge>\n');
      expect(stdout.text()).toBe('');
      expect(existsSync(join(dataDir, 'ikrive.db'))).toBe(false);
    }
  });
});
