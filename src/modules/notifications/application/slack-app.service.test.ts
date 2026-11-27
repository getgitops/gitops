import { describe, expect, it, vi } from 'vitest';
import { createChannelCipher } from '../infrastructure/crypto/channel-cipher';
import { InMemorySlackWorkspaceRepository } from '../infrastructure/repositories/slack-workspace.repository';
import { signSlackRequest } from '../infrastructure/slack/slack-signature';
import type { SlackAppConfig } from '../infrastructure/config/slack-app.config';
import { SLACK_CONNECT_PATH, SLACK_LINK_PATH, SlackAppService } from './slack-app.service';
import type { SlackInstall } from './slack-connect.service';

const NOW = Date.UTC(2026, 10, 27, 12);
const ORIGIN = 'https://gitops.example.com';
const CONFIG: SlackAppConfig = {
  clientId: '123.456',
  clientSecret: 'shh',
  signingSecret: 'signing-secret',
};
const INSTALL: SlackInstall = {
  kind: 'install',
  userId: 'admin-1',
  organizationId: 'org-1',
  locale: 'es',
  returnTo: '/org/acme/settings/alerts/settings',
  teamId: 'T1',
  teamName: 'Acme',
  botToken: 'xoxb-secret',
};

type User = { id: string; username: string; disabled: boolean };

function setup(options: { config?: SlackAppConfig | null; canCreate?: boolean } = {}) {
  const workspaces = new InMemorySlackWorkspaceRepository();
  const cipher = createChannelCipher(() => 'encryption-key');
  const identities = new Map<string, User>();
  const users: Record<string, User> = {
    'user-1': { id: 'user-1', username: 'ana', disabled: false },
    'user-2': { id: 'user-2', username: 'bob', disabled: false },
  };
  const openView = vi.fn(async () => ({ ok: true as const }));
  const members = new Set(['user-1', 'admin-1']);
  const service = new SlackAppService({
    readConfig: () => (options.config === undefined ? CONFIG : options.config),
    workspaces,
    cipher,
    api: { openView },
    identities: {
      async find(provider, providerId) {
        return identities.get(`${provider}/${providerId}`) ?? null;
      },
      async link(userId, provider, providerId) {
        const key = `${provider}/${providerId}`;
        const owner = identities.get(key);
        if (owner && owner.id !== userId) return 'taken';
        if (!users[userId]) return 'not_found';
        identities.set(key, users[userId]);
        return 'linked';
      },
    },
    access: {
      canCreateChannels: async () => options.canCreate ?? true,
      canViewOrganization: async (userId) => members.has(userId),
      organizationName: async () => 'Acme Corp',
    },
    channels: {
      listSlack: async () => [
        { name: 'DevOps ES', enabled: true },
        { name: '<!here>', enabled: false },
      ],
    },
    secret: () => 'token-secret',
    now: () => NOW,
  });
  const command = (text: string, extra: Record<string, string> = {}) =>
    service.handleCommand(
      new URLSearchParams({
        team_id: 'T1',
        user_id: 'U1',
        user_name: 'ana.slack',
        trigger_id: 'trigger-1',
        text,
        ...extra,
      }),
      ORIGIN,
    );
  const link = async (userId = 'user-1') => {
    const reply = (await command('login')) as { blocks: any[] };
    const url = new URL(reply.blocks[1].elements[0].url);
    return {
      token: url.searchParams.get('token'),
      result: await service.confirmLink(url.searchParams.get('token'), userId),
    };
  };
  const submit = (name: string, locale = 'en', ids = { team: 'T1', user: 'U1' }) =>
    service.handleInteraction(
      {
        type: 'view_submission',
        team: { id: ids.team },
        user: { id: ids.user },
        view: {
          callback_id: 'gitops_channel',
          state: {
            values: {
              name: { value: { type: 'plain_text_input', value: name } },
              locale: { value: { selected_option: { value: locale } } },
            },
          },
        },
      },
      ORIGIN,
    );
  return { service, workspaces, cipher, openView, command, link, submit, members };
}

describe('SlackAppService', () => {
  describe('request signatures', () => {
    it('accepts what Slack signs and refuses the rest', () => {
      const { service } = setup();
      const timestamp = String(Math.floor(NOW / 1000));
      const body = 'command=%2Fgitops&text=status';
      const signature = signSlackRequest('signing-secret', timestamp, body);
      expect(service.verifyRequest({ timestamp, signature, body })).toBe(true);
      expect(service.verifyRequest({ timestamp, signature, body: `${body}x` })).toBe(false);
      expect(service.verifyRequest({ timestamp, signature: 'v0=00', body })).toBe(false);
      // a replay after 5 minutes
      const old = String(Math.floor(NOW / 1000) - 301);
      expect(
        service.verifyRequest({
          timestamp: old,
          signature: signSlackRequest('signing-secret', old, body),
          body,
        }),
      ).toBe(false);
    });

    it('refuses everything without a signing secret', () => {
      const { service } = setup({ config: { ...CONFIG, signingSecret: null } });
      const timestamp = String(Math.floor(NOW / 1000));
      const signature = signSlackRequest('', timestamp, 'x');
      expect(service.verifyRequest({ timestamp, signature, body: 'x' })).toBe(false);
    });
  });

  describe('workspaces', () => {
    it('stores the workspace with its token encrypted and never shows it', async () => {
      const { service, workspaces, cipher } = setup();
      expect(await service.installWorkspace(INSTALL)).toBe('installed');
      const [stored] = [...workspaces.rows.values()];
      expect(stored.botToken).not.toContain('xoxb');
      expect(cipher.decrypt(stored.id, stored.botToken, 'slack-bot-token')).toBe('xoxb-secret');
      const [view] = await service.workspacesOf('org-1');
      expect(view).toMatchObject({ teamId: 'T1', teamName: 'Acme', locale: 'es' });
      expect(view).not.toHaveProperty('botToken');
    });

    it('reinstalls in place, but never moves a workspace to another organization', async () => {
      const { service, workspaces } = setup();
      await service.installWorkspace(INSTALL);
      expect(await service.installWorkspace({ ...INSTALL, teamName: 'Acme Inc' })).toBe(
        'installed',
      );
      expect(workspaces.rows.size).toBe(1);
      expect([...workspaces.rows.values()][0].teamName).toBe('Acme Inc');
      expect(await service.installWorkspace({ ...INSTALL, organizationId: 'org-2' })).toBe('taken');
    });

    it('removes a workspace of the organization only', async () => {
      const { service } = setup();
      await service.installWorkspace(INSTALL);
      const [view] = await service.workspacesOf('org-1');
      expect(await service.removeWorkspace('org-2', view.id)).toBe(false);
      expect(await service.removeWorkspace('org-1', view.id)).toBe(true);
      expect(await service.workspacesOf('org-1')).toEqual([]);
    });
  });

  describe('/gitops', () => {
    it('says the workspace is not connected before the app is installed from GitOps', async () => {
      const { command } = setup();
      const reply = (await command('login')) as { text: string };
      expect(reply.text).toMatch(/GitOps/);
      expect(reply).toMatchObject({ response_type: 'ephemeral' });
    });

    it('answers with help for an unknown action', async () => {
      const { service, command } = setup();
      await service.installWorkspace(INSTALL);
      const reply = (await command('what')) as { text: string };
      expect(reply.text).toContain('/gitops login');
    });

    it('login: a private link that expires, then links the GitOps account', async () => {
      const { service, link } = setup();
      await service.installWorkspace(INSTALL);
      const { token, result } = await link();
      expect(result).toBe('linked');
      const request = await service.readLinkRequest(token);
      expect(request).toMatchObject({
        teamId: 'T1',
        slackUserId: 'U1',
        slackUserName: 'ana.slack',
      });
      expect(request?.workspace.teamName).toBe('Acme');
    });

    it('login: the link points at the link page of this origin', async () => {
      const { service, command } = setup();
      await service.installWorkspace(INSTALL);
      const reply = (await command('login')) as { blocks: any[]; response_type: string };
      expect(reply.response_type).toBe('ephemeral');
      const url = new URL(reply.blocks[1].elements[0].url);
      expect(url.origin + url.pathname).toBe(`${ORIGIN}${SLACK_LINK_PATH}`);
    });

    it('login: refuses an account outside the organization, or a Slack user already linked', async () => {
      const { service, link } = setup();
      await service.installWorkspace(INSTALL);
      expect((await link('user-2')).result).toBe('forbidden');
      expect((await link('user-1')).result).toBe('linked');
      // user-2 joins the organization: the Slack user is still someone else's
      const other = setup();
      await other.service.installWorkspace(INSTALL);
      other.members.add('user-2');
      await other.link('user-1');
      expect((await other.link('user-2')).result).toBe('taken');
    });

    it('login: refuses an invalid or expired token', async () => {
      const { service } = setup();
      await service.installWorkspace(INSTALL);
      expect(await service.confirmLink('v1.x.y', 'user-1')).toBe('invalid');
      expect(await service.confirmLink(null, 'user-1')).toBe('invalid');
    });

    it('channel: asks to log in first, then opens the form with the bot token', async () => {
      const { service, command, link, openView } = setup();
      await service.installWorkspace(INSTALL);
      expect(((await command('channel')) as { text: string }).text).toContain('/gitops login');
      expect(openView).not.toHaveBeenCalled();

      await link();
      expect(await command('channel')).toBeNull();
      expect(openView).toHaveBeenCalledWith(
        'xoxb-secret',
        'trigger-1',
        expect.objectContaining({ type: 'modal', callback_id: 'gitops_channel' }),
      );
    });

    it('channel: needs notifications:create in the organization', async () => {
      const { service, command, link, openView } = setup({ canCreate: false });
      await service.installWorkspace(INSTALL);
      await link();
      expect(((await command('channel')) as { text: string }).text).toBeTruthy();
      expect(openView).not.toHaveBeenCalled();
    });

    it('status: the organization, the account and the Slack channels, escaped', async () => {
      const { service, command, link } = setup();
      await service.installWorkspace(INSTALL);
      await link();
      const { text } = (await command('status')) as { text: string };
      expect(text).toContain('Acme Corp');
      expect(text).toContain('ana');
      expect(text).toContain('DevOps ES');
      expect(text).toContain('&lt;!here&gt;');
      expect(text).not.toContain('<!here>');
    });
  });

  describe('channel form', () => {
    it('turns a valid name into the link that opens the channel picker', async () => {
      const { service, link, submit } = setup();
      await service.installWorkspace(INSTALL);
      await link();
      const reply = (await submit('  DevOps ES  ')) as { response_action: string; view: any };
      expect(reply.response_action).toBe('update');
      const button = reply.view.blocks[1].elements[0];
      const url = new URL(button.url);
      expect(url.origin + url.pathname).toBe(`${ORIGIN}${SLACK_CONNECT_PATH}`);
      expect(service.readChannelRequest(url.searchParams.get('token'))).toEqual({
        userId: 'user-1',
        organizationId: 'org-1',
        teamId: 'T1',
        slackUserId: 'U1',
        name: 'DevOps ES',
        locale: 'en',
      });
    });

    it('reports field errors: empty or long names, unlinked users, no permission', async () => {
      const { service, link, submit } = setup();
      await service.installWorkspace(INSTALL);
      expect(await submit('DevOps')).toMatchObject({ response_action: 'errors' });
      await link();
      expect(await submit('   ')).toMatchObject({ response_action: 'errors' });
      expect(await submit('x'.repeat(81))).toMatchObject({ response_action: 'errors' });

      const denied = setup({ canCreate: false });
      await denied.service.installWorkspace(INSTALL);
      await denied.link();
      expect(await denied.submit('DevOps')).toMatchObject({
        response_action: 'errors',
        errors: { name: expect.any(String) },
      });
    });

    it('acknowledges button clicks and other interactions without a reply', async () => {
      const { service } = setup();
      expect(await service.handleInteraction({ type: 'block_actions' }, ORIGIN)).toBeNull();
      expect(await service.handleInteraction(null, ORIGIN)).toBeNull();
    });

    it('refuses forged or expired channel links', () => {
      const { service } = setup();
      expect(service.readChannelRequest(null)).toBeNull();
      expect(service.readChannelRequest('v1.e30.AAAA')).toBeNull();
    });
  });
});
