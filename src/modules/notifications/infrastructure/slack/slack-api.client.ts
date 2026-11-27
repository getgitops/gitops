import { safeCode } from './slack-oauth.client';

const VIEWS_OPEN_ENDPOINT = 'https://slack.com/api/views.open';
// Slack's trigger_id expires 3 s after the command: there is no time for a long wait
const TIMEOUT_MS = 2_500;

type FetchLike = (input: string, init?: Parameters<typeof fetch>[1]) => Promise<Response>;

export type SlackApiResult = { ok: true } | { ok: false; error: string };

/** The few Slack Web API calls GitOps makes with a workspace's bot token. */
export class SlackApiClient {
  constructor(private readonly fetchFn: FetchLike = (input, init) => fetch(input, init)) {}

  /** Opens a modal for the user who ran the command (`trigger_id`). */
  async openView(token: string, triggerId: string, view: unknown): Promise<SlackApiResult> {
    let response: Response;
    try {
      response = await this.fetchFn(VIEWS_OPEN_ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({ trigger_id: triggerId, view }),
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return { ok: false, error: 'network_error' };
    }
    if (!response.ok) return { ok: false, error: `http_${response.status}` };
    const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: unknown };
    return body?.ok ? { ok: true } : { ok: false, error: safeCode(body?.error) };
  }
}
