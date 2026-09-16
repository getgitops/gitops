import { ProjectNotificationTargetEntity } from '$lib/database/schemas';
import { Repository } from '$lib/server/infra/repository';
import { ProjectNotificationTargetDomain } from '../../domain/project-notification-target.domain';
import type { ProjectNotificationChannel } from '../../domain/project-notification.domain';

export class ProjectNotificationTargetRepository extends Repository {
  async findByProjectId(projectId: string): Promise<ProjectNotificationTargetDomain[]> {
    const result = await this.db
      .select()
      .from(ProjectNotificationTargetEntity)
      .where({ projectId });
    return result.rows.map((row: any) => new ProjectNotificationTargetDomain(row));
  }

  async findByProjectAndProvider(
    projectId: string,
    provider: ProjectNotificationChannel,
  ): Promise<ProjectNotificationTargetDomain | null> {
    const result = await this.db
      .select()
      .from(ProjectNotificationTargetEntity)
      .where({ projectId, provider })
      .limit(1);
    return result.rows[0] ? new ProjectNotificationTargetDomain(result.rows[0]) : null;
  }

  async create(input: {
    id: string;
    projectId: string;
    provider: ProjectNotificationChannel;
    credentialEncrypted: string;
    defaultTemplateId?: string | null;
    enabled: boolean;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.db.insert(ProjectNotificationTargetEntity).values({
      ...input,
      createdAt: now,
      updatedAt: now,
    });
  }

  async update(
    id: string,
    changes: {
      credentialEncrypted?: string;
      defaultTemplateId?: string | null;
      enabled?: boolean;
    },
  ): Promise<void> {
    await this.db
      .update(ProjectNotificationTargetEntity)
      .set({ ...changes, updatedAt: new Date().toISOString() })
      .where({ id });
  }
}
