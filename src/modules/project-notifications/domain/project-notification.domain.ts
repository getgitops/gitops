import { Domain } from '$lib/server/domain/domain';
import type { ProjectNotificationFilter } from './project-notification-filter';

export type ProjectNotificationChannel = 'mail';

export class ProjectNotificationDomain extends Domain {
  public projectId: string = '';
  public name: string = '';
  public description?: string | null = null;
  public eventName: string = '';
  public channel: ProjectNotificationChannel = 'mail';
  public filters: ProjectNotificationFilter[] = [];
  public providerConfig: Record<string, string> = {};
  public recipients: string[] = [];
  public enabled: boolean = true;

  constructor(data: any) {
    super(data);
    this.projectId = data.projectId;
    this.name = data.name;
    this.description = data.description;
    this.eventName = data.eventName;
    this.channel = data.channel ?? 'mail';
    this.filters = Array.isArray(data.filters) ? data.filters : [];
    this.providerConfig = data.providerConfig ?? {};
    this.recipients = Array.isArray(data.recipients) ? data.recipients : [];
    this.enabled = data.enabled ?? true;
  }

  toJson() {
    return {
      id: this.id,
      projectId: this.projectId,
      name: this.name,
      description: this.description ?? null,
      eventName: this.eventName,
      channel: this.channel,
      filters: this.filters,
      providerConfig: this.providerConfig,
      recipients: this.recipients,
      enabled: this.enabled,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
