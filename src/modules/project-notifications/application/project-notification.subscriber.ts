import crypto from 'crypto';
import { MailNotification, notify } from '$lib/server/infra/notifications';
import type { DomainEvent, EventSubscriber } from '$modules/events';
import { PROJECT_NOTIFICATION_EVENT_CLASSES } from '../domain/project-notification-events';
import { matchesProjectNotificationFilters } from '../domain/project-notification-filter';
import type { ProjectNotificationRepository } from '../infrastructure/repositories/project-notification.repository';

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
      matchingRules.map((rule) => this.deliver(rule, event)),
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
    rule: Awaited<ReturnType<ProjectNotificationRepository['findById']>> & {},
    event: DomainEvent,
  ): Promise<void> {
    const deliveryId = crypto.randomUUID();
    await this.repository.createDelivery({
      id: deliveryId,
      projectId: rule.projectId,
      notificationId: rule.id,
      eventId: event.id,
      eventName: event.name,
      channel: rule.channel,
      recipients: rule.recipients,
    });

    try {
      const payload = escapeHtml(JSON.stringify(event.payload, null, 2));
      await notify(
        new MailNotification({
          to: rule.recipients,
          subject: `[GitOps] ${rule.name}: ${event.name}`,
          content: `<h1>${escapeHtml(rule.name)}</h1><p>The event <strong>${escapeHtml(event.name)}</strong> occurred.</p><pre>${payload}</pre>`,
        }),
      );
      await this.repository.finishDelivery(deliveryId, 'sent');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.repository.finishDelivery(deliveryId, 'failed', message);
      throw error;
    }
  }
}
