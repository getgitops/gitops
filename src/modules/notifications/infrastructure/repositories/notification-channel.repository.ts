import { NotificationChannelEntity } from '#lib/database/schemas';
import { Repository } from '#lib/server/infra/repository';
import {
  NotificationChannelDomain,
  type NotificationChannelRow,
} from '../../domain/notification-channel.domain';

export type NotificationChannelChanges = Partial<
  Pick<
    NotificationChannelRow,
    | 'name'
    | 'locale'
    | 'webhookUrl'
    | 'enabled'
    | 'lastDeliveryAt'
    | 'lastError'
    | 'signingSecret'
    | 'previousSigningSecret'
    | 'previousSecretExpiresAt'
    | 'consecutiveFailures'
    | 'disabledReason'
  >
>;

/** Persistence port; `InMemoryNotificationChannelRepository` implements it in tests. */
export interface NotificationChannelRepositoryPort {
  findById(id: string): Promise<NotificationChannelDomain | null>;
  /** Every channel of the organization, including those of its projects. */
  listByOrganization(organizationId: string): Promise<NotificationChannelDomain[]>;
  create(row: NotificationChannelRow): Promise<void>;
  update(id: string, changes: NotificationChannelChanges): Promise<void>;
  delete(id: string): Promise<void>;
}

export class NotificationChannelRepository
  extends Repository
  implements NotificationChannelRepositoryPort
{
  async findById(id: string) {
    const result = await this.db.select().from(NotificationChannelEntity).where({ id }).limit(1);
    const row = result.rows[0];
    return row ? new NotificationChannelDomain(row) : null;
  }

  async listByOrganization(organizationId: string) {
    const result = await this.db
      .select()
      .from(NotificationChannelEntity)
      .where({ organizationId })
      .orderBy('createdAt', 'asc');
    return result.rows.map((row: any) => new NotificationChannelDomain(row));
  }

  async create(row: NotificationChannelRow) {
    await this.db.insert(NotificationChannelEntity).values({ ...row });
  }

  async update(id: string, changes: NotificationChannelChanges) {
    await this.db
      .update(NotificationChannelEntity)
      .set({ ...changes, updatedAt: new Date().toISOString() })
      .where({ id });
  }

  async delete(id: string) {
    await this.db.delete(NotificationChannelEntity).where({ id });
  }
}
