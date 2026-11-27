import { redirect } from '@sveltejs/kit';
import { SLACK_FLOW_COOKIE, SLACK_FLOW_COOKIE_PATH } from '#modules/notifications';
import { completeSlackFlow } from '#lib/server/notifications/channels';

/**
 * Redirect URL of the GitOps Slack app (registered in the app). Finishes "Add to Slack" and the
 * app install (both need the session that started them) and channels connected from `/gitops`
 * (bound to the Slack user instead: reachable without a session, see `hooks.server.ts`). The
 * result travels back as `?slack=<status or error code>`.
 */
export async function GET({ url, cookies, locals }) {
  const flowCookie = cookies.get(SLACK_FLOW_COOKIE);
  // the flow is single-use whatever the outcome
  cookies.delete(SLACK_FLOW_COOKIE, { path: SLACK_FLOW_COOKIE_PATH });

  const outcome = await completeSlackFlow(locals, {
    flowCookie,
    searchParams: url.searchParams,
    origin: url.origin,
  });

  if (outcome.error) {
    // never log the query: it carries the authorization code
    locals.logger.warn({ code: outcome.error }, '[slack] flow failed');
  }
  throw redirect(303, outcome.location);
}
