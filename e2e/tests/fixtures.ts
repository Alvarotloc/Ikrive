import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type APIRequestContext, test as base, expect, type TestInfo } from '@playwright/test';

export { expect };

type Messages = { [key: string]: string | Messages };

const messages = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../apps/web/src/i18n/locales/es.json'), 'utf8'),
) as Messages;

/** Spanish text of an i18n key (`a.b.c`) with its `{{var}}` placeholders filled in. */
export function t(key: string, vars: Record<string, string | number> = {}): string {
  let node: string | Messages | undefined = messages;
  for (const part of key.split('.')) {
    node = typeof node === 'object' ? node[part] : undefined;
  }
  if (typeof node !== 'string') throw new Error(`Missing i18n key: ${key}`);
  return node.replace(/\{\{(\w+)\}\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

/** Escapes `text` to be used literally inside a `RegExp`. */
export const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Session of the admin registered by the `setup` project (`storageState` of the other projects). */
export const ADMIN_STORAGE_STATE = join(import.meta.dirname, '../.auth/admin.json');

let clients = 0;

/** A client IP not used by any other test of the run: worker index plus a per-worker counter. */
function nextClientIp(testInfo: TestInfo): string {
  clients += 1;
  return `10.${testInfo.workerIndex % 256}.${Math.floor(clients / 256) % 256}.${clients % 256}`;
}

/**
 * Every test is a separate client (`x-forwarded-for`, trusted by the API): the rate limits of the
 * API and of Better Auth count per IP, so the tests do not share their budget.
 */
export const test = base.extend({
  extraHTTPHeaders: async ({ extraHTTPHeaders }, use, testInfo) => {
    await use({ ...extraHTTPHeaders, 'x-forwarded-for': nextClientIp(testInfo) });
  },
});

/** Number plate unique to this test run (also across `--repeat-each` copies). */
export function uniquePlate(testInfo: TestInfo): string {
  const hash = createHash('sha256')
    .update(`${testInfo.testId}:${testInfo.repeatEachIndex}:${testInfo.retry}`)
    .digest('hex');
  return `E2E${hash.slice(0, 8).toUpperCase()}`;
}

export interface CreatedVehicle {
  id: string;
  make: string;
  model: string;
  plate: string | null;
}

/** Creates a vehicle through the API with the session of `request` (use `page.request`). */
export async function createVehicle(
  request: APIRequestContext,
  data: { make: string; model: string; plate: string },
): Promise<CreatedVehicle> {
  const response = await request.post('/api/vehicles', { data });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as CreatedVehicle;
}

/** 8×8 PNG (the one of `docker/smoke.mjs`), uploaded as an invoice. */
export const PNG_8x8 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWM4+uIBVsQwtCQAwrmjQXD54ngAAAAASUVORK5CYII=',
  'base64',
);
