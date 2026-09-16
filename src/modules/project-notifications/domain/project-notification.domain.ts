import { Domain } from '$lib/server/domain/domain';
import type { ProjectNotificationFilter } from './project-notification-filter';

export type ProjectNotificationChannel = 'mail' | 'slack' | 'google-chat' | 'http';

export type ProjectNotificationDestination = {
  channel: ProjectNotificationChannel;
  templateId: string | null;
  providerConfig: Record<string, string>;
  recipients: string[];
};

export class ProjectNotificationDomain extends Domain {
  public projectId: string = '';
  public name: string = '';
  public description?: string | null = null;
  public eventName: string = '';
  public channel: ProjectNotificationChannel = 'mail';
  public templateId?: string | null = null;
  public filters: ProjectNotificationFilter[] = [];
  public providerConfig: Record<string, string> = {};
  public destinations: ProjectNotificationDestination[] = [];
  public recipients: string[] = [];
  public enabled: boolean = true;

  constructor(data: any) {
    super(data);
    this.projectId = data.projectId;
    this.name = data.name;
    this.description = data.description;
    this.eventName = data.eventName;
    this.channel = data.channel ?? 'mail';
    this.templateId = data.templateId;
    this.filters = Array.isArray(data.filters) ? data.filters : [];
    this.providerConfig = data.providerConfig ?? {};
    this.recipients = Array.isArray(data.recipients) ? data.recipients : [];
    this.destinations =
      Array.isArray(data.destinations) && data.destinations.length > 0
        ? data.destinations
        : [
            {
              channel: this.channel,
              templateId: this.templateId ?? null,
              providerConfig: this.providerConfig,
              recipients: this.recipients,
            },
          ];
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
      templateId: this.templateId ?? null,
      filters: this.filters,
      providerConfig: this.providerConfig,
      destinations: this.destinations,
      recipients: this.recipients,
      enabled: this.enabled,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
