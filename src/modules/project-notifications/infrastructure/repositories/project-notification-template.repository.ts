import { ProjectNotificationTemplateEntity } from '$lib/database/schemas';
import { Repository } from '$lib/server/infra/repository';
import { ProjectNotificationTemplateDomain } from '../../domain/project-notification-template.domain';
import type { ProjectNotificationChannel } from '../../domain/project-notification.domain';

export class ProjectNotificationTemplateRepository extends Repository {
  async findByProjectId(projectId: string): Promise<ProjectNotificationTemplateDomain[]> {
    const result = await this.db
      .select()
      .from(ProjectNotificationTemplateEntity)
      .where({ projectId })
      .orderBy('createdAt', 'asc');
    return result.rows.map((row: any) => new ProjectNotificationTemplateDomain(row));
  }

  async findById(id: string): Promise<ProjectNotificationTemplateDomain | null> {
    const result = await this.db
      .select()
      .from(ProjectNotificationTemplateEntity)
      .where({ id })
      .limit(1);
    return result.rows[0] ? new ProjectNotificationTemplateDomain(result.rows[0]) : null;
  }

  async findBySlug(
    projectId: string,
    provider: ProjectNotificationChannel,
    slug: string,
  ): Promise<ProjectNotificationTemplateDomain | null> {
    const result = await this.db
      .select()
      .from(ProjectNotificationTemplateEntity)
      .where({ projectId, provider, slug })
      .limit(1);
    return result.rows[0] ? new ProjectNotificationTemplateDomain(result.rows[0]) : null;
  }

  async create(input: {
    id: string;
    projectId: string;
    provider: ProjectNotificationChannel;
    name: string;
    slug: string;
    content: string;
    recipients: string[];
    system: boolean;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.db.insert(ProjectNotificationTemplateEntity).values({
      ...input,
      createdAt: now,
      updatedAt: now,
    });
  }

  async update(
    id: string,
    changes: { name: string; slug: string; content: string; recipients: string[] },
  ): Promise<void> {
    await this.db
      .update(ProjectNotificationTemplateEntity)
      .set({ ...changes, updatedAt: new Date().toISOString() })
      .where({ id });
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(ProjectNotificationTemplateEntity).where({ id });
  }
}
