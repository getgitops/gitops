import crypto from 'node:crypto';
import { signToken, verifySignedToken } from '#lib/server/infra/tokens';
import {
  DEFAULT_CHANNEL_LOCALE,
  isChannelLocale,
  type ChannelLocale,
} from '#lib/server/infra/notifications/chat-types';
import { translator, type Translate } from '#lib/server/infra/notifications/i18n';
import { MAX_CHANNEL_NAME_LENGTH } from '../domain/notification-channel.domain';
import {
  SLACK_IDENTITY_PROVIDER,
  slackIdentity,
  toSlackWorkspaceView,
  type SlackWorkspace,
  type SlackWorkspaceView,
} from '../domain/slack-workspace.domain';
import type { SlackAppConfig } from '../infrastructure/config/slack-app.config';
import type { ChannelCipher } from '../infrastructure/crypto/channel-cipher';
import type { SlackWorkspaceRepositoryPort } from '../infrastructure/repositories/slack-workspace.repository';
import type { SlackApiResult } from '../infrastructure/slack/slack-api.client';
import { verifySlackSignature } from '../infrastructure/slack/slack-signature';
import type { SlackInstall } from './slack-connect.service';

/** Page that links a Slack user to the GitOps account signed in (needs a session). */
export const SLACK_LINK_PATH = '/notifications/slack/link';
/** Starts the channel picker of a channel named in Slack (no session needed). */
export const SLACK_CONNECT_PATH = '/notifications/slack/connect';
/** Links from Slack replies live this long. */
export const SLACK_LINK_TTL_MS = 10 * 60 * 1000;

const LINK_PURPOSE = 'slack-link';
const CHANNEL_PURPOSE = 'slack-channel';
const CHANNEL_VIEW = 'gitops_channel';
const BOT_TOKEN_PURPOSE = 'slack-bot-token';

/** JSON body answered to Slack (an ephemeral message or a `response_action`). */
export type SlackReply = Record<string, unknown>;

type SlackUser = { id: string; username: string; disabled: boolean };

export type SlackLinkRequest = {
  teamId: string;
  slackUserId: string;
  slackUserName: string | null;
};

/** What `/notifications/slack/connect` needs to start the channel picker. */
export type SlackChannelRequest = {
  userId: string;
  organizationId: string;
  teamId: string;
  slackUserId: string;
  name: string;
  locale: ChannelLocale;
};

export type SlackLinkResult = 'linked' | 'taken' | 'invalid' | 'not_installed' | 'forbidden';

type Dependencies = {
  readConfig: () => SlackAppConfig | null;
  workspaces: SlackWorkspaceRepositoryPort;
  cipher: ChannelCipher;
  api: { openView(token: string, triggerId: string, view: unknown): Promise<SlackApiResult> };
  identities: {
    find(provider: string, providerId: string): Promise<SlackUser | null>;
    link(
      userId: string,
      provider: string,
      providerId: string,
    ): Promise<'linked' | 'taken' | 'not_found'>;
  };
  access: {
    /** `organization:notifications:create` in the organization. */
    canCreateChannels(userId: string, organizationId: string): Promise<boolean>;
    /** Whether the user can see the organization at all (member of it or of one of its projects). */
    canViewOrganization(userId: string, organizationId: string): Promise<boolean>;
    organizationName(organizationId: string): Promise<string | null>;
  };
  channels: { listSlack(organizationId: string): Promise<{ name: string; enabled: boolean }[]> };
  secret: () => string;
  now?: () => number;
};

/**
 * The GitOps Slack app: workspaces installed per organization, and the `/gitops` command that
 * links Slack users to their GitOps accounts and connects channels. A channel connected from Slack
 * still goes through Slack's own channel picker (the only way to get its webhook): the form here
 * only names it, then hands a short-lived link to `/notifications/slack/connect`.
 */
export class SlackAppService {
  private readonly now: () => number;

  constructor(private readonly deps: Dependencies) {
    this.now = deps.now ?? (() => Date.now());
  }

  /** Checks `X-Slack-Signature` with the app's signing secret; `false` while it is not set. */
  verifyRequest(input: { timestamp: string | null; signature: string | null; body: string }) {
    let config: SlackAppConfig | null;
    try {
      config = this.deps.readConfig();
    } catch {
      config = null;
    }
    if (!config?.signingSecret) return false;
    return verifySlackSignature({ ...input, signingSecret: config.signingSecret, now: this.now() });
  }

  // --- workspaces -------------------------------------------------------------------------

  /**
   * Saves the workspace of an install for its organization (the caller checked the permission).
   * A workspace belongs to one organization: installing it from another one is refused.
   */
  async installWorkspace(install: SlackInstall): Promise<'installed' | 'taken'> {
    const existing = await this.deps.workspaces.findByTeamId(install.teamId);
    if (existing && existing.organizationId !== install.organizationId) return 'taken';
    if (existing) {
      await this.deps.workspaces.update(existing.id, {
        teamName: install.teamName,
        botToken: this.deps.cipher.encrypt(existing.id, install.botToken, BOT_TOKEN_PURPOSE),
        locale: install.locale,
        installedByUserId: install.userId,
      });
      return 'installed';
    }
    const id = crypto.randomUUID();
    const timestamp = new Date(this.now()).toISOString();
    await this.deps.workspaces.insert({
      id,
      teamId: install.teamId,
      teamName: install.teamName,
      organizationId: install.organizationId,
      botToken: this.deps.cipher.encrypt(id, install.botToken, BOT_TOKEN_PURPOSE),
      locale: install.locale,
      installedByUserId: install.userId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return 'installed';
  }

  async workspacesOf(organizationId: string): Promise<SlackWorkspaceView[]> {
    return (await this.deps.workspaces.listByOrganization(organizationId)).map(
      toSlackWorkspaceView,
    );
  }

  /**
   * Forgets a workspace of the organization: `/gitops` stops working there until it is installed
   * again. Its channels keep their webhooks (remove the app in Slack to revoke them).
   */
  async removeWorkspace(organizationId: string, workspaceId: string): Promise<boolean> {
    const workspace = (await this.deps.workspaces.listByOrganization(organizationId)).find(
      (item) => item.id === workspaceId,
    );
    if (!workspace) return false;
    await this.deps.workspaces.delete(workspace.id);
    return true;
  }

  // --- /gitops ----------------------------------------------------------------------------

  /** Answers a slash command (already verified). `null` = an empty 200 (a form was opened). */
  async handleCommand(params: URLSearchParams, origin: string): Promise<SlackReply | null> {
    const teamId = params.get('team_id') ?? '';
    const slackUserId = params.get('user_id') ?? '';
    const [action = ''] = (params.get('text') ?? '').trim().toLowerCase().split(/\s+/);

    const workspace = teamId ? await this.deps.workspaces.findByTeamId(teamId) : null;
    const t = translator(workspace?.locale ?? DEFAULT_CHANNEL_LOCALE);
    if (!workspace) return ephemeral(t('notifications.slackApp.notInstalled'));

    switch (action) {
      case 'login':
      case 'link':
        return this.login(workspace, slackUserId, params.get('user_name'), origin, t);
      case 'channel':
      case 'canal':
        return this.openChannelForm(workspace, slackUserId, params.get('trigger_id'), t);
      case 'status':
      case 'estado':
        return this.status(workspace, slackUserId, t);
      default:
        return ephemeral(t('notifications.slackApp.help'));
    }
  }

  /** Answers a form submission or a button click (already verified). */
  async handleInteraction(payload: unknown, origin: string): Promise<SlackReply | null> {
    const data = payload as {
      type?: string;
      team?: { id?: string };
      user?: { id?: string };
      view?: { callback_id?: string; state?: { values?: Record<string, any> } };
    };
    // link buttons also report their click: nothing to do but acknowledge it
    if (data?.type !== 'view_submission' || data.view?.callback_id !== CHANNEL_VIEW) return null;

    const teamId = data.team?.id ?? '';
    const slackUserId = data.user?.id ?? '';
    const values = data.view.state?.values ?? {};
    const workspace = teamId ? await this.deps.workspaces.findByTeamId(teamId) : null;
    const t = translator(workspace?.locale ?? DEFAULT_CHANNEL_LOCALE);
    if (!workspace) return fieldError('name', t('notifications.slackApp.notInstalled'));

    const name = String(values.name?.value?.value ?? '').trim();
    const selected = values.locale?.value?.selected_option?.value;
    const locale: ChannelLocale = isChannelLocale(selected) ? selected : workspace.locale;
    if (!name) return fieldError('name', t('notifications.slackApp.channel.nameRequired'));
    if (name.length > MAX_CHANNEL_NAME_LENGTH) {
      return fieldError('name', t('notifications.slackApp.channel.nameTooLong'));
    }

    // checked again: the account could have changed since the form was opened
    const user = await this.linkedUser(teamId, slackUserId);
    if (!user || user.disabled) return fieldError('name', t('notifications.slackApp.notLinked'));
    if (!(await this.deps.access.canCreateChannels(user.id, workspace.organizationId))) {
      return fieldError('name', t('notifications.slackApp.forbidden'));
    }

    const token = signToken(
      CHANNEL_PURPOSE,
      {
        userId: user.id,
        organizationId: workspace.organizationId,
        teamId,
        slackUserId,
        name,
        locale,
      },
      { secret: this.deps.secret(), ttlMs: SLACK_LINK_TTL_MS, now: this.now() },
    );
    const url = `${origin}${SLACK_CONNECT_PATH}?${new URLSearchParams({ token })}`;
    return { response_action: 'update', view: pickChannelView(t, name, url) };
  }

  /** The channel request behind a `/notifications/slack/connect` link, or `null`. */
  readChannelRequest(token: string | null): SlackChannelRequest | null {
    if (!token) return null;
    const data = verifySignedToken<SlackChannelRequest>(CHANNEL_PURPOSE, token, {
      secret: this.deps.secret(),
      now: this.now(),
    });
    if (
      !data ||
      typeof data.userId !== 'string' ||
      typeof data.organizationId !== 'string' ||
      typeof data.teamId !== 'string' ||
      typeof data.slackUserId !== 'string' ||
      typeof data.name !== 'string' ||
      !data.name.trim()
    ) {
      return null;
    }
    return {
      userId: data.userId,
      organizationId: data.organizationId,
      teamId: data.teamId,
      slackUserId: data.slackUserId,
      name: data.name.trim().slice(0, MAX_CHANNEL_NAME_LENGTH),
      locale: isChannelLocale(data.locale) ? data.locale : DEFAULT_CHANNEL_LOCALE,
    };
  }

  // --- linking accounts -------------------------------------------------------------------

  /** The Slack user behind a `/notifications/slack/link` token, with its workspace, or `null`. */
  async readLinkRequest(
    token: string | null,
  ): Promise<(SlackLinkRequest & { workspace: SlackWorkspaceView }) | null> {
    if (!token) return null;
    const data = verifySignedToken<SlackLinkRequest>(LINK_PURPOSE, token, {
      secret: this.deps.secret(),
      now: this.now(),
    });
    if (!data || typeof data.teamId !== 'string' || typeof data.slackUserId !== 'string') {
      return null;
    }
    const workspace = await this.deps.workspaces.findByTeamId(data.teamId);
    if (!workspace) return null;
    return {
      teamId: data.teamId,
      slackUserId: data.slackUserId,
      slackUserName: typeof data.slackUserName === 'string' ? data.slackUserName : null,
      workspace: toSlackWorkspaceView(workspace),
    };
  }

  /**
   * Links the Slack user of `token` to the signed-in `userId`. The user must belong to the
   * workspace's organization: a link never gives access to another organization.
   */
  async confirmLink(token: string | null, userId: string): Promise<SlackLinkResult> {
    const request = await this.readLinkRequest(token);
    if (!request) return 'invalid';
    if (!(await this.deps.access.canViewOrganization(userId, request.workspace.organizationId))) {
      return 'forbidden';
    }
    const result = await this.deps.identities.link(
      userId,
      SLACK_IDENTITY_PROVIDER,
      slackIdentity(request.teamId, request.slackUserId),
    );
    return result === 'not_found' ? 'invalid' : result;
  }

  // --- commands ---------------------------------------------------------------------------

  private linkedUser(teamId: string, slackUserId: string) {
    return this.deps.identities.find(SLACK_IDENTITY_PROVIDER, slackIdentity(teamId, slackUserId));
  }

  private login(
    workspace: SlackWorkspace,
    slackUserId: string,
    slackUserName: string | null,
    origin: string,
    t: Translate,
  ): SlackReply {
    const token = signToken(
      LINK_PURPOSE,
      { teamId: workspace.teamId, slackUserId, slackUserName },
      { secret: this.deps.secret(), ttlMs: SLACK_LINK_TTL_MS, now: this.now() },
    );
    const url = `${origin}${SLACK_LINK_PATH}?${new URLSearchParams({ token })}`;
    return {
      response_type: 'ephemeral',
      text: t('notifications.slackApp.login.prompt'),
      blocks: [
        section(t('notifications.slackApp.login.prompt')),
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              action_id: 'login',
              style: 'primary',
              text: plain(t('notifications.slackApp.login.button')),
              url,
            },
          ],
        },
        context(t('notifications.slackApp.linkExpires')),
      ],
    };
  }

  private async openChannelForm(
    workspace: SlackWorkspace,
    slackUserId: string,
    triggerId: string | null,
    t: Translate,
  ): Promise<SlackReply | null> {
    const user = await this.linkedUser(workspace.teamId, slackUserId);
    if (!user) return ephemeral(t('notifications.slackApp.notLinked'));
    if (user.disabled) return ephemeral(t('notifications.slackApp.disabled'));
    if (!(await this.deps.access.canCreateChannels(user.id, workspace.organizationId))) {
      return ephemeral(t('notifications.slackApp.forbidden'));
    }
    if (!triggerId) return ephemeral(t('notifications.slackApp.failed', { code: 'no_trigger' }));

    const organization =
      (await this.deps.access.organizationName(workspace.organizationId)) ?? workspace.teamName;
    let botToken: string;
    try {
      botToken = this.deps.cipher.decrypt(workspace.id, workspace.botToken, BOT_TOKEN_PURPOSE);
    } catch {
      return ephemeral(t('notifications.slackApp.failed', { code: 'token' }));
    }
    const opened = await this.deps.api.openView(
      botToken,
      triggerId,
      channelFormView(t, organization, workspace.locale),
    );
    return opened.ok ? null : ephemeral(t('notifications.slackApp.failed', { code: opened.error }));
  }

  private async status(
    workspace: SlackWorkspace,
    slackUserId: string,
    t: Translate,
  ): Promise<SlackReply> {
    const [user, organization, channels] = await Promise.all([
      this.linkedUser(workspace.teamId, slackUserId),
      this.deps.access.organizationName(workspace.organizationId),
      this.deps.channels.listSlack(workspace.organizationId),
    ]);
    const lines = [
      t('notifications.slackApp.status.organization', {
        organization: escapeSlack(organization ?? workspace.organizationId),
      }),
      user
        ? t('notifications.slackApp.status.linked', { username: escapeSlack(user.username) })
        : t('notifications.slackApp.status.notLinked'),
      channels.length
        ? t('notifications.slackApp.status.channels', {
            channels: channels
              .map((channel) =>
                channel.enabled
                  ? escapeSlack(channel.name)
                  : `${escapeSlack(channel.name)} (${t('notifications.slackApp.status.disabled')})`,
              )
              .join(', '),
          })
        : t('notifications.slackApp.status.noChannels'),
    ];
    return ephemeral(lines.join('\n'));
  }
}

// --- Block Kit ------------------------------------------------------------------------------

function plain(text: string) {
  return { type: 'plain_text', text, emoji: true };
}

function section(text: string) {
  return { type: 'section', text: { type: 'mrkdwn', text } };
}

function context(text: string) {
  return { type: 'context', elements: [{ type: 'mrkdwn', text }] };
}

function ephemeral(text: string): SlackReply {
  return { response_type: 'ephemeral', text };
}

function fieldError(block: string, message: string): SlackReply {
  return { response_action: 'errors', errors: { [block]: message } };
}

/** `&`, `<` and `>` are Slack's control characters: names never mention or link anyone. */
export function escapeSlack(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Slack caps modal titles at 24 characters. */
function title(text: string) {
  return plain(text.length > 24 ? `${text.slice(0, 23)}…` : text);
}

function channelFormView(t: Translate, organization: string, locale: ChannelLocale) {
  const option = (value: ChannelLocale) => ({
    text: plain(t(`notifications.slackApp.locale.${value}`)),
    value,
  });
  return {
    type: 'modal',
    callback_id: CHANNEL_VIEW,
    title: title(t('notifications.slackApp.channel.title')),
    submit: plain(t('notifications.slackApp.channel.next')),
    close: plain(t('notifications.slackApp.channel.cancel')),
    blocks: [
      section(
        t('notifications.slackApp.channel.intro', { organization: escapeSlack(organization) }),
      ),
      {
        type: 'input',
        block_id: 'name',
        label: plain(t('notifications.slackApp.channel.name')),
        hint: plain(t('notifications.slackApp.channel.nameHint')),
        element: {
          type: 'plain_text_input',
          action_id: 'value',
          max_length: MAX_CHANNEL_NAME_LENGTH,
          placeholder: plain(t('notifications.slackApp.channel.namePlaceholder')),
        },
      },
      {
        type: 'input',
        block_id: 'locale',
        label: plain(t('notifications.slackApp.channel.locale')),
        element: {
          type: 'static_select',
          action_id: 'value',
          initial_option: option(locale),
          options: [option('es'), option('en')],
        },
      },
    ],
  };
}

function pickChannelView(t: Translate, name: string, url: string) {
  return {
    type: 'modal',
    title: title(t('notifications.slackApp.channel.title')),
    close: plain(t('notifications.slackApp.channel.close')),
    blocks: [
      section(t('notifications.slackApp.channel.pick', { name: escapeSlack(name) })),
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            action_id: 'pick_channel',
            style: 'primary',
            text: plain(t('notifications.slackApp.channel.pickButton')),
            url,
          },
        ],
      },
      context(t('notifications.slackApp.linkExpires')),
    ],
  };
}
