import { describe, expect, it, vi } from 'vitest';
import { SlackOAuthClient, SlackOAuthError } from './slack-oauth.client';

const EXCHANGE = {
  clientId: '123.456',
  clientSecret: 'shh',
  code: 'code-1',
  redirectUri: 'https://gitops.example.com/notifications/slack/callback',
};

function reply(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe('SlackOAuthClient', () => {
  it('builds the authorize URL with the incoming-webhook bot scope', () => {
    const url = new URL(
      new SlackOAuthClient().buildAuthorizationUrl({
        clientId: '123.456',
        redirectUri: EXCHANGE.redirectUri,
        state: 'state-1',
      }),
    );
    expect(url.origin + url.pathname).toBe('https://slack.com/oauth/v2/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: '123.456',
      scope: 'incoming-webhook',
      redirect_uri: EXCHANGE.redirectUri,
      state: 'state-1',
    });
  });

  it('exchanges the code with Basic credentials and returns the webhook', async () => {
    const fetchFn = reply({
      ok: true,
      access_token: 'xoxb-secret',
      team: { id: 'T1', name: 'Acme' },
      incoming_webhook: {
        channel: '#alerts',
        channel_id: 'C1',
        configuration_url: 'https://acme.slack.com/services/B1',
        url: 'https://hooks.slack.com/services/T1/B1/xyz',
      },
    });
    const webhook = await new SlackOAuthClient(fetchFn).exchangeCode(EXCHANGE);

    expect(webhook).toEqual({
      url: 'https://hooks.slack.com/services/T1/B1/xyz',
      channel: '#alerts',
      teamName: 'Acme',
    });
    const [endpoint, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(endpoint).toBe('https://slack.com/api/oauth.v2.access');
    expect(new Headers(init.headers).get('authorization')).toBe(
      `Basic ${Buffer.from('123.456:shh').toString('base64')}`,
    );
    const body = new URLSearchParams(String(init.body));
    expect(Object.fromEntries(body)).toEqual({
      code: 'code-1',
      redirect_uri: EXCHANGE.redirectUri,
    });
    expect(init.redirect).toBe('error');
  });

  it("reports Slack's error code", async () => {
    const client = new SlackOAuthClient(reply({ ok: false, error: 'invalid_code' }));
    await expect(client.exchangeCode(EXCHANGE)).rejects.toMatchObject({ code: 'invalid_code' });
  });

  it('does not echo an unexpected error value', async () => {
    const client = new SlackOAuthClient(reply({ ok: false, error: 'https://evil <script>' }));
    await expect(client.exchangeCode(EXCHANGE)).rejects.toMatchObject({ code: 'unknown_error' });
  });

  it('fails when the install returned no webhook', async () => {
    const client = new SlackOAuthClient(reply({ ok: true, access_token: 'xoxb' }));
    await expect(client.exchangeCode(EXCHANGE)).rejects.toMatchObject({ code: 'no_webhook' });
  });

  it('maps HTTP and network failures', async () => {
    await expect(new SlackOAuthClient(reply({}, 503)).exchangeCode(EXCHANGE)).rejects.toMatchObject(
      { code: 'http_503' },
    );
    const offline = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const error = await new SlackOAuthClient(offline).exchangeCode(EXCHANGE).catch((e) => e);
    expect(error).toBeInstanceOf(SlackOAuthError);
    expect(error.code).toBe('network_error');
  });
});
