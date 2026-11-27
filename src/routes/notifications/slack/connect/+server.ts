import { redirect } from '@sveltejs/kit';
import {
  SLACK_DONE_PATH,
  SLACK_FLOW_COOKIE,
  SLACK_FLOW_COOKIE_PATH,
  SLACK_FLOW_TTL_MS,
  SlackConnectError,
  slackAppService,
  slackConnectService,
} from '#modules/notifications';
import { slackRedirectUri } from '#lib/server/notifications/channels';

/**
 * Opened from the "Pick the channel in Slack" button of `/gitops channel`: no GitOps session, the
 * signed link carries who asked (and expires in 10 minutes). Sends the browser to Slack's channel
 * picker; the callback checks that the same Slack workspace and user finish it.
 */
export async function GET({ url, cookies }) {
  const request = slackAppService.readChannelRequest(url.searchParams.get('token'));
  if (!request) {
    throw redirect(
      303,
      `${SLACK_DONE_PATH}?${new URLSearchParams({ slack: 'slack_invalid_state' })}`,
    );
  }
  let started;
  try {
    started = slackConnectService.startFromSlack({
      userId: request.userId,
      organizationId: request.organizationId,
      name: request.name,
      locale: request.locale,
      slackTeamId: request.teamId,
      slackUserId: request.slackUserId,
      redirectUri: slackRedirectUri(url.origin),
    });
  } catch (error) {
    const code = error instanceof SlackConnectError ? error.code : 'slack_exchange_failed';
    throw redirect(303, `${SLACK_DONE_PATH}?${new URLSearchParams({ slack: code })}`);
  }
  // sameSite lax: Slack's redirect back is a top-level GET navigation, so the cookie travels
  cookies.set(SLACK_FLOW_COOKIE, started.flowCookie, {
    path: SLACK_FLOW_COOKIE_PATH,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SLACK_FLOW_TTL_MS / 1000,
  });
  throw redirect(303, started.authorizationUrl, { external: ['https://slack.com'] });
}
