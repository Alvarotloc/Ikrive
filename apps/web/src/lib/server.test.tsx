import { describe, expect, it } from 'vitest';
import { getServerUrl, getSessionToken, isServerMode, setServerUrl, setSessionToken } from './server';

describe('server URL', () => {
  it('stores the server URL without trailing slashes', () => {
    expect(getServerUrl()).toBeNull();
    expect(isServerMode()).toBe(false);

    setServerUrl('https://ikrive.example.com//');

    expect(getServerUrl()).toBe('https://ikrive.example.com');
    expect(isServerMode()).toBe(true);

    setServerUrl('http://192.168.1.10:3000/');
    expect(getServerUrl()).toBe('http://192.168.1.10:3000');
  });

  it('stores the server URL without query or hash', () => {
    setServerUrl('https://x.example.com/?a=1#b');
    expect(getServerUrl()).toBe('https://x.example.com');

    setServerUrl('https://x.example.com/ikrive/?a=1#b');
    expect(getServerUrl()).toBe('https://x.example.com/ikrive');
  });

  it('rejects a server URL that is not http(s)', () => {
    setServerUrl('https://ikrive.example.com');

    for (const url of ['ftp://x', 'capacitor://localhost', 'ikrive.example.com', 'texto']) {
      expect(() => setServerUrl(url)).toThrow(TypeError);
      expect(getServerUrl()).toBe('https://ikrive.example.com');
    }
  });

  it('clears the token when the server URL changes or is removed', () => {
    setServerUrl('https://ikrive.example.com');
    setSessionToken('token-1');

    // The same URL (even with a trailing slash) keeps the token.
    setServerUrl('https://ikrive.example.com/');
    expect(getSessionToken()).toBe('token-1');

    setServerUrl('https://other.example.com');
    expect(getSessionToken()).toBeNull();

    setSessionToken('token-2');
    setServerUrl(null);
    expect(getSessionToken()).toBeNull();
    expect(getServerUrl()).toBeNull();
  });
});
