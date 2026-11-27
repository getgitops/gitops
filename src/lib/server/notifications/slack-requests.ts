import { json } from '@sveltejs/kit';
import { slackAppService } from '#modules/notifications';

/**
 * Reads and authenticates a request from Slack (`/gitops` and its forms). Slack signs the raw
 * body with the app's signing secret; nothing else authenticates these routes (no session, no
 * API key), so an unsigned or stale request is refused before anything is parsed.
 */
export async function readSlackRequest(request: Request): Promise<URLSearchParams | null> {
  const body = await request.text();
  const verified = slackAppService.verifyRequest({
    timestamp: request.headers.get('x-slack-request-timestamp'),
    signature: request.headers.get('x-slack-signature'),
    body,
  });
  return verified ? new URLSearchParams(body) : null;
}

export function slackUnauthorized() {
  return json({ error: 'Invalid Slack signature' }, { status: 401 });
}

/** Slack wants a 200 within 3 s; an empty body acknowledges without replying. */
export function slackReply(reply: Record<string, unknown> | null) {
  return reply ? json(reply) : new Response(null, { status: 200 });
}
