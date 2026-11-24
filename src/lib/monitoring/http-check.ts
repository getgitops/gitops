/**
 * Runs one HTTP check. Used by workers (scheduled checks) and by the API ("Test" button).
 *
 * - The whole check, redirects included, must finish within `timeoutMs`.
 * - Unless `allowPrivateTargets`, every address the socket connects to goes through
 *   `isBlockedAddress` inside the DNS `lookup` hook, so a public hostname that resolves (or
 *   redirects) to a private address is refused too.
 * - Credentials (`authorization`, `cookie`, `proxy-authorization`) are not forwarded to a redirect
 *   on another origin.
 * - Errors are reduced to a short code-like message: no URL, no header value ever reaches it.
 */
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import { matchesExpectedStatus } from './expected-status.ts';
import { isBlockedAddress, isBlockedHostname } from './target-guard.ts';
import type { CheckCause, CheckOutcome, CheckPreview, CheckRequest } from './types.ts';

export type HttpCheckOptions = {
  allowPrivateTargets: boolean;
  /** Collect response headers and the start of the body for the "Test" button. */
  preview?: boolean;
  maxRedirects?: number;
};

export type HttpCheckResult = { outcome: CheckOutcome; preview: CheckPreview | null };

const USER_AGENT = 'GitOps-Monitor/1.0 (+https://getgitops.com)';
const PREVIEW_BYTES = 4096;
const MAX_DRAIN_BYTES = 256 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;
const FORBIDDEN_HEADERS = new Set(['host', 'content-length', 'transfer-encoding', 'connection']);
const CREDENTIAL_HEADERS = new Set(['authorization', 'cookie', 'proxy-authorization']);

class CheckError extends Error {
  cause_: CheckCause;
  constructor(cause: CheckCause, message: string) {
    super(message);
    this.cause_ = cause;
  }
}

function guardedLookup(): LookupFunction {
  return (hostname, options, callback) => {
    dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, '', 4);
      const list = addresses as dns.LookupAddress[];
      const blocked = list.find((entry) => isBlockedAddress(entry.address));
      if (blocked || list.length === 0) {
        const error = Object.assign(new Error('target resolves to a blocked address'), {
          code: 'EBLOCKEDTARGET',
        });
        return callback(error, '', 4);
      }
      if ((options as { all?: boolean }).all) {
        return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
      }
      callback(null, list[0].address, list[0].family);
    });
  };
}

function cleanHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    const key = name.trim();
    if (!key || FORBIDDEN_HEADERS.has(key.toLowerCase())) continue;
    result[key] = String(value);
  }
  if (!Object.keys(result).some((key) => key.toLowerCase() === 'user-agent')) {
    result['User-Agent'] = USER_AGENT;
  }
  return result;
}

function causeOf(error: unknown): { cause: CheckCause; message: string } {
  if (error instanceof CheckError) return { cause: error.cause_, message: error.message };
  const err = error as { code?: string; name?: string; message?: string };
  const code = err?.code ?? '';
  if (err?.name === 'AbortError' || err?.name === 'TimeoutError' || code === 'ABORT_ERR') {
    return { cause: 'timeout', message: 'request timed out' };
  }
  if (code === 'EBLOCKEDTARGET') {
    return { cause: 'blocked_target', message: 'target resolves to a blocked address' };
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'ENODATA') {
    return { cause: 'dns', message: `dns lookup failed (${code})` };
  }
  if (
    code.startsWith('ERR_TLS') ||
    code.startsWith('ERR_SSL') ||
    code.includes('CERT') ||
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    code === 'SELF_SIGNED_CERT_IN_CHAIN'
  ) {
    return { cause: 'tls', message: `tls error (${code})` };
  }
  if (code.startsWith('E')) return { cause: 'connection', message: `connection failed (${code})` };
  return { cause: 'error', message: 'request failed' };
}

type HopResult = {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
};

function sendOnce(
  url: URL,
  method: string,
  headers: Record<string, string>,
  body: string | null,
  signal: AbortSignal,
  options: HttpCheckOptions,
): Promise<HopResult> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const requestHeaders = { ...headers };
    if (body !== null && body !== '') {
      requestHeaders['Content-Length'] = String(Buffer.byteLength(body));
    }
    const req = client.request(
      url,
      {
        method,
        headers: requestHeaders,
        signal,
        lookup: options.allowPrivateTargets ? undefined : guardedLookup(),
        // no keep-alive pool: every check measures a fresh connection
        agent: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let kept = 0;
        let read = 0;
        res.on('data', (chunk: Buffer) => {
          read += chunk.length;
          if (options.preview && kept < PREVIEW_BYTES) {
            const slice = chunk.subarray(0, PREVIEW_BYTES - kept);
            chunks.push(slice);
            kept += slice.length;
          }
          if (read > MAX_DRAIN_BYTES) res.destroy();
        });
        const done = () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        res.on('end', done);
        res.on('close', done);
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    if (body !== null && body !== '') req.write(body);
    req.end();
  });
}

function assertTarget(url: URL, options: HttpCheckOptions) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new CheckError('invalid_url', 'only http and https urls are supported');
  }
  if (!options.allowPrivateTargets && isBlockedHostname(url.hostname)) {
    throw new CheckError('blocked_target', 'target is a private or reserved address');
  }
}

export async function runHttpCheck(
  request: CheckRequest,
  options: HttpCheckOptions,
): Promise<HttpCheckResult> {
  const startedAt = new Date();
  const started = performance.now();
  const signal = AbortSignal.timeout(Math.max(1, request.timeoutMs));
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  let url: URL;
  let method: string = request.method;
  let body = request.method === 'GET' || request.method === 'HEAD' ? null : request.body;
  let headers = cleanHeaders(request.headers);
  let redirects = 0;

  const finish = (
    partial: Pick<CheckOutcome, 'status' | 'cause' | 'httpStatus' | 'error'>,
    preview: CheckPreview | null,
  ): HttpCheckResult => ({
    outcome: {
      ...partial,
      latencyMs: Math.round(performance.now() - started),
      startedAt: startedAt.toISOString(),
      endedAt: new Date().toISOString(),
    },
    preview,
  });

  try {
    url = new URL(request.url);
  } catch {
    return finish(
      { status: 'down', cause: 'invalid_url', httpStatus: null, error: 'invalid url' },
      null,
    );
  }

  try {
    for (;;) {
      assertTarget(url, options);
      const hop = await sendOnce(url, method, headers, body, signal, options);
      const location = hop.headers.location;

      if (request.followRedirects && hop.status >= 300 && hop.status < 400 && location) {
        if (redirects >= maxRedirects) {
          throw new CheckError('too_many_redirects', `more than ${maxRedirects} redirects`);
        }
        redirects++;
        const next = new URL(location, url);
        if (next.origin !== url.origin) {
          headers = Object.fromEntries(
            Object.entries(headers).filter(([key]) => !CREDENTIAL_HEADERS.has(key.toLowerCase())),
          );
        }
        if (
          hop.status === 303 ||
          ((hop.status === 301 || hop.status === 302) && method === 'POST')
        ) {
          method = 'GET';
          body = null;
        }
        url = next;
        continue;
      }

      const latencyMs = Math.round(performance.now() - started);
      const preview: CheckPreview | null = options.preview
        ? {
            responseHeaders: Object.fromEntries(
              Object.entries(hop.headers)
                .filter(([key]) => key !== 'set-cookie')
                .map(([key, value]) => [
                  key,
                  Array.isArray(value) ? value.join(', ') : String(value),
                ]),
            ),
            bodyPreview: hop.body,
            finalUrl: url.toString(),
            redirects,
          }
        : null;

      if (!matchesExpectedStatus(request.expectedStatus, hop.status)) {
        return finish(
          {
            status: 'down',
            cause: 'unexpected_status',
            httpStatus: hop.status,
            error: `expected ${request.expectedStatus}, got ${hop.status}`,
          },
          preview,
        );
      }
      if (request.degradedThresholdMs > 0 && latencyMs > request.degradedThresholdMs) {
        return finish(
          {
            status: 'degraded',
            cause: 'slow_response',
            httpStatus: hop.status,
            error: `responded in ${latencyMs} ms (threshold ${request.degradedThresholdMs} ms)`,
          },
          preview,
        );
      }
      return finish({ status: 'up', cause: null, httpStatus: hop.status, error: null }, preview);
    }
  } catch (error) {
    const { cause, message } = causeOf(signal.aborted ? signal.reason : error);
    return finish({ status: 'down', cause, httpStatus: null, error: message }, null);
  }
}
