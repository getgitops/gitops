import { WebClient } from '@slack/web-api';
import type {
  NotificationTargetMessage,
  NotificationTargetSender,
} from './notification-target-sender';

export class SlackTargetSender implements NotificationTargetSender {
  readonly provider = 'slack' as const;

  async send(message: NotificationTargetMessage): Promise<void> {
    const channel = message.channel.trim();
    if (!channel) throw new Error('Slack notification requires a channel');
    const client = new WebClient(message.credential);
    await client.chat.postMessage({ channel, text: message.text });
  }
}
