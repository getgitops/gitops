import type { SlackNotification } from './slack-notification';
import type { NotificationTransport } from './transport';

export const slackTransport: NotificationTransport<SlackNotification> = {
  async send() {
    throw new Error('Slack notifications are not implemented yet');
  },
};
