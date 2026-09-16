import type { ConfigurableNotificationTarget } from '../../domain/project-notification-target.domain';
import type { HttpTemplateConfig } from '../../domain/project-notification-http';

export type NotificationTargetMessage = {
  channel: string;
  text: string;
  credential: string;
  bodyType?: 'text' | 'json';
  httpConfig?: HttpTemplateConfig;
};

export interface NotificationTargetSender {
  readonly provider: ConfigurableNotificationTarget;
  send(message: NotificationTargetMessage): Promise<void>;
}
