import type { Notification } from './notification';

export interface NotificationTransport<T extends Notification = Notification> {
  send(notification: T): Promise<void>;
}
