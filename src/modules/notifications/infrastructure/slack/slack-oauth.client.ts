const AUTHORIZE_ENDPOINT = 'https://slack.com/oauth/v2/authorize';
const ACCESS_ENDPOINT = 'https://slack.com/api/oauth.v2.access';
const EXCHANGE_TIMEOUT_MS = 10_000;

/** The only scope GitOps asks for: Slack shows a channel picker and returns a webhook for it. */
export const SLACK_CONNECT_SCOPE = 'incoming-webhook';

export type SlackAuthorizationRequest = {
  clientId: string;
  redirectUri: string;
  state: string;
};

export type SlackCodeExchange = {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
};

/** What an `incoming-webhook` install returns: the webhook of the channel the user picked. */
export type SlackIncomingWebhook = {
  url: string;
  /** `#channel` as Slack names it, when it says. */
  channel: string | null;
  teamName: string | null;
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

export class SlackOAuthClient {
  constructor(private readonly fetchFn: FetchLike = (input, init) => fetch(input, init)) {}

  buildAuthorizationUrl(request: SlackAuthorizationRequest): string {
    const url = new URL(AUTHORIZE_ENDPOINT);
    url.searchParams.set('client_id', request.clientId);
    url.searchParams.set('scope', SLACK_CONNECT_SCOPE);
    url.searchParams.set('redirect_uri', request.redirectUri);
    url.searchParams.set('state', request.state);
    return url.toString();
  }

  /** Trades the code for the webhook; never logs or echoes the response (it holds a token). */
  async exchangeCode(exchange: SlackCodeExchange): Promise<SlackIncomingWebhook> {
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
      incoming_webhook?: { url?: unknown; channel?: unknown };
      team?: { name?: unknown } | null;
    } | null;
    if (!body?.ok) throw new SlackOAuthError(safeCode(body?.error));

    const webhook = body.incoming_webhook;
    if (!webhook || typeof webhook.url !== 'string' || !webhook.url) {
      throw new SlackOAuthError('no_webhook');
    }
    return {
      url: webhook.url,
      channel: typeof webhook.channel === 'string' && webhook.channel ? webhook.channel : null,
      teamName: typeof body.team?.name === 'string' && body.team.name ? body.team.name : null,
    };
  }
}

/** Slack error codes are snake_case words; anything else is not echoed into logs. */
function safeCode(value: unknown): string {
  return typeof value === 'string' && /^[a-z0-9_]{1,64}$/.test(value) ? value : 'unknown_error';
}
