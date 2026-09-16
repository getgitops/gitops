import { Domain } from '$lib/server/domain/domain';
import type { ProjectNotificationChannel } from './project-notification.domain';

export type NotificationTemplateFormat = 'html' | 'text' | 'json';

export class ProjectNotificationTemplateDomain extends Domain {
  public projectId: string = '';
  public provider: ProjectNotificationChannel = 'mail';
  public name: string = '';
  public slug: string = '';
  public content: string = '';
  public format: NotificationTemplateFormat = 'text';
  public httpConfigEncrypted: string = '';
  public recipients: string[] = [];
  public system: boolean = false;

  constructor(data: any) {
    super(data);
    this.projectId = data.projectId;
    this.provider = data.provider;
    this.name = data.name;
    this.slug = data.slug;
    this.content = data.content;
    this.format =
      data.format ??
      (data.provider === 'mail' ? 'html' : data.provider === 'http' ? 'json' : 'text');
    this.httpConfigEncrypted = data.httpConfigEncrypted ?? '';
    this.recipients = Array.isArray(data.recipients) ? data.recipients : [];
    this.system = data.system ?? false;
  }

  toJson() {
    return {
      id: this.id,
      projectId: this.projectId,
      provider: this.provider,
      name: this.name,
      slug: this.slug,
      content: this.content,
      format: this.format,
      hasHttpConfig: Boolean(this.httpConfigEncrypted),
      recipients: this.recipients,
      system: this.system,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
