import { redirect } from '@sveltejs/kit';
import { SLACK_FLOW_COOKIE, SLACK_FLOW_COOKIE_PATH } from '#modules/notifications';
import { completeSlackConnection } from '#lib/server/notifications/channels';

/**
 * Redirect URL of "Add to Slack" (registered in the Slack app). Needs the session of the user who
 * started the flow; the result travels back as `?slack=connected` or `?slack=<error code>`.
 */
export async function GET({ url, cookies, locals }) {
  const flowCookie = cookies.get(SLACK_FLOW_COOKIE);
  // the flow is single-use whatever the outcome
  cookies.delete(SLACK_FLOW_COOKIE, { path: SLACK_FLOW_COOKIE_PATH });

  const outcome = await completeSlackConnection(locals, {
    flowCookie,
    searchParams: url.searchParams,
    origin: url.origin,
  });

  if (!outcome.ok) {
    // never log the query: it carries the authorization code
    locals.logger.warn({ code: outcome.error }, '[slack] connection failed');
  }
  const status = outcome.ok ? 'connected' : outcome.error;
  throw redirect(303, `${outcome.returnTo}?${new URLSearchParams({ slack: status })}`);
}
