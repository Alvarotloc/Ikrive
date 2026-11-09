import { describe, expect, it, vi } from 'vitest';
import { type MockResponse, mockApi, setServerMode } from '@/test/render';
import { checkServer, parseServerInput } from './check-server';

const health: MockResponse = { body: { status: 'ok', version: '0.1.0' } };

describe('parseServerInput', () => {
  it('parseServerInput completes the scheme and normalizes', () => {
    expect(parseServerInput('ikrive.lan')).toBe('https://ikrive.lan');
    expect(parseServerInput('  192.168.1.10:3000/ ')).toBe('https://192.168.1.10:3000');
    expect(parseServerInput('http://x/')).toBe('http://x');
    expect(parseServerInput('https://x.example.com/ikrive/?a=1')).toBe('https://x.example.com/ikrive');
    expect(parseServerInput('ftp://x')).toBeNull();
    expect(parseServerInput('not a url')).toBeNull();
    expect(parseServerInput('')).toBeNull();
  });

  it('accepts DNS names, IPv4 with port and bracketed IPv6', () => {
    expect(parseServerInput('ikrive.example.com')).toBe('https://ikrive.example.com');
    expect(parseServerInput('192.168.1.10:3000')).toBe('https://192.168.1.10:3000');
    expect(parseServerInput('http://[::1]:3000')).toBe('http://[::1]:3000');
  });

  it('rejects whitespace and escaped hosts even when the URL parser accepts them (Android WebView)', () => {
    // Chromium parses `https://hola mundo` with the host `hola%20mundo`; Node throws. Fake a lenient
    // parser so the check does not depend on the runtime's one.
    class LenientUrl {
      readonly protocol = 'https:';
      readonly hostname = 'hola%20mundo';
      readonly origin = 'https://hola%20mundo';
      readonly pathname = '/';
    }
    vi.stubGlobal('URL', LenientUrl);

    expect(parseServerInput('hola mundo')).toBeNull();
    expect(parseServerInput('https://hola mundo')).toBeNull();
    expect(parseServerInput('hola%20mundo')).toBeNull();
  });
});

describe('checkServer', () => {
  it('adds https:// when the URL has no scheme', async () => {
    const fetchMock = mockApi({ 'GET /health': health });

    expect(await checkServer('ikrive.example.com')).toEqual({ ok: true, url: 'https://ikrive.example.com' });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://ikrive.example.com/api/health');
  });

  it('rejects an invalid URL without fetching', async () => {
    const fetchMock = mockApi({});

    expect(await checkServer('ftp://x')).toEqual({ ok: false, reason: 'invalid' });
    expect(await checkServer('not a url')).toEqual({ ok: false, reason: 'invalid' });
    expect(await checkServer('hola mundo')).toEqual({ ok: false, reason: 'invalid' });
    expect(await checkServer('hola%20mundo')).toEqual({ ok: false, reason: 'invalid' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requests /api/health without cookies nor Authorization', async () => {
    setServerMode('https://previous.example.com', 'tok');
    const fetchMock = mockApi({ 'GET /health': health });

    await checkServer('https://ikrive.example.com');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(input)).toBe('https://ikrive.example.com/api/health');
    expect(init?.credentials).toBe('omit');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(init?.headers).get('authorization')).toBeNull();
  });

  it('reports unreachable when fetch rejects', async () => {
    mockApi({
      'GET /health': () => {
        throw new TypeError('Failed to fetch');
      },
    });
    expect(await checkServer('https://ikrive.example.com')).toEqual({ ok: false, reason: 'unreachable' });

    // A server that never answers: the request is aborted when the time limit runs out.
    mockApi({
      'GET /health': (request) =>
        new Promise<MockResponse>((_resolve, reject) => {
          request.signal.addEventListener('abort', () => reject(request.signal.reason));
        }),
    });
    expect(await checkServer('https://ikrive.example.com', 20)).toEqual({
      ok: false,
      reason: 'unreachable',
    });
  });

  it('reports notIkrive on a non-2xx status or a body that is not a health response', async () => {
    for (const response of [
      { status: 500, body: { type: 'about:blank', title: 'Internal Server Error', status: 500 } },
      { body: {} },
      { body: new Blob(['<!doctype html><title>Router</title>'], { type: 'text/html' }) },
    ] satisfies MockResponse[]) {
      mockApi({ 'GET /health': response });
      expect(await checkServer('https://ikrive.example.com')).toEqual({ ok: false, reason: 'notIkrive' });
    }
  });

  it('returns the normalized URL when the server is Ikrive', async () => {
    // `mockApi` only strips a leading `/api`: a server under a path keeps it.
    mockApi({ 'GET /ikrive/api/health': health });

    expect(await checkServer('https://ikrive.example.com/ikrive/')).toEqual({
      ok: true,
      url: 'https://ikrive.example.com/ikrive',
    });
  });
});
