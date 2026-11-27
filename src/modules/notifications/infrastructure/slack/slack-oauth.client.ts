const AUTHORIZE_ENDPOINT = 'https://slack.com/oauth/v2/authorize';
const ACCESS_ENDPOINT = 'https://slack.com/api/oauth.v2.access';
const EXCHANGE_TIMEOUT_MS = 10_000;

/** "Add to Slack" for a channel: Slack shows a channel picker and returns a webhook for it. */
export const SLACK_CONNECT_SCOPE = 'incoming-webhook';
/** Installing the app for the `/gitops` command: no channel picker. */
export const SLACK_INSTALL_SCOPE = 'commands';
/** Bot scopes of the GitOps app (manifest). Slack adds scopes up, so each install keeps both. */
export const SLACK_APP_SCOPES = [SLACK_CONNECT_SCOPE, SLACK_INSTALL_SCOPE];

export type SlackAuthorizationRequest = {
  clientId: string;
  redirectUri: string;
  state: string;
  /** Defaults to `incoming-webhook`. */
  scope?: string;
};

export type SlackCodeExchange = {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
};

/** The webhook of the channel the user picked (only with the `incoming-webhook` scope). */
export type SlackIncomingWebhook = {
  url: string;
  /** `#channel` as Slack names it, when it says. */
  channel: string | null;
  channelId: string | null;
};

/** What an install returns. Holds a token: never log or echo it. */
export type SlackInstallation = {
  teamId: string | null;
  teamName: string | null;
  /** The Slack user who authorized the install. */
  authedUserId: string | null;
  /** Bot token of the workspace (`xoxb-…`). */
  botToken: string | null;
  webhook: SlackIncomingWebhook | null;
};

type FetchLike = (input: string, init?: Parameters<typeof fetch>[1]) => Promise<Response>;

export class SlackOAuthError extends Error {
  constructor(
    /** Slack's error code (`invalid_code`, `bad_redirect_uri`…) or `no_webhook` / `http_<status>`. */
    readonly code: string,
  ) {
    super(`Slack OAuth failed: ${code}`);
    this.name = 'SlackOAuthError';
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

export class SlackOAuthClient {
  constructor(private readonly fetchFn: FetchLike = (input, init) => fetch(input, init)) {}

  buildAuthorizationUrl(request: SlackAuthorizationRequest): string {
    const url = new URL(AUTHORIZE_ENDPOINT);
    url.searchParams.set('client_id', request.clientId);
    url.searchParams.set('scope', request.scope ?? SLACK_CONNECT_SCOPE);
    url.searchParams.set('redirect_uri', request.redirectUri);
    url.searchParams.set('state', request.state);
    return url.toString();
  }

  /** Trades the code for the installation; never logs or echoes the response (it holds a token). */
  async exchangeCode(exchange: SlackCodeExchange): Promise<SlackInstallation> {
    // Slack recommends HTTP Basic for the client credentials (RFC 6749 §2.3.1)
    const credentials = Buffer.from(
      `${encodeURIComponent(exchange.clientId)}:${encodeURIComponent(exchange.clientSecret)}`,
    ).toString('base64');
    let response: Response;
    try {
      response = await this.fetchFn(ACCESS_ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Basic ${credentials}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ code: exchange.code, redirect_uri: exchange.redirectUri }),
        redirect: 'error',
        signal: AbortSignal.timeout(EXCHANGE_TIMEOUT_MS),
      });
    } catch {
      throw new SlackOAuthError('network_error');
    }
    if (!response.ok) throw new SlackOAuthError(`http_${response.status}`);

    const body = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      access_token?: unknown;
      token_type?: unknown;
      incoming_webhook?: { url?: unknown; channel?: unknown; channel_id?: unknown };
      team?: { id?: unknown; name?: unknown } | null;
      authed_user?: { id?: unknown } | null;
    } | null;
    if (!body?.ok) throw new SlackOAuthError(safeCode(body?.error));

    const webhook = body.incoming_webhook;
    const url = text(webhook?.url);
    return {
      teamId: text(body.team?.id),
      teamName: text(body.team?.name),
      authedUserId: text(body.authed_user?.id),
      botToken:
        body.token_type === 'bot' || body.token_type === undefined ? text(body.access_token) : null,
      webhook: url
        ? { url, channel: text(webhook?.channel), channelId: text(webhook?.channel_id) }
        : null,
    };
  }
}

/** Slack error codes are snake_case words; anything else is not echoed into logs. */
export function safeCode(value: unknown): string {
  return typeof value === 'string' && /^[a-z0-9_]{1,64}$/.test(value) ? value : 'unknown_error';
}
