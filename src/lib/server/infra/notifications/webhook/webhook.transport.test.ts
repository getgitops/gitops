import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyGitOpsSignature } from '../../../../../../docs/webhooks/verify-signature';
import { isRetryableWebhookError, webhookRetryAfter } from '../../http/webhook-request';
import type { FetchLike } from '../../http/guarded-fetch';
import { ChatNotification, type ChannelMessage } from '../chat-notification';
import { DeliveryQueue } from '../delivery-queue';
import { createWebhookTransport, MissingSigningSecretError } from './webhook.transport';

const NOW = new Date('2026-11-25T10:00:00.000Z');
const URL_ = 'https://hooks.example.com/in/abc';

const message: ChannelMessage = {
  title: 'Críticas',
  summary: '3 critical',
  eventLabel: 'Analysis completed',
  fields: [{ label: 'Tool', value: 'Trivy' }],
  link: { url: 'https://gitops.example.com/org/acme/x', label: 'View in GitOps' },
  suppressed: 0,
  text: '[GitOps] Críticas: 3 critical',
  test: false,
  event: {
    id: 'event-1',
    type: 'code_report.analysis.completed',
    occurredAt: '2026-11-25T09:59:00.000Z',
    scope: { organizationId: 'org-1', projectId: 'p1' },
    fields: { tool: 'trivy', 'summary.critical': 3 },
  },
  alert: { id: 'alert-1', name: 'Críticas' },
};

type Captured = { url: string; headers: Record<string, string>; body: string };

function recordingFetch(statuses: Array<number | 'network'> = []) {
  const calls: Captured[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({
      url,
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      body: String(init.body),
    });
    const next = statuses.shift() ?? 204;
    if (next === 'network') throw new Error('ECONNRESET');
    return new Response(null, { status: next, headers: { 'retry-after': '2' } });
  };
  return { fetch, calls };
}

function notification(secrets: string[] = ['whsec_new']) {
  return new ChatNotification({
    channel: 'webhook',
    destination: URL_,
    message,
    deliveryId: 'delivery-1',
    signingSecrets: secrets,
  });
}

describe('webhook transport', () => {
  it('posts the versioned body with the event headers and a verifiable signature', async () => {
    const { fetch, calls } = recordingFetch();
    const transport = createWebhookTransport({ fetch, now: () => NOW });
    await transport.send(notification());

    const [call] = calls;
    expect(call.url).toBe(URL_);
    expect(call.headers).toMatchObject({
      'content-type': 'application/json',
      'user-agent': 'GitOps-Webhooks/1',
      'x-gitops-event': 'code_report.analysis.completed',
      'x-gitops-delivery': 'delivery-1',
    });
    expect(JSON.parse(call.body)).toEqual({
      version: 1,
      deliveryId: 'delivery-1',
      test: false,
      alert: { id: 'alert-1', name: 'Críticas' },
      event: {
        id: 'event-1',
        type: 'code_report.analysis.completed',
        occurredAt: '2026-11-25T09:59:00.000Z',
        scope: { organizationId: 'org-1', projectId: 'p1' },
        fields: { tool: 'trivy', 'summary.critical': 3 },
      },
      link: 'https://gitops.example.com/org/acme/x',
    });
    // no templates nor translated text
    expect(call.body).not.toContain('View in GitOps');
    expect(call.body).not.toContain('Trivy');

    const t = NOW.getTime() / 1000;
    expect(call.headers['x-gitops-signature']).toMatch(new RegExp(`^t=${t},v1=[0-9a-f]{64}$`));
    expect(
      verifyGitOpsSignature(call.body, call.headers['x-gitops-signature'], 'whsec_new', t),
    ).toBe(true);
  });

  it('signs with both secrets during a rotation', async () => {
    const { fetch, calls } = recordingFetch();
    await createWebhookTransport({ fetch, now: () => NOW }).send(
      notification(['whsec_new', 'whsec_old']),
    );
    const header = calls[0].headers['x-gitops-signature'];
    expect(header.match(/v1=/g)).toHaveLength(2);
    const t = NOW.getTime() / 1000;
    expect(verifyGitOpsSignature(calls[0].body, header, 'whsec_old', t)).toBe(true);
    expect(verifyGitOpsSignature(calls[0].body, header, 'whsec_new', t)).toBe(true);
  });

  it('describes a test message as channel.test', async () => {
    const { fetch, calls } = recordingFetch();
    const test = new ChatNotification({
      channel: 'webhook',
      destination: URL_,
      message: { ...message, test: true, event: undefined, alert: undefined, link: null },
      deliveryId: 'delivery-2',
      signingSecrets: ['whsec_new'],
    });
    await createWebhookTransport({ fetch, now: () => NOW }).send(test);
    expect(calls[0].headers['x-gitops-event']).toBe('channel.test');
    expect(JSON.parse(calls[0].body)).toMatchObject({
      test: true,
      alert: null,
      link: null,
      event: { id: null, type: 'channel.test', occurredAt: NOW.toISOString(), fields: {} },
    });
  });

  it('refuses to send unsigned', async () => {
    const { fetch, calls } = recordingFetch();
    await expect(createWebhookTransport({ fetch }).send(notification([]))).rejects.toBeInstanceOf(
      MissingSigningSecretError,
    );
    expect(calls).toHaveLength(0);
  });

  it('validates destinations as free URLs (DNS + private ranges)', async () => {
    const transport = createWebhookTransport({
      resolve: async (host) =>
        host === 'hooks.example.com' ? [{ address: '93.184.216.34', family: 4 }] : [],
    });
    expect(await transport.validateDestination(URL_)).toMatchObject({ ok: true });
    expect(await transport.validateDestination('https://169.254.169.254/x')).toEqual({
      ok: false,
      error: 'private_address',
    });
    expect(transport.signed).toBe(true);
  });
});

describe('webhook delivery retries (DeliveryQueue + withRetry)', () => {
  beforeEach(() => vi.useFakeTimers({ now: NOW }));
  afterEach(() => vi.useRealTimers());

  function queueFor(fetch: FetchLike) {
    const transport = createWebhookTransport({ fetch });
    const outcomes: Array<{ sent: boolean }> = [];
    const queue = new DeliveryQueue<ChatNotification>({
      send: (item) => transport.send(item),
      retry: { isRetryable: isRetryableWebhookError, retryAfterMs: webhookRetryAfter, jitter: 0 },
      logger: { warn: () => {}, error: () => {}, debug: () => {} },
      label: { prefix: '[channels]', noun: 'message', plural: 'messages' },
      onSettled: (_item, outcome) => outcomes.push(outcome),
    });
    return { queue, outcomes };
  }

  it('retries network errors and 5xx with backoff, keeping the delivery id', async () => {
    const { fetch, calls } = recordingFetch(['network', 503, 204]);
    const { queue } = queueFor(fetch);
    const sent = queue.enqueue(notification());

    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(3_999);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(3);

    await expect(sent).resolves.toBe(true);
    expect(new Set(calls.map((call) => call.headers['x-gitops-delivery']))).toEqual(
      new Set(['delivery-1']),
    );
    // every attempt is signed at its own time, so a late retry is still within the tolerance
    expect(calls[2].headers['x-gitops-signature']).toContain(`t=${NOW.getTime() / 1000 + 5}`);
  });

  it('honors Retry-After on 429', async () => {
    const { fetch, calls } = recordingFetch([429, 204]);
    const { queue } = queueFor(fetch);
    const sent = queue.enqueue(notification());
    await vi.advanceTimersByTimeAsync(1_999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    await expect(sent).resolves.toBe(true);
  });

  it.each([400, 401, 404, 410, 301])('does not retry HTTP %s', async (status) => {
    const { fetch, calls } = recordingFetch([status, 204]);
    const { queue, outcomes } = queueFor(fetch);
    const sent = queue.enqueue(notification());
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(sent).resolves.toBe(false);
    expect(calls).toHaveLength(1);
    expect(outcomes).toEqual([{ sent: false, error: expect.objectContaining({ status }) }]);
  });

  it('gives up after 4 attempts', async () => {
    const { fetch, calls } = recordingFetch([500, 500, 500, 500, 204]);
    const { queue } = queueFor(fetch);
    const sent = queue.enqueue(notification());
    await vi.advanceTimersByTimeAsync(1_000 + 4_000 + 16_000);
    await expect(sent).resolves.toBe(false);
    expect(calls).toHaveLength(4);
  });
});
