import crypto from 'crypto';
import {
  PROJECT_NOTIFICATION_EVENT_DEFINITIONS,
  getProjectNotificationEventDefinition,
  isProjectNotificationEvent,
} from '../domain/project-notification-events';
import {
  PROJECT_NOTIFICATION_FILTER_OPERATORS,
  type ProjectNotificationFilter,
} from '../domain/project-notification-filter';
import type { ProjectNotificationRepository } from '../infrastructure/repositories/project-notification.repository';
import type {
  ProjectNotificationChannel,
  ProjectNotificationDestination,
} from '../domain/project-notification.domain';
import type { ProjectNotificationTemplateRepository } from '../infrastructure/repositories/project-notification-template.repository';

export type ProjectNotificationInput = {
  name: string;
  description?: string;
  eventName: string;
  channel?: string;
  filters?: unknown;
  providerConfig?: Record<string, string>;
  templateId?: string | null;
  destinations?: unknown;
  recipients: string | string[];
  enabled?: boolean;
};

export class ProjectNotificationService {
  constructor(
    private readonly repository: ProjectNotificationRepository,
    private readonly templateRepository: ProjectNotificationTemplateRepository,
  ) {}

  listEvents() {
    return PROJECT_NOTIFICATION_EVENT_DEFINITIONS;
  }

  async listByProject(projectId: string) {
    return (await this.repository.findByProjectId(projectId)).map((item) => item.toJson());
  }

  async listHistory(projectId: string) {
    return (await this.repository.listDeliveries(projectId)).map((item) => item.toJson());
  }

  async create(projectId: string, input: ProjectNotificationInput) {
    const normalized = await this.normalize(projectId, input);
    const id = crypto.randomUUID();
    await this.repository.create({ id, projectId, ...normalized });
    return (await this.repository.findById(id))?.toJson();
  }

  async update(id: string, projectId: string, input: ProjectNotificationInput) {
    const notification = await this.requireOwned(id, projectId);
    await this.repository.update(notification.id, {
      ...(await this.normalize(projectId, input)),
      enabled: notification.enabled,
    });
    return (await this.repository.findById(id))?.toJson();
  }

  async setEnabled(id: string, projectId: string, enabled: boolean) {
    const notification = await this.requireOwned(id, projectId);
    await this.repository.update(notification.id, { enabled });
  }

  async delete(id: string, projectId: string) {
    const notification = await this.requireOwned(id, projectId);
    await this.repository.deleteById(notification.id);
  }

  private async requireOwned(id: string, projectId: string) {
    const notification = await this.repository.findById(id);
    if (!notification || notification.projectId !== projectId) {
      throw new Error('Notification rule not found');
    }
    return notification;
  }

  private async normalize(projectId: string, input: ProjectNotificationInput) {
    const name = input.name?.trim();
    if (!name) throw new Error('Notification name is required');
    if (!isProjectNotificationEvent(input.eventName)) {
      throw new Error('Unsupported project event');
    }
    const description = input.description?.trim() || undefined;
    const filters = this.normalizeFilters(input.eventName, input.filters);
    if (input.destinations !== undefined && !Array.isArray(input.destinations)) {
      throw new Error('Invalid notification destinations');
    }
    const rawDestinations = input.destinations
      ? input.destinations
      : [
          {
            channel: input.channel ?? 'mail',
            templateId: input.templateId,
            providerConfig: input.providerConfig,
            recipients: input.recipients,
          },
        ];
    if (rawDestinations.length === 0) throw new Error('At least one destination is required');
    const destinations = await Promise.all(
      rawDestinations.map((destination) => this.normalizeDestination(projectId, destination)),
    );
    const uniqueChannels = new Set(destinations.map((destination) => destination.channel));
    if (uniqueChannels.size !== destinations.length) {
      throw new Error('A notification rule cannot repeat a destination');
    }
    const primary = destinations[0];

    return {
      name,
      description,
      eventName: input.eventName,
      channel: primary.channel,
      templateId: primary.templateId,
      filters,
      providerConfig: primary.providerConfig,
      destinations,
      recipients: primary.recipients,
      enabled: input.enabled ?? true,
    };
  }

  private async normalizeDestination(
    projectId: string,
    value: unknown,
  ): Promise<ProjectNotificationDestination> {
    if (!value || typeof value !== 'object') throw new Error('Invalid notification destination');
    const input = value as {
      channel?: unknown;
      templateId?: unknown;
      providerConfig?: unknown;
      recipients?: unknown;
    };
    const channel = String(input.channel ?? '') as ProjectNotificationChannel;
    if (!['mail', 'slack', 'google-chat', 'http'].includes(channel)) {
      throw new Error('This notification target is not available yet');
    }
    const templateId = String(input.templateId ?? '').trim() || null;
    if (templateId) {
      const template = await this.templateRepository.findById(templateId);
      if (!template || template.projectId !== projectId || template.provider !== channel) {
        throw new Error('Notification template does not belong to this target');
      }
    }

    const providerConfig: Record<string, string> = {};
    let recipients: string[] = [];
    if (channel === 'mail') {
      const rawRecipients = input.recipients;
      const source = Array.isArray(rawRecipients)
        ? rawRecipients
        : String(rawRecipients ?? '').split(',');
      recipients = [
        ...new Set(source.map((item) => String(item).trim().toLowerCase()).filter(Boolean)),
      ];
      for (const recipient of recipients) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
          throw new Error(`Invalid email address: ${recipient}`);
        }
      }
    } else if (channel === 'slack') {
      const config = input.providerConfig as Record<string, unknown> | undefined;
      const targetChannel = String(config?.channel ?? '').trim();
      if (!targetChannel) throw new Error('Target channel is required');
      providerConfig.channel = targetChannel;
    }
    return { channel, templateId, providerConfig, recipients };
  }

  private normalizeFilters(eventName: string, value: unknown): ProjectNotificationFilter[] {
    if (value === undefined || value === null || value === '') return [];
    if (!Array.isArray(value)) throw new Error('Invalid notification filters');
    if (value.length > 10) throw new Error('A rule can have at most 10 conditions');

    const definition = getProjectNotificationEventDefinition(eventName);
    if (!definition) throw new Error('Unsupported project event');
    const fields = new Set(definition.fields.map((field) => field.id));

    return value.map((condition) => {
      if (!condition || typeof condition !== 'object') {
        throw new Error('Invalid notification condition');
      }
      const candidate = condition as Partial<ProjectNotificationFilter>;
      const field = String(candidate.field ?? '');
      const operator = String(candidate.operator ?? '') as ProjectNotificationFilter['operator'];
      const conditionValue = String(candidate.value ?? '').trim();
      if (!fields.has(field)) throw new Error(`Unsupported filter field: ${field}`);
      if (!PROJECT_NOTIFICATION_FILTER_OPERATORS.includes(operator)) {
        throw new Error(`Unsupported filter operator: ${operator}`);
      }
      if (operator !== 'exists' && !conditionValue) {
        throw new Error('Filter value is required');
      }
      return { field, operator, value: operator === 'exists' ? '' : conditionValue };
    });
  }
}
