import type { ConfigurableNotificationTarget } from '../../domain/project-notification-target.domain';

export type NotificationTargetMessage = {
  channel: string;
  text: string;
  credential: string;
};

export interface NotificationTargetSender {
  readonly provider: ConfigurableNotificationTarget;
  send(message: NotificationTargetMessage): Promise<void>;
}
