import { Repository } from '$lib/server/infra/repository';
import {
  ProjectNotificationDeliveryEntity,
  ProjectNotificationEntity,
} from '$lib/database/schemas';
import { ProjectNotificationDomain } from '../../domain/project-notification.domain';
import { ProjectNotificationDeliveryDomain } from '../../domain/project-notification-delivery.domain';

export class ProjectNotificationRepository extends Repository {
  async findByProjectId(projectId: string): Promise<ProjectNotificationDomain[]> {
    const result = await this.db
      .select()
      .from(ProjectNotificationEntity)
      .where({ projectId })
      .orderBy('createdAt', 'desc');
    return result.rows.map((row: any) => new ProjectNotificationDomain(row));
  }

  async findEnabledByProjectAndEvent(
    projectId: string,
    eventName: string,
  ): Promise<ProjectNotificationDomain[]> {
    const result = await this.db
      .select()
      .from(ProjectNotificationEntity)
      .where({ projectId, eventName, enabled: true });
    return result.rows.map((row: any) => new ProjectNotificationDomain(row));
  }

  async findEnabledByEvent(eventName: string): Promise<ProjectNotificationDomain[]> {
    const result = await this.db
      .select()
      .from(ProjectNotificationEntity)
      .where({ eventName, enabled: true });
    return result.rows.map((row: any) => new ProjectNotificationDomain(row));
  }

  async findById(id: string): Promise<ProjectNotificationDomain | null> {
    const result = await this.db.select().from(ProjectNotificationEntity).where({ id }).limit(1);
    return result.rows[0] ? new ProjectNotificationDomain(result.rows[0]) : null;
  }

  async create(input: {
    id: string;
    projectId: string;
    name: string;
    description?: string;
    eventName: string;
    channel: ProjectNotificationDomain['channel'];
    templateId?: string | null;
    filters: ProjectNotificationDomain['filters'];
    providerConfig: ProjectNotificationDomain['providerConfig'];
    destinations: ProjectNotificationDomain['destinations'];
    recipients: string[];
    enabled: boolean;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.db.insert(ProjectNotificationEntity).values({
      ...input,
      createdAt: now,
      updatedAt: now,
    });
  }

  async update(
    id: string,
    changes: Partial<
      Pick<
        ProjectNotificationDomain,
        | 'name'
        | 'description'
        | 'eventName'
        | 'templateId'
        | 'filters'
        | 'providerConfig'
        | 'destinations'
        | 'recipients'
        | 'enabled'
      >
    >,
  ): Promise<void> {
    await this.db
      .update(ProjectNotificationEntity)
      .set({ ...changes, updatedAt: new Date().toISOString() })
      .where({ id });
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(ProjectNotificationEntity).where({ id });
  }

  async listDeliveries(projectId: string): Promise<ProjectNotificationDeliveryDomain[]> {
    const result = await this.db
      .select()
      .from(ProjectNotificationDeliveryEntity)
      .where({ projectId })
      .orderBy('createdAt', 'desc');
    return result.rows.map((row: any) => new ProjectNotificationDeliveryDomain(row));
  }

  async createDelivery(input: {
    id: string;
    projectId: string;
    notificationId: string;
    eventId: string;
    eventName: string;
    channel: string;
    recipients: string[];
  }): Promise<void> {
    await this.db.insert(ProjectNotificationDeliveryEntity).values({
      ...input,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
  }

  async finishDelivery(id: string, status: 'sent' | 'failed', error?: string): Promise<void> {
    await this.db
      .update(ProjectNotificationDeliveryEntity)
      .set({ status, error: error ?? null, sentAt: new Date().toISOString() })
      .where({ id });
  }
}
