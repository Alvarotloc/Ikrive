import { isIP } from 'node:net';

/** Name suffixes that only resolve inside a local network (mDNS, home routers, RFC 8375, ICANN private use). */
const LOCAL_SUFFIXES = ['localhost', 'local', 'lan', 'home.arpa', 'internal'];

/** IPv4 ranges not reachable from the internet, as `[first octets, prefix length]`. */
const LOCAL_IPV4_RANGES: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 32],
  ['127.0.0.0', 8],
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  // CGNAT, also used by Tailscale for its node addresses.
  ['100.64.0.0', 10],
  ['169.254.0.0', 16],
];

const ipv4ToNumber = (ip: string) => ip.split('.').reduce((value, octet) => value * 256 + Number(octet), 0);

function isLocalIpv4(ip: string): boolean {
  const value = ipv4ToNumber(ip);
  return LOCAL_IPV4_RANGES.some(([base, prefix]) => {
    const size = 2 ** (32 - prefix);
    return Math.floor(value / size) === Math.floor(ipv4ToNumber(base) / size);
  });
}

function isLocalIpv6(ip: string): boolean {
  // IPv4-mapped addresses: `::ffff:192.168.1.10` (WHATWG URL serializes it as `::ffff:c0a8:10a`).
  const mapped = /^::ffff:(.+)$/.exec(ip)?.[1];
  if (mapped) {
    if (isIP(mapped) === 4) return isLocalIpv4(mapped);
    const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(mapped);
    if (hex?.[1] && hex[2]) {
      const high = Number.parseInt(hex[1], 16);
      const low = Number.parseInt(hex[2], 16);
      return isLocalIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
    }
    return false;
  }
  if (ip === '::1') return true;
  const first = Number.parseInt(ip.split(':')[0] || '0', 16);
  // fc00::/7 (unique local) and fe80::/10 (link-local).
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
}

/**
 * Whether a host name or IP literal is only reachable from the local network: loopback, private,
 * CGNAT/Tailscale, link-local and ULA addresses, `localhost` and the local-only suffixes, and
 * single-label names. Only the literal is classified (no DNS lookup).
 */
export function isLocalHost(hostname: string): boolean {
  const host = hostname
    .replace(/^\[(.*)\]$/, '$1')
    .toLowerCase()
    .replace(/\.$/, '');
  const version = isIP(host);
  if (version === 4) return isLocalIpv4(host);
  if (version === 6) return isLocalIpv6(host);
  if (!host.includes('.')) return true;
  return LOCAL_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

/** Whether `BASE_URL` (already validated as a URL) points to a host only reachable from the local network. */
export const isLocalBaseUrl = (baseUrl: string) => isLocalHost(new URL(baseUrl).hostname);
