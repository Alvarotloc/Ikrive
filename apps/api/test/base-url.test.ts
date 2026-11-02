import { describe, expect, it } from 'vitest';
import { isLocalBaseUrl, isLocalHost } from '../src/lib/base-url';

describe('isLocalHost', () => {
  it('treats loopback, private and link-local hosts as local', () => {
    const hosts = [
      'localhost',
      'app.localhost',
      'LOCALHOST',
      'localhost.',
      '0.0.0.0',
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.10',
      '169.254.1.1',
      '100.64.0.1',
      '100.127.255.255',
      '[::1]',
      '[fd12::1]',
      '[fe80::1]',
      '[::ffff:192.168.1.10]',
      'nas.local',
      'ikrive.lan',
      'router.home.arpa',
      'app.internal',
      'nas',
    ];
    for (const host of hosts) expect(isLocalHost(host), host).toBe(true);
  });

  it('treats public domains and addresses as not local', () => {
    const hosts = [
      'ikrive.example.com',
      '8.8.8.8',
      '172.32.0.1',
      '192.169.0.1',
      '100.63.255.255',
      '100.128.0.1',
      '[2001:db8::1]',
      '[::ffff:8.8.8.8]',
      'localhost.example.com',
      'example.local.com',
      'ikrive.tail1234.ts.net',
    ];
    for (const host of hosts) expect(isLocalHost(host), host).toBe(false);
  });

  it('classifies a full BASE_URL by its host', () => {
    expect(isLocalBaseUrl('http://192.168.1.10:3000')).toBe(true);
    expect(isLocalBaseUrl('http://localhost:3000')).toBe(true);
    // The URL parser serializes IPv4-mapped addresses in hex (`[::ffff:c0a8:10a]`).
    expect(isLocalBaseUrl('http://[::ffff:192.168.1.10]:3000')).toBe(true);
    expect(isLocalBaseUrl('http://[::ffff:8.8.8.8]')).toBe(false);
    expect(isLocalBaseUrl('https://ikrive.example.com')).toBe(false);
    expect(isLocalBaseUrl('https://ikrive.tail1234.ts.net')).toBe(false);
  });
});
