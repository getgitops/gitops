import type { ConfigurableNotificationTarget } from '../domain/project-notification-target.domain';
import type { ProjectNotificationTargetService } from './project-notification-target.service';
import { GoogleChatTargetSender } from './targets/google-chat-target.sender';
import type { NotificationTargetSender } from './targets/notification-target-sender';
import { SlackTargetSender } from './targets/slack-target.sender';

export class ProjectNotificationTargetSender {
  private readonly senders: Map<ConfigurableNotificationTarget, NotificationTargetSender>;

  constructor(
    private readonly targetService: ProjectNotificationTargetService,
    senders: NotificationTargetSender[] = [new SlackTargetSender(), new GoogleChatTargetSender()],
  ) {
    this.senders = new Map(senders.map((sender) => [sender.provider, sender]));
  }

  async send(
    projectId: string,
    provider: ConfigurableNotificationTarget,
    channel: string,
    text: string,
  ): Promise<void> {
    const credentials = await this.targetService.credentials(projectId, provider);
    const sender = this.senders.get(provider);
    if (!sender) throw new Error(`No sender registered for notification target: ${provider}`);
    await sender.send({ channel: channel.trim(), text, credential: credentials.credential });
  }
}
