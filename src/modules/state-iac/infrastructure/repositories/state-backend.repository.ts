import { StateBackendEntity } from '#lib/database/schemas';
import { Repository } from '#lib/server/infra/repository';
import { StateBackendDomain, type StateBackendRow } from '../../domain/state-backend.domain';

export type StateBackendChanges = Partial<
  Omit<StateBackendRow, 'id' | 'organizationId' | 'createdAt'>
>;

/** Persistence port; `InMemoryStateBackendRepository` implements it in tests. */
export interface StateBackendRepositoryPort {
  findById(id: string): Promise<StateBackendDomain | null>;
  listByOrganization(organizationId: string): Promise<StateBackendDomain[]>;
  create(row: StateBackendRow): Promise<void>;
  update(id: string, changes: StateBackendChanges): Promise<void>;
  delete(id: string): Promise<void>;
}

export class StateBackendRepository extends Repository implements StateBackendRepositoryPort {
  async findById(id: string) {
    const result = await this.db.select().from(StateBackendEntity).where({ id }).limit(1);
    const row = result.rows[0];
    return row ? new StateBackendDomain(row) : null;
  }

  async listByOrganization(organizationId: string) {
    const result = await this.db
      .select()
      .from(StateBackendEntity)
      .where({ organizationId })
      .orderBy('createdAt', 'asc');
    return result.rows.map((row: any) => new StateBackendDomain(row));
  }

  async create(row: StateBackendRow) {
    await this.db.insert(StateBackendEntity).values({ ...row });
  }

  async update(id: string, changes: StateBackendChanges) {
    await this.db
      .update(StateBackendEntity)
      .set({ ...changes, updatedAt: new Date().toISOString() })
      .where({ id });
  }

  async delete(id: string) {
    await this.db.delete(StateBackendEntity).where({ id });
  }
}
