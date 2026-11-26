import { describe, expect, it, vi } from 'vitest';
import {
  SlackOAuthClient,
  SlackOAuthError,
  type SlackIncomingWebhook,
} from '../infrastructure/slack/slack-oauth.client';
import { SlackAppConfigError } from '../infrastructure/config/slack-app.config';
import { SlackConnectError, SlackConnectService, safeReturnTo } from './slack-connect.service';

const NOW = Date.UTC(2026, 10, 26);
const SECRET = 'test-encryption-key';
const REDIRECT = 'https://gitops.example.com/notifications/slack/callback';
const LOCATION = { scope: 'project' as const, organizationId: 'org-1', projectId: 'prj-1' };
const WEBHOOK: SlackIncomingWebhook = {
  url: 'https://hooks.slack.com/services/T1/B1/xyz',
  channel: '#alerts',
  teamName: 'Acme',
};

function setup(
  options: {
    config?: () => { clientId: string; clientSecret: string } | null;
    exchange?: () => Promise<SlackIncomingWebhook>;
  } = {},
) {
  let now = NOW;
  const client = new SlackOAuthClient();
  const exchangeCode = vi
    .spyOn(client, 'exchangeCode')
    .mockImplementation(options.exchange ?? (async () => WEBHOOK));
  const service = new SlackConnectService({
    readConfig: options.config ?? (() => ({ clientId: '123.456', clientSecret: 'shh' })),
    client,
    secret: () => SECRET,
    now: () => now,
    random: () => 'state-1',
  });
  const started = () =>
    service.start({
      userId: 'user-1',
      location: LOCATION,
      locale: 'es',
      returnTo: '/org/acme/projects/web/settings/alerts/settings',
      redirectUri: REDIRECT,
    });
  const complete = (
    flowCookie: string | undefined,
    overrides: Partial<{
      userId: string;
      state: string | null;
      code: string | null;
      error: string | null;
    }> = {},
  ) =>
    service.complete({
      flowCookie,
      userId: 'user-1',
      state: 'state-1',
      code: 'code-1',
      error: null,
      redirectUri: REDIRECT,
      ...overrides,
    });
  return { service, exchangeCode, started, complete, advance: (ms: number) => (now += ms) };
}

describe('SlackConnectService', () => {
  it('reports whether the Slack app is configured', () => {
    expect(setup().service.status()).toEqual({ configured: true });
    expect(setup({ config: () => null }).service.status()).toEqual({
      configured: false,
      reason: 'missing',
    });
    const invalid = setup({
      config: () => {
        throw new SlackAppConfigError('half set');
      },
    });
    expect(invalid.service.status()).toEqual({ configured: false, reason: 'invalid' });
    expect(invalid.service.isConfigured()).toBe(false);
  });

  it('starts with the state in the authorize URL and a signed flow cookie', () => {
    const { started } = setup();
    const { authorizationUrl, flowCookie } = started();
    const url = new URL(authorizationUrl);
    expect(url.searchParams.get('state')).toBe('state-1');
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT);
    expect(url.searchParams.get('client_id')).toBe('123.456');
    // nothing secret in the cookie: it only carries the flow
    expect(flowCookie).not.toContain('shh');
  });

  it('refuses to start without configuration', () => {
    const { started } = setup({ config: () => null });
    expect(started).toThrowError(SlackConnectError);
  });

  it('completes into a connection for the stored location', async () => {
    const { started, complete, exchangeCode } = setup();
    const connection = await complete(started().flowCookie);

    expect(connection).toEqual({
      location: LOCATION,
      locale: 'es',
      returnTo: '/org/acme/projects/web/settings/alerts/settings',
      name: '#alerts (Acme)',
      webhookUrl: WEBHOOK.url,
    });
    expect(exchangeCode).toHaveBeenCalledWith({
      clientId: '123.456',
      clientSecret: 'shh',
      code: 'code-1',
      redirectUri: REDIRECT,
    });
  });

  it('uses the organization scope when the flow has no project', async () => {
    const { service, complete } = setup();
    const { flowCookie } = service.start({
      userId: 'user-1',
      location: { scope: 'organization', organizationId: 'org-1', projectId: null },
      locale: 'xx',
      returnTo: 'https://evil.example.com',
      redirectUri: REDIRECT,
    });
    const connection = await complete(flowCookie);
    expect(connection.location).toEqual({
      scope: 'organization',
      organizationId: 'org-1',
      projectId: null,
    });
    expect(connection.locale).toBe('en');
    expect(connection.returnTo).toBe('/org');
  });

  it.each([
    ['no cookie', undefined, {}],
    ['another user', 'cookie', { userId: 'user-2' }],
    ['a different state', 'cookie', { state: 'state-2' }],
    ['no state', 'cookie', { state: null }],
  ])('rejects %s as an invalid state', async (_label, cookie, overrides) => {
    const { started, complete, exchangeCode } = setup();
    const flowCookie = cookie ? started().flowCookie : undefined;
    await expect(complete(flowCookie, overrides)).rejects.toMatchObject({
      code: 'slack_invalid_state',
    });
    expect(exchangeCode).not.toHaveBeenCalled();
  });

  it('rejects a tampered or expired flow', async () => {
    const { started, complete, advance } = setup();
    const { flowCookie } = started();
    await expect(complete(`${flowCookie}x`)).rejects.toMatchObject({
      code: 'slack_invalid_state',
    });
    advance(11 * 60 * 1000);
    await expect(complete(flowCookie)).rejects.toMatchObject({ code: 'slack_invalid_state' });
  });

  it('reports a cancelled install and keeps the way back', async () => {
    const { started, complete, exchangeCode } = setup();
    const error = await complete(started().flowCookie, { error: 'access_denied' }).catch((e) => e);
    expect(error).toMatchObject({
      code: 'slack_cancelled',
      returnTo: '/org/acme/projects/web/settings/alerts/settings',
    });
    expect(exchangeCode).not.toHaveBeenCalled();
  });

  it('maps exchange failures', async () => {
    const failing = setup({
      exchange: async () => {
        throw new SlackOAuthError('invalid_code');
      },
    });
    await expect(failing.complete(failing.started().flowCookie)).rejects.toMatchObject({
      code: 'slack_exchange_failed',
    });

    const noWebhook = setup({
      exchange: async () => {
        throw new SlackOAuthError('no_webhook');
      },
    });
    await expect(noWebhook.complete(noWebhook.started().flowCookie)).rejects.toMatchObject({
      code: 'slack_no_webhook',
    });
  });

  it('cuts long channel names', async () => {
    const { started, complete } = setup({
      exchange: async () => ({ ...WEBHOOK, channel: `#${'a'.repeat(90)}`, teamName: null }),
    });
    const { name } = await complete(started().flowCookie);
    expect(name).toHaveLength(80);
    expect(name.endsWith('…')).toBe(true);
  });

  it('builds a manifest and creation link for the installation', () => {
    const { service } = setup();
    const manifest = service.manifest('https://gitops.example.com/');
    expect(manifest.oauth_config).toEqual({
      redirect_urls: [REDIRECT],
      scopes: { bot: ['incoming-webhook'] },
    });
    expect(manifest.display_information.name.length).toBeLessThanOrEqual(35);

    const link = new URL(service.manifestUrl('https://gitops.example.com'));
    expect(link.origin + link.pathname).toBe('https://api.slack.com/apps');
    expect(link.searchParams.get('new_app')).toBe('1');
    expect(JSON.parse(link.searchParams.get('manifest_json') ?? '')).toEqual(manifest);
  });
});

describe('safeReturnTo', () => {
  it.each([
    ['/org/acme/settings/alerts/settings', '/org/acme/settings/alerts/settings'],
    ['/org', '/org'],
    ['//evil.example.com', '/org'],
    ['/org//evil.example.com', '/org'],
    ['/\\evil.example.com', '/org'],
    ['https://evil.example.com/org', '/org'],
    ['/auth/logout', '/org'],
    ['/org/acme?x=1', '/org'],
    [42, '/org'],
  ])('%s → %s', (input, expected) => {
    expect(safeReturnTo(input)).toBe(expected);
  });
});
