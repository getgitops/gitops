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

export type ProjectNotificationInput = {
  name: string;
  description?: string;
  eventName: string;
  channel?: string;
  filters?: unknown;
  providerConfig?: Record<string, string>;
  recipients: string | string[];
  enabled?: boolean;
};

export class ProjectNotificationService {
  constructor(private readonly repository: ProjectNotificationRepository) {}

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
    const normalized = this.normalize(input);
    const id = crypto.randomUUID();
    await this.repository.create({ id, projectId, ...normalized });
    return (await this.repository.findById(id))?.toJson();
  }

  async update(id: string, projectId: string, input: ProjectNotificationInput) {
    const notification = await this.requireOwned(id, projectId);
    await this.repository.update(notification.id, this.normalize(input));
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

  private normalize(input: ProjectNotificationInput) {
    const name = input.name?.trim();
    if (!name) throw new Error('Notification name is required');
    if (!isProjectNotificationEvent(input.eventName)) {
      throw new Error('Unsupported project event');
    }
    if ((input.channel ?? 'mail') !== 'mail') {
      throw new Error('This notification provider is not available yet');
    }

    const description = input.description?.trim() || undefined;
    const filters = this.normalizeFilters(input.eventName, input.filters);

    const source = Array.isArray(input.recipients) ? input.recipients : input.recipients.split(',');
    const recipients = [
      ...new Set(source.map((item) => item.trim().toLowerCase()).filter(Boolean)),
    ];
    if (recipients.length === 0) throw new Error('At least one recipient is required');
    for (const recipient of recipients) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
        throw new Error(`Invalid email address: ${recipient}`);
      }
    }

    return {
      name,
      description,
      eventName: input.eventName,
      filters,
      providerConfig: {},
      recipients,
      enabled: input.enabled ?? true,
    };
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
