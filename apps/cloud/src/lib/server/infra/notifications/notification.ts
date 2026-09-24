export type NotificationChannel = 'mail' | 'slack';

export abstract class Notification {
  abstract readonly channel: NotificationChannel;

  /** Throws when the notification is missing data required by its channel. */
  abstract validate(): void;
}
