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
  SLACK_CONNECT_SCOPE,
  SlackOAuthError,
  type SlackOAuthClient,
} from '../infrastructure/slack/slack-oauth.client';

/** Fixed path of the OAuth callback: it is the redirect URL registered in the Slack app. */
export const SLACK_CALLBACK_PATH = '/notifications/slack/callback';
/** Path of the flow cookie: only the callback needs it. */
export const SLACK_FLOW_COOKIE_PATH = '/notifications/slack';
export const SLACK_FLOW_COOKIE = 'gitops_slack_flow';
export const SLACK_FLOW_TTL_MS = 10 * 60 * 1000;

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
  | 'slack_no_webhook';

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

type SlackFlow = {
  state: string;
  userId: string;
  organizationId: string;
  projectId: string | null;
  locale: ChannelLocale;
  returnTo: string;
};

export type SlackConnection = {
  location: ChannelLocation;
  locale: ChannelLocale;
  returnTo: string;
  /** Channel name proposal: `#channel (Workspace)`. */
  name: string;
  /** The incoming webhook URL: a secret, encrypted when the channel is saved. */
  webhookUrl: string;
};

export type SlackConnectStatus =
  { configured: true } | { configured: false; reason: 'missing' | 'invalid' };

export type SlackAppManifest = {
  display_information: { name: string; description: string; background_color: string };
  features: { bot_user: { display_name: string; always_online: boolean } };
  oauth_config: { redirect_urls: string[]; scopes: { bot: string[] } };
  settings: {
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
 * "Add to Slack": runs the OAuth v2 install with the `incoming-webhook` scope, so Slack asks the
 * user for a channel and returns its webhook URL. Nothing is stored here: the flow lives in a
 * signed, short-lived cookie bound to the user, and the caller saves the channel (with the usual
 * permission check) from the returned connection.
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
      return this.deps.readConfig()
        ? { configured: true }
        : { configured: false, reason: 'missing' };
    } catch {
      return { configured: false, reason: 'invalid' };
    }
  }

  isConfigured(): boolean {
    return this.status().configured;
  }

  start(input: {
    userId: string;
    location: ChannelLocation;
    locale: unknown;
    returnTo: unknown;
    redirectUri: string;
  }): { authorizationUrl: string; flowCookie: string } {
    const config = this.requireConfig();
    const flow: SlackFlow = {
      state: this.random(),
      userId: input.userId,
      organizationId: input.location.organizationId,
      projectId: input.location.projectId,
      locale: isChannelLocale(input.locale) ? input.locale : DEFAULT_CHANNEL_LOCALE,
      returnTo: safeReturnTo(input.returnTo),
    };
    const flowCookie = signToken(FLOW_PURPOSE, flow, {
      secret: this.deps.secret(),
      ttlMs: SLACK_FLOW_TTL_MS,
      now: this.now(),
    });
    const authorizationUrl = this.deps.client.buildAuthorizationUrl({
      clientId: config.clientId,
      redirectUri: input.redirectUri,
      state: flow.state,
    });
    return { authorizationUrl, flowCookie };
  }

  /** Where the callback goes back to, even on failure (when the flow cookie is still valid). */
  returnToOf(flowCookie: string | undefined): string {
    return this.readFlow(flowCookie)?.returnTo ?? DEFAULT_RETURN;
  }

  async complete(input: {
    flowCookie: string | undefined;
    userId: string;
    state: string | null;
    code: string | null;
    /** Slack's `error` query parameter (`access_denied` when the user cancels). */
    error: string | null;
    redirectUri: string;
  }): Promise<SlackConnection> {
    const flow = this.readFlow(input.flowCookie);
    if (!flow || flow.userId !== input.userId) {
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

    try {
      const webhook = await this.deps.client.exchangeCode({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        code: input.code,
        redirectUri: input.redirectUri,
      });
      return {
        location: {
          scope: flow.projectId ? 'project' : 'organization',
          organizationId: flow.organizationId,
          projectId: flow.projectId,
        },
        locale: flow.locale,
        returnTo: flow.returnTo,
        name: channelName(webhook.channel, webhook.teamName),
        webhookUrl: webhook.url,
      };
    } catch (error) {
      if (error instanceof SlackOAuthError) {
        throw new SlackConnectError(
          error.code === 'no_webhook' ? 'slack_no_webhook' : 'slack_exchange_failed',
          flow.returnTo,
          `Slack OAuth: ${error.code}`,
        );
      }
      throw error;
    }
  }

  /**
   * Manifest of a Slack app for this installation: only `incoming-webhook`, with the callback of
   * `origin` as redirect URL. Self-hosted admins create their app from it in one click.
   */
  manifest(origin: string): SlackAppManifest {
    return {
      display_information: {
        name: 'GitOps',
        description: 'GitOps alerts in your Slack channels.',
        background_color: '#0b0b0f',
      },
      features: { bot_user: { display_name: 'GitOps', always_online: false } },
      oauth_config: {
        redirect_urls: [`${origin.replace(/\/+$/, '')}${SLACK_CALLBACK_PATH}`],
        scopes: { bot: [SLACK_CONNECT_SCOPE] },
      },
      settings: {
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
    return {
      ...flow,
      locale: isChannelLocale(flow.locale) ? flow.locale : DEFAULT_CHANNEL_LOCALE,
      returnTo: safeReturnTo(flow.returnTo),
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
