import crypto from 'crypto';
import { MailNotification, notify } from '$lib/server/infra/notifications';
import type { DomainEvent, EventSubscriber } from '$modules/events';
import { PROJECT_NOTIFICATION_EVENT_CLASSES } from '../domain/project-notification-events';
import { matchesProjectNotificationFilters } from '../domain/project-notification-filter';
import type { ProjectNotificationRepository } from '../infrastructure/repositories/project-notification.repository';
import type { ProjectNotificationTargetSender } from './project-notification-target.sender';
import type { ProjectNotificationTemplateService } from './project-notification-template.service';
import type { ProjectNotificationTargetService } from './project-notification-target.service';
import type {
  ProjectNotificationDestination,
  ProjectNotificationDomain,
} from '../domain/project-notification.domain';

type ProjectResolver = {
  getById(id: string): Promise<{ projectId: string }>;
};

type ProjectLookup = {
  getProject(id: string): Promise<{ organization?: { id?: string | null } | null }>;
};

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export class ProjectNotificationSubscriber implements EventSubscriber {
  readonly name = 'project-notifications';

  constructor(
    private readonly repository: ProjectNotificationRepository,
    private readonly projectResolver?: ProjectResolver,
    private readonly projectLookup?: ProjectLookup,
    private readonly targetSender?: ProjectNotificationTargetSender,
    private readonly templateService?: ProjectNotificationTemplateService,
    private readonly targetService?: ProjectNotificationTargetService,
  ) {}

  subscribedTo() {
    return PROJECT_NOTIFICATION_EVENT_CLASSES;
  }

  async handle(event: DomainEvent): Promise<void> {
    const rules = await this.rulesFor(event);
    const matchingRules = rules.filter((rule) =>
      matchesProjectNotificationFilters(event.payload, rule.filters),
    );
    const results = await Promise.allSettled(
      matchingRules.flatMap((rule) =>
        rule.destinations.map((destination) => this.deliver(rule, destination, event)),
      ),
    );
    const failed = results.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
  }

  private async rulesFor(event: DomainEvent) {
    const organizationId = (event.payload as { organizationId?: unknown })?.organizationId;
    if (event.name === 'organization.user.assigned' && typeof organizationId === 'string') {
      const rules = await this.repository.findEnabledByEvent(event.name);
      const scoped = await Promise.all(
        rules.map(async (rule) => {
          const project = await this.projectLookup?.getProject(rule.projectId);
          return project?.organization?.id === organizationId ? rule : null;
        }),
      );
      return scoped.filter((rule) => rule !== null);
    }

    const projectId = await this.projectIdFrom(event);
    return this.repository.findEnabledByProjectAndEvent(projectId, event.name);
  }

  private async projectIdFrom(event: DomainEvent): Promise<string> {
    const payload = event.payload as { projectId?: unknown; serviceId?: unknown };
    if (typeof payload?.projectId === 'string' && payload.projectId) {
      return payload.projectId;
    }
    if (typeof payload?.serviceId === 'string' && payload.serviceId && this.projectResolver) {
      return (await this.projectResolver.getById(payload.serviceId)).projectId;
    }
    throw new Error(`Event ${event.name} does not identify a project`);
  }

  private async deliver(
    rule: ProjectNotificationDomain,
    destination: ProjectNotificationDestination,
    event: DomainEvent,
  ): Promise<void> {
    if (!this.templateService || !this.targetService) {
      throw new Error('Notification templates are not configured');
    }
    const targetTemplateId = await this.targetService.defaultTemplateId(
      rule.projectId,
      destination.channel,
    );
    const templateId = destination.templateId ?? targetTemplateId;
    const effectiveRecipients =
      destination.channel === 'mail'
        ? destination.recipients.length > 0
          ? destination.recipients
          : await this.templateService.recipients(rule.projectId, destination.channel, templateId)
        : destination.channel === 'slack'
          ? [destination.providerConfig.channel].filter(Boolean)
          : ['Google Chat webhook'];
    if (destination.channel === 'mail' && effectiveRecipients.length === 0) {
      throw new Error('Email notification requires recipients on the rule or template');
    }

    const deliveryId = crypto.randomUUID();
    await this.repository.createDelivery({
      id: deliveryId,
      projectId: rule.projectId,
      notificationId: rule.id,
      eventId: event.id,
      eventName: event.name,
      channel: destination.channel,
      recipients: effectiveRecipients,
    });

    try {
      const payload = JSON.stringify(event.payload, null, 2);
      const content = await this.templateService.render(
        rule.projectId,
        destination.channel,
        templateId,
        {
          'rule.name': destination.channel === 'mail' ? escapeHtml(rule.name) : rule.name,
          'event.name': destination.channel === 'mail' ? escapeHtml(event.name) : event.name,
          'event.payload': destination.channel === 'mail' ? escapeHtml(payload) : payload,
        },
      );
      if (destination.channel === 'mail') {
        await notify(
          new MailNotification({
            to: effectiveRecipients,
            subject: `[GitOps] ${rule.name}: ${event.name}`,
            content,
          }),
        );
      } else if (destination.channel === 'slack' || destination.channel === 'google-chat') {
        if (!this.targetSender) throw new Error('Notification target sender is not configured');
        await this.targetSender.send(
          rule.projectId,
          destination.channel,
          destination.channel === 'slack' ? destination.providerConfig.channel : '',
          content,
        );
      } else {
        throw new Error(`Unsupported notification target: ${destination.channel}`);
      }
      await this.repository.finishDelivery(deliveryId, 'sent');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.repository.finishDelivery(deliveryId, 'failed', message);
      throw error;
    }
  }
}
