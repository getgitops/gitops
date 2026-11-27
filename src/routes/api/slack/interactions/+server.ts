import { slackAppService } from '#modules/notifications';
import {
  readSlackRequest,
  slackReply,
  slackUnauthorized,
} from '#lib/server/notifications/slack-requests';

/** Forms and buttons of the `/gitops` command (Interactivity Request URL in the Slack app). */
export async function POST({ request, url, locals }) {
  const params = await readSlackRequest(request);
  if (!params) return slackUnauthorized();
  let payload: unknown;
  try {
    payload = JSON.parse(params.get('payload') ?? '');
  } catch {
    return slackReply(null);
  }
  try {
    return slackReply(await slackAppService.handleInteraction(payload, url.origin));
  } catch (error) {
    locals.logger.error(error, '[slack] interaction failed');
    return slackReply(null);
  }
}
