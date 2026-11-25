import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createGuardedFetch,
  guardedLookup,
  resolvePublicAddresses,
  type Resolver,
} from './guarded-fetch';
import { postRawJson, validateOpenWebhookUrl, WebhookDeliveryError } from './webhook-request';

/** DNS stub: hostname → addresses. Unknown names fail like NXDOMAIN. */
function dnsStub(table: Record<string, string[]>): Resolver {
  return async (hostname) => {
    const addresses = table[hostname];
    if (!addresses) throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
    return addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
  };
}

const resolve = dnsStub({
  'hooks.example.com': ['93.184.216.34'],
  'dual.example.com': ['93.184.216.34', '2606:2800:220:1::1'],
  'rebind.example.com': ['93.184.216.34', '10.0.0.7'],
  'internal.example.com': ['10.1.2.3'],
  'metadata.example.com': ['169.254.169.254'],
  'loop6.example.com': ['::1'],
  'mapped.example.com': ['::ffff:127.0.0.1'],
  'mapped-hex.example.com': ['::ffff:a9fe:a9fe'],
  'cgnat.example.com': ['100.64.0.1'],
  'multicast.example.com': ['224.0.0.1'],
  'ula.example.com': ['fd00::1'],
});

describe('validateOpenWebhookUrl (free URL anti-SSRF)', () => {
  it.each(['https://hooks.example.com/in', 'https://dual.example.com:8443/in?x=1'])(
    'accepts %s',
    async (url) => {
      expect(await validateOpenWebhookUrl(url, { resolve })).toMatchObject({ ok: true });
    },
  );

  it.each([
    ['http://hooks.example.com/in', 'not_https'],
    ['ftp://hooks.example.com/in', 'not_https'],
    ['https://user:pass@hooks.example.com/in', 'credentials'],
    ['https://localhost/in', 'private_address'],
    ['https://api.localhost/in', 'private_address'],
    ['https://127.0.0.1/in', 'private_address'],
    ['https://10.0.0.1/in', 'private_address'],
    ['https://192.168.1.10/in', 'private_address'],
    ['https://169.254.169.254/latest/meta-data', 'private_address'],
    ['https://[::1]/in', 'private_address'],
    ['https://[::ffff:127.0.0.1]/in', 'private_address'],
    ['https://[::ffff:169.254.169.254]/in', 'private_address'],
    ['https://[fe80::1]/in', 'private_address'],
    ['https://internal.example.com/in', 'private_address'],
    ['https://metadata.example.com/in', 'private_address'],
    ['https://rebind.example.com/in', 'private_address'],
    ['https://loop6.example.com/in', 'private_address'],
    ['https://mapped.example.com/in', 'private_address'],
    ['https://mapped-hex.example.com/in', 'private_address'],
    ['https://cgnat.example.com/in', 'private_address'],
    ['https://multicast.example.com/in', 'private_address'],
    ['https://ula.example.com/in', 'private_address'],
    ['https://nowhere.example.com/in', 'unresolvable'],
    ['not a url', 'invalid_url'],
    ['', 'invalid_url'],
  ])('rejects %s (%s)', async (url, error) => {
    expect(await validateOpenWebhookUrl(url, { resolve })).toEqual({ ok: false, error });
  });

  it('only lets http and private targets through with the development flags', async () => {
    expect(
      await validateOpenWebhookUrl('http://127.0.0.1:3000/in', {
        resolve,
        allowHttp: true,
        allowPrivateTargets: true,
      }),
    ).toMatchObject({ ok: true });
    expect(
      await validateOpenWebhookUrl('http://internal.example.com/in', { resolve, allowHttp: true }),
    ).toEqual({ ok: false, error: 'private_address' });
  });
});

describe('guardedLookup (connect to the checked address)', () => {
  const lookup = (hostname: string, options: object = {}) =>
    new Promise<{ error: NodeJS.ErrnoException | null; address: unknown }>((done) =>
      guardedLookup(resolve)(hostname, options, (error, address) => done({ error, address })),
    );

  it('hands the socket the address that was checked', async () => {
    expect(await lookup('hooks.example.com')).toEqual({ error: null, address: '93.184.216.34' });
    expect(await lookup('dual.example.com', { all: true })).toEqual({
      error: null,
      address: [
        { address: '93.184.216.34', family: 4 },
        { address: '2606:2800:220:1::1', family: 6 },
      ],
    });
  });

  it('refuses a name that resolves to a private address at connection time (DNS rebinding)', async () => {
    const { error } = await lookup('rebind.example.com');
    expect(error?.code).toBe('EBLOCKEDTARGET');
    expect((await lookup('mapped.example.com')).error?.code).toBe('EBLOCKEDTARGET');
    expect((await lookup('nowhere.example.com')).error?.code).toBe('ENOTFOUND');
  });

  it('checks every address, not just the first one', async () => {
    expect(await resolvePublicAddresses('rebind.example.com', resolve)).toEqual({
      ok: false,
      error: 'private_address',
    });
  });
});

describe('createGuardedFetch', () => {
  let server: http.Server;
  let base: string;
  const received: Array<{ headers: http.IncomingHttpHeaders; body: string }> = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        received.push({ headers: req.headers, body });
        if (req.url === '/redirect') {
          res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data' }).end();
        } else if (req.url === '/big') {
          res.writeHead(200, { 'content-type': 'text/plain' });
          res.end('x'.repeat(512 * 1024));
        } else if (req.url === '/limited') {
          res.writeHead(429, { 'retry-after': '3' }).end();
        } else {
          res.writeHead(204).end();
        }
      });
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((done) => server.close(() => done())));

  const local = createGuardedFetch({ allowHttp: true, allowPrivateTargets: true });

  it('posts the exact raw body and headers', async () => {
    received.length = 0;
    await postRawJson(`${base}/in`, '{"a":1}', { fetch: local, headers: { 'X-Test': 'yes' } });
    expect(received[0].body).toBe('{"a":1}');
    expect(received[0].headers['x-test']).toBe('yes');
    expect(received[0].headers['content-type']).toBe('application/json');
  });

  it('never follows redirects: a 3xx is a permanent failure', async () => {
    received.length = 0;
    const error = await postRawJson(`${base}/redirect`, '{}', { fetch: local }).catch((e) => e);
    expect(error).toBeInstanceOf(WebhookDeliveryError);
    expect(error).toMatchObject({ status: 302, retryable: false, reason: 'redirect' });
    expect(received).toHaveLength(1);
  });

  it('discards a large answer without failing the delivery', async () => {
    await expect(
      postRawJson(`${base}/big`, '{}', {
        fetch: createGuardedFetch({ ...flags, maxResponseBytes: 1024 }),
      }),
    ).resolves.toBeUndefined();
  });

  it('passes 429 and its Retry-After through', async () => {
    const error = await postRawJson(`${base}/limited`, '{}', { fetch: local }).catch((e) => e);
    expect(error).toMatchObject({ status: 429, retryable: true, retryAfterMs: 3000 });
  });

  it('refuses private targets by default, without retrying', async () => {
    received.length = 0;
    const strict = createGuardedFetch({ allowHttp: true });
    const error = await postRawJson(`${base}/in`, '{}', { fetch: strict }).catch((e) => e);
    expect(error).toMatchObject({ status: null, retryable: false, reason: 'blocked' });
    expect(error.summary).toBe('blocked_target');
    expect(received).toHaveLength(0);
  });

  it('refuses a public name that resolves to a private address when connecting', async () => {
    received.length = 0;
    const port = (server.address() as AddressInfo).port;
    const rebinding = createGuardedFetch({
      allowHttp: true,
      resolve: dnsStub({ 'public.example.com': ['127.0.0.1'] }),
    });
    const error = await postRawJson(`http://public.example.com:${port}/in`, '{}', {
      fetch: rebinding,
    }).catch((e) => e);
    expect(error).toMatchObject({ reason: 'blocked', retryable: false });
    expect(received).toHaveLength(0);
  });

  it('refuses http unless allowed', async () => {
    const error = await postRawJson(`${base}/in`, '{}', {
      fetch: createGuardedFetch({ allowPrivateTargets: true }),
    }).catch((e) => e);
    expect(error).toMatchObject({ reason: 'blocked' });
  });
});

const flags = { allowHttp: true, allowPrivateTargets: true };
