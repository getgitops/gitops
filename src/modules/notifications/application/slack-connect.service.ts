import crypto from 'node:crypto';
import { signToken, verifySignedToken } from '#lib/server/infra/tokens';
import {
  DEFAULT_CHANNEL_LOCALE,
  isChannelLocale,
  type ChannelLocale,
} from '#lib/server/infra/notifications/chat-types';
import {
  MAX_CHANNEL_NAME_LENGTH,
  type ChannelLocation,
} from '../domain/notification-channel.domain';
import type { SlackAppConfig } from '../infrastructure/config/slack-app.config';
import {
  SLACK_APP_SCOPES,
  SLACK_CONNECT_SCOPE,
  SLACK_INSTALL_SCOPE,
  SlackOAuthError,
  type SlackOAuthClient,
} from '../infrastructure/slack/slack-oauth.client';

/** Fixed path of the OAuth callback: it is the redirect URL registered in the Slack app. */
export const SLACK_CALLBACK_PATH = '/notifications/slack/callback';
/** Path of the flow cookie: only the callback (and the start from Slack) need it. */
export const SLACK_FLOW_COOKIE_PATH = '/notifications/slack';
export const SLACK_FLOW_COOKIE = 'gitops_slack_flow';
export const SLACK_FLOW_TTL_MS = 10 * 60 * 1000;
/** Request URLs of the `/gitops` command and its forms (manifest). */
export const SLACK_COMMANDS_PATH = '/api/slack/commands';
export const SLACK_INTERACTIONS_PATH = '/api/slack/interactions';
/** Page a channel connected from Slack ends on: "go back to Slack". */
export const SLACK_DONE_PATH = '/notifications/slack/done';

const FLOW_PURPOSE = 'slack-connect';
const DEFAULT_RETURN = '/org';

export type SlackConnectErrorCode =
  /** `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` are missing or half set. */
  | 'slack_not_configured'
  /** The user cancelled in Slack (or Slack refused before issuing a code). */
  | 'slack_cancelled'
  /** Missing, expired or tampered flow, or a different user finishing it. */
  | 'slack_invalid_state'
  /** Slack refused the code or could not be reached. */
  | 'slack_exchange_failed'
  /** The install did not return a webhook (the app lacks the `incoming-webhook` scope). */
  | 'slack_no_webhook'
  /** A flow started from Slack was finished in another workspace or by another Slack user. */
  | 'slack_wrong_workspace';

export class SlackConnectError extends Error {
  constructor(
    readonly code: SlackConnectErrorCode,
    /** Where the user goes back to, when the flow was readable. */
    readonly returnTo: string = DEFAULT_RETURN,
    message: string = code,
  ) {
    super(message);
    this.name = 'SlackConnectError';
  }
}

/**
 * - `channel`: "Add to Slack" from a channels page (needs the same GitOps session at the end).
 * - `install`: installs the app in a workspace for the `/gitops` command (same session).
 * - `command`: a channel connected from `/gitops channel` in Slack; no GitOps session, the flow
 *   is bound to the linked GitOps user and to the Slack workspace and user who started it.
 */
export type SlackFlowKind = 'channel' | 'install' | 'command';

type SlackFlow = {
  kind: SlackFlowKind;
  state: string;
  userId: string;
  organizationId: string;
  projectId: string | null;
  locale: ChannelLocale;
  returnTo: string;
  name: string | null;
  slackTeamId: string | null;
  slackUserId: string | null;
};

/** A channel from "Add to Slack" on a channels page. */
export type SlackConnection = {
  kind: 'channel';
  userId: string;
  location: ChannelLocation;
  locale: ChannelLocale;
  returnTo: string;
  /** Channel name proposal: `#channel (Workspace)`. */
  name: string;
  /** The incoming webhook URL: a secret, encrypted when the channel is saved. */
  webhookUrl: string;
};

/** The app installed in a workspace, from an organization's channels page. */
export type SlackInstall = {
  kind: 'install';
  userId: string;
  organizationId: string;
  locale: ChannelLocale;
  returnTo: string;
  teamId: string;
  teamName: string;
  /** Secret: encrypted when the workspace is saved. */
  botToken: string;
};

/** A channel connected from Slack (`/gitops channel`), named by the user in Slack. */
export type SlackCommandConnection = {
  kind: 'command';
  userId: string;
  location: ChannelLocation;
  locale: ChannelLocale;
  returnTo: string;
  name: string;
  webhookUrl: string;
  teamId: string;
  channelId: string | null;
};

export type SlackFlowResult = SlackConnection | SlackInstall | SlackCommandConnection;

export type SlackConnectStatus =
  | { configured: true; commands: boolean }
  | { configured: false; reason: 'missing' | 'invalid'; commands: false };

export type SlackAppManifest = {
  display_information: { name: string; description: string; background_color: string };
  features: {
    bot_user: { display_name: string; always_online: boolean };
    slash_commands: {
      command: string;
      url: string;
      description: string;
      usage_hint: string;
      should_escape: boolean;
    }[];
  };
  oauth_config: { redirect_urls: string[]; scopes: { bot: string[] } };
  settings: {
    interactivity: { is_enabled: boolean; request_url: string };
    org_deploy_enabled: boolean;
    socket_mode_enabled: boolean;
    token_rotation_enabled: boolean;
  };
};

type Dependencies = {
  /** Throws on a half-set configuration, `null` when not configured. */
  readConfig: () => SlackAppConfig | null;
  client: SlackOAuthClient;
  secret: () => string;
  now?: () => number;
  random?: () => string;
};

/**
 * Slack OAuth v2 for the GitOps app: "Add to Slack" (the `incoming-webhook` scope, so Slack asks
 * for a channel and returns its webhook) and the app install for `/gitops` (the `commands`
 * scope). Nothing is stored here: the flow lives in a signed, short-lived cookie, and the caller
 * saves the channel or the workspace (with the usual permission checks) from the result.
 */
export class SlackConnectService {
  private readonly now: () => number;
  private readonly random: () => string;

  constructor(private readonly deps: Dependencies) {
    this.now = deps.now ?? (() => Date.now());
    this.random = deps.random ?? (() => crypto.randomBytes(32).toString('base64url'));
  }

  status(): SlackConnectStatus {
    try {
      const config = this.deps.readConfig();
      return config
        ? { configured: true, commands: !!config.signingSecret }
        : { configured: false, reason: 'missing', commands: false };
    } catch {
      return { configured: false, reason: 'invalid', commands: false };
    }
  }

  isConfigured(): boolean {
    return this.status().configured;
  }

  /** The `/gitops` command works: the app is configured and has its signing secret. */
  commandsEnabled(): boolean {
    return this.status().commands;
  }

  /** "Add to Slack" from a channels page. */
  start(input: {
    userId: string;
    location: ChannelLocation;
    locale: unknown;
    returnTo: unknown;
    redirectUri: string;
  }): { authorizationUrl: string; flowCookie: string } {
    return this.begin(
      {
        kind: 'channel',
        userId: input.userId,
        organizationId: input.location.organizationId,
        projectId: input.location.projectId,
        locale: input.locale,
        returnTo: safeReturnTo(input.returnTo),
      },
      SLACK_CONNECT_SCOPE,
      input.redirectUri,
    );
  }

  /** Installs the app in a workspace (picked in Slack) for `organizationId`. */
  startInstall(input: {
    userId: string;
    organizationId: string;
    locale: unknown;
    returnTo: unknown;
    redirectUri: string;
  }): { authorizationUrl: string; flowCookie: string } {
    return this.begin(
      {
        kind: 'install',
        userId: input.userId,
        organizationId: input.organizationId,
        projectId: null,
        locale: input.locale,
        returnTo: safeReturnTo(input.returnTo),
      },
      SLACK_INSTALL_SCOPE,
      input.redirectUri,
    );
  }

  /** A channel connected from `/gitops channel`: bound to the Slack workspace and user. */
  startFromSlack(input: {
    userId: string;
    organizationId: string;
    name: string;
    locale: unknown;
    slackTeamId: string;
    slackUserId: string;
    redirectUri: string;
  }): { authorizationUrl: string; flowCookie: string } {
    return this.begin(
      {
        kind: 'command',
        userId: input.userId,
        organizationId: input.organizationId,
        projectId: null,
        locale: input.locale,
        returnTo: SLACK_DONE_PATH,
        name: input.name,
        slackTeamId: input.slackTeamId,
        slackUserId: input.slackUserId,
      },
      SLACK_CONNECT_SCOPE,
      input.redirectUri,
    );
  }

  /** Where the callback goes back to, even on failure (when the flow cookie is still valid). */
  returnToOf(flowCookie: string | undefined): string {
    return this.readFlow(flowCookie)?.returnTo ?? DEFAULT_RETURN;
  }

  async complete(input: {
    flowCookie: string | undefined;
    /** The GitOps session's user; `null` without one (enough for flows started from Slack). */
    sessionUserId: string | null;
    state: string | null;
    code: string | null;
    /** Slack's `error` query parameter (`access_denied` when the user cancels). */
    error: string | null;
    redirectUri: string;
  }): Promise<SlackFlowResult> {
    const flow = this.readFlow(input.flowCookie);
    // flows started in GitOps finish in the same session; flows from Slack are checked against
    // the Slack identity below instead (the browser may have no GitOps session at all)
    if (!flow || (flow.kind !== 'command' && flow.userId !== input.sessionUserId)) {
      throw new SlackConnectError('slack_invalid_state', flow?.returnTo);
    }
    if (input.error) throw new SlackConnectError('slack_cancelled', flow.returnTo);
    if (!input.state || !safeEqual(flow.state, input.state)) {
      throw new SlackConnectError('slack_invalid_state', flow.returnTo);
    }
    if (!input.code) throw new SlackConnectError('slack_exchange_failed', flow.returnTo);

    let config: SlackAppConfig;
    try {
      config = this.requireConfig();
    } catch (error) {
      if (error instanceof SlackConnectError) {
        throw new SlackConnectError(error.code, flow.returnTo);
      }
      throw error;
    }

    let installation;
    try {
      installation = await this.deps.client.exchangeCode({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        code: input.code,
        redirectUri: input.redirectUri,
      });
    } catch (error) {
      if (error instanceof SlackOAuthError) {
        throw new SlackConnectError(
          'slack_exchange_failed',
          flow.returnTo,
          `Slack OAuth: ${error.code}`,
        );
      }
      throw error;
    }

    const location: ChannelLocation = {
      scope: flow.projectId ? 'project' : 'organization',
      organizationId: flow.organizationId,
      projectId: flow.projectId,
    };

    if (flow.kind === 'install') {
      if (!installation.teamId || !installation.botToken) {
        throw new SlackConnectError('slack_exchange_failed', flow.returnTo, 'Slack OAuth: no bot');
      }
      return {
        kind: 'install',
        userId: flow.userId,
        organizationId: flow.organizationId,
        locale: flow.locale,
        returnTo: flow.returnTo,
        teamId: installation.teamId,
        teamName: installation.teamName ?? installation.teamId,
        botToken: installation.botToken,
      };
    }

    if (flow.kind === 'command') {
      // the link from Slack could have been forwarded: only the workspace and the Slack user that
      // ran the command may finish it
      if (
        installation.teamId !== flow.slackTeamId ||
        installation.authedUserId !== flow.slackUserId
      ) {
        throw new SlackConnectError('slack_wrong_workspace', flow.returnTo);
      }
    }

    if (!installation.webhook) throw new SlackConnectError('slack_no_webhook', flow.returnTo);

    if (flow.kind === 'command') {
      return {
        kind: 'command',
        userId: flow.userId,
        location,
        locale: flow.locale,
        returnTo: flow.returnTo,
        name: flow.name ?? channelName(installation.webhook.channel, installation.teamName),
        webhookUrl: installation.webhook.url,
        teamId: installation.teamId ?? '',
        channelId: installation.webhook.channelId,
      };
    }
    return {
      kind: 'channel',
      userId: flow.userId,
      location,
      locale: flow.locale,
      returnTo: flow.returnTo,
      name: channelName(installation.webhook.channel, installation.teamName),
      webhookUrl: installation.webhook.url,
    };
  }

  /**
   * Manifest of the Slack app for this installation: `incoming-webhook` and `commands`, the
   * callback of `origin` as redirect URL, and `/gitops` with its form endpoint. Admins create
   * their app from it in one click.
   */
  manifest(origin: string): SlackAppManifest {
    const base = origin.replace(/\/+$/, '');
    return {
      display_information: {
        name: 'GitOps',
        description: 'GitOps alerts in your Slack channels.',
        background_color: '#0b0b0f',
      },
      features: {
        bot_user: { display_name: 'GitOps', always_online: false },
        slash_commands: [
          {
            command: '/gitops',
            url: `${base}${SLACK_COMMANDS_PATH}`,
            description: 'Connect Slack channels to GitOps alerts',
            usage_hint: 'login | channel | status | help',
            should_escape: false,
          },
        ],
      },
      oauth_config: {
        redirect_urls: [`${base}${SLACK_CALLBACK_PATH}`],
        scopes: { bot: [...SLACK_APP_SCOPES] },
      },
      settings: {
        interactivity: { is_enabled: true, request_url: `${base}${SLACK_INTERACTIONS_PATH}` },
        org_deploy_enabled: false,
        socket_mode_enabled: false,
        token_rotation_enabled: false,
      },
    };
  }

  /** Slack's "create app from manifest" link, prefilled with `manifest(origin)`. */
  manifestUrl(origin: string): string {
    const url = new URL('https://api.slack.com/apps');
    url.searchParams.set('new_app', '1');
    url.searchParams.set('manifest_json', JSON.stringify(this.manifest(origin)));
    return url.toString();
  }

  private begin(
    input: Omit<SlackFlow, 'state' | 'locale' | 'name' | 'slackTeamId' | 'slackUserId'> & {
      locale: unknown;
      name?: string;
      slackTeamId?: string;
      slackUserId?: string;
    },
    scope: string,
    redirectUri: string,
  ): { authorizationUrl: string; flowCookie: string } {
    const config = this.requireConfig();
    const flow: SlackFlow = {
      kind: input.kind,
      state: this.random(),
      userId: input.userId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      locale: isChannelLocale(input.locale) ? input.locale : DEFAULT_CHANNEL_LOCALE,
      returnTo: input.returnTo,
      name: input.name ?? null,
      slackTeamId: input.slackTeamId ?? null,
      slackUserId: input.slackUserId ?? null,
    };
    const flowCookie = signToken(FLOW_PURPOSE, flow, {
      secret: this.deps.secret(),
      ttlMs: SLACK_FLOW_TTL_MS,
      now: this.now(),
    });
    const authorizationUrl = this.deps.client.buildAuthorizationUrl({
      clientId: config.clientId,
      redirectUri,
      state: flow.state,
      scope,
    });
    return { authorizationUrl, flowCookie };
  }

  private requireConfig(): SlackAppConfig {
    let config: SlackAppConfig | null;
    try {
      config = this.deps.readConfig();
    } catch {
      config = null;
    }
    if (!config) throw new SlackConnectError('slack_not_configured');
    return config;
  }

  private readFlow(cookie: string | undefined): SlackFlow | null {
    if (!cookie) return null;
    const flow = verifySignedToken<SlackFlow>(FLOW_PURPOSE, cookie, {
      secret: this.deps.secret(),
      now: this.now(),
    });
    if (
      !flow ||
      typeof flow.state !== 'string' ||
      typeof flow.userId !== 'string' ||
      typeof flow.organizationId !== 'string' ||
      (flow.projectId !== null && typeof flow.projectId !== 'string')
    ) {
      return null;
    }
    // cookies issued before flows had a kind were "Add to Slack" ones
    const kind: SlackFlowKind =
      flow.kind === 'install' || flow.kind === 'command' ? flow.kind : 'channel';
    if (kind === 'command' && (!flow.slackTeamId || !flow.slackUserId)) return null;
    return {
      kind,
      state: flow.state,
      userId: flow.userId,
      organizationId: flow.organizationId,
      projectId: flow.projectId,
      locale: isChannelLocale(flow.locale) ? flow.locale : DEFAULT_CHANNEL_LOCALE,
      returnTo: kind === 'command' ? SLACK_DONE_PATH : safeReturnTo(flow.returnTo),
      name: typeof flow.name === 'string' ? flow.name : null,
      slackTeamId: typeof flow.slackTeamId === 'string' ? flow.slackTeamId : null,
      slackUserId: typeof flow.slackUserId === 'string' ? flow.slackUserId : null,
    };
  }
}

/** Only paths inside the app's organization area: never another origin (`//evil`, `/\evil`). */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_RETURN;
  const path = value.trim();
  if (!/^\/org(\/[A-Za-z0-9._~\-/]*)?$/.test(path) || path.includes('//')) return DEFAULT_RETURN;
  return path;
}

function channelName(channel: string | null, team: string | null): string {
  const base = channel ?? 'Slack';
  const name = team ? `${base} (${team})` : base;
  return name.length > MAX_CHANNEL_NAME_LENGTH
    ? `${name.slice(0, MAX_CHANNEL_NAME_LENGTH - 1)}…`
    : name;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
