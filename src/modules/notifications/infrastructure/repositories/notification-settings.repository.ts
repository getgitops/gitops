import { NotificationSettingsEntity } from '#lib/database/schemas';
import { Repository } from '#lib/server/infra/repository';
import {
  defaultNotificationSettings,
  type NotificationSettings,
} from '../../domain/notification-settings.domain';

export interface NotificationSettingsRepositoryPort {
  /** The organization's settings, or the defaults when none were saved. */
  get(organizationId: string): Promise<NotificationSettings>;
  setAllowedDomains(organizationId: string, domains: string[]): Promise<NotificationSettings>;
}

function toSettings(row: Record<string, any>): NotificationSettings {
  const domains = Array.isArray(row.allowedExternalEmailDomains)
    ? row.allowedExternalEmailDomains.filter((item: unknown) => typeof item === 'string')
    : [];
  const updatedAt =
    row.updatedAt instanceof Date ? row.updatedAt.toISOString() : (row.updatedAt ?? null);
  return { organizationId: row.organizationId, allowedExternalEmailDomains: domains, updatedAt };
}

export class NotificationSettingsRepository
  extends Repository
  implements NotificationSettingsRepositoryPort
{
  private async find(organizationId: string) {
    const result = await this.db
      .select()
      .from(NotificationSettingsEntity)
      .where({ organizationId })
      .limit(1);
    return result.rows[0] ?? null;
  }

  async get(organizationId: string): Promise<NotificationSettings> {
    const row = await this.find(organizationId);
    return row ? toSettings(row) : defaultNotificationSettings(organizationId);
  }

  async setAllowedDomains(organizationId: string, domains: string[]) {
    const existing = await this.find(organizationId);
    const timestamp = new Date().toISOString();
    if (existing) {
      await this.db
        .update(NotificationSettingsEntity)
        .set({ allowedExternalEmailDomains: domains, updatedAt: timestamp })
        .where({ id: existing.id });
    } else {
      await this.db.insert(NotificationSettingsEntity).values({
        id: crypto.randomUUID(),
        organizationId,
        allowedExternalEmailDomains: domains,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
    return { organizationId, allowedExternalEmailDomains: domains, updatedAt: timestamp };
  }
}
