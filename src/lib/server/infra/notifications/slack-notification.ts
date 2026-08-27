import { Notification, type NotificationChannel } from './notification';

export type SlackNotificationInput = {
  channelName: string;
  text: string;
};

export class SlackNotification extends Notification {
  readonly channel: NotificationChannel = 'slack';
  readonly channelName: string;
  readonly text: string;

  constructor(input: SlackNotificationInput) {
    super();
    this.channelName = input.channelName?.trim() ?? '';
    this.text = input.text ?? '';
  }

  validate(): void {
    if (!this.channelName) {
      throw new Error('SlackNotification requires a channel');
    }
    if (!this.text.trim()) {
      throw new Error('SlackNotification requires a text');
    }
  }
}
