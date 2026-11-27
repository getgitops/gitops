import { describe, expect, it, vi } from 'vitest';
import {
  SlackOAuthClient,
  SlackOAuthError,
  type SlackInstallation,
} from '../infrastructure/slack/slack-oauth.client';
import {
  SlackAppConfigError,
  type SlackAppConfig,
} from '../infrastructure/config/slack-app.config';
import {
  SLACK_DONE_PATH,
  SlackConnectError,
  SlackConnectService,
  safeReturnTo,
  type SlackFlowResult,
} from './slack-connect.service';

const NOW = Date.UTC(2026, 10, 26);
const SECRET = 'test-encryption-key';
const REDIRECT = 'https://gitops.example.com/notifications/slack/callback';
const LOCATION = { scope: 'project' as const, organizationId: 'org-1', projectId: 'prj-1' };
const INSTALLATION: SlackInstallation = {
  teamId: 'T1',
  teamName: 'Acme',
  authedUserId: 'U1',
  botToken: 'xoxb-secret',
  webhook: {
    url: 'https://hooks.slack.com/services/T1/B1/xyz',
    channel: '#alerts',
    channelId: 'C1',
  },
};
const CONFIG: SlackAppConfig = { clientId: '123.456', clientSecret: 'shh', signingSecret: null };

function setup(
  options: {
    config?: () => SlackAppConfig | null;
    exchange?: () => Promise<SlackInstallation>;
  } = {},
) {
  let now = NOW;
  const client = new SlackOAuthClient();
  const exchangeCode = vi
    .spyOn(client, 'exchangeCode')
    .mockImplementation(options.exchange ?? (async () => INSTALLATION));
  const service = new SlackConnectService({
    readConfig: options.config ?? (() => CONFIG),
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
      sessionUserId: string | null;
      state: string | null;
      code: string | null;
      error: string | null;
    }> = {},
  ) =>
    service.complete({
      flowCookie,
      sessionUserId: 'user-1',
      state: 'state-1',
      code: 'code-1',
      error: null,
      redirectUri: REDIRECT,
      ...overrides,
    });
  return { service, exchangeCode, started, complete, advance: (ms: number) => (now += ms) };
}

function as<K extends SlackFlowResult['kind']>(result: SlackFlowResult, kind: K) {
  expect(result.kind).toBe(kind);
  return result as Extract<SlackFlowResult, { kind: K }>;
}

describe('SlackConnectService', () => {
  it('reports whether the Slack app and its command are configured', () => {
    expect(setup().service.status()).toEqual({ configured: true, commands: false });
    const withCommands = setup({ config: () => ({ ...CONFIG, signingSecret: 'sign' }) });
    expect(withCommands.service.status()).toEqual({ configured: true, commands: true });
    expect(withCommands.service.commandsEnabled()).toBe(true);
    expect(setup({ config: () => null }).service.status()).toEqual({
      configured: false,
      reason: 'missing',
      commands: false,
    });
    const invalid = setup({
      config: () => {
        throw new SlackAppConfigError('half set');
      },
    });
    expect(invalid.service.status()).toEqual({
      configured: false,
      reason: 'invalid',
      commands: false,
    });
    expect(invalid.service.isConfigured()).toBe(false);
  });

  it('starts with the state in the authorize URL and a signed flow cookie', () => {
    const { started } = setup();
    const { authorizationUrl, flowCookie } = started();
    const url = new URL(authorizationUrl);
    expect(url.searchParams.get('state')).toBe('state-1');
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT);
    expect(url.searchParams.get('client_id')).toBe('123.456');
    expect(url.searchParams.get('scope')).toBe('incoming-webhook');
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
      kind: 'channel',
      userId: 'user-1',
      location: LOCATION,
      locale: 'es',
      returnTo: '/org/acme/projects/web/settings/alerts/settings',
      name: '#alerts (Acme)',
      webhookUrl: INSTALLATION.webhook?.url,
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
    const connection = as(await complete(flowCookie), 'channel');
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
    ['another user', 'cookie', { sessionUserId: 'user-2' }],
    ['no session', 'cookie', { sessionUserId: null }],
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

  it('maps exchange failures and installs without a webhook', async () => {
    const failing = setup({
      exchange: async () => {
        throw new SlackOAuthError('invalid_code');
      },
    });
    await expect(failing.complete(failing.started().flowCookie)).rejects.toMatchObject({
      code: 'slack_exchange_failed',
    });

    const noWebhook = setup({ exchange: async () => ({ ...INSTALLATION, webhook: null }) });
    await expect(noWebhook.complete(noWebhook.started().flowCookie)).rejects.toMatchObject({
      code: 'slack_no_webhook',
    });
  });

  it('cuts long channel names', async () => {
    const { started, complete } = setup({
      exchange: async () => ({
        ...INSTALLATION,
        teamName: null,
        webhook: {
          url: 'https://hooks.slack.com/x',
          channel: `#${'a'.repeat(90)}`,
          channelId: null,
        },
      }),
    });
    const { name } = as(await complete(started().flowCookie), 'channel');
    expect(name).toHaveLength(80);
    expect(name.endsWith('…')).toBe(true);
  });

  describe('app install', () => {
    const startInstall = (service: SlackConnectService) =>
      service.startInstall({
        userId: 'user-1',
        organizationId: 'org-1',
        locale: 'es',
        returnTo: '/org/acme/settings/alerts/settings',
        redirectUri: REDIRECT,
      });

    it('asks for the commands scope only (no channel picker)', () => {
      const { service } = setup();
      const url = new URL(startInstall(service).authorizationUrl);
      expect(url.searchParams.get('scope')).toBe('commands');
    });

    it('completes into the workspace and its bot token, in the same session', async () => {
      const { service, complete } = setup({
        exchange: async () => ({ ...INSTALLATION, webhook: null }),
      });
      const { flowCookie } = startInstall(service);
      expect(as(await complete(flowCookie), 'install')).toEqual({
        kind: 'install',
        userId: 'user-1',
        organizationId: 'org-1',
        locale: 'es',
        returnTo: '/org/acme/settings/alerts/settings',
        teamId: 'T1',
        teamName: 'Acme',
        botToken: 'xoxb-secret',
      });
      await expect(complete(flowCookie, { sessionUserId: null })).rejects.toMatchObject({
        code: 'slack_invalid_state',
      });
    });

    it('fails when Slack returns no bot token', async () => {
      const { service, complete } = setup({
        exchange: async () => ({ ...INSTALLATION, botToken: null }),
      });
      await expect(complete(startInstall(service).flowCookie)).rejects.toMatchObject({
        code: 'slack_exchange_failed',
      });
    });
  });

  describe('channels connected from Slack', () => {
    const startFromSlack = (service: SlackConnectService) =>
      service.startFromSlack({
        userId: 'user-1',
        organizationId: 'org-1',
        name: 'DevOps ES',
        locale: 'es',
        slackTeamId: 'T1',
        slackUserId: 'U1',
        redirectUri: REDIRECT,
      });

    it('needs no GitOps session and keeps the name typed in Slack', async () => {
      const { service, complete } = setup();
      const result = as(
        await complete(startFromSlack(service).flowCookie, { sessionUserId: null }),
        'command',
      );
      expect(result).toEqual({
        kind: 'command',
        userId: 'user-1',
        location: { scope: 'organization', organizationId: 'org-1', projectId: null },
        locale: 'es',
        returnTo: SLACK_DONE_PATH,
        name: 'DevOps ES',
        webhookUrl: INSTALLATION.webhook?.url,
        teamId: 'T1',
        channelId: 'C1',
      });
    });

    it.each([
      ['another workspace', { teamId: 'T2' }],
      ['another Slack user', { authedUserId: 'U2' }],
    ])('refuses a flow finished in %s', async (_label, overrides) => {
      const { service, complete } = setup({
        exchange: async () => ({ ...INSTALLATION, ...overrides }),
      });
      await expect(
        complete(startFromSlack(service).flowCookie, { sessionUserId: null }),
      ).rejects.toMatchObject({ code: 'slack_wrong_workspace', returnTo: SLACK_DONE_PATH });
    });
  });

  it('builds a manifest and creation link for the installation', () => {
    const { service } = setup();
    const manifest = service.manifest('https://gitops.example.com/');
    expect(manifest.oauth_config).toEqual({
      redirect_urls: [REDIRECT],
      scopes: { bot: ['incoming-webhook', 'commands'] },
    });
    expect(manifest.features.slash_commands).toEqual([
      expect.objectContaining({
        command: '/gitops',
        url: 'https://gitops.example.com/api/slack/commands',
      }),
    ]);
    expect(manifest.settings.interactivity).toEqual({
      is_enabled: true,
      request_url: 'https://gitops.example.com/api/slack/interactions',
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
