import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isValidExpectedStatus, matchesExpectedStatus } from './expected-status';
import { runHttpCheck } from './http-check';
import { isBlockedAddress, isBlockedHostname } from './target-guard';
import type { CheckRequest } from './types';

describe('expected status', () => {
  it('accepts codes and ranges', () => {
    expect(isValidExpectedStatus('200-299')).toBe(true);
    expect(isValidExpectedStatus('200, 204,301-302')).toBe(true);
    expect(matchesExpectedStatus('200-299,301', 301)).toBe(true);
    expect(matchesExpectedStatus('200-299', 503)).toBe(false);
  });

  it('rejects malformed expressions', () => {
    for (const bad of ['', 'abc', '99', '600', '300-200', '200-', '2000']) {
      expect(isValidExpectedStatus(bad)).toBe(false);
    }
  });
});

describe('target guard', () => {
  it('blocks loopback, private, link-local and metadata addresses', () => {
    for (const address of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      'fd00::1',
      'fe80::1',
      '::ffff:10.0.0.1',
      '::ffff:a00:1',
    ]) {
      expect(isBlockedAddress(address), address).toBe(true);
    }
  });

  it('allows public addresses', () => {
    for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '172.32.0.1']) {
      expect(isBlockedAddress(address), address).toBe(false);
    }
  });

  it('blocks internal hostnames before resolving them', () => {
    expect(isBlockedHostname('localhost')).toBe(true);
    expect(isBlockedHostname('gitops.railway.internal')).toBe(true);
    expect(isBlockedHostname('printer.local')).toBe(true);
    expect(isBlockedHostname('[::1]')).toBe(true);
    expect(isBlockedHostname('api.example.com')).toBe(false);
  });
});

describe('runHttpCheck', () => {
  let server: http.Server;
  let base = '';
  const seen: http.IncomingHttpHeaders[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      seen.push(req.headers);
      if (req.url === '/ok') return res.writeHead(200, { 'x-app': 'demo' }).end('{"ok":true}');
      if (req.url === '/fail') return res.writeHead(503).end('nope');
      if (req.url === '/slow') return setTimeout(() => res.writeHead(200).end('late'), 120);
      if (req.url === '/hang') return; // never answers
      if (req.url === '/redirect') return res.writeHead(302, { location: '/ok' }).end();
      if (req.url === '/loop') return res.writeHead(302, { location: '/loop' }).end();
      res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.closeAllConnections();
    server.close();
  });

  const request = (path: string, extra: Partial<CheckRequest> = {}): CheckRequest => ({
    url: `${base}${path}`,
    method: 'GET',
    headers: { Authorization: 'Bearer secret' },
    body: null,
    timeoutMs: 2_000,
    expectedStatus: '200-299',
    degradedThresholdMs: 0,
    followRedirects: true,
    ...extra,
  });
  const allow = { allowPrivateTargets: true };

  it('reports up with the status, latency and a preview', async () => {
    const { outcome, preview } = await runHttpCheck(request('/ok'), { ...allow, preview: true });
    expect(outcome).toMatchObject({ status: 'up', httpStatus: 200, cause: null, error: null });
    expect(outcome.latencyMs).toBeGreaterThanOrEqual(0);
    expect(preview?.bodyPreview).toBe('{"ok":true}');
    expect(preview?.responseHeaders['x-app']).toBe('demo');
    expect(seen.at(-1)?.authorization).toBe('Bearer secret');
    expect(seen.at(-1)?.['user-agent']).toContain('GitOps-Monitor');
  });

  it('reports an unexpected status as down', async () => {
    const { outcome } = await runHttpCheck(request('/fail'), allow);
    expect(outcome).toMatchObject({ status: 'down', cause: 'unexpected_status', httpStatus: 503 });
  });

  it('marks a slow answer as degraded', async () => {
    const { outcome } = await runHttpCheck(request('/slow', { degradedThresholdMs: 50 }), allow);
    expect(outcome).toMatchObject({ status: 'degraded', cause: 'slow_response', httpStatus: 200 });
  });

  it('times out', async () => {
    const { outcome } = await runHttpCheck(request('/hang', { timeoutMs: 150 }), allow);
    expect(outcome).toMatchObject({ status: 'down', cause: 'timeout' });
  });

  it('follows redirects, and stops on loops', async () => {
    const followed = await runHttpCheck(request('/redirect'), { ...allow, preview: true });
    expect(followed.outcome.status).toBe('up');
    expect(followed.preview?.redirects).toBe(1);

    const loop = await runHttpCheck(request('/loop'), allow);
    expect(loop.outcome).toMatchObject({ status: 'down', cause: 'too_many_redirects' });

    const notFollowed = await runHttpCheck(
      request('/redirect', { followRedirects: false, expectedStatus: '302' }),
      allow,
    );
    expect(notFollowed.outcome).toMatchObject({ status: 'up', httpStatus: 302 });
  });

  it('refuses private targets unless they are allowed, without leaking the URL', async () => {
    const { outcome } = await runHttpCheck(request('/ok?token=abc'), {
      allowPrivateTargets: false,
    });
    expect(outcome).toMatchObject({ status: 'down', cause: 'blocked_target' });
    expect(outcome.error).not.toContain('abc');
  });

  it('reports a refused connection and an invalid url', async () => {
    const refused = await runHttpCheck(request('', { url: 'http://127.0.0.1:1/' }), allow);
    expect(refused.outcome).toMatchObject({ status: 'down', cause: 'connection' });
    const invalid = await runHttpCheck(request('', { url: 'not a url' }), allow);
    expect(invalid.outcome).toMatchObject({ status: 'down', cause: 'invalid_url' });
  });
});
