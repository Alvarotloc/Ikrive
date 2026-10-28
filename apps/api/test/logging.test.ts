import { describe, expect, it } from 'vitest';
import { REDACTED_CALENDAR_FEED_URL, redactUrl } from '../src/lib/logging';
import { createTestApp, signUp } from './helpers';

const TOKEN = 'ab'.repeat(40);

describe('redactUrl', () => {
  it('hides any calendar feed path', () => {
    for (const url of [
      `/api/calendar/${TOKEN}.ics`,
      `/api/calendar/${TOKEN}.ics?foo=bar`,
      `/api/calendar/${TOKEN}`,
      `/api/calendar/${TOKEN.slice(3)}.ical#x`,
      '/api/calendar/not-a-token/at/all.ics',
      `/api/%63alendar/${TOKEN}.ics`,
      '/api/calendar/%E0%A4%A.ics',
      `//api/calendar/${TOKEN}.ics`,
      `/api//calendar/${TOKEN}.ics`,
      `///api///calendar///${TOKEN}.ics?x=1`,
      `/API/calendar/${TOKEN}.ics`,
      `/Api/Calendar/${TOKEN.toUpperCase()}.ICS`,
      `/api%2Fcalendar/${TOKEN}.ics`,
      `%2F%2Fapi%2F%2Fcalendar%2F${TOKEN}.ics`,
    ]) {
      expect(redactUrl(url)).toBe(REDACTED_CALENDAR_FEED_URL);
    }
  });

  it('keeps other urls', () => {
    for (const url of [
      '/api/settings/calendar-feed',
      '/api/vehicles?archived=true',
      '/api/calendar',
      '/',
      '/api/vehicles/0b6f1c9e-3a7d-4c1e-9f2a-8d5b6e7c1a2b',
      '/api/vehicles/0b6f1c9e-3a7d-4c1e-9f2a-8d5b6e7c1a2b/schedules?since=2026-01-01',
      `/api/files/${'a'.repeat(31)}`,
    ]) {
      expect(redactUrl(url)).toBe(url);
    }
  });

  it('hides long hex runs anywhere in the url', () => {
    expect(redactUrl(`/api/other/${TOKEN}`)).toBe('/api/other/***');
    expect(redactUrl(`/api/vehicles?t=${TOKEN.toUpperCase()}&x=1`)).toBe('/api/vehicles?t=***&x=1');
    expect(redactUrl(`/x/${'f'.repeat(32)}/y/${'0'.repeat(40)}`)).toBe('/x/***/y/***');
    const encoded = [...TOKEN].map((char, index) =>
      index % 2 ? char : `%${char.charCodeAt(0).toString(16)}`,
    );
    const redacted = redactUrl(`/api/other/${encoded.join('')}`);
    expect(redacted).not.toContain(TOKEN.slice(0, 32));
    expect(redacted).toBe('/api/other/***');
  });
});

describe('request logs', () => {
  it('never log the calendar feed token', async () => {
    const lines: string[] = [];
    const { app } = await createTestApp({}, { logStream: { write: (line: string) => lines.push(line) } });
    const { cookie } = await signUp(app);
    const enabled = await app.inject({
      method: 'POST',
      url: '/api/settings/calendar-feed',
      headers: { cookie },
    });
    const url = new URL((enabled.json() as { url: string }).url);
    const token = /([0-9a-f]{80})\.ics$/.exec(url.pathname)?.[1] ?? '';
    expect(token).toHaveLength(80);

    const ok = await app.inject({ method: 'GET', url: `${url.pathname}?alarm=1` });
    expect(ok.statusCode).toBe(200);
    const missing = await app.inject({ method: 'GET', url: `/api/calendar/${token.slice(1)}.ics` });
    expect(missing.statusCode).toBe(404);
    const nested = await app.inject({ method: 'GET', url: `/api/calendar/${token}/x.ics` });
    expect(nested.statusCode).toBe(404);

    const output = lines.join('');
    expect(output).not.toContain(token);
    expect(output).not.toContain(token.slice(1));
    expect(output).not.toContain(token.slice(0, 16));
    const urls = lines
      .map((line) => JSON.parse(line) as { req?: { url?: string } })
      .flatMap((entry) => (entry.req?.url ? [entry.req.url] : []));
    expect(urls.filter((logged) => logged === REDACTED_CALENDAR_FEED_URL)).toHaveLength(3);
    expect(urls).toContain('/api/settings/calendar-feed');
  });
});
