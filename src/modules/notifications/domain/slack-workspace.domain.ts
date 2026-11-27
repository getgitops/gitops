import type { ChannelLocale } from '#lib/server/infra/notifications/chat-types';

/** A Slack workspace with the GitOps app installed, linked to one organization. */
export type SlackWorkspace = {
  id: string;
  teamId: string;
  teamName: string;
  organizationId: string;
  /** Encrypted bot token (`ChannelCipher`, purpose `slack-bot-token`, AAD = this id). */
  botToken: string;
  locale: ChannelLocale;
  installedByUserId: string;
  createdAt: string;
  updatedAt: string;
};

/** What the UI may see of a workspace: never the token. */
export type SlackWorkspaceView = Omit<SlackWorkspace, 'botToken'>;

export function toSlackWorkspaceView(workspace: SlackWorkspace): SlackWorkspaceView {
  const { botToken: _token, ...view } = workspace;
  return view;
}

/** Provider of the Slack identities in `user.authProviders` (`providerId` = `<team>:<user>`). */
export const SLACK_IDENTITY_PROVIDER = 'slack';

export function slackIdentity(teamId: string, slackUserId: string): string {
  return `${teamId}:${slackUserId}`;
}
