import { Domain } from '$lib/server/domain/domain';
import type { ProjectNotificationChannel } from './project-notification.domain';

export type ConfigurableNotificationTarget = 'slack' | 'google-chat' | 'http';

export class ProjectNotificationTargetDomain extends Domain {
  public projectId: string = '';
  public provider: ProjectNotificationChannel = 'slack';
  public credentialEncrypted: string = '';
  public defaultTemplateId?: string | null = null;
  public enabled: boolean = true;

  constructor(data: any) {
    super(data);
    this.projectId = data.projectId;
    this.provider = data.provider;
    this.credentialEncrypted = data.credentialEncrypted;
    this.defaultTemplateId = data.defaultTemplateId;
    this.enabled = data.enabled ?? true;
  }

  toJson() {
    return {
      id: this.id,
      projectId: this.projectId,
      provider: this.provider,
      hasCredential: Boolean(this.credentialEncrypted),
      defaultTemplateId: this.defaultTemplateId ?? null,
      enabled: this.enabled,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
