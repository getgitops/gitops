import { mailTransport } from './mail.transport';
import { Notification, type NotificationChannel } from './notification';
import { slackTransport } from './slack.transport';
import type { NotificationTransport } from './transport';

const defaults = (): Map<NotificationChannel, NotificationTransport<never>> =>
  new Map<NotificationChannel, NotificationTransport<never>>([
    ['mail', mailTransport as NotificationTransport<never>],
    ['slack', slackTransport as NotificationTransport<never>],
  ]);

let transports = defaults();

export function registerTransport(
  channel: NotificationChannel,
  transport: NotificationTransport<never>,
): void {
  transports.set(channel, transport);
}

export function resetTransports(): void {
  transports = defaults();
}

export async function notify(notification: Notification): Promise<void> {
  if (!(notification instanceof Notification)) {
    throw new Error('notify() expects a Notification instance');
  }

  notification.validate();

  const transport = transports.get(notification.channel);
  if (!transport) {
    throw new Error(`No transport registered for notification channel: ${notification.channel}`);
  }

  await transport.send(notification as never);
}
