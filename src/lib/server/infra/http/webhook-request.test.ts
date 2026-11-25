import { afterEach, describe, expect, it, vi } from 'vitest';
import { withRetry } from '../notifications/retry';
import {
  WebhookDeliveryError,
  isRetryableWebhookError,
  postJson,
  validateWebhookUrl,
  webhookRetryAfter,
} from './webhook-request';

const rule = { hosts: ['hooks.slack.com'], pathPrefix: '/services/' };

describe('validateWebhookUrl (anti-SSRF)', () => {
  it('accepts an https URL of an allowed host and path', () => {
    const result = validateWebhookUrl('https://hooks.slack.com/services/T0/B0/abc', rule);
    expect(result).toMatchObject({ ok: true });
  });

  it.each([
    ['http://hooks.slack.com/services/T0', 'not_https'],
    ['https://user:pass@hooks.slack.com/services/T0', 'credentials'],
    ['https://127.0.0.1/services/T0', 'ip_address'],
    ['https://[::1]/services/T0', 'ip_address'],
    ['https://169.254.169.254/services/T0', 'ip_address'],
    ['https://hooks.slack.com:8443/services/T0', 'port'],
    ['https://evil.com/services/T0', 'host_not_allowed'],
    ['https://hooks.slack.com.evil.com/services/T0', 'host_not_allowed'],
    ['https://hooks.slack.com/other/T0', 'path_not_allowed'],
    ['javascript:alert(1)', 'not_https'],
    ['not a url', 'invalid_url'],
    ['', 'invalid_url'],
  ])('rejects %s', (url, error) => {
    expect(validateWebhookUrl(url, rule)).toEqual({ ok: false, error });
  });
});

function response(status: number, headers: Record<string, string> = {}) {
  return new Response(status === 204 ? null : 'secret body', { status, headers });
}

describe('postJson', () => {
  afterEach(() => vi.useRealTimers());

  it('posts JSON without following redirects and accepts any 2xx', async () => {
    const fetch = vi.fn(async () => response(204));
    await postJson('https://hooks.slack.com/services/x', { text: 'hi' }, { fetch });
    expect(fetch).toHaveBeenCalledWith(
      'https://hooks.slack.com/services/x',
      expect.objectContaining({
        method: 'POST',
        redirect: 'manual',
        body: '{"text":"hi"}',
        headers: expect.objectContaining({ 'content-type': 'application/json' }),
      }),
    );
  });

  it('treats 429 and 5xx as retryable, honoring Retry-After', async () => {
    const tooMany = await postJson(
      'https://h/x',
      {},
      {
        fetch: async () => response(429, { 'retry-after': '7' }),
      },
    ).catch((error) => error);
    expect(tooMany).toBeInstanceOf(WebhookDeliveryError);
    expect(tooMany).toMatchObject({ status: 429, retryable: true, retryAfterMs: 7000 });

    const down = await postJson('https://h/x', {}, { fetch: async () => response(503) }).catch(
      (error) => error,
    );
    expect(down).toMatchObject({ status: 503, retryable: true });
  });

  it('treats other 4xx and redirects as permanent', async () => {
    for (const status of [400, 403, 404, 410, 301, 302]) {
      const error = await postJson(
        'https://h/x',
        {},
        { fetch: async () => response(status) },
      ).catch((caught) => caught);
      expect(error).toMatchObject({ status, retryable: false });
      expect(error.summary).toBe(`HTTP ${status}`);
      // the response body never ends up in the error
      expect(String(error.message)).not.toContain('secret body');
    }
  });

  it('times out after 5 s and calls it retryable', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const pending = postJson('https://h/x', {}, { fetch: fetch as never }).catch((error) => error);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await pending).toMatchObject({ status: null, retryable: true, reason: 'timeout' });
  });

  it('retries with withRetry only what may succeed later', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    const statuses = [429, 503, 200];
    const fetch = vi.fn(async () => response(statuses.shift()!, { 'retry-after': '2' }));
    await withRetry(() => postJson('https://h/x', {}, { fetch }), {
      isRetryable: isRetryableWebhookError,
      retryAfterMs: webhookRetryAfter,
      sleep,
      random: () => 0.5,
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    // 429 waits its Retry-After, 503 the regular backoff (4 s for the second retry)
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([2000, 4000]);

    const gone = vi.fn(async () => response(404));
    await expect(
      withRetry(() => postJson('https://h/x', {}, { fetch: gone }), {
        isRetryable: isRetryableWebhookError,
        sleep,
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(gone).toHaveBeenCalledTimes(1);
  });
});
