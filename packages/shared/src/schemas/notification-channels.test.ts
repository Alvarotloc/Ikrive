import { describe, expect, it } from 'vitest';
import {
  CHANNEL_URL_CREDENTIALS,
  createNotificationChannelSchema,
  updateNotificationChannelSchema,
} from './notification-channels';

const valid = [
  { type: 'ntfy', config: { serverUrl: 'https://ntfy.sh', topic: 'my-car_1', token: 'tk_secret' } },
  { type: 'ntfy', config: { serverUrl: 'http://192.168.1.10:8080', topic: 'car' } },
  { type: 'gotify', config: { serverUrl: 'https://gotify.example.com', token: 'AbC.123' } },
  { type: 'apprise', config: { serverUrl: 'http://apprise:8000', key: 'ikrive', tag: 'phone' } },
  { type: 'apprise', config: { serverUrl: 'http://apprise:8000', key: 'ikrive' } },
  { type: 'webhook', config: { url: 'https://hooks.example.com/ikrive?x=1', token: 'secret' } },
  { type: 'webhook', config: { url: 'https://hooks.example.com/ikrive' } },
] as const;

describe('createNotificationChannelSchema', () => {
  it('accepts a valid config for every channel type', () => {
    for (const body of valid) {
      const result = createNotificationChannelSchema.safeParse(body);
      expect(result.success, JSON.stringify(body)).toBe(true);
      expect(result.data).toMatchObject({ type: body.type, config: { ...body.config } });
    }
  });

  it('rejects an unknown type and missing required fields', () => {
    for (const body of [
      { type: 'email', config: { url: 'https://example.com' } },
      { config: { url: 'https://example.com' } },
      { type: 'gotify', config: { serverUrl: 'https://gotify.example.com' } },
      { type: 'gotify', config: { serverUrl: 'https://gotify.example.com', token: '   ' } },
      { type: 'ntfy', config: { serverUrl: 'https://ntfy.sh' } },
      { type: 'ntfy', config: { serverUrl: 'https://ntfy.sh', topic: 'has spaces' } },
      { type: 'apprise', config: { serverUrl: 'http://apprise:8000', key: '../admin' } },
      { type: 'webhook', config: {} },
      { type: 'webhook' },
    ]) {
      expect(createNotificationChannelSchema.safeParse(body).success, JSON.stringify(body)).toBe(false);
    }
  });

  it('rejects non-http urls', () => {
    for (const url of ['ftp://example.com/hook', 'javascript:alert(1)', 'file:///etc/passwd', 'not a url']) {
      expect(
        createNotificationChannelSchema.safeParse({ type: 'webhook', config: { url } }).success,
        url,
      ).toBe(false);
      expect(
        createNotificationChannelSchema.safeParse({ type: 'ntfy', config: { serverUrl: url, topic: 'car' } })
          .success,
        url,
      ).toBe(false);
    }
  });

  it('rejects urls with credentials', () => {
    for (const url of [
      'https://user:pass@ntfy.example.com',
      'https://user@ntfy.example.com/path',
      'http://:pass@host:8080',
      'HTTPS://user:pass@ntfy.example.com?x=1',
    ]) {
      for (const body of [
        { type: 'webhook', config: { url } },
        { type: 'ntfy', config: { serverUrl: url, topic: 'car' } },
        { type: 'gotify', config: { serverUrl: url, token: 'AbC.123' } },
        { type: 'apprise', config: { serverUrl: url, key: 'ikrive' } },
      ]) {
        const result = createNotificationChannelSchema.safeParse(body);
        expect(result.success, JSON.stringify(body)).toBe(false);
        const field = body.type === 'webhook' ? 'url' : 'serverUrl';
        expect(result.error?.issues).toEqual([
          expect.objectContaining({ path: ['config', field], message: CHANNEL_URL_CREDENTIALS }),
        ]);
      }
    }
    // An `@` outside the host part is not a credential.
    for (const url of [
      'https://hooks.example.com/to/ada@example.com',
      'https://hooks.example.com/?to=a@b#c@d',
    ]) {
      expect(
        createNotificationChannelSchema.safeParse({ type: 'webhook', config: { url } }).success,
        url,
      ).toBe(true);
    }
    expect(
      updateNotificationChannelSchema.safeParse({ type: 'gotify', config: { serverUrl: 'https://u:p@host' } })
        .success,
    ).toBe(false);
  });

  it('defaults enabled to true', () => {
    expect(createNotificationChannelSchema.parse(valid[0]).enabled).toBe(true);
    expect(createNotificationChannelSchema.parse({ ...valid[0], enabled: false }).enabled).toBe(false);
  });
});

describe('updateNotificationChannelSchema', () => {
  it('update schema makes the token optional', () => {
    const body = { type: 'gotify', config: { serverUrl: 'https://gotify.example.com' } };
    expect(createNotificationChannelSchema.safeParse(body).success).toBe(false);
    expect(updateNotificationChannelSchema.parse(body)).toEqual(body);
    expect(updateNotificationChannelSchema.parse({ type: 'ntfy', enabled: false })).toEqual({
      type: 'ntfy',
      enabled: false,
    });
    expect(updateNotificationChannelSchema.safeParse({ enabled: false }).success).toBe(false);
    expect(
      updateNotificationChannelSchema.safeParse({ type: 'webhook', config: { url: 'ftp://example.com' } })
        .success,
    ).toBe(false);
  });
});
