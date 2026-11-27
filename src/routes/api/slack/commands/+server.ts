import { slackAppService } from '#modules/notifications';
import {
  readSlackRequest,
  slackReply,
  slackUnauthorized,
} from '#lib/server/notifications/slack-requests';

/** The `/gitops` slash command (Request URL of the command in the Slack app). */
export async function POST({ request, url, locals }) {
  const params = await readSlackRequest(request);
  if (!params) return slackUnauthorized();
  try {
    return slackReply(await slackAppService.handleCommand(params, url.origin));
  } catch (error) {
    locals.logger.error(error, '[slack] command failed');
    return slackReply({ response_type: 'ephemeral', text: 'GitOps: something went wrong.' });
  }
}
