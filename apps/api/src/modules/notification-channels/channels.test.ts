import type { NotificationChannelConfig } from '@ikrive/shared';
import { describe, expect, it, vi } from 'vitest';
import { buildChannelRequest, type ChannelMessage, createChannel } from './channels';

const message: ChannelMessage = {
  event: 'notification',
  type: 'schedule_overdue',
  title: 'Mantenimiento vencido: Cambio de aceite',
  body: 'Mi coche',
  link: 'https://ikrive.example.com/vehicles/v1',
  createdAt: '2026-10-23T08:00:00.000Z',
};
const withoutLink: ChannelMessage = { ...message, link: null };

const request = (channel: NotificationChannelConfig, msg = message) => {
  const { url, init } = buildChannelRequest(channel, msg);
  return { url, method: init.method, headers: init.headers, body: JSON.parse(String(init.body)) };
};

describe('buildChannelRequest', () => {
  it('builds the ntfy request', () => {
    expect(
      request({ type: 'ntfy', config: { serverUrl: 'https://ntfy.sh', topic: 'car', token: 'tk_1' } }),
    ).toEqual({
      url: 'https://ntfy.sh/',
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer tk_1' },
      body: { topic: 'car', title: message.title, message: 'Mi coche', click: message.link },
    });
    expect(
      request({ type: 'ntfy', config: { serverUrl: 'https://ntfy.sh', topic: 'car' } }, withoutLink),
    ).toEqual({
      url: 'https://ntfy.sh/',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: { topic: 'car', title: message.title, message: 'Mi coche' },
    });
  });

  it('builds the gotify request', () => {
    const channel: NotificationChannelConfig = {
      type: 'gotify',
      config: { serverUrl: 'https://gotify.example.com', token: 'AbC' },
    };
    expect(request(channel)).toEqual({
      url: 'https://gotify.example.com/message',
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-gotify-key': 'AbC' },
      body: {
        title: message.title,
        message: 'Mi coche',
        priority: 5,
        extras: { 'client::notification': { click: { url: message.link } } },
      },
    });
    expect(request(channel, withoutLink).body).toEqual({
      title: message.title,
      message: 'Mi coche',
      priority: 5,
    });
  });

  it('builds the apprise request', () => {
    expect(
      request({ type: 'apprise', config: { serverUrl: 'http://apprise:8000', key: 'ikrive', tag: 'phone' } }),
    ).toEqual({
      url: 'http://apprise:8000/notify/ikrive',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: { title: message.title, body: `Mi coche\n\n${message.link}`, tag: 'phone' },
    });
    expect(
      request(
        { type: 'apprise', config: { serverUrl: 'http://apprise:8000', key: 'ikrive', tag: null } },
        withoutLink,
      ).body,
    ).toEqual({ title: message.title, body: 'Mi coche' });
  });

  it('builds the webhook request', () => {
    const payload = {
      event: 'notification',
      type: 'schedule_overdue',
      title: message.title,
      body: 'Mi coche',
      link: message.link,
      createdAt: message.createdAt,
    };
    expect(
      request({ type: 'webhook', config: { url: 'https://hooks.example.com/x?y=1', token: 's3' } }),
    ).toEqual({
      url: 'https://hooks.example.com/x?y=1',
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer s3' },
      body: payload,
    });
    expect(request({ type: 'webhook', config: { url: 'https://hooks.example.com/x' } })).toEqual({
      url: 'https://hooks.example.com/x',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
    });
  });

  it('joins the server url without a double slash', () => {
    expect(request({ type: 'ntfy', config: { serverUrl: 'https://ntfy.sh//', topic: 'car' } }).url).toBe(
      'https://ntfy.sh/',
    );
    expect(
      request({ type: 'gotify', config: { serverUrl: 'https://example.com/gotify/', token: 't' } }).url,
    ).toBe('https://example.com/gotify/message');
    expect(request({ type: 'apprise', config: { serverUrl: 'http://apprise:8000/', key: 'k' } }).url).toBe(
      'http://apprise:8000/notify/k',
    );
  });
});

describe('createChannel', () => {
  const ntfy: NotificationChannelConfig = {
    type: 'ntfy',
    config: { serverUrl: 'https://ntfy.sh', topic: 'car' },
  };

  it('sends the built request with a timeout signal', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('{}', { status: 200 }));
    await expect(createChannel(ntfy, { fetch }).send(message)).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('https://ntfy.sh/');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('fails with the HTTP status on a non-2xx response', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('nope', { status: 401 }));
    await expect(createChannel(ntfy, { fetch }).send(message)).rejects.toThrow(/^HTTP 401$/);
  });

  it('reports network errors with their cause, trimmed', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValue(
        new TypeError('fetch failed', { cause: new Error(`getaddrinfo ENOTFOUND ${'x'.repeat(600)}`) }),
      );
    const error = await createChannel(ntfy, { fetch })
      .send(message)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/^fetch failed: getaddrinfo ENOTFOUND x+…$/);
    expect((error as Error).message).toHaveLength(500);
  });

  it('aborts after the timeout', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    await expect(createChannel(ntfy, { fetch, timeoutMs: 20 }).send(message)).rejects.toThrow(
      'Timeout after 20 ms',
    );
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});
