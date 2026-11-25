import { isIP } from 'node:net';

/** Why a webhook URL is refused; the UI maps them to `notifications.errors.<code>`. */
export type WebhookUrlError =
  | 'invalid_url'
  | 'not_https'
  | 'credentials'
  | 'ip_address'
  | 'port'
  | 'host_not_allowed'
  | 'path_not_allowed';

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

/** A webhook delivery that failed; `retryable` tells whether trying again may help. */
export class WebhookDeliveryError extends Error {
  constructor(
    /** HTTP status, or `null` for network errors and timeouts. */
    readonly status: number | null,
    readonly retryable: boolean,
    /** `Retry-After` of a 429, in ms. */
    readonly retryAfterMs: number | null = null,
    readonly reason: 'timeout' | 'network' | 'redirect' | 'http' = 'http',
  ) {
    super(
      status === null ? `Webhook delivery failed (${reason})` : `Webhook answered HTTP ${status}`,
    );
    this.name = 'WebhookDeliveryError';
  }

  /** Short description for `lastError` and the logs: never the URL nor the response body. */
  get summary(): string {
    if (this.status !== null) return `HTTP ${this.status}`;
    return this.reason;
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
  fetch?: typeof fetch;
  now?: () => number;
};

/**
 * POSTs `body` as JSON. Any 2xx is a success; the response body is discarded. Redirects are not
 * followed (they would bypass the URL check). Throws `WebhookDeliveryError`: retryable for network
 * errors, timeouts, 429 (with its `Retry-After`) and 5xx; permanent for 3xx and other 4xx.
 */
export async function postJson(
  url: string,
  body: unknown,
  options: PostJsonOptions = {},
): Promise<void> {
  const send = options.fetch ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? WEBHOOK_TIMEOUT_MS);
  let response: Response;
  try {
    response = await send(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...options.headers },
      body: JSON.stringify(body),
      redirect: 'manual',
      signal: controller.signal,
    });
  } catch {
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
