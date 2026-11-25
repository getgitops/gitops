import { isIP } from 'node:net';
import { resolvePublicAddresses, type FetchLike, type Resolver } from './guarded-fetch';

/** Why a webhook URL is refused; the UI maps them to `notifications.errors.<code>`. */
export type WebhookUrlError =
  | 'invalid_url'
  | 'not_https'
  | 'credentials'
  | 'ip_address'
  | 'port'
  | 'host_not_allowed'
  | 'path_not_allowed'
  | 'private_address'
  | 'unresolvable';

export type WebhookUrlRule = {
  /** Exact host names the URL may point at (`hooks.slack.com`). */
  hosts: readonly string[];
  /** Required path prefix (`/services/`). */
  pathPrefix?: string;
};

const MAX_URL_LENGTH = 2048;

/**
 * Anti-SSRF check of a webhook URL whose provider is known: `https` only, no credentials, no IP
 * literal, the default port, an allowed host and path. Run it before saving **and** before every
 * send (the stored value could have been changed in GitDB by hand).
 */
export function validateWebhookUrl(
  raw: unknown,
  rule: WebhookUrlRule,
): { ok: true; url: URL } | { ok: false; error: WebhookUrlError } {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > MAX_URL_LENGTH) {
    return { ok: false, error: 'invalid_url' };
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: 'invalid_url' };
  }
  if (url.protocol !== 'https:') return { ok: false, error: 'not_https' };
  if (url.username || url.password) return { ok: false, error: 'credentials' };
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (isIP(host)) return { ok: false, error: 'ip_address' };
  if (url.port && url.port !== '443') return { ok: false, error: 'port' };
  if (!rule.hosts.includes(host)) return { ok: false, error: 'host_not_allowed' };
  if (rule.pathPrefix && !url.pathname.startsWith(rule.pathPrefix)) {
    return { ok: false, error: 'path_not_allowed' };
  }
  return { ok: true, url };
}

export type OpenWebhookUrlOptions = {
  /** Accepts `http:` (local development only). */
  allowHttp?: boolean;
  /** Skips the address checks (local development and e2e only). */
  allowPrivateTargets?: boolean;
  resolve?: Resolver;
};

/**
 * Anti-SSRF check of a URL anyone can type (generic webhooks): there is no host allow-list, so the
 * hostname is resolved and refused when **any** of its addresses is private, loopback, link-local,
 * CGNAT, multicast or the cloud metadata one (IPv4 and IPv6, mapped forms included). `https` only
 * and no credentials. Run before saving and before every send; the request itself then connects
 * only to checked addresses (`createGuardedFetch`), which closes the DNS rebinding window.
 */
export async function validateOpenWebhookUrl(
  raw: unknown,
  options: OpenWebhookUrlOptions = {},
): Promise<{ ok: true; url: URL } | { ok: false; error: WebhookUrlError }> {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > MAX_URL_LENGTH) {
    return { ok: false, error: 'invalid_url' };
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: 'invalid_url' };
  }
  const httpAllowed = options.allowHttp && url.protocol === 'http:';
  if (url.protocol !== 'https:' && !httpAllowed) return { ok: false, error: 'not_https' };
  if (url.username || url.password) return { ok: false, error: 'credentials' };
  if (!url.hostname) return { ok: false, error: 'invalid_url' };
  if (options.allowPrivateTargets) return { ok: true, url };
  const checked = await resolvePublicAddresses(url.hostname, options.resolve);
  return checked.ok ? { ok: true, url } : { ok: false, error: checked.error };
}

/** A webhook delivery that failed; `retryable` tells whether trying again may help. */
export class WebhookDeliveryError extends Error {
  constructor(
    /** HTTP status, or `null` for network errors and timeouts. */
    readonly status: number | null,
    readonly retryable: boolean,
    /** `Retry-After` of a 429, in ms. */
    readonly retryAfterMs: number | null = null,
    readonly reason: 'timeout' | 'network' | 'redirect' | 'blocked' | 'http' = 'http',
  ) {
    super(
      status === null ? `Webhook delivery failed (${reason})` : `Webhook answered HTTP ${status}`,
    );
    this.name = 'WebhookDeliveryError';
  }

  /** Short description for `lastError` and the logs: never the URL nor the response body. */
  get summary(): string {
    if (this.status !== null) return `HTTP ${this.status}`;
    return this.reason === 'blocked' ? 'blocked_target' : this.reason;
  }
}

export const WEBHOOK_TIMEOUT_MS = 5_000;
/** Longest `Retry-After` honored; longer waits fall back to the regular backoff. */
const MAX_RETRY_AFTER_MS = 60_000;

function parseRetryAfter(value: string | null, now: number): number | null {
  if (!value) return null;
  const seconds = Number(value);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.min(ms, MAX_RETRY_AFTER_MS);
}

export type PostJsonOptions = {
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** `createGuardedFetch()` for anti-SSRF delivery; global `fetch` by default. */
  fetch?: FetchLike;
  now?: () => number;
};

/**
 * POSTs `body` as JSON. Any 2xx is a success; the response body is discarded. Redirects are not
 * followed (they would bypass the URL check). Throws `WebhookDeliveryError`: retryable for network
 * errors, timeouts, 429 (with its `Retry-After`) and 5xx; permanent for 3xx, other 4xx and blocked
 * destinations.
 */
export function postJson(url: string, body: unknown, options: PostJsonOptions = {}): Promise<void> {
  return postRawJson(url, JSON.stringify(body), options);
}

/**
 * `postJson` with an already serialized body: what is signed must be byte for byte what is sent.
 */
export async function postRawJson(
  url: string,
  rawBody: string,
  options: PostJsonOptions = {},
): Promise<void> {
  const send: FetchLike = options.fetch ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? WEBHOOK_TIMEOUT_MS);
  let response: Response;
  try {
    response = await send(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...options.headers },
      body: rawBody,
      redirect: 'manual',
      signal: controller.signal,
    });
  } catch (error) {
    if ((error as { code?: unknown })?.code === 'EBLOCKEDTARGET') {
      throw new WebhookDeliveryError(null, false, null, 'blocked');
    }
    throw new WebhookDeliveryError(
      null,
      true,
      null,
      controller.signal.aborted ? 'timeout' : 'network',
    );
  } finally {
    clearTimeout(timer);
  }
  // nothing of the answer is kept: it is not ours to log
  await response.body?.cancel().catch(() => {});

  const { status } = response;
  if (status >= 200 && status < 300) return;
  if (status >= 300 && status < 400)
    throw new WebhookDeliveryError(status, false, null, 'redirect');
  if (status === 429) {
    const retryAfter = parseRetryAfter(
      response.headers.get('retry-after'),
      (options.now ?? Date.now)(),
    );
    throw new WebhookDeliveryError(status, true, retryAfter);
  }
  throw new WebhookDeliveryError(status, status >= 500);
}

export function isRetryableWebhookError(error: unknown): boolean {
  return error instanceof WebhookDeliveryError && error.retryable;
}

export function webhookRetryAfter(error: unknown): number | null {
  return error instanceof WebhookDeliveryError ? error.retryAfterMs : null;
}
