import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { isBlockedAddress, isBlockedHostname } from '#lib/monitoring/target-guard';

/**
 * Outgoing HTTP for notification channels with anti-SSRF guarantees that `fetch` can't give:
 * every address a hostname resolves to is checked (private, loopback, link-local, CGNAT,
 * multicast, cloud metadata, IPv4-mapped IPv6…) and the socket connects to that already checked
 * address, so DNS rebinding can't swap it afterwards. Redirects are never followed and the
 * answer's body is read up to a limit and thrown away.
 */

/** `fetch`-shaped function: what `postJson` sends through. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Resolves every address of a hostname (injectable so tests don't touch DNS). */
export type Resolver = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

export const systemResolver: Resolver = (hostname) =>
  dns.promises.lookup(hostname, { all: true, verbatim: true });

/** The destination is (or resolves to) an address channels may not reach. */
export class BlockedTargetError extends Error {
  readonly code = 'EBLOCKEDTARGET';
  constructor() {
    super('target resolves to a blocked address');
    this.name = 'BlockedTargetError';
  }
}

export type AddressCheck =
  | { ok: true; addresses: Array<{ address: string; family: number }> }
  | { ok: false; error: 'private_address' | 'unresolvable' };

/** Resolves `hostname` and accepts it only when **every** address is public. */
export async function resolvePublicAddresses(
  hostname: string,
  resolve: Resolver = systemResolver,
): Promise<AddressCheck> {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (isBlockedHostname(host)) return { ok: false, error: 'private_address' };
  if (isIP(host)) return { ok: true, addresses: [{ address: host, family: isIP(host) }] };
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await resolve(host);
  } catch {
    return { ok: false, error: 'unresolvable' };
  }
  if (addresses.length === 0) return { ok: false, error: 'unresolvable' };
  if (addresses.some((entry) => isBlockedAddress(entry.address))) {
    return { ok: false, error: 'private_address' };
  }
  return { ok: true, addresses };
}

/**
 * `lookup` hook for `http(s).request`: the socket only gets addresses that passed
 * `isBlockedAddress`, so what was checked is what it connects to.
 */
export function guardedLookup(resolve: Resolver = systemResolver): LookupFunction {
  return (hostname, options, callback) => {
    resolvePublicAddresses(hostname, resolve).then(
      (checked) => {
        if (!checked.ok) {
          const error = Object.assign(
            checked.error === 'private_address'
              ? new BlockedTargetError()
              : new Error('dns lookup failed'),
            { code: checked.error === 'private_address' ? 'EBLOCKEDTARGET' : 'ENOTFOUND' },
          );
          return callback(error as NodeJS.ErrnoException, '', 4);
        }
        const family = (options as { family?: number }).family;
        const list = family
          ? checked.addresses.filter((entry) => entry.family === family)
          : checked.addresses;
        if (list.length === 0) {
          const error = Object.assign(new Error('dns lookup failed'), { code: 'ENOTFOUND' });
          return callback(error as NodeJS.ErrnoException, '', 4);
        }
        if ((options as { all?: boolean }).all) {
          return (callback as unknown as (e: null, a: typeof list) => void)(null, list);
        }
        callback(null, list[0].address, list[0].family);
      },
      (error) => callback(error as NodeJS.ErrnoException, '', 4),
    );
  };
}

export type GuardedFetchOptions = {
  /** Lifts the address checks (local development and e2e only). */
  allowPrivateTargets?: boolean;
  /** Accepts `http:` URLs (local development only). */
  allowHttp?: boolean;
  /** Bytes of the answer read before the connection is dropped; nothing is kept. */
  maxResponseBytes?: number;
  resolve?: Resolver;
};

export const MAX_RESPONSE_BYTES = 64 * 1024;
/** How long the discarded answer may keep the socket open after its headers. */
const DRAIN_TIMEOUT_MS = 2_000;

function toHeaders(raw: http.IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    try {
      headers.set(name, Array.isArray(value) ? value.join(', ') : value);
    } catch {
      // a header the Fetch API refuses is not one we need
    }
  }
  return headers;
}

/**
 * A `fetch` replacement built on `node:http(s)` with the guarded lookup. It resolves as soon as
 * the status arrives, with an empty body; the real body is drained up to `maxResponseBytes`.
 */
export function createGuardedFetch(options: GuardedFetchOptions = {}): FetchLike {
  const maxBytes = options.maxResponseBytes ?? MAX_RESPONSE_BYTES;
  const lookup = options.allowPrivateTargets ? undefined : guardedLookup(options.resolve);

  return (input, init) =>
    new Promise<Response>((resolve, reject) => {
      let url: URL;
      try {
        url = new URL(input);
      } catch {
        return reject(new TypeError('invalid url'));
      }
      const allowed = url.protocol === 'https:' || (options.allowHttp && url.protocol === 'http:');
      if (!allowed || url.username || url.password) return reject(new BlockedTargetError());
      if (!options.allowPrivateTargets && isBlockedHostname(url.hostname)) {
        return reject(new BlockedTargetError());
      }

      const body = typeof init.body === 'string' ? init.body : '';
      const headers: Record<string, string> = {};
      new Headers(init.headers).forEach((value, name) => {
        headers[name] = value;
      });
      headers['content-length'] = String(Buffer.byteLength(body));

      const client = url.protocol === 'https:' ? https : http;
      const request = client.request(
        url,
        {
          method: init.method ?? 'POST',
          headers,
          signal: init.signal ?? undefined,
          lookup,
          // a fresh connection per delivery: a pooled socket would skip the lookup check
          agent: false,
        },
        (response) => {
          let read = 0;
          const drain = setTimeout(() => response.destroy(), DRAIN_TIMEOUT_MS);
          drain.unref?.();
          response.on('data', (chunk: Buffer) => {
            read += chunk.length;
            if (read > maxBytes) response.destroy();
          });
          response.on('close', () => clearTimeout(drain));
          response.on('error', () => {});

          const status = response.statusCode ?? 0;
          if (status < 200 || status > 599) {
            response.destroy();
            return reject(new Error('invalid http status'));
          }
          resolve(new Response(null, { status, headers: toHeaders(response.headers) }));
        },
      );
      request.on('error', reject);
      request.end(body);
    });
}
