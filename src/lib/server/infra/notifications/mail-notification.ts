import { Notification, type NotificationChannel } from './notification';

export type MailNotificationInput = {
  to: string | string[];
  subject: string;
  /** HTML body, usually produced by `renderTemplate()`. */
  content: string;
};

export class MailNotification extends Notification {
  readonly channel: NotificationChannel = 'mail';
  readonly to: string[];
  readonly subject: string;
  readonly content: string;

  constructor(input: MailNotificationInput) {
    super();
    this.to = (Array.isArray(input.to) ? input.to : [input.to])
      .map((address) => address.trim())
      .filter(Boolean);
    this.subject = input.subject?.trim() ?? '';
    this.content = input.content ?? '';
  }

  validate(): void {
    if (this.to.length === 0) {
      throw new Error('MailNotification requires at least one recipient');
    }
    for (const address of this.to) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
        throw new Error(`MailNotification recipient is not a valid email: ${address}`);
      }
    }
    if (!this.subject) {
      throw new Error('MailNotification requires a subject');
    }
    if (!this.content.trim()) {
      throw new Error('MailNotification requires a content');
    }
  }
}
