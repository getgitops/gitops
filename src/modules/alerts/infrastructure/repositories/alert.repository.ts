import { AlertEntity } from '#lib/database/schemas';
import { Repository } from '#lib/server/infra/repository';
import { AlertDomain, type AlertFields, type AlertRow } from '../../domain/alert.domain';

/** Persistence port of the alerts module; `InMemoryAlertRepository` implements it in tests. */
export interface AlertRepositoryPort {
  findById(id: string): Promise<AlertDomain | null>;
  listByOrganization(organizationId: string): Promise<AlertDomain[]>;
  listByProject(projectId: string): Promise<AlertDomain[]>;
  listEnabledByEventType(eventType: string): Promise<AlertDomain[]>;
  create(row: AlertRow): Promise<void>;
  update(id: string, changes: Partial<AlertFields>): Promise<void>;
  delete(id: string): Promise<void>;
}

export class AlertRepository extends Repository implements AlertRepositoryPort {
  async findById(id: string): Promise<AlertDomain | null> {
    const result = await this.db.select().from(AlertEntity).where({ id }).limit(1);
    const row = result.rows[0];
    return row ? new AlertDomain(row) : null;
  }

  /** Every alert of the organization, including those of its projects. */
  async listByOrganization(organizationId: string): Promise<AlertDomain[]> {
    const result = await this.db
      .select()
      .from(AlertEntity)
      .where({ organizationId })
      .orderBy('createdAt', 'asc');
    return result.rows.map((row: any) => new AlertDomain(row));
  }

  async listByProject(projectId: string): Promise<AlertDomain[]> {
    const result = await this.db
      .select()
      .from(AlertEntity)
      .where({ projectId })
      .orderBy('createdAt', 'asc');
    return result.rows.map((row: any) => new AlertDomain(row));
  }

  async listEnabledByEventType(eventType: string): Promise<AlertDomain[]> {
    const result = await this.db.select().from(AlertEntity).where({ eventType, enabled: true });
    return result.rows.map((row: any) => new AlertDomain(row));
  }

  async create(row: AlertRow): Promise<void> {
    await this.db.insert(AlertEntity).values({ ...row });
  }

  async update(id: string, changes: Partial<AlertFields>): Promise<void> {
    await this.db
      .update(AlertEntity)
      .set({ ...changes, updatedAt: new Date().toISOString() })
      .where({ id });
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(AlertEntity).where({ id });
  }
}
