import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WebhookDeliveryError,
  isRetryableWebhookError,
  webhookRetryAfter,
} from '../../http/webhook-request';
import type { FetchLike } from '../../http/guarded-fetch';
import { ChatNotification, type ChannelMessage } from '../chat-notification';
import { DeliveryQueue } from '../delivery-queue';
import { buildSlackPayload, escapeSlackText, slackDate } from './slack-blocks';
import { createSlackTransport } from './slack.transport';

const NOW = new Date('2026-11-25T10:00:00.000Z');
const HOOK = 'https://hooks.slack.com/services/T000/B000/XXXXXXXX';

const message: ChannelMessage = {
  title: 'Críticas en producción',
  summary: '3 critical, 5 high',
  eventLabel: 'Analysis completed',
  fields: [
    { label: 'Tool', value: 'Trivy' },
    { label: 'Project', value: 'payments' },
  ],
  link: { url: 'https://gitops.example.com/org/acme/projects/payments', label: 'View in GitOps' },
  suppressed: 0,
  text: '[GitOps] Críticas en producción: 3 critical, 5 high',
  test: false,
};

type Captured = { url: string; init: RequestInit; body: unknown };

function recordingFetch(statuses: Array<number | 'network'> = []) {
  const calls: Captured[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(String(init.body)) });
    const next = statuses.shift() ?? 200;
    if (next === 'network') throw new Error('ECONNRESET');
    return new Response('ok', { status: next, headers: { 'retry-after': '2' } });
  };
  return { fetch, calls };
}

function notification(body: ChannelMessage = message) {
  return new ChatNotification({ channel: 'slack', destination: HOOK, message: body });
}

const ES_LABELS = {
  date: 'Fecha',
  changes: 'Cambios',
  before: 'Anterior',
  after: 'Nuevo',
  empty: 'vacío',
};

describe('Slack Block Kit payload', () => {
  it('has the alert, the summary, where and when, the fields and the button', () => {
    expect(
      buildSlackPayload({
        ...message,
        occurredAt: '2026-11-26T08:49:41.000Z',
        location: { label: 'Project', name: 'payments' },
        fields: [{ label: 'Tool', value: 'Trivy' }],
      }),
    ).toEqual({
      text: '[GitOps] Críticas en producción: 3 critical, 5 high',
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Críticas en producción', emoji: false },
        },
        { type: 'section', text: { type: 'mrkdwn', text: '*3 critical, 5 high*' } },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: '*Project*\npayments' },
            {
              type: 'mrkdwn',
              text: '*Date*\n<!date^1795682981^{date_short_pretty} {time}|2026-11-26 08:49 UTC>',
            },
          ],
        },
        { type: 'section', fields: [{ type: 'mrkdwn', text: '*Tool*\nTrivy' }] },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'View in GitOps' },
              url: 'https://gitops.example.com/org/acme/projects/payments',
              action_id: 'open_in_gitops',
            },
          ],
        },
      ],
    });
  });

  it('an update: what changed (before and new, empty when empty), where and when, in one language', () => {
    const payload = buildSlackPayload({
      ...message,
      title: 'Proyecto actualizado',
      summary: 'Proyecto actualizado',
      eventLabel: 'Proyecto actualizado',
      text: '[GitOps] Proyecto actualizado',
      fields: [],
      link: null,
      occurredAt: '2026-11-26T08:49:41.000Z',
      location: { label: 'Proyecto', name: 'Mordor' },
      labels: ES_LABELS,
      changes: [
        { label: 'Descripción', before: null, after: 'Texto nuevo\ncon saltos' },
        { label: 'Nombre', before: 'Mordor', after: 'Mordor 2' },
        { label: 'Ajustes', before: null, after: null },
      ],
    });
    expect(payload.blocks).toEqual([
      { type: 'header', text: { type: 'plain_text', text: 'Proyecto actualizado', emoji: false } },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: '*Proyecto*\nMordor' },
          {
            type: 'mrkdwn',
            text: '*Fecha*\n<!date^1795682981^{date_short_pretty} {time}|2026-11-26 08:49 UTC>',
          },
        ],
      },
      { type: 'divider' },
      { type: 'section', text: { type: 'mrkdwn', text: '*Cambios*' } },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Descripción*\nAnterior: _vacío_\nNuevo: Texto nuevo con saltos',
        },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '*Nombre*\nAnterior: Mordor\nNuevo: Mordor 2' },
      },
      { type: 'section', text: { type: 'mrkdwn', text: '*Ajustes*' } },
    ]);
    expect(JSON.stringify(payload).match(/Proyecto actualizado/g)).toHaveLength(2);
  });

  it('escapes user and event data so it cannot mention people or inject links', () => {
    const payload = buildSlackPayload({
      ...message,
      summary: '<!channel> & <@U123>',
      fields: [{ label: 'Branch <x>', value: '<https://evil.example|click> & more' }],
      changes: [{ label: 'Description', before: '<!here>', after: '<@U1> & co' }],
      location: { label: 'Project', name: '<!everyone>' },
      text: '<!here> deploy',
      note: '2 more <skipped>',
    });
    const raw = JSON.stringify(payload);
    expect(raw).not.toMatch(/<!channel>|<@U123>|<!here>|<!everyone>|<@U1>|<https:/);
    expect(payload.text).toBe('&lt;!here&gt; deploy');
    expect(payload.blocks).toContainEqual({
      type: 'section',
      text: { type: 'mrkdwn', text: '*&lt;!channel&gt; &amp; &lt;@U123&gt;*' },
    });
    expect(payload.blocks).toContainEqual({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Description*\nBefore: &lt;!here&gt;\nNew: &lt;@U1&gt; &amp; co',
      },
    });
    expect(payload.blocks).toContainEqual({
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: '*Branch &lt;x&gt;*\n&lt;https://evil.example|click&gt; &amp; more',
        },
      ],
    });
    expect(payload.blocks).toContainEqual({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: '2 more &lt;skipped&gt;' }],
    });
    expect(escapeSlackText('a&b')).toBe('a&amp;b');
  });

  it('keeps the title as plain text (Slack does not parse it)', () => {
    const payload = buildSlackPayload({ ...message, title: '<!channel> alert' });
    expect(payload.blocks[0]).toMatchObject({
      text: { type: 'plain_text', text: '<!channel> alert' },
    });
  });

  it('renders the date for each reader, with a UTC fallback', () => {
    expect(slackDate('2026-11-26T08:49:41.000Z')).toBe(
      '<!date^1795682981^{date_short_pretty} {time}|2026-11-26 08:49 UTC>',
    );
    expect(slackDate('not a date')).toBeNull();
  });

  it('splits fields in sections of 10 and respects the length limits', () => {
    const payload = buildSlackPayload({
      ...message,
      title: 'x'.repeat(400),
      fields: Array.from({ length: 23 }, (_, i) => ({ label: `F${i}`, value: 'v'.repeat(5000) })),
    });
    const header = payload.blocks[0] as { text: { text: string } };
    expect(Array.from(header.text.text)).toHaveLength(150);
    expect(header.text.text.endsWith('…')).toBe(true);
    const sections = payload.blocks.filter(
      (block): block is { type: 'section'; fields: Array<{ type: 'mrkdwn'; text: string }> } =>
        block.type === 'section' && 'fields' in block,
    );
    expect(sections.map((section) => section.fields.length)).toEqual([10, 10, 3]);
    for (const section of sections) {
      for (const field of section.fields) expect(field.text.length).toBeLessThanOrEqual(2000);
    }
  });

  it('leaves the button out without a link', () => {
    const payload = buildSlackPayload({ ...message, link: null });
    expect(payload.blocks.some((block) => block.type === 'actions')).toBe(false);
  });
});

describe('Slack transport', () => {
  it('posts the Block Kit body as JSON to the webhook', async () => {
    const { fetch, calls } = recordingFetch();
    await createSlackTransport({ fetch }).send(notification());
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(HOOK);
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.redirect).toBe('manual');
    expect(new Headers(calls[0].init.headers).get('content-type')).toBe('application/json');
    expect(calls[0].body).toEqual(buildSlackPayload(message));
  });

  it('is not a signed channel type', () => {
    expect(createSlackTransport().signed).toBeFalsy();
  });

  it.each([
    ['https://hooks.slack.com/services/T0/B0/abc', true],
    ['https://HOOKS.slack.com/services/T0/B0/abc', true],
  ])('accepts %s', (url, ok) => {
    expect(createSlackTransport().validateDestination(url)).toMatchObject({ ok });
  });

  it.each([
    ['https://hooks.slack.com.evil.com/services/T0/B0/x', 'host_not_allowed'],
    ['https://evil.com/services/T0/B0/x', 'host_not_allowed'],
    ['https://slack.com/services/T0/B0/x', 'host_not_allowed'],
    ['http://hooks.slack.com/services/T0/B0/x', 'not_https'],
    ['https://user:pass@hooks.slack.com/services/T0/B0/x', 'credentials'],
    ['https://54.0.0.1/services/T0/B0/x', 'ip_address'],
    ['https://[::1]/services/T0/B0/x', 'ip_address'],
    ['https://hooks.slack.com:8443/services/T0/B0/x', 'port'],
    ['https://hooks.slack.com/workflows/T0/x', 'path_not_allowed'],
    ['not a url', 'invalid_url'],
    ['', 'invalid_url'],
  ])('refuses %s (%s)', (url, error) => {
    expect(createSlackTransport().validateDestination(url)).toEqual({ ok: false, error });
  });

  it('does not follow redirects: a 3xx is a permanent failure', async () => {
    const { fetch, calls } = recordingFetch([302]);
    const error = await createSlackTransport({ fetch })
      .send(notification())
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(WebhookDeliveryError);
    expect(error).toMatchObject({ status: 302, retryable: false, reason: 'redirect' });
    expect(calls).toHaveLength(1);
  });

  describe('timeout', () => {
    beforeEach(() => vi.useFakeTimers({ now: NOW }));
    afterEach(() => vi.useRealTimers());

    it('aborts after 5 s and reports a retryable timeout', async () => {
      const fetch: FetchLike = (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        });
      const sent = createSlackTransport({ fetch })
        .send(notification())
        .catch((caught: unknown) => caught);
      await vi.advanceTimersByTimeAsync(5_000);
      const error = await sent;
      expect(error).toBeInstanceOf(WebhookDeliveryError);
      expect(error).toMatchObject({ status: null, retryable: true, reason: 'timeout' });
    });
  });
});

describe('Slack delivery retries (DeliveryQueue + withRetry)', () => {
  beforeEach(() => vi.useFakeTimers({ now: NOW }));
  afterEach(() => vi.useRealTimers());

  function queueFor(fetch: FetchLike) {
    const transport = createSlackTransport({ fetch });
    const outcomes: Array<{ sent: boolean; error?: unknown }> = [];
    const queue = new DeliveryQueue<ChatNotification>({
      send: (item) => transport.send(item),
      retry: { isRetryable: isRetryableWebhookError, retryAfterMs: webhookRetryAfter, jitter: 0 },
      logger: { warn: () => {}, error: () => {}, debug: () => {} },
      label: { prefix: '[channels]', noun: 'message', plural: 'messages' },
      onSettled: (_item, outcome) => outcomes.push(outcome),
    });
    return { queue, outcomes };
  }

  it('retries 5xx and network errors with backoff', async () => {
    const { fetch, calls } = recordingFetch([500, 'network', 200]);
    const { queue } = queueFor(fetch);
    const sent = queue.enqueue(notification());
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(calls).toHaveLength(3);
    await expect(sent).resolves.toBe(true);
  });

  it('honors Retry-After on 429', async () => {
    const { fetch, calls } = recordingFetch([429, 200]);
    const { queue } = queueFor(fetch);
    const sent = queue.enqueue(notification());
    await vi.advanceTimersByTimeAsync(1_999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    await expect(sent).resolves.toBe(true);
  });

  it.each([400, 403, 404, 410])('gives up at once on HTTP %s (permanent)', async (status) => {
    const { fetch, calls } = recordingFetch([status, 200]);
    const { queue, outcomes } = queueFor(fetch);
    const sent = queue.enqueue(notification());
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(sent).resolves.toBe(false);
    expect(calls).toHaveLength(1);
    expect(outcomes).toEqual([{ sent: false, error: expect.objectContaining({ status }) }]);
    expect((outcomes[0].error as WebhookDeliveryError).summary).toBe(`HTTP ${status}`);
  });
});
