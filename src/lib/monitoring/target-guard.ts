/**
 * SSRF guard for monitor targets. Checks run from inside the platform's network, so by default
 * they may only reach public addresses: loopback, private ranges, link-local (cloud metadata at
 * 169.254.169.254), CGNAT, multicast and reserved ranges are blocked. The check runs on the
 * address the socket actually connects to (see `http-check.ts`), so DNS rebinding can't bypass it.
 */
import { isIP } from 'node:net';

function ipv4ToNumber(address: string): number {
  return address.split('.').reduce((value, octet) => value * 256 + Number(octet), 0);
}

const BLOCKED_V4: [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

function isBlockedIpv4(address: string): boolean {
  const value = ipv4ToNumber(address);
  return BLOCKED_V4.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) >>> 0 === (ipv4ToNumber(base) & mask) >>> 0;
  });
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized === '::' || normalized === '::1') return true;

  // IPv4-mapped / compatible (::ffff:10.0.0.1, ::10.0.0.1)
  const mapped = /^(?:::ffff:|::)(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  if (mapped) return isBlockedIpv4(mapped[1]);
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(normalized);
  if (mappedHex) {
    const high = parseInt(mappedHex[1], 16);
    const low = parseInt(mappedHex[2], 16);
    return isBlockedIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }

  const first = parseInt(normalized.split(':')[0] || '0', 16);
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (first & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (first & 0xff00) === 0xff00 || // ff00::/8 multicast
    normalized.startsWith('64:ff9b:') || // NAT64 can reach private IPv4
    normalized.startsWith('2001:db8:') // documentation
  );
}

/** `true` when `address` (an IP literal) must not be reached by a check. */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address.replace(/^\[|\]$/g, ''));
  if (family === 4) return isBlockedIpv4(address);
  if (family === 6) return isBlockedIpv6(address);
  return true;
}

const BLOCKED_HOSTNAMES = [/^localhost$/i, /\.localhost$/i, /\.internal$/i, /\.local$/i];

/** Cheap pre-check on the hostname, before any DNS lookup. */
export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return isBlockedAddress(host);
  return BLOCKED_HOSTNAMES.some((pattern) => pattern.test(host));
}
