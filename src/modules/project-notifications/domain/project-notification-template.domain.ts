import { Domain } from '$lib/server/domain/domain';
import type { ProjectNotificationChannel } from './project-notification.domain';

export class ProjectNotificationTemplateDomain extends Domain {
  public projectId: string = '';
  public provider: ProjectNotificationChannel = 'mail';
  public name: string = '';
  public slug: string = '';
  public content: string = '';
  public recipients: string[] = [];
  public system: boolean = false;

  constructor(data: any) {
    super(data);
    this.projectId = data.projectId;
    this.provider = data.provider;
    this.name = data.name;
    this.slug = data.slug;
    this.content = data.content;
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
      recipients: this.recipients,
      system: this.system,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
